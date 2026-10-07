// Native components/events are mocked; these tests do not replace device camera tests.
// Run: node --test tests/mapSearch.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: false,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

const camera = load('src/lib/mapPlaceCamera.ts');
const initial = { latitude: 37.5445, longitude: 127.056, latitudeDelta: 0.025, longitudeDelta: 0.025 };
const resolved = { placeId: 'seoul', latitude: 37.56, longitude: 126.97,
  viewport: { south: 37.4, north: 37.7, west: 126.8, east: 127.2 }, types: [], attributions: [] };
const suggestion = { placeId: 'seoul', title: '서울', subtitle: '대한민국', types: [] };
const popup = { id: 'p1', publicId: 'public-p1', name: '원피스', latitude: 37.56, longitude: 126.97,
  primaryTag: '캐릭터/IP', tags: [{ name: '캐릭터/IP' }] };
const popupB = { ...popup, id: 'p2', name: '산리오', latitude: 35.68, longitude: 139.76 };
const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx };
const native = {
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', TextInput: 'TextInput',
  StyleSheet: { create: (s) => s }, Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 390, height: 844 }) }, useWindowDimensions: () => ({ height: 844 }),
  Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
  Alert: { alert() {} }, Linking: { openURL: async () => {} },
  Easing: { out: (v) => v, cubic: 0 },
  Animated: {
    View: 'AnimatedView',
    Value: class { interpolate() { return 0; } stopAnimation() {} },
    timing: () => ({ start: (callback) => callback?.({ finished: true }) }),
  },
};
const theme = { colors: {}, typography: {} };
const overlayModule = load('src/components/map/MapSearchOverlay.tsx', {
  'react/jsx-runtime': runtime, 'react-native': native, 'lucide-react-native': { MapPin: 'MapPin' },
  '../../theme/tokens': theme,
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).filter(Boolean).join(' ');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : '';
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

// Small hook driver executes the real screen callbacks/effects, with native I/O replaced.
function screen(mapRequest = async () => [popup, popupB]) {
  const slots = []; let cursor = 0, dirty = true, tree; const effects = [];
  const timers = new Map(); let timerId = 0, tokens = 0;
  let routeParams = {};
  const calls = { popup: [], autocomplete: [], resolve: [], camera: [] };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initialValue) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[i].value, (next) => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(value) { const i = cursor++; return (slots[i] ??= { current: value }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const request = (kind, input, signal) => {
    const d = deferred(); calls[kind].push({ input, signal, ...d }); return d.promise;
  };
  hooks.useCallback = (fn, deps) => hooks.useMemo(() => fn, deps);
  const mapData = load('src/hooks/useMapPopups.ts', {
    react: hooks, 'expo-router': { useFocusEffect() {} },
    '../lib/popups': { getPopupMap: mapRequest },
  });
  const Screen = load('src/screens/MapScreen.native.tsx', {
    '../hooks/useMapPopups': mapData,
    '../hooks/usePopupNavigation': { usePopupNavigation: () => () => {} },
    'react': hooks, 'react/jsx-runtime': runtime, 'react-native': native,
    '@expo/vector-icons': { MaterialIcons: 'MaterialIcons' },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: false }) },
    'expo-modules-core': { uuid: { v4: () => `token-${++tokens}` } },
    'expo-router': {
      useRouter: () => ({ setParams: (params) => { routeParams = { ...routeParams, ...params }; dirty = true; } }),
      useLocalSearchParams: () => routeParams,
    }, 'lucide-react-native': {},
    'react-native-maps': { default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 40, bottom: 20 }) },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Path: 'Path' },
    'supercluster': { default: class { load() {} getClusters() { return []; } } },
    '../lib/popups': { getPopupMap: async () => [popup, popupB], searchPopups: (q, s) => request('popup', q, s) },
    '../lib/placeSearch': {
      autocompletePlaces: (q, s) => request('autocomplete', q, s),
      resolvePlace: (q, s) => request('resolve', q, s),
    },
    '../lib/mapPlaceCamera': camera, '../locales': { getLocale: () => 'ko' },
    '../components/map/MapPopupListSheet': { default: 'ListSheet' },
    '../components/map/MapPopupPreviewCard': { default: 'Preview' },
    '../components/map/MapSearchOverlay': { default: 'SearchOverlay', GooglePlaceAttribution: 'Attribution' },
    '../theme/tokens': theme,
  }, {
    setTimeout: (fn, ms) => { assert.equal(ms, 300); timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id), console: { log() {} },
  }).default;
  function find(type) { return nodes(tree).find((node) => node.type === type); }
  function flush() {
    let loops = 0;
    while (dirty) {
      assert.ok(++loops < 40, 'render should settle'); dirty = false; cursor = 0;
      tree = Screen();
      find('MapView').props.ref.current = {
        animateToRegion: (r) => calls.camera.push(r),
        getMapBoundaries: async () => ({
          northEast: { latitude: 37.557, longitude: 127.069 },
          southWest: { latitude: 37.532, longitude: 127.043 },
        }),
      };
      find('TextInput').props.ref.current = { blur() {} };
      effects.splice(0).forEach((effect) => effect());
    }
  }
  async function settle() { await Promise.resolve(); await Promise.resolve(); flush(); }
  flush();
  return {
    calls, find, flush, settle,
    focus() { find('TextInput').props.onFocus(); flush(); },
    query(q) { find('TextInput').props.onChangeText(q); flush(); },
    clear() { nodes(tree).find((n) => n.props?.accessibilityLabel === '검색어 지우기').props.onPress(); flush(); },
    debounce() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
    overlay() { return find('SearchOverlay')?.props; },
    complete(region, isGesture = false) { find('MapView').props.onRegionChangeComplete(region, { isGesture }); flush(); },
    sheetOpen() { return text(tree).includes('지도로 돌아가기'); },
    tag(name) { nodes(tree).find((n) => n.type === 'Pressable' && text(n) === name).props.onPress(); flush(); },
    tagSelected(name) { return nodes(tree).find((n) => n.type === 'Pressable' && text(n) === name).props.accessibilityState.selected; },
    openList() { nodes(tree).find((n) => n.type === 'Pressable' && text(n).includes('이 지역 팝업')).props.onPress(); flush(); },
    enterFromDetail(id) { routeParams = { popupId: id }; dirty = true; flush(); },
    ready() { find('MapView').props.onMapReady(); flush(); },
    routeParams() { return routeParams; },
    dispose() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test('map exposes all eleven renamed categories and preserves marker appearance and filter selection', async () => {
  const s = screen(); await s.settle();
  const names = ['전체', '캐릭터/IP', '게임/디지털', '연예/크리에이터', '패션', '뷰티', 'F&B', '아트/전시', '문구/소품', '라이프', '패밀리/펫', '기타'];
  const chips = nodes(s.find('ScrollView')).filter(n => n.type === 'Pressable');
  assert.deepEqual(chips.map(text), names);
  s.enterFromDetail(popup.id); await s.settle();
  const marker = s.find('Marker'); assert.ok(marker);
  const icon = nodes(marker).find(n => n.type === 'MaterialIcons');
  assert.equal(icon.props.name, 'auto-awesome');
  assert.ok(nodes(marker).some(n => n.type === 'Path' && n.props.fill === '#8B5CF6'
    || n.type === 'View' && Object.assign({}, ...(Array.isArray(n.props.style) ? n.props.style : [n.props.style])).backgroundColor === '#8B5CF6'));
  s.tag('캐릭터/IP'); assert.equal(s.tagSelected('캐릭터/IP'), true);
  s.tag('게임/디지털');
  assert.equal(s.tagSelected('게임/디지털'), true);
  assert.equal(s.tagSelected('캐릭터/IP'), false);
  s.dispose();
});

test('viewport controls area; absent/invalid viewport falls back; bad coordinates rejected', () => {
  const region = camera.placeCameraRegion(resolved);
  assert.ok(region.latitudeDelta > 0.3 && region.longitudeDelta > 0.4);
  for (const viewport of [null, { south: 50, north: 10, west: 120, east: 130 }]) {
    assert.equal(camera.placeCameraRegion({ ...resolved, viewport }).latitudeDelta, 0.020);
  }
  assert.equal(camera.placeCameraRegion({ ...resolved, latitude: NaN }), null);
  assert.ok(camera.isPlaceCameraComplete({ ...region, latitudeDelta: region.latitudeDelta * 2 }, region));
  assert.ok(!camera.isPlaceCameraComplete({ ...region, longitude: 139 }, region));
  assert.ok(!camera.isPlaceCameraComplete({ ...region, latitudeDelta: 10, longitudeDelta: 10 }, region));
});

test('tiny station/building viewport uses the existing coordinate fallback as its minimum span', () => {
  const place = { ...resolved, latitude: 35.68, longitude: 139.76,
    viewport: { south: 35.679, north: 35.681, west: 139.759, east: 139.761 } };
  const region = camera.placeCameraRegion(place);
  assert.equal(region.latitude, 35.68);
  assert.equal(region.longitude, 139.76);
  assert.equal(region.latitudeDelta, 0.020);
  assert.equal(region.longitudeDelta, 0.020);
});

test('wide city viewport keeps its Google area and the existing ten percent padding', () => {
  const region = camera.placeCameraRegion(resolved);
  assert.ok(Math.abs(region.latitudeDelta - 0.33) < 1e-10);
  assert.ok(Math.abs(region.longitudeDelta - 0.44) < 1e-10);
});

test('viewport with only one narrow axis expands only that axis; missing viewport keeps fallback', () => {
  const place = { ...resolved,
    viewport: { south: 37.559, north: 37.561, west: 126.94, east: 127.0 } };
  const region = camera.placeCameraRegion(place);
  assert.equal(region.latitudeDelta, 0.020);
  assert.ok(Math.abs(region.longitudeDelta - 0.066) < 1e-10);
  assert.deepEqual(camera.placeCameraRegion({ ...place, viewport: null }), {
    latitude: place.latitude, longitude: place.longitude,
    latitudeDelta: 0.020, longitudeDelta: 0.020,
  });
});

test('parallel 300ms search: Korean/Japanese input, no requests under two characters, no typing camera move', async () => {
  const s = screen(); s.focus();
  for (const q of ['', ' ', '서']) { s.query(q); s.debounce(); }
  assert.equal(s.calls.popup.length, 0); assert.equal(s.calls.autocomplete.length, 0);
  for (const q of [' 서울 ', '더현대 서울', '잠실역', '渋谷', '東京駅']) {
    s.query(q); s.debounce();
    assert.equal(s.calls.popup.at(-1).input, q.trim());
    assert.equal(s.calls.autocomplete.at(-1).input.query, q.trim());
    assert.equal(s.calls.autocomplete.at(-1).input.sessionToken, 'token-1');
  }
  s.calls.popup.at(-1).resolve([popup]); await s.settle();
  assert.equal(s.overlay().search.results[0].id, popup.id);
  assert.equal(s.overlay().places.status, 'loading');
  assert.equal(s.calls.camera.length, 0); assert.equal(s.calls.resolve.length, 0);
  s.dispose();
});

test('stale successes/errors cannot overwrite new query, close aborts and refocus keeps query with new token', async () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  const old = s.calls.autocomplete[0];
  s.query('서울역'); s.debounce(); s.query('잠실'); s.debounce();
  s.calls.autocomplete[2].resolve([{ ...suggestion, title: '잠실' }]); await s.settle();
  old.resolve([suggestion]); s.calls.autocomplete[1].reject(new Error('late')); await s.settle();
  assert.equal(s.overlay().places.results[0].title, '잠실'); assert.ok(old.signal.aborted);
  s.find('MapView').props.onPanDrag(); s.flush();
  assert.equal(s.overlay(), undefined); assert.equal(s.find('TextInput').props.value, '잠실');
  s.focus(); s.debounce();
  assert.equal(s.calls.autocomplete.at(-1).input.sessionToken, 'token-2'); s.dispose();
});

for (const error of ['place_search_disabled', 'place_search_not_configured', 'upstream_error']) {
  test(`${error}: Google hidden, POPKU results independent`, async () => {
    const s = screen(); s.focus(); s.query('서울'); s.debounce();
    s.calls.popup[0].resolve([popup]); s.calls.autocomplete[0].reject(new Error(error)); await s.settle();
    assert.equal(s.overlay().places.status, 'hidden'); assert.equal(s.overlay().search.results.length, 1); s.dispose();
  });
}

test('Google arrives first, popup error does not remove Google results', async () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  s.calls.autocomplete[0].resolve([suggestion]); await s.settle();
  assert.equal(s.overlay().places.results.length, 1); assert.equal(s.overlay().search.status, 'loading');
  s.calls.popup[0].reject(new Error('popup error')); await s.settle();
  assert.equal(s.overlay().places.results.length, 1); assert.equal(s.overlay().search.status, 'error'); s.dispose();
});

test('resolve uses session token; sheet waits for target completion and opens with zero popups, tag retained', async () => {
  const s = screen(); await s.settle(); s.tag('뷰티'); s.focus(); s.query('서울'); s.debounce();
  const selecting = s.overlay().onSelectPlace(suggestion);
  assert.equal(s.calls.resolve[0].input.sessionToken, s.calls.autocomplete[0].input.sessionToken);
  s.calls.resolve[0].resolve(resolved); await selecting; await s.settle();
  assert.equal(s.find('TextInput').props.value, '서울'); assert.equal(s.overlay(), undefined);
  assert.equal(s.sheetOpen(), false); assert.equal(s.calls.camera.length, 1);
  s.complete(initial); assert.equal(s.sheetOpen(), false);
  s.complete(s.calls.camera[0]); assert.equal(s.sheetOpen(), true);
  s.find('ScrollView').props.onLayout({ nativeEvent: { layout: { y: 100, height: 36 } } }); s.flush();
  assert.deepEqual(s.find('ListSheet').props.popups, []); s.dispose();
});

test('completed viewport recomputes visible popups before opening sheet', async () => {
  const s = screen(); await s.settle(); s.focus(); s.query('서울'); s.debounce();
  const selecting = s.overlay().onSelectPlace(suggestion); s.calls.resolve[0].resolve(resolved);
  await selecting; await s.settle(); s.complete(s.calls.camera[0]);
  s.find('ScrollView').props.onLayout({ nativeEvent: { layout: { y: 100, height: 36 } } }); s.flush();
  assert.equal(s.sheetOpen(), true); assert.equal(s.find('ListSheet').props.popups[0].id, popup.id); s.dispose();
});

test('same stationary camera opens sheet without needing a missing native completion event', async () => {
  const s = screen(); s.complete({ ...initial, latitudeDelta: 0.020, longitudeDelta: 0.020 });
  s.focus(); s.query('성수'); s.debounce();
  const selecting = s.overlay().onSelectPlace(suggestion);
  s.calls.resolve[0].resolve({ ...resolved, ...initial, viewport: null }); await selecting; await s.settle();
  assert.equal(s.calls.camera.length, 0); assert.equal(s.sheetOpen(), true); s.dispose();
});

test('gesture cancels pending camera action; stale resolve after query change never moves map', async () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  const stale = s.overlay().onSelectPlace(suggestion); s.query('잠실');
  s.calls.resolve[0].resolve(resolved); await stale; await s.settle(); assert.equal(s.calls.camera.length, 0);
  const selecting = s.overlay().onSelectPlace(suggestion); s.calls.resolve[1].resolve(resolved);
  await selecting; await s.settle(); s.find('MapView').props.onPanDrag(); s.complete(s.calls.camera[0]);
  assert.equal(s.sheetOpen(), false); s.dispose();
});

test('resolve failure preserves popup results and map; repeated taps issue only one resolve', async () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  s.calls.popup[0].resolve([popup]); await s.settle();
  const first = s.overlay().onSelectPlace(suggestion); await s.overlay().onSelectPlace(suggestion);
  assert.equal(s.calls.resolve.length, 1); s.calls.resolve[0].reject(new Error('timeout'));
  await first; await s.settle();
  assert.ok(s.overlay().resolveError); assert.equal(s.overlay().search.results.length, 1);
  assert.equal(s.calls.camera.length, 0); s.dispose();
});

test('map failure retries through the existing list; recovered markers, selection and preview work', async () => {
  const requests = [];
  const s = screen(signal => { const wait = deferred(); requests.push({ signal, ...wait }); return wait.promise; });
  requests[0].reject(new Error('offline')); await new Promise(resolve => setImmediate(resolve)); s.flush();
  s.find('ScrollView').props.onLayout({ nativeEvent: { layout: { y: 100, height: 36 } } }); s.flush();
  s.openList(); assert.equal(s.find('ListSheet').props.status, 'error');
  s.find('ListSheet').props.onRetry(); s.find('ListSheet').props.onRetry();
  assert.equal(requests.length, 2);
  requests[1].resolve([popup, popupB]); await new Promise(resolve => setImmediate(resolve)); s.flush();
  s.complete({ ...initial, latitude: popup.latitude, longitude: popup.longitude });
  assert.equal(s.find('ListSheet').props.status, 'ready');
  assert.ok(s.find('ListSheet').props.popups.some(item => item.id === popup.id));
  s.focus(); s.query('popup'); await s.overlay().onSelect(popup); s.flush();
  if (s.calls.camera.length) s.complete(s.calls.camera[0]);
  assert.equal(s.find('Preview').props.popup.id, popup.id); assert.ok(s.find('Marker'));
  s.dispose();
});

test('popup selection resets hiding tag and waits for marker before preview', async () => {
  const s = screen(); await s.settle(); s.tag('뷰티'); s.focus(); s.query('원피스');
  await s.overlay().onSelect(popup); s.flush(); assert.equal(s.find('Preview'), undefined);
  s.complete(s.calls.camera[0]);
  assert.equal(s.find('Preview').props.popup.id, popup.id);
  assert.ok(s.find('Marker')); assert.equal(s.sheetOpen(), false); s.dispose();
});

test('detail A command selects its marker after camera completion and is consumed once', async () => {
  const s = screen(); await s.settle();
  s.enterFromDetail('p1');
  assert.equal(s.routeParams().popupId, undefined);
  assert.equal(s.calls.camera.length, 0);
  s.ready();
  assert.equal(s.calls.camera.length, 1);
  assert.equal(s.find('Preview'), undefined);
  assert.equal(s.calls.camera[0].latitudeDelta, initial.latitudeDelta);
  s.complete(s.calls.camera[0]);
  assert.equal(s.find('Preview').props.popup.id, 'p1');
  const moved = s.calls.camera.length;
  s.complete({ ...initial, latitude: 34.68, longitude: 135.76 }, true);
  s.flush(); // Returning to this mounted tab has no command left to process.
  assert.equal(s.calls.camera.length, moved);
  s.enterFromDetail('p2');
  assert.equal(s.calls.camera.length, moved + 1);
  s.complete(s.calls.camera.at(-1));
  assert.equal(s.find('Preview').props.popup.id, 'p2');
  s.dispose();
});

test('detail command closes search and list, keeps query, and reveals a popup hidden by tag', async () => {
  const s = screen(); await s.settle(); s.ready(); s.tag('뷰티'); s.focus(); s.query('서울');
  s.openList(); assert.equal(s.sheetOpen(), true);
  s.enterFromDetail('p1');
  assert.equal(s.overlay(), undefined);
  assert.equal(s.find('TextInput').props.value, '서울');
  assert.equal(s.sheetOpen(), false);
  assert.equal(s.tagSelected('전체'), true);
  s.complete(s.calls.camera[0]);
  assert.equal(s.find('Preview').props.popup.id, 'p1');
  assert.ok(nodes(s.find('Marker')).length > 0);
  s.dispose();
});

test('missing or invalid detail popup command ends without camera movement or retries', async () => {
  const s = screen(); await s.settle(); s.ready();
  s.enterFromDetail('missing'); await s.settle();
  assert.equal(s.calls.camera.length, 0);
  assert.equal(s.routeParams().popupId, undefined);
  s.enterFromDetail(''); await s.settle();
  assert.equal(s.calls.camera.length, 0);
  s.dispose();
});

test('detail map preview sends its public ID to the map tab; directions stays separate', async () => {
  const navigation = [];
  const detail = { publicId: 'p1', name: '원피스', latitude: popup.latitude, longitude: popup.longitude,
    address: '서울', tags: [], contentImageUrls: [], socialLinks: null };
  const slots = []; const effects = []; let cursor = 0, tree;
  const hooks = {
    useSyncExternalStore() { cursor++; return null; },
    useRef(value) { const i = cursor++; return (slots[i] ??= { current: value }); },
    useState(value) {
      const i = cursor++; if (!slots[i]) slots[i] = { value };
      return [slots[i].value, (next) => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || !deps.every((value, index) => Object.is(value, slots[i].deps[index]))) {
        slots[i] = { deps }; effects.push(effect);
      }
    },
  };
  const Detail = load('src/app/places/[id].tsx', {
    'react': hooks, 'react/jsx-runtime': runtime,
    'expo-clipboard': { setStringAsync: async () => {} },
    'expo-router': {
      useLocalSearchParams: () => ({ id: detail.publicId }),
      useRouter: () => ({ dismissTo: (href) => navigation.push(href) }),
    },
    'lucide-react-native': {},
    'react-native': { ...native, Image: 'Image', Share: { share: async () => {} },
      useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView',
      useSafeAreaInsets: () => ({ top: 40, bottom: 20 }) },
    '../../components/common/Tag': { default: 'Tag' },
    '../../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 12, FLOATING_TAB_BAR_HEIGHT: 60 },
    '../../components/place/PopupGuidanceCarousel': { default: 'GuidanceCarousel' },
    '../../components/place/PopupHeroImage': { default: 'HeroImage' },
    '../../components/place/IntroductionImageCarousel': { default: 'Carousel' },
    '../../components/place/OfficialChannelIcon': { default: 'OfficialChannelIcon' },
    '../../components/place/PopupDetailSkeleton': { default: 'Skeleton' },
    '../../components/place/PlaceMapPreview': { default: 'PlaceMapPreview', isMapPreviewAvailable: true },
    '../../components/place/PopupReviews': { default: 'PopupReviews' },
    '../../lib/auth': { getAuthUser: () => null, subscribeAuthUser: () => () => {}, getAuthSession: async () => ({ accessToken: null, generation: 0 }) },
    '../../lib/favorites': { favoritePopup: async () => {}, unfavoritePopup: async () => {} },
    '../../lib/popups': { getPopupDetail: async () => detail },
    '../../lib/popupStatus': { popupOperatingStatus: () => null },
    '../../locales': { t: (key) => key, getLocale: () => 'ko' },
    '../../lib/popupDetailContent': load('src/lib/popupDetailContent.ts', {}),
    '../../theme/tokens': load('src/theme/tokens.ts', {}),
    '../../../assets/images/ranking-placeholder.png': 1,
  }, { __DEV__: false }).default;
  cursor = 0; tree = Detail(); effects.splice(0).forEach((effect) => effect());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  cursor = 0; tree = Detail();
  const mapPreview = nodes(tree).find((node) => node.type === 'Pressable'
    && node.props.accessibilityLabel === '지도에서 팝업 보기');
  assert.ok(mapPreview);
  assert.ok(nodes(mapPreview).some((node) => node.type === 'PlaceMapPreview'));
  mapPreview.props.onPress();
  assert.deepEqual(navigation, [{ pathname: '/(tabs)/map', params: { popupId: 'p1' } }]);
  nodes(tree).find((node) => node.type === 'Pressable' && text(node).includes('길찾기')).props.onPress();
  assert.equal(navigation.length, 1);
});

test('Expo Router POP_TO removes detail and keeps the existing map tab route keys', () => {
  const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');
  const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter.js');
  const tabs = { type: 'tab', key: 'tabs', index: 0, routeNames: ['index', 'map'],
    routes: [{ key: 'home-key', name: 'index' }, { key: 'map-key', name: 'map' }],
    history: [{ type: 'route', key: 'home-key' }], preloadedRouteKeys: [] };
  const root = { type: 'stack', key: 'root', index: 1, routeNames: ['(tabs)', 'places/[id]'],
    routes: [{ key: 'existing-tabs-key', name: '(tabs)', state: tabs },
      { key: 'detail-key', name: 'places/[id]' }], preloadedRoutes: [] };
  const action = { type: 'POP_TO', payload: { name: '(tabs)',
    params: { screen: 'map', params: { popupId: 'p1' } } } };
  const rootRouter = StackRouter({ initialRouteName: '(tabs)' });
  const duplicate = rootRouter.getStateForAction(root, { ...action, type: 'NAVIGATE' },
    { routeParamList: {}, routeGetIdList: {} });
  assert.equal(duplicate.routes.length, 3); // The previous detail press did this.
  const nextRoot = rootRouter.getStateForAction(root, action,
    { routeParamList: {}, routeGetIdList: {} });
  assert.equal(nextRoot.routes.length, 1);
  assert.equal(nextRoot.routes[0].key, 'existing-tabs-key');
  assert.equal(nextRoot.routes[0].state, tabs);
  assert.equal(nextRoot.routes[0].params.screen, 'map');
  const nextTabs = TabRouter({ initialRouteName: 'index' }).getStateForAction(tabs,
    { type: 'NAVIGATE', payload: { name: 'map', params: { popupId: 'p1' } } },
    { routeParamList: {}, routeGetIdList: {} });
  assert.equal(nextTabs.index, 1);
  assert.equal(nextTabs.routes[1].key, 'map-key');
  assert.equal(nextTabs.routes[1].params.popupId, 'p1');
  const secondDetail = { ...nextRoot, index: 1,
    routes: [...nextRoot.routes, { key: 'detail-b', name: 'places/[id]' }] };
  const nextRootB = rootRouter.getStateForAction(secondDetail, { ...action,
    payload: { ...action.payload, params: { screen: 'map', params: { popupId: 'p2' } } } },
  { routeParamList: {}, routeGetIdList: {} });
  assert.deepEqual(nextRootB.routes.map((route) => route.key), ['existing-tabs-key']);
});

test('disabled during resolve quietly hides Google without losing popup results', async () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  s.calls.popup[0].resolve([popup]); s.calls.autocomplete[0].resolve([suggestion]); await s.settle();
  const selecting = s.overlay().onSelectPlace(suggestion);
  s.calls.resolve[0].reject(new Error('place_search_disabled')); await selecting; await s.settle();
  assert.equal(s.overlay().places.status, 'hidden'); assert.equal(s.overlay().resolveError, null);
  assert.equal(s.overlay().search.results.length, 1); assert.equal(s.calls.camera.length, 0); s.dispose();
});

test('map tap closes search preserving query and clear button clears the controlled input', () => {
  const s = screen(); s.focus(); s.query('서울'); s.debounce();
  s.find('MapView').props.onPress({ nativeEvent: { action: 'press' } }); s.flush();
  assert.equal(s.overlay(), undefined); assert.equal(s.find('TextInput').props.value, '서울');
  s.focus(); s.clear(); s.debounce();
  assert.equal(s.overlay(), undefined); assert.equal(s.find('TextInput').props.value, ''); s.dispose();
});

test('card sections, independent loading, combined empty state and branding', () => {
  const render = (popupStatus, popupResults, placeStatus, placeResults) => overlayModule.default({
    query: '서울', search: { status: popupStatus, results: popupResults },
    places: { status: placeStatus, results: placeResults }, resolvingPlaceId: null, resolveError: null,
    maxHeight: 360, onSelect() {}, onSelectPlace() {},
  });
  for (const args of [
    ['success', [], 'success', [suggestion]], ['success', [popup], 'success', []],
    ['loading', [], 'success', [suggestion]], ['success', [popup], 'loading', []],
  ]) assert.ok(!text(render(...args)).includes('검색 결과가 없어요'));
  assert.ok(text(render('success', [], 'success', [])).includes('검색 결과가 없어요'));
  const both = render('success', [popup], 'success', [suggestion]);
  assert.ok(text(both).indexOf('장소') < text(both).indexOf('팝업'));
  assert.equal(both.props.keyboardShouldPersistTaps, 'handled');
  assert.ok(nodes(both).some((n) => n.type === overlayModule.GooglePlaceAttribution));
  assert.ok(text(overlayModule.GooglePlaceAttribution({})).includes('Google Maps'));
});
