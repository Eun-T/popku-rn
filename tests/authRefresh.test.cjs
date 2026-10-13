const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const jwt = (expiry, subject = 1) => `test.${Buffer.from(JSON.stringify({ exp: expiry, sub: subject })).toString('base64url')}.signature`;
const response = (body = {}, status = 200) => new Response(JSON.stringify(body), { status });
const initialTime = Date.now();
const expired = jwt(Math.floor(initialTime / 1000) - 60);
const fresh = jwt(Math.floor(initialTime / 1000) + 3600);
const installId = '11111111-1111-4111-8111-111111111111';
const oldPair = { accessToken: expired, refreshToken: 'old-refresh', deviceId: installId };

function environment({ storage = new Map([['session.v1', JSON.stringify(oldPair)]]), handler, deviceId = installId, failDelete } = {}) {
  const calls = []; let now = initialTime, writeGate, readGate, failWrite = false;
  class Clock extends Date { static now() { return now; } }
  const store = { isAvailableAsync: async () => true,
    getItemAsync: async key => { const value = storage.get(key) ?? null;
      if (readGate && key === 'session.v1') { const gate = readGate; readGate = undefined; await gate; } return value; },
    setItemAsync: async (key, value) => {
      if (writeGate && key === 'session.v1' && JSON.parse(value).accessToken === fresh) await writeGate;
      if (failWrite && key === 'session.v1' && JSON.parse(value).accessToken === fresh) throw new Error('storage unavailable');
      storage.set(key, value);
    }, deleteItemAsync: async key => { if (key === failDelete) throw new Error('storage unavailable'); storage.delete(key); } };
  const mocks = { 'expo-secure-store': store, '../constants/api': { API_BASE_URL: 'https://api.test' },
    './deviceId': { getDeviceId: async () => deviceId },
    './favoriteCache': { clearFavoriteCache() {} }, './communityFeedRefresh': { clearCommunityLikes() {} } };
  const fetch = async (url, init = {}) => {
    calls.push({ path: url.replace('https://api.test', ''), ...init });
    if (handler) { const result = await handler(calls.at(-1)); if (result) return result; }
    if (url.endsWith('/auth/refresh')) return response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId });
    if (url.endsWith('/auth/logout')) return response();
    if (url.endsWith('/auth/login')) return response({ accessToken: fresh, refreshToken: 'login-refresh' });
    const token = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    const expiry = token?.split('.')[1] ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp : undefined;
    return expiry !== undefined && expiry <= now / 1000
      ? response({ error: 'invalid_access_token' }, 401) : response({ email: 'fixture@example.test', nickname: 'fixture' });
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync('src/lib/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', 'fetch', 'Date', code)(
    name => { assert.ok(name in mocks, `Missing mock ${name}`); return mocks[name]; }, module, module.exports, false, fetch, Clock);
  const auth = module.exports;
  return { auth, storage, calls, pair: () => storage.has('session.v1') ? JSON.parse(storage.get('session.v1')) : null,
    advance: ms => { now += ms; }, failWrites: () => { failWrite = true; }, gateWrites: gate => { writeGate = gate; },
    gateReads: gate => { readGate = gate; },
    async request(path = '/api/private', options = {}) { const session = await auth.getAuthSession();
      return auth.authenticatedFetch(`https://api.test${path}`, { headers: { Authorization: `Bearer ${session.accessToken}` }, ...options }, session); } };
}

test('expired access triggers one rotation and one replay; the pair is stored atomically without changing generation', async () => {
  const s = environment(); const generation = s.auth.authSessionGeneration();
  assert.equal((await s.request()).status, 200);
  assert.equal(s.calls.length, 3); assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, 1);
  assert.equal(s.pair().refreshToken, 'rotated-refresh'); assert.equal(s.pair().accessToken, fresh);
  assert.equal(s.auth.authSessionGeneration(), generation);
  assert.equal(JSON.parse(s.calls[1].body).deviceId, installId);
});
test('simultaneous 401 requests share one refresh promise and all replay with the new token', async () => {
  const gate = deferred(); const s = environment({ handler: async c => c.path.endsWith('/refresh') ? gate.promise : null });
  const requests = Array.from({ length: 12 }, () => s.request()); await tick(); await tick();
  assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, 1);
  gate.resolve(response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: installId }));
  assert.ok((await Promise.all(requests)).every(r => r.status === 200));
  assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, 1);
});
test('a delayed old 401 after successful rotation reuses the new pair instead of rotating the old refresh token again', async () => {
  const gate = deferred(); const s = environment({ handler: async c => c.path.endsWith('/slow')
    && new Headers(c.headers).get('Authorization') === `Bearer ${expired}` ? gate.promise : null });
  const slow = s.request('/api/slow'); await tick(); await s.request();
  gate.resolve(response({ error: 'invalid_access_token' }, 401)); assert.equal((await slow).status, 200);
  assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, 1);
});
test('non-expired/unknown tokens, unrelated 401 bodies, 403 and 500 never trigger refresh', async () => {
  for (const [token, status, body] of [[fresh, 401, { error: 'invalid_access_token' }], ['opaque', 401, { error: 'invalid_access_token' }],
    [expired, 401, { error: 'unauthorized' }], [expired, 403, {}], [expired, 500, {}]]) {
    const s = environment({ storage: new Map([['session.v1', JSON.stringify({ ...oldPair, accessToken: token })]]), handler: async () => response(body, status) });
    assert.equal((await s.request()).status, status); assert.equal(s.calls.length, 1);
  }
});
test('a second 401 is returned without recursive refresh or a third API attempt', async () => {
  const s = environment({ handler: async c => c.path === '/api/private' ? response({ error: 'invalid_access_token' }, 401) : null });
  assert.equal((await s.request()).status, 401); assert.equal(s.calls.length, 3);
});
test('refresh rejection invalidates the session once for concurrent requests', async () => {
  const s = environment({ handler: async c => c.path.endsWith('/refresh') ? response({ error: 'unauthorized' }, 401) : null });
  await Promise.all(Array.from({ length: 8 }, () => s.request()));
  assert.equal(s.auth.authSessionGeneration(), 1); assert.equal(s.auth.getAuthStatus(), 'anonymous');
  assert.equal(await s.auth.getSavedAccessToken(), null); assert.equal(s.pair(), null);
});
test('transient refresh failure preserves tokens and exposes restore retry, without repeatedly rotating on queued failures', async () => {
  let unavailable = true; const s = environment({ handler: async c => c.path.endsWith('/refresh') && unavailable ? response({}, 503) : null });
  await assert.rejects(s.request(), /renewal/); await assert.rejects(s.request(), /renewal/);
  assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, 1); assert.equal(s.auth.getAuthStatus(), 'error');
  unavailable = false; await s.auth.refreshAuthUser(); assert.equal(s.auth.getAuthStatus(), 'authenticated');
});
test('legacy session is kept using its bound old device only for a persisted seven-day migration window', async () => {
  const storage = new Map([['accessToken', expired], ['refreshToken', 'legacy-refresh']]);
  const s = environment({ storage, handler: async c => c.path.endsWith('/refresh')
    ? response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: 'android-emulator-dev' }) : null });
  await s.request(); const deadline = s.pair().legacyUntil;
  assert.equal(s.pair().deviceId, 'android-emulator-dev'); assert.equal(JSON.parse(s.calls[1].body).deviceId, 'android-emulator-dev');
  assert.equal(storage.has('accessToken'), false); assert.equal(storage.has('refreshToken'), false);
  const restart = environment({ storage }); restart.advance(8 * 24 * 60 * 60 * 1000);
  await restart.request(); assert.equal(restart.pair(), null); assert.equal(restart.calls.filter(c => c.path.endsWith('/refresh')).length, 0);
  assert.equal(deadline, initialTime + 7 * 24 * 60 * 60 * 1000);
});
test('fresh logins replace legacy binding with the installation ID, shared by login and logout', async () => {
  const s = environment({ storage: new Map([['accessToken', expired], ['refreshToken', 'legacy-refresh']]) });
  await s.auth.saveTokens(await s.auth.login('fixture@example.test', 'fixture')); await s.auth.logout();
  assert.ok(s.calls.every(c => JSON.parse(c.body).deviceId === installId));
});
test('logout finishes before a pending refresh response; its late rotated token is revoked and never saved', async () => {
  const gate = deferred(); const s = environment({ handler: async c => c.path.endsWith('/refresh') ? gate.promise : null });
  const request = s.request('/api/private', { method: 'POST', body: 'fixture mutation' }); await tick(); await tick(); await s.auth.logout();
  assert.equal(s.auth.getAuthStatus(), 'anonymous'); assert.equal(s.pair(), null);
  gate.resolve(response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: installId })); await request;
  assert.equal(s.pair(), null); assert.equal(s.calls.filter(c => c.path.endsWith('/logout')).length, 2);
});
test('late refresh and old 401 cannot overwrite a different account logged in after logout', async () => {
  const gate = deferred(); const s = environment({ handler: async c => c.path.endsWith('/refresh') ? gate.promise : null });
  const request = s.request('/api/private', { method: 'POST', body: 'fixture mutation' }); await tick(); await tick(); await s.auth.logout();
  const next = { accessToken: jwt(Math.floor(initialTime / 1000) + 3600, 2), refreshToken: 'account-B-refresh' };
  await s.auth.saveTokens(next); s.auth.setAuthUser({ email: 'b@example.test', nickname: 'B' });
  gate.resolve(response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: installId })); await request;
  assert.equal(s.pair().refreshToken, next.refreshToken); assert.equal(s.auth.getAuthUser().nickname, 'B');
  assert.equal(s.calls.filter(c => c.path === '/api/private').length, 1, 'old account mutation cannot replay as the new account');
});
test('logout during rotated-token storage cannot revive the session', async () => {
  const gate = deferred(); const s = environment(); s.gateWrites(gate.promise);
  const request = s.request(); await tick(); await tick(); const logout = s.auth.logout(); gate.resolve();
  await Promise.all([request, logout]); assert.equal(s.pair(), null); assert.equal(s.auth.getAuthStatus(), 'anonymous');
});
test('failed rotation storage clears all session data and compensates the server rotation', async () => {
  const s = environment(); s.failWrites(); assert.equal((await s.request()).status, 401);
  assert.equal(s.pair(), null); assert.equal(await s.auth.getSavedAccessToken(), null);
  assert.equal(s.calls.filter(c => c.path.endsWith('/logout')).length, 1);
});
test('restart restores valid access without refresh and expired access through refresh, without a transient anonymous state', async () => {
  for (const token of [fresh, expired]) {
    const s = environment({ storage: new Map([['session.v1', JSON.stringify({ ...oldPair, accessToken: token })]]) });
    const states = []; s.auth.subscribeAuthStatus(() => states.push(s.auth.getAuthStatus()));
    await s.auth.initializeAuth(); assert.equal(s.auth.getAuthStatus(), 'authenticated'); assert.ok(!states.includes('anonymous'));
    assert.equal(s.calls.filter(c => c.path.endsWith('/refresh')).length, token === expired ? 1 : 0);
  }
});
test('public requests remain anonymous and caller cancellation during refresh prevents replay', async () => {
  const s = environment({ storage: new Map() });
  await s.auth.authenticatedFetch('https://api.test/api/public', {}, await s.auth.getAuthSession()); assert.equal(s.calls.length, 1);
  const gate = deferred(); const controller = new AbortController(); const active = environment({ handler: async c => c.path.endsWith('/refresh') ? gate.promise : null });
  const request = active.request('/api/private', { signal: controller.signal }); await tick(); await tick(); controller.abort();
  gate.resolve(response({ accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: installId })); await request;
  assert.equal(active.calls.filter(c => c.path === '/api/private').length, 1);
});

test('malformed or incomplete rotation responses clear the session without exposing the response body', async () => {
  for (const body of [null, {}, { accessToken: null, refreshToken: 'rotated-refresh' },
    { accessToken: fresh, refreshToken: 'old-refresh' }, { accessToken: fresh, refreshToken: 'rotated-refresh', deviceId: 'other' }]) {
    const s = environment({ handler: async c => c.path.endsWith('/refresh') ? response(body) : null });
    assert.equal((await s.request()).status, 401); assert.equal(s.pair(), null);
    assert.equal(s.auth.getAuthStatus(), 'anonymous');
  }
});

test('refresh transport timeout is bounded; logout still clears local state if its transport times out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const endpoint of ['/refresh', '/logout']) {
    const s = environment({ handler: c => c.path.endsWith(endpoint) ? new Promise((_, reject) =>
      c.signal.addEventListener('abort', () => reject(new Error('fixture transport timeout')), { once: true })) : null });
    const pending = endpoint === '/refresh' ? s.request() : s.auth.logout();
    const rejected = assert.rejects(pending, /timeout/);
    await tick(); await tick(); t.mock.timers.tick(12000); await rejected;
    if (endpoint === '/logout') { assert.equal(s.pair(), null); assert.equal(s.auth.getAuthStatus(), 'anonymous'); }
    else assert.equal(s.auth.getAuthStatus(), 'error');
  }
});

test('logout invalidates an earlier login attempt before delayed /me succeeds; a fresh login intent can still start', async () => {
  const profile = deferred(), logout = deferred();
  const s = environment({ handler: c => c.path.endsWith('/users/me') ? profile.promise
    : c.path.endsWith('/logout') ? logout.promise : null });
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync('src/hooks/useLoginAttempt.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name === 'react'
    ? { useRef: value => ({ current: value }), useCallback: fn => fn }
    : name === 'expo-router' ? { useFocusEffect: fn => fn() } : s.auth, module, module.exports);
  const hook = module.exports.useLoginAttempt('fixture'); const attempt = hook.begin();
  const authentication = hook.authenticate(attempt, { accessToken: fresh, refreshToken: 'login-refresh' });
  await tick(); await tick(); const loggingOut = s.auth.logout(); await tick();
  profile.resolve(response({ email: 'a@example.test', nickname: 'A' }));
  assert.equal(await authentication, false); assert.equal(hook.complete(attempt), false);
  assert.equal(s.auth.getAuthUser(), null); hook.release(attempt);
  const next = hook.begin(); assert.ok(hook.valid(next), 'a new intent after logout is distinct from the cancelled intent');
  logout.resolve(response()); await loggingOut;
});

test('reinstallation does not restore a previous installation canonical session', async () => {
  const s = environment({ deviceId: '22222222-2222-4222-8222-222222222222' });
  await s.auth.initializeAuth(); assert.equal(s.auth.getAuthStatus(), 'anonymous');
  assert.equal(s.pair(), null); assert.equal(s.calls.length, 0);
});

test('public authenticated read performs at most one replay, even when renewal succeeds but replay is still unauthorized', async () => {
  const s = environment({ handler: c => c.path.endsWith('/public') ? response({ error: 'invalid_access_token' }, 401) : null });
  const session = await s.auth.getAuthSession();
  const result = await s.auth.authenticatedFetch('https://api.test/api/public', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  }, session, true);
  assert.equal(result.status, 401); assert.equal(s.auth.wasAuthRetried(result), true);
  assert.equal(s.calls.filter(c => c.path.endsWith('/public')).length, 2);
});

test('delayed token reads cannot adopt credentials from a newly logged-in account', async () => {
  const gate = deferred(); const s = environment(); s.gateReads(gate.promise);
  const generation = s.auth.authSessionGeneration(); const snapshot = s.auth.getAuthSession(); await tick();
  await s.auth.saveTokens({ accessToken: fresh, refreshToken: 'account-B-refresh' });
  gate.resolve(); assert.deepEqual(await snapshot, { accessToken: null, generation });
  assert.equal(s.pair().refreshToken, 'account-B-refresh'); assert.equal(s.calls.length, 0);
});

test('failed logout deletion writes a signed-out tombstone so retained credentials cannot restore after restart', async () => {
  const s = environment({ failDelete: 'session.v1' });
  await assert.rejects(s.auth.logout(), /storage/); assert.equal(await s.auth.getSavedAccessToken(), null);
  const restart = environment({ storage: s.storage }); await restart.auth.initializeAuth();
  assert.equal(restart.auth.getAuthStatus(), 'anonymous'); assert.equal(restart.calls.length, 0);
});

test('corrupted canonical storage fails closed without restoring legacy keys', async () => {
  const s = environment({ storage: new Map([['session.v1', '{invalid'], ['accessToken', expired], ['refreshToken', 'legacy-refresh']]) });
  await s.auth.initializeAuth(); assert.equal(s.auth.getAuthStatus(), 'anonymous');
  assert.equal(s.pair(), null); assert.equal(s.calls.length, 0);
});

test('a delayed corrupted or previous-installation record cannot clear a newer login', async () => {
  for (const raw of ['{invalid', JSON.stringify({ ...oldPair, deviceId: '22222222-2222-4222-8222-222222222222' })]) {
    const gate = deferred(); const s = environment({ storage: new Map([['session.v1', raw]]) });
    s.gateReads(gate.promise); const reading = s.auth.getSavedAccessToken(); await tick();
    await s.auth.saveTokens({ accessToken: fresh, refreshToken: 'account-B-refresh' });
    gate.resolve(); assert.equal(await reading, null);
    assert.equal(s.pair().refreshToken, 'account-B-refresh');
    assert.equal(await s.auth.getSavedAccessToken(), fresh); assert.equal(s.calls.length, 0);
  }
});
