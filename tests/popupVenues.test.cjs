const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const sectionFile = 'src/components/home/HomeVenueSection.tsx';
const screenFile = 'src/screens/PlaceScreen.tsx';
const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const venues = [
  { venueId: 'jp-store', name: '일본 백화점', address: '東京都新宿区新宿三丁目の長い住所をそのまま表示する', countryCode: 'JP', popupCount: 3, imageUrl: 'https://images.test/jp', imageCacheKey: 'jp-cover' },
  { venueId: 'empty', name: '빈 백화점', countryCode: 'KR', popupCount: 0 },
  { venueId: 'kr-store', name: '한국 백화점', countryCode: 'KR', popupCount: 12, imageUrl: 'https://images.test/kr', imageCacheKey: 'kr-cover' },
];
const popup = (id, language = 'ko') => ({ publicId: id, name: `${id}:${language}`, countryCode: 'KR', regionId: 1,
  regionName: '서울', latitude: 37.5, longitude: 127, tags: [], startDate: '2026-10-01', endDate: '2026-10-31',
  coverImageUrl: null, coverImageCacheKey: null });
const venueEntry = (venueId = 'kr-store', token = 'venue-1') => ({ tab: 'all', venueId, homeVenueEntry: token, countryCode: 'all' });

async function app(t, { initialEntry = {}, slow = false, empty = false, fail = false } = {}) {
  let entry = initialEntry, screen, width = 390, system = 'ja-JP', scrollRef;
  const calls = [], routes = [], opened = [], bailouts = [];
  const ui = runtime({
    'react-native': { ...Object.fromEntries(['View','Text','Pressable','ScrollView','FlatList','TextInput'].map(n => [n,n])),
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width }) },
    'expo-image': { Image: 'ExpoImage' },
    'expo-router': { useLocalSearchParams: () => entry, useScrollToTop: ref => { scrollRef = ref; }, useFocusEffect() {},
      useRouter: () => ({ navigate: route => { routes.push(route); entry = { ...entry, ...route.params }; screen?.render(); } }) },
    'lucide-react-native': { Bell: 'Bell', Search: 'Search', X: 'X', MapPin: 'MapPin' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    'src/hooks/usePopupNavigation.ts': { usePopupNavigation: () => id => opened.push(id) },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({ isFavorite: () => false, isFavoriteDisabled: () => false,
      toggleFavorite() {}, favoritesStatus: 'ready' }) },
    'src/theme/useTheme.ts': { useTheme: () => ({ themeColors: { textPrimary: '#111827', textSecondary: '#6B7280', surface: '#F8FAFC' } }) },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    'react-native-reanimated': { __esModule: true, default: { ScrollView: 'HomeScrollView' },
      useSharedValue: value => ({ value }), useAnimatedScrollHandler: handlers => handlers },
    ...Object.fromEntries(['HomeBanner','HomeCategoryShortcuts','HomeLatestPopupSection','HomeNewPopupSection','HomeTrendingSection']
      .map(name => [`src/components/home/${name}.tsx`, { __esModule: true, default: name }])),
    ...Object.fromEntries(['AppliedFilterBar','PlaceFilterSheet','PopupGridCard','PopupGridSkeleton','QuickFilterBar',
      'PlaceRegionSection','PlaceInterestSection','PlaceWeeklySection','TodayOpeningCarousel']
      .map(name => [`src/components/place/${name}.tsx`, { __esModule: true, default: name }])),
    fetch: (url, options) => {
      const query = new URL(url), language = query.searchParams.get('languageCode'), venue = query.searchParams.get('venueId');
      let resolve, reject;
      const promise = new Promise((a,b) => { resolve = a; reject = b; });
      const call = { query, signal: options?.signal,
        resolve: data => resolve({ ok: true, json: async () => data }), reject };
      calls.push(call);
      let body;
      if (query.pathname === '/api/tags') body = [{ id: 5, name: '뷰티' }];
      else if (query.pathname === '/api/regions') body = [{ id: 1, name: '서울' }];
      else if (query.pathname === '/api/popups/venues') body = venue
        ? { venueId: venue, popupCount: 12, popups: Array.from({ length: 12 }, (_, i) => popup(`${venue}-${i}`, language)) }
        : { venues: empty ? [] : venues.map(item => ({ ...item, name: `${item.name}:${language}` })) };
      else body = { popups: query.searchParams.has('limit') ? [popup('general', language)] : [], nextCursor: null };
      if (query.pathname === '/api/popups/venues' && fail) reject(new Error('API unavailable'));
      else if (!slow || !['/api/popups/venues','/api/popups'].includes(query.pathname)) call.resolve(body);
      return promise;
    },
  }, { transform: compilerTransform([sectionFile, screenFile, 'src/hooks/useHomeVenues.ts', 'src/hooks/useTranslation.ts'], {
    allowBailout: [screenFile], onBailout: file => bailouts.push(file),
  }) });
  t.after(() => ui.dispose());
  const language = ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => [system] });
  const find = name => nodes(screen?.tree).find(n => n.type === name);
  const settle = async () => { await flush(); await flush(); ui.renderAll(); await flush(); };
  const Section = ui.load(sectionFile).default;
  return { ui, calls, routes, opened, language, bailouts, settle, find,
    home: () => ui.mount(() => Section()),
    mountHomeScreen() { const Home = ui.load('src/screens/HomeScreen.tsx').default; return ui.mount(() => Home()); },
    venueNode: () => nodes(screen?.tree).find(n => n.type?.name === 'HomeVenueSection'),
    mountExploreVenues() { return ui.mount(() => {
      const node = nodes(screen?.tree).find(n => n.type?.name === 'HomeVenueSection');
      return node ? node.type(node.props) : null;
    }); },
    mountPlace() { const Screen = ui.load(screenFile).default; screen = ui.mount(() => Screen()); return screen; },
    enter(params) { entry = { ...entry, ...params }; screen.render(); },
    list: () => find('FlatList').props,
    scoped: () => calls.filter(c => c.query.pathname === '/api/popups/venues' && c.query.searchParams.has('venueId')),
    pages: () => calls.filter(c => c.query.pathname === '/api/popups' && c.query.searchParams.has('limit')),
    homes: () => calls.filter(c => c.query.pathname === '/api/popups/venues' && !c.query.searchParams.has('venueId')),
    tab(name) { nodes(screen.tree).find(n => n.key === name && n.props?.accessibilityRole === 'tab').props.onPress(); },
    selectedTab: () => nodes(screen.tree).find(n => n.props?.accessibilityRole === 'tab' && n.props.accessibilityState.selected).key,
    open() { (find('AppliedFilterBar') ?? find('QuickFilterBar')).props.onOpenDetails(); },
    sheet: () => find('PlaceFilterSheet').props,
    resize(value) { width = value; ui.renderAll(); },
    system(value) { system = value; language.refreshSystemLanguage(); },
    reselect: () => scrollRef.current.scrollToTop(),
  };
}

test('home omits venues and their trailing gap; explore places venues directly below ending-soon', async t => {
  const s=await app(t),home=s.mountHomeScreen();await s.settle();
  assert.ok(!nodes(home.tree).some(n=>n.type?.name==='HomeVenueSection'||n.type==='HomeVenueSection'));
  assert.equal(s.homes().length,0);
  const newSection=nodes(home.tree).find(n=>n.type==='View'&&nodes(n).some(child=>child.type==='HomeNewPopupSection'));
  assert.equal(flat(newSection.props.style).marginBottom,undefined);
  const place=s.mountPlace();await s.settle();
  const venue=s.venueNode(),parent=nodes(place.tree).find(n=>Array.isArray(n.props?.children)&&n.props.children.includes(venue));
  const siblings=parent.props.children.filter(Boolean);
  assert.equal(siblings[siblings.indexOf(venue)-1].type,'TodayOpeningCarousel');
  assert.equal(venue.props.isActive,true);assert.equal(venue.props.style.marginHorizontal,-16);
  const section=s.mountExploreVenues();s.mountExploreVenues();await s.settle();
  assert.equal(s.homes().length,1,'same-language mounts share the request/cache');
  assert.deepEqual(nodes(section.tree).filter(n=>n.type==='Pressable').map(n=>n.key),['jp-store','kr-store']);
  nodes(section.tree).find(n=>n.key==='kr-store').props.onPress();await s.settle();
  assert.equal(s.selectedTab(),'전체');assert.equal(s.venueNode().props.isActive,false);
  assert.equal(s.scoped().length,1);assert.equal(s.homes().length,1);
  const hidden=nodes(place.tree).find(n=>Array.isArray(n.props?.children)&&n.props.children.includes(s.venueNode()));
  assert.equal(hidden.props.accessibilityElementsHidden,true);assert.equal(flat(hidden.props.style).display,'none');
  const card=s.list().renderItem({item:s.list().data[0]});card.props.onPress(card.props.item);
  assert.deepEqual(s.opened,['kr-store-0']);
  s.tab('탐색');await s.settle();assert.equal(s.homes().length,1,'tab return reuses venue cache');
});

test('cold All tab skips venue discovery and applies it only on entering explore',async t=>{
  const s=await app(t,{initialEntry:venueEntry()});s.mountPlace();s.mountExploreVenues();await s.settle();
  assert.equal(s.selectedTab(),'전체');assert.equal(s.homes().length,0);
  s.tab('탐색');await s.settle();assert.equal(s.homes().length,1);
  s.find('PlaceRegionSection').props.onPress({id:'seongsu'});await s.settle();
  assert.equal(s.selectedTab(),'전체');assert.equal(s.homes().length,1);
  assert.ok(!s.homes()[0].query.searchParams.has('countryCode'));
  assert.ok(!s.homes()[0].query.searchParams.has('regionId'));
});

test('retained explore venue section translates ko-ja-ko/system without duplicate reads or hidden-tab fetches',async t=>{
  const s=await app(t);s.mountPlace();const section=s.mountExploreVenues();await s.settle();
  const slots=section.slots;
  for(const [language,label] of [['ja','ポップアップ'],['ko','팝업'],['system','ポップアップ']]) {
    await s.language.setLanguagePreference(language);await s.settle();
    assert.ok(texts(section.tree).includes(label));assert.equal(section.slots,slots);
    assert.equal(s.selectedTab(),'탐색');
  }
  assert.equal(s.homes().length,2,'one request per applied language');
  s.tab('전체');await s.settle();
  s.system('ko-KR');await s.settle();assert.equal(s.homes().length,2);
  s.tab('탐색');await s.settle();assert.equal(s.homes().length,2);
  assert.deepEqual(nodes(section.tree).filter(n=>n.type==='Pressable').map(n=>n.key),['jp-store','kr-store']);
});

test('venue section shares requests/cache and shows mixed venues in server order with 16:9 images, count and free scroll', async t => {
  const s = await app(t, { slow: true }), home = s.home();
  assert.equal(home.tree, null); s.home(); assert.equal(s.homes().length, 1);
  s.homes()[0].resolve({ venues }); await s.settle();
  const cards = () => nodes(home.tree).filter(n => n.type === 'Pressable');
  assert.deepEqual(cards().map(n => n.key), ['jp-store','kr-store']);
  assert.match(texts(home.tree), /여기서 열리는 팝업 /); assert.match(texts(home.tree), /팝업 12개/);
  const scroll = nodes(home.tree).find(n => n.type === 'ScrollView');
  assert.equal(scroll.props.horizontal, true); assert.equal(scroll.props.showsHorizontalScrollIndicator, false);
  assert.equal(scroll.props.snapToInterval, undefined); assert.equal(scroll.props.pagingEnabled, undefined);
  assert.equal(flat(scroll.props.contentContainerStyle).paddingHorizontal, 16);
  assert.equal(flat(scroll.props.contentContainerStyle).columnGap, 16);
  const image = nodes(cards()[0]).find(n => n.type === 'ExpoImage');
  assert.equal(flat(image.props.style).aspectRatio, 16/9); assert.equal(image.props.contentFit, 'cover');
  assert.deepEqual(image.props.source, { uri: venues[0].imageUrl, cacheKey: 'jp-cover' });
  assert.equal(cards()[0].props.style.width, 390 * 0.75);
  assert.equal(nodes(home.tree).filter(n => n.type === 'Pressable').length, 2, 'badge does not add a nested button');
  const imageStyle = flat(image.props.style);
  assert.equal(imageStyle.borderTopLeftRadius, 12); assert.equal(imageStyle.borderTopRightRadius, 12);
  assert.equal(imageStyle.borderRadius ?? 0, 0); assert.equal(imageStyle.borderBottomLeftRadius ?? 0, 0);
  assert.equal(imageStyle.borderBottomRightRadius ?? 0, 0);
  const info = nodes(cards()[0]).find(n => flat(n.props?.style).backgroundColor === '#F5F5F5');
  const infoStyle = flat(info.props.style);
  assert.equal(infoStyle.borderBottomLeftRadius, 12); assert.equal(infoStyle.borderBottomRightRadius, 12);
  assert.equal(infoStyle.borderTopLeftRadius ?? 0, 0); assert.equal(infoStyle.borderTopRightRadius ?? 0, 0);
  assert.equal(infoStyle.paddingHorizontal, 12); assert.equal(infoStyle.paddingVertical, 12);
  assert.equal(infoStyle.marginTop ?? 0, 0); assert.equal(imageStyle.marginBottom ?? 0, 0);
  assert.doesNotMatch(texts(info), /팝업/);
  const address = nodes(info).find(n => n.type === 'Text' && texts(n) === venues[0].address);
  assert.equal(address.props.numberOfLines, 1); assert.equal(address.props.ellipsizeMode, 'tail');
  assert.equal(flat(address.props.style).fontSize, 13); assert.equal(flat(address.props.style).flex, 1);
  assert.equal(flat(address.props.style).minWidth, 0);
  const addressRow = nodes(info).find(n => n.type === 'View' && flat(n.props?.style).flexDirection === 'row');
  assert.equal(flat(addressRow.props.style).marginTop, 6);
  assert.equal(nodes(addressRow).find(n => n.type === 'MapPin').props.size, 14);
  const name = nodes(info).find(n => n.type === 'Text' && texts(n) === venues[0].name);
  assert.equal(flat(name.props.style).fontSize, 16); assert.equal(flat(name.props.style).fontWeight, '600');
  assert.equal(name.props.numberOfLines, 1);
  const badge = nodes(cards()[0]).find(n => flat(n.props?.style).position === 'absolute');
  const badgeStyle = flat(badge.props.style);
  assert.equal(texts(badge), '팝업 3개'); assert.equal(badgeStyle.top, 12); assert.equal(badgeStyle.right, 12);
  assert.equal(badgeStyle.backgroundColor, 'rgba(0, 0, 0, 0.6)'); assert.equal(badgeStyle.borderRadius, 999);
  assert.equal(flat(nodes(badge).find(n => n.type === 'Text').props.style).color, '#FFFFFF');
  assert.equal(image.props.cachePolicy, 'memory-disk'); assert.equal(image.props.recyclingKey, 'jp-store');
  s.resize(430); assert.equal(cards()[0].props.style.width, 430 * 0.75);
  s.home(); await s.settle(); assert.equal(s.homes().length, 1);
  cards()[0].props.onPress();
  assert.equal(s.routes[0].pathname, '/(tabs)/places'); assert.equal(s.routes[0].params.venueId, 'jp-store');
  s.mountPlace(); await s.settle(); assert.equal(s.selectedTab(), '전체'); assert.equal(s.pages().length, 0);
  assert.equal(s.scoped().length, 1);
});

for (const config of [{ empty: true }, { fail: true }]) test(`home hides empty/failed venues: ${JSON.stringify(config)}`, async t => {
  const s = await app(t, config), home = s.home(); await s.settle(); assert.equal(home.tree, null);
  s.home(); await s.settle(); assert.equal(s.homes().length, 1, 'empty/error cache prevents duplicate requests');
});

test('mounted Compiler home ko→ja→ko and system update labels/server names, retain order and reuse language caches', async t => {
  const s = await app(t), home = s.home(); await s.settle(); const slots = home.slots;
  for (const [preference, label, code] of [['ja','ポップアップ 12件','ja'],['ko','팝업 12개','ko'],['system','ポップアップ 12件','ja']]) {
    await s.language.setLanguagePreference(preference); await s.settle();
    assert.match(texts(home.tree), new RegExp(label)); assert.match(texts(home.tree), new RegExp(`한국 백화점:${code}`));
    assert.equal(home.slots, slots); assert.deepEqual(nodes(home.tree).filter(n => n.type === 'Pressable').map(n => n.key), ['jp-store','kr-store']);
  }
  s.system('ko-KR'); await s.settle(); assert.match(texts(home.tree), /팝업 12개/);
  assert.equal(s.homes().length, 2); assert.equal(s.routes.length, 0);
});

test('late home responses stay in their original language cache', async t => {
  const s = await app(t, { slow: true }), home = s.home();
  await s.language.setLanguagePreference('ja'); await s.settle();
  s.homes()[0].resolve({ venues: [{ ...venues[0], name: '한국어 응답' }] }); await s.settle(); assert.equal(home.tree, null);
  s.homes()[1].resolve({ venues: [{ ...venues[0], name: '日本語の応答' }] }); await s.settle(); assert.match(texts(home.tree), /日本語の応答/);
});

test('cold venue entry loads one entire server-ordered list with existing cards and detail navigation, no cursor or general query', async t => {
  const s = await app(t, { initialEntry: venueEntry() }); s.mountPlace(); await s.settle();
  assert.equal(s.selectedTab(), '전체'); assert.equal(s.pages().length, 0); assert.equal(s.scoped().length, 1);
  assert.deepEqual([...s.scoped()[0].query.searchParams], [['venueId','kr-store'],['languageCode','ko']]);
  assert.deepEqual(s.list().data.map(p => p.publicId), Array.from({ length: 12 }, (_, i) => `kr-store-${i}`));
  const card = s.list().renderItem({ item: s.list().data[0] }); assert.equal(card.type, 'PopupGridCard');
  card.props.onPress(card.props.item); assert.deepEqual(s.opened, ['kr-store-0']);
  s.ui.renderAll(); await s.settle(); assert.equal(s.scoped().length, 1, 'detail return retains selected venue');
  s.list().onEndReached(); await s.settle(); assert.equal(s.scoped().length, 1); assert.equal(s.pages().length, 0);
  assert.deepEqual(s.find('QuickFilterBar').props.selectedFilters.countries, []);
  assert.deepEqual(s.find('QuickFilterBar').props.selectedFilters.quickFeatures, []);
  assert.equal(s.find('PlaceWeeklySection').props.isActive, false);
});

test('venue replaces retained filters and ignores an obsolete general response', async t => {
  const s = await app(t, { slow: true }); s.mountPlace(); s.tab('전체');
  s.open(); s.sheet().onToggleCountry('JP'); s.sheet().onToggleTag(5); s.sheet().onToggleRegion(1);
  s.sheet().onToggleStatus('ENDED'); s.sheet().onToggleFeature('benefit');
  s.sheet().onDatePeriodChange({ mode: 'custom', startDate: '2026-10-01', endDate: '2026-10-02' }); s.sheet().onApply();
  s.find('TextInput').props.onChangeText('old query');
  const old = s.pages().at(-1), count = s.pages().length;
  s.enter(venueEntry()); await s.settle();
  assert.equal(old.signal.aborted, true); assert.equal(s.pages().length, count); assert.equal(s.scoped().length, 1);
  assert.equal(s.find('TextInput').props.value, ''); assert.equal(s.sheet().visible, false);
  assert.deepEqual(s.sheet().quickFilters.countries, []);
  assert.deepEqual(s.sheet().filters.regionIds, []); assert.deepEqual(s.sheet().filters.tagIds, []);
  assert.equal(s.sheet().filters.status, undefined); assert.equal(s.sheet().datePeriod.mode, 'all');
  old.resolve({ popups: [popup('obsolete')], nextCursor: 'old-cursor' });
  s.scoped()[0].resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('venue-only')] }); await s.settle();
  assert.deepEqual(s.list().data.map(p => p.publicId), ['venue-only']);
});

test('selecting another venue cancels old response; empty list never falls back to general rows', async t => {
  const s = await app(t, { initialEntry: venueEntry(), slow: true }); s.mountPlace();
  const old = s.scoped()[0]; s.enter(venueEntry('jp-store','venue-2')); await s.settle();
  assert.equal(old.signal.aborted, true); assert.equal(s.scoped().length, 2);
  old.resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('obsolete')] });
  s.scoped()[1].resolve({ venueId: 'jp-store', popupCount: 0, popups: [] }); await s.settle();
  assert.deepEqual(s.list().data, []); assert.equal(s.pages().length, 0); assert.match(texts(s.list().ListEmptyComponent), /조건에 맞는 팝업|팝업/);
});

for (const action of ['country','tag','region','period','reset','feature','explore','search','bottom','reselect','category']) {
  test(`${action} exits venue mode and resumes general browsing`, async t => {
    const s = await app(t, { initialEntry: venueEntry() }); s.mountPlace(); await s.settle();
    if (action === 'country') s.find('QuickFilterBar').props.onToggleCountry('JP');
    else if (['tag','region','period','reset'].includes(action)) {
      s.open();
      if (action === 'tag') s.sheet().onToggleTag(5);
      if (action === 'region') s.sheet().onToggleRegion(1);
      if (action === 'period') s.sheet().onDatePeriodChange({ mode: 'today', startDate: null, endDate: null });
      if (action === 'reset') s.sheet().onReset();
      s.sheet().onApply();
    } else if (action === 'feature') s.find('QuickFilterBar').props.onToggleFeature('benefit');
    else if (action === 'explore') { s.tab('탐색'); s.tab('전체'); }
    else if (action === 'search') s.find('TextInput').props.onChangeText('general');
    else if (action === 'bottom') s.enter({ placeBrowseEntry: 'browse-1' });
    else if (action === 'reselect') { s.list().onScroll({ nativeEvent: { contentOffset: { y: 100 } } }); s.list().ref.current = { scrollToOffset() {} }; s.reselect(); }
    else s.enter({ homeCategoryEntry: 'category-1', homeVenueEntry: '', tagId: '5' });
    await s.settle();
    assert.equal(s.scoped().length, 1); assert.ok(s.pages().length >= 1);
    assert.deepEqual(s.list().data.map(p => p.publicId), ['general']);
    const query = s.pages().at(-1).query.searchParams;
    if (action === 'country') assert.equal(query.get('countryCode'), 'JP');
    if (['tag','category'].includes(action)) assert.equal(query.get('tagIds'), '5');
    if (action === 'region') assert.equal(query.get('regionIds'), '1');
    if (action === 'feature') assert.equal(query.get('hasBenefits'), 'true');
    if (action === 'period') assert.equal(query.get('visitPeriod'), 'today');
    const count = s.scoped().length; s.ui.renderAll(); await s.settle(); assert.equal(s.scoped().length, count);
  });
}

test('cancelled/invalid draft retains venue; valid apply resumes general query', async t => {
  const s = await app(t, { initialEntry: venueEntry() }); s.mountPlace(); await s.settle();
  s.open(); s.sheet().onToggleTag(5); s.sheet().onClose(); await s.settle(); assert.equal(s.pages().length, 0);
  s.open(); s.sheet().onDatePeriodChange({ mode: 'custom', startDate: null, endDate: null }); s.sheet().onApply();
  await s.settle(); assert.equal(s.pages().length, 0); assert.equal(s.scoped().length, 1);
});

test('venue localized requests preserve selection, discard reversed language responses, and respond to system language', async t => {
  const s = await app(t, { initialEntry: venueEntry(), slow: true }); s.mountPlace();
  const ko = s.scoped()[0]; await s.language.setLanguagePreference('ja'); await s.settle();
  assert.equal(ko.signal.aborted, true); const ja = s.scoped()[1];
  ja.resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('venue','ja')] }); await s.settle();
  assert.equal(s.list().data[0].name, 'venue:ja'); assert.equal(ja.query.searchParams.get('languageCode'), 'ja');
  ko.resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('old','ko')] }); await s.settle();
  assert.equal(s.list().data[0].name, 'venue:ja');
  await s.language.setLanguagePreference('ko'); await s.settle();
  s.scoped().at(-1).resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('venue','ko')] }); await s.settle();
  assert.equal(s.list().data[0].name, 'venue:ko'); assert.equal(s.pages().length, 0); assert.equal(s.selectedTab(), '전체');
  await s.language.setLanguagePreference('system'); await s.settle(); assert.equal(s.scoped().at(-1).query.searchParams.get('languageCode'), 'ja');
  s.system('ko-KR'); await s.settle(); assert.equal(s.scoped().at(-1).query.searchParams.get('languageCode'), 'ko');
  assert.equal(s.scoped().at(-1).query.searchParams.get('venueId'), 'kr-store');
  if (s.bailouts.length) console.log('PlaceScreen: existing ref usage causes Compiler bailout; mounted behavior verified after transform.');
});

test('venue errors use existing retry UI and retry only the selected venue API', async t => {
  const s = await app(t, { initialEntry: venueEntry(), fail: true }); s.mountPlace(); await s.settle();
  assert.deepEqual(s.list().data, []); assert.match(texts(s.list().ListEmptyComponent), /불러오지/);
  const retry = nodes(s.list().ListFooterComponent).find(n => n.type === 'Pressable'); retry.props.onPress(); await s.settle();
  assert.equal(s.scoped().length, 2); assert.equal(s.pages().length, 0);
});

test('leaving venue cancels its in-flight request, ignores late rows, and permits a new explicit entry', async t => {
  const s = await app(t, { initialEntry: venueEntry(), slow: true }); s.mountPlace();
  const old = s.scoped()[0]; s.find('QuickFilterBar').props.onToggleCountry('JP'); await s.settle();
  assert.equal(old.signal.aborted, true);
  s.pages().at(-1).resolve({ popups: [popup('general')], nextCursor: null });
  old.resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('late-venue')] }); await s.settle();
  assert.deepEqual(s.list().data.map(p => p.publicId), ['general']);
  s.enter({ placeBrowseEntry: 'browse-1' }); s.enter(venueEntry('kr-store','venue-2')); await s.settle();
  assert.equal(s.scoped().length, 2); assert.equal(s.selectedTab(), '전체');
});

test('unmount aborts selected venue request', async t => {
  const s = await app(t, { initialEntry: venueEntry(), slow: true }); s.mountPlace();
  const pending = s.scoped()[0]; s.ui.dispose(); assert.equal(pending.signal.aborted, true);
  pending.resolve({ venueId: 'kr-store', popupCount: 1, popups: [popup('late')] }); await s.settle();
});

test('existing compiled popup card renders an upcoming popup without endDate and translates pending date without losing state', async t => {
  const file = 'src/components/place/PopupGridCard.tsx';
  const ui = runtime({
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s },
      useWindowDimensions: () => ({ fontScale: 1 }) },
    'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'lucide-react-native': { Heart: 'Heart' },
    'src/hooks/usePlaceCoverImage.ts': { usePlaceCoverImage: () => ({ source: null, onError() {}, onLoad() {} }) },
  }, { transform: compilerTransform([file, 'src/hooks/useTranslation.ts']) });
  t.after(() => ui.dispose());
  const language = ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ja-JP'] });
  const Card = ui.load(file).default, item = { ...popup('upcoming'), startDate: '2027-01-01', endDate: null };
  const props = { item, width: 170, isFavorite: false, isFavoriteDisabled: false, onToggleFavorite() {} };
  const card = ui.mount(() => Card(props));
  assert.match(texts(card.tree), /27.01.01 ~ 일정 미정/);
  for (const [preference, pending] of [['ja','日程未定'],['ko','일정 미정'],['system','日程未定']]) {
    await language.setLanguagePreference(preference);
    assert.match(texts(card.tree), new RegExp(`27.01.01 ~ ${pending}`));
    assert.equal(props.item, item); assert.equal(props.isFavorite, false);
  }
});
