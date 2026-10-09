const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (!(name in mocks)) throw new Error(`Missing mock ${name}`);
    return mocks[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const noContent = { status: 204, ok: true, json: () => assert.fail('204 has no JSON body') };

function environment() {
  const storage = new Map([['accessToken', 'access-A'], ['refreshToken', 'refresh-A']]);
  const requests = [], deleted = [], cacheClears = [];
  let reply = async () => noContent, deleteGate, failedKey;
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': {
      isAvailableAsync: async () => true,
      getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => {
        deleted.push(key);
        if (deleteGate) await deleteGate;
        if (failedKey === key) throw new Error('SecureStore unavailable');
        storage.delete(key);
      },
    },
    '../constants/api': { API_BASE_URL: 'https://api.test' },
    './favoriteCache': { clearFavoriteCache: () => cacheClears.push('favorites') },
    './communityFeedRefresh': { clearCommunityLikes: () => cacheClears.push('likes') },
  }, { __DEV__: false, fetch: async (url, options) => { requests.push({ url, options }); return reply(); } });
  auth.setAuthUser({ email: 'a@example.com', nickname: '사용자' });
  return { auth, storage, requests, deleted, cacheClears,
    respond(callback) { reply = callback; }, blockDeletion(promise) { deleteGate = promise; },
    failDeletion(key) { failedKey = key; } };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree?.props ? text(tree.props.children) : '';
}

// Execute production components and their callbacks using the existing TS/native mock pattern.
function screen(env, file = 'withdrawal') {
  const states = [], refs = [], effects = [], alerts = [], navigation = [];
  let stateIndex = 0, refIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const router = {
    dismissTo: route => navigation.push(['dismissTo', route]),
    push: route => navigation.push(['push', route]),
    replace: route => navigation.push(['replace', route]),
    canGoBack: () => true, back: () => navigation.push(['back']),
  };
  const base = file === 'index' ? 'src/app/(tabs)/profile' : 'src/app/profile';
  const prefix = file === 'index' ? '../../../' : '../../';
  const Component = load(`${base}/${file}.tsx`, {
    react: {
      useState: initial => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useRef: initial => {
        const index = refIndex++;
        if (!(index in refs)) refs[index] = { current: initial };
        return refs[index];
      },
      useEffect: callback => effects.push(callback), useCallback: callback => callback,
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { useRouter: () => router, useFocusEffect() {} },
    'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight', Settings: 'Settings', Heart: 'Heart', Star: 'Star', MessageSquare: 'MessageSquare' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Text: 'Text', View: 'View', StyleSheet: { create: styles => styles }, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    [`${prefix}lib/auth`]: env.auth,
    [`${prefix}components/profile/ThemePreferenceSheet`]: { default: 'ThemePreferenceSheet' },
    [`${prefix}theme/tokens`]: load('src/theme/tokens.ts', {}),
  }).default;
  function render() { stateIndex = 0; refIndex = 0; effects.length = 0; return Component(); }
  function button(label) {
    const found = nodes(render()).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);
    assert.ok(found, `Missing ${label} button`); return found.props;
  }
  return { render, button, alerts, navigation, effects,
    confirm() { alerts.at(-1)[2].find(button => button.text === '탈퇴하기').onPress(); } };
}

test('API uses only Bearer identity, DELETE /me, and never parses the empty 204 body', async () => {
  const env = environment();
  assert.equal(await env.auth.withdrawAccount(), 0);
  assert.equal(env.requests.length, 1);
  assert.deepEqual(env.requests[0], { url: 'https://api.test/api/users/me', options: {
    method: 'DELETE', headers: { Authorization: 'Bearer access-A' },
  } });
  assert.equal(env.deleted.length, 0);
});

for (const status of [200, 401, 500]) test(`API ${status} keeps tokens and the current user`, async () => {
  const env = environment(); env.respond(async () => ({ status }));
  await assert.rejects(env.auth.withdrawAccount());
  assert.equal(env.storage.get('accessToken'), 'access-A');
  assert.equal(env.storage.get('refreshToken'), 'refresh-A');
  assert.equal(env.auth.getAuthUser().email, 'a@example.com'); assert.equal(env.deleted.length, 0);
});

test('API sends no request without a saved access token', async () => {
  const env = environment(); env.storage.clear();
  await assert.rejects(env.auth.withdrawAccount(), env.auth.CurrentUserError);
  assert.equal(env.requests.length, 0);
});

test('withdrawal requires final confirmation, and cancel/dismiss performs no request', async () => {
  const env = environment(), view = screen(env);
  view.button('회원탈퇴').onPress(); view.button('회원탈퇴').onPress();
  assert.equal(view.alerts.length, 1); assert.equal(env.requests.length, 0);
  const [title, message, buttons, options] = view.alerts[0];
  assert.equal(title, '정말 탈퇴하시겠어요?'); assert.equal(message, '탈퇴하면 삭제되는 정보는 복구할 수 없습니다.');
  assert.deepEqual(buttons.map(button => button.text), ['취소', '탈퇴하기']);
  buttons[0].onPress(); await flush(); assert.equal(env.requests.length, 0);
  view.button('회원탈퇴').onPress(); options.onDismiss(); await flush(); assert.equal(env.requests.length, 0);
});

test('confirmed 204 removes both tokens, resets user/session, and navigates only after storage finishes', async () => {
  const env = environment(), view = screen(env), gate = deferred();
  let userEvents = 0, sessionEvents = 0;
  env.auth.subscribeAuthUser(() => userEvents++); env.auth.subscribeAuthSession(() => sessionEvents++);
  env.blockDeletion(gate.promise);
  view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  assert.equal(env.requests.length, 1); assert.equal(view.navigation.length, 0);
  assert.equal(view.button('로그인 정보 정리').disabled, true);
  gate.resolve(); await flush();
  assert.equal(env.storage.size, 0); assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
  assert.equal(env.auth.getAuthUser(), null); assert.ok(userEvents > 0); assert.ok(sessionEvents > 0);
  assert.ok(env.cacheClears.includes('favorites')); assert.ok(env.cacheClears.includes('likes'));
  assert.deepEqual(view.navigation, [['dismissTo', '/profile']]);
  assert.ok(env.requests.every(request => !request.url.includes('/auth/logout')));
});

test('requests cannot be duplicated by rapid presses or repeated confirmation callbacks', async () => {
  const env = environment(), view = screen(env), reply = deferred(); env.respond(() => reply.promise);
  view.button('회원탈퇴').onPress(); const confirm = view.alerts[0][2][1].onPress;
  confirm(); confirm(); view.button('회원탈퇴').onPress(); await flush();
  assert.equal(env.requests.length, 1); assert.equal(view.button('회원탈퇴').disabled, true);
  assert.ok(nodes(view.render()).some(node => node.type === 'ActivityIndicator'));
  reply.resolve(noContent); await flush(); assert.equal(env.requests.length, 1);
});

test('server failure preserves login, shows an error, and permits a confirmed retry', async () => {
  const env = environment(), view = screen(env); env.respond(async () => ({ status: 500 }));
  view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  assert.equal(env.auth.getAuthUser().email, 'a@example.com'); assert.equal(env.storage.size, 2);
  assert.equal(env.deleted.length, 0); assert.equal(view.navigation.length, 0);
  assert.equal(view.alerts.at(-1)[1], '회원탈퇴에 실패했습니다. 다시 시도해주세요.');
  assert.equal(view.button('회원탈퇴').disabled, false);
  env.respond(async () => noContent); view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  assert.equal(env.requests.length, 2); assert.equal(env.auth.getAuthUser(), null);
});

test('network failure preserves authentication and enables retry', async () => {
  const env = environment(), view = screen(env); env.respond(async () => { throw new TypeError('offline'); });
  view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  assert.equal(env.storage.size, 2); assert.ok(env.auth.getAuthUser());
  assert.equal(view.button('회원탈퇴').disabled, false); assert.equal(view.navigation.length, 0);
});

test('anonymous direct access renders no action and returns to My Page without a DELETE', async () => {
  const env = environment(); await env.auth.clearTokens(); const view = screen(env);
  assert.equal(view.render(), null); view.effects.forEach(effect => effect()); await flush();
  assert.equal(env.requests.length, 0); assert.deepEqual(view.navigation, [['dismissTo', '/profile']]);
});

test('confirmation becomes harmless if the user logs out before accepting', async () => {
  const env = environment(), view = screen(env); view.button('회원탈퇴').onPress();
  await env.auth.clearTokens(); view.confirm(); await flush();
  assert.equal(env.requests.length, 0);
});

test('SecureStore failure retries only local cleanup and never repeats the successful DELETE', async () => {
  const env = environment(), view = screen(env); env.failDeletion('refreshToken');
  view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  assert.equal(env.requests.length, 1); assert.equal(view.navigation.length, 0);
  assert.equal(view.alerts.at(-1)[0], '회원탈퇴가 완료되었습니다');
  env.failDeletion(undefined); view.button('로그인 정보 정리').onPress(); await flush();
  assert.equal(env.requests.length, 1); assert.equal(env.storage.size, 0);
  assert.deepEqual(view.navigation, [['dismissTo', '/profile']]);
});

test('late withdrawal success cannot erase a different, newer login', async () => {
  const env = environment(), view = screen(env), reply = deferred(); env.respond(() => reply.promise);
  view.button('회원탈퇴').onPress(); view.confirm(); await flush();
  await env.auth.saveTokens({ accessToken: 'access-B', refreshToken: 'refresh-B' });
  env.auth.setAuthUser({ email: 'b@example.com', nickname: '새 사용자' });
  reply.resolve(noContent); await flush();
  assert.equal(env.storage.get('accessToken'), 'access-B'); assert.equal(env.storage.get('refreshToken'), 'refresh-B');
  assert.equal(env.auth.getAuthUser().email, 'b@example.com');
});

test('both unchanged My Page settings entries use the same settings route handler', () => {
  const env = environment(), view = screen(env, 'index'), tree = view.render();
  const header = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '설정');
  const service = nodes(tree).find(node => node.props?.label === '설정');
  assert.equal(header.props.onPress, service.props.onPress);
  header.props.onPress(); service.props.onPress();
  assert.deepEqual(view.navigation, [['push', '/profile/settings'], ['push', '/profile/settings']]);
});

test('authenticated settings opens withdrawal; anonymous settings offers no account actions', async () => {
  const env = environment(), view = screen(env, 'settings');
  view.button('회원탈퇴').onPress(); assert.deepEqual(view.navigation, [['push', '/profile/withdrawal']]);
  await env.auth.clearTokens(); const rendered = view.render();
  assert.ok(!text(rendered).includes('회원탈퇴')); assert.ok(!text(rendered).includes('로그아웃'));
  assert.match(text(rendered), /로그인/); assert.equal(env.requests.length, 0);
  nodes(rendered).find(node => node.type === 'Pressable' && text(node) === '로그인').props.onPress();
  assert.deepEqual(view.navigation.at(-1), ['dismissTo', '/profile/login']);
});

test('withdrawal notices and button share a scrollable layout without fixed text heights', () => {
  const env = environment(), view = screen(env), tree = view.render();
  const scroll = nodes(tree).find(node => node.type === 'ScrollView');
  assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
  assert.ok(nodes(scroll).some(node => node.props?.accessibilityLabel === '회원탈퇴'));
  for (const notice of ['질문/자유 게시글', '관심 팝업과 좋아요', "'탈퇴한 사용자'", '삭제된 정보는 복구할 수 없습니다.']) assert.ok(text(scroll).includes(notice));
});
