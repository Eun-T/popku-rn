const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports,
  );
  return module.exports.default;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function visibleText(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(visibleText).join('');
  return tree?.props ? visibleText(tree.props.children) : '';
}

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx };
const native = {
  ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable',
  ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  StyleSheet: { create: (styles) => styles },
};
const theme = { colors: {}, radius: {}, spacing: {}, typography: {} };

test('logged in profile opens favorites', () => {
  const navigation = [];
  const Profile = load('src/app/(tabs)/profile/index.tsx', {
    'react': { useCallback: (callback) => callback, useState: () => [false, () => {}],
      useSyncExternalStore: () => ({ nickname: '사용자', email: 'user@example.com' }) },
    'react/jsx-runtime': runtime,
    'expo-router': { useFocusEffect() {}, useRouter: () => ({ push: (route) => navigation.push(route) }) },
    'lucide-react-native': { Heart: 'Heart', Star: 'Star' },
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../lib/auth': {}, '../../../theme/tokens': theme,
  });
  const tree = Profile();
  assert.match(visibleText(tree), /내 활동/);
  nodes(tree).find((node) => node.props?.accessibilityLabel === '찜한 팝업 보기').props.onPress();
  assert.deepEqual(navigation, ['/profile/favorites']);
});

function favorites(initialPopups, status = 'ready') {
  const navigation = [];
  const state = [status, 0];
  const FavoritePopups = load('src/app/(tabs)/profile/favorites.tsx', {
    '../../../hooks/usePopupNavigation': { usePopupNavigation: () => (id) => navigation.push({ pathname: '/places/[id]', params: { id } }) },
    'react': { useCallback: (callback) => callback, useState: (initial) => [state.shift() ?? initial, () => {}],
      useSyncExternalStore: () => initialPopups },
    'react/jsx-runtime': runtime,
    'expo-router': { useFocusEffect() {}, useRouter: () => ({ canGoBack: () => true,
      back: () => navigation.push('back'), push: (route) => navigation.push(route),
      replace: (route) => navigation.push(route) }) },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', Heart: 'Heart' },
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../lib/auth': { clearTokens: async () => {} },
    '../../../lib/favorites': { getFavoritePopups: async () => initialPopups, FavoriteUnauthorizedError: class extends Error {} },
    '../../../lib/favoriteCache': { getFavoriteCache: () => initialPopups, subscribeFavoriteCache: () => () => {} },
    '../../../theme/tokens': theme,
    '../../../../assets/images/ranking-placeholder.png': 'placeholder',
  });
  return { tree: FavoritePopups(), navigation };
}

test('server popup fields render with a real publicId route and filled heart', () => {
  const popup = { publicId: 'public-1', name: '서버 팝업', coverImageUrl: 'https://example.com/image',
    startDate: '2026-10-01', endDate: '2026-10-15', tags: [{ id: 1, name: '애니' }] };
  const { tree, navigation } = favorites([popup]);
  assert.match(visibleText(tree), /서버 팝업/);
  assert.match(visibleText(tree), /2026\.10\.01 - 10\.15/);
  assert.match(visibleText(tree), /애니/);
  assert.equal(nodes(tree).find((node) => node.type === 'Image').props.source.uri, popup.coverImageUrl);
  assert.equal(nodes(tree).filter((node) => node.props?.accessibilityLabel === '찜됨').length, 1);
  nodes(tree).find((node) => node.props?.accessibilityLabel === '서버 팝업 상세 보기').props.onPress();
  assert.deepEqual(navigation, [{ pathname: '/places/[id]', params: { id: 'public-1' } }]);
});

test('favorite dates render safely when either or both dates are missing', () => {
  const cases = [
    { startDate: null, endDate: null, expected: '일정 미정' },
    { startDate: undefined, endDate: undefined, expected: '일정 미정' },
    { startDate: '2026-10-01', endDate: null, expected: '2026.10.01' },
    { startDate: '2026-10-01', endDate: undefined, expected: '2026.10.01' },
    { startDate: null, endDate: '2026-10-15', expected: '2026.10.15' },
    { startDate: undefined, endDate: '2026-10-15', expected: '2026.10.15' },
  ];
  for (const { startDate, endDate, expected } of cases) {
    const popup = { publicId: 'dated-popup', name: '날짜 확인', coverImageUrl: null,
      startDate, endDate, tags: [] };
    const { tree } = favorites([popup]);
    const period = nodes(tree).find((node) => node.type === 'Text' && node.props?.numberOfLines === 1);
    assert.equal(visibleText(period), expected);
  }
});

test('empty server list shows empty state and no mock cards', () => {
  const { tree } = favorites([]);
  assert.match(visibleText(tree), /아직 찜한 팝업이 없어요/);
  assert.equal(nodes(tree).filter((node) => node.type === 'Image').length, 0);
});

test('loading and API error do not show an empty favorites claim', () => {
  assert.equal(nodes(favorites(null, 'loading').tree).filter((node) => node.type === 'ActivityIndicator').length, 1);
  assert.match(visibleText(favorites(null, 'error').tree), /찜한 팝업을 불러오지 못했어요/);
});

test('cached rows stay visible while the list revalidates or a refresh fails', () => {
  const popup = { publicId: 'cached', name: '캐시된 팝업', coverImageUrl: null,
    startDate: '2026-10-01', endDate: '2026-10-15', tags: [] };
  assert.match(visibleText(favorites([popup], 'loading').tree), /캐시된 팝업/);
  assert.match(visibleText(favorites([popup], 'error').tree), /캐시된 팝업/);
});
