const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const updateNow = () => {};
function load(file, mocks) {
  if (!['src/lib/communityFeedRefresh.ts', 'src/lib/communityTime.ts'].includes(file)) mocks = {
    './communityFeedRefresh': load('src/lib/communityFeedRefresh.ts', {}),
    '../lib/communityLikes': { changeCommunityLike: async () => {} },
    '../lib/auth': { subscribeAuthSession: () => () => {} },
    '../hooks/useCommunityNow': { useCommunityNow: () => ({ now: Date.now(), updateNow }) },
    '../lib/communityRefresh': { waitForCommunityRefresh: async () => {} },
    '../../lib/communityTime': load('src/lib/communityTime.ts', { '../locales': { t: (key) => key } }),
    ...mocks,
  };
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports,
  );
  return module.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx };

test('client sends category, sort and cursor to the single feed API', async () => {
  let requested;
  const { getCommunityFeed } = load('src/lib/community.ts', {
    '../constants/api': { API_BASE_URL: 'https://example.test' },
    './auth': { getAuthSession: async () => ({ accessToken: null, generation: 0 }) },
    './communityDiagnostics': load('src/lib/communityDiagnostics.ts', {}),
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ items: [], nextCursor: null }) };
  };
  try {
    const signal = new AbortController().signal;
    assert.deepEqual(await getCommunityFeed('QUESTION', 'POPULAR', 'next-page', signal),
      { items: [], nextCursor: null });
    const url = new URL(requested.url);
    assert.equal(url.pathname, '/api/community/feed');
    assert.equal(url.searchParams.get('category'), 'QUESTION');
    assert.equal(url.searchParams.get('sort'), 'POPULAR');
    assert.equal(url.searchParams.get('cursor'), 'next-page');
    assert.equal(requested.options.signal, signal);
  } finally { global.fetch = originalFetch; }
});

test('feed preserves detail returns, refreshes successful writes and pulls, and guards pagination/concurrent requests', async () => {
  const calls = [];
  const routes = [];
  const stack = ['Community'];
  const alerts = [];
  let navigationFails = false;
  const signals = [];
  let revision = 0;
  let respond;
  const row = { type: 'POST', id: 1, category: 'FREE', author: { id: 1, nickname: '작성자', avatarUrl: null },
    content: '실제 본문', createdAt: '2026-10-04T10:00:00+09:00', regionName: null, popup: null,
    rating: null, images: [], likeCount: 0, commentCount: 0, viewCount: 0 };
  const state = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let hook = 0;
  let callbackIndex = 0;
  let effectIndex = 0;
  let focused = true;
  let focusIndex = 0;
  const focusEffects = [];
  const react = {
    useEffect(effect, deps) {
      const index = effectIndex++;
      if (!effects[index]) effects[index] = { deps, cleanup: effect() };
    },
    useState(initial) {
      const index = hook++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = hook++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useCallback(callback, deps) {
      const index = callbackIndex++;
      const prior = callbacks[index];
      if (prior && deps.every((value, i) => value === prior.deps[i])) return prior.callback;
      callbacks[index] = { deps, callback };
      return callback;
    },
    useFocusEffect(callback) {
      const index = focusIndex++;
      const previous = focusEffects[index];
      if (callback !== previous?.callback) {
        if (focused) previous?.cleanup?.();
        focusEffects[index] = { callback, cleanup: focused ? callback() : null };
      }
    },
  };
  const native = { ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Pressable: 'Pressable',
    Alert: { alert: (...args) => alerts.push(args) },
    ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles) => styles } };
  const Screen = load('src/screens/CommunityScreen.tsx', {
    react, 'react/jsx-runtime': runtime,
    'expo-router': { useFocusEffect: react.useFocusEffect, useRouter: () => ({ push(route) {
      if (navigationFails) throw new Error('navigation failed');
      routes.push(route); stack.push(route);
    } }) },
    'lucide-react-native': { Pencil: 'Pencil', Settings: 'Settings' },
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../components/community/CommunityPostItem': { default: 'CommunityPostItem' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 },
    '../lib/community': { getCommunityFeed: async (category, sort, cursor, signal) => {
      calls.push([category, sort, cursor]);
      signals.push(signal);
      if (respond) return respond(category, sort, cursor);
      return category === 'FREE'
        ? { items: cursor ? [row, { ...row, id: 2 }] : [row], nextCursor: cursor ? null : 'after' }
        : { items: [], nextCursor: null };
    } },
    '../lib/communityFeedRefresh': { ...load('src/lib/communityFeedRefresh.ts', {}), communityFeedRevision: () => revision },
    '../locales': { t: (key) => key },
    '../theme/communityColors': { communityColors: {} },
    '../theme/tokens': { radius: {}, spacing: {}, typography: {} },
  }).default;
  const render = () => { hook = 0; callbackIndex = 0; effectIndex = 0; focusIndex = 0; return Screen(); };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const blur = () => {
    if (!focused) return;
    focused = false;
    focusEffects.forEach((effect) => { effect.cleanup?.(); effect.cleanup = null; });
  };
  const focus = () => {
    if (focused) return;
    focused = true;
    focusEffects.forEach((effect) => { effect.cleanup = effect.callback() ?? null; });
  };
  render(); await flush();
  assert.equal(calls.length, 1, 'initial focus makes one request');
  let tree = render();
  let list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(list.props.data, []);
  assert.equal(calls[0][0], 'ALL');
  nodes(list.props.ListHeaderComponent).find((node) => node.props?.accessibilityState?.selected === false
    && node.props?.children?.props?.children === 'community.category.free').props.onPress();
  render(); await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(list.props.data, [row]);
  const write = () => nodes(render()).find((node) => node.props?.accessibilityLabel === 'community.write').props.onPress;
  const openPost = (id = 1) => nodes(render()).find((node) => node.type === 'FlatList')
    .props.renderItem({ item: { ...row, id } }).props.onPressPost;
  const returnToFeed = () => {
    blur();
    assert.equal(stack.length, 2, 'one destination is on the stack');
    stack.pop();
    assert.deepEqual(stack, ['Community'], 'one back returns to Community');
    focus(); render();
  };
  const repeatedPress = (handler, expected, description) => {
    const before = routes.length;
    for (let tap = 0; tap < 10; tap++) handler();
    assert.equal(routes.length, before + 1, description);
    assert.deepEqual(routes.at(-1), expected);
  };
  repeatedPress(write(), '/community/write', 'rapid write taps push once');
  // Neither a render nor a different destination may unlock a transition in progress.
  const lockedRoutes = routes.length;
  openPost(2)(); write()();
  assert.equal(routes.length, lockedRoutes, 'same-focus renders preserve the navigation lock');
  returnToFeed();
  repeatedPress(write(), '/community/write', 'write can reopen after one back');
  returnToFeed();
  const postRoute = (id) => ({ pathname: '/community/[id]', params: { id: String(id) } });
  repeatedPress(openPost(), postRoute(1), 'write return allows post entry and rapid same-post taps push once');
  returnToFeed();
  repeatedPress(openPost(), postRoute(1), 'same post can reopen after one back');
  returnToFeed();
  repeatedPress(openPost(2), postRoute(2), 'post A return allows post B');
  returnToFeed();
  repeatedPress(write(), '/community/write', 'post return allows writing');
  returnToFeed();
  navigationFails = true;
  const beforeFailure = routes.length;
  openPost()();
  assert.equal(routes.length, beforeFailure); assert.equal(alerts.length, 1);
  navigationFails = false;
  repeatedPress(write(), '/community/write', 'push exception releases the lock immediately');
  returnToFeed();
  assert.equal(calls.length, 2, 'all normal returns preserve the feed without refetch');
  for (const category of ['QUESTION', 'FREE']) {
    list.props.renderItem({ item: { ...row, category } }).props.onPressPost();
    assert.deepEqual(routes.at(-1), { pathname: '/community/[id]', params: { id: '1' } });
    returnToFeed();
  }
  for (const category of ['REVIEW', 'ON_SITE_INFO']) {
    const item = { ...row, type: category === 'REVIEW' ? 'REVIEW' : 'POST', category };
    assert.equal(list.props.renderItem({ item }).props.onPressPost, undefined);
  }
  const reviewItem = list.props.renderItem({ item: { ...row, type: 'REVIEW', category: 'REVIEW' } });
  repeatedPress(reviewItem.props.onPressReview, { pathname: '/reviews/[id]', params: { id: '1' } }, 'REVIEW uses its own ID namespace and shares the synchronous lock');
  returnToFeed();
  assert.equal(calls.length, 2, 'review detail back preserves the feed and pagination');
  assert.deepEqual(calls[1], ['FREE', 'LATEST', null]);
  nodes(list.props.ListHeaderComponent).find((node) => node.props?.children?.props?.children === 'community.sort.popular').props.onPress();
  render(); await flush();
  assert.deepEqual(calls[2], ['FREE', 'POPULAR', null]);
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  list.props.onEndReached();
  list.props.onEndReached();
  assert.equal(calls.length, 4);
  await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(list.props.data.map((item) => item.id), [1, 2]);
  list.props.onEndReached();
  assert.equal(calls.length, 4);

  const preservedData = list.props.data;
  blur();
  render();
  assert.equal(calls.length, 4, 'blur does not request another page');
  focus();
  await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.equal(calls.length, 4, 'detail return does not request the feed');
  assert.equal(list.props.data, preservedData, 'detail return preserves the same list data reference');
  assert.equal(list.props.refreshing, false);
  assert.equal(list.props.key, undefined, 'list is not remounted');
  blur();
  revision++;
  focus();
  await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(calls[4], ['FREE', 'POPULAR', null], 'successful write explicitly reloads the current filters');
  assert.deepEqual(list.props.data, [row]);
  list.props.onEndReached();
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[5], ['FREE', 'POPULAR', 'after']);
  await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(list.props.data.map((item) => item.id), [1, 2], 'pagination continues after refocus');
  blur();
  focus();
  assert.equal(calls.length, 6, 'write invalidation is consumed once');

  let resolvePull;
  respond = () => new Promise((resolve) => { resolvePull = resolve; });
  list.props.onRefresh();
  list.props.onRefresh();
  list.props.onEndReached();
  assert.equal(calls.length, 7, 'pull duplicate and concurrent load-more are blocked');
  assert.deepEqual(calls[6], ['FREE', 'POPULAR', null]);
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.equal(list.props.refreshing, true);
  assert.deepEqual(list.props.data.map((item) => item.id), [1, 2], 'pull retains rows until replacement arrives');
  blur(); focus();
  assert.equal(calls.length, 7, 'focus never restarts an active pull');
  assert.equal(signals.at(-1).aborted, false, 'blur keeps the active request alive');
  resolvePull({ items: [{ ...row, id: 3 }], nextCursor: 'fresh' });
  await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.equal(list.props.refreshing, false);
  assert.deepEqual(list.props.data.map((item) => item.id), [3], 'pull replaces all paginated rows');
  respond = async (category, sort, cursor) => {
    assert.equal(cursor, 'fresh'); return { items: [{ ...row, id: 4 }], nextCursor: null };
  };
  list.props.onEndReached(); await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.deepEqual(list.props.data.map((item) => item.id), [3, 4]);
  respond = async () => { throw new Error('offline'); };
  list.props.onRefresh(); await flush();
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  assert.equal(list.props.refreshing, false, 'failed pull releases the native refresh indicator');
  assert.deepEqual(list.props.data.map((item) => item.id), [3, 4]);
  let resolveOldPull;
  respond = () => new Promise((resolve) => { resolveOldPull = resolve; });
  list.props.onRefresh();
  const superseded = signals.at(-1);
  const beforeFilterChange = calls.length;
  tree = render();
  list = nodes(tree).find((node) => node.type === 'FlatList');
  nodes(list.props.ListHeaderComponent).find((node) => node.props?.accessibilityState?.selected === false
    && node.props?.children?.props?.children === 'community.category.question').props.onPress();
  respond = async () => ({ items: [], nextCursor: null });
  render(); await flush();
  assert.equal(calls.length, beforeFilterChange + 1, 'filter changes replace an in-flight pull');
  assert.deepEqual(calls.at(-1), ['QUESTION', 'POPULAR', null]);
  assert.equal(superseded.aborted, true);
  assert.equal(nodes(render()).find((node) => node.type === 'FlatList').props.refreshing, false);
  resolveOldPull({ items: [{ ...row, id: 99 }], nextCursor: 'stale' });
  await flush();
  assert.deepEqual(nodes(render()).find((node) => node.type === 'FlatList').props.data, [], 'late cancelled refresh cannot overwrite the new filter');
  blur();
  effects.forEach((effect) => effect.cleanup?.());
  assert.equal(signals.at(-1).aborted, true, 'unmount still cancels the request');
});

test('cards render review popup and rating; posts have no popup, rating or image', () => {
  const Card = load('src/components/community/CommunityPostItem.tsx', {
    'react/jsx-runtime': runtime,
    'lucide-react-native': Object.fromEntries(['ChevronRight', 'Heart', 'MapPin', 'MessageCircle', 'MoreHorizontal', 'Star', 'UserRound'].map((name) => [name, name])),
    'react-native': { Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (styles) => styles } },
    '../../locales': { t: (key) => key },
    '../../theme/communityColors': { communityColors: {} },
    '../../theme/tokens': { radius: {}, spacing: {}, typography: {} },
  }).default;
  const base = { id: 1, author: { id: 1, nickname: '작성자', avatarUrl: null }, content: '실제 본문',
    createdAt: '2026-10-04T10:00:00+09:00', regionName: null, images: [], popup: null, rating: null,
    likeCount: 2, commentCount: 1, viewCount: 3 };
  const review = Card({ post: { ...base, type: 'REVIEW', category: 'REVIEW',
    popup: { publicId: 'uuid', title: '팝업' }, rating: 4.5, images: ['signed:image'] } });
  assert.equal(nodes(review).filter((node) => node.type === 'Star').length, 1);
  assert.equal(nodes(review).find((node) => node.type === 'Image').props.source.uri, 'signed:image');
  assert.equal(nodes(review).find((node) => node.props?.accessibilityLabel === '팝업').props.disabled, true);
  const profile = review.props.children[0];
  assert.equal(nodes(profile).filter(node => node.type === 'Star').length, 1, 'rating belongs to author metadata');
  assert.equal(nodes(profile).filter(node => node.type === 'MoreHorizontal').length, 1);
  assert.equal(nodes(profile).find(node => node.type === 'MoreHorizontal').props.onPress, undefined);
  assert.ok(nodes(profile).some(node => node.type === 'Text' && node.props.children === '4.5'));
  assert.equal(nodes(review).find(node => node.props?.children === base.content).props.numberOfLines, 3);
  for (let count = 0; count <= 5; count++) {
    const images = Array.from({ length: count }, (_, index) => `signed:review-${index}`);
    let placeId;
    const card = Card({ post: { ...base, type: 'REVIEW', category: 'REVIEW', rating: null, images,
      popup: { publicId: 'uuid', title: '팝업', imageUrl: 'popup:poster' } },
      onPressPlace: id => { placeId = id; } });
    const photos = nodes(card).filter(node => node.type === 'Image');
    assert.deepEqual(photos.map(node => node.props.source.uri), images.slice(0, 3), 'only review images, never popup poster');
    const collage = card.props.children.find(node => node?.props?.style?.height === 200);
    assert.equal(!!collage, count > 0, 'no empty image region');
    assert.equal(nodes(card).some(node => node.type === 'Text' && [].concat(node.props.children).join('') === `+${count - 3}`), count > 3);
    if (count > 0) {
      assert.ok(card.props.children.indexOf(collage) < card.props.children.findIndex(node => nodes(node).some(child => child.props?.children === base.content)), 'photos precede content');
    }
    const link = nodes(card).find(node => node.props?.accessibilityLabel === '팝업');
    assert.equal(link.props.disabled, false);
    let stopped = false;
    link.props.onPress({ stopPropagation() { stopped = true; } });
    assert.equal(placeId, 'uuid');
    assert.equal(stopped, true, 'popup link must not also open review detail');
    assert.equal(nodes(card).filter(node => node.type === 'Pressable').length, 2, 'popup link and disabled like without a handler');
    assert.equal(nodes(card).filter(node => node.type === 'Star').length, 0, 'missing rating has no placeholder');
  }
  const reviewWithoutPopup = Card({ post: { ...base, type: 'REVIEW', category: 'REVIEW', popup: null, rating: 4.0 } });
  assert.equal(nodes(reviewWithoutPopup).filter((node) => node.type === 'Star').length, 1);
  const post = Card({ post: { ...base, type: 'POST', category: 'QUESTION', popup: null, rating: null } });
  assert.equal(nodes(post).filter((node) => node.type === 'Star').length, 0);
  assert.equal(nodes(post).filter((node) => node.type === 'Image').length, 0);
  assert.equal(nodes(post).filter((node) => node.type === 'MapPin').length, 0);
  const imagePost = Card({ post: { ...base, type: 'POST', category: 'FREE', popup: null, rating: null,
    images: ['signed:first.webp', 'signed:second.webp'] } });
  assert.equal(nodes(imagePost).find((node) => node.type === 'Image').props.source.uri, 'signed:first.webp');
  assert.ok(nodes(imagePost).some((node) => node.type === 'Text' && node.props.children === 2));
  let presses = 0;
  for (const category of ['QUESTION', 'FREE']) {
    const card = Card({ post: { ...base, type: 'POST', category }, onPressPost: () => presses++ });
    assert.equal(card.type, 'Pressable');
    assert.notEqual(card.props.disabled, true);
    card.props.onPress();
  }
  assert.equal(presses, 2);
  let reviewPresses = 0;
  const clickableReview = Card({ post: { ...base, type: 'REVIEW', category: 'REVIEW' },
    onPressReview: () => reviewPresses++, onPressPost: () => presses++ });
  assert.equal(clickableReview.type, 'Pressable'); clickableReview.props.onPress();
  assert.equal(reviewPresses, 1); assert.equal(presses, 2, 'review never invokes POST handler');
  for (const category of ['REVIEW', 'ON_SITE_INFO']) {
    const card = Card({ post: { ...base, type: category === 'REVIEW' ? 'REVIEW' : 'POST', category }, onPressPost: () => presses++ });
    assert.equal(card.type, 'View');
    assert.equal(card.props.onPress, undefined);
  }
});
