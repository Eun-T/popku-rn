const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { runtime, nodes, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const { inspectI18nUi } = require('./helpers/i18nUiGuard.cjs');

const shortcutFile = 'src/components/home/HomeCategoryShortcuts.tsx';
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const cases = [
  ['all', undefined, []], ['korea', 'KR', []], ['japan', 'JP', []],
  ['fashion', undefined, [4]], ['beauty', undefined, [5]], ['fnb', undefined, [6]],
];

// Production shortcut, filters, metadata cache and PlaceScreen. Native layout and
// the router are mocked: this checks state/query behavior, not device gestures.
async function app(t, initialEntry = {}) {
  let entry = initialEntry, place;
  const routes = [], pages = [], metadata = [], endings = [], gates = [];
  const ui = runtime({
    'src/components/home/HomeVenueSection.tsx': { __esModule: true, default: 'HomeVenueSection' },
    'react-native': { ...Object.fromEntries(['FlatList', 'ScrollView', 'Pressable', 'Text', 'TextInput', 'View', 'Image'].map(n => [n, n])),
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390 }) },
    'expo-router': { useLocalSearchParams: () => entry, useScrollToTop() {}, useFocusEffect() {},
      useRouter: () => ({ navigate(route) {
        routes.push(route); entry = { ...entry, ...route.params }; place?.render();
      } }) },
    'lucide-react-native': { Store: 'Store', Bell: 'Bell', Search: 'Search', X: 'X' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'src/theme/useTheme.ts': { useTheme: () => ({ themeColors: { surface: '#F8FAFC', textPrimary: '#111827', textSecondary: '#6B7280' } }) },
    'src/constants/api.ts': { API_BASE_URL: 'https://test' },
    'src/hooks/usePopupNavigation.ts': { usePopupNavigation: () => () => {} },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({ isFavorite() {}, isFavoriteDisabled() {}, toggleFavorite() {} }) },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    'src/lib/popups.ts': {
      emptyPopupFilters: () => ({ regionIds: [], tagIds: [], status: undefined }),
      getEndingSoonPopups: async country => { endings.push(country); return []; },
      getPopupDetail: async () => { throw new Error('unexpected cover recovery'); },
      getPopupPage(country, signal, detail, cursor) {
        let resolve; const promise = new Promise(r => { resolve = r; });
        const request = { country, signal, detail, cursor, resolve };
        pages.push(request); gates.push(request); return promise;
      },
    },
    ...Object.fromEntries(['AppliedFilterBar', 'PlaceFilterSheet', 'PopupGridCard', 'PopupGridSkeleton', 'QuickFilterBar',
      'PlaceRegionSection', 'PlaceInterestSection', 'PlaceWeeklySection', 'TodayOpeningCarousel']
      .map(name => [`src/components/place/${name}.tsx`, { __esModule: true, default: name }])),
    fetch: async url => {
      const query = new URL(url); metadata.push(query);
      return { ok: true, json: async () => query.pathname === '/api/tags'
        ? [4, 5, 6].map(id => ({ id, name: `서버 태그 ${id}` })) : [{ id: 1, name: '서버 지역' }] };
    },
  }, { transform: compilerTransform([shortcutFile, 'src/hooks/useTranslation.ts']) });
  t.after(() => ui.dispose());
  const language = ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ja-JP'] });
  const Shortcut = ui.load(shortcutFile).default;
  const shortcuts = ui.mount(() => Shortcut());
  const find = type => nodes(place.tree).find(n => n.type === type);
  const settle = async () => { await flush(); await flush(); };
  const mountPlace = () => {
    const Screen = ui.load('src/screens/PlaceScreen.tsx').default;
    place = ui.mount(() => Screen()); return place;
  };
  const press = id => nodes(shortcuts.tree).find(n => n.key === id).props.onPress();
  return { ui, shortcuts, routes, pages, metadata, endings, gates, language, find, settle, mountPlace, press,
    get place() { return place; },
    setEntry(value) { entry = { ...entry, ...value }; place.render(); },
    sheet: () => find('PlaceFilterSheet').props,
    open: () => (find('AppliedFilterBar') ?? find('QuickFilterBar')).props.onOpenDetails(),
    tab: name => nodes(place.tree).find(n => n.key === name && n.props?.accessibilityRole === 'tab').props.onPress(),
    selectedTab: () => nodes(place.tree).find(n => n.props?.accessibilityRole === 'tab' && n.props.accessibilityState.selected).key,
  };
}

test('six ordered full-item buttons use circular placeholders and uncompressed free horizontal scrolling', async t => {
  const s = await app(t), scroll = s.shortcuts.tree;
  assert.deepEqual(nodes(scroll).filter(n => n.type === 'Text').map(n => n.props.children), ['전체', '한국', '일본', '패션', '뷰티', 'F&B']);
  assert.equal(scroll.props.horizontal, true); assert.equal(scroll.props.showsHorizontalScrollIndicator, false);
  assert.equal(scroll.props.pagingEnabled, undefined); assert.equal(scroll.props.snapToInterval, undefined);
  assert.equal(scroll.props.style.marginTop, 16); assert.equal(scroll.props.contentContainerStyle.paddingHorizontal, 16);
  assert.equal(scroll.props.contentContainerStyle.columnGap, 20);
  for (const item of nodes(scroll).filter(n => n.type === 'Pressable')) {
    assert.equal(item.props.style.width, 64); assert.equal(item.props.style.flexShrink, 0);
    const circle = nodes(item).find(n => n.type === 'View'), label = nodes(item).find(n => n.type === 'Text');
    assert.equal(flatten(circle.props.style).width, 64); assert.equal(flatten(circle.props.style).height, 64);
    assert.equal(flatten(circle.props.style).borderRadius, 32); assert.equal(flatten(circle.props.style).overflow, 'hidden');
    assert.equal(flatten(label.props.style).fontSize, 12); assert.equal(flatten(label.props.style).fontWeight, '500');
    assert.equal(flatten(label.props.style).marginTop, 8); assert.equal(item.props.accessibilityState, undefined);
  }
  assert.equal(nodes(scroll).filter(n => n.type === 'Image').length, 6);
  assert.equal(nodes(scroll).find(n => n.type === 'Image').props.source, 'assets/images/home-categories/all.png');
  assert.deepEqual(inspectI18nUi(fs.readFileSync(shortcutFile, 'utf8'), shortcutFile), []);
});

for (const [id, country, tagIds] of cases) test(`${id}: cold entry uses All and issues exactly one list request with the target filters`, async t => {
  const s = await app(t); s.press(id); s.mountPlace(); await s.settle();
  assert.equal(s.routes[0].pathname, '/(tabs)/places'); assert.equal(s.selectedTab(), '전체');
  assert.equal(s.pages.length, 1); assert.equal(s.pages[0].country, country); assert.deepEqual(s.pages[0].detail.tagIds, tagIds);
  assert.deepEqual(s.pages[0].detail.regionIds, []); assert.deepEqual(s.endings, [country]);
  assert.equal(s.metadata.filter(q => q.pathname === '/api/tags').length, 1);
  assert.equal(s.find('PlaceWeeklySection').props.isActive, false);
});

test('retained Place replaces all obstructing filters, invalidates old requests, and permits manual edits after entry', async t => {
  const s = await app(t); s.press('korea'); const retained = s.mountPlace(); await s.settle();
  s.open(); s.sheet().onToggleRegion(1); s.sheet().onToggleTag(5); s.sheet().onToggleStatus('ONGOING');
  s.sheet().onToggleFeature('benefit'); s.sheet().onToggleFeature('preReservation');
  s.sheet().onDatePeriodChange({ mode: 'custom', startDate: '2026-10-01', endDate: '2026-10-10' });
  s.sheet().onApply();
  s.find('TextInput').props.onChangeText('unmatched'); s.tab('탐색');
  const previous = s.pages.at(-1), count = s.pages.length;
  s.press('fashion'); await s.settle();
  assert.equal(s.place, retained); assert.equal(s.selectedTab(), '전체'); assert.equal(s.pages.length, count + 1);
  assert.equal(previous.signal.aborted, true);
  const latest = s.pages.at(-1);
  assert.equal(latest.country, undefined); assert.deepEqual(latest.detail.tagIds, [4]);
  assert.deepEqual(latest.detail.regionIds, []); assert.equal(latest.detail.status, undefined);
  for (const key of ['operatingFrom', 'operatingTo', 'openingFrom', 'openingTo', 'hasReservation', 'hasBenefits']) assert.equal(latest.detail[key], undefined, key);
  assert.equal(latest.detail.visitPeriod, 'all'); assert.equal(s.find('TextInput').props.value, ''); assert.equal(s.sheet().visible, false);
  previous.resolve({ popups: [{ publicId: 'obsolete', name: 'old' }], nextCursor: null });
  latest.resolve({ popups: [{ publicId: 'latest', name: 'current' }], nextCursor: null }); await s.settle();
  assert.deepEqual(s.find('FlatList').props.data.map(p => p.publicId), ['latest']);
  s.open(); s.sheet().onToggleCountry('JP'); s.sheet().onToggleTag(6); s.sheet().onApply(); await s.settle();
  assert.equal(s.pages.at(-1).country, 'JP'); assert.deepEqual(s.pages.at(-1).detail.tagIds, [4, 6]);
  s.ui.renderAll(); assert.deepEqual(s.pages.at(-1).detail.tagIds, [4, 6]);
  s.press('fashion'); await s.settle(); assert.equal(s.pages.at(-1).country, undefined); assert.deepEqual(s.pages.at(-1).detail.tagIds, [4]);
});

test('successive shortcuts reuse the mounted screen; repeated identical shortcut reuses list, metadata and auxiliary query', async t => {
  const s = await app(t); s.press('all'); s.mountPlace(); await s.settle();
  for (const [id, country, tagIds] of [...cases.slice(1), cases[0]]) {
    const before = s.pages.length; s.press(id); await s.settle();
    assert.equal(s.pages.length, before + 1); assert.equal(s.pages.at(-1).country, country); assert.deepEqual(s.pages.at(-1).detail.tagIds, tagIds);
  }
  s.pages.at(-1).resolve({ popups: [{ publicId: 'saved', name: 'saved' }], nextCursor: 'next' }); await s.settle();
  const rows = s.find('FlatList').props.data, before = [s.pages.length, s.metadata.length, s.endings.length];
  const previousToken = s.routes.at(-1).params.homeCategoryEntry;
  s.press('all'); await s.settle();
  assert.notEqual(s.routes.at(-1).params.homeCategoryEntry, previousToken);
  assert.deepEqual([s.pages.length, s.metadata.length, s.endings.length], before); assert.equal(s.find('FlatList').props.data, rows);
  s.find('FlatList').props.onEndReached(); assert.equal(s.pages.at(-1).cursor, 'next');
});

test('category and existing Home New entry coexist without replaying stale route parameters', async t => {
  const s = await app(t, { tab: 'all', countryCode: 'JP', openingFrom: '2026-10-05', openingTo: '2026-10-11', homeNewEntry: 'new-1' });
  s.mountPlace(); await s.settle(); assert.equal(s.pages.at(-1).detail.openingFrom, '2026-10-05');
  s.press('beauty'); await s.settle(); assert.deepEqual(s.pages.at(-1).detail.tagIds, [5]); assert.equal(s.pages.at(-1).detail.openingFrom, undefined);
  s.setEntry({ countryCode: 'KR', homeNewEntry: 'new-2' }); await s.settle();
  assert.equal(s.pages.at(-1).country, 'KR'); assert.deepEqual(s.pages.at(-1).detail.tagIds, []);
  assert.equal(s.pages.at(-1).detail.openingFrom, '2026-10-05');
  s.press('all'); await s.settle(); assert.equal(s.pages.at(-1).country, undefined); assert.equal(s.pages.at(-1).detail.openingFrom, undefined);
});

test('a late Explore region selection cannot overwrite the shortcut filters or start an extra list request', async t => {
  const s = await app(t); s.mountPlace(); await s.settle();
  s.find('PlaceRegionSection').props.onPress({ id: 'seongsu' });
  s.press('beauty'); const count = s.pages.length; await s.settle();
  assert.equal(s.selectedTab(), '전체'); assert.equal(s.pages.length, count);
  assert.equal(s.pages.at(-1).country, undefined); assert.deepEqual(s.pages.at(-1).detail.regionIds, []);
  assert.deepEqual(s.pages.at(-1).detail.tagIds, [5]);
});

test('compiled mounted shortcuts update ko → ja → ko and system language without navigation or filter state changes', async t => {
  const s = await app(t); s.press('beauty'); s.mountPlace(); await s.settle();
  const slots = s.shortcuts.slots, beforeRoutes = s.routes.length;
  for (const [preference, label] of [['ja', 'ビューティー'], ['ko', '뷰티'], ['system', 'ビューティー']]) {
    const count = s.pages.length, metadataCount = s.metadata.length;
    await s.language.setLanguagePreference(preference); await s.settle();
    const item = nodes(s.shortcuts.tree).find(n => n.key === 'beauty');
    assert.equal(item.props.accessibilityLabel, label); assert.equal(nodes(item).find(n => n.type === 'Text').props.children, label);
    assert.equal(s.shortcuts.slots, slots); assert.equal(s.selectedTab(), '전체');
    assert.deepEqual(s.pages.at(-1).detail.tagIds, [5]); assert.equal(s.routes.length, beforeRoutes);
    // Place retains its existing single localized list request; the shortcut adds no requests.
    assert.equal(s.pages.length, count + 1); assert.equal(s.metadata.length, metadataCount);
  }
});
