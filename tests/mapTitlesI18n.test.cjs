const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app } = require('./helpers/mapI18nRuntime.cjs');
const { nodes, texts } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const screenFile = 'src/screens/MapScreen.native.tsx';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const rows = language => [
  { id: 'kr', name: language === 'ko' ? '한국 팝업' : '韓国ポップアップ', latitude: 37.5445, longitude: 127.056,
    primaryTag: '뷰티', tags: [{ id: 5, name: '뷰티' }], coverImageUrl: null, startDate: null, endDate: null },
  { id: 'jp', name: language === 'ko' ? '일본 팝업' : '日本ポップアップ', latitude: 35.68, longitude: 139.76,
    primaryTag: '뷰티', tags: [{ id: 5, name: '뷰티' }], coverImageUrl: null, startDate: null, endDate: null },
  { id: 'fallback', name: 'Original fallback', latitude: 37.545, longitude: 127.056,
    primaryTag: '뷰티', tags: [{ id: 5, name: '뷰티' }], coverImageUrl: null, startDate: null, endDate: null },
];

async function setup({ compiled = false } = {}) {
  const requests = [], bailouts = [];
  const s = await app({ realMap: true,
    transform: compiled ? compilerTransform([screenFile, 'src/hooks/useTranslation.ts', 'src/hooks/useMapPopups.ts'],
      { allowBailout: [screenFile], onBailout: file => bailouts.push(file) }) : undefined,
    fetch: (url, init) => {
      const wait = deferred(), parsed = new URL(url);
      requests.push({ url: parsed, signal: init.signal, ...wait });
      return wait.promise.then(popups => new Response(JSON.stringify({ popups })));
    },
  });
  const Screen = s.load(screenFile).default, root = s.mount(() => Screen());
  const find = type => nodes(root.tree).find(n => n.type === type);
  const markers = () => nodes(root.tree).filter(n => n.type === 'Marker');
  const marker = id => markers().find(n => n.key.startsWith(`${id}-`));
  const mapRequests = () => requests.filter(r => r.url.pathname.endsWith('/map'));
  const searches = () => requests.filter(r => r.url.pathname.endsWith('/search'));
  const finishMap = async () => { const r = mapRequests().at(-1); r.resolve(rows(r.url.searchParams.get('languageCode'))); await s.settle(); };
  const finishSearch = async () => { const r = searches().at(-1); r.resolve(rows(r.url.searchParams.get('languageCode'))); await s.settle(); };
  const debounce = () => { const pending = [...s.timers.values()]; s.timers.clear(); pending.forEach(t => t.fn()); };
  const startSearch = () => { find('TextInput').props.onFocus(); find('TextInput').props.onChangeText('팝업'); debounce(); };
  find('MapView').props.ref.current = { animateToRegion: r => s.camera.push(r) };
  const region = find('MapView').props.initialRegion;
  find('MapView').props.onRegionChangeComplete({ ...region, latitudeDelta: 0.007, longitudeDelta: 0.007 }, { isGesture: false });
  return { ...s, root, find, markers, marker, requests, mapRequests, searches, finishMap, finishSearch, debounce, startSearch, bailouts };
}

test('compiled retained map uses ko/ja/system server names, keeps selection/camera/filter/query, and leaves Google search unchanged', async () => {
  const s = await setup({ compiled: true });
  try {
    await s.finishMap();
    const map = s.find('MapView'), initialRegion = map.props.initialRegion;
    nodes(s.root.tree).find(n => n.type === 'Pressable' && texts(n) === '뷰티').props.onPress();
    s.marker('kr').props.onPress();
    nodes(s.marker('kr')).find(n => n.props.onLayout).props.onLayout({ nativeEvent: { layout: { height: 100 } } });
    assert.equal(s.marker('kr').props.anchor.y, 0.4);
    assert.equal(s.find('Preview').props.popup.name, '한국 팝업');
    s.startSearch(); await s.finishSearch();
    assert.equal(s.find('SearchOverlay').props.search.results[1].name, '일본 팝업');
    const googleCalls = s.calls.filter(c => Array.isArray(c) && c[0] === 'autocomplete').length;
    for (const [preference, language, title] of [['ja', 'ja', '韓国ポップアップ'], ['ko', 'ko', '한국 팝업'], ['system', 'ja', '韓国ポップアップ']]) {
      await s.language(preference);
      assert.equal(s.markers().length, 0, 'previous-language titles are hidden during loading');
      assert.equal(s.find('Preview'), undefined);
      assert.deepEqual(s.find('SearchOverlay').props.search.results, []);
      s.debounce(); await s.finishMap(); await s.finishSearch();
      assert.ok(texts(s.marker('kr')).includes(title));
      assert.equal(s.marker('kr').key, `kr-true-${language}`);
      assert.equal(s.marker('kr').props.tracksViewChanges, false);
      assert.equal(s.marker('kr').props.zIndex, 1);
      assert.equal(s.marker('kr').props.anchor.y, 0.5, 'old title measurement is not reused');
      assert.equal(s.find('Preview').props.popup.name, title);
      assert.equal(s.find('TextInput').props.value, '팝업');
      assert.equal(s.find('SearchOverlay').props.search.results[0].name, title);
      assert.ok(texts(s.marker('fallback')).includes('Original fallback'));
      const selected = nodes(s.root.tree).filter(n => n.props.accessibilityState?.selected);
      assert.equal(selected.length, 1); assert.equal(selected[0].key, '뷰티');
      assert.equal(s.find('MapView').props.ref, map.props.ref);
      assert.equal(s.find('MapView').props.initialRegion, initialRegion);
      assert.deepEqual(s.camera, []);
      assert.equal(s.calls.filter(c => Array.isArray(c) && c[0] === 'autocomplete').length, googleCalls);
    }
    s.system('ko-KR'); await s.finishMap(); s.debounce(); await s.finishSearch();
    assert.ok(texts(s.marker('kr')).includes('한국 팝업'));
    // Compiler may retain the screen's existing bailout; the translation hook and map hook are compiled.
    assert.ok(s.bailouts.every(file => file === screenFile));
  } finally { s.dispose(); }
});

test('reversed language and query responses cannot overwrite current map, preview or popup search results', async () => {
  const s = await setup();
  try {
    await s.finishMap(); s.marker('kr').props.onPress(); s.startSearch();
    const oldSearch = s.searches().at(-1);
    await s.language('ja'); s.debounce();
    const oldMap = s.mapRequests().at(-1), jaSearch = s.searches().at(-1);
    await s.language('ko'); s.debounce();
    assert.equal(oldMap.signal.aborted, true); assert.equal(oldSearch.signal.aborted, true); assert.equal(jaSearch.signal.aborted, true);
    await s.finishMap(); await s.finishSearch();
    oldMap.resolve(rows('ja')); oldSearch.resolve(rows('ja')); jaSearch.resolve(rows('ja')); await s.settle();
    assert.equal(s.find('Preview').props.popup.name, '한국 팝업');
    assert.equal(s.find('SearchOverlay').props.search.results[0].name, '한국 팝업');
    s.find('TextInput').props.onChangeText('이전 검색'); s.debounce();
    const stale = s.searches().at(-1);
    s.find('TextInput').props.onChangeText('새 검색'); s.debounce();
    s.searches().at(-1).resolve([{ ...rows('ko')[0], name: '최신 검색' }]); await s.settle();
    stale.resolve([{ ...rows('ko')[0], name: '오래된 검색' }]); await s.settle();
    assert.equal(s.find('SearchOverlay').props.search.results[0].name, '최신 검색');
    assert.equal(s.find('TextInput').props.value, '새 검색');
  } finally { s.dispose(); }
});

test('Japan coordinates use Korean names and an open list refreshes names without changing country or camera', async () => {
  const s = await setup();
  try {
    await s.finishMap();
    s.find('MapView').props.onRegionChangeComplete({ latitude: 35.68, longitude: 139.76, latitudeDelta: 0.007, longitudeDelta: 0.007 }, { isGesture: true });
    assert.ok(texts(s.marker('jp')).includes('일본 팝업'));
    assert.deepEqual(s.marker('jp').props.coordinate, { latitude: 35.68, longitude: 139.76 });
    s.find('ScrollView').props.onLayout({ nativeEvent: { layout: { y: 100, height: 36 } } });
    nodes(s.root.tree).find(n => n.type === 'Pressable' && texts(n).includes('이 지역 팝업')).props.onPress();
    assert.equal(s.find('ListSheet').props.popups[0].name, '일본 팝업');
    await s.language('ja'); assert.deepEqual(s.find('ListSheet').props.popups, []);
    await s.finishMap(); assert.equal(s.find('ListSheet').props.popups[0].name, '日本ポップアップ');
    assert.equal(s.marker('jp').key, 'jp-false-ja'); assert.deepEqual(s.camera, []);
    for (const r of s.requests) {
      assert.ok(['ko', 'ja'].includes(r.url.searchParams.get('languageCode')));
      assert.equal(r.url.searchParams.has('countryCode'), false);
    }
  } finally { s.dispose(); }
});

test('failed new-language read hides old titles and preserves selected ID for manual retry', async () => {
  const s = await setup();
  try {
    await s.finishMap(); s.marker('kr').props.onPress();
    await s.language('ja'); s.mapRequests().at(-1).reject(new TypeError('offline')); await s.settle();
    assert.deepEqual(s.markers(), []); assert.equal(s.find('Preview'), undefined);
    s.find('ScrollView').props.onLayout({ nativeEvent: { layout: { y: 100, height: 36 } } });
    nodes(s.root.tree).find(n => n.type === 'Pressable' && texts(n).includes('このエリアのポップアップ')).props.onPress();
    assert.equal(s.find('ListSheet').props.status, 'error');
    s.find('ListSheet').props.onRetry(); await s.finishMap();
    nodes(s.root.tree).find(n => n.type === 'Pressable' && texts(n) === '地図に戻る').props.onPress();
    assert.equal(s.marker('kr').key, 'kr-true-ja');
    assert.equal(s.find('Preview').props.popup.name, '韓国ポップアップ');
  } finally { s.dispose(); }
});
