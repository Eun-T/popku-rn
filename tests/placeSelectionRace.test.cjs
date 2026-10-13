const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, flush } = require('./helpers/i18nRuntime.cjs');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const regions = { KR: [{ id: 1, name: '성수' }, { id: 4, name: '홍대·신촌' }], JP: [{ id: 15, name: '도쿄' }] };
const tags = [{ id: 2, name: '게임/디지털' }, { id: 5, name: '뷰티' }];

// Mount production PlaceScreen/filterOptions with controllable metadata HTTP and
// list promises. Native layout/navigation are mocks; filters travel through real callbacks.
async function app(t, { delayTags = false } = {}) {
  const metadata = [], pages = [], regionGates = { KR: deferred(), JP: deferred() }, tagGate = deferred();
  let disposed = false, unmountedWrites = 0, focused = true, focusFn, focusCleanup;
  const ui = runtime({
    'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390 }) },
    'expo-router': { useLocalSearchParams: () => ({}), useScrollToTop() {},
      useFocusEffect: fn => ui.react.useEffect(() => {
        focusFn = fn; if (focused) focusCleanup = fn();
        return () => { focusCleanup?.(); focusCleanup = undefined; focusFn = undefined; };
      }, [fn]) },
    'lucide-react-native': { Bell: 'Bell', Search: 'Search', X: 'X' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'src/constants/api.ts': { API_BASE_URL: 'https://test' },
    'src/hooks/usePopupNavigation.ts': { usePopupNavigation: () => () => {} },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({ isFavorite() {}, isFavoriteDisabled() {}, toggleFavorite() {} }) },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    'src/lib/popups.ts': {
      emptyPopupFilters: () => ({ regionIds: [], tagIds: [], status: undefined }),
      getEndingSoonPopups: async () => [],
      getPopupDetail: async () => { throw new Error('no cover recovery expected'); },
      getPopupPage(country, signal, detail, cursor) {
        const gate = deferred(); pages.push({ country, signal, detail, cursor, ...gate }); return gate.promise;
      },
    },
    ...Object.fromEntries(['AppliedFilterBar', 'PlaceFilterSheet', 'PopupGridCard', 'PopupGridSkeleton', 'QuickFilterBar',
      'PlaceRegionSection', 'PlaceInterestSection', 'PlaceWeeklySection', 'TodayOpeningCarousel']
      .map(name => [`src/components/place/${name}.tsx`, { __esModule: true, default: name }])),
    fetch: async url => {
      const query = new URL(url); metadata.push(query);
      const body = query.pathname === '/api/tags' ? await tagGate.promise
        : await regionGates[query.searchParams.get('countryCode')].promise;
      return { ok: true, json: async () => body };
    },
  });
  const useState = ui.react.useState;
  ui.react.useState = initial => {
    const [value, setValue] = useState(initial);
    return [value, next => { if (disposed) unmountedWrites++; else setValue(next); }];
  };
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ko-KR'] });
  const Screen = ui.load('src/screens/PlaceScreen.tsx').default, root = ui.mount(() => Screen());
  const find = type => nodes(root.tree).find(n => n.type === type);
  const settle = async () => { await flush(); await flush(); };
  const unmount = () => { if (!disposed) { disposed = true; ui.dispose(); } };
  t.after(unmount);
  if (!delayTags) { tagGate.resolve(tags); await settle(); }
  const scrolls = [];
  find('FlatList').props.ref.current = { scrollToOffset: options => scrolls.push(options) };
  return { pages, metadata, find, settle, unmount, scrolls,
    region: id => find('PlaceRegionSection').props.onPress({ id }),
    interest: id => find('PlaceInterestSection').props.onPressCategory(id),
    resolveRegions: code => regionGates[code].resolve(regions[code]),
    resolveTags: () => tagGate.resolve(tags),
    tab: name => nodes(root.tree).find(n => n.props?.accessibilityRole === 'tab' && n.key === name).props.onPress(),
    selectedTab: () => nodes(root.tree).find(n => n.props?.accessibilityRole === 'tab' && n.props.accessibilityState.selected).key,
    applied: () => find('AppliedFilterBar')?.props.detailFilters ?? { regionIds: [], tagIds: [] },
    country: () => find('AppliedFilterBar')?.props.filters.countries ?? [],
    open: () => (find('AppliedFilterBar') ?? find('QuickFilterBar')).props.onOpenDetails(),
    sheet: () => find('PlaceFilterSheet').props,
    blur: () => { focused = false; focusCleanup?.(); focusCleanup = undefined; },
    focus: () => { focused = true; focusCleanup = focusFn?.(); },
    unmountedWrites: () => unmountedWrites,
  };
}

test('interest selection resets the shared list after tag commit and header layout without extra requests', async t => {
  const s = await app(t, { delayTags: true });
  s.find('FlatList').props.onScroll({ nativeEvent: { contentOffset: { y: 900 } } });
  const selection = s.interest('beauty');
  assert.deepEqual(s.scrolls, []);
  s.resolveTags(); await selection; await s.settle();
  assert.equal(s.selectedTab(), '전체');
  assert.deepEqual(s.applied().tagIds, [5]);
  assert.deepEqual(s.scrolls, [{ offset: 0, animated: false }]);
  const count = s.pages.length;
  const header = () => s.find('FlatList').props.ListHeaderComponent;
  header().props.onLayout();
  assert.deepEqual(s.scrolls.at(-1), { offset: 0, animated: false });
  const resets = s.scrolls.length;
  header().props.onLayout(); s.tab('탐색'); s.tab('전체'); header().props.onLayout();
  await s.settle();
  assert.equal(s.scrolls.length, resets);
  assert.equal(s.pages.length, count);
  await s.interest('beauty'); await s.settle();
  assert.equal(s.scrolls.length, resets + 1, 'the same tag selection also returns to top');
  assert.equal(s.pages.length, count);
});

test('A03: delayed region cannot reappear after an interest tile replaces filters or issue another list request', async t => {
  const s = await app(t);
  s.region('seongsu'); s.tab('탐색'); await s.interest('beauty'); await s.settle();
  assert.deepEqual(s.applied().regionIds, []); assert.deepEqual(s.applied().tagIds, [5]);
  const count = s.pages.length;
  s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, []); assert.deepEqual(s.applied().tagIds, [5]);
  assert.equal(s.pages.length, count);
  assert.equal(s.metadata.filter(q => q.pathname === '/api/regions' && q.searchParams.get('countryCode') === 'KR').length, 1);
});

test('region A then B in the same country shares metadata but only applies B', async t => {
  const s = await app(t); s.region('seongsu'); s.region('hongdae');
  s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, [4]);
  assert.ok(!s.pages.some(p => p.detail.regionIds.includes(1)));
  assert.equal(s.pages.at(-1).country, 'KR');
});

test('reversed region responses from different countries cannot change the latest country or region', async t => {
  const s = await app(t); s.region('seongsu'); s.region('tokyo');
  s.resolveRegions('JP'); await s.settle(); const count = s.pages.length;
  s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.country(), ['JP']); assert.deepEqual(s.applied().regionIds, [15]); assert.equal(s.pages.length, count);
});

test('country change during lookup and country chip removal both invalidate the old region', async t => {
  for (const change of ['change', 'remove']) {
    const s = await app(t); s.region('seongsu');
    if (change === 'change') { s.open(); s.sheet().onToggleCountry('JP'); s.sheet().onApply(); }
    else s.find('AppliedFilterBar').props.onRemove('countries', 'KR');
    const count = s.pages.length; s.resolveRegions('KR'); await s.settle();
    assert.deepEqual(s.country(), change === 'change' ? ['JP'] : []);
    assert.deepEqual(s.applied().regionIds, []); assert.equal(s.pages.length, count);
  }
});

test('resetting all applied filters ignores the pending region and its late response adds no request', async t => {
  const s = await app(t); s.region('seongsu'); s.find('AppliedFilterBar').props.onReset();
  const count = s.pages.length; s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.country(), []); assert.deepEqual(s.applied().regionIds, []); assert.deepEqual(s.applied().tagIds, []);
  assert.equal(s.pages.length, count);
});

test('a same-country Sheet apply keeps the explicit region/tag pair and invalidates the previous lookup', async t => {
  const s = await app(t); s.region('seongsu'); s.open();
  s.sheet().onToggleRegion(4); s.sheet().onToggleTag(5); s.sheet().onApply();
  const count = s.pages.length; s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, [4]); assert.deepEqual(s.applied().tagIds, [5]); assert.equal(s.pages.length, count);
  assert.deepEqual(s.pages.at(-1).detail.regionIds, [4]);
});

test('Sheet reset remains a draft until apply; applying that reset cancels the pending selection', async t => {
  const s = await app(t); s.region('seongsu'); s.open(); s.sheet().onReset();
  assert.deepEqual(s.country(), ['KR']); s.sheet().onApply();
  const count = s.pages.length; s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.country(), []); assert.deepEqual(s.applied().regionIds, []); assert.equal(s.pages.length, count);
});

test('cancelled or invalid Sheet drafts do not cancel the intended region selection', async t => {
  for (const action of ['cancel', 'invalid']) {
    const s = await app(t); s.region('seongsu'); s.open(); s.sheet().onToggleTag(5);
    if (action === 'cancel') { s.sheet().onReset(); s.sheet().onClose(); }
    else { s.sheet().onDatePeriodChange({ mode: 'custom', startDate: null, endDate: null }); s.sheet().onApply(); }
    s.resolveRegions('KR'); await s.settle();
    assert.deepEqual(s.applied().regionIds, [1]); assert.deepEqual(s.applied().tagIds, []);
  }
});

test('normal region then Sheet tag addition preserves the intentional combined filter', async t => {
  const s = await app(t); s.region('seongsu'); s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, [1]);
  s.open(); assert.deepEqual(s.sheet().filters.regionIds, [1]);
  s.sheet().onToggleTag(5); s.sheet().onApply();
  assert.deepEqual(s.applied().regionIds, [1]); assert.deepEqual(s.applied().tagIds, [5]);
  assert.deepEqual(s.pages.at(-1).detail.regionIds, [1]); assert.deepEqual(s.pages.at(-1).detail.tagIds, [5]);
});

test('region tiles preserve an existing tag while interest tiles intentionally replace a resolved region', async t => {
  const s = await app(t); await s.interest('beauty'); s.tab('탐색'); s.region('seongsu');
  s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, [1]); assert.deepEqual(s.applied().tagIds, [5]);
  s.tab('탐색'); await s.interest('game');
  assert.deepEqual(s.applied().regionIds, []); assert.deepEqual(s.applied().tagIds, [2]);
});

test('rapid Explore/All switching alone preserves a pending region, then reuses list rows and cursor', async t => {
  const s = await app(t); s.region('seongsu');
  for (let i = 0; i < 3; i++) { s.tab('탐색'); s.tab('전체'); }
  assert.equal(s.pages.length, 1);
  s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, [1]); assert.equal(s.pages[0].signal.aborted, true);
  const current = s.pages.at(-1); current.resolve({ popups: [{ publicId: 'latest', name: 'latest' }], nextCursor: 'next' });
  await s.settle(); const rows = s.find('FlatList').props.data, count = s.pages.length;
  for (let i = 0; i < 3; i++) { s.tab('탐색'); s.tab('전체'); }
  assert.equal(s.pages.length, count); assert.equal(s.find('FlatList').props.data, rows);
  s.find('FlatList').props.onEndReached(); assert.equal(s.pages.at(-1).cursor, 'next');
  assert.deepEqual(s.pages.at(-1).detail.regionIds, [1]);
  s.pages[0].resolve({ popups: [{ publicId: 'obsolete', name: 'obsolete' }], nextCursor: null }); await s.settle();
  assert.equal(s.find('FlatList').props.data, rows);
});

test('screen blur invalidates the pending region; returning does not trigger another list request', async t => {
  const s = await app(t); s.region('seongsu'); s.blur(); const count = s.pages.length;
  s.resolveRegions('KR'); await s.settle(); s.focus();
  assert.deepEqual(s.applied().regionIds, []); assert.equal(s.pages.length, count);
});

test('unmount invalidates region/tag continuations without setters or late API requests', async t => {
  const s = await app(t, { delayTags: true }); s.region('seongsu'); s.tab('탐색');
  const interest = s.interest('beauty'); s.unmount(); const count = s.pages.length;
  s.resolveRegions('KR'); s.resolveTags(); await interest; await s.settle();
  assert.equal(s.unmountedWrites(), 0); assert.equal(s.pages.length, count);
  assert.ok(s.pages.every(page => page.signal.aborted));
});

test('rapid interests share tag lookup and the latest committed tag invalidates a still-pending region', async t => {
  const s = await app(t, { delayTags: true }); s.region('seongsu'); s.tab('탐색');
  const first = s.interest('game'), second = s.interest('beauty'); s.resolveTags(); await Promise.all([first, second]);
  const count = s.pages.length; s.resolveRegions('KR'); await s.settle();
  assert.deepEqual(s.applied().regionIds, []); assert.deepEqual(s.applied().tagIds, [5]); assert.equal(s.pages.length, count);
  assert.equal(s.metadata.filter(q => q.pathname === '/api/tags').length, 1); assert.equal(s.selectedTab(), '전체');
});
