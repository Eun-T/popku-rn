const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const { withUiDependencies } = require('./uiDependencies.cjs');
const { nodes } = require('./uiTree.cjs');

// Prehydrated profile only: render the real MenuRow to inspect enabled actions and routes.
function profileMenu(user) {
  const routes = [];
  const file = 'src/app/(tabs)/profile/index.tsx';
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = withUiDependencies(file, {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }),
      useCallback: fn => fn, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useFocusEffect() {}, useRouter: () => ({ push: route => routes.push(route) }) },
    'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' },
    'lucide-react-native': Object.fromEntries(['ChevronRight', 'Heart', 'Star', 'MessageSquare', 'Settings'].map(name => [name, name])),
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Text: 'Text', View: 'View', StyleSheet: { create: style => style } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../lib/auth': { getAuthUser: () => user, subscribeAuthUser: () => () => {} },
  });
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in mocks, `Missing profile mock ${name}`); return mocks[name];
  }, module, module.exports);
  const tree = module.exports.default();
  const rendered = nodes(tree).flatMap(node => node.type?.name === 'MenuRow' ? nodes(node.type(node.props)) : [node]);
  return { routes, tree, find: label => rendered.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label) };
}

module.exports = { profileMenu };
