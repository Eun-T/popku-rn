const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { getRoutes } = require('../node_modules/expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('../node_modules/expo-router/build/getReactNavigationConfig');
const { StackRouter, StackActions } = require('../node_modules/expo-router/build/react-navigation/routers/StackRouter');
const { findDivergentState, getPayloadFromStateRoute } = require('../node_modules/expo-router/build/global-state/stateUtils');

const moved = [
  'favorites', 'settings', 'language', 'reviews', 'posts', 'nickname', 'password', 'withdrawal',
  'notices/index', 'notices/[id]', 'inquiries/index', 'inquiries/[id]', 'inquiries/write',
];
function routeTree() {
  const keys = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.tsx')) keys.push(`./${file.slice('src/app/'.length)}`);
    }
  }
  walk('src/app');
  const context = () => ({ default: () => null });
  context.keys = () => keys;
  return getRoutes(context, { platform: 'ios', ignoreEntryPoints: true, ignoreRequireErrors: true });
}
const tree = routeTree();

test('all moved profile routes are direct Root Stack screens with unchanged URL patterns', () => {
  const config = getReactNavigationConfig(tree, true);
  const urls = [];
  function collect(node, segments = []) {
    for (const child of node.children) {
      const next = [...segments, child.route];
      if (child.children.length) collect(child, next);
      else urls.push(next.join('/').replace(/\([^/]+\)\/?/g, '').replace(/\/index$/, ''));
    }
  }
  collect(tree);
  for (const file of moved) {
    const name = `profile/${file}`;
    assert.equal(tree.children.filter(route => route.route === name).length, 1);
    const url = name.replace(/\/index$/, '');
    assert.equal(urls.filter(candidate => candidate === url).length, 1, `Duplicate URL: ${url}`);
    assert.equal(config.screens[name], url.replace('[id]', ':id'));
    assert.equal(fs.existsSync(`src/app/(tabs)/${name}.tsx`), false);
  }
  const profile = tree.children.find(route => route.route === '(tabs)').children.find(route => route.route === 'profile');
  assert.deepEqual(profile.children.map(route => route.route).sort(), ['index', 'login', 'signup']);
});

test('relative imports and assets in relocated screens resolve', () => {
  for (const route of moved) {
    const file = `src/app/profile/${route}.tsx`;
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteral(node) && node.text.startsWith('../')) {
        const target = path.resolve(path.dirname(file), node.text);
        assert.ok(['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'].some(extension => fs.existsSync(target + extension)), `${file}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});

function rootStack() {
  const router = StackRouter({ initialRouteName: '(tabs)' });
  const options = { routeNames: tree.children.map(route => route.route), routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const tabsState = { key: 'tabs', type: 'tab', index: 0, routes: [
    { key: 'profile-tab', name: 'profile', state: { key: 'profile', type: 'stack', index: 0, routes: [{ key: 'profile-main', name: 'index' }] } },
  ] };
  state.routes[0] = { ...state.routes[0], state: tabsState };
  return { router, options, tabsState, state };
}

test('Root push/back preserves the original Tabs key and nested profile state for all menu/detail flows', () => {
  const flows = [
    ['settings', 'language'], ['settings', 'nickname'], ['settings', 'password'], ['settings', 'withdrawal'],
    ['notices/index', 'notices/[id]'], ['inquiries/index', 'inquiries/[id]'], ['inquiries/index', 'inquiries/write'],
    ['reviews', '/reviews/[id]'], ['posts', '/community/[id]'], ['favorites', '/places/[id]'],
  ];
  for (const flow of flows) {
    const driver = rootStack();
    let state = driver.state;
    const tabsKey = state.routes[0].key;
    for (const route of flow) {
      const name = route.startsWith('/') ? route.slice(1) : `profile/${route}`;
      state = driver.router.getStateForAction(state, StackActions.push(name, { id: '1' }), driver.options);
      assert.equal(state.routes.at(-1).name, name);
      assert.equal(state.routes[0].key, tabsKey);
      assert.equal(state.routes[0].state, driver.tabsState);
    }
    for (const route of flow.toReversed()) state = driver.router.getStateForAction(state, StackActions.pop(), driver.options);
    assert.equal(state.routes.length, 1);
    assert.equal(state.routes[0].key, tabsKey);
    assert.equal(state.routes[0].state, driver.tabsState);
  }
});

test('dismissTo across Root/Tabs preserves the Tabs instance for logout and login redirection', () => {
  for (const destination of ['index', 'login']) {
    const driver = rootStack();
    let state = driver.router.getStateForAction(driver.state, StackActions.push('profile/settings'), driver.options);
    state = driver.router.getStateForAction(state, StackActions.push('profile/password'), driver.options);
    const targetState = { routes: [{ name: '(tabs)', state: { routes: [{ name: 'profile', state: { routes: [{ name: destination }] } }] } }] };
    const divergence = findDivergentState(targetState, state);
    assert.equal(divergence.navigationState.key, state.key);
    const payload = getPayloadFromStateRoute(divergence.actionStateRoute);
    const next = driver.router.getStateForAction(state, { ...StackActions.popTo(payload.screen, payload.params), target: state.key }, driver.options);
    assert.equal(next.routes.length, 1);
    assert.equal(next.routes[0].key, driver.state.routes[0].key);
    assert.equal(next.routes[0].state, driver.tabsState);
    assert.equal(next.routes[0].params.screen, 'profile');
    assert.equal(next.routes[0].params.params.screen, destination);
  }
  for (const file of ['favorites', 'reviews']) {
    const source = fs.readFileSync(`src/app/profile/${file}.tsx`, 'utf8');
    assert.match(source, /router\.dismissTo\('\/profile\/login'\)/);
    assert.doesNotMatch(source, /router\.replace\('\/profile\/login'\)/);
  }
  assert.match(fs.readFileSync('src/app/profile/settings.tsx', 'utf8'), /router\.dismissTo\("\/profile\/login"\)/);
});

test('FloatingTabBar keeps auth hiding while favorites uses Root Stack coverage', () => {
  const file = 'src/components/navigation/FloatingTabBar.tsx';
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let condition;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast).includes('pathname ===')) condition = node.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(condition);
  const hidden = new Function('pathname', `return ${condition};`);
  assert.equal(hidden('/profile/login'), true);
  assert.equal(hidden('/profile/signup'), true);
  for (const route of ['/profile', '/profile/favorites', '/profile/settings']) assert.equal(hidden(route), false);
});
