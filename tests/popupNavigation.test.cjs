const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { StackRouter, StackActions } = require('../node_modules/expo-router/build/react-navigation/routers/StackRouter');

const source = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  const result = [];
  function visit(n) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); }
  visit(node); return result;
}
function evaluate(code, scope) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
}

// Same focus/blur and persistent-hook model as communityFeed.test.cjs.
// Execute the production hook and JSX callbacks, replacing only navigation/native I/O.
function screen() {
  const slots = []; let index = 0, focused = true, effect, fail = false;
  const reducer = StackRouter({ initialRouteName: 'origin' });
  const options = { routeNames: ['origin', '/places/[id]'], routeParamList: {}, routeGetIdList: {} };
  let state = reducer.getInitialState(options);
  const stack = () => state.routes.map((route) => route.name === 'origin' ? 'origin' : { pathname: route.name, params: route.params });
  const react = {
    useRef(value) { return slots[index++] ??= { current: value }; },
    useCallback(fn, deps) {
      const i = index++, previous = slots[i];
      if (!previous || !deps.every((v, n) => Object.is(v, previous.deps[n]))) slots[i] = { fn, deps };
      return slots[i].fn;
    },
  };
  const router = { push(route) {
    if (fail) throw new Error('push failed');
    state = reducer.getStateForAction(state, StackActions.push(route.pathname, route.params), options);
  } };
  const module = { exports: {} };
  evaluate(readFileSync('src/hooks/usePopupNavigation.ts', 'utf8'), {
    module, exports: module.exports, require(name) {
      if (name === 'react') return react;
      assert.equal(name, 'expo-router');
      return { useRouter: () => ({ ...router }), useFocusEffect(fn) {
        if (effect !== fn) { effect = fn; if (focused) fn(); }
      } };
    },
  });
  return {
    get stack() { return stack(); },
    render() { index = 0; return module.exports.usePopupNavigation(); },
    back() {
      focused = false; assert.equal(state.routes.length, 2);
      state = reducer.getStateForAction(state, StackActions.pop(1), options);
      assert.deepEqual(stack(), ['origin'], 'one real reducer POP returns to the origin');
      focused = true; effect();
    },
    fail(value) { fail = value; },
  };
}

const entries = [
  ['home trending', 'src/components/home/HomeTrendingSection.tsx', 'onPressPopup', 1],
  ['home new', 'src/components/home/HomeNewPopupSection.tsx', 'onPressPopup', 1],
  ['places weekly and grid', 'src/screens/PlaceScreen.tsx', 'openPopup', 3],
  ['map list and preview', 'src/screens/MapScreen.native.tsx', 'openPopup', 2],
  ['favorites', 'src/app/profile/favorites.tsx', 'openPopup', 1],
];
function callbacks(file, callee, open, id) {
  const ast = source(file);
  return find(ast, (n) => ts.isArrowFunction(n) && find(n.body, (c) => ts.isCallExpression(c) && c.expression.getText(ast) === callee).length > 0
    && !ts.isBlock(n.body) && !ts.isJsxElement(n.body) && !ts.isParenthesizedExpression(n.body))
    .map((n) => evaluate(`return (${n.getText(ast)});`, { [callee]: open, popup: { publicId: id }, previewPopup: { id } }));
}
for (const [name, file, callee, count] of entries) test(`${name}: rapid taps, different IDs, rerender, back/focus and push exception`, () => {
  const driver = screen(); let open = driver.render();
  const press = (id) => callbacks(file, callee, open, id);
  assert.equal(press('a').length, count, 'all actual JSX detail callbacks covered');
  const invoke = (fn, id) => fn(file.includes('MapScreen') ? id : { publicId: id });
  for (let entry = 0; entry < count; entry++) {
    invoke(press('a')[entry], 'a');
    for (let i = 0; i < 10; i++) for (const fn of press('b')) invoke(fn, 'b');
    open = driver.render();
    for (const fn of press('b')) invoke(fn, 'b');
    assert.deepEqual(driver.stack, ['origin', { pathname: '/places/[id]', params: { id: 'a' } }]);
    driver.back(); open = driver.render();
    invoke(press('b')[entry], 'b');
    assert.equal(driver.stack[1].params.id, 'b');
    driver.back(); open = driver.render();
    driver.fail(true);
    assert.throws(() => invoke(press('c')[entry], 'c'), /push failed/);
    driver.fail(false); invoke(press('c')[entry], 'c');
    assert.equal(driver.stack[1].params.id, 'c'); driver.back(); open = driver.render();
  }
});

test('home shares one screen lock across both sections; independent screens do not share it', () => {
  const ast = source('src/screens/HomeScreen.tsx');
  const sections = find(ast, (n) => ts.isJsxSelfClosingElement(n) && ['HomeTrendingSection', 'HomeNewPopupSection'].includes(n.tagName.getText(ast)));
  assert.equal(sections.length, 2);
  for (const section of sections) assert.equal(section.attributes.properties.find((p) => p.name?.text === 'onPressPopup').initializer.expression.getText(ast), 'openPopup');
  assert.equal(find(ast, (n) => ts.isCallExpression(n) && n.expression.getText(ast) === 'usePopupNavigation').length, 1);
  const home = screen(), other = screen(); const open = home.render();
  callbacks(entries[0][1], 'onPressPopup', open, 'a')[0]();
  callbacks(entries[1][1], 'onPressPopup', home.render(), 'b')[0]();
  assert.equal(home.stack.length, 2);
  other.render()('c'); assert.equal(other.stack.length, 2);
});
