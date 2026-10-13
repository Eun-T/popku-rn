const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const titles = { ko: '프링글스 굿즈 팝업스토어', ja: 'プリングルズ グッズポップアップストア' };
const fallback = '번역 없는 원본 제목';
const child = (tree, name) => nodes(tree).find(n => n.type === name || n.type?.name === name);
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function body(url) {
  const request = new URL(url), query = request.searchParams;
  if (request.pathname === '/api/regions') return [{ id: 1, name: 'region' }];
  if (request.pathname === '/api/tags') return [{ id: 5, name: 'tag' }];
  const language = query.get('languageCode') || 'ko';
  const popup = { publicId: query.has('cursor') ? 'next-popup' : 'pringles', name: titles[language],
    countryCode: query.get('countryCode') || 'KR', regionId: 1, regionName: 'region', latitude: 37.5, longitude: 127,
    coverImageUrl: 'https://images.test/poster', coverImageCacheKey: 'same-poster',
    startDate: '2026-10-05', endDate: '2026-10-11', tags: [{ id: 5, name: 'tag' }] };
  const popups = [popup, { ...popup, publicId: query.has('cursor') ? 'next-fallback' : 'fallback', name: fallback }];
  if (query.has('weekStart')) for (let i = 2; i < 7; i++) popups.push({ ...popup, publicId: `weekly-${i}` });
  return { popups, nextCursor: query.has('cursor') ? null : 'next-page' };
}
async function app({ slow = false } = {}) {
  const calls = [], opened = [], bailouts = [];
  let systemTag = 'ja-JP';
  const screenFile = 'src/screens/PlaceScreen.tsx', weeklyFile = 'src/components/place/PlaceWeeklySection.tsx';
  const animation = () => ({ start: cb => cb?.({ finished: true }), stop() {} });
  const ui = runtime({
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    'react-native': {
      ...Object.fromEntries(['View','Text','Pressable','TextInput','FlatList'].map(n => [n,n])),
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844 }),
      Animated: { Value: class { setValue() {} }, View: 'AnimatedView', timing: animation },
      PanResponder: { create: () => ({ panHandlers: {} }) },
    },
    'lucide-react-native': { Bell: 'Bell', Search: 'Search', X: 'X' },
    'expo-router': { useLocalSearchParams: () => ({}), useScrollToTop() {}, useFocusEffect() {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }) },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    'src/hooks/usePopupNavigation.ts': { usePopupNavigation: () => id => opened.push(id) },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({ isFavorite: () => false, isFavoriteDisabled: () => false,
      toggleFavorite() {}, favoritesStatus: 'ready', retryFavorites() {} }) },
    ...Object.fromEntries(['AppliedFilterBar','PlaceFilterSheet','PopupGridCard','PopupGridSkeleton','QuickFilterBar',
      'PlaceRegionSection','PlaceInterestSection','TodayOpeningCarousel','PlaceWeeklyPopupList'].map(name => [
      `src/components/place/${name}.tsx`, { __esModule: true, default: name },
    ])),
    fetch: (url, options) => {
      const wait = deferred();
      const response = () => ({ ok: true, status: 200, json: async () => body(url) });
      calls.push({ url, signal: options?.signal, resolve: () => wait.resolve(response()), reject: wait.reject });
      return slow && new URL(url).pathname === '/api/popups' ? wait.promise : Promise.resolve(response());
    },
  }, { transform: compilerTransform([screenFile, weeklyFile, 'src/hooks/useTranslation.ts'], {
    allowBailout: [screenFile, weeklyFile], onBailout: file => bailouts.push(file),
  }) });
  const languageStore = ui.load('src/locales/languageStore.ts').languageStore;
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => [systemTag] });
  const Screen = ui.load(screenFile).default, screen = ui.mount(() => Screen());
  const Weekly = ui.load(weeklyFile).default;
  const weekly = ui.mount(() => Weekly(child(screen.tree, 'PlaceWeeklySection').props));
  const settle = async () => { await flush(); await flush(); ui.renderAll(); await flush(); ui.renderAll(); };
  const list = () => child(screen.tree, 'FlatList');
  const weekList = () => child(weekly.tree, 'FlatList');
  const tab = name => { nodes(screen.tree).find(n => n.type === 'Pressable' && n.key === name && n.props.accessibilityRole === 'tab').props.onPress(); ui.renderAll(); };
  const weeklyItems = () => weekList()?.props.data.flat() || [];
  const contentCalls = () => calls.filter(c => new URL(c.url).pathname === '/api/popups');
  return { ...ui, calls, opened, screen, weekly, bailouts, list, weekList, tab, weeklyItems, contentCalls, settle,
    async language(value) { await languageStore.setLanguagePreference(value); ui.renderAll(); },
    system(value) { systemTag = value; languageStore.refreshSystemLanguage(); ui.renderAll(); },
    async finish() { contentCalls().forEach(c => c.resolve()); await settle(); },
    layoutWeek() { nodes(weekly.tree).find(n => n.props?.onLayout && Array.isArray(n.props.children))?.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      // The ready content's layout provides the popup carousel width.
      for (const node of nodes(weekly.tree).filter(n => n.props?.onLayout)) node.props.onLayout({ nativeEvent: { layout: { width: 300, height: 280 } } });
      ui.renderAll(); },
  };
}
const isPage = c => new URL(c.url).searchParams.has('limit');
const isWeekly = c => new URL(c.url).searchParams.has('weekStart');
const isEnding = c => new URL(c.url).searchParams.has('endingSoon');

test('Place APIs send explicit ko/ja independently of country and preserve pagination/weekly filters', async () => {
  const calls = [], ui = runtime({ 'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => body(url) }; } });
  const api = ui.load('src/lib/popups.ts'), signal = new AbortController().signal;
  for (const country of ['KR', 'JP']) for (const language of ['ko', 'ja']) {
    const page = await api.getPopupPage(country, signal, { regionIds: [1], tagIds: [5], status: 'ENDED', visitPeriod: 'week' }, 'next-page', language);
    const weekly = await api.getWeeklyPopups(country, '2026-10-05', '2026-10-11', signal, language);
    const ending = await api.getEndingSoonPopups(country, signal, language);
    for (const result of [page.popups, weekly, ending]) assert.deepEqual(result.slice(0,2).map(p => p.name), [titles[language], fallback]);
    calls.slice(-3).forEach(c => { const query = new URL(c.url).searchParams;
      assert.equal(query.get('countryCode'), country); assert.equal(query.get('languageCode'), language); assert.equal(c.options.signal, signal); });
    const query = new URL(calls.at(-3).url).searchParams;
    assert.equal(query.get('cursor'), 'next-page'); assert.equal(query.get('limit'), '10');
    assert.equal(query.get('regionIds'), '1'); assert.equal(query.get('tagIds'), '5'); assert.equal(query.get('status'), 'ENDED'); assert.equal(query.get('visitPeriod'), 'week');
  }
  ui.dispose();
});

test('mounted Place explore/all titles change ko-ja-ko/system and tabs retain rows without duplicate requests', async t => {
  const s = await app(); await s.settle(); s.layoutWeek();
  t.diagnostic(s.bailouts.length ? `Compiler bailout: ${s.bailouts.join(', ')}; actual useTranslation output is compiled` : 'PlaceScreen and PlaceWeeklySection both use actual React Compiler output');
  assert.equal(s.contentCalls().filter(isPage).length, 0);
  assert.equal(child(s.screen.tree, 'TodayOpeningCarousel').props.items[0].name, titles.ko);
  assert.equal(s.weeklyItems()[0].name, titles.ko);
  s.tab('전체'); await s.settle();
  for (const [preference, language] of [['ja','ja'], ['ko','ko'], ['system','ja']]) {
    await s.language(preference); await s.settle();
    assert.deepEqual(s.list().props.data.map(p => p.name), [titles[language], fallback]);
    assert.equal(child(s.screen.tree, 'TodayOpeningCarousel').props.items[0].name, titles[language]);
    const before = s.calls.length;
    s.tab('탐색'); await s.settle(); s.layoutWeek();
    assert.equal(s.weeklyItems()[0].name, titles[language]);
    assert.equal(s.weeklyItems()[1].name, fallback);
    const afterWeek = s.calls.length;
    assert.equal(afterWeek - before, language === 'ja' && preference === 'ja' ? 1 : 0);
    s.tab('전체'); await s.settle(); assert.equal(s.calls.length, afterWeek);
    const item = s.list().props.data[0], card = s.list().props.renderItem({ item });
    assert.equal(card.props.item.name, titles[language]); assert.equal(card.props.item.coverImageCacheKey, 'same-poster');
    card.props.onPress(item); assert.equal(s.opened.at(-1), 'pringles');
  }
  s.system('ko-KR'); await s.settle(); assert.equal(s.list().props.data[0].name, titles.ko);
  assert.equal(s.load('src/locales/index.ts').getApiLocale(), 'ko'); s.dispose();
});

test('Place language changes preserve country/region/tag/status filters and restart pagination with new language', async () => {
  const s = await app(); await s.settle(); s.tab('전체'); await s.settle();
  child(s.screen.tree, 'QuickFilterBar').props.onOpenDetails(); s.renderAll();
  const sheet = () => child(s.screen.tree, 'PlaceFilterSheet').props;
  sheet().onToggleCountry('JP'); s.renderAll(); sheet().onToggleRegion(1); sheet().onToggleTag(5); sheet().onToggleStatus('ENDED'); s.renderAll();
  sheet().onToggleFeature('preReservation'); sheet().onToggleFeature('benefit'); s.renderAll();
  sheet().onDatePeriodChange({mode:'custom',startDate:'2000-10-10',endDate:'2000-10-12'});s.renderAll();
  sheet().onApply(); s.renderAll(); await s.settle();
  const filters = child(s.screen.tree, 'AppliedFilterBar').props;
  await s.language('ja'); await s.settle();
  assert.deepEqual(child(s.screen.tree, 'AppliedFilterBar').props.filters, filters.filters);
  assert.deepEqual(child(s.screen.tree, 'AppliedFilterBar').props.detailFilters, filters.detailFilters);
  const latest = s.contentCalls().filter(isPage).at(-1), query = new URL(latest.url).searchParams;
  assert.equal(query.get('countryCode'), 'JP'); assert.equal(query.get('regionIds'), '1'); assert.equal(query.get('tagIds'), '5'); assert.equal(query.get('status'), 'ENDED');
  assert.equal(query.get('languageCode'), 'ja'); assert.equal(query.has('cursor'), false);
  assert.equal(query.get('hasReservation'), 'true'); assert.equal(query.get('hasBenefits'), 'true');
  assert.equal(query.get('operatingFrom'),'2000-10-10');assert.equal(query.get('operatingTo'),'2000-10-12');
  assert.equal(query.has('visitPeriod'),false);
  const before = s.calls.length; s.list().props.onEndReached(); s.list().props.onEndReached(); await s.settle();
  assert.equal(s.calls.length, before + 1); assert.equal(new URL(s.calls.at(-1).url).searchParams.get('cursor'), 'next-page');
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('languageCode'), 'ja'); assert.equal(s.list().props.data.length, 4);
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('hasReservation'), 'true');
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('hasBenefits'), 'true');
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('operatingFrom'),'2000-10-10');
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('operatingTo'),'2000-10-12');
  const requests = s.calls.length; s.tab('탐색'); await s.settle(); s.tab('전체'); await s.settle();
  assert.equal(s.contentCalls().filter(isPage).at(-1).url, s.calls[before].url); assert.equal(s.list().props.data.length, 4);
  assert.ok(s.calls.length <= requests + 1, 'only the changed country/language week may fetch on explore entry'); s.dispose();
});

test('Place ko-ja-ko discards reversed responses and keeps in-flight weekly requests across rapid tab switches', async () => {
  const s = await app({ slow: true }); await s.finish(); s.layoutWeek(); s.tab('전체'); await s.finish();
  await s.language('ja'); s.tab('탐색'); await s.settle();
  const jaCalls = s.contentCalls().filter(c => new URL(c.url).searchParams.get('languageCode') === 'ja');
  assert.equal(jaCalls.filter(isWeekly).length, 1);
  const beforeTabs = s.calls.length; s.tab('전체'); s.tab('탐색'); await s.settle();
  assert.equal(s.calls.length, beforeTabs); assert.equal(jaCalls.find(isWeekly).signal.aborted, false);
  assert.equal(child(s.screen.tree, 'TodayOpeningCarousel').props.items.length, 0); assert.deepEqual(s.weeklyItems(), []);
  await s.language('ko'); await s.settle(); s.tab('전체'); await s.settle();
  assert.ok(jaCalls.every(c => c.signal.aborted)); assert.equal(s.list().props.data.length, 0);
  jaCalls.forEach(c => c.resolve()); await s.settle();
  assert.equal(s.list().props.data.length, 0);
  assert.deepEqual(child(s.screen.tree, 'TodayOpeningCarousel').props.items.map(p => p.name), [titles.ko, fallback]);
  await s.finish(); assert.equal(s.list().props.data[0].name, titles.ko);
  s.tab('탐색'); await s.settle(); s.layoutWeek(); assert.equal(s.weeklyItems()[0].name, titles.ko);
  s.dispose();
});
