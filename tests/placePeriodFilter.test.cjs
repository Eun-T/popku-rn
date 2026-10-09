const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(file, mocks = {}, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  globals = { __DEV__: false, ...globals };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const theme = load('src/theme/tokens.ts');
const filters = load('src/constants/placeFilters.ts');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.ListHeaderComponent)];

test('interactive chips share primary-text selection colors and custom stays disabled', () => {
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
    StyleSheet: { create: s => s }, useWindowDimensions: () => ({ height: 844 }),
    Animated: { Value: class {}, View: 'AnimatedView' }, PanResponder: { create: () => ({ panHandlers: {} }) } };
  const mocks = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '../../theme/tokens': theme,
    '../../constants/placeFilters': filters, '../../locales': { t: key => key },
    'lucide-react-native': { ChevronDown: 'ChevronDown' }, '../common/MoreButton': { default: 'Button' },
    react: { useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn,
      useState: value => [value, () => {}], useEffect() {} },
    './RegionFilterGroup': { default: 'RegionFilterGroup' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) } };
  const Common = load('src/components/common/FilterChips.tsx', mocks).default;
  const Quick = load('src/components/place/QuickFilterBar.tsx', mocks).default;
  const Sheet = load('src/components/place/PlaceFilterSheet.tsx', mocks).default;
  const sheet = Sheet({ visible: true, filters: { regionIds: [1], tagIds: [], status: undefined }, quickFilters: filters.createEmptyPlaceFilters(), period: 'week',
    regions: [{ id: 1, name: 'Seoul', countryCode: 'KR' }, { id: 2, name: 'Tokyo', countryCode: 'JP' }],
    tags: [], optionsStatus: 'ready', onPeriodChange() {} });
  const group = nodes(sheet).find(n => typeof n.type === 'function' && n.props.options[0]?.id === 2);
  const trees = [Common({ options: [{ value: 'KR', label: 'KR' }, { value: 'JP', label: 'JP' }], value: 'KR', onChange() {} }),
    Quick({ selectedFilters: { countries: ['KR'], quickFeatures: ['preReservation'] }, onToggleCountry() {}, onToggleFeature() {} }),
    group.type(group.props), sheet];
  assert.deepEqual(filters.quickFilters.map(option=>option.id),['KR','JP','preReservation','benefit']);
  const quickChips=nodes(trees[1]).find(n=>n.type==='ScrollView').props.children;
  assert.deepEqual(quickChips.map(chip=>chip.props.children.props.children),[
    'place.filters.countries.kr','place.filters.countries.jp',
    'place.filters.quick.preReservation','place.filters.quick.benefit',
  ]);
  const sheetQuickGroup=nodes(sheet).find(n=>n.props?.options?.[0]?.id==='KR');
  assert.deepEqual(sheetQuickGroup.props.options.map(option=>option.id),['KR','JP','preReservation','benefit']);
  for (const tree of trees) {
    for (const chip of nodes(tree).filter(n => n.type === 'Pressable' && n.props.accessibilityState && !n.props.disabled)) {
      const selected = chip.props.accessibilityState.selected;
      const style = Object.assign({}, ...[chip.props.style].flat().filter(Boolean));
      const text = Object.assign({}, ...[chip.props.children.props.style].flat().filter(Boolean));
      assert.equal(style.backgroundColor, selected ? '#111827' : '#FFFFFF');
      assert.equal(style.borderColor, selected ? '#111827' : '#E5E7EB');
      assert.equal(text.color, selected ? '#FFFFFF' : '#111827');
    }
  }
  const custom = nodes(sheet).find(n => n.type === 'Pressable' && n.props.disabled);
  assert.equal(custom.props.accessibilityState.disabled, true);
  assert.equal(theme.colors.primary, '#22C55E');
  assert.equal(theme.colors.inactiveText, '#9CA3AF');
  assert.equal(theme.colors.inactiveTabText, '#B8BEC8');
});

test('period query composes with existing IDs/status and all keeps the original request', async () => {
  const calls = [];
  const api = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'https://test' },
    '../locales': { getLocale: () => 'ko' } }, { fetch: async (url, options) => {
      calls.push([url, options]); return { ok: true, json: async () => ({ popups: [] }) };
    } });
  const signal = new AbortController().signal;
  for (const visitPeriod of ['today', 'week', 'weekend']) {
    await api.getPopups('JP', signal, { regionIds: [1, 2], tagIds: [3, 4], status: 'UPCOMING', visitPeriod });
    assert.equal(calls.at(-1)[0], `https://test/api/popups?countryCode=JP&regionIds=1,2&tagIds=3,4&status=UPCOMING&visitPeriod=${visitPeriod}`);
    assert.equal(calls.at(-1)[1].signal, signal);
  }
  await api.getPopups(undefined, signal, { visitPeriod: 'all' });
  assert.equal(calls.at(-1)[0], 'https://test/api/popups');
});

test('active bar keeps reset/details fixed around a horizontal neutral result list and removes exact IDs', () => {
  const removed = []; let resets = 0, opens = 0;
  const Bar = load('src/components/place/AppliedFilterBar.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react-native': { X: 'X', ChevronDown: 'ChevronDown', RotateCcw: 'RotateCcw' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: s => s } },
    '../../theme/tokens': theme, '../../constants/placeFilters': filters,
    '../../locales': { t: (key, params) => params?.label ?? key },
  }).default;
  const tree = Bar({ filters: { ...filters.createEmptyPlaceFilters(), countries: ['KR'], quickFeatures: ['preReservation'] },
    detailFilters: { regionIds: [2], tagIds: [3], status: 'UPCOMING' }, period: 'week',
    regions: [{ id: 2, name: 'Region' }], tags: [{ id: 3, name: 'Category' }],
    onRemove: (group, id) => removed.push([group, id]), onReset: () => resets++, onOpenDetails: () => opens++ });
  const [reset, separator, scroll, details] = tree.props.children;
  assert.equal(tree.props.style.columnGap, undefined);
  assert.equal(separator.props.style.marginHorizontal, 6);
  assert.equal(details.props.style.marginLeft, 8);
  assert.equal(reset.type, 'Pressable');
  assert.equal(reset.props.style.height, 36);
  assert.equal(reset.props.style.paddingLeft, 8);
  assert.equal(reset.props.style.paddingHorizontal, undefined);
  assert.equal(reset.props.style.paddingRight, undefined);
  assert.equal(reset.props.hitSlop.right, 8);
  assert.equal(reset.props.style.backgroundColor, undefined);
  assert.equal(reset.props.style.borderWidth, undefined);
  assert.equal(reset.props.style.columnGap, 4);
  assert.equal(reset.props.children[0].type, 'RotateCcw');
  assert.equal(reset.props.children[0].props.size, 14);
  assert.equal(reset.props.children[0].props.strokeWidth, 2.5);
  assert.equal(reset.props.children[0].props.color, '#6B7280');
  assert.equal(reset.props.children[1].props.style.color, '#6B7280');
  assert.equal(reset.props.children[1].props.style.fontSize, 13);
  assert.equal(reset.props.children[1].props.style.fontWeight, '600');
  assert.equal(separator.props.children, '·');
  assert.equal(separator.props.style.color, '#D1D5DB');
  assert.equal(separator.props.accessible, false);
  assert.equal(scroll.type, 'ScrollView'); assert.equal(scroll.props.horizontal, true);
  assert.equal(scroll.props.style.flex, 1);
  for (const chip of scroll.props.children) {
    assert.equal(chip.props.style.backgroundColor, '#F0FDF4');
    assert.equal(chip.props.style.height, 36);
    assert.equal(chip.props.children[0].props.style.borderColor, '#BBF7D0');
    assert.equal(chip.props.children[0].props.style.borderWidth, 1);
    assert.equal(chip.props.children[1].props.style.color, '#15803D');
    assert.equal(chip.props.children[2].props.children.props.color, '#6B7280');
    chip.props.children[2].props.onPress();
  }
  assert.deepEqual(removed, [['countries', 'KR'], ['quickFeatures', 'preReservation'], ['regionIds', 2], ['tagIds', 3], ['status', 'upcoming'], ['period', 'week']]);
  reset.props.onPress(); details.props.children[1].props.onPress();
  assert.equal(resets, 1); assert.equal(opens, 1);
});

test('Sheet period draft applies, reopens, cancels, resets and removes with search/other filters preserved', async () => {
  let cursor = 0, dirty = false, tree;
  const slots = [], pending = [], requests = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(fn, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || !deps.every((value, i) => Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useScrollToTop() {}, useLocalSearchParams: () => ({}) },
    'lucide-react-native': { Bell: 'Bell', Search: 'Search', X: 'X' },
    'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../theme/tokens': theme, '../constants/placeFilters': filters,
    '../constants/placeRegionMocks': { placeRegionPages: [] }, '../locales': require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'),
    '../hooks/usePopupNavigation': { usePopupNavigation: () => () => {} },
    '../hooks/usePopupFavorites': { usePopupFavorites: () => ({ isFavorite() {}, isFavoriteDisabled() {}, toggleFavorite() {} }) },
    '../lib/filterOptions': { getRegions: async () => [], getTags: async () => [{ id: 3, name: 'Category' }] },
    '../lib/popups': { emptyPopupFilters: () => ({ regionIds: [], tagIds: [], status: undefined }),
      getPopupPage: async (country, signal, detail) => { requests.push({ country, signal, ...detail }); return { popups: [], nextCursor: null }; },
      getEndingSoonPopups: async () => [] },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 12, FLOATING_TAB_BAR_HEIGHT: 60 },
  };
  for (const name of ['AppliedFilterBar', 'PlaceFilterSheet', 'PopupGridCard', 'PopupGridSkeleton', 'QuickFilterBar',
    'PlaceRegionSection', 'PlaceInterestSection', 'PlaceWeeklySection', 'TodayOpeningCarousel']) {
    mocks[`../components/place/${name}`] = { default: name };
  }
  mocks['../lib/placeCoverRecovery']=load('src/lib/placeCoverRecovery.ts');
  const Screen = load('src/screens/PlaceScreen.tsx', mocks, { setInterval: () => 1, clearInterval() {} }).default;
  function render() {
    let count = 0;
    do { assert.ok(count++ < 20); dirty = false; cursor = 0; tree = Screen(); pending.splice(0).forEach(fn => fn()); } while (dirty);
  }
  async function settle() { for (let i = 0; i < 5; i++) { await Promise.resolve(); render(); } }
  const find = type => nodes(tree).find(n => n.type === type);
  const filterBar = () => find('AppliedFilterBar') ?? find('QuickFilterBar');
  render(); await settle();
  const input = find('TextInput');
  assert.equal(input.props.placeholderTextColor, '#9CA3AF');
  assert.equal(input.props.style.color, '#111827');
  assert.equal(input.props.style.includeFontPadding, false);
  assert.equal(input.props.style.textAlignVertical, 'center');
  assert.equal(input.props.style.lineHeight, undefined);
  const searchRow = nodes(tree).find(n => n.type === 'View' && n.props.children?.[0]?.type === 'Search');
  assert.equal(searchRow.props.style.flexDirection, 'row');
  assert.equal(searchRow.props.style.alignItems, 'center');
  assert.equal(searchRow.props.children[0].props.size, 20);
  assert.equal(searchRow.props.children[0].props.color, '#9CA3AF');
  nodes(tree).find(n => n.type === 'Pressable' && n.props.children?.props.children === '전체').props.onPress(); render();
  find('TextInput').props.onChangeText('popup'); render();
  assert.ok(find('QuickFilterBar'), JSON.stringify(nodes(tree).map(n => [n.type, n.props?.children?.props?.children])));
  find('QuickFilterBar').props.onOpenDetails(); render();
  find('PlaceFilterSheet').props.onPeriodChange('weekend');
  find('PlaceFilterSheet').props.onToggleTag(3); render();
  const before = requests.length;
  assert.equal(find('AppliedFilterBar'), undefined);
  assert.ok(find('QuickFilterBar'));
  find('PlaceFilterSheet').props.onApply(); render(); await settle();
  assert.equal(requests.length, before + 1);
  assert.equal(requests.at(-1).visitPeriod, 'weekend'); assert.deepEqual(requests.at(-1).tagIds, [3]);
  assert.equal(find('TextInput').props.value, 'popup');
  assert.equal(find('FlatList').props.numColumns, 2);
  assert.equal(find('QuickFilterBar'), undefined);
  filterBar().props.onOpenDetails(); render();
  assert.equal(find('PlaceFilterSheet').props.period, 'weekend');
  find('PlaceFilterSheet').props.onPeriodChange('today'); render();
  find('PlaceFilterSheet').props.onClose(); render();
  filterBar().props.onOpenDetails(); render();
  assert.equal(find('PlaceFilterSheet').props.period, 'weekend');
  find('PlaceFilterSheet').props.onReset(); render();
  assert.equal(find('PlaceFilterSheet').props.period, 'all');
  assert.equal(find('AppliedFilterBar').props.period, 'weekend');
  find('PlaceFilterSheet').props.onApply(); render(); await settle();
  assert.equal(requests.at(-1).visitPeriod, 'all'); assert.deepEqual(requests.at(-1).tagIds, []);
  find('QuickFilterBar').props.onOpenDetails(); render();
  find('PlaceFilterSheet').props.onPeriodChange('week'); render();
  find('PlaceFilterSheet').props.onApply(); render(); await settle();
  find('AppliedFilterBar').props.onRemove('period', 'week'); render(); await settle();
  assert.equal(requests.at(-1).visitPeriod, 'all');
  assert.ok(find('QuickFilterBar'));
  assert.equal(find('AppliedFilterBar'), undefined);
  find('QuickFilterBar').props.onToggleCountry('KR'); render(); await settle();
  assert.equal(find('QuickFilterBar'), undefined);
  assert.deepEqual(find('AppliedFilterBar').props.filters.countries, ['KR']);
  filterBar().props.onOpenDetails(); render();
  find('PlaceFilterSheet').props.onToggleFeature('preReservation'); render();
  assert.deepEqual(find('AppliedFilterBar').props.filters.quickFeatures, []);
  find('PlaceFilterSheet').props.onToggleTag(3);
  find('PlaceFilterSheet').props.onPeriodChange('week'); render();
  find('PlaceFilterSheet').props.onApply(); render(); await settle();
  assert.equal(requests.at(-1).country, 'KR');
  assert.deepEqual(find('AppliedFilterBar').props.filters.quickFeatures, ['preReservation']);
  assert.deepEqual(requests.at(-1).tagIds, [3]);
  assert.equal(requests.at(-1).visitPeriod, 'week');
  find('AppliedFilterBar').props.onRemove('countries', 'KR'); render(); await settle();
  assert.equal(requests.at(-1).country, undefined);
  assert.deepEqual(requests.at(-1).tagIds, [3]);
  assert.equal(requests.at(-1).visitPeriod, 'week');
  assert.deepEqual(find('AppliedFilterBar').props.filters.quickFeatures, ['preReservation']);
  find('AppliedFilterBar').props.onReset(); render(); await settle();
  assert.equal(requests.at(-1).country, undefined);
  assert.deepEqual(requests.at(-1).tagIds, []);
  assert.equal(requests.at(-1).visitPeriod, 'all');
  assert.equal(find('AppliedFilterBar'), undefined);
  assert.ok(find('QuickFilterBar'));
  find('QuickFilterBar').props.onToggleFeature('preReservation'); render();
  assert.deepEqual(find('AppliedFilterBar').props.filters.quickFeatures, ['preReservation']);
  find('AppliedFilterBar').props.onRemove('quickFeatures', 'preReservation'); render();
  assert.ok(find('QuickFilterBar'));
  find('QuickFilterBar').props.onOpenDetails(); render();
  find('PlaceFilterSheet').props.onToggleCountry('JP');
  find('PlaceFilterSheet').props.onToggleFeature('benefit'); render();
  find('PlaceFilterSheet').props.onClose(); render();
  assert.ok(find('QuickFilterBar'));
  find('QuickFilterBar').props.onOpenDetails(); render();
  assert.deepEqual(find('PlaceFilterSheet').props.quickFilters.countries, []);
  assert.deepEqual(find('PlaceFilterSheet').props.quickFilters.quickFeatures, []);
  slots.forEach(slot => slot?.cleanup?.());
});
