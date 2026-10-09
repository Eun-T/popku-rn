const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function load(file, mocks, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(name => {
    assert.ok(name in mocks, `Missing mock ${name}`); return mocks[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}

// Persistent refs, dependency-aware effects, external-store subscriptions and focus lifecycle.
function driver() {
  const slots = []; let index = 0, focusEffect, focusCleanup, focused = true;
  const pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { return slots[index++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = index++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = index++; if (!same(slots[i]?.deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; pending.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
    useSyncExternalStore(subscribe, snapshot) {
      react.useEffect(() => subscribe(() => {}), [subscribe]); return snapshot();
    },
  };
  return { react,
    useFocusEffect(fn) { if (focusEffect !== fn) { focusCleanup?.(); focusEffect = fn; if (focused) pending.push(() => { focusCleanup = fn(); }); } },
    render(fn) { index = 0; const value = fn(); pending.splice(0).forEach(fn => fn()); return value; },
    blur() { focused = false; focusCleanup?.(); },
    focus() { if (focused) return; focused = true; focusCleanup = focusEffect?.(); },
    dispose() { focusCleanup?.(); slots.forEach(s => s?.cleanup?.()); },
  };
}
const user = { email: 'a@test', nickname: 'A' };
function authEnv() {
  const storage = new Map(); let reply = async () => ({ ok: true, json: async () => user });
  const cache = { favorite: 0, community: 0 };
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': { isAvailableAsync: async () => true, getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async key => storage.delete(key) },
    '../constants/api': { API_BASE_URL: 'https://test' },
    './favoriteCache': { clearFavoriteCache: () => cache.favorite++ },
    './communityFeedRefresh': { clearCommunityLikes: () => cache.community++ },
  }, { __DEV__: false, fetch: (...args) => reply(...args) });
  return { auth, storage, cache, response(fn) { reply = fn; }, async login(token = 'A', value = user) {
    await auth.saveTokens({ accessToken: token, refreshToken: `refresh-${token}` }); auth.setAuthUser(value);
  } };
}
const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];

test('auth: profile network failure preserves user, token and logged-in UI; cold failure is not a login prompt', async () => {
  for (const hydrated of [true, false]) {
    const env = authEnv(), d = driver();
    if (hydrated) await env.login(); else await env.auth.saveTokens({ accessToken: 'A', refreshToken: 'R' });
    env.response(async () => { throw new TypeError('offline'); });
    const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(n => [n, n]));
    native.StyleSheet = { create: s => s };
    const Profile = load('src/app/(tabs)/profile/index.tsx', {
      react: d.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
      'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' },
      'expo-router': { useFocusEffect: d.useFocusEffect, useRouter: () => ({}) },
      'lucide-react-native': {}, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      '../../../lib/auth': env.auth, '../../../theme/tokens': { colors: {}, radius: {}, spacing: {}, typography: {} },
    }, { __DEV__: false }).default;
    d.render(Profile); await flush(); const tree = d.render(Profile);
    assert.equal(env.storage.get('accessToken'), 'A');
    assert.deepEqual(env.auth.getAuthUser(), hydrated ? user : null);
    assert.ok(!nodes(tree).some(n => n.props?.children === '로그인'));
    assert.ok(nodes(tree).some(n => n.props?.children === (hydrated ? user.nickname : '사용자 정보를 불러오지 못했습니다.')));
    d.dispose();
  }
});

test('auth: same-user refresh updates data only; login/account change/logout notify session and clear caches', async () => {
  const e = authEnv(); let data = 0, sessions = 0;
  const stopData = e.auth.subscribeAuthUser(() => data++), stopSession = e.auth.subscribeAuthSession(() => sessions++);
  await e.login(); assert.equal(sessions, 1); const cache = { ...e.cache };
  await e.auth.refreshAuthUser(); assert.equal(sessions, 1); assert.equal(data, 1);
  e.response(async () => ({ ok: true, json: async () => ({ ...user, nickname: 'updated' }) }));
  await e.auth.refreshAuthUser(); assert.equal(data, 2); assert.equal(sessions, 1); assert.deepEqual(e.cache, cache);
  assert.equal(e.auth.getAuthUser().nickname, 'updated');
  await e.login('B'); assert.equal(sessions, 2, 'same account new login remains a session event');
  await e.login('C', { email: 'c@test', nickname: 'C' }); assert.equal(sessions, 3);
  await e.auth.logout(); assert.equal(e.auth.getAuthUser(), null); assert.equal(sessions, 4);
  assert.ok(e.cache.favorite > cache.favorite && e.cache.community > cache.community);
  stopData(); stopSession(); await e.login(); assert.equal(sessions, 4);
});

test('auth: current /me 401 clears once, old /me 401 and old success never overwrite a newer session', async () => {
  for (const oldStatus of [200, 401]) {
    const e = authEnv(); await e.login(); const wait = deferred();
    e.response(() => wait.promise); const read = e.auth.refreshAuthUser(); await flush();
    const b = { email: 'b@test', nickname: 'B' }; await e.login('B', b);
    wait.resolve({ ok: oldStatus === 200, status: oldStatus, json: async () => user }); await read;
    assert.equal(e.storage.get('accessToken'), 'B'); assert.deepEqual(e.auth.getAuthUser(), b);
  }
  const e = authEnv(); await e.login(); let events = 0; e.auth.subscribeAuthSession(() => events++);
  e.response(async () => ({ ok: false, status: 401 }));
  await Promise.all([e.auth.refreshAuthUser(), e.auth.refreshAuthUser()]);
  assert.equal(e.auth.getAuthUser(), null); assert.equal(e.storage.size, 0); assert.equal(events, 1);
});

function homeEnv() {
  let current, now = 1000, timerId = 0; const timers = new Map(), calls = [];
  const react = new Proxy({}, { get: (_, key) => (...args) => current.react[key](...args) });
  const api = kind => (country, signal) => { const d = deferred(); calls.push({ kind, country, signal, ...d }); return d.promise; };
  const home = load('src/hooks/useHomePopups.ts', { react, '../lib/popups': { getNewPopups: api('new'), getNowHotPopups: api('trending') } }, {
    Date: { now: () => now }, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  return { calls, timers, consumer(section = 'trending', country = 'KR') { const d = driver(); return {
    render() { current = d; return d.render(() => home.useHomePopups(section, country)); }, dispose: d.dispose,
  }; }, advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } } };
}
test('home: failed TTL retains cards, schedules the next interval, dedups consumers and cleans timers', async () => {
  const e = homeEnv(), a = e.consumer(), b = e.consumer(); a.render(); b.render(); assert.equal(e.calls.length, 1);
  const old = [{ publicId: 'old' }]; e.calls[0].resolve(old); await flush(); a.render(); b.render();
  e.advance(600001); assert.equal(e.calls.length, 2); e.calls[1].reject(new Error('offline')); await flush();
  assert.deepEqual(a.render(), { status: 'ready', popups: old }); b.render(); assert.equal(e.timers.size, 2);
  e.advance(599999); assert.equal(e.calls.length, 2); e.advance(2); assert.equal(e.calls.length, 3);
  const fresh = [{ publicId: 'fresh' }]; e.calls[2].resolve(fresh); await flush();
  assert.deepEqual(a.render().popups, fresh); assert.deepEqual(b.render().popups, fresh);
  a.dispose(); b.dispose(); assert.equal(e.timers.size, 0); e.advance(1200000); assert.equal(e.calls.length, 3);
});
test('home: initial errors retry at TTL, cache keys stay isolated and late completion after unmount creates no timer', async () => {
  const e = homeEnv(), a = e.consumer(), b = e.consumer('new', 'JP'); a.render(); b.render(); assert.equal(e.calls.length, 2);
  e.calls[0].reject(new Error('offline')); e.calls[1].resolve([{ publicId: 'jp' }]); await flush();
  assert.equal(a.render().status, 'error'); assert.equal(b.render().popups[0].publicId, 'jp');
  b.dispose(); e.advance(600001); assert.equal(e.calls.length, 3); a.dispose();
  e.calls[2].resolve([]); await flush(); assert.equal(e.timers.size, 0);
  const c = e.consumer(); assert.deepEqual(c.render(), { status: 'ready', popups: [] }); assert.equal(e.calls.length, 3); c.dispose();
});

function mapEnv() {
  const d = driver(), calls = [];
  const module = load('src/hooks/useMapPopups.ts', { react: d.react, 'expo-router': { useFocusEffect: d.useFocusEffect },
    '../lib/popups': { getPopupMap(signal) { const wait = deferred(); calls.push({ signal, ...wait }); return wait.promise; } } });
  return { ...d, calls, render: () => d.render(module.useMapPopups) };
}
test('map: failure differs from empty; focus retries only failures and concurrent refreshes dedup', async () => {
  const e = mapEnv(); e.render(); assert.equal(e.calls.length, 1);
  e.calls[0].reject(new Error('offline')); await flush(); assert.equal(e.render().status, 'error');
  e.blur(); e.focus(); const a = e.render().refresh(), b = e.render().refresh(); assert.equal(a, b); assert.equal(e.calls.length, 2);
  e.calls[1].resolve([]); await a; assert.deepEqual(e.render().popups, []); assert.equal(e.render().status, 'ready');
  e.blur(); e.focus(); assert.equal(e.calls.length, 2, 'normal empty response never refreshes on focus'); e.dispose();
});
test('map: refresh failure retains markers; manual retry recovers; cleanup aborts and rejects late reads', async () => {
  const e = mapEnv(); e.render(); const rows = [{ id: 'a' }]; e.calls[0].resolve(rows); await flush();
  const refresh = e.render().refresh(); e.calls[1].reject(new Error('offline')); await assert.rejects(refresh);
  assert.equal(e.render().status, 'error'); assert.deepEqual(e.render().popups, rows);
  const retry = e.render().refresh(); e.calls[2].resolve([{ id: 'b' }]); await retry;
  assert.equal(e.render().popups[0].id, 'b'); assert.equal(e.render().status, 'ready');
  const late = e.render().refresh(); e.dispose(); assert.equal(e.calls[3].signal.aborted, true);
  e.calls[3].resolve([{ id: 'late' }]); await assert.rejects(late, /aborted/);
});

test('map: list empty UI distinguishes loading, error/retry and successful empty', () => {
  let retries = 0;
  const Sheet = load('src/components/map/MapPopupListSheet.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { FlatList: 'FlatList', Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: s => s } },
    '../common/Tag': {}, '../../lib/popupStatus': {}, '../../theme/tokens': { colors: {}, radius: {} },
    '../home/HomeNewPopupSection': { formatPopupPeriod: () => { throw new Error('Empty list must not format a popup'); } },
    '../../../assets/images/ranking-placeholder.png': 'placeholder',
  }).default;
  for (const status of ['loading', 'error', 'ready']) {
    const tree = Sheet({ popups: [], bottomPadding: 0, onPopupPress() {}, status, onRetry: () => retries++ });
    const content = nodes(tree.props.ListEmptyComponent);
    const button = content.find(n => n.type === 'Pressable');
    if (status === 'error') { assert.ok(button); button.props.onPress(); }
    else assert.equal(button, undefined);
    const expected = status === 'ready' ? '이 지역에 해당하는 팝업이 없어요' : status === 'loading' ? '팝업을 불러오는 중이에요' : '팝업을 불러오지 못했어요. 다시 시도';
    assert.ok(content.some(n => n.props?.children === expected));
  }
  assert.equal(retries, 1);
});
