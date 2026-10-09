const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { nodes } = require('./helpers/uiTree.cjs');
const { withUiDependencies, loadPure } = require('./helpers/uiDependencies.cjs');
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');

function load(file, mocks = {}, globals = {}) {
  mocks = withUiDependencies(file, mocks);
  const module = { exports: {} };
  const result = ts.transpileModule(readFileSync(file, 'utf8'), { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  new Function('require', 'module', 'exports', '__DEV__', ...Object.keys(globals), result.outputText)(name => {
    assert.ok(name in mocks, `Missing ${name} in ${file}`); return mocks[name];
  }, module, module.exports, false, ...Object.values(globals));
  return module.exports;
}

function hooks() {
  const slots = [], effects = []; let cursor = 0, dirty = false, focused = true;
  const same = (a, b) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]; if (same(old?.deps, deps)) return;
      slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    },
    useSyncExternalStore(subscribe, snapshot) { react.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]); return snapshot(); },
  };
  return { react, slots,
    useFocusEffect(fn) { react.useEffect(() => focused ? fn() : undefined, [fn, focused]); },
    focus(value) { focused = value; },
    render(Component) {
      let tree, count = 0;
      do { assert.ok(count++ < 30); cursor = 0; dirty = false; tree = Component(); effects.splice(0).forEach(fn => fn()); } while (dirty);
      return tree;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body) });
const tokensFor = email => ({ accessToken: email, refreshToken: `refresh:${email}` });
const userFor = email => ({ email, nickname: email });
const target = publicId => ({ intent: 'review', publicId });
const post = { type: 'POST', id: 1, category: 'FREE', content: 'public', createdAt: '2026-10-08T10:00:00+09:00',
  author: { id: 1, nickname: 'me', avatarUrl: null }, images: [], likeCount: 0, commentCount: 0, viewCount: 0, popup: null, rating: null, regionName: null };

function setup(t, publicId = 'one', profileLogin = false) {
  const storage = new Map(), calls = [], held = [], clients = [], navigationCalls = [], alerts = [];
  let gate = () => false, fail = () => false, googleSignup = false, googlePicker = async () => 'google-id';
  const sync = load('src/lib/communityFeedRefresh.ts');
  const fetch = async (url, init = {}) => {
    const call = { url, ...init }; calls.push(call);
    let body;
    if (url.endsWith('/api/auth/login')) body = tokensFor(JSON.parse(init.body).email);
    else if (url.endsWith('/api/auth/google')) body = googleSignup ? { status: 'SIGNUP_REQUIRED', signupToken: 'signup-token', expiresInSeconds: 300 } : tokensFor('google@test');
    else if (url.endsWith('/api/auth/google/complete')) body = tokensFor('new-google@test');
    else if (url.endsWith('/api/users/me')) body = userFor(init.headers.Authorization.slice(7));
    else if (url.includes('/reviews') && init.method === 'POST') body = { id: 10 };
    else body = { items: [], nextCursor: null };
    if (gate(call)) return new Promise(resolve => held.push({ ...call, release: (value = body, status = 200) => resolve(response(value, status)) }));
    return response(body, fail(call) ? 500 : 200);
  };
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': { isAvailableAsync: async () => true, getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async key => storage.delete(key) },
    '../constants/api': { API_BASE_URL: 'https://api' }, './favoriteCache': { clearFavoriteCache() {} }, './communityFeedRefresh': sync,
  }, { fetch });
  const google = load('src/lib/googleAuth.ts', { '../constants/api': { API_BASE_URL: 'https://api' }, './auth': auth }, { fetch });
  const diagnostics = { readCommunityErrorBody: async r => r.text(), logCommunityError() {} };
  const community = load('src/lib/community.ts', { '../constants/api': { API_BASE_URL: 'https://api' }, './auth': auth,
    './communityFeedRefresh': sync, './communityDiagnostics': diagnostics }, { fetch });
  const reviews = load('src/lib/reviews.ts', { '../constants/api': { API_BASE_URL: 'https://api' }, './auth': auth,
    './community': community, './communityFeedRefresh': sync, './communityDiagnostics': diagnostics, './communityImages': {} }, { fetch });
  const returns = loadPure('src/lib/loginReturn.ts');
  const stackRouter = StackRouter({ initialRouteName: '(tabs)' });
  const routeNames = profileLogin ? ['index', 'login', 'signup'] : ['(tabs)', 'places/[id]', 'login', 'signup', 'reviews/write', 'community/write'];
  const options = { routeParamList: {}, routeGetIdList: {} };
  let stack = { type: 'stack', key: 'root', index: 1, routeNames, preloadedRoutes: [],
    routes: [{ key: 'tabs-original', name: '(tabs)', state: { selected: 'map', camera: 'unchanged' } }, { key: 'popup-original', name: 'places/[id]', params: { id: publicId } }] };
  if (profileLogin) stack = { ...stack, key: 'profile-stack-original', index: 0,
    routes: [{ key: 'profile-index-original', name: 'index' }] };
  let parentTabs = { key: 'tabs-state-original', index: 4,
    routes: ['index', 'places', 'map', 'community', 'profile'].map(name => ({ name, key: `${name}-tab-original`, ...(name === 'profile' ? { state: stack } : {}) })) };
  let parentRoot = { key: 'root-original', index: 0, routes: [{ key: 'tabs-screen-original', name: '(tabs)', state: parentTabs }] };
  const optionCommits = [], transitions = [];
  const apply = action => {
    const next = stackRouter.getStateForAction(stack, action, options); assert.ok(next); stack = next;
    if (profileLogin) {
      parentTabs = { ...parentTabs, routes: parentTabs.routes.map(route => route.name === 'profile' ? { ...route, state: stack } : route) };
      parentRoot = { ...parentRoot, routes: [{ ...parentRoot.routes[0], state: parentTabs }] };
    }
  };
  const navigation = { getState: () => stack, setParams(params) {
    navigationCalls.push(['setParams', params]);
    apply({ type: 'SET_PARAMS', target: stack.key, source: stack.routes[stack.index].key, payload: { params } });
  } };
  function action(method, href) {
    navigationCalls.push([method, href]);
    if (method === 'back') {
      if (profileLogin) transitions.push({ method, animation: optionCommits.at(-1).animation });
      apply({ type: 'GO_BACK' }); return;
    }
    const path = typeof href === 'string' ? href : href.pathname;
    const name = profileLogin && path.startsWith('/profile/') ? path.slice('/profile/'.length)
      : path === '/(tabs)' ? '(tabs)' : path.slice(1);
    apply({ type: method === 'push' ? 'PUSH' : method === 'replace' ? 'REPLACE' : 'POP_TO', payload: { name, params: href.params } });
  }
  const router = { push: href => action('push', href), replace: href => action('replace', href), back: () => action('back'),
    canGoBack: () => stack.index > 0, dismissTo: href => action('dismissTo', href), setParams: navigation.setParams };
  const jsx = (type, props, key) => ({ type, props, key });
  const Stack = Object.assign(() => null, { Screen: 'StackScreen' });
  const ProfileLayout = load('src/app/(tabs)/profile/_layout.tsx', {
    'expo-router': { Stack }, 'react/jsx-runtime': { jsx, jsxs: jsx },
  }).default;
  const loginOptions = nodes(ProfileLayout()).find(node => node.props?.name === 'login').props.options;
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'Image', 'KeyboardAvoidingView'].map(name => [name, name]));
  Object.assign(native, { StyleSheet: { create: styles => styles }, Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) } });
  function client(kind) {
    const state = hooks(), routeKey = stack.routes.at(-1).key;
    const params = () => stack.routes.find(route => route.key === routeKey)?.params ?? {};
    const expo = { useRouter: () => router, useNavigation: () => navigation, useLocalSearchParams: params,
      useFocusEffect: fn => state.useFocusEffect(fn), useScrollToTop() {} };
    const common = { react: state.react, 'expo-router': expo, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
      'lucide-react-native': {}, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) } };
    const useLoginAttempt = load('src/hooks/useLoginAttempt.ts', { react: state.react, 'expo-router': expo, '../lib/auth': auth }).useLoginAttempt;
    let Component, guard;
    if (kind === 'profile') {
      Component = load('src/app/(tabs)/profile/index.tsx', { ...common,
        'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' }, '../../../lib/auth': auth }).default;
    } else if (kind === 'login') {
      const Login = load('src/app/(tabs)/profile/login.tsx', { ...common, '../../../lib/auth': auth,
        '../../../hooks/useLoginAttempt': { useLoginAttempt }, '../../../lib/googleAuth': { ...google, getGoogleIdToken: () => googlePicker() } }).default;
      Component = load('src/app/login.tsx', { './(tabs)/profile/login': { __esModule: true, default: Login } }).default;
    } else if (kind === 'signup') {
      // Execute the existing signup callback with the production attempt guard and API.
      const source = ts.createSourceFile('signup.tsx', readFileSync('src/app/(tabs)/profile/signup.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let handler, back, expiry;
      const visit = node => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleJoin') handler = node;
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleBack') back = node;
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
          && node.arguments[0].getText(source).includes('!getGoogleSignupToken()')) expiry = node.arguments[0];
        ts.forEachChild(node, visit);
      }; visit(source); assert.ok(handler); assert.ok(back); assert.ok(expiry);
      const code = ts.transpileModule(`${handler.getText(source)}\n${back.getText(source)}\nreturn {join:handleJoin, back:handleBack, expiry:${expiry.getText(source)}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      Component = () => {
        const authentication = useLoginAttempt(JSON.stringify(returns.parseLoginReturn(params())));
        const [joining, setJoining] = state.react.useState(false), joiningRef = state.react.useRef(false);
        const [signupStep, setSignupStep] = state.react.useState('terms');
        const scope = { canJoin: true, isGoogle: true, joiningRef, authentication, setJoining, setJoinError() {},
          signupStep, setSignupStep, cancelNicknameCheck() {}, setNicknameError() {},
          signupDraft: { nickname: 'me', termsAccepted: true, privacyAccepted: true, marketingAccepted: false },
          ...google, ...auth, target: returns.parseLoginReturn(params()), ...returns,
          router, Keyboard: { dismiss() {} }, setPassword() {}, setPasswordConfirmation() {}, setCode() {}, setEmail() {}, setNickname() {}, setConfirmedNickname() {},
          googleJoinErrorMessage: () => 'signup failed', joinErrorMessage: () => 'failed' };
        const handlers = new Function(...Object.keys(scope), code)(...Object.values(scope));
        state.react.useEffect(handlers.expiry, []);
        return jsx('View', { children: [
          jsx('Pressable', { onPress: handlers.join, disabled: joining, children: jsx('Text', { children: '가입 완료' }) }),
          jsx('Pressable', { onPress: handlers.back, accessibilityLabel: '뒤로가기' }),
        ] });
      };
    } else if (kind === 'rows') {
      const Tab = load('src/components/place/PopupReviews.tsx', { ...common,
        '../community/CommunityPostItem': { __esModule: true, default: 'Card' }, '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 123 }) },
        '../../lib/auth': auth, '../../lib/communityFeedRefresh': sync, '../../lib/reviews': reviews, '../../lib/communityLikes': {} }).default;
      Component = () => Tab({ publicId: stack.routes.find(route => route.key === routeKey).params.id, title: 'Popup' });
    } else if (kind === 'feed') Component = load('src/screens/CommunityScreen.tsx', { ...common,
      '../components/community/CommunityPostItem': { __esModule: true, default: 'Card' }, '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
      '../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 123, updateNow() {} }) }, '../lib/auth': auth,
      '../lib/community': { getCommunityFeed: async () => ({ items: [post], nextCursor: null }) }, '../lib/communityFeedRefresh': sync,
      '../lib/communityLikes': {}, '../lib/communityRefresh': { waitForCommunityRefresh: async () => {} }, '../locales': { t: key => key },
    }).default;
    else {
      guard = require('./helpers/preventRemove.cjs').removalDriver(state.react);
      const writerNavigation = { ...guard.navigation, getState: () => stack };
      Component = load('src/app/reviews/write.tsx', { ...common, 'expo-router': { ...expo, useNavigation: () => writerNavigation },
        'expo-router/react-navigation': { usePreventRemove: guard.usePreventRemove }, '../../lib/auth': auth, '../../lib/community': community,
        '../../lib/popups': { getPopupDetail: async () => ({ name: 'Popup' }) }, '../../lib/reviews': reviews,
        '../../lib/communityImages': { MAX_POST_IMAGES: 5, ImageSelectionError: class extends Error {}, selectPostImages: async () => [] },
        '../../locales': require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'),
      }).default;
    }
    let tree, alive = true;
    const render = () => {
      if (!alive) return;
      const route = stack.routes.find(route => route.key === routeKey);
      // Model the parent descriptor commit before the child's focused Effect.
      if (kind === 'login' && route) optionCommits.push(loginOptions({ route }));
      state.focus(stack.routes.at(-1).key === routeKey); tree = state.render(Component); return tree;
    };
    const c = { render, guard, get tree() { return tree; }, params, routeKey, slots: state.slots,
      button: label => nodes(tree).find(node => node.type === 'Pressable' && (node.props.accessibilityLabel === label || nodes(node).some(child => child.type === 'Text' && child.props.children === label))),
      input: placeholder => nodes(tree).find(node => node.type === 'TextInput' && node.props.placeholder === placeholder),
      unmount() { if (alive) { alive = false; state.unmount(); } } };
    clients.push(c); render(); return c;
  }
  const settle = async () => { for (let i = 0; i < 35; i++) { await Promise.resolve(); clients.forEach(c => c.render()); } };
  const startLogin = params => { router.push(returns.loginHref(params)); return client('login'); };
  function fill(login) { login.input('이메일').props.onChangeText('me@test'); login.input('비밀번호').props.onChangeText('password'); login.render(); }
  t.after(() => clients.forEach(c => c.unmount()));
  return { auth, google, storage, calls, held, navigationCalls, navigation, router, returns, client, settle, startLogin, fill,
    optionCommits, transitions, get parentTabs() { return parentTabs; }, get parentTabsRouteKey() { return parentRoot.routes[0].key; },
    get stack() { return stack; }, hold: fn => { gate = fn; }, fail: fn => { fail = fn; },
    googleSignup: () => { googleSignup = true; }, picker: fn => { googlePicker = fn; },
  };
}

for (const publicId of ['one', 'another-popup']) test(`guest review button carries only ${publicId} into root login, then email success replaces login with its writer`, async t => {
  const s = setup(t, publicId), rows = s.client('rows'); await s.settle();
  assert.equal(rows.button('방문 리뷰 작성'), undefined); const button = rows.button('로그인하고 리뷰 작성하기'); assert.ok(button);
  button.props.onPress(); button.props.onPress(); await s.settle();
  assert.deepEqual(s.stack.routes.map(r => r.name), ['(tabs)', 'places/[id]', 'login']);
  assert.deepEqual(s.stack.routes.at(-1).params, target(publicId));
  const login = s.client('login'); s.fill(login); const submit = login.button('로그인').props.onPress; submit(); submit(); await s.settle();
  assert.deepEqual(s.stack.routes.map(r => r.name), ['(tabs)', 'places/[id]', 'reviews/write']);
  assert.deepEqual(s.stack.routes.at(-1).params, { publicId });
  assert.equal(s.stack.routes[0].key, 'tabs-original'); assert.deepEqual(s.stack.routes[0].state, { selected: 'map', camera: 'unchanged' });
  assert.equal(s.stack.routes[1].key, 'popup-original'); assert.equal(s.calls.filter(c => c.url.endsWith('/auth/login')).length, 1);
  assert.equal(s.navigationCalls.filter(([method]) => method === 'replace').length, 1);
  await s.auth.refreshAuthUser(); await s.auth.refreshAuthUser(); await s.settle();
  assert.equal(s.navigationCalls.filter(([method]) => method === 'replace').length, 1, 'duplicate authentication notifications cannot navigate twice');
  s.router.back(); await s.settle(); assert.equal(s.stack.routes.at(-1).key, 'popup-original'); assert.equal(s.stack.routes.filter(r => r.name === 'login').length, 0);
});

test('login cancel returns to the original popup and a late response cannot reuse its destination', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.hold(c => c.url.endsWith('/auth/login')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle(); login.button('뒤로가기').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).key, 'popup-original'); assert.equal(s.stack.routes.filter(r => r.name === '(tabs)').length, 1);
  s.held[0].release(); await s.settle(); assert.equal(s.auth.getAuthUser(), null); assert.equal(s.storage.size, 0);
  assert.equal(s.stack.routes.at(-1).key, 'popup-original');
  s.hold(() => false); const normal = s.startLogin(null); s.fill(normal); normal.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.navigationCalls.at(-1)[1], '/(tabs)'); assert.ok(!s.stack.routes.some(r => r.name === 'reviews/write'));
});

test('email failure stays on login with no writer or authentication commit', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.fail(c => c.url.endsWith('/auth/login')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).name, 'login'); assert.equal(s.auth.getAuthUser(), null); assert.equal(s.storage.size, 0);
  assert.ok(nodes(login.tree).some(n => n.props?.children === '이메일 또는 비밀번호를 확인해 주세요.'));
  assert.equal(s.navigationCalls.filter(([method]) => method === 'replace').length, 0);
});

test('existing Google login uses the same popup return and excludes concurrent email submission', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.fill(login);
  const google = login.button('Google로 계속하기').props.onPress, email = login.button('로그인').props.onPress;
  google(); google(); email(); await s.settle();
  assert.equal(s.stack.routes.at(-1).name, 'reviews/write'); assert.deepEqual(s.stack.routes.at(-1).params, { publicId: 'one' });
  assert.equal(s.calls.filter(c => c.url.endsWith('/auth/google')).length, 1); assert.equal(s.calls.filter(c => c.url.endsWith('/auth/login')).length, 0);
});

for (const cancel of [null, { code: 'SIGN_IN_CANCELLED' }]) test(`Google cancellation (${cancel ? 'exception' : 'null'}) cannot navigate to a writer`, async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.picker(async () => { if (cancel) throw cancel; return null; });
  login.button('Google로 계속하기').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).name, 'login'); assert.equal(s.calls.length, 0); assert.equal(s.auth.getAuthUser(), null);
  login.button('뒤로가기').props.onPress(); await s.settle(); assert.equal(s.stack.routes.at(-1).key, 'popup-original');
});

test('Google signup completion returns through the same root login and leaves no signup/login or extra tabs', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.googleSignup(); login.button('Google로 계속하기').props.onPress(); await s.settle();
  assert.deepEqual(s.stack.routes.map(r => r.name), ['(tabs)', 'places/[id]', 'login', 'signup']);
  const signup = s.client('signup'); signup.button('가입 완료').props.onPress(); await s.settle();
  assert.deepEqual(s.stack.routes.map(r => r.name), ['(tabs)', 'places/[id]', 'reviews/write']);
  assert.deepEqual(s.stack.routes.at(-1).params, { publicId: 'one' }); assert.equal(s.stack.routes[0].key, 'tabs-original');
  assert.equal(s.calls.filter(c => c.url.endsWith('/auth/google/complete')).length, 1);
});

for (const reason of ['back', 'expired']) test(`Google signup ${reason} preserves the same scoped login and cancellation returns to the original popup`, async t => {
  const s = setup(t), login = s.startLogin(target('one'));
  const loginKey = s.stack.routes.at(-1).key;
  s.googleSignup(); login.button('Google로 계속하기').props.onPress(); await s.settle();
  if (reason === 'expired') s.google.clearGoogleSignup();
  const signup = s.client('signup'); await s.settle();
  if (reason === 'back') {
    signup.button('뒤로가기').props.onPress(); await s.settle();
    assert.equal(s.stack.routes.at(-1).name, 'signup');
    signup.button('뒤로가기').props.onPress(); await s.settle();
  }
  assert.deepEqual(s.stack.routes.map(r => r.name), ['(tabs)', 'places/[id]', 'login']);
  assert.equal(s.stack.routes.at(-1).key, loginKey);
  assert.deepEqual(s.stack.routes.at(-1).params, target('one'));
  assert.equal(s.auth.getAuthUser(), null); assert.equal(s.storage.size, 0);
  login.button('뒤로가기').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).key, 'popup-original');
  assert.equal(s.stack.routes[0].key, 'tabs-original');
});

test('cancel after token save invalidates only its own attempt; a subsequent account survives late /me success and failure', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.hold(c => c.url.endsWith('/users/me')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle(); assert.equal(s.storage.get('accessToken'), 'me@test');
  login.button('뒤로가기').props.onPress(); await s.settle(); assert.equal(s.storage.size, 0);
  await s.auth.saveTokens(tokensFor('new@test')); s.auth.setAuthUser(userFor('new@test'));
  s.held[0].release(userFor('old@test')); await s.settle();
  assert.deepEqual(s.auth.getAuthUser(), userFor('new@test')); assert.equal(s.storage.get('accessToken'), 'new@test');
  assert.equal(s.stack.routes.at(-1).key, 'popup-original');
});

for (const status of [200, 401, 500]) test(`new session survives old /me HTTP ${status}, without redirect or clearing its tokens`, async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.hold(c => c.url.endsWith('/users/me')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle();
  await s.auth.saveTokens(tokensFor('new@test')); s.auth.setAuthUser(userFor('new@test'));
  s.held[0].release(userFor('old@test'), status); await s.settle();
  assert.deepEqual(s.auth.getAuthUser(), userFor('new@test')); assert.equal(s.storage.get('accessToken'), 'new@test');
  assert.equal(s.stack.routes.at(-1).name, 'login'); assert.equal(s.navigationCalls.filter(([method]) => method === 'replace').length, 0);
});

test('logout invalidates a pending login so its old review target cannot be applied to another login', async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.hold(c => c.url.endsWith('/auth/login')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle(); await s.auth.logout(); s.held[0].release(); await s.settle();
  assert.equal(s.auth.getAuthUser(), null); assert.equal(s.storage.size, 0); assert.equal(s.stack.routes.at(-1).name, 'login');
  login.button('뒤로가기').props.onPress(); await s.settle(); s.hold(() => false);
  const normal = s.startLogin(null); s.fill(normal); normal.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.navigationCalls.at(-1)[1], '/(tabs)'); assert.ok(!s.stack.routes.some(r => r.name === 'reviews/write'));
});

test('popup mismatch and invalid return params never open another popup writer', async t => {
  const s = setup(t), login = s.startLogin(target('other')); s.fill(login); login.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).key, 'popup-original'); assert.ok(!s.stack.routes.some(r => r.name === 'reviews/write'));
  for (const params of [{ intent: 'review', publicId: [] }, { intent: 'review', publicId: ' ' }, { intent: '/arbitrary', publicId: 'one' }, { intent: 'resume', resumeKey: [] }]) {
    assert.equal(s.returns.parseLoginReturn(params), null);
  }
});

test('signed-in review compose keeps its label and goes directly to the existing writer route', async t => {
  const s = setup(t); await s.auth.saveTokens(tokensFor('me@test')); s.auth.setAuthUser(userFor('me@test'));
  const rows = s.client('rows'); await s.settle(); assert.equal(rows.button('로그인하고 리뷰 작성하기'), undefined);
  rows.button('방문 리뷰 작성').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).name, 'reviews/write'); assert.equal(s.stack.routes.at(-1).params.publicId, 'one');
  assert.ok(!s.stack.routes.some(r => r.name === 'login'));
});

test('community keeps public rows while hiding guest compose, shows it when signed in and hides it after logout', async t => {
  const s = setup(t), feed = s.client('feed'); await s.settle(); assert.equal(feed.button('community.write'), undefined);
  assert.equal(nodes(feed.tree).find(n => n.type === 'FlatList').props.data.length, 1);
  assert.equal(nodes(feed.tree).filter(n => n.props?.accessibilityLabel?.includes('로그인')).length, 0);
  await s.auth.saveTokens(tokensFor('me@test')); s.auth.setAuthUser(userFor('me@test')); await s.settle(); assert.ok(feed.button('community.write'));
  assert.equal(nodes(feed.tree).find(n => n.type === 'FlatList').props.data.length, 1);
  await s.auth.logout(); await s.settle(); assert.equal(feed.button('community.write'), undefined);
  assert.equal(nodes(feed.tree).find(n => n.type === 'FlatList').props.data.length, 1);
});

test('direct anonymous writer submission keeps API authentication protection and resumes the same draft after login', async t => {
  const s = setup(t); s.router.push({ pathname: '/reviews/write', params: { publicId: 'one' } });
  const writer = s.client('writer'); await s.settle();
  const input = () => nodes(writer.tree).find(n => n.type === 'TextInput'); input().props.onChangeText('keep my draft'); writer.button('별점 4점').props.onPress(); writer.render();
  const key = s.stack.routes.at(-1).key; writer.button('등록').props.onPress(); await s.settle();
  assert.equal(s.calls.filter(c => c.url.includes('/reviews')).length, 0, 'guest mutation never reaches the backend');
  assert.deepEqual(s.stack.routes.at(-1).params, { intent: 'resume', resumeKey: key });
  const login = s.client('login'); s.fill(login); login.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).key, key); assert.equal(input().props.value, 'keep my draft');
  assert.equal(writer.button('별점 4점').props.accessibilityState.selected, true);
  for (let cycle = 0; cycle < 2; cycle++) {
    await s.auth.clearTokens(); await s.settle(); writer.button('등록').props.onPress(); await s.settle();
    const again = s.client('login'); s.fill(again); again.button('로그인').props.onPress(); await s.settle();
    assert.equal(s.stack.routes.at(-1).key, key); assert.equal(input().props.value, 'keep my draft');
    assert.equal(writer.button('별점 4점').props.accessibilityState.selected, true);
    assert.equal(s.stack.routes.filter(r => r.name === '(tabs)').length, 1);
    assert.deepEqual(s.stack.routes[0].state, { selected: 'map', camera: 'unchanged' });
  }
  assert.equal(s.stack.routes.filter(r => r.name === '(tabs)').length, 1); assert.equal(s.stack.routes.filter(r => r.name === 'reviews/write').length, 1);
  assert.equal(writer.guard.nativeFlags.at(-1), true, 'F02 guard still belongs to the original dirty writer');
  writer.guard.request({ type: 'GO_BACK' }); assert.equal(writer.guard.completed.length, 0);
});

for (const status of [401, 500]) test(`current /me failure ${status} preserves the form and cleans only its own tokens before retry`, async t => {
  const s = setup(t), login = s.startLogin(target('one')); s.hold(c => c.url.endsWith('/users/me')); s.fill(login);
  login.button('로그인').props.onPress(); await s.settle(); s.held[0].release({}, status); await s.settle();
  assert.equal(s.storage.size, 0); assert.equal(s.auth.getAuthUser(), null); assert.equal(s.stack.routes.at(-1).name, 'login');
  assert.equal(login.input('이메일').props.value, 'me@test'); assert.equal(login.input('비밀번호').props.value, 'password');
  s.hold(() => false); login.button('로그인').props.onPress(); await s.settle();
  assert.equal(s.stack.routes.at(-1).name, 'reviews/write'); assert.equal(s.navigationCalls.filter(([method]) => method === 'replace').length, 1);
});

for (const method of ['email', 'Google']) test(`My Page ${method} login commits no-animation before returning to the same profile route`, async t => {
  const s = setup(t, 'one', true), profile = s.client('profile');
  await s.settle();
  const slots = profile.slots, blurRef = nodes(profile.tree).find(node => node.type === 'BlurTargetView').props.ref;
  profile.button('로그인').props.onPress();
  assert.deepEqual(s.stack.routes.at(-1).params, { loginOrigin: 'profile' });
  const login = s.client('login');
  assert.equal(s.optionCommits.at(-1).animation, 'default');
  if (method === 'email') s.fill(login);
  const submit = login.button(method === 'email' ? '로그인' : 'Google로 계속하기').props.onPress;
  submit(); submit();
  await s.settle();
  assert.deepEqual(s.stack.routes.map(route => route.name), ['index']);
  assert.equal(s.stack.routes[0].key, 'profile-index-original');
  assert.equal(s.stack.key, 'profile-stack-original');
  assert.equal(s.parentTabs.key, 'tabs-state-original');
  assert.equal(s.parentTabs.index, 4);
  assert.equal(s.parentTabs.routes[4].key, 'profile-tab-original');
  assert.equal(s.parentTabsRouteKey, 'tabs-screen-original');
  assert.equal(profile.slots, slots);
  assert.equal(nodes(profile.tree).find(node => node.type === 'BlurTargetView').props.ref, blurRef);
  assert.deepEqual(s.navigationCalls, [
    ['push', { pathname: '/profile/login', params: { loginOrigin: 'profile' } }],
    ['setParams', { profileLoginSuccess: '1' }], ['back', undefined],
  ]);
  assert.deepEqual(s.transitions, [{ method: 'back', animation: 'none' }]);
  const email = method === 'email' ? 'me@test' : 'google@test';
  assert.equal(s.auth.getAuthUser().email, email);
  assert.ok(nodes(profile.tree).some(node => node.type === 'Text' && node.props.children === email));
  assert.equal(s.calls.filter(call => call.url.endsWith(method === 'email' ? '/auth/login' : '/auth/google')).length, 1);
  assert.equal(s.calls.filter(call => call.url.endsWith('/users/me')).length, 2, 'authentication reads /me once; the existing Profile focus refresh reads it once');
  assert.equal(s.stack.index, 0, 'back/swipe cannot reveal the removed login route');
});

test('My Page login cancellation and failed authentication retain the native default transition', async t => {
  for (const fail of [false, true]) {
    const s = setup(t, 'one', true), profile = s.client('profile'); await s.settle();
    profile.button('로그인').props.onPress();
    const login = s.client('login');
    if (fail) {
      s.fail(call => call.url.endsWith('/auth/login'));
      s.fill(login); login.button('로그인').props.onPress(); await s.settle();
      assert.equal(s.stack.routes.at(-1).name, 'login');
      assert.equal(s.stack.routes.at(-1).params.profileLoginSuccess, undefined);
    }
    login.button('뒤로가기').props.onPress(); await s.settle();
    assert.equal(s.stack.routes[0].key, 'profile-index-original');
    assert.deepEqual(s.transitions, [{ method: 'back', animation: 'default' }]);
    assert.equal(s.navigationCalls.some(([method]) => method === 'setParams'), false);
    assert.equal(s.auth.getAuthUser(), null);
  }
});

test('review/resume intents win over My Page origin, and unmarked or invalid-context logins keep their old destination', () => {
  const returns = loadPure('src/lib/loginReturn.ts');
  for (const loginOrigin of [undefined, 'other', 'profile']) {
    const calls = [];
    const router = { replace: href => calls.push(['replace', href]), back: () => calls.push(['back']), canGoBack: () => true,
      setParams: () => assert.fail('must not mark a Root or unrelated login') };
    const navigation = { getState: () => ({ index: 1, routes: [{ key: 'tabs', name: '(tabs)' }, { key: 'login', name: 'login' }] }),
      setParams: () => assert.fail('must not mark a Root or unrelated login') };
    returns.finishLoginReturn(router, navigation, null, loginOrigin);
    assert.deepEqual(calls, [['replace', '/(tabs)']]);
  }
  for (const target of [{ intent: 'review', publicId: 'one' }, { intent: 'resume', resumeKey: 'writer' }]) {
    const calls = [], previous = target.intent === 'review'
      ? { key: 'popup', name: 'places/[id]', params: { id: 'one' } }
      : { key: 'writer', name: 'community/write' };
    const navigation = { getState: () => ({ index: 1, routes: [previous, { key: 'login', name: 'login' }] }),
      setParams: () => assert.fail('existing intents must never change animation') };
    returns.finishLoginReturn({ replace: href => calls.push(href), back: () => calls.push('back'), canGoBack: () => true,
      setParams: () => assert.fail('existing intents must never change animation') }, navigation, target, 'profile');
    assert.deepEqual(calls, target.intent === 'review' ? [{ pathname: '/reviews/write', params: { publicId: 'one' } }] : ['back']);
  }
});
