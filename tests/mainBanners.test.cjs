const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function load(file, mocks, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}

const popup = (id, country = 'KR') => ({ placeId: id, publicId: `public-${id}`, name: `Popup ${id}`,
  countryCode: country, regionId: null, regionName: null, startDate: null, endDate: null,
  coverImageUrl: `https://images.example/${id}?signed=true`, coverImageCacheKey: `cache-${id}` });

test('API follows current ko/ja locale, sends no country/auth, and preserves mixed server order and metadata', async () => {
  let language = 'ko';
  const calls = [];
  const data = [{ ...popup(3, 'JP'), backgroundColors: ['#B30609', '#FEC686', '#623641'] }, popup(1), popup(2, 'JP')];
  const api = load('src/lib/mainBanners.ts', {
    '../constants/api': { API_BASE_URL: 'https://api.example' },
    '../locales': { getLocale: () => language },
  }, { fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ popups: data }) }; } });
  const signal = new AbortController().signal;
  for (language of ['ko', 'ja']) {
    const result = await api.getMainBanners(signal);
    assert.equal(calls.at(-1).url, `https://api.example/api/main-banners?languageCode=${language}`);
    assert.deepEqual(calls.at(-1).init, { signal });
    assert.deepEqual(result.map(p => p.publicId), ['public-3', 'public-1', 'public-2']);
    assert.deepEqual(result.map(p => p.countryCode), ['JP', 'KR', 'JP']);
    assert.equal(result[0].coverImageUrl, data[0].coverImageUrl);
    assert.equal(result[0].coverImageCacheKey, data[0].coverImageCacheKey);
    assert.deepEqual(result[0].backgroundColors, data[0].backgroundColors);
    assert.equal(result[0].startDate, null);
    assert.equal(typeof result[0].coverImageFetchedAt, 'number');
  }
  assert.equal(data[0].coverImageFetchedAt, undefined, 'response objects are not mutated');
});

test('API accepts zero and seven banners and rejects failed/malformed responses', async () => {
  let reply = { ok: true, json: async () => ({ popups: [] }) };
  const api = load('src/lib/mainBanners.ts', {
    '../constants/api': { API_BASE_URL: 'https://api.example' }, '../locales': { getLocale: () => 'ko' },
  }, { fetch: async () => reply });
  const signal = new AbortController().signal;
  assert.deepEqual(await api.getMainBanners(signal), []);
  reply = { ok: true, json: async () => ({ popups: Array.from({ length: 7 }, (_, i) => popup(7 - i)) }) };
  assert.deepEqual((await api.getMainBanners(signal)).map(p => p.placeId), [7, 6, 5, 4, 3, 2, 1]);
  reply = { ok: true, json: async () => ({ popups: [{ ...popup(1), backgroundColors: ['invalid', null, 7] }] }) };
  assert.equal((await api.getMainBanners(signal)).length, 1, 'invalid colors reach the UI fallback without failing the banner API');
  reply = { ok: false };
  await assert.rejects(api.getMainBanners(signal), /request failed/);
  for (const body of [null, {}, { popups: {} }, { popups: [null] },
    { popups: [{ ...popup(1), publicId: '' }] }, { popups: [{ ...popup(1), coverImageUrl: 7 }] }]) {
    reply = { ok: true, json: async () => body };
    await assert.rejects(api.getMainBanners(signal), /Invalid main banner/);
  }
});

function driver() {
  const slots = []; let index = 0; const effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = { value: initial };
      return [slots[i].value, value => { slots[i].value = value; }];
    },
    useCallback(value, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value, deps };
      return slots[i].value;
    },
    useEffect(effect, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
    useSyncExternalStore(subscribe, snapshot) { react.useEffect(() => subscribe(() => {}), [subscribe]); return snapshot(); },
  };
  return { react, render(fn) { index = 0; const result = fn(); effects.splice(0).forEach(effect => effect()); return result; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function hookEnv() {
  let language = 'ko', now = 1000, respond = async () => [];
  const calls = [], timers = new Map(); let timerId = 0;
  // Each render uses a driver's hooks; the production module cache is shared.
  const react = {};
  const module = load('src/hooks/useHomeMainBanners.ts', {
    react, '../locales': { getLocale: () => language },
    '../lib/mainBanners': { getMainBanners: (signal, locale) => { calls.push({ signal, locale }); return respond(locale); } },
    '../lib/placeCoverRecovery': { COVER_URL_FRESH_MS: 240000 },
  }, { Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id) });
  return { calls, timers,
    respond(fn) { respond = fn; }, locale(value) { language = value; },
    advance() { now += 240001; const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.fn()); },
    render(d) { Object.assign(react, d.react); return d.render(module.useHomeMainBanners); } };
}

test('banner hook deduplicates home requests and keeps separate locale caches and server order', async () => {
  const env = hookEnv(), first = driver(), second = driver();
  env.respond(async locale => locale === 'ko' ? [popup(2, 'JP'), popup(1)] : [popup(1)]);
  assert.equal(env.render(first).status, 'loading');
  env.render(second);
  assert.equal(env.calls.length, 1);
  await flush();
  assert.deepEqual(env.render(first).popups.map(p => p.placeId), [2, 1]);
  env.locale('ja');
  assert.equal(env.render(first).status, 'loading');
  await flush();
  assert.deepEqual(env.render(first).popups.map(p => p.placeId), [1]);
  assert.deepEqual(env.calls.map(c => c.locale), ['ko', 'ja']);
  env.locale('ko');
  assert.deepEqual(env.render(first).popups.map(p => p.placeId), [2, 1]);
  assert.equal(env.calls.length, 2);
  first.dispose(); second.dispose();
});

test('banner hook isolates initial errors, retries, preserves stale data on refresh failure and clears empty selection', async () => {
  const env = hookEnv(), d = driver();
  env.respond(async () => { throw new Error('offline'); });
  env.render(d); await flush();
  assert.deepEqual(env.render(d), { status: 'error', popups: [] });
  env.respond(async () => [popup(1)]);
  env.advance(); await flush();
  assert.equal(env.render(d).status, 'ready');
  env.respond(async () => { throw new Error('refresh offline'); });
  env.advance(); await flush();
  assert.deepEqual(env.render(d).popups.map(p => p.placeId), [1]);
  env.respond(async () => []);
  env.advance(); await flush();
  assert.deepEqual(env.render(d), { status: 'ready', popups: [] });
  d.dispose();
});

const jsx = (type, props, key) => ({ type, props, key });
const { displayDate, formatPopupPeriod } = load('src/components/home/HomeNewPopupSection.tsx', {
  react: {}, 'react/jsx-runtime': { jsx, jsxs: jsx },
  'expo-router': { useRouter: () => ({ push() {} }) },
  'react-native': { StyleSheet: { create: value => value } },
  '../../hooks/useHomePopups': {}, '../../theme/tokens': { colors: {}, spacing: {}, typography: {} },
  '../../hooks/usePopupNavigation': { usePopupNavigation: () => () => {} },
  '../../hooks/usePopupFavorites': { usePopupFavorites: () => ({ isFavorite: () => false, isFavoriteDisabled: () => false, toggleFavorite() {} }) },
  '../../lib/popups': { currentWeekRange: () => { throw new Error('Pure date formatting must not request a week'); } },
  '../../lib/popupStatus': { popupOperatingStatus: () => { throw new Error('Pure date formatting must not derive a status'); } },
  '../common/MoreButton': { default: 'MoreButton' },
  '../common/FilterChips': {}, './HomePopupSkeleton': {}, './NewPopupCard': {},
  '../../../assets/images/ranking-placeholder.png': 'placeholder',
});
function bannerEnv() {
  let state = { status: 'ready', popups: [] }, width = 390, top = 59, sides = 0, id = 0;
  const taps = [], react = {}, instances = new Map();
  const Banner = load('src/components/home/HomeBanner.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-image': { Image: 'ExpoImage' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', Text: 'Text',
      useWindowDimensions: () => ({ width }), StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', top: 0 } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top, left: sides, right: sides, bottom: 0 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', RadialGradient: 'RadialGradient', Rect: 'Rect', Stop: 'Stop' },
    '../../hooks/useHomeMainBanners': { useHomeMainBanners: () => state },
    './HomeNewPopupSection': { displayDate, formatPopupPeriod },
    '../../theme/tokens': load('src/theme/tokens.ts', {}),
  }).default;
  function mount(element) {
    if (!element || typeof element.type !== 'function') return element;
    if (!instances.has(element.type)) instances.set(element.type, new Map());
    const entries = instances.get(element.type), key = element.key || 'default';
    if (!entries.has(key)) entries.set(key, driver());
    const d = entries.get(key);
    Object.assign(react, d.react, { useId: () => `:test${++id}:` });
    return d.render(() => element.type(element.props));
  }
  return { Banner, taps, mount, state(value) { state = value; }, width(value) { width = value; },
    insets(value, side = 0) { top = value; sides = side; },
    root(onPressPopup = value => taps.push(value)) { return Banner({ onPressPopup }); },
    render() { return mount(this.root()); } };
}
function parts(env) {
  const tree = env.render(), [scroll, pagination] = tree.props.children;
  return { tree, scroll, pagination, cards: scroll.props.children };
}
function poster(card) { return card.props.children[1].props.children; }
test('single banner keeps 380dp, contain poster, cache and publicId detail navigation', () => {
  const env = bannerEnv(); env.state({ status: 'ready', popups: [popup(1)] });
  const { tree, scroll, cards: [card], pagination } = parts(env);
  assert.equal(tree.props.style.height,380); assert.equal(scroll.props.scrollEnabled,false);
  assert.equal(card.props.style[1].width,390); assert.equal(card.props.accessibilityLabel,'Popup 1');
  const frame = env.mount(poster(card)), image = frame.props.children;
  assert.equal(image.props.contentFit,'contain'); assert.equal(image.props.blurRadius,undefined);
  assert.equal(image.props.style.opacity,undefined); assert.equal(image.props.style.borderRadius,12);
  assert.deepEqual(image.props.source,{ uri: popup(1).coverImageUrl, cacheKey: 'cache-1' });
  assert.equal(image.props.cachePolicy,'memory-disk');
  assert.equal(pagination.props.children.length,1);
  assert.equal(pagination.props.children[0].props.accessibilityState.selected,true);
  card.props.onPress(); assert.deepEqual(env.taps,['public-1']);
  image.props.onError(); assert.equal(env.mount(poster(card)),null);
});

test('background reuses original COVER/cache with strong blur and decorative overlay below poster', () => {
  const env = bannerEnv(); env.state({ status: 'ready',popups: [popup(1)] });
  const card = parts(env).cards[0], bg = env.mount(card.props.children[0]), [image,shade] = bg.props.children;
  assert.equal(bg.props.pointerEvents,'none'); assert.equal(bg.props.style[0].top,0);
  assert.equal(image.props.contentFit,'cover'); assert.equal(image.props.blurRadius,50);
  assert.equal(image.props.style.top,-32); assert.equal(image.props.style.bottom,-32);
  assert.equal(image.props.style.left,-32); assert.equal(image.props.style.right,-32);
  assert.deepEqual(image.props.source,env.mount(poster(card)).props.children.props.source);
  assert.equal(image.props.cachePolicy,'memory-disk');
  assert.equal(shade.props.style[1].backgroundColor,'rgba(0,0,0,0.28)');
  image.props.onError(); assert.equal(env.mount(card.props.children[0]).props.children[0],null);
  assert.equal(env.mount(poster(card)).props.children.type,'ExpoImage','background failure does not hide poster');
});

test('seven mixed banners preserve API order, full-width pages and move their own COVER background with poster', () => {
  const env = bannerEnv(), items = Array.from({ length:7 },(_,i) => popup(7-i,i%2?'KR':'JP'));
  env.state({ status:'ready',popups:items });
  const firstKey = env.root().key, { scroll,cards,pagination } = parts(env);
  assert.equal(scroll.props.horizontal,true); assert.equal(scroll.props.pagingEnabled,true);
  assert.equal(scroll.props.scrollEnabled,true); assert.equal(scroll.props.showsHorizontalScrollIndicator,false);
  assert.deepEqual(cards.map(card=>card.key),items.map(item=>item.publicId));
  assert.equal(pagination.props.children.length,7);
  cards.forEach((card,i)=>{
    assert.equal(card.props.style[1].width,390);
    assert.equal(env.mount(card.props.children[0]).props.children[0].props.source.uri,items[i].coverImageUrl);
    assert.equal(poster(card).props.popup.publicId,items[i].publicId); card.props.onPress();
  });
  assert.deepEqual(env.taps,items.map(item=>item.publicId));
  env.width(700); assert.notEqual(env.root().key,firstKey);
  const resizedKey = env.root().key; env.state({ status:'ready',popups:[...items].reverse() });
  assert.notEqual(env.root().key,resizedKey);
});

test('70 percent poster keeps aspect ratio, contain and actual top Safe Area across devices', () => {
  for(const top of [0,24,44,59,70]) for(const [width,height] of [[600,900],[600,600],[1200,400]]) {
    const env = bannerEnv(); env.insets(top); env.state({ status:'ready',popups:[popup(1)] });
    const card = parts(env).cards[0], area = card.props.children[1], child = poster(card);
    assert.equal(child.props.width,390*0.7); assert.equal(area.props.style[1].top,top+6);
    assert.equal(child.props.height,380-top-12-16);
    env.mount(child).props.children.props.onLoad({ source:{ width,height } });
    const dimensions = env.mount(child).props.style[1];
    assert.ok(dimensions.width<=child.props.width && dimensions.height<=child.props.height);
    assert.ok(Math.abs(dimensions.width/dimensions.height-width/height)<0.000001);
    assert.ok(area.props.style[1].top+dimensions.height<=380);
  }
  const env = bannerEnv(); env.width(700); env.insets(0,44); env.state({ status:'ready',popups:[popup(1)] });
  assert.equal(poster(parts(env).cards[0]).props.width,700*0.7);
});

test('backgroundColors remain unused even if missing or malformed', () => {
  for(const backgroundColors of [undefined,null,[],['#FF0000','#00FF00','#0000FF'],[7,'bad',null]]) {
    const env = bannerEnv(); env.state({ status:'ready',popups:[{ ...popup(1),backgroundColors }] });
    const bg = env.mount(parts(env).cards[0].props.children[0]);
    assert.equal(bg.props.children[0].type,'ExpoImage'); assert.equal(bg.props.children[0].props.source.uri,popup(1).coverImageUrl);
    assert.equal(bg.props.children.length,2);
  }
});

test('centered pill/dot pagination follows swipe, clamps overscroll and resets on width/order changes', () => {
  const env = bannerEnv(); env.state({ status:'ready',popups:[popup(1),popup(2),popup(3)] });
  const { scroll,pagination } = parts(env);
  assert.equal(pagination.props.style.justifyContent,'center'); assert.equal(pagination.props.style.bottom,12);
  assert.equal(pagination.props.style.columnGap,8);
  const selected=()=>parts(env).pagination.props.children.map(dot=>dot.props.accessibilityState.selected);
  assert.deepEqual(selected(),[true,false,false]);
  const [first,second]=pagination.props.children;
  assert.equal(first.props.style[1].width,24); assert.equal(first.props.style[0].height,4);
  assert.equal(first.props.style[1].backgroundColor,'#FFFFFF');
  assert.equal(second.props.style[0].width,4); assert.equal(second.props.style[0].backgroundColor,'rgba(255,255,255,0.45)');
  scroll.props.onMomentumScrollEnd({ nativeEvent:{ contentOffset:{ x:390 } } }); assert.deepEqual(selected(),[false,true,false]);
  scroll.props.onMomentumScrollEnd({ nativeEvent:{ contentOffset:{ x:9999 } } }); assert.deepEqual(selected(),[false,false,true]);
  env.width(700); assert.deepEqual(selected(),[true,false,false]);
  env.state({ status:'ready',popups:[popup(3)] }); assert.deepEqual(selected(),[true]);
});

const flatStyle = style => Array.isArray(style) ? Object.assign({},...style) : style;
test('hero title/period/MapPin region uses white typography, two-line title and shared date formatting', () => {
  for(const [startDate,endDate,expected] of [
    ['2026-10-03','2026-10-16','26.10.03 - 10.16'],
    ['2026-12-28','2027-01-05','26.12.28 - 27.01.05'],
    ['2026-10-03',null,'26.10.03'],[null,'2027-01-05','27.01.05'],[null,null,''],
  ]) {
    const env=bannerEnv(); env.state({ status:'ready',popups:[{ ...popup(1),regionName:'홍대·신촌',startDate,endDate }] });
    const info=parts(env).cards[0].props.children[3], [title,period,location]=info.props.children;
    assert.equal(title.props.children,'Popup 1'); assert.equal(title.props.numberOfLines,2); assert.equal(title.props.ellipsizeMode,'tail');
    assert.equal(title.props.style.fontSize,20); assert.equal(title.props.style.fontWeight,'700'); assert.equal(title.props.style.color,'#FFFFFF');
    assert.equal(period.props.children,expected); assert.equal(flatStyle(period.props.style).fontSize,14);
    assert.equal(flatStyle(period.props.style).color,'#FFFFFF'); assert.equal(flatStyle(period.props.style).fontWeight,'400');
    const [icon,label]=location.props.children;
    assert.equal(icon.type,'Ionicons'); assert.equal(icon.props.name,'location-sharp');
    assert.equal(icon.props.size,16); assert.equal(icon.props.color,'#FFFFFF');
    assert.equal(label.props.children,'홍대·신촌'); assert.equal(flatStyle(label.props.style).fontSize,14);
    assert.equal(location.props.style.alignItems,'center');
    assert.equal(info.props.style[1].left,16); assert.equal(info.props.style[1].right,16); assert.equal(info.props.style[0].bottom,32);
  }
});

test('footer gradient remains above poster and below text with specified opacity stops', () => {
  const env=bannerEnv(); env.state({ status:'ready',popups:[popup(1)] });
  const card=parts(env).cards[0], footer=env.mount(card.props.children[2]);
  assert.equal(card.props.children.length,4); assert.equal(footer.props.pointerEvents,'none');
  const [defs,shade]=footer.props.children.props.children, gradient=defs.props.children;
  const stops=gradient.props.children;
  assert.deepEqual(stops.map(stop=>stop.props.stopOpacity),[0,0.15,0.4,0.8]);
  const positions=stops.map(stop=>gradient.props.y1+Number(stop.props.offset)*(380-gradient.props.y1));
  [220.4,266,311.6,380].forEach((expected,i)=>assert.ok(Math.abs(positions[i]-expected)<0.000001));
  assert.equal(shade.props.fill,'url(#'+gradient.props.id+')');
  assert.equal(env.mount(poster(card)).props.children.props.blurRadius,undefined);
});

test('empty/API-error/loading/missing-cover and image failures remain isolated', () => {
  const env=bannerEnv();
  for(const state of [{ status:'ready',popups:[] },{ status:'error',popups:[] }]) { env.state(state); assert.equal(env.render(),null); }
  env.state({ status:'loading',popups:[] }); assert.equal(env.render().props.style.height,380);
  env.state({ status:'ready',popups:[{ ...popup(1),coverImageUrl:null,regionName:null }] });
  const card=parts(env).cards[0]; assert.equal(env.mount(poster(card)),null);
  assert.equal(env.mount(card.props.children[0]).props.children[0],null);
  assert.equal(card.props.children[3].props.children[2].props.children[0],null,'no icon without region');
  env.state({ status:'ready',popups:[popup(2)] });
  const child=poster(parts(env).cards[0]); env.mount(child).props.children.props.onLoad({ source:{ width:0,height:0 } });
  assert.ok(Number.isFinite(env.mount(child).props.style[1].width));
  env.insets(380); assert.equal(env.mount(poster(parts(env).cards[0])),null);
});

test('HomeScreen shares existing detail navigation and keeps other sections on banner failure', () => {
  const env = bannerEnv(); env.state({ status: 'error', popups: [] }); const calls = [], open = id => calls.push(id);
  const Home = load('src/screens/HomeScreen.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: styles => styles } },
    '../hooks/usePopupNavigation': { usePopupNavigation: () => open },
    '../components/home/HomeBanner': { __esModule: true, default: env.Banner },
    '../components/home/HomeNewPopupSection': { __esModule: true, default: 'New' },
    '../components/home/HomeQuickMenu': { __esModule: true, default: 'Quick' },
    '../components/home/HomeTrendingSection': { __esModule: true, default: 'Trending' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 8, FLOATING_TAB_BAR_HEIGHT: 64 },
    '../theme/tokens': { colors: { background: '#fff' }, spacing: { space16: 16, space32: 32, space40: 40, space56: 56 } },
  }).default;
  const [banner, quick, trending, fresh] = Home().props.children;
  assert.equal(banner.props.onPressPopup, open); assert.equal(banner.type(banner.props), null);
  assert.ok(quick.props.children, 'Home must retain its existing quick-menu section');
  assert.equal(quick.props.children.type, 'Quick'); assert.equal(trending.type, 'Trending');
  assert.equal(trending.props.onPressPopup, open); assert.equal(fresh.props.children.type, 'New');
  assert.equal(fresh.props.children.props.onPressPopup, open);
  env.state({ status: 'ready', popups: [popup(1)] });
  env.mount(banner.type(banner.props)).props.children[0].props.children[0].props.onPress();
  assert.deepEqual(calls, ['public-1']);
});
