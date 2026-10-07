const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  mocks = { '../../components/community/CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' }, ...mocks };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in mocks)) throw new Error(`Missing mock ${name} in ${file}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const row = { type: 'POST', id: 1, category: 'QUESTION', author: { id: 2, nickname: 'author', avatarUrl: null },
  content: 'question', createdAt: '2026-10-04T10:00:00+09:00', updatedAt: '2026-10-04T10:00:00+09:00',
  regionName: null, popup: null, rating: null, images: [], liked: false, likeCount: 12, commentCount: 0, viewCount: 1 };

function setup() {
  let token = 'saved-token';
  let generation = 0;
  const refresh = load('src/lib/communityFeedRefresh.ts');
  const auth = { getSavedAccessToken: async () => token, getAuthSession: async () => ({ accessToken: token, generation }),
    clearTokens: async expected => { if (expected !== undefined && expected !== generation) return false;
      token = null; generation++; refresh.clearCommunityLikes(); return true; },
    subscribeAuthSession: () => () => {} };
  const api = load('src/lib/community.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' },
    './auth': auth, './communityFeedRefresh': refresh, './communityDiagnostics': load('src/lib/communityDiagnostics.ts') });
  const likes = load('src/lib/communityLikes.ts', { './auth': auth, './community': api, './communityFeedRefresh': refresh });
  const reviews = load('src/lib/reviews.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' },
    './auth': auth, './community': api, './communityFeedRefresh': refresh, './communityImages': {},
    './communityDiagnostics': load('src/lib/communityDiagnostics.ts') });
  return { refresh, auth, api, likes, reviews, setToken(value) { token = value; },
    newSession(value) { token = value; generation++; refresh.clearCommunityLikes(); } };
}

test('optimistic like/unlike, server reconciliation, rollback and duplicate taps across screens', async () => {
  const env = setup();
  const updates = [];
  env.refresh.subscribeCommunityLikes((id, state) => updates.push({ id, state }));
  const revision = env.refresh.communityFeedRevision();
  let calls = 0, resolve;
  const original = global.fetch;
  let failures = 0;
  try {
    global.fetch = async (url, options) => {
      calls++; assert.equal(url, 'https://api.test/api/community/posts/1/like');
      assert.equal(options.method, 'POST'); assert.equal(options.headers.Authorization, 'Bearer saved-token');
      assert.equal(options.body, undefined);
      return new Promise(done => { resolve = done; });
    };
    const first = env.likes.changeCommunityLike(row, () => assert.fail('login'), () => failures++);
    const duplicate = env.likes.changeCommunityLike(row, () => assert.fail('login'), () => failures++);
    await flush();
    assert.deepEqual(updates.at(-1).state, { liked: true, likeCount: 13 });
    assert.equal(calls, 1);
    resolve({ ok: true, json: async () => ({ liked: true, likeCount: 14 }) });
    await Promise.all([first, duplicate]);
    assert.deepEqual(updates.at(-1).state, { liked: true, likeCount: 14 });
    const unlike = env.likes.changeCommunityLike({ ...row, liked: true, likeCount: 14 }, () => {}, () => failures++);
    await flush();
    assert.deepEqual(updates.at(-1).state, { liked: false, likeCount: 13 });
    resolve({ ok: false, status: 500, text: async () => 'failed' }); await unlike;
    assert.deepEqual(updates.at(-1).state, { liked: true, likeCount: 14 });
    assert.equal(failures, 1);
    const successUnlike = env.likes.changeCommunityLike({ ...row, liked: true, likeCount: 14 }, () => {}, () => failures++);
    await flush(); resolve({ ok: true, json: async () => ({ liked: false, likeCount: 13 }) }); await successUnlike;
    assert.deepEqual(updates.at(-1).state, { liked: false, likeCount: 13 });
    global.fetch = async () => { throw new Error('offline'); };
    await env.likes.changeCommunityLike({ ...row, likeCount: 13 }, () => {}, () => failures++);
    assert.deepEqual(updates.at(-1).state, { liked: false, likeCount: 13 });
    assert.equal(failures, 2);
    assert.equal(env.refresh.communityFeedRevision(), revision);
  } finally { global.fetch = original; }
});

test('anonymous never calls like API; expired credentials roll back and reuse login navigation', async () => {
  const env = setup(); let logins = 0;
  const original = global.fetch;
  try {
    env.setToken(null);
    global.fetch = async () => assert.fail('anonymous network call');
    await env.likes.changeCommunityLike(row, () => logins++, () => assert.fail('failure alert'));
    assert.equal(logins, 1);
    assert.deepEqual(env.refresh.mergeCommunityLike(row, -1), row);
    env.setToken('expired');
    const updates = [];
    env.refresh.subscribeCommunityLikes((id, state) => updates.push(state));
    global.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
    await env.likes.changeCommunityLike(row, () => logins++, () => assert.fail('failure alert'));
    assert.equal(logins, 2);
    assert.deepEqual(updates.slice(0, 2), [{ liked: true, likeCount: 13 }, { liked: false, likeCount: 12 }]);
    assert.equal(await env.auth.getSavedAccessToken(), null);
  } finally { global.fetch = original; }
});

test('public reads attach saved token only when present, validate liked and handle expired token', async () => {
  const env = setup(); const requests = []; const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => url.includes('/feed?') ? { items: [row], nextCursor: null } : row };
    };
    const signal = new AbortController().signal;
    assert.equal((await env.api.getCommunityPost(1, signal)).liked, false);
    assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer saved-token');
    await env.api.getCommunityFeed('ALL', 'LATEST', null, signal);
    assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer saved-token');
    env.setToken(null); await env.api.getCommunityPost(1, signal);
    assert.equal(requests.at(-1).options.headers, undefined);
    env.setToken('expired');
    global.fetch = async (_, options) => options.headers ? { ok: false, status: 401 } : { ok: true, json: async () => row };
    assert.equal((await env.api.getCommunityPost(1, signal)).liked, false);
    global.fetch = async () => ({ ok: true, json: async () => ({ ...row, liked: 'wrong' }) });
    await assert.rejects(env.api.getCommunityPost(1, signal), /Invalid community detail/);
    global.fetch = async () => ({ ok: true, json: async () => ({ liked: true, likeCount: -1 }) });
    await assert.rejects(env.api.toggleCommunityPostLike(1, 'token'), /Invalid community like/);
  } finally { global.fetch = original; }
});

test('in-flight stale reads preserve mutations; later reads are authoritative and account changes discard responses', async () => {
  const env = setup(); const original = global.fetch;
  let resolve;
  try {
    const version = env.refresh.communityLikeVersion();
    env.refresh.publishCommunityLike(1, { liked: true, likeCount: 13 }, true);
    assert.equal(env.refresh.mergeCommunityLike(row, env.refresh.communityLikeVersion()).liked, true);
    env.refresh.publishCommunityLike(1, { liked: true, likeCount: 13 });
    assert.equal(env.refresh.mergeCommunityLike(row, version).liked, true);
    assert.equal(env.refresh.mergeCommunityLike(row, env.refresh.communityLikeVersion()).liked, false);
    global.fetch = () => new Promise(done => { resolve = done; });
    const updates = []; env.refresh.subscribeCommunityLikes((id, state) => updates.push(state));
    const pending = env.likes.changeCommunityLike(row, () => {}, () => {}); await flush();
    env.refresh.clearCommunityLikes();
    resolve({ ok: true, json: async () => ({ liked: true, likeCount: 13 }) }); await pending;
    assert.equal(updates.at(-1), null);
  } finally { global.fetch = original; }
});

test('fresh feed response replaces settled like state and retains all updated server fields', async () => {
  const env = setup(); const original = global.fetch;
  try {
    env.refresh.publishCommunityLike(1, { liked: true, likeCount: 13 });
    const fresh = { ...row, liked: false, likeCount: 20, viewCount: 99, commentCount: 8, content: 'updated' };
    global.fetch = async () => ({ ok: true, json: async () => ({ items: [fresh], nextCursor: 'fresh' }) });
    const page = await env.api.getCommunityFeed('FREE', 'POPULAR', null, new AbortController().signal);
    assert.deepEqual(page.items[0], fresh);
    assert.equal(page.nextCursor, 'fresh');
    assert.deepEqual(env.refresh.mergeCommunityLike(fresh, -1), fresh);
  } finally { global.fetch = original; }
});

function hookState() {
  const state = [], refs = [], effects = [], callbacks = [];
  let index = 0, ref = 0, effect = 0, callback = 0;
  let focusCallback;
  const react = {
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = ref++; return refs[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = effect++; const previous = effects[i];
      if (previous && deps.every((v, j) => v === previous.deps[j])) return;
      previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; },
    useCallback(fn, deps) { const i = callback++; const previous = callbacks[i];
      if (previous && deps.every((v, j) => v === previous.deps[j])) return previous.fn;
      callbacks[i] = { deps, fn }; return fn; },
  };
  return { react,
    useFocusEffect(fn) { if (focusCallback !== fn) { focusCallback = fn; fn(); } },
    focus() { focusCallback?.(); },
    render(Component, props) { index = ref = effect = callback = 0; return Component(props); },
    cleanup() { effects.forEach(item => item.cleanup?.()); },
  };
}
const jsx = (type, props, key) => ({ type, props, key });
function screenMocks(env, state, depth, routes) {
  const native = Object.fromEntries(['View', 'Text', 'Image', 'FlatList', 'Pressable', 'ScrollView', 'ActivityIndicator'].map(name => [name, name]));
  native.StyleSheet = { create: value => value }; native.Alert = { alert: (...args) => routes.push(args) };
  return { react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'expo-router': { useRouter: () => ({ push: route => routes.push(route), canGoBack: () => true, back() {} }),
      useLocalSearchParams: () => ({ id: '1' }), useFocusEffect: fn => state.useFocusEffect(fn),
      useNavigation: () => ({ getState: () => ({ index: 1, routes: [{ name: '(tabs)' }, { name: 'reviews/[id]' }] }) }) },
    'lucide-react-native': Object.fromEntries(['Heart', 'MessageCircle', 'ChevronLeft', 'MoreHorizontal', 'Pencil', 'Settings', 'ChevronRight', 'MapPin', 'Star', 'UserRound'].map(name => [name, name])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) },
    [`${depth}/lib/community`]: env.api, [`${depth}/lib/communityFeedRefresh`]: env.refresh,
    [`${depth}/lib/communityLikes`]: env.likes, [`${depth}/lib/auth`]: env.auth,
    [`${depth}/lib/reviews`]: env.reviews,
    [`${depth}/hooks/useCommunityNow`]: { useCommunityNow: () => ({ now: Date.now(), updateNow: noop }) },
    [`${depth}/lib/communityRefresh`]: { waitForCommunityRefresh: async () => {} },
    [`${depth}/lib/communityTime`]: load('src/lib/communityTime.ts', { '../locales': { t: key => key } }),
    [`${depth}/components/community/CommunityComments`]: { __esModule: true, default: 'CommunityComments' },
    [`${depth}/locales`]: { t: key => key }, [`${depth}/theme/communityColors`]: { communityColors: { charcoal: '#303A49' } },
    [`${depth}/theme/tokens`]: { spacing: {}, radius: {}, typography: {} },
  };
}
const noop = () => {};

const reviewRow = { ...row, type: 'REVIEW', category: 'REVIEW', rating: 4,
  popup: { publicId: 'popup-1', title: 'Popup' }, isOwner: false };

test('REVIEW mutation has typed locks, optimistic reconciliation/rollback and generation-safe authentication', async () => {
  const env = setup(), original = global.fetch, updates = []; let resolve, calls = 0, logins = 0, failures = 0;
  env.refresh.subscribeCommunityLikes((id, state, type) => updates.push({ id, state, type }));
  try {
    global.fetch = async (url, options) => { calls++; assert.equal(url, 'https://api.test/api/community/reviews/1/like');
      assert.equal(options.method, 'POST'); return new Promise(done => { resolve = done; }); };
    const pending = env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    const duplicate = env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    await flush(); assert.equal(calls, 1);
    assert.deepEqual(updates.at(-1), { id: 1, state: { liked: true, likeCount: 13 }, type: 'REVIEW' });
    assert.equal(env.refresh.beginCommunityLike(1), true, 'same numeric POST has an independent lock');
    env.refresh.endCommunityLike(1);
    assert.deepEqual(env.refresh.mergeCommunityLike(row, -1), row, 'REVIEW does not merge into POST');
    resolve({ ok: true, json: async () => ({ liked: true, likeCount: 15 }) }); await Promise.all([pending, duplicate]);
    assert.equal(env.refresh.mergeCommunityLike(reviewRow, -1).likeCount, 15);
    const failed = env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    await flush(); assert.deepEqual(updates.at(-1).state, { liked: false, likeCount: 14 });
    resolve({ ok: false, status: 500, text: async () => 'failed' }); await failed;
    assert.deepEqual(updates.at(-1).state, { liked: true, likeCount: 15 }); assert.equal(failures, 1);
    const expired = env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    await flush(); resolve({ ok: false, status: 401, text: async () => '' }); await expired;
    assert.equal(logins, 1); assert.equal((await env.auth.getAuthSession()).accessToken, null);
    const before = calls; await env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    assert.equal(calls, before); assert.equal(logins, 2, 'anonymous redirects without optimistic/network changes');
    env.newSession('old');
    const stale = env.likes.changeCommunityLike(reviewRow, () => logins++, () => failures++);
    await flush(); env.newSession('new');
    resolve({ ok: false, status: 401, text: async () => '' }); await stale;
    assert.equal((await env.auth.getAuthSession()).accessToken, 'new'); assert.equal(logins, 2);
    assert.equal(env.refresh.communityFeedRevision(), 0);
  } finally { global.fetch = original; }
});

test('real REVIEW feed/detail/PopupReviews handlers sync optimistic, reconciled and rollback states without list GET/revision', async () => {
  const env = setup(), original = global.fetch, routes = [], requests = [];
  const feedState = hookState(), detailState = hookState(), popupState = hookState(), postState = hookState();
  const feed = load('src/screens/CommunityScreen.tsx', { ...screenMocks(env, feedState, '..', routes),
    '../components/community/CommunityPostItem': { default: 'Card' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 } }).default;
  const detailMocks = state => ({ ...screenMocks(env, state, '../..', routes),
    '../../components/community/CommunityAuthor': { __esModule: true, default: 'Author' },
    '../../components/community/CommunityImageCarousel': { __esModule: true, default: 'Carousel' } });
  const detail = load('src/app/reviews/[id].tsx', detailMocks(detailState)).default;
  const post = load('src/app/community/[id].tsx', detailMocks(postState)).default;
  const popup = load('src/components/place/PopupReviews.tsx', { ...screenMocks(env, popupState, '../..', routes),
    '../community/CommunityPostItem': { __esModule: true, default: 'Card' } }).default;
  const popupProps = { publicId: 'popup-1', title: 'Popup' }; let resolve;
  const list = () => nodes(feedState.render(feed)).find(node => node.type === 'FlatList');
  const popupCard = () => nodes(popupState.render(popup, popupProps)).find(node => node.type === 'Card');
  const detailLike = () => nodes(detailState.render(detail)).find(node => node.props?.accessibilityLabel === '좋아요' || node.props?.accessibilityLabel === '좋아요 취소');
  const assertState = (liked, count) => {
    assert.equal(list().props.data[0].liked, liked); assert.equal(list().props.data[0].likeCount, count);
    assert.equal(popupCard().props.post.liked, liked); assert.equal(popupCard().props.post.likeCount, count);
    assert.equal(detailLike().props.accessibilityState.selected, liked);
    assert.ok(nodes(detailLike()).some(node => node.props?.children === count));
    assert.equal(list().props.data[1].liked, false); assert.equal(list().props.data[1].likeCount, 12);
    assert.equal(nodes(postState.render(post)).find(node => node.type === 'Heart').props.fill, 'none');
  };
  try {
    global.fetch = async (url, options) => {
      requests.push({ url, method: options.method });
      if (options.method === 'POST') return new Promise(done => { resolve = done; });
      if (url.includes('/feed?')) return { ok: true, json: async () => ({ items: [reviewRow, row], nextCursor: 'cursor' }) };
      if (url.includes('/popups/')) return { ok: true, json: async () => ({ items: [reviewRow], nextCursor: 'cursor' }) };
      return { ok: true, json: async () => url.includes('/reviews/') ? reviewRow : { ...row, isOwner: false, imageIds: [] } };
    };
    list(); popupCard(); detailState.render(detail); postState.render(post); await flush(); assertState(false, 12);
    list().props.renderItem({ item: list().props.data[0] }).props.onPressLike(); await flush(); assertState(true, 13);
    detailLike().props.onPress(); popupCard().props.onPressLike(); await flush();
    assert.equal(requests.filter(request => request.method === 'POST').length, 1, 'shared three-screen request lock');
    resolve({ ok: true, json: async () => ({ liked: true, likeCount: 15 }) }); await flush(); assertState(true, 15);
    detailLike().props.onPress(); await flush(); assertState(false, 14);
    resolve({ ok: false, status: 500, text: async () => '' }); await flush(); assertState(true, 15);
    popupCard().props.onPressLike(); await flush(); assertState(false, 14);
    resolve({ ok: true, json: async () => ({ liked: false, likeCount: 14 }) }); await flush(); assertState(false, 14);
    feedState.focus(); popupState.focus(); detailState.focus(); await flush(); assertState(false, 14);
    assert.equal(requests.filter(request => request.url.includes('/feed?')).length, 1);
    assert.equal(requests.filter(request => request.url.includes('/popups/')).length, 1);
    assert.equal(env.refresh.communityFeedRevision(), 0);
    env.setToken(null); detailLike().props.onPress(); await flush(); assert.equal(routes.at(-1), '/profile/login');
    popupCard().props.onPressLike(); await flush(); assert.equal(routes.at(-1), '/profile/login');
  } finally { [feedState, detailState, popupState, postState].forEach(state => state.cleanup()); global.fetch = original; }
});

test('REVIEW detail, popup list and feed stale GETs share version protection without touching same-id POST', async () => {
  const env = setup(), original = global.fetch, pending = new Map();
  const signal = new AbortController().signal;
  try {
    global.fetch = (url) => new Promise(resolve => pending.set(url, resolve));
    const detail = env.reviews.getReviewDetail(1, signal);
    const popup = env.reviews.getPopupReviews('popup-1', null, signal);
    const feed = env.api.getCommunityFeed('ALL', 'LATEST', null, signal); await flush();
    env.refresh.publishCommunityLike(1, { liked: true, likeCount: 13 }, true, 'REVIEW');
    env.refresh.publishCommunityLike(1, { liked: true, likeCount: 14 }, false, 'REVIEW');
    // A fresh read is authoritative but cannot consume protection needed by old GETs.
    assert.equal(env.refresh.mergeCommunityLike({ ...reviewRow, liked: true, likeCount: 14 }, env.refresh.communityLikeVersion()).likeCount, 14);
    for (const [url, resolve] of pending) resolve({ ok: true, json: async () => url.includes('/feed?')
      ? { items: [reviewRow, row], nextCursor: null } : url.includes('/popups/') ? { items: [reviewRow], nextCursor: null } : reviewRow });
    const [detailResult, popupResult, feedResult] = await Promise.all([detail, popup, feed]);
    for (const result of [detailResult, popupResult.items[0], feedResult.items[0]]) {
      assert.equal(result.liked, true); assert.equal(result.likeCount, 14);
    }
    assert.deepEqual(feedResult.items[1], row);
    global.fetch = async () => ({ ok: true, json: async () => ({ ...reviewRow, liked: false, likeCount: 20 }) });
    assert.equal((await env.reviews.getReviewDetail(1, signal)).likeCount, 20, 'later server response is authoritative');
  } finally { global.fetch = original; }
});

test('real feed/detail heart handlers synchronize both ways without feed refetch, revision or list remount', async () => {
  const env = setup(); const original = global.fetch; const routes = [];
  const feedState = hookState(), detailState = hookState();
  const feed = load('src/screens/CommunityScreen.tsx', { ...screenMocks(env, feedState, '..', routes),
    '../components/community/CommunityPostItem': { default: 'CommunityPostItem' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 } }).default;
  const detail = load('src/app/community/[id].tsx', { ...screenMocks(env, detailState, '../..', routes),
    '../../components/community/CommunityAuthor': { default: 'CommunityAuthor' },
    '../../components/community/CommunityImageCarousel': { default: 'CommunityImageCarousel' } }).default;
  let feedCalls = 0, resolve;
  try {
    global.fetch = async (url, options) => {
      if (options.method === 'POST') return new Promise(done => { resolve = done; });
      if (url.includes('/feed?')) { feedCalls++; return { ok: true, json: async () => ({ items: [row, { ...row, id: 2 }], nextCursor: 'cursor' }) }; }
      return { ok: true, json: async () => row };
    };
    const list = () => nodes(feedState.render(feed)).find(node => node.type === 'FlatList');
    list(); await flush(); detailState.render(detail); await flush();
    const before = list(); const unrelated = before.props.data[1]; const revision = env.refresh.communityFeedRevision();
    nodes(detailState.render(detail)).find(node => node.props?.accessibilityLabel === '좋아요').props.onPress(); await flush();
    assert.equal(list().props.data[0].liked, true); assert.equal(list().props.data[0].likeCount, 13);
    let heart = nodes(detailState.render(detail)).find(node => node.type === 'Heart'); assert.equal(heart.props.fill, '#303A49');
    resolve({ ok: true, json: async () => ({ liked: true, likeCount: 13 }) }); await flush();
    feedState.focus(); await flush();
    assert.equal(feedCalls, 1); assert.equal(list().key, undefined); assert.equal(list().props.data[1], unrelated);
    list().props.renderItem({ item: list().props.data[0] }).props.onPressLike(); await flush();
    heart = nodes(detailState.render(detail)).find(node => node.type === 'Heart'); assert.equal(heart.props.fill, 'none');
    assert.equal(list().props.data[0].likeCount, 12);
    resolve({ ok: false, status: 500, text: async () => 'failure' }); await flush();
    assert.equal(list().props.data[0].liked, true); assert.equal(list().props.data[0].likeCount, 13);
    assert.equal(nodes(detailState.render(detail)).find(node => node.type === 'Heart').props.fill, '#303A49');
    assert.equal(feedCalls, 1); assert.equal(env.refresh.communityFeedRevision(), revision);
    env.setToken(null); list().props.renderItem({ item: list().props.data[0] }).props.onPressLike(); await flush();
    assert.equal(routes.at(-1), '/profile/login');
  } finally { feedState.cleanup(); detailState.cleanup(); global.fetch = original; }
});

test('post and REVIEW card heart stop navigation and render filled/unfilled', () => {
  const env = setup(); const state = hookState(); const mocks = screenMocks(env, state, '../..', []);
  const Card = load('src/components/community/CommunityPostItem.tsx', mocks).default;
  let tapped = 0, stopped = 0, navigated = 0;
  for (const liked of [false, true]) {
    const tree = Card({ post: { ...row, liked }, onPressLike: () => tapped++, onPressPost: () => navigated++ });
    const button = nodes(tree).find(node => node.props?.accessibilityLabel === (liked ? '좋아요 취소' : '좋아요'));
    button.props.onPress({ stopPropagation() { stopped++; } });
    assert.equal(button.props.accessibilityState.selected, liked);
    assert.equal(nodes(tree).find(node => node.type === 'Heart').props.fill, liked ? '#303A49' : 'none');
  }
  assert.equal(tapped, 2); assert.equal(stopped, 2); assert.equal(navigated, 0);
  const review = Card({ post: { ...row, type: 'REVIEW', category: 'REVIEW' }, onPressReview: () => navigated++, onPressLike: () => tapped++ });
  nodes(review).find(node => node.props?.accessibilityLabel === '좋아요').props.onPress({ stopPropagation() { stopped++; } });
  assert.equal(tapped, 3); assert.equal(stopped, 3); assert.equal(navigated, 0);
});
