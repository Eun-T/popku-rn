const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { app, inputs, button } = require('./helpers/accountI18nRuntime.cjs');
const { nodes } = require('./helpers/i18nRuntime.cjs');
const { removalDriver } = require('./helpers/preventRemove.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const { StackRouter, StackActions } = require('expo-router/build/react-navigation/routers/StackRouter');
const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter');
const { getRoutes } = require('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const { findDivergentState, getPayloadFromStateRoute } = require('expo-router/build/global-state/stateUtils');

// Use Expo's path parser with only its native entry replaced by its pure validator.
const parserFile = require.resolve('expo-router/build/fork/getStateFromPath');
const parser = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(parserFile, 'utf8'))(name =>
  name === '../react-navigation/native'
    ? require('expo-router/build/react-navigation/core/validatePathConfig')
    : require(require.resolve(name, { paths: [path.dirname(parserFile)] })), parser, parser.exports);

async function setup(compiled = false) {
  const loginFile = 'src/app/(tabs)/profile/login.tsx', signupFile = 'src/app/(tabs)/profile/signup.tsx';
  const context = () => ({ default: () => null });
  context.keys = () => ['_layout', '(tabs)/_layout', '(tabs)/index', '(tabs)/places/index', '(tabs)/map',
    '(tabs)/community', '(tabs)/profile/_layout', '(tabs)/profile/index', '(tabs)/profile/login',
    '(tabs)/profile/signup', 'login', 'signup', 'profile/policies/terms', 'profile/policies/privacy',
    'places/[id]', 'reviews/write', 'community/write']
    .map(file => `./${file}.tsx`);
  const tree = getRoutes(context, { platform: 'ios', ignoreEntryPoints: true, ignoreRequireErrors: true });
  const config = getReactNavigationConfig(tree, true);
  const options = routeNames => ({ routeNames, routeParamList: {}, routeGetIdList: {} });
  const rootOptions = options(tree.children.map(route => route.route));
  const tabOptions = options(['index', 'places', 'map', 'community', 'profile']);
  const profileOptions = options(['login', 'index', 'signup']);
  const rootRouter = StackRouter({ initialRouteName: '(tabs)' });
  const tabRouter = TabRouter({}), profileRouter = StackRouter({});
  const profile = profileRouter.getRehydratedState({ routes: [{ name: 'index' }] }, profileOptions);
  let tabs = tabRouter.getStateForAction(tabRouter.getInitialState(tabOptions), { type: 'NAVIGATE', payload: { name: 'profile' } }, tabOptions);
  tabs = { ...tabs, routes: tabs.routes.map(route => route.name === 'profile' ? { ...route, state: profile } : route) };
  let root = rootRouter.getInitialState(rootOptions);
  root = { ...root, routes: [{ ...root.routes[0], state: tabs }] };
  const originalTabs = root.routes[0], events = [], api = [];
  let activeParams = {}, guard, signupKey, user = null, googleTicket, appleTicket;
  function dispatch(action) {
    const next = rootRouter.getStateForAction(root, action, rootOptions);
    assert.ok(next, `Unhandled ${action.type}`);
    if (signupKey && root.routes.some(route => route.key === signupKey)
      && !next.routes.some(route => route.key === signupKey) && guard.request(action)) return;
    root = next;
  }
  function hrefAction(method, href) {
    events.push([method, href]);
    const target = parser.exports.getStateFromPath(typeof href === 'string' ? href : href.pathname, config);
    let leaf = target;
    while (leaf.routes.at(-1).state) leaf = leaf.routes.at(-1).state;
    leaf.routes.at(-1).params = typeof href === 'string' ? {} : href.params;
    const divergence = findDivergentState(target, root), payload = getPayloadFromStateRoute(divergence.actionStateRoute);
    const action = { type: method === 'push' ? 'PUSH' : method === 'replace' ? 'REPLACE' : 'POP_TO',
      target: divergence.navigationState.key, payload: { name: payload.screen, params: payload.params } };
    assert.equal(action.target, root.key, 'authentication must stay in Root Stack');
    assert.notEqual(action.payload.name, '(tabs)', 'authentication must not create another Tabs');
    dispatch(action);
  }
  const router = { push: href => hrefAction('push', href), replace: href => hrefAction('replace', href),
    dismissTo: href => hrefAction('dismissTo', href), canGoBack: () => root.index > 0,
    back: () => { events.push(['back']); dispatch({ type: 'GO_BACK' }); } };
  const navigation = { getState: () => root, dispatch };
  const transform = compiled ? compilerTransform([loginFile, signupFile, 'src/hooks/useTranslation.ts'],
    { allowBailout: [loginFile] }) : undefined;
  const s = await app(transform, true, {
    'expo-router': { useRouter: () => router, useNavigation: () => navigation, useLocalSearchParams: () => activeParams,
      useFocusEffect: fn => s.react.useEffect(fn, [fn]) },
    'expo-router/react-navigation': { usePreventRemove: (...args) => guard.usePreventRemove(...args) },
    'src/lib/auth.ts': { DEVICE_ID: 'device', getAuthUser: () => user, authSessionGeneration: () => 3 },
    'src/hooks/useLoginAttempt.ts': { useLoginAttempt: () => ({ begin: () => ({}), valid: () => true, active: () => true,
      authenticate: async () => { user = { id: 7 }; api.push('authenticate'); return true; },
      complete: () => true, release() {}, fail: async () => true }) },
    'src/lib/googleAuth.ts': { GoogleAuthApiError: class extends Error {}, getGoogleIdToken: async () => 'google-id',
      authenticateWithGoogle: async () => ({ kind: 'signup', signupToken: 'google-ticket', expiresInSeconds: 300 }),
      beginGoogleSignup: token => { googleTicket = token; }, getGoogleSignupToken: () => googleTicket,
      clearGoogleSignup: () => { googleTicket = null; }, completeGoogleSignup: async () => { api.push('google'); return {}; } },
    'src/lib/appleAuth.ts': { isAppleAuthenticationAvailable: async () => true, AppleAuthError: class extends Error {},
      authenticateWithApple: async () => ({ kind: 'signup', signupToken: 'apple-ticket', expiresInSeconds: 300 }),
      beginAppleSignup: token => { appleTicket = token; }, getAppleSignupToken: () => appleTicket,
      clearAppleSignup: () => { appleTicket = null; }, completeAppleSignup: async () => { api.push('apple'); return {}; } },
    'src/lib/signup.ts': { SignupApiError: class extends Error {}, registerUser: async request => { api.push(['register', request]); } },
  });
  guard = removalDriver(s.react);
  function mount(file) {
    const key = root.routes[root.index].key, Screen = s.load(file).default;
    const owner = s.mount(() => { activeParams = root.routes.find(route => route.key === key)?.params ?? {}; return Screen(); });
    if (file === signupFile) signupKey = key;
    return owner;
  }
  function start(params = { loginOrigin: 'profile' }) { router.push({ pathname: '/login', params }); return mount(loginFile); }
  async function enter(kind, params, expired = false) {
    const before = root.routes.map(route => route.name);
    const login = start(params);
    if (kind === 'email') nodes(login.tree).find(node => node.type === 'Text' && node.props.onPress).props.onPress();
    else { await s.settle(); button(s, login, kind === 'google' ? 'Google로 계속하기' : 'Apple로 계속하기').props.onPress(); await s.settle(); }
    assert.deepEqual(root.routes.map(route => route.name), [...before, 'login', 'signup']);
    if (expired) { googleTicket = null; appleTicket = null; }
    return { login, signup: mount(signupFile) };
  }
  async function terms(owner, kind) {
    if (kind === 'email') {
      inputs(owner)[0].props.onChangeText('raw@example.test'); button(s, owner, '인증번호 받기').props.onPress(); await s.settle();
      inputs(owner)[1].props.onChangeText('123456'); button(s, owner, '인증하기').props.onPress(); await s.settle();
      inputs(owner)[2].props.onChangeText('Password123'); inputs(owner)[3].props.onChangeText('Password123'); button(s, owner, '다음').props.onPress();
    }
    inputs(owner)[0].props.onChangeText('tester'); await button(s, owner, '다음').props.onPress(); await s.settle();
    rows(owner)[0].props.onToggle(); rows(owner)[1].props.onToggle();
    button(s, owner, '[필수] 만 14세 이상입니다.').props.onPress();
  }
  const rows = owner => nodes(owner.tree).filter(node => node.type?.name === 'ConsentRow');
  function assertRetained() { assert.equal(root.routes[0], originalTabs); assert.deepEqual(profile.routes.map(route => route.name), ['index']); }
  function repeatTabs() {
    for (let i = 0; i < 3; i++) {
      let current = root.routes[0].state;
      current = tabRouter.getStateForAction(current, { type: 'NAVIGATE', payload: { name: 'index' } }, tabOptions);
      current = tabRouter.getStateForAction(current, { type: 'NAVIGATE', payload: { name: 'profile', params: { screen: 'index' } } }, tabOptions);
      const p = current.routes.find(route => route.name === 'profile');
      const next = profileRouter.getStateForAction(p.state, StackActions.popToTop(), profileOptions) ?? p.state;
      assert.deepEqual(next.routes.map(route => route.name), ['index']);
      root = { ...root, routes: [{ ...root.routes[0], state: current }] };
    }
    assert.deepEqual(root.routes.map(route => route.name), ['(tabs)']);
  }
  return { ...s, enter, terms, rows, router, events, api, guard, start, assertRetained, repeatTabs,
    get root() { return root; } };
}

for (const compiled of [false, true]) for (const kind of ['email', 'google', 'apple']) {
  test(`${compiled ? 'Compiler' : 'Hook'} ${kind}: Root signup cancellation removes auth routes; tab reselect never restores signup`, async () => {
    const s = await setup(compiled);
    try {
      const { login, signup } = await s.enter(kind);
      assert.equal(s.root.routes.at(-1).params.loginOrigin, 'profile');
      assert.equal(s.root.routes.at(-1).params.mode, kind === 'email' ? undefined : kind);
      s.assertRetained();
      button(s, signup, '뒤로가기').props.onPress();
      assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', 'login']);
      button(s, login, '뒤로가기').props.onPress(); s.assertRetained(); s.repeatTabs();
      assert.deepEqual(s.api, []);
    } finally { s.dispose(); }
  });
  test(`${compiled ? 'Compiler' : 'Hook'} ${kind}: native back keeps step order; completion hands off to the same Root login`, async () => {
    const s = await setup(compiled);
    try {
      const { login, signup } = await s.enter(kind), loginKey = s.root.routes[1].key;
      await s.terms(signup, kind);
      const consents = s.rows(signup).map(row => row.props.checked);
      s.router.push('/profile/policies/terms'); s.router.back(); signup.render();
      assert.deepEqual(s.rows(signup).map(row => row.props.checked), consents);
      s.router.back(); assert.equal(s.root.routes.at(-1).name, 'signup'); assert.equal(inputs(signup).length, 1);
      if (kind === 'email') { s.router.back(); assert.equal(s.root.routes.at(-1).name, 'signup'); button(s, signup, '다음').props.onPress(); }
      await button(s, signup, '다음').props.onPress(); await s.settle();
      button(s, signup, '가입하기').props.onPress(); await s.settle();
      assert.equal(s.root.routes.at(-1).name, 'login'); assert.equal(s.root.routes.at(-1).key, loginKey);
      assert.equal(s.root.routes.at(-1).params.loginOrigin, 'profile');
      login.render();
      if (kind === 'email') { assert.equal(s.root.routes.at(-1).name, 'login'); button(s, login, '뒤로가기').props.onPress(); }
      s.assertRetained(); s.repeatTabs();
      assert.equal(s.api.filter(call => Array.isArray(call) || call === kind).length, 1);
    } finally { s.dispose(); }
  });
}

for (const kind of ['email', 'google', 'apple']) test(`${kind}: first-step header and native back both reveal the original Root login`, async () => {
  for (const native of [false, true]) {
    const s = await setup();
    try {
      const { signup } = await s.enter(kind), previous = s.root.routes[1];
      if (native) s.router.back(); else button(s, signup, '뒤로가기').props.onPress();
      assert.equal(s.root.routes.at(-1), previous); s.assertRetained();
    } finally { s.dispose(); }
  }
});

for (const kind of ['google', 'apple']) test(`${kind}: an expired ticket returns to Root login and preserves origin/return intent`, async () => {
  for (const params of [{ loginOrigin: 'profile' }, { loginOrigin: 'profile', intent: 'resume', resumeKey: 'draft-original' },
    { loginOrigin: 'profile', intent: 'review', publicId: 'popup-original' }]) {
    const s = await setup();
    try {
      const { login } = await s.enter(kind, params, true);
      assert.equal(s.root.routes.at(-1).name, 'login');
      assert.equal(s.root.routes.length, 2);
      assert.deepEqual(s.root.routes.at(-1).params, params); s.assertRetained();
      assert.equal(s.api.length, 0);
      button(s, login, '뒤로가기').props.onPress(); s.repeatTabs();
    } finally { s.dispose(); }
  }
});

for (const kind of ['google', 'apple']) for (const writer of ['reviews/write', 'community/write']) {
  test(`${kind}: completion resumes the original ${writer} key even with a profile origin`, async () => {
    const s = await setup();
    try {
      s.router.push(`/${writer}`);
      const original = s.root.routes.at(-1);
      const { login, signup } = await s.enter(kind, { intent: 'resume', resumeKey: original.key, loginOrigin: 'profile' });
      assert.equal(s.root.routes.at(-1).params.resumeKey, original.key);
      await s.terms(signup, kind);
      button(s, signup, '가입하기').props.onPress(); await s.settle(); login.render();
      assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', writer]);
      assert.equal(s.root.routes.at(-1), original); s.assertRetained();
    } finally { s.dispose(); }
  });
}

test('Google completion from a popup replaces only Root login with its review writer', async () => {
  const s = await setup();
  try {
    s.router.push({ pathname: '/places/[id]', params: { id: 'popup-original' } });
    const popup = s.root.routes.at(-1);
    const { login, signup } = await s.enter('google', { intent: 'review', publicId: 'popup-original', loginOrigin: 'profile' });
    await s.terms(signup, 'google'); button(s, signup, '가입하기').props.onPress(); await s.settle(); login.render();
    assert.deepEqual(s.root.routes.map(route => route.name), ['(tabs)', 'places/[id]', 'reviews/write']);
    assert.equal(s.root.routes[1], popup); assert.equal(s.root.routes.at(-1).params.publicId, 'popup-original');
    s.assertRetained();
  } finally { s.dispose(); }
});
