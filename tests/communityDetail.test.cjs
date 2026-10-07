const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  mocks = { '../../components/community/CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' }, ...mocks };
  if (!['src/lib/communityFeedRefresh.ts', 'src/lib/communityTime.ts'].includes(file)) mocks = {
    './communityFeedRefresh': load('src/lib/communityFeedRefresh.ts'),
    '../../lib/communityFeedRefresh': load('src/lib/communityFeedRefresh.ts'),
    '../../lib/communityLikes': { changeCommunityLike: async () => {} },
    '../../lib/auth': { subscribeAuthSession: () => () => {} },
    '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: Date.now() }) },
    '../../lib/communityTime': load('src/lib/communityTime.ts', { '../locales': { t: (key) => key } }),
    '../../components/community/CommunityComments': { __esModule: true, default: 'CommunityComments' },
    ...mocks,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in mocks)) throw new Error(`Missing mock: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
const jsx = (type, props, key) => ({ type, props, key });
const native = Object.fromEntries(['View', 'Text', 'Image', 'FlatList', 'Pressable', 'ScrollView', 'ActivityIndicator'].map((key) => [key, key]));
native.StyleSheet = { create: (styles) => styles };
const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
  '../../theme/tokens': { radius: { full: 999, radius8: 8 }, spacing: { space4: 4, space6: 6, space8: 8, space12: 12, space16: 16, space24: 24, space40: 40 }, typography: {} },
  '../../theme/communityColors': { communityColors: { charcoal: '#303A49', divider: '#E8EBF0' } },
  '../../locales': { t: (key) => key },
};
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];

function hooks() {
  const values = [], effects = [];
  let index = 0, effectIndex = 0;
  const refs = [], callbacks = [];
  let refIndex = 0, callbackIndex = 0;
  return {
    react: {
      useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useCallback(fn, deps) {
        const i = callbackIndex++, old = callbacks[i];
        if (old && deps.every((dep, n) => dep === old.deps[n])) return old.fn;
        callbacks[i] = { fn, deps }; return fn;
      },
      useState(initial) {
        const current = index++;
        if (!(current in values)) values[current] = initial;
        return [values[current], (value) => { values[current] = typeof value === 'function' ? value(values[current]) : value; }];
      },
      useEffect(callback, deps) {
        const current = effectIndex++;
        const previous = effects[current];
        if (previous && deps.every((value, i) => value === previous.deps[i])) return;
        previous?.cleanup?.();
        effects[current] = { deps, cleanup: callback() };
      },
    },
    render(component, props) { index = 0; effectIndex = 0; refIndex = 0; callbackIndex = 0; return component(props); },
    cleanup() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const post = { id: 1, category: 'QUESTION', author: { id: 2, nickname: 'author', avatarUrl: null },
  content: 'Full body\n'.repeat(100), createdAt: '2026-10-04T10:00:00+09:00', updatedAt: '2026-10-04T11:00:00+09:00',
  images: [], likeCount: 2, liked: false, commentCount: 3, viewCount: 9 };
const diagnostics = load('src/lib/communityDiagnostics.ts');
const api = load('src/lib/community.ts', { '../constants/api': { API_BASE_URL: 'https://api.example' },
  './auth': { getAuthSession: async () => ({ accessToken: null, generation: 0 }) }, './communityDiagnostics': diagnostics });

test('detail client is public, preserves QUESTION/FREE data and propagates missing/excluded responses', async () => {
  const original = global.fetch;
  const signal = new AbortController().signal;
  const requests = [];
  try {
    for (const category of ['QUESTION', 'FREE']) {
      global.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ...post, category }) }; };
      assert.equal((await api.getCommunityPost(1, signal)).category, category);
      assert.equal(requests.at(-1).url, 'https://api.example/api/community/posts/1');
      assert.deepEqual(requests.at(-1).options, { signal });
    }
    global.fetch = async () => ({ ok: false, status: 404, text: async () => 'Not found' });
    await assert.rejects(api.getCommunityPost(999, signal), (error) => error instanceof api.CommunityApiError && error.status === 404);
    for (const category of ['REVIEW', 'ON_SITE_INFO']) {
      global.fetch = async () => ({ ok: true, json: async () => ({ ...post, category }) });
      await assert.rejects(api.getCommunityPost(1, signal), /Invalid community detail/);
    }
    global.fetch = async () => { throw new Error('Invalid IDs must not request the network'); };
    for (const id of [0, -1, NaN, 1.5]) await assert.rejects(api.getCommunityPost(id, signal), (error) => error.status === 404);
  } finally { global.fetch = original; }
});

test('detail screen displays the full body and like action; handles loading, 404, retry and abort', async () => {
  const state = hooks();
  let response = post;
  let failure;
  let id = '1';
  let signal;
  let back = 0;
  const requests = [];
  const Screen = load('src/app/community/[id].tsx', { ...common, react: state.react,
    'expo-router': { useFocusEffect: () => {}, useLocalSearchParams: () => ({ id }), useRouter: () => ({ canGoBack: () => true, back() { back++; } }) },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', MoreHorizontal: 'MoreHorizontal', Heart: 'Heart', MessageCircle: 'MessageCircle' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
    '../../components/community/CommunityAuthor': { __esModule: true, default: 'CommunityAuthor' },
    '../../components/community/CommunityImageCarousel': { __esModule: true, default: 'CommunityImageCarousel' },
    '../../lib/community': { CommunityApiError: api.CommunityApiError, async getCommunityPost(value, nextSignal) {
      signal = nextSignal; requests.push(value); if (failure) throw failure; return response;
    } },
  }).default;
  let tree = state.render(Screen);
  assert.ok(nodes(tree).some((node) => node.type === 'ActivityIndicator'));
  await flush();
  tree = state.render(Screen);
  const body = nodes(tree).find((node) => node.type === 'Text' && node.props.children === post.content);
  assert.ok(body);
  assert.equal(body.props.numberOfLines, undefined);
  assert.deepEqual(nodes(tree).find((node) => node.type === 'CommunityAuthor').props.author, post.author);
  assert.deepEqual(nodes(tree).find((node) => node.type === 'CommunityImageCarousel').props.images, []);
  assert.ok(nodes(tree).some((node) => node.type === 'Heart'));
  assert.ok(nodes(tree).some((node) => node.type === 'MessageCircle'));
  assert.equal(nodes(tree).filter((node) => node.type === 'Pressable').length, 2, 'back and post like are actionable');
  nodes(tree).find((node) => node.type === 'Pressable').props.onPress();
  assert.equal(back, 1);
  for (const images of [['one'], ['one', 'two', 'three']]) {
    id = String(Number(id) + 1); response = { ...post, images };
    state.render(Screen); await flush(); tree = state.render(Screen);
    assert.deepEqual(nodes(tree).find((node) => node.type === 'CommunityImageCarousel').props.images, images);
  }
  id = '999'; failure = new api.CommunityApiError(404);
  state.render(Screen); await flush(); tree = state.render(Screen);
  assert.ok(nodes(tree).some((node) => node.props?.children === 'community.detail.missing'));
  assert.equal(nodes(tree).filter((node) => node.type === 'Pressable').length, 1);
  id = '5'; failure = new Error('offline');
  state.render(Screen); await flush(); tree = state.render(Screen);
  assert.ok(nodes(tree).some((node) => node.props?.children === 'community.detail.failed'));
  const retry = nodes(tree).find((node) => node.type === 'Pressable' && nodes(node).some((child) => child.props?.children === 'community.detail.retry'));
  failure = null; retry.props.onPress(); state.render(Screen); await flush();
  assert.equal(requests.at(-1), 5);
  state.cleanup();
  assert.equal(signal.aborted, true);
});

test('carousel omits zero images; one image has no indicator; multiple pages snap one measured width with pill/dot state', () => {
  for (const count of [0, 1, 2, 3, 4, 5]) {
    const state = hooks();
    const Carousel = load('src/components/community/CommunityImageCarousel.tsx', { ...common, react: state.react }).default;
    const images = Array.from({ length: count }, (_, i) => `signed:${i}`);
    let tree = state.render(Carousel, { images });
    if (!count) { assert.equal(tree, null); continue; }
    nodes(tree).find((node) => node.props?.onLayout).props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    tree = state.render(Carousel, { images });
    const list = nodes(tree).find((node) => node.type === 'FlatList');
    assert.equal(list.props.horizontal, true);
    assert.equal(list.props.pagingEnabled, true);
    assert.equal(list.props.scrollEnabled, count > 1);
    assert.deepEqual(list.props.data, images);
    for (let index = 0; index < count; index++) {
      assert.deepEqual(list.props.getItemLayout(null, index), { length: 320, offset: index * 320, index });
      const image = list.props.renderItem({ item: images[index], index });
      assert.deepEqual(image.props.style, { width: 320, height: 320 });
      assert.equal(image.props.source.uri, images[index]);
    }
    const indicators = (value) => nodes(value).filter((node) => node.props?.accessibilityState);
    assert.equal(indicators(tree).length, count > 1 ? count : 0);
    if (count > 1) {
      assert.equal(indicators(tree)[0].props.accessibilityState.selected, true);
      assert.equal(list.props.scrollEventThrottle, 16);
      assert.equal(list.props.onMomentumScrollEnd, undefined);
      list.props.onScroll({ nativeEvent: { contentOffset: { x: 159 } } });
      assert.equal(indicators(state.render(Carousel, { images }))[0].props.accessibilityState.selected, true);
      list.props.onScroll({ nativeEvent: { contentOffset: { x: 161 } } });
      tree = state.render(Carousel, { images });
      const dots = indicators(tree);
      assert.deepEqual(dots.map((dot) => dot.props.accessibilityState.selected), images.map((_, index) => index === 1));
      assert.equal(dots[0].props.style[0].width, 6);
      assert.equal(dots[1].props.style[1].width, 18);
      list.props.onScroll({ nativeEvent: { contentOffset: { x: 99999 } } });
      tree = state.render(Carousel, { images });
      assert.equal(indicators(tree).at(-1).props.accessibilityState.selected, true);
      list.props.onScroll({ nativeEvent: { contentOffset: { x: 0 } } });
      assert.equal(indicators(state.render(Carousel, { images }))[0].props.accessibilityState.selected, true);
      list.props.onScroll({ nativeEvent: { contentOffset: { x: -50 } } });
      assert.equal(indicators(state.render(Carousel, { images }))[0].props.accessibilityState.selected, true);
      nodes(tree).find((node) => node.props?.onLayout).props.onLayout({ nativeEvent: { layout: { width: 400 } } });
      tree = state.render(Carousel, { images });
      assert.equal(indicators(tree)[0].props.accessibilityState.selected, true);
      assert.equal(nodes(tree).find((node) => node.type === 'FlatList').key, 400);
    }
  }
});

test('author reuses real avatar URL and falls back to UserRound when missing or loading fails', () => {
  const state = hooks();
  const Author = load('src/components/community/CommunityAuthor.tsx', { ...common, react: state.react,
    'lucide-react-native': { UserRound: 'UserRound' } }).default;
  let tree = state.render(Author, { author: post.author, createdAt: post.createdAt });
  assert.ok(nodes(tree).some((node) => node.type === 'UserRound'));
  const author = { ...post.author, avatarUrl: 'signed:avatar' };
  tree = state.render(Author, { author, createdAt: post.createdAt });
  const image = nodes(tree).find((node) => node.type === 'Image');
  assert.equal(image.props.source.uri, 'signed:avatar');
  image.props.onError();
  tree = state.render(Author, { author, createdAt: post.createdAt });
  assert.equal(nodes(tree).some((node) => node.type === 'Image'), false);
  assert.ok(nodes(tree).some((node) => node.type === 'UserRound'));
});
