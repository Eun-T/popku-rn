const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const response = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});
const userA = { email: 'a@example.test', nickname: 'A' };
const userB = { email: 'b@example.test', nickname: 'B' };

// Execute the production auth module with controllable HTTP and SecureStore timing.
function environment() {
  const storage = new Map(), requests = [], deleted = [];
  const caches = { favorites: 0, likes: 0 };
  let logoutReply = async () => response(), profileReply, refreshReadGate, deleteGate, failedDeleteKey;
  const secureStore = {
    isAvailableAsync: async () => true,
    getItemAsync: async key => {
      if (key === 'refreshToken' && refreshReadGate) {
        const gate = refreshReadGate; refreshReadGate = undefined;
        await gate;
      }
      return storage.get(key) ?? null;
    },
    setItemAsync: async (key, value) => { storage.set(key, value); },
    deleteItemAsync: async key => {
      deleted.push(key);
      if (deleteGate) await deleteGate;
      if (key === failedDeleteKey) throw new Error('SecureStore unavailable');
      storage.delete(key);
    },
  };
  const mocks = {
    'expo-secure-store': secureStore,
    '../constants/api': { API_BASE_URL: 'https://api.test' },
    './favoriteCache': { clearFavoriteCache: () => caches.favorites++ },
    './communityFeedRefresh': { clearCommunityLikes: () => caches.likes++ },
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/api/auth/logout')) return logoutReply();
    if (url.endsWith('/api/auth/login')) {
      const { email } = JSON.parse(options.body);
      return response({ accessToken: email, refreshToken: `refresh-${email}` });
    }
    assert.ok(url.endsWith('/api/users/me'), `Unexpected request ${url}`);
    if (profileReply) return profileReply();
    return response(options.headers.Authorization === `Bearer ${userA.email}` ? userA : userB);
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync('src/lib/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', 'fetch', code)(name => {
    assert.ok(name in mocks, `Missing mock ${name}`);
    return mocks[name];
  }, module, module.exports, false, fetch);
  const auth = module.exports;
  return { auth, storage, requests, deleted, caches,
    async login(user = userA) {
      const tokens = await auth.login(user.email, 'password');
      await auth.saveTokens(tokens);
      auth.setAuthUser(await auth.getCurrentUser(tokens.accessToken));
    },
    respondLogout(callback) { logoutReply = callback; },
    respondProfile(callback) { profileReply = callback; },
    blockRefreshRead(promise) { refreshReadGate = promise; },
    blockDeletion(promise) { deleteGate = promise; },
    failDeletion(key) { failedDeleteKey = key; },
  };
}
const logoutRequests = env => env.requests.filter(request => request.url.endsWith('/api/auth/logout'));
function observe(env) {
  const events = { user: 0, session: 0 };
  env.auth.subscribeAuthUser(() => events.user++);
  env.auth.subscribeAuthSession(() => events.session++);
  return events;
}
async function assertSession(env, user, generation) {
  assert.equal(await env.auth.getSavedAccessToken(), user.email);
  assert.equal(env.storage.get('refreshToken'), `refresh-${user.email}`);
  assert.deepEqual(env.auth.getAuthUser(), user);
  assert.equal((await env.auth.getAuthSession()).generation, generation);
}

test('ordinary login then logout removes both tokens, user and private caches once', async () => {
  const env = environment(); await env.login();
  const events = observe(env), caches = { ...env.caches };
  await env.auth.logout();
  assert.equal(await env.auth.getSavedAccessToken(), null);
  assert.equal(env.storage.get('refreshToken'), undefined);
  assert.equal(env.auth.getAuthUser(), null);
  assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
  assert.deepEqual(events, { user: 1, session: 1 });
  // Invalidation clears caches, then publishing the anonymous identity clears them again.
  assert.deepEqual(env.caches, { favorites: caches.favorites + 2, likes: caches.likes + 2 });
  const [request] = logoutRequests(env);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(request.options.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(request.options.body), {
    refreshToken: `refresh-${userA.email}`, deviceId: env.auth.DEVICE_ID,
  });
});

test('logout without a refresh token still clears the local session without an HTTP request', async () => {
  const env = environment(); await env.login(); env.storage.delete('refreshToken');
  await env.auth.logout();
  assert.equal(env.storage.size, 0); assert.equal(env.auth.getAuthUser(), null);
  assert.equal(logoutRequests(env).length, 0);
});

for (const failure of ['HTTP 500', 'network rejection']) {
  test(`${failure} during current-session logout still clears locally and rejects`, async () => {
    const env = environment(); await env.login();
    env.respondLogout(async () => {
      if (failure === 'HTTP 500') return response({}, 500);
      throw new TypeError('offline');
    });
    await assert.rejects(env.auth.logout(), failure === 'HTTP 500'
      ? /서버 로그아웃에 실패했습니다/ : /offline/);
    assert.equal(env.storage.size, 0); assert.equal(env.auth.getAuthUser(), null);
    assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
  });
}

for (const user of [userA, userB]) {
  test(`delayed A logout cannot erase fast ${user.nickname} login, even with reused access-token text`, async () => {
    const env = environment(); await env.login();
    const gate = deferred(); env.respondLogout(() => gate.promise);
    const loggingOut = env.auth.logout(); await flush();
    assert.equal(logoutRequests(env).length, 1);
    await env.login(user);
    const { generation } = await env.auth.getAuthSession();
    const events = observe(env), caches = { ...env.caches };
    gate.resolve(response()); await loggingOut;
    await assertSession(env, user, generation);
    assert.deepEqual(env.deleted, []); assert.deepEqual(env.caches, caches);
    assert.deepEqual(events, { user: 0, session: 0 });
    assert.equal(JSON.parse(logoutRequests(env)[0].options.body).refreshToken, `refresh-${userA.email}`);
  });
}

for (const failure of ['HTTP 500', 'network rejection']) {
  test(`old logout ${failure} preserves B login and retains the original rejection`, async () => {
    const env = environment(); await env.login();
    const gate = deferred(); env.respondLogout(() => gate.promise);
    const loggingOut = env.auth.logout();
    const rejected = assert.rejects(loggingOut, failure === 'HTTP 500'
      ? /서버 로그아웃에 실패했습니다/ : /offline/);
    await flush(); await env.login(userB);
    const { generation } = await env.auth.getAuthSession();
    if (failure === 'HTTP 500') gate.resolve(response({}, 500));
    else gate.reject(new TypeError('offline'));
    await rejected;
    await assertSession(env, userB, generation); assert.deepEqual(env.deleted, []);
  });
}

test('session is captured before the refresh-token read; a delayed read cannot log out B on the server', async () => {
  const env = environment(); await env.login();
  const gate = deferred(); env.blockRefreshRead(gate.promise);
  const loggingOut = env.auth.logout(); await flush();
  await env.login(userB); const { generation } = await env.auth.getAuthSession();
  gate.resolve(); await loggingOut;
  assert.equal(logoutRequests(env).length, 0, 'Must not send the newly stored B refresh token');
  await assertSession(env, userB, generation); assert.deepEqual(env.deleted, []);
});

test('a late refresh-token read failure rejects without clearing the new login', async () => {
  const env = environment(); await env.login();
  const gate = deferred(); env.blockRefreshRead(gate.promise);
  const rejected = assert.rejects(env.auth.logout(), /read unavailable/);
  await flush(); await env.login(userB);
  const { generation } = await env.auth.getAuthSession();
  gate.reject(new Error('read unavailable')); await rejected;
  await assertSession(env, userB, generation); assert.deepEqual(env.deleted, []);
});

test('login starting while logout SecureStore deletion is pending survives the existing write queue', async () => {
  const env = environment(); await env.login();
  const gate = deferred(); env.blockDeletion(gate.promise);
  const loggingOut = env.auth.logout(); await flush();
  assert.equal(env.deleted.length, 2);
  const loggingIn = env.login(userB); await flush();
  gate.resolve(); await Promise.all([loggingOut, loggingIn]);
  const { generation } = await env.auth.getAuthSession();
  await assertSession(env, userB, generation);
});

test('concurrent same-session logouts share local invalidation and publish anonymous state once', async () => {
  const env = environment(); await env.login();
  const events = observe(env), gate = deferred(); env.respondLogout(() => gate.promise);
  const a = env.auth.logout(), b = env.auth.logout(); await flush();
  assert.equal(logoutRequests(env).length, 2);
  gate.resolve(response()); await Promise.all([a, b]);
  assert.equal(env.storage.size, 0); assert.equal(env.auth.getAuthUser(), null);
  assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
  assert.deepEqual(events, { user: 1, session: 1 });
});

for (const status of [200, 401]) {
  test(`old profile ${status} and delayed logout together cannot overwrite or clear B`, async () => {
    const env = environment(); await env.login();
    const profileGate = deferred(), logoutGate = deferred();
    env.respondProfile(() => profileGate.promise); env.respondLogout(() => logoutGate.promise);
    const refreshing = env.auth.refreshAuthUser(), loggingOut = env.auth.logout(); await flush();
    env.respondProfile(undefined); await env.login(userB);
    const { generation } = await env.auth.getAuthSession(), events = observe(env);
    profileGate.resolve(response(userA, status)); await refreshing;
    logoutGate.resolve(response()); await loggingOut;
    await assertSession(env, userB, generation); assert.deepEqual(env.deleted, []);
    assert.deepEqual(events, { user: 0, session: 0 });
  });
}

test('current concurrent profile 401 and delayed logout invalidate once and allow subsequent login', async () => {
  const env = environment(); await env.login();
  const gate = deferred(), events = observe(env); env.respondLogout(() => gate.promise);
  const loggingOut = env.auth.logout(); await flush();
  env.respondProfile(async () => response({}, 401));
  await Promise.all([env.auth.refreshAuthUser(), env.auth.refreshAuthUser()]);
  gate.resolve(response()); await loggingOut;
  assert.equal(env.storage.size, 0); assert.equal(env.auth.getAuthUser(), null);
  assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
  assert.deepEqual(events, { user: 1, session: 1 });
  env.respondProfile(undefined); await env.login(userB);
  await assertSession(env, userB, (await env.auth.getAuthSession()).generation);
});

test('SecureStore delete failure still rejects; a queued new login succeeds after the failure', async () => {
  const env = environment(); await env.login();
  const gate = deferred(); env.blockDeletion(gate.promise); env.failDeletion('accessToken');
  const rejected = assert.rejects(env.auth.logout(), /SecureStore unavailable/); await flush();
  const loggingIn = env.login(userB); await flush();
  gate.resolve(); await rejected; await loggingIn;
  await assertSession(env, userB, (await env.auth.getAuthSession()).generation);
});
