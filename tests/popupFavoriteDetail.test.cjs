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

function screen({ token = 'saved-token', initialCount = 0, initialFavorited = false, detail = {}, insets = { top: 40, bottom: 20, left: 0, right: 0 } } = {}) {
  const calls = [];
  const navigation = [];
  const alerts = [];
  const shares = [];
  const slots = [];
  const effects = [];
  const pendingMutations = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let currentToken = token;
  let server = { publicId: 'popup-public-id', isFavorited: initialFavorited, favoriteCount: initialCount };

  const fetchMock = (url, options = {}) => {
    calls.push({ url, ...options });
    if (options.method === 'POST' || options.method === 'DELETE') {
      if (pendingMutations.length) return pendingMutations.shift();
      server = { ...server, isFavorited: options.method === 'POST',
        favoriteCount: server.favoriteCount + (options.method === 'POST' ? 1 : -1) };
      return Promise.resolve(response(server));
    }
    return Promise.resolve(response({ ...server, name: '팝업', countryCode: 'KR',
      tags: [], contentImageUrls: [], socialLinks: null, coverImageUrl: null,
      latitude: null, longitude: null, startDate: null, endDate: null, ...detail }));
  };
  const auth = {
    getAuthUser: () => null,
    subscribeAuthUser: () => () => {},
    getAuthSession: async () => ({ accessToken: currentToken, generation: 0 }),
    clearTokens: async () => { currentToken = null; },
  };
  const globals = { fetch: fetchMock, __DEV__: false };
  const popups = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'http://api' }, '../locales': { getLocale: () => 'ko' } }, globals);
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
        slots[i] = { deps, cleanup: null };
        effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const native = {
    Alert: { alert: (...args) => alerts.push(args) }, Image: 'Image', Linking: { openURL: async () => {} },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Share: { share: async (payload) => { shares.push(payload); } },
    StyleSheet: { create: (styles) => styles }, Text: 'Text', View: 'View',
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
  const Detail = load('src/app/places/[id].tsx', {
    'react': hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-clipboard': { setStringAsync: async () => {} },
    'expo-router': { useLocalSearchParams: () => ({ id: 'popup-public-id' }),
      useRouter: () => ({ push: (route) => navigation.push(route), back() { navigation.push('back'); } }) },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', Share2: 'Share2', Heart: 'Heart' }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => insets },
    '../../components/common/Tag': { default: 'Tag' },
    '../../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 12, FLOATING_TAB_BAR_HEIGHT: 60 },
    '../../components/place/PopupGuidanceCarousel': { default: 'GuidanceCarousel' },
    '../../components/place/PopupHeroImage': { default: 'HeroImage' },
    '../../components/place/IntroductionImageCarousel': { default: 'Carousel' },
    '../../components/place/OfficialChannelIcon': { default: 'Channel' },
    '../../components/place/PopupDetailSkeleton': { default: 'Skeleton' },
    '../../components/place/PlaceMapPreview': { default: 'MapPreview', isMapPreviewAvailable: false },
    '../../components/place/PopupReviews': { default: 'PopupReviews' },
    '../../lib/auth': auth, '../../lib/favorites': favorites, '../../lib/popups': popups,
    '../../lib/popupStatus': { popupOperatingStatus: () => null },
    '../../locales': { t: (key) => key, getLocale: () => 'ko' },
    '../../lib/popupDetailContent': load('src/lib/popupDetailContent.ts', {}),
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
    calls, navigation, alerts, shares, heart, bodyHeart, count, settle,
    tree: () => tree, nodes: () => nodes(tree), flush,
    press() { heart().props.onPress(); flush(); },
    queue(promise) { pendingMutations.push(promise); },
  };
}

test('body heart adds and removes the same server favorite as the floating CTA', async () => {
  const s = screen(); await s.settle();
  assert.equal(s.bodyHeart().props.accessibilityState.selected, false);
  s.bodyHeart().props.onPress(); await s.settle();
  assert.equal(s.calls[1].method, 'POST');
  assert.equal(s.heart().props.accessibilityState.selected, true);
  assert.equal(s.bodyHeart().props.accessibilityState.selected, true);
  assert.equal(s.count(), '1');
  s.bodyHeart().props.onPress(); await s.settle();
  assert.equal(s.calls[2].method, 'DELETE');
  assert.equal(s.heart().props.accessibilityState.selected, false);
  assert.equal(s.bodyHeart().props.accessibilityState.selected, false);
  assert.equal(s.count(), '0');
});

test('favorite digits use tabular advances without reserved width or extra group margins', async () => {
  for (const initialCount of Array.from({ length: 10 }, (_, index) => index)) {
    const s = screen({ initialCount }); await s.settle();
    const initialBody = s.bodyHeart();
    const initialCountText = initialBody.props.children[1];
    const style = Object.assign({}, ...initialCountText.props.style);
    assert.deepEqual(style.fontVariant, ['tabular-nums']);
    assert.equal(style.minWidth, undefined, 'no trailing reserved space after a single digit');
    assert.equal(style.width, undefined, 'digit count may grow naturally');
    const stats = s.nodes().find(node => node.props?.children?.includes?.(initialBody));
    assert.equal(stats.props.style.columnGap, 12, 'compact item spacing preserves the count slot');
    assert.equal(stats.props.style.justifyContent, undefined);
    assert.equal(initialBody.props.style.width, undefined);
    const siblings = stats.props.children.slice(1);
    for (const item of stats.props.children) {
      assert.equal(item.props.style.columnGap, 5);
      for (const key of ['margin', 'marginLeft', 'marginRight', 'marginStart', 'marginEnd', 'paddingLeft', 'paddingRight']) {
        assert.equal(item.props.style[key], undefined);
        assert.equal(style[key], undefined);
      }
    }
    for (const sibling of siblings) assert.equal(sibling.props.children[1].props.style.fontVariant, undefined);
    for (const expectedCount of [initialCount + 1, initialCount]) {
      s.press(); await s.settle();
      const body = s.bodyHeart();
      assert.equal(body.props.children[1].props.children, expectedCount);
      assert.deepEqual(body.props.children[1].props.style, initialCountText.props.style);
      assert.equal(body.props.children[0].props.size, 18);
      assert.equal(body.props.style, initialBody.props.style);
      const nextStats = s.nodes().find(node => node.props?.children?.includes?.(body));
      assert.equal(JSON.stringify(nextStats.props.children.slice(1)), JSON.stringify(siblings), 'sibling layout/text/icon props stay unchanged; render callbacks may be recreated');
    }
  }
});

test('stats use server rating/count with one decimal, hide zero review count and preserve review navigation', async () => {
  for (const [averageRating, reviewCount, expectedRating, expectedReviews] of [
    [undefined, undefined, '0.0', '후기'], [null, null, '0.0', '후기'],
    [0, 0, '0.0', '후기'], [4, 1, '4.0', '후기 1개'], [14 / 3, 12, '4.7', '후기 12개'],
  ]) {
    const s = screen({ detail: { averageRating, reviewCount } }); await s.settle();
    const stats = s.nodes().find(node => node.props?.children?.includes?.(s.bodyHeart()));
    const [favorite, rating, reviews] = stats.props.children;
    assert.equal(rating.props.children[1].props.children, expectedRating);
    assert.equal(reviews.props.children[1].props.children, expectedReviews);
    assert.equal(reviews.props.children[2].props.size, 16, 'review chevron is retained');
    assert.equal(favorite.props.children[1].props.style[1].minWidth, undefined);
    assert.equal(stats.props.style.columnGap, 12);
    reviews.props.onPress(); s.flush();
    assert.equal(s.nodes().find(node => node.type?.name === 'DetailTabs').props.selectedTab, 'reviews');
    s.nodes().find(node => node.type?.name === 'DetailTabs').props.onSelectInfo(); s.flush();
    rating.props.onPress(); s.flush();
    assert.equal(s.nodes().find(node => node.type?.name === 'DetailTabs').props.selectedTab, 'reviews');
    assert.equal(s.calls.length, 1, 'stats are read from detail; no extra review fetch');
  }
});

test('hero has only white chevron/share actions with matching subtle shadows and 44px targets', async () => {
  const s = screen(); await s.settle();
  const hero = s.nodes().find(node => Array.isArray(node.props?.style) && node.props.style[0]?.position === 'relative');
  const controls = hero.props.children[1];
  const buttons = nodes(controls).filter(node => node.type === 'Pressable');
  assert.equal(buttons.length, 2, 'favorite action is outside the hero');
  const [back, share] = buttons;
  assert.equal(back.props.children.type, 'ChevronLeft');
  assert.equal(share.props.children.type, 'Share2');
  assert.equal(back.props.style, share.props.style);
  for (const button of buttons) {
    assert.equal(button.props.children.props.color, '#FFFFFF');
    assert.equal(button.props.children.props.size, 24);
    assert.equal(button.props.style.backgroundColor, undefined);
    assert.equal(button.props.style.borderRadius, undefined);
    assert.ok(button.props.style.width >= 44 && button.props.style.height >= 44);
    assert.ok(button.props.style.shadowOpacity > 0 && button.props.style.shadowOpacity <= 0.25);
    assert.equal(button.props.style.shadowRadius, 2);
  }
  assert.equal(controls.props.style[1].top, 52, 'existing safe-area position is preserved');
  back.props.onPress(); share.props.onPress(); await s.settle();
  assert.deepEqual(s.navigation, ['back']);
  assert.deepEqual(s.shares, [{ message: '팝업' }]);
  assert.equal(s.calls.length, 1, 'actions do not refetch detail');
});

test('floating favorite follows server state with white outline/fill and content-sized pill', async () => {
  const s = screen(); await s.settle();
  const initial = s.heart();
  assert.equal(displayed(initial), '찜하기');
  assert.equal(initial.props.children[0].props.fill, 'none');
  assert.equal(initial.props.children[0].props.color, '#FFFFFF');
  assert.equal(initial.props.style[0].backgroundColor, '#FF5A6E');
  assert.equal(initial.props.style[0].width, undefined);
  assert.equal(initial.props.children[0].props.size, 18);
  assert.equal(initial.props.style[0].height, 48);
  s.press(); await s.settle();
  assert.equal(displayed(s.heart()), '찜했어요');
  assert.equal(s.heart().props.children[0].props.fill, '#FFFFFF');
  assert.equal(s.heart().props.accessibilityLabel, '찜 해제');
  assert.deepEqual(s.heart().props.style, initial.props.style);
  s.press(); await s.settle();
  assert.equal(displayed(s.heart()), '찜하기');
  assert.equal(s.heart().props.children[0].props.fill, 'none');
});

test('floating favorite uses the actual community write button geometry, typography and shadow', async () => {
  const source = readFileSync('src/screens/CommunityScreen.tsx', 'utf8');
  const ast = ts.createSourceFile('CommunityScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tokens = load('src/theme/tokens.ts', {});
  function findStyle(name) {
    let expression;
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) expression = node.initializer.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(expression, `Community style ${name} exists`);
    return new Function('spacing', 'radius', 'typography', 'communityColors', `return (${expression});`)(
      tokens.spacing, tokens.radius, tokens.typography, { charcoal: '#364152', white: '#FFFFFF' });
  }
  const s = screen(); await s.settle();
  const { backgroundColor: favoriteColor, ...favoriteStyle } = s.heart().props.style[0];
  const { backgroundColor: writeColor, ...writeStyle } = findStyle('writeButton');
  assert.deepEqual(favoriteStyle, writeStyle);
  assert.deepEqual(s.heart().props.children[1].props.style, findStyle('writeText'));
  assert.equal(favoriteColor, '#FF5A6E');
  assert.notEqual(favoriteColor, writeColor);
});

test('floating favorite stays outside scrolling content and visible on both tabs with safe-area offsets', async () => {
  for (const insets of [{ top: 0, bottom: 0, left: 0, right: 0 }, { top: 59, bottom: 34, left: 0, right: 8 }]) {
    const s = screen({ insets }); await s.settle();
    const expectedStyle = s.heart().props.style;
    assert.equal(expectedStyle[0].position, 'absolute');
    assert.equal(expectedStyle[1].bottom, insets.bottom + (12 + 60) / 2 + 16);
    assert.equal(expectedStyle[1].right, insets.right + 16);
    for (const tab of ['reviews', 'info']) {
      const tabs = s.nodes().find(node => node.type?.name === 'DetailTabs');
      tabs.props[tab === 'reviews' ? 'onSelectReviews' : 'onSelectInfo'](); s.flush();
      const scroll = s.nodes().find(node => node.type === 'ScrollView' && node.props.onScroll);
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 600 } } }); s.flush();
      assert.ok(s.tree().props.children.includes(s.heart()), 'CTA is a direct child of the viewport');
      assert.ok(!nodes(scroll).includes(s.heart()), 'CTA never moves with ScrollView');
      assert.deepEqual(s.heart().props.style, expectedStyle);
      assert.equal(s.nodes().find(node => node.type?.name === 'DetailTabs').props.selectedTab, tab);
    }
    assert.equal(s.calls.length, 1, 'scroll/tab changes do not refetch detail');
  }
});

test('saved token initializes detail and POST then DELETE update the visible heart and total', async () => {
  const s = screen(); await s.settle();
  assert.equal(s.heart().props.accessibilityState.selected, false);
  assert.equal(s.count(), '0');
  assert.equal(s.calls[0].headers.Authorization, 'Bearer saved-token');
  s.press(); await s.settle();
  assert.equal(s.calls[1].method, 'POST');
  assert.equal(s.calls[1].url, 'http://api/api/popups/popup-public-id/favorite');
  assert.equal(s.calls[1].headers.Authorization, 'Bearer saved-token');
  assert.equal(s.heart().props.accessibilityState.selected, true);
  assert.equal(s.count(), '1');
  s.press(); await s.settle();
  assert.equal(s.calls[2].method, 'DELETE');
  assert.equal(s.heart().props.accessibilityState.selected, false);
  assert.equal(s.count(), '0');
  assert.equal(s.heart().props.disabled, false);
});

test('existing server favorite is selected on entry and DELETE decreases its count', async () => {
  const s = screen({ initialCount: 7, initialFavorited: true }); await s.settle();
  assert.equal(s.heart().props.accessibilityState.selected, true);
  assert.equal(s.count(), '7');
  s.press(); await s.settle();
  assert.equal(s.calls[1].method, 'DELETE');
  assert.equal(s.heart().props.accessibilityState.selected, false);
  assert.equal(s.count(), '6');
});

test('pending request blocks repeated taps and unlocks after success', async () => {
  const s = screen(); await s.settle();
  const pending = deferred(); s.queue(pending.promise);
  s.press(); await s.settle();
  assert.equal(s.heart().props.disabled, true);
  s.heart().props.onPress(); await s.settle();
  assert.equal(s.calls.filter((call) => call.method === 'POST').length, 1);
  pending.resolve(response({ publicId: 'popup-public-id', isFavorited: true, favoriteCount: 1 }));
  await s.settle();
  assert.equal(s.heart().props.disabled, false);
  assert.equal(s.count(), '1');
});

test('failed request preserves the server detail and allows retry', async () => {
  const s = screen(); await s.settle();
  s.queue(Promise.resolve(response({ error: 'server_error' }, 500)));
  s.press(); await s.settle();
  assert.equal(s.heart().props.disabled, false);
  assert.equal(s.heart().props.accessibilityState.selected, false);
  assert.equal(s.count(), '0');
  assert.equal(s.alerts.length, 1);
  s.press(); await s.settle();
  assert.equal(s.heart().props.accessibilityState.selected, true);
  assert.equal(s.count(), '1');
});

test('without token the public count renders and tapping routes to login without POST', async () => {
  const s = screen({ token: null, initialCount: 31 }); await s.settle();
  assert.equal(s.count(), '31');
  assert.equal(s.calls[0].headers, undefined);
  s.press(); await s.settle();
  assert.deepEqual(s.navigation, ['/profile/login']);
  assert.equal(s.calls.length, 1);
});
