const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function displayed(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(displayed).join('');
  return tree?.props ? displayed(tree.props.children) : '';
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function screen({ token = null, initialCount = 0, initialFavorited = false, detail = {}, language = 'ko', pendingDetails = [], linkError = null, width = 390, secureStore, routeId = 'popup-public-id' } = {}) {
  const calls = [];
  const navigation = [];
  const alerts = [];
  const openedLinks = [];
  const copiedAddresses = [];
  const slots = [];
  const effects = [];
  const pendingMutations = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let currentToken = token;
  let locale = language;
  let currentId = routeId;
  const resources = { ko: require('../src/locales/ko.json'), ja: require('../src/locales/ja.json') };
  const locales = { getLocale: () => locale, t: (key, params = {}) => {
    let value = key.split('.').reduce((node, part) => node?.[part], resources[locale]) || key;
    for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, replacement);
    return value;
  } };
  const content = load('src/lib/popupDetailContent.ts', {});
  let server = { publicId: 'popup-public-id', isFavorited: initialFavorited, favoriteCount: initialCount };

  const fetchMock = (url, options = {}) => {
    calls.push({ url, ...options });
    if (options.method === 'POST' || options.method === 'DELETE') {
      if (pendingMutations.length) return pendingMutations.shift();
      server = { ...server, isFavorited: options.method === 'POST',
        favoriteCount: server.favoriteCount + (options.method === 'POST' ? 1 : -1) };
      return Promise.resolve(response(server));
    }
    if (pendingDetails.length) return pendingDetails.shift();
    return Promise.resolve(response({ ...server, name: '팝업', countryCode: 'KR',
      tags: [], contentImageUrls: [], socialLinks: null, coverImageUrl: null,
      latitude: null, longitude: null, startDate: null, endDate: null, summary: null, highlights: [], ...detail }));
  };
  let auth = {
    getAuthUser: () => null,
    subscribeAuthUser: () => () => {},
    getAuthSession: async () => ({ accessToken: currentToken, generation: 0 }),
    clearTokens: async () => { currentToken = null; },
  };
  const globals = { fetch: fetchMock, __DEV__: false };
  if (secureStore) auth = load('src/lib/auth.ts', {
    'expo-secure-store': secureStore,
    '../constants/api': { API_BASE_URL: 'http://api' },
    './favoriteCache': { clearFavoriteCache() {} },
    './communityFeedRefresh': { clearCommunityLikes() {} },
  }, globals);
  const popups = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'http://api' }, '../locales': locales }, globals);
  const favorites = load('src/lib/favorites.ts', {
    '../constants/api': { API_BASE_URL: 'http://api' }, './auth': auth,
    './favoriteCache': { favoriteCacheGeneration: () => 1, favoriteSessionGeneration: () => 1, saveFavoriteCache: () => {}, updateFavoriteCache: () => {} },
  }, globals);
  const hooks = {
    useRef(value) { const i = cursor++; return (slots[i] ??= { current: value }); },
    useState(value) {
      const i = cursor++; if (!slots[i]) slots[i] = { value };
      return [slots[i].value, (next) => {
        slots[i].value = typeof next === 'function' ? next(slots[i].value) : next;
        dirty = true;
      }];
    },
    useSyncExternalStore() { cursor++; return null; },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, index) => !Object.is(value, slots[i].deps[index]))) {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: null, effect };
        effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const jsx = (type, props, key) => ['DetailRow', 'GuidanceMock'].includes(type?.name) ? type(props) : ({ type, props, key });
  const native = {
    Alert: { alert: (...args) => alerts.push(args) }, Image: 'Image', Linking: { openURL: async (url) => { openedLinks.push(url); if (linkError) throw linkError; } },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Share: { share: async () => {} },
    StyleSheet: { create: (styles) => styles }, Text: 'Text', View: 'View',
    useWindowDimensions: () => ({ width, height: 844 }),
  };
  const Detail = load('src/app/places/[id].tsx', {
    'react': hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-clipboard': { setStringAsync: async (address) => { copiedAddresses.push(address); } },
    'expo-router': { useLocalSearchParams: () => ({ id: currentId }),
      useRouter: () => ({ push: (route) => navigation.push(route), back() {} }) },
    'lucide-react-native': {}, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }) },
    '../../components/common/Tag': { __esModule: true, default: 'Tag' },
    '../../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 12, FLOATING_TAB_BAR_HEIGHT: 60 },
    '../../components/place/PopupGuidanceCarousel': { __esModule: true, default: function GuidanceMock(props) { return { type: 'Guidance', props: { ...props, children: [props.notice, props.benefits] } }; } },
    '../../components/place/PopupHeroImage': { default: 'HeroImage' },
    '../../components/place/IntroductionImageCarousel': { default: 'Carousel' },
    '../../components/place/OfficialChannelIcon': { default: 'Channel' },
    '../../components/place/PopupDetailSkeleton': { default: 'Skeleton' },
    '../../components/place/PlaceMapPreview': { default: 'MapPreview', isMapPreviewAvailable: false },
    '../../components/place/PopupReviews': { default: 'PopupReviews' },
    '../../lib/auth': auth, '../../lib/favorites': favorites, '../../lib/popups': popups,
    '../../lib/popupStatus': { popupOperatingStatus: () => null },
    '../../locales': locales, '../../lib/popupDetailContent': content,
    '../../theme/tokens': load('src/theme/tokens.ts', {}),
    '../../../assets/images/ranking-placeholder.png': 1,
  }, globals).default;

  function flush() {
    let loops = 0;
    while (dirty) {
      assert.ok(++loops < 20, 'render should settle');
      dirty = false; cursor = 0; tree = Detail();
      effects.splice(0).forEach((effect) => effect());
    }
  }
  async function settle() {
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 8; i++) await Promise.resolve();
      flush();
    }
  }
  function heart() {
    return nodes(tree).find((node) => node.props?.testID === 'popup-floating-favorite');
  }
  function bodyHeart() {
    return nodes(tree).find((node) => node.type === 'Pressable' && !node.props.testID
      && (node.props.accessibilityLabel === '찜하기' || node.props.accessibilityLabel === '찜 해제'));
  }
  function count() {
    const texts = nodes(tree).filter((node) => node.type === 'Text').map(displayed);
    return texts.find((value) => /^\d+$/.test(value));
  }
  flush();
  return {
    calls, navigation, alerts, openedLinks, copiedAddresses, heart, bodyHeart, count, settle,
    text: () => displayed(tree), nodes: () => nodes(tree),
    changeLanguage(next) { locale = next; dirty = true; flush(); },
    changeId(next) { currentId = next; server = { ...server, publicId: next }; dirty = true; flush(); },
    replayEffects() {
      for (const slot of slots) if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); }
      flush();
    },
    press() { heart().props.onPress(); flush(); },
    queue(promise) { pendingMutations.push(promise); },
  };
}


test('popup detail displays the single renamed category through the existing Tag component', async () => {
  const s = screen({ detail: { tags: [{ id: 1, name: '캐릭터/IP' }] } });
  await s.settle();
  const tags = s.nodes().filter(n => n.type === 'Tag');
  assert.ok(tags.some(n => n.props.label === '캐릭터/IP'));
  assert.equal(tags.filter(n => n.props.label === '캐릭터/IP').length, 1);
});

const content = load('src/lib/popupDetailContent.ts', {});
const ko = require('../src/locales/ko.json').place.detail;
const ja = require('../src/locales/ja.json').place.detail;
const types = ['SPECIAL', 'GOODS', 'PRODUCTS', 'VIEW', 'EXPERIENCE', 'FOOD', 'SPACE', 'HIGHLIGHT'];

function webSecureStore() {
  const implementation = load('node_modules/expo-secure-store/build/ExpoSecureStore.web.js', {});
  return load('node_modules/expo-secure-store/build/SecureStore.js', { './ExpoSecureStore': implementation });
}

test('installed SecureStore Web read throws before fetch, but detail now continues anonymously in KO/JA', async () => {
  const secure = webSecureStore();
  assert.equal(await secure.isAvailableAsync(), false);
  await assert.rejects(secure.getItemAsync('accessToken'), /getValueWithKeyAsync.*not a function/);
  for (const language of ['ko', 'ja']) {
    const s = screen({ secureStore: secure, language, detail: { summary: 'public web detail' } });
    await s.settle();
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].url, `http://api/api/popups/popup-public-id?languageCode=${language}`);
    assert.equal(s.calls[0].headers, undefined);
    assert.ok(s.text().includes('public web detail'));
    assert.ok(!s.text().includes('팝업 정보를 불러오지 못했습니다.'));
  }
});

test('available Native token storage failures still reach detail error without masking the failure', async () => {
  const s = screen({ secureStore: { isAvailableAsync: async () => true,
    getItemAsync: async () => { throw new Error('Native storage failure'); } } });
  await s.settle();
  assert.equal(s.calls.length, 0);
  assert.ok(s.text().includes('팝업 정보를 불러오지 못했습니다.'));
});

test('available Native SecureStore keeps authenticated detail and generation-aware 401 retry', async () => {
  const storage = new Map([['accessToken', 'expired'], ['refreshToken', 'refresh']]);
  const s = screen({ language: 'ja', secureStore: {
    isAvailableAsync: async () => true,
    getItemAsync: async key => storage.get(key) ?? null,
    deleteItemAsync: async key => { storage.delete(key); },
  }, pendingDetails: [Promise.resolve(response({}, 401))], detail: { summary: 'native retry detail' } });
  await s.settle();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].headers.Authorization, 'Bearer expired');
  assert.equal(s.calls[1].headers, undefined);
  assert.ok(s.calls.every(call => call.url.endsWith('?languageCode=ja')));
  assert.equal(storage.size, 0);
  assert.ok(s.text().includes('native retry detail'));
});

test('missing route id errors before fetch; hydration to a string id starts the request', async () => {
  const s = screen({ routeId: null, secureStore: webSecureStore() });
  await s.settle();
  assert.equal(s.calls.length, 0);
  assert.ok(s.text().includes('팝업 정보를 불러오지 못했습니다.'));
  s.changeId('hydrated-public-id');
  await s.settle();
  assert.equal(s.calls.length, 1);
  assert.match(s.calls.at(-1).url, /\/hydrated-public-id\?languageCode=ko$/);
  assert.ok(!s.text().includes('팝업 정보를 불러오지 못했습니다.'));
});

test('installed Expo Router parses /places/{publicId} as a string and local params preserve the id', () => {
  const parser = load('node_modules/expo-router/build/fork/getStateFromPath.js', {
    'escape-string-regexp': require('escape-string-regexp'),
    './findFocusedRoute': require('expo-router/build/fork/findFocusedRoute.js'),
    './getStateFromPath-forks': require('expo-router/build/fork/getStateFromPath-forks.js'),
    '../constants': require('expo-router/build/constants.js'),
    '../react-navigation/native': require('expo-router/build/react-navigation/core/validatePathConfig.js'),
  });
  const state = parser.getStateFromPath('/places/web-public-id', { screens: { 'places/[id]': 'places/:id' } });
  const params = state.routes[0].params;
  assert.equal(params.id, 'web-public-id');
  assert.equal(typeof params.id, 'string');
  let currentParams = params;
  const hook = load('node_modules/expo-router/build/hooks/useLocalSearchParams.js', {
    react: { use: () => currentParams }, '../Route': { LocalRouteParamsContext: {} },
    '../link/preview/PreviewRouteContext': { usePreviewInfo: () => ({}) },
  }).useLocalSearchParams;
  assert.equal(hook().id, 'web-public-id');
  currentParams = { id: ['first', 'second'] };
  assert.deepEqual(hook().id, ['first', 'second']);
  currentParams = {};
  assert.equal(hook().id, undefined);
});

test('popup id change aborts old Web detail and a stale response cannot overwrite the new id', async () => {
  const old = deferred();
  const s = screen({ secureStore: webSecureStore(), pendingDetails: [old.promise], detail: { summary: 'new popup' } });
  await s.settle();
  s.changeId('next-popup');
  await s.settle();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].signal.aborted, true);
  assert.match(s.calls[1].url, /\/next-popup\?languageCode=ko$/);
  old.resolve(response({ publicId: 'popup-public-id', summary: 'stale popup', tags: [], contentImageUrls: [] }));
  await s.settle();
  assert.ok(s.text().includes('new popup'));
  assert.ok(!s.text().includes('stale popup'));
});

test('StrictMode-style effect cleanup/replay leaves an active Web request that renders detail', async () => {
  const s = screen({ secureStore: webSecureStore(), detail: { summary: 'replayed detail' } });
  s.replayEffects();
  await s.settle();
  assert.ok(s.calls.some(call => !call.signal.aborted));
  assert.ok(s.text().includes('replayed detail'));
});

test('all eight headings use central KO and JA resources and unknown types use HIGHLIGHT', () => {
  const expectedKo = ['뭐가 특별해요?', '어떤 굿즈가 있어요?', '무엇을 만나볼 수 있어요?', '무엇을 볼 수 있어요?', '무엇을 체험할 수 있어요?', '무엇을 맛볼 수 있어요?', '어떤 공간이에요?', '놓치면 아쉬운 건?'];
  const expectedJa = ['ここが特別！', 'どんなグッズがある？', '何が見つかる？', '何が見られる？', '何が体験できる？', '何が味わえる？', 'どんな空間？', 'ここは見逃せない！'];
  const expectedEmoji = ['✨', '🎁', '🛍️', '👀', '🎨', '🍴', '🏠', '📌'];
  types.forEach((type, index) => {
    assert.equal(content.highlightHeading(type).emoji, expectedEmoji[index]);
    assert.equal(content.highlightHeading(type).key, 'place.detail.highlights.' + type);
    assert.equal(ko.highlights[type], expectedKo[index]);
    assert.equal(ja.highlights[type], expectedJa[index]);
  });
  for (const type of ['FUTURE', '__proto__', null]) assert.deepEqual(content.highlightHeading(type), content.highlightHeading('HIGHLIGHT'));
  assert.equal(content.highlightHeading('FUTURE').emoji, '📌');
});

test('summary and highlights normalize missing/blank data without changing wording or order', () => {
  for (const value of [null, undefined, '', '  ']) assert.equal(content.popupSummary(value), null);
  assert.equal(content.popupSummary(' 原文 '), ' 原文 ');
  for (const value of [null, undefined, []]) assert.deepEqual(content.visiblePopupHighlights(value), []);
  assert.deepEqual(content.visiblePopupHighlights([
    { type: 'SPACE', text: ' 공간 ' }, null, { type: 'GOODS', text: ' ' },
    { type: 'NEW', text: '新しい内容' }, { type: 'GOODS', text: '굿즈' },
  ]), [{ type: 'SPACE', text: ' 공간 ' }, { type: 'HIGHLIGHT', text: '新しい内容' }, { type: 'GOODS', text: '굿즈' }]);
});

test('official links use actual six keys, trim URLs and omit unsupported/invalid/empty values', () => {
  const links = content.officialChannelLinks({ website: ' https://example.com/ ', instagram: 'https://instagram.com/a',
    x: 'https://x.com/a', youtube: 'https://youtube.com/a', threads: 'https://threads.net/a', facebook: 'https://facebook.com/a', other: 'https://example.com' });
  assert.deepEqual(links.map(link => link.channel), ['website', 'instagram', 'x', 'youtube', 'threads', 'facebook']);
  assert.equal(links[0].url, 'https://example.com/');
  for (const value of [null, {}, [], { website: 'javascript:alert(1)', x: 'invalid', instagram: '' }]) assert.deepEqual(content.officialChannelLinks(value), []);
  assert.equal(content.officialChannelLabel('website', () => ja.website), '公式サイト');
  assert.equal(content.officialChannelLabel('instagram', () => ''), 'Instagram');
});

test('API detail encodes identifier and uses app locale independently of country and auth', async () => {
  let locale = 'ko';
  const calls = [];
  const api = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'http://api' }, '../locales': { getLocale: () => locale } },
    { __DEV__: false, fetch: async (url, options) => { calls.push({ url, options }); return response({ publicId: 'a/b', countryCode: 'JP' }); } });
  const signal = new AbortController().signal;
  await api.getPopupDetail('a/b', signal, 'token');
  assert.equal(calls[0].url, 'http://api/api/popups/a%2Fb?languageCode=ko');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].options.signal, signal);
  locale = 'ja';
  await api.getPopupDetail('a/b', signal);
  assert.match(calls[1].url, /languageCode=ja$/);
});

test('detail renders summary, ordered highlights, benefits and notice with localized headings', async () => {
  const s = screen({ language: 'ja', detail: { countryCode: 'KR', summary: '短い紹介', benefits: '購入特典', notice: '予約条件',
    highlights: [{ type: 'SPACE', text: '空間の説明' }, { type: 'GOODS', text: '商品の説明' }, { type: 'SPECIAL', text: '限定企画' }] } });
  await s.settle();
  assert.match(s.calls[0].url, /languageCode=ja$/);
  const text = s.text();
  for (const value of ['短い紹介', '購入特典', '予約条件', ja.highlights.SPACE, ja.highlights.GOODS, ja.highlights.SPECIAL]) assert.ok(text.includes(value));
  assert.ok(text.indexOf('空間の説明') < text.indexOf('商品の説明'));
  assert.ok(text.indexOf('商品の説明') < text.indexOf('限定企画'));
});

test('all highlight types share inline emoji headings and unboxed introduction flow in KO and JA', async () => {
  for (const language of ['ko', 'ja']) {
    const localized = language === 'ko' ? ko : ja;
    const s = screen({ language, detail: {
      summary: 'summary body', highlights: types.map(type => ({ type, text: type + ' body' })),
      benefits: 'benefit body', notice: 'notice body', contentImageUrls: ['https://example.com/image.jpg'],
      introduction: 'legacy introduction must stay hidden',
    } });
    await s.settle();
    const all = s.nodes();
    const textNodes = all.filter(node => node.type === 'Text');
    const summary = textNodes.find(node => displayed(node) === 'summary body');
    const bodyStyle = summary.props.style[0];
    assert.equal(bodyStyle.fontSize, 14);
    assert.equal(bodyStyle.fontWeight, '400');
    assert.equal(bodyStyle.lineHeight, 22);
    const group = all.find(node => node.type === 'View' && Array.isArray(node.props.children)
      && node.props.children.length === types.length
      && node.props.children.every(child => child?.type === 'View'));
    assert.ok(group);
    assert.equal(group.props.style[0].gap, 24);
    assert.equal(group.props.style[1].marginTop, 24);
    group.props.children.forEach((block, index) => {
      assert.equal(block.props.style, undefined, 'highlight has no card container style');
      const [heading, body] = block.props.children;
      assert.equal(heading.props.style.flexDirection, 'row');
      assert.equal(heading.props.style.columnGap, 6);
      const [emoji, title] = heading.props.children;
      assert.equal(displayed(emoji), content.highlightHeading(types[index]).emoji);
      assert.equal(emoji.props.accessible, false);
      assert.equal(displayed(title), localized.highlights[types[index]]);
      assert.equal(title.props.style[0].fontSize, 14);
      assert.equal(title.props.style[0].fontWeight, '600');
      assert.deepEqual(body.props.style[0], bodyStyle);
      assert.equal(body.props.style[1].marginTop, 8);
      assert.equal(displayed(body), types[index] + ' body');
    });
    assert.ok(all.indexOf(summary) < all.indexOf(group));
    assert.ok(all.indexOf(group) < all.findIndex(node => node.props?.images?.[0] === 'https://example.com/image.jpg'));
    const cards = all.filter(node => node.type === 'View' && [node.props.style].flat().some(style => style?.backgroundColor === '#F7F8FA'));
    assert.equal(cards.length, 0, 'guidance is delegated to the upper carousel');
    assert.equal(all.filter(node => node.type === 'Guidance').length, 1);
    assert.equal(s.text().split('benefit body').length - 1, 1);
    assert.ok(!s.text().includes('legacy introduction must stay hidden'));
  }
});

test('description hides truly empty content, supports summary-only and highlights-only', async () => {
  const empty = screen(); await empty.settle();
  assert.ok(!empty.text().includes(ko.about));
  assert.ok(!empty.text().includes(ko.officialChannels));
  const summary = screen({ detail: { summary: '소개만' } }); await summary.settle();
  assert.ok(summary.text().includes('소개만')); assert.ok(summary.text().includes(ko.about));
  const highlights = screen({ detail: { highlights: [{ type: 'NEW', text: '새 내용' }, { type: 'GOODS', text: ' ' }] } }); await highlights.settle();
  assert.ok(highlights.text().includes('새 내용')); assert.ok(highlights.text().includes(ko.highlights.HIGHLIGHT));
  assert.ok(highlights.text().includes('📌'));
  assert.ok(!highlights.text().includes(ko.highlights.GOODS));
  const benefits = screen({ detail: { benefits: '혜택만' } }); await benefits.settle();
  assert.ok(benefits.text().includes('혜택만')); assert.ok(!benefits.text().includes(ko.about));
});

test('official section renders only valid links with accessible localized labels', async () => {
  const s = screen({ language: 'ja', detail: { socialLinks: { website: ' https://example.com ', x: 'https://x.com/a', instagram: '' } } });
  await s.settle();
  assert.ok(s.text().includes(ja.officialChannels));
  const links = s.nodes().filter(node => node.props?.accessibilityRole === 'link');
  assert.deepEqual(links.map(node => node.props.accessibilityLabel), ['公式サイトの公式チャンネル', 'Xの公式チャンネル']);
  links[0].props.onPress(); await s.settle();
  assert.deepEqual(s.openedLinks, ['https://example.com']);
});

test('locale changes refetch the detail and abort stale requests without displaying old language', async () => {
  const old = deferred();
  const s = screen({ pendingDetails: [old.promise], detail: { summary: '新しい紹介' } });
  await s.settle();
  s.changeLanguage('ja');
  await s.settle();
  assert.equal(s.calls.length, 2);
  assert.match(s.calls[0].url, /languageCode=ko$/);
  assert.match(s.calls[1].url, /languageCode=ja$/);
  assert.equal(s.calls[0].signal.aborted, true);
  assert.ok(s.text().includes('新しい紹介'));
  old.resolve(response({ publicId: 'popup-public-id', name: '古い', summary: 'stale', contentImageUrls: [], tags: [] }));
  await s.settle();
  assert.ok(!s.text().includes('stale'));
  assert.ok(s.text().includes('新しい紹介'));
});

test('official link failures show an alert without an unhandled rejection', async () => {
  const s = screen({ linkError: new Error('cannot open'), detail: { socialLinks: { website: 'https://example.com' } } });
  await s.settle();
  s.nodes().find(node => node.props?.accessibilityRole === 'link').props.onPress();
  await s.settle();
  assert.deepEqual(s.alerts, [[ko.channelOpenError]]);
});

test('hero preserves square viewport, safe-area controls and sticky-tab threshold at mobile/Web widths', async () => {
  for (const width of [320, 390, 1024]) {
    const s = screen({ width, detail: { coverImageUrl: 'https://example.com/poster.png' } });
    await s.settle();
    const hero = s.nodes().find(node => Array.isArray(node.props?.style)
      && node.props.style[0]?.position === 'relative' && node.props.style[1]?.width === width);
    assert.ok(hero);
    assert.equal(hero.props.style[1].height, width);
    const [image, controls] = hero.props.children;
    assert.equal(image.props.uri, 'https://example.com/poster.png');
    assert.equal(image.props.accessibilityLabel, '팝업');
    assert.equal(image.props.topInset, 40, 'foreground receives the existing screen safe-area inset');
    assert.equal(image.key, 'https://example.com/poster.png', 'URL changes remount image error state');
    assert.equal(controls.props.style[1].top, 52);
    const buttons = nodes(controls).filter(node => node.type === 'Pressable');
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(button => typeof button.props.onPress === 'function'));
    const scroller = s.nodes().find(node => node.type === 'ScrollView' && node.props.scrollEventThrottle === 16);
    scroller.props.onScroll({ nativeEvent: { contentOffset: { y: width - 40 } } });
    await s.settle();
    assert.ok(s.nodes().some(node => node.props?.style?.[0]?.zIndex === 10));
  }
});

test('expired authenticated detail retries anonymously with the same app language', async () => {
  const s = screen({ token: 'expired', language: 'ja', pendingDetails: [Promise.resolve(response({}, 401))], detail: { summary: '紹介' } });
  await s.settle();
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls.every(call => call.url.endsWith('?languageCode=ja')));
  assert.equal(s.calls[0].headers.Authorization, 'Bearer expired');
  assert.equal(s.calls[1].headers, undefined);
  assert.ok(s.text().includes('紹介'));
});

function basicInfoRows(s, localized) {
  const labels = [localized.period, localized.time, localized.place, localized.reservation];
  return s.nodes().filter(node => node.type === 'View' && Array.isArray(node.props.children)
    && node.props.children[1]?.type === 'Text' && labels.includes(displayed(node.props.children[1])));
}

test('basic info keeps period/hours, right-aligns values and orders address before venue in KO and JA', async () => {
  for (const language of ['ko', 'ja']) {
    const localized = (language === 'ko' ? ko : ja).basicInfo;
    const address = ' 서울 성동구 서울숲2길 43 ';
    const s = screen({ language, detail: { startDate: '2026-10-02', endDate: '2026-10-15',
      operatingHours: ' 월-일 11:00~20:00 ', locationDetail: '무신사 서울숲 플레이스', address } });
    await s.settle();
    const rows = basicInfoRows(s, localized);
    assert.deepEqual(rows.map(row => displayed(row.props.children[1])),
      [localized.period, localized.time, localized.place]);
    assert.ok(displayed(rows[0]).includes('2026.10.02 - 2026.10.15'));
    assert.ok(displayed(rows[1]).includes('월-일 11:00~20:00'));
    const placeTexts = nodes(rows[2]).filter(node => node.type === 'Text').map(displayed);
    assert.deepEqual(placeTexts, [localized.place, address, '무신사 서울숲 플레이스']);
    assert.ok(!nodes(rows[2]).some(node => node.type === 'Pressable'));
    for (const row of rows) {
      assert.equal(row.props.style[0].minHeight, 20);
      assert.equal(row.props.style[1].alignItems, 'flex-start');
      const value = row.props.children[2];
      assert.equal(value.props.style.flex, 1);
      assert.equal(value.props.style.minWidth, 0);
      for (const text of nodes(value).filter(node => node.type === 'Text')) {
        assert.equal(text.props.style[1].textAlign, 'right');
      }
    }
    const group = s.nodes().find(node => node.props?.style?.flexDirection === 'column' && node.props.style.gap === 12);
    assert.ok(group, 'rows share a 12px gap');
    assert.ok(!s.text().includes(localized.reservationNone));
    assert.ok(!s.text().includes('운영시간'));
  }
});

test('place shows only present venue/address values without empty text or copy targets', async () => {
  for (const detail of [
    { locationDetail: '장소명만', address: '  ' },
    { locationDetail: '  ', address: '주소만' },
    { locationDetail: null, address: null },
  ]) {
    const s = screen({ detail }); await s.settle();
    const row = basicInfoRows(s, ko.basicInfo)[2];
    const texts = nodes(row).filter(node => node.type === 'Text').map(displayed).slice(1);
    assert.deepEqual(texts, [detail.locationDetail?.trim() || detail.address?.trim() || ko.basicInfo.addressPending]);
    const copies = nodes(row).filter(node => node.props?.accessibilityLabel === ko.basicInfo.copyAddress);
    assert.equal(copies.length, 0);
  }
});

test('missing or invalid reservation URLs omit the entire reservation row, dates and CTA in KO/JA', async () => {
  for (const language of ['ko', 'ja']) {
    const localized = (language === 'ko' ? ko : ja).basicInfo;
    for (const reservationUrl of [null, undefined, '', '  ', 'javascript:alert(1)', 'not-a-url']) {
      const s = screen({ language, detail: { reservationUrl, reservationStartAt: '2026-10-08T12:00:00', reservationEndAt: '2026-10-10T18:00:00' } });
      await s.settle();
      assert.deepEqual(basicInfoRows(s, localized).map(row => displayed(row.props.children[1])),
        [localized.period, localized.time, localized.place]);
      assert.ok(!s.text().includes(localized.reservationNone));
      assert.ok(!s.text().includes(localized.reserve));
      assert.ok(!s.text().includes(localized.reservationAvailable));
      assert.ok(!s.text().includes('2026.10.08'));
      assert.equal(s.nodes().filter(node => node.props?.accessibilityRole === 'link').length, 0);
    }
  }
});

test('valid reservation uses green action and optional existing date fields, wraps at narrow width and opens the URL', async () => {
  for (const language of ['ko', 'ja']) {
    const localized = (language === 'ko' ? ko : ja).basicInfo;
    const s = screen({ language, width: 320, detail: {
      address: '서울 성동구 서울숲2길 43 길고 긴 주소', locationDetail: '길고 긴 장소명 무신사 서울숲 플레이스',
      reservationUrl: 'https://example.com/reserve', reservationStartAt: '2026-10-08T12:00:00', reservationEndAt: '2026-10-10T18:00:00',
    } });
    await s.settle();
    assert.ok(!s.text().includes(localized.reservationAvailable));
    assert.ok(s.text().includes(localized.reserve));
    assert.ok(s.text().includes(localized.reservationStart.replace('{date}', '2026.10.08 12:00')));
    assert.ok(s.text().includes(localized.reservationEnd.replace('{date}', '2026.10.10 18:00')));
    const link = s.nodes().find(node => node.props?.accessibilityLabel === localized.reserve);
    assert.equal(link.props.accessibilityRole, 'link');
    const style = link.props.style;
    assert.equal(style.borderColor, '#22C55E');
    assert.equal(style.borderWidth, 1);
    assert.equal(style.backgroundColor, '#F0FDF4');
    assert.equal(style.minHeight, 48);
    assert.equal(style.paddingVertical, 4);
    assert.equal(style.paddingHorizontal, 12);
    const stateColumn = nodes(link).find(node => node.props?.style?.flexBasis === 88);
    assert.equal(stateColumn.props.style.flexGrow, 1);
    assert.equal(style.marginTop, undefined);
    const reservationRow = basicInfoRows(s, localized)[3];
    assert.equal(reservationRow.props.children[1].props.style[1].width, 40);
    assert.equal(style.borderRadius, 12);
    assert.ok(nodes(link).some(node => node.props?.style?.flexWrap === 'wrap'));
    const place = basicInfoRows(s, localized)[2];
    for (const text of nodes(place).filter(node => node.type === 'Text').slice(1)) {
      assert.equal(text.props.numberOfLines, undefined, 'venue/address can wrap without truncation');
    }
    link.props.onPress(); await s.settle();
    assert.deepEqual(s.openedLinks, ['https://example.com/reserve']);
  }
  const noDates = screen({ detail: { reservationUrl: 'https://example.com/reserve' } });
  await noDates.settle();
  assert.ok(!noDates.text().includes(ko.basicInfo.reservationAvailable));
  assert.ok(noDates.text().includes(ko.basicInfo.reserve));
  assert.ok(!noDates.text().includes('undefined'));
});

test('reservation link failures use the existing localized alert', async () => {
  const s = screen({ language: 'ja', linkError: new Error('cannot open'), detail: { reservationUrl: 'https://example.com/reserve' } });
  await s.settle();
  s.nodes().find(node => node.props?.accessibilityLabel === ja.basicInfo.reserve).props.onPress();
  await s.settle();
  assert.deepEqual(s.alerts, [[ja.channelOpenError]]);
});
