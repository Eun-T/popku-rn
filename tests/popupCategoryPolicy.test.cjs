const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    assert.ok(name in mocks, `Missing mock ${name}`); return mocks[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const names = ['캐릭터/IP', '게임/디지털', '연예/크리에이터', '패션', '뷰티', 'F&B', '아트/전시', '문구/소품', '라이프', '패밀리/펫', '기타'];
const options = names.map((name, index) => ({ id: index + 1, name }));
const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const theme = load('src/theme/tokens.ts');
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
  StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844 }),
  Animated: { Value: class {}, View: 'AnimatedView' }, PanResponder: { create: () => ({ panHandlers: {} }) } };
const hooks = { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useMemo: fn => fn(),
  useCallback: fn => fn, useEffect() {} };
const base = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '../../theme/tokens': theme };

test('Place category options retain IDs and multiple selected filters; queries preserve OR filter IDs', async () => {
  const calls = [];
  const filters = load('src/lib/filterOptions.ts', { '../constants/api': { API_BASE_URL: 'https://test' } }, {
    fetch: async url => { calls.push(url); return { ok: true, json: async () => options }; },
  });
  assert.deepEqual(await filters.getTags(), options);
  const { default: Sheet } = load('src/components/place/PlaceFilterSheet.tsx', {
    ...base, '../common/MoreButton': { default: 'Button' },
    './RegionFilterGroup': { default: 'RegionFilterGroup' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../constants/placeFilters': { ...load('src/constants/placeFilters.ts'), operationStatusFilters: [{ labelKey: 'ongoing' }, { labelKey: 'upcoming' }, { labelKey: 'ended' }] },
    '../../locales': { t: key => key },
  });
  const toggled = [];
  const tree = Sheet({ visible: true, filters: { regionIds: [], tagIds: [1, 2] }, quickFilters: { countries: [], quickFeatures: [] }, tags: options, regions: [],
    optionsStatus: 'ready', onToggleTag: id => toggled.push(id) });
  const group = nodes(tree).find(n => typeof n.type === 'function' && n.props.options?.length === options.length);
  assert.ok(group);
  assert.deepEqual(group.props.options, options, 'Korean display copies preserve every original ID/name');
  const chips = nodes(group.type(group.props)).filter(n => n.type === 'Pressable');
  assert.deepEqual(chips.map(n => n.props.children.props.children), names);
  assert.deepEqual(chips.filter(n => n.props.accessibilityState.selected).map(n => n.props.children.props.children), names.slice(0, 2));
  chips[2].props.onPress(); assert.deepEqual(toggled, [3]);
  const popups = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'https://test' },
    '../locales': { getLocale: () => 'ko' } }, { fetch: async url => {
      calls.push(url); return { ok: true, json: async () => ({ popups: [] }) };
    } });
  await popups.getPopups('KR', new AbortController().signal, { tagIds: [1, 2] });
  assert.equal(calls.at(-1), 'https://test/api/popups?countryCode=KR&tagIds=1,2');
});

test('Home cards receive one renamed category with existing region and navigation/favorite handlers', () => {
  const popup = { publicId: 'popup', name: 'Pop', regionName: '용산', tags: [options[0]], coverImageUrl: null,
    startDate: '2026-10-02', endDate: '2026-10-11' };
  const opened = [], favorites = [];
  const common = { ...base, '../../hooks/useHomePopups': { useHomePopups: () => ({ status: 'ready', popups: [popup] }) },
    'lucide-react-native': { Store: 'Store' },
    'expo-router': { useRouter: () => ({ push() { throw new Error('Card presses must use onPressPopup'); } }) },
    '../../lib/popups': { currentWeekRange: () => { throw new Error('Card presses must not navigate through more'); } },
    '../../lib/popupStatus': { popupOperatingStatus: (start, end) => load('src/lib/popupStatus.ts').popupOperatingStatus(start, end, new Date(2026, 9, 8)) },
    '../common/FilterChips': { default: 'Chips' }, '../common/MoreButton': { default: 'Button' },
    '../../../assets/images/ranking-placeholder.png': 'poster',
    './HomePopupSkeleton': { HomeNewPopupSkeleton: 'Skeleton', HomeTrendingSkeleton: 'Skeleton', RankingSkeletonFooter: 'Footer' },
    '../../hooks/usePopupFavorites': { usePopupFavorites: () => ({ isFavorite: () => true,
      isFavoriteDisabled: () => false, toggleFavorite: item => favorites.push(item) }) } };
  for (const [file, cardName, dependency] of [
    ['HomeNewPopupSection', 'NewCard', './NewPopupCard'], ['HomeTrendingSection', 'RankingCard', './PopupRankingCard'],
  ]) {
    const Section = load(`src/components/home/${file}.tsx`, { ...common, [dependency]: { default: cardName } }).default;
    const card = nodes(Section({ onPressPopup: id => opened.push(id) })).find(n => n.type === cardName);
    assert.deepEqual(card.props.tags, ['용산', '캐릭터/IP']);
    card.props.onPress();
    if (file === 'HomeTrendingSection') { assert.equal(card.props.isFavorite, true); card.props.onToggleFavorite(); }
  }
  assert.deepEqual(opened, ['popup', 'popup']);
  assert.deepEqual(favorites, [popup]);
});
