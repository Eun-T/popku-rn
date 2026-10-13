const { savedToken } = require('./helpers/authStorage.cjs');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { loadPure } = require('./helpers/uiDependencies.cjs');
const { StackRouter, StackActions } = require('expo-router/build/react-navigation/routers/StackRouter');
const { TabRouter, TabActions } = require('expo-router/build/react-navigation/routers/TabRouter');
const { findDivergentState, getPayloadFromStateRoute } = require('expo-router/build/global-state/stateUtils');

const returns = loadPure('src/lib/loginReturn.ts');
function environment() {
  const options = names => ({ routeNames: names, routeParamList: {}, routeGetIdList: {} });
  const rootRouter = StackRouter({ initialRouteName: '(tabs)' });
  const rootOptions = options(['(tabs)', 'login', 'signup', 'profile/settings', 'profile/language', 'places/[id]']);
  const profileRouter = StackRouter({ initialRouteName: 'index' });
  const profileOptions = options(['index', 'login', 'signup']);
  const tabRouter = TabRouter({ initialRouteName: 'index', backBehavior: 'history' });
  const tabOptions = options(['index', 'places', 'map', 'community', 'profile']);
  let profile = profileRouter.getInitialState(profileOptions);
  let tabs = tabRouter.getInitialState(tabOptions);
  tabs = tabRouter.getStateForAction(tabs, TabActions.jumpTo('profile'), tabOptions);
  tabs = { ...tabs, routes: tabs.routes.map(route => route.name === 'profile' ? { ...route, state: profile }
    : route.name === 'map' ? { ...route, state: { camera: 'retained' } } : route) };
  let root = rootRouter.getInitialState(rootOptions);
  root = { ...root, routes: [{ ...root.routes[0], state: tabs }] };
  const original = root, calls = [];
  const apply = action => {
    const next = rootRouter.getStateForAction(root, action, rootOptions);
    assert.ok(next, `Unhandled ${action.type}`);
    root = next;
  };
  const rootNavigation = { getState: () => root, dispatch: action => { calls.push(action); apply(action); } };
  const router = { back: () => { calls.push('back'); apply(StackActions.pop()); }, canGoBack: () => root.index > 0,
    replace: href => { calls.push(['replace', href]); apply(StackActions.replace('(tabs)')); },
    dismissTo: href => {
      assert.equal(href, '/profile');
      const target = { routes: [{ name: '(tabs)', state: { routes: [{ name: 'profile', state: { routes: [{ name: 'index' }] } }] } }] };
      const divergence = findDivergentState(target, root);
      const payload = getPayloadFromStateRoute(divergence.actionStateRoute);
      apply({ ...StackActions.popTo(payload.screen, payload.params), target: root.key });
    },
    setParams: () => assert.fail('Root auth must retain its default animation') };
  return { original, calls, router, rootNavigation, profileRouter, profileOptions,
    get root() { return root; },
    push: name => apply(StackActions.push(name)),
    nestedAuth(name = 'login') {
      profile = profileRouter.getStateForAction(profile, StackActions.push(name), profileOptions);
      tabs = { ...tabs, routes: tabs.routes.map(route => route.name === 'profile' ? { ...route, state: profile } : route) };
      root = { ...root, routes: root.routes.map(route => route.name === '(tabs)' ? { ...route, state: tabs } : route) };
      return { getState: () => profile, getParent: () => ({ getState: () => tabs, getParent: () => rootNavigation }) };
    },
    // Use Expo's divergence/payload logic: Root login -> /profile/signup targets
    // Root PUSH (tabs), not the profile Stack below the Root login.
    signupAboveRootLogin() {
      const target = { routes: [{ name: '(tabs)', state: { routes: [{ name: 'profile',
        state: { routes: [{ name: 'signup' }] } }] } }] };
      const divergence = findDivergentState(target, root);
      assert.equal(divergence.navigationState.key, root.key);
      const payload = getPayloadFromStateRoute(divergence.actionStateRoute);
      apply({ ...StackActions.push(payload.screen, payload.params), target: root.key });
      const nested = profileRouter.getStateForAction(profile, StackActions.push('signup'), profileOptions);
      const newTabs = { ...tabs, key: 'duplicate-tabs', routes: tabs.routes.map(route => route.name === 'profile'
        ? { ...route, state: nested } : route) };
      root = { ...root, routes: root.routes.map((route, i) => i === root.index ? { ...route, state: newTabs } : route) };
      return { getState: () => nested, getParent: () => ({ getState: () => newTabs, getParent: () => rootNavigation }) };
    },
    legacyReplaceTabs() {
      const target = { routes: [{ name: '(tabs)', state: { routes: [{ name: 'index' }] } }] };
      const divergence = findDivergentState(target, root);
      assert.equal(divergence.navigationState.type, 'tab');
      const payload = getPayloadFromStateRoute(divergence.actionStateRoute);
      const next = tabRouter.getStateForAction(divergence.navigationState,
        { type: 'REPLACE', target: divergence.navigationState.key, payload: { name: payload.screen, params: payload.params } }, tabOptions);
      assert.ok(next);
      root = { ...root, routes: root.routes.map((route, i) => i === root.index ? { ...route, state: next } : route) };
    },
    switchTab(name) {
      const current = root.routes[root.index].state;
      const next = tabRouter.getStateForAction(current, TabActions.jumpTo(name), tabOptions);
      root = { ...root, routes: root.routes.map((route, i) => i === root.index ? { ...route, state: next } : route) };
    },
    assertClean() {
      assert.deepEqual(root.routes.map(route => route.name), ['(tabs)']);
      assert.equal(root.key, original.key);
      assert.equal(root.routes[0].key, original.routes[0].key);
      const state = root.routes[0].state;
      assert.equal(state.key, original.routes[0].state.key);
      assert.equal(state.routes[state.index].name, 'profile');
      const originalProfile = original.routes[0].state.routes.find(route => route.name === 'profile');
      const currentProfile = state.routes.find(route => route.name === 'profile');
      assert.equal(currentProfile.key, originalProfile.key);
      assert.equal(currentProfile.state.key, originalProfile.state.key);
      assert.deepEqual(currentProfile.state.routes, originalProfile.state.routes);
      assert.equal(state.routes.find(route => route.name === 'map'), original.routes[0].state.routes.find(route => route.name === 'map'));
      assert.equal(rootRouter.getStateForAction(root, { type: 'GO_BACK' }, rootOptions), null);
      assert.equal(profileRouter.getStateForAction(currentProfile.state, { type: 'GO_BACK' }, profileOptions), null);
    },
  };
}

function authModule(storage) {
  const module = { exports: {} };
  const mocks = {
    './deviceId': { getDeviceId: async () => 'device' },
    'expo-secure-store': { isAvailableAsync: async () => true,
      getItemAsync: async key => storage.get(key) ?? null, setItemAsync: async (key, value) => storage.set(key, value),
      deleteItemAsync: async key => storage.delete(key) },
    '../constants/api': { API_BASE_URL: 'https://api' },
    './favoriteCache': { clearFavoriteCache() {} }, './communityFeedRefresh': { clearCommunityLikes() {} },
  };
  const fetch = async url => ({ ok: true, status: url.endsWith('/logout') ? 204 : 200,
    json: async () => ({ email: 'me@test', nickname: 'member' }) });
  const code = ts.transpileModule(readFileSync('src/lib/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', 'fetch', code)(name => {
    assert.ok(name in mocks); return mocks[name];
  }, module, module.exports, false, fetch);
  return module.exports;
}

test('login -> settings logout -> back -> relogin removes private history; saved session restores on relaunch', async () => {
  const s = environment(), storage = new Map(), auth = authModule(storage);
  const signIn = async () => {
    s.push('login');
    await auth.saveTokens({ accessToken: 'access', refreshToken: 'refresh' });
    auth.setAuthUser(await auth.getCurrentUser('access'));
    returns.finishLoginReturn(s.router, s.rootNavigation, null, 'profile'); s.assertClean();
  };
  await signIn(); s.push('profile/settings');
  const noop = () => {};
  await handler('src/app/profile/settings.tsx', 'handleLogout', {
    pendingRef: { current: false }, getAuthUser: auth.getAuthUser, logout: auth.logout,
    setPending: noop, router: s.router, Alert: { alert: () => assert.fail('unexpected logout failure') },
  })();
  assert.equal(auth.getAuthUser(), null); assert.equal(storage.size, 0); s.assertClean();
  await signIn();
  const rootBeforeRestart = s.root;
  const restarted = authModule(storage);
  assert.equal(restarted.getAuthUser(), null);
  await restarted.refreshAuthUser();
  assert.equal(restarted.getAuthUser().email, 'me@test');
  assert.equal(savedToken(storage, 'accessToken'), 'access');
  assert.equal(s.root, rootBeforeRestart); s.assertClean();
});

test('Root login success pops the same Tabs instance; iOS pop and Android back have no auth history', () => {
  const s = environment(); s.push('login');
  returns.finishLoginReturn(s.router, s.rootNavigation, null, 'profile');
  assert.deepEqual(s.calls, ['back']); s.assertClean();
});

test('nested unmarked login success removes profile auth instead of switching tabs with auth retained', () => {
  const s = environment(), navigation = s.nestedAuth();
  returns.finishLoginReturn(s.router, navigation, null);
  assert.equal(s.calls[0].type, 'RESET');
  assert.equal(s.calls[0].target, s.original.key); s.assertClean();
});

test('Root login -> nested signup creates duplicate Tabs; success removes auth at both levels', () => {
  const s = environment(); s.push('login');
  const navigation = s.signupAboveRootLogin();
  assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', 'login', '(tabs)']);
  s.legacyReplaceTabs();
  assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', 'login', '(tabs)'], 'replacing in Tabs leaves Root login behind');
  s.switchTab('profile');
  assert.equal(s.root.routes[s.root.index - 1].name, 'login', 'swipe/back from the second Tabs screen would reveal login');
  returns.finishLoginReturn(s.router, navigation, null); s.assertClean();
  s.switchTab('map'); s.switchTab('profile'); s.assertClean();
  s.push('profile/settings'); s.push('profile/language');
  s.router.back(); s.router.back(); s.assertClean();
});

test('login signup and nested auth below Root login are removed together', () => {
  const s = environment(); s.nestedAuth(); s.nestedAuth('signup'); s.push('login');
  returns.finishLoginReturn(s.router, s.rootNavigation, null, 'profile'); s.assertClean();
});

test('a second My Page login above duplicate Tabs removes the older Root login too', () => {
  const s = environment(); s.push('login'); s.signupAboveRootLogin(); s.push('login');
  assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', 'login', '(tabs)', 'login']);
  returns.finishLoginReturn(s.router, s.rootNavigation, null, 'profile');
  s.assertClean();
});

// Execute each production success handler after the existing attempt completes.
// HTTP/native SDKs are mocked; navigation uses the installed StackRouter.
function handler(file, name, scope) {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  const visit = n => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) node = n; ts.forEachChild(n, visit); };
  visit(ast); assert.ok(node);
  const code = ts.transpileModule(`${node.getText(ast)}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), code)(...Object.values(scope));
}
for (const method of ['email', 'Google', 'Apple', 'Google signup', 'Apple signup']) {
  test(`${method} completes authentication before clearing both Stack levels`, async () => {
    const s = environment(), signup = method.includes('signup');
    s.push('login');
    const navigation = signup ? s.signupAboveRootLogin() : s.rootNavigation;
    let completed = false, saved = false;
    const noop = () => {};
    const attempt = {};
    const scope = {
      __DEV__: false, loading: false, googleLoadingRef: { current: false }, appleLoadingRef: { current: false },
      email: 'me@test', password: 'password', redirected: { current: false }, target: null, params: { loginOrigin: 'profile' },
      navigation, router: s.router, finishLoginReturn: (...args) => { assert.ok(saved && completed); returns.finishLoginReturn(...args); },
      allowLeaveRef: { current: false }, completedSignupHref: returns.completedSignupHref, authSessionGeneration: () => 3,
      authentication: { begin: () => attempt, valid: () => true, active: () => true,
        authenticate: async () => { saved = true; return true; }, complete: () => { completed = true; return true; },
        fail: () => assert.fail('unexpected failure'), release: noop },
      login: async () => ({}), getGoogleIdToken: async () => 'id', authenticateWithGoogle: async () => ({ kind: 'login', tokens: {} }),
      authenticateWithApple: async () => ({ kind: 'existing', tokens: {} }),
      setLoading: noop, setGoogleLoading: noop, setAppleLoading: noop, setError: noop,
      canJoin: true, ageConfirmed: true, joiningRef: { current: false }, isGoogle: method === 'Google signup', isApple: method === 'Apple signup', isSocial: true,
      getGoogleSignupToken: () => 'signup', getAppleSignupToken: () => 'signup',
      completeGoogleSignup: async () => ({}), completeAppleSignup: async () => ({}),
      signupDraft: { nickname: 'me', termsAccepted: true, privacyAccepted: true, marketingAccepted: false }, getDeviceId: async () => 'device',
      setJoining: noop, setJoinError: noop, setPassword: noop, setPasswordConfirmation: noop, setCode: noop, setEmail: noop,
      setNickname: noop, setConfirmedNickname: noop, clearGoogleSignup: noop, clearAppleSignup: noop, Keyboard: { dismiss: noop },
    };
    if (signup) scope.router = { ...s.router, dismissTo: href => {
      assert.ok(saved && completed);
      assert.deepEqual(href, { pathname: '/login', params: { loginOrigin: 'profile', completedGeneration: '3' } });
      s.rootNavigation.dispatch(StackActions.popTo('login', href.params));
      // Model the original login's focused completion handoff.
      returns.finishLoginReturn(s.router, s.rootNavigation, null, href.params.loginOrigin);
    } };
    const name = signup ? 'handleJoin' : method === 'email' ? 'handleLogin' : method === 'Google' ? 'handleGoogleLogin' : 'handleAppleLogin';
    await handler(`src/app/(tabs)/profile/${signup ? 'signup' : 'login'}.tsx`, name, scope)();
    s.assertClean();
  });
}
