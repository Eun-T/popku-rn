const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  mocks = { '../../components/community/CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' }, ...mocks };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in mocks)) throw new Error(`Missing mock ${name} in ${file}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const { nodes, flattenStyle } = require('./helpers/uiTree.cjs');
const jsx = (type, props, key) => ({ type, props, key });
const now = Date.parse('2026-10-04T10:03:00+09:00');
const root = { id: 1, content: 'root body', createdAt: '2026-10-04T10:00:00+09:00', updatedAt: '2026-10-04T10:00:00+09:00',
  author: { id: 1, nickname: 'A', avatarUrl: 'signed:avatar' }, parentCommentId: null, replyToUser: null, isOwner: true };
const reply = { ...root, id: 2, content: 'reply body', author: { id: 2, nickname: 'B', avatarUrl: null }, parentCommentId: 1, replyToUser: { id: 1, nickname: 'A' }, isOwner: false };
const third = { ...reply, id: 3, content: 'third body', author: { id: 3, nickname: 'C', avatarUrl: null }, replyToUser: { id: 2, nickname: 'B' } };
const post = { type: 'POST', id: 1, category: 'QUESTION', author: root.author, createdAt: root.createdAt, updatedAt: root.updatedAt,
  content: 'post body', regionName: null, popup: null, rating: null, images: [], liked: false, likeCount: 12, commentCount: 3, viewCount: 9 };
const noop = () => {};

function hooks() {
  const state = [], refs = [], callbacks = [], effects = [];
  let i = 0, r = 0, c = 0, e = 0, focus;
  return {
    react: {
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState(initial) { const index = i++; if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
      useRef(initial) { return refs[r++] ??= { current: initial }; },
      useCallback(fn, deps) { const index = c++, previous = callbacks[index];
        if (previous && deps.every((value, index) => value === previous.deps[index])) return previous.fn;
        callbacks[index] = { fn, deps }; return fn; },
      useEffect(fn, deps) { const index = e++, previous = effects[index];
        if (previous && deps.every((value, index) => value === previous.deps[index])) return;
        previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; },
    },
    render(Component, props) { i = r = c = e = 0; return Component(props); },
    useFocusEffect(fn) { if (focus !== fn) { focus = fn; fn(); } }, focus() { focus?.(); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
function setup(authOverride, targetType = 'POST') {
  const refresh = load('src/lib/communityFeedRefresh.ts'); const authListeners = new Set();
  let token = 'token';
  let generation = 0;
  const auth = authOverride ?? { getSavedAccessToken: async () => token,
    getAuthUser: () => token ? { email: 'me' } : null, subscribeAuthUser: () => () => {},
    getAuthSession: async () => ({ accessToken: token, generation }),
    clearTokens: async expected => { if (expected !== undefined && expected !== generation) return false;
      token = null; generation++; refresh.clearCommunityLikes(); authListeners.forEach(fn => fn()); return true; },
    subscribeAuthSession(fn) { authListeners.add(fn); return () => authListeners.delete(fn); } };
  const diagnostics = load('src/lib/communityDiagnostics.ts');
  const api = load('src/lib/community.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' }, './auth': auth,
    './communityFeedRefresh': refresh, './communityDiagnostics': diagnostics });
  const comments = load('src/lib/communityComments.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' }, './community': api, './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh });
  const reviews = load('src/lib/reviews.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' }, './auth': auth,
    './community': api, './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh, './communityImages': {} });
  const time = load('src/lib/communityTime.ts', { '../locales': { t: (key, params) => `${params.count}분 전` } });
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'FlatList'].map(name => [name, name]));
  native.Platform = { OS: 'ios' }; native.StyleSheet = { create: value => value };
  const routes = [], alerts = [];
  native.Alert = { alert: (...args) => alerts.push(args) };
  const mocks = (state, depth) => ({ react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'expo-router': { useRouter: () => ({ push: route => routes.push(route), canGoBack: () => true, back() {} }),
      useLocalSearchParams: () => ({ id: '1' }), useFocusEffect: fn => state.useFocusEffect(fn), useScrollToTop() {},
      useNavigation: () => ({ getState: () => ({ index: 1, routes: [{ name: '(tabs)' }, { name: 'reviews/[id]' }] }) }) },
    'lucide-react-native': Object.fromEntries(['X', 'ChevronLeft', 'ChevronRight', 'MapPin', 'Star', 'Heart', 'MessageCircle', 'MoreHorizontal', 'Pencil', 'Settings'].map(name => [name, name])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    [`${depth}/lib/auth`]: auth, [`${depth}/lib/community`]: api, [`${depth}/lib/communityComments`]: comments,
    [`${depth}/lib/communityFeedRefresh`]: refresh, [`${depth}/lib/communityTime`]: time,
    [`${depth}/lib/reviews`]: reviews,
    [`${depth}/lib/communityLikes`]: { changeCommunityLike: async () => {} },
    [`${depth}/hooks/useCommunityNow`]: { useCommunityNow: () => ({ now, updateNow: noop }) },
    [`${depth}/lib/communityRefresh`]: { waitForCommunityRefresh: async () => {} },
    [`${depth}/locales`]: require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'), [`${depth}/theme/communityColors`]: { communityColors: {} },
    [`${depth}/theme/tokens`]: { spacing: { space24: 24 }, radius: {}, typography: { body: { fontWeight: '400' } } },
    [`${depth}/components/community/CommunityAuthor`]: { __esModule: true, default: 'CommunityAuthor' },
    [`${depth}/components/community/CommunityImageCarousel`]: { __esModule: true, default: 'CommunityImageCarousel' },
    [`${depth}/components/community/CommunityComments`]: { __esModule: true, default: 'CommunityComments' },
  });
  const state = hooks();
  const Comments = load('src/components/community/CommunityComments.tsx', { ...mocks(state, '../..'), './CommunityAuthor': { __esModule: true, default: 'CommunityAuthor' }, './CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' } }).default;
  const props = { ...(targetType === 'REVIEW' ? { targetType, targetId: 1 } : { postId: 1 }), commentCount: 3, now,
    padding: { paddingLeft: 16, paddingRight: 16 }, onLogin: () => routes.push('/profile/login'), children: null };
  return { refresh, comments, reviews, api, auth, routes, alerts, mocks, state, Comments, props, render: () => state.render(Comments, props),
    setToken(value) { token = value; authListeners.forEach(fn => fn()); },
    newSession(value) { token = value; generation++; refresh.clearCommunityLikes(); authListeners.forEach(fn => fn()); } };
}
function network(items = [root, reply, third], nextCursor = null) {
  const calls = []; let response = { ok: true, json: async () => ({ item: { ...root, id: 4, content: 'new' }, commentCount: 4 }) };
  let deletion = { ok: true, json: async () => ({ commentCount: 0 }) };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return typeof response === 'function' ? response(url, options) : response;
    if (options.method === 'DELETE') return typeof deletion === 'function' ? deletion(url, options) : deletion;
    return { ok: true, json: async () => url.includes('/comments') ? { items, commentCount: items.length }
      : url.includes('/feed?') ? { items: [post, { ...post, id: 2 }], nextCursor } : post };
  };
  return { calls, respond(value) { response = value; }, respondDelete(value) { deletion = value; },
    deletes: () => calls.filter(call => call.options.method === 'DELETE'), writes: () => calls.filter(call => call.options.method === 'POST') };
}
const button = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);
const commentIds = tree => nodes(tree).filter(node => typeof node.key === 'number').map(node => node.key);

const reviewPost = { ...post, type: 'REVIEW', category: 'REVIEW', rating: 4, isOwner: false, popup: null };

test('REVIEW API is public and uses review namespace with separate content/root/target fields', async () => {
  const original = global.fetch, env = setup(undefined, 'REVIEW'), net = network();
  try {
    env.setToken(null);
    await env.comments.getCommunityComments(1, new AbortController().signal, 'REVIEW');
    assert.equal(net.calls[0].url, 'https://api.test/api/community/reviews/1/comments');
    assert.equal(net.calls[0].options.headers, undefined);
    await env.comments.createCommunityComment(1, 'body only', { parentCommentId: 1, replyToUserId: 2, nickname: 'B' }, 'token', 'REVIEW', 7);
    assert.equal(net.writes()[0].url, 'https://api.test/api/community/reviews/1/comments');
    assert.deepEqual(JSON.parse(net.writes()[0].options.body), { content: 'body only', parentCommentId: 1, replyToUserId: 2 });
    net.respond({ ok: false, status: 401, text: async () => '' });
    await assert.rejects(env.comments.createCommunityComment(1, 'body', null, 'token', 'REVIEW', 7), error => error.status === 401 && error.authGeneration === 7);
  } finally { env.state.cleanup(); global.fetch = original; }
});

test('standalone REVIEW comment compatibility syncs counts (REVIEW UI unsupported) without GET/revision or same-id POST changes', async () => {
  const original = global.fetch, env = setup(undefined, 'REVIEW');
  const states = [hooks(), hooks(), hooks(), hooks()];
  const [feedState, detailState, popupState, postState] = states;
  const calls = []; let result = { item: { ...root, id: 4, content: 'new' }, commentCount: 4 };
  const Feed = load('src/screens/CommunityScreen.tsx', { ...env.mocks(feedState, '..'),
    '../components/community/CommunityPostItem': { default: 'Card' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 } }).default;
  const Detail = load('src/app/reviews/[id].tsx', env.mocks(detailState, '../..')).default;
  const PostDetail = load('src/app/community/[id].tsx', env.mocks(postState, '../..')).default;
  const Popup = load('src/components/place/PopupReviews.tsx', { ...env.mocks(popupState, '../..'),
    '../../locales': require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'),
    '../community/CommunityPostItem': { __esModule: true, default: 'Card' } }).default;
  const list = () => nodes(feedState.render(Feed)).find(node => node.type === 'FlatList');
  const detailProps = () => {
    const comments = nodes(detailState.render(Detail)).find(node => node.type === 'CommunityComments');
    assert.equal(comments, undefined, 'REVIEW comments are intentionally unsupported in the app UI');
    return { ...env.props, commentCount: list().props.data.find(item => item.type === 'REVIEW').commentCount };
  };
  const popupCard = () => nodes(popupState.render(Popup, { publicId: 'popup-1', title: 'Popup' })).find(node => node.type === 'Card');
  const renderComments = () => env.state.render(env.Comments, detailProps());
  try {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'POST') return { ok: true, json: async () => result };
      if (options.method === 'DELETE') return { ok: true, json: async () => ({ commentCount: 1 }) };
      return { ok: true, json: async () => url.includes('/comments') ? { items: [root, reply, third], commentCount: 3 }
        : url.includes('/feed?') ? { items: [reviewPost, post], nextCursor: 'cursor' }
          : url.includes('/popups/') ? { items: [reviewPost, { ...reviewPost, id: 2 }], nextCursor: 'cursor' }
            : url.includes('/reviews/') ? reviewPost : post };
    };
    list(); detailState.render(Detail); popupCard(); postState.render(PostDetail); await flush();
    assert.equal(detailProps().targetType, 'REVIEW'); assert.equal(detailProps().targetId, 1);
    assert.equal(calls.some(call => call.url.includes('/comments')), false, 'REVIEW detail must not request unsupported comments');
    // Exercise the retained API/component independently of the unsupported detail UI.
    renderComments(); await flush();
    assert.ok(button(renderComments(), '1번 댓글 메뉴'), 'REVIEW owner shares delete menu');
    const reads = calls.filter(call => call.options.method !== 'POST').length;
    button(renderComments(), '댓글 입력').props.onChangeText('new'); button(renderComments(), '댓글 등록').props.onPress(); await flush();
    assert.equal(detailProps().commentCount, 4); assert.equal(list().props.data[0].commentCount, 4);
    assert.equal(popupCard().props.post.commentCount, 4);
    assert.equal(list().props.data[1].commentCount, 3);
    assert.equal(nodes(postState.render(PostDetail)).find(node => node.type === 'CommunityComments').props.commentCount, 3);
    assert.equal(list().props.data[0].likeCount, 12);
    env.reviews.reviewUpdated({ ...reviewPost, content: 'edited review', rating: 5, updatedAt: 'later', images: [] });
    assert.equal(list().props.data[0].content, 'edited review');
    assert.equal(list().props.data[0].rating, 5);
    assert.equal(popupCard().props.post.content, 'edited review');
    assert.equal(popupCard().props.post.rating, 5);
    assert.ok(nodes(detailState.render(Detail)).some(node => node.props?.children === 'edited review'));
    assert.equal(list().props.data[1].content, 'post body');
    assert.equal(detailProps().commentCount, 4);
    assert.equal(button(renderComments(), '댓글 입력').props.value, '');
    assert.ok(commentIds(renderComments()).includes(4));
    result = { item: { ...third, id: 5, content: 'nested', replyToUser: { id: 3, nickname: 'C' } }, commentCount: 5 };
    button(renderComments(), 'C에게 답글').props.onPress(); await flush();
    button(renderComments(), '댓글 입력').props.onChangeText('nested'); button(renderComments(), '댓글 등록').props.onPress(); await flush();
    assert.equal(detailProps().commentCount, 5); assert.equal(popupCard().props.post.commentCount, 5);
    assert.equal(list().props.data[0].commentCount, 5);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { content: 'nested', parentCommentId: 1, replyToUserId: 3 });
    feedState.focus(); detailState.focus(); popupState.focus(); await flush();
    assert.equal(calls.filter(call => call.options.method !== 'POST').length, reads);
    assert.equal(env.refresh.communityFeedRevision(), 0);
    const beforeDeleteReads = calls.filter(call => call.options.method === 'GET').length;
    button(renderComments(), '1번 댓글 메뉴').props.onPress();
    nodes(renderComments()).find(node => node.type === 'CommunityPostMenu').props.onSelect(2);
    env.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress(); await flush();
    assert.deepEqual(commentIds(renderComments()), [4]);
    assert.equal(detailProps().commentCount, 1);
    assert.equal(list().props.data[0].commentCount, 1);
    assert.equal(popupCard().props.post.commentCount, 1);
    assert.equal(list().props.data[1].commentCount, 3);
    assert.equal(calls.filter(call => call.options.method === 'GET').length, beforeDeleteReads);
    assert.equal(env.refresh.communityFeedRevision(), 0);
    assert.equal(list().key, undefined);
    list().props.onEndReached(); await flush();
    assert.equal(new URL(calls.at(-1).url).searchParams.get('cursor'), 'cursor');
    const beforeRemovalReads = calls.length;
    env.refresh.publishCommunityPostChange(1, null, 'REVIEW');
    assert.deepEqual(list().props.data.map(item => item.type), ['POST']);
    assert.deepEqual(nodes(popupState.render(Popup, { publicId: 'popup-1', title: 'Popup' })).filter(node => node.type === 'Card').map(node => node.props.post.id), [2]);
    assert.equal(nodes(detailState.render(Detail)).some(node => node.type === 'CommunityComments'), false);
    feedState.focus(); popupState.focus(); detailState.focus(); await flush();
    assert.equal(calls.length, beforeRemovalReads);
    assert.equal(env.refresh.communityFeedRevision(), 0);
    list().props.onEndReached(); await flush();
    assert.equal(new URL(calls.at(-1).url).searchParams.get('cursor'), 'cursor');
    assert.deepEqual(list().props.data.map(item => item.type), ['POST']);
    nodes(popupState.render(Popup, { publicId: 'popup-1', title: 'Popup' })).find(node => node.type === 'Pressable' && node.props.children?.props?.children === '리뷰 더 보기').props.onPress();
    await flush();
    assert.equal(new URL(calls.at(-1).url).searchParams.get('cursor'), 'cursor');
    assert.deepEqual(nodes(popupState.render(Popup, { publicId: 'popup-1', title: 'Popup' })).filter(node => node.type === 'Card').map(node => node.props.post.id), [2]);
  } finally { env.state.cleanup(); states.forEach(state => state.cleanup()); global.fetch = original; }
});

test('REVIEW stale comment/list/detail/feed GETs cannot overwrite newer typed commentCount', async () => {
  const original = global.fetch, env = setup(), pending = new Map(), signal = new AbortController().signal;
  try {
    global.fetch = url => new Promise(resolve => pending.set(url, resolve));
    const comments = env.comments.getCommunityComments(1, signal, 'REVIEW');
    const detail = env.reviews.getReviewDetail(1, signal);
    const popup = env.reviews.getPopupReviews('popup-1', null, signal);
    const feed = env.api.getCommunityFeed('ALL', 'LATEST', null, signal); await flush();
    env.refresh.publishCommunityCommentCount(1, 4, 'REVIEW');
    assert.equal(env.refresh.mergeCommunityCommentCount({ ...reviewPost, commentCount: 5 }, env.refresh.communityLikeVersion()).commentCount, 5);
    for (const [url, resolve] of pending) resolve({ ok: true, json: async () => url.includes('/comments')
      ? { items: [root, reply, third], commentCount: 3 } : url.includes('/feed?') ? { items: [reviewPost, post], nextCursor: null }
        : url.includes('/popups/') ? { items: [reviewPost], nextCursor: null } : reviewPost });
    const results = await Promise.all([comments, detail, popup, feed]);
    assert.equal(results[0].commentCount, 5); assert.equal(results[1].commentCount, 5);
    assert.equal(results[2].items[0].commentCount, 5); assert.equal(results[3].items[0].commentCount, 5);
    assert.equal(results[3].items[1].commentCount, 3);
    global.fetch = async () => ({ ok: true, json: async () => ({ items: [root], commentCount: 1 }) });
    assert.equal((await env.comments.getCommunityComments(1, signal, 'REVIEW')).commentCount, 1, 'later GET is authoritative');
  } finally { global.fetch = original; }
});

test('REVIEW late old-session 401 cannot delete new credentials or redirect; login restores composer', async () => {
  const original = global.fetch, env = setup(undefined, 'REVIEW'), net = network(); let resolve;
  try {
    env.render(); await flush(); button(env.render(), '댓글 입력').props.onChangeText('draft');
    net.respond(() => new Promise(done => { resolve = done; })); button(env.render(), '댓글 등록').props.onPress(); await flush();
    env.newSession('new'); env.render(); await flush();
    resolve({ ok: false, status: 401, text: async () => '' }); await flush();
    assert.equal(await env.auth.getSavedAccessToken(), 'new'); assert.deepEqual(env.routes, []);
    assert.equal(button(env.render(), '댓글 입력').props.value, 'draft');
    assert.equal(button(env.render(), '댓글 등록').props.disabled, false);
  } finally { env.state.cleanup(); global.fetch = original; }
});
function confirmDelete(env, id) {
  button(env.render(), `${id}번 댓글 메뉴`).props.onPress();
  const menu = nodes(env.render()).find(node => node.type === 'CommunityPostMenu');
  assert.equal(menu.props.showEdit, false);
  menu.props.onSelect(2);
  return env.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress;
}

for (const targetType of ['POST', 'REVIEW']) test(`${targetType}: owner-only menu; cancellation changes nothing; root delete removes thread and clears its reply target`, async () => {
  const original = global.fetch, env = setup(undefined, targetType), net = network();
  try {
    env.render(); await flush();
    assert.ok(button(env.render(), '1번 댓글 메뉴')); assert.equal(button(env.render(), '2번 댓글 메뉴'), undefined);
    confirmDelete(env, 1); env.alerts.at(-1)[2].find(action => action.style === 'cancel').onPress();
    assert.deepEqual(commentIds(env.render()), [1, 2, 3]); assert.equal(net.deletes().length, 0);
    button(env.render(), 'B에게 답글').props.onPress(); await flush();
    button(env.render(), '댓글 입력').props.onChangeText('keep draft');
    const reads = net.calls.length, revision = env.refresh.communityFeedRevision();
    confirmDelete(env, 1)(); await flush();
    assert.deepEqual(commentIds(env.render()), []); assert.equal(button(env.render(), '답글 취소'), undefined);
    assert.equal(button(env.render(), '댓글 입력').props.value, 'keep draft');
    assert.equal(net.calls.length, reads + 1); assert.equal(net.deletes()[0].options.headers.Authorization, 'Bearer token');
    assert.equal(net.deletes()[0].options.body, undefined); assert.ok(net.deletes()[0].url.endsWith(`${targetType === 'REVIEW' ? 'reviews' : 'posts'}/1/comments/1`));
    assert.equal(env.refresh.mergeCommunityCommentCount({ ...post, type: targetType }, 0).commentCount, 0);
    assert.equal(env.refresh.communityFeedRevision(), revision);
  } finally { env.state.cleanup(); global.fetch = original; }
});

for (const targetType of ['POST', 'REVIEW']) test(`${targetType}: reply delete removes only itself, preserves surviving mention, and synchronous lock blocks repeated confirmation`, async () => {
  const original = global.fetch, env = setup(undefined, targetType);
  const fourth = { ...reply, id: 4, content: 'D', replyToUser: { id: 3, nickname: 'C' } };
  const net = network([root, reply, { ...third, isOwner: true }, fourth]); let resolve;
  try {
    env.render(); await flush(); button(env.render(), 'C에게 답글').props.onPress(); await flush();
    net.respondDelete(() => new Promise(done => { resolve = done; }));
    const remove = confirmDelete(env, 3); remove(); remove(); await flush();
    assert.equal(net.deletes().length, 1); assert.deepEqual(commentIds(env.render()), [1, 2, 3, 4]);
    assert.equal(button(env.render(), '댓글 입력').props.editable, false);
    resolve({ ok: true, json: async () => ({ commentCount: 3 }) }); await flush();
    assert.deepEqual(commentIds(env.render()), [1, 2, 4]); assert.equal(button(env.render(), '답글 취소'), undefined);
    assert.ok(nodes(env.render()).some(node => flattenStyle(node.props?.style).fontWeight === '700' && Array.isArray(node.props.children) && node.props.children.join('') === '@C '));
    assert.equal(env.refresh.mergeCommunityCommentCount({ ...post, type: targetType }, 0).commentCount, 3);
    assert.equal(button(env.render(), '댓글 입력').props.editable, true);
    net.respondDelete({ ok: true, json: async () => ({ commentCount: 0 }) }); confirmDelete(env, 1)(); await flush();
    assert.equal(net.deletes().length, 2);
  } finally { env.state.cleanup(); global.fetch = original; }
});

for (const targetType of ['POST', 'REVIEW']) test(`${targetType}: failed delete preserves items/count/draft/target and allows retry; 401 clears token and navigates`, async () => {
  const original = global.fetch, env = setup(undefined, targetType), net = network();
  try {
    env.render(); await flush(); button(env.render(), 'A에게 답글').props.onPress(); await flush();
    button(env.render(), '댓글 입력').props.onChangeText('draft');
    for (const status of [403, 404, 500]) {
      net.respondDelete({ ok: false, status, text: async () => 'error' }); confirmDelete(env, 1)(); await flush();
      assert.deepEqual(commentIds(env.render()), [1, 2, 3]); assert.ok(button(env.render(), '답글 취소'));
      assert.equal(button(env.render(), '댓글 입력').props.value, 'draft');
      assert.equal(env.refresh.mergeCommunityCommentCount({ ...post, type: targetType }, 0).commentCount, 3);
    }
    net.respondDelete({ ok: false, status: 401, text: async () => 'expired' }); confirmDelete(env, 1)(); await flush();
    assert.equal(await env.auth.getSavedAccessToken(), null); assert.equal(env.routes.at(-1), '/profile/login');
    assert.equal(button(env.render(), '1번 댓글 메뉴'), undefined);
  } finally { env.state.cleanup(); global.fetch = original; }
});

test('delete response validates actual count and rejects invalid counts', async () => {
  const original = global.fetch, env = setup(), net = network();
  try {
    for (const commentCount of [-1, 1.5, '2', null]) {
      net.respondDelete({ ok: true, json: async () => ({ commentCount }) });
      await assert.rejects(env.comments.deleteCommunityComment(1, 1, 'token'), /Invalid community comment deletion/);
    }
  } finally { global.fetch = original; }
});

test('shared compact menu hides edit for comments and waits for iOS dismissal before confirmation callback', () => {
  const state = hooks(), selected = [];
  const animation = () => ({ start: callback => callback?.({ finished: true }) });
  const Menu = load('src/components/community/CommunityPostMenu.tsx', {
    react: { ...state.react, useMemo: fn => fn() }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react-native': { Pencil: 'Pencil', Trash2: 'Trash2' },
    'react-native': { Animated: { Value: class { stopAnimation() {} }, View: 'AnimatedView', timing: animation, parallel: animation },
      Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' },
      PanResponder: { create: () => ({ panHandlers: {} }) }, StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} },
    '../../theme/tokens': { spacing: {}, radius: {} },
  }).default;
  const tree = state.render(Menu, { showEdit: false, onSelect: value => selected.push(value) });
  assert.equal(nodes(tree).some(node => node.type === 'Pencil'), false);
  const actions = nodes(tree).filter(node => node.type === 'Pressable'); assert.equal(actions.length, 2);
  assert.ok(nodes(actions[1]).some(node => node.type === 'Trash2'));
  actions[1].props.onPress(); actions[1].props.onPress(); assert.deepEqual(selected, []);
  tree.props.onDismiss(); tree.props.onDismiss(); assert.deepEqual(selected, [2]);
  state.cleanup();
});

test('public API keeps nickname separate and sends only root/target IDs, token and content', async () => {
  const original = global.fetch; const env = setup(); const net = network();
  try {
    const page = await env.comments.getCommunityComments(1, new AbortController().signal);
    assert.equal(page.items[1].content, 'reply body'); assert.equal(page.items[1].replyToUser.nickname, 'A');
    assert.equal(net.calls[0].options.headers.Authorization, 'Bearer token');
    env.setToken(null); await env.comments.getCommunityComments(1, new AbortController().signal);
    assert.equal(net.calls.at(-1).options.headers, undefined);
    await env.comments.createCommunityComment(1, 'hello', null, 'saved');
    assert.deepEqual(JSON.parse(net.writes().at(-1).options.body), { content: 'hello' });
    await env.comments.createCommunityComment(1, 'answer', { parentCommentId: 1, replyToUserId: 2, nickname: 'B' }, 'saved');
    assert.deepEqual(JSON.parse(net.writes().at(-1).options.body), { content: 'answer', parentCommentId: 1, replyToUserId: 2 });
    assert.equal(net.writes().at(-1).options.headers.Authorization, 'Bearer saved');
    net.respond({ ok: false, status: 400, text: async () => 'invalid' });
    await assert.rejects(env.comments.createCommunityComment(1, 'x', null, 'saved'), error => error.status === 400);
    net.respond({ ok: true, json: async () => ({ item: {}, commentCount: 1 }) });
    await assert.rejects(env.comments.createCommunityComment(1, 'x', null, 'saved'), /Invalid community comment/);
  } finally { global.fetch = original; }
});

for (const targetType of ['POST', 'REVIEW']) {
test(`${targetType}: list uses flat one-level indentation, separate bold mentions, unchanged body weight and shared now`, async () => {
  const original = global.fetch; const env = setup(undefined, targetType); network();
  try {
    env.render(); await flush(); const tree = env.render();
    const rows = nodes(tree).filter(node => node.key != null && [1, 2, 3].includes(node.key));
    assert.equal(rows.length, 3); assert.equal(rows[0].props.style[1], false);
    assert.equal(rows[1].props.style[1].marginLeft, 24); assert.equal(rows[2].props.style[1].marginLeft, 24);
    const mention = nodes(rows[2]).find(node => node.type === 'Text' && flattenStyle(node.props.style).fontWeight === '700');
    assert.deepEqual(mention.props.children, ['@', 'B', ' ']);
    const body = nodes(rows[2]).find(node => node.type === 'Text' && flattenStyle(node.props.style).fontWeight === '400' && Array.isArray(node.props.children));
    assert.equal(body.props.children[1], 'third body');
    const authors = nodes(tree).filter(node => node.type === 'CommunityAuthor');
    assert.equal(authors.length, 3); assert.ok(authors.every(node => node.props.now === now && node.props.showTime === false));
    assert.equal(nodes(tree).filter(node => node.props?.children === '3분 전').length, 3);
    assert.equal(tree.type, 'KeyboardAvoidingView'); assert.equal(tree.props.behavior, 'padding');
    assert.equal(nodes(tree).find(node => node.type === 'ScrollView').props.keyboardShouldPersistTaps, 'handled');
  } finally { env.state.cleanup(); global.fetch = original; }
});
}

for (const targetType of ['POST', 'REVIEW']) {
test(`${targetType}: reply selection and cancellation; replying to a reply submits its root and actual author`, async () => {
  const original = global.fetch; const env = setup(undefined, targetType); const net = network();
  try {
    env.render(); await flush(); button(env.render(), 'B에게 답글').props.onPress(); await flush();
    assert.ok(nodes(env.render()).some(node => node.props?.children === '@B에게 답글'));
    button(env.render(), '답글 취소').props.onPress(); assert.equal(button(env.render(), '답글 취소'), undefined);
    button(env.render(), 'C에게 답글').props.onPress(); await flush();
    net.respond({ ok: true, json: async () => ({ item: { ...third, id: 4, content: 'answer', replyToUser: { id: 3, nickname: 'C' } }, commentCount: 4 }) });
    button(env.render(), '댓글 입력').props.onChangeText('answer'); button(env.render(), '댓글 등록').props.onPress(); await flush();
    assert.deepEqual(JSON.parse(net.writes()[0].options.body), { content: 'answer', parentCommentId: 1, replyToUserId: 3 });
    assert.equal(button(env.render(), '댓글 입력').props.value, ''); assert.equal(button(env.render(), '답글 취소'), undefined);
    assert.equal(nodes(env.render()).filter(node => node.key != null && [1, 2, 3, 4].includes(node.key)).length, 4);
  } finally { env.state.cleanup(); global.fetch = original; }
});
}

for (const targetType of ['POST', 'REVIEW']) {
test(`${targetType}: top-level creation, failed submission preserves text/target, and rapid duplicate submissions are blocked`, async () => {
  const original = global.fetch; const env = setup(undefined, targetType); const net = network(); let resolve;
  try {
    env.render(); await flush(); button(env.render(), '댓글 입력').props.onChangeText('new');
    net.respond(() => new Promise(done => { resolve = done; }));
    const send = button(env.render(), '댓글 등록').props.onPress; send(); send(); await flush();
    assert.equal(net.writes().length, 1); assert.deepEqual(JSON.parse(net.writes()[0].options.body), { content: 'new' });
    assert.equal(button(env.render(), '댓글 등록').props.disabled, true);
    resolve({ ok: true, json: async () => ({ item: { ...root, id: 4, content: 'new' }, commentCount: 4 }) }); await flush();
    assert.equal(button(env.render(), '댓글 입력').props.value, '');
    button(env.render(), 'B에게 답글').props.onPress(); await flush(); button(env.render(), '댓글 입력').props.onChangeText('retry me');
    net.respond({ ok: false, status: 500, text: async () => 'failure' }); button(env.render(), '댓글 등록').props.onPress(); await flush();
    assert.equal(button(env.render(), '댓글 입력').props.value, 'retry me'); assert.ok(button(env.render(), '답글 취소'));
    assert.ok(nodes(env.render()).some(node => node.props?.accessibilityRole === 'alert'));
    assert.equal(button(env.render(), '댓글 등록').props.disabled, false);
    const count = net.writes().length;
    button(env.render(), '댓글 입력').props.onChangeText('   '); button(env.render(), '댓글 등록').props.onPress(); await flush();
    assert.equal(net.writes().length, count);
    button(env.render(), '댓글 입력').props.onChangeText('x'.repeat(10001)); button(env.render(), '댓글 등록').props.onPress(); await flush();
    assert.equal(net.writes().length, count);
  } finally { env.state.cleanup(); global.fetch = original; }
});
}

for (const targetType of ['POST', 'REVIEW']) {
test(`${targetType}: anonymous input/reply routes to existing login and sends no writes; 401 clears token and routes to login`, async () => {
  const original = global.fetch; const env = setup(undefined, targetType); const net = network();
  try {
    env.setToken(null); env.render(); await flush(); button(env.render(), '댓글 입력').props.onPress();
    button(env.render(), 'B에게 답글').props.onPress(); await flush();
    assert.deepEqual(env.routes, ['/profile/login', '/profile/login']); assert.equal(net.writes().length, 0);
    env.setToken('expired'); env.render(); await flush(); button(env.render(), '댓글 입력').props.onChangeText('hi');
    net.respond({ ok: false, status: 401, text: async () => 'unauthorized' }); button(env.render(), '댓글 등록').props.onPress(); await flush();
    assert.equal(env.routes.at(-1), '/profile/login'); assert.equal(await env.auth.getSavedAccessToken(), null);
  } finally { env.state.cleanup(); global.fetch = original; }
});
}

test('creation/deletion update mounted detail and matching feed item without refetch/revision; pagination cursor survives', async () => {
  const original = global.fetch; const env = setup(); const net = network([root, reply, third], 'page2'); const feedState = hooks(), detailState = hooks();
  const Feed = load('src/screens/CommunityScreen.tsx', { ...env.mocks(feedState, '..'),
    '../components/community/CommunityPostItem': { default: 'CommunityPostItem' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 } }).default;
  const Detail = load('src/app/community/[id].tsx', env.mocks(detailState, '../..')).default;
  const list = () => nodes(feedState.render(Feed)).find(node => node.type === 'FlatList');
  const commentsProps = () => {
    const tree = detailState.render(Detail);
    const component = nodes(tree).find(node => node.type === 'CommunityComments');
    assert.ok(component);
    return component.props;
  };
  try {
    assert.deepEqual(await env.api.getCommunityPost(1, new AbortController().signal), post);
    list(); detailState.render(Detail); await flush(); const other = list().props.data[1];
    const revision = env.refresh.communityFeedRevision();
    env.state.render(env.Comments, commentsProps()); await flush();
    let tree = env.state.render(env.Comments, commentsProps()); button(tree, '댓글 입력').props.onChangeText('new');
    tree = env.state.render(env.Comments, commentsProps()); button(tree, '댓글 등록').props.onPress(); await flush();
    assert.equal(commentsProps().commentCount, 4); assert.equal(list().props.data[0].commentCount, 4);
    assert.equal(list().props.data[1], other); assert.equal(list().props.data[0].likeCount, 12);
    const calls = net.calls.filter(call => call.url.includes('/feed?')).length;
    feedState.focus(); await flush(); assert.equal(net.calls.filter(call => call.url.includes('/feed?')).length, calls);
    assert.equal(env.refresh.communityFeedRevision(), revision); assert.equal(list().key, undefined);
    // Delete uses the same mounted detail/feed state and must not trigger any GET.
    tree = env.state.render(env.Comments, commentsProps());
    button(tree, '1번 댓글 메뉴').props.onPress();
    tree = env.state.render(env.Comments, commentsProps());
    nodes(tree).find(node => node.type === 'CommunityPostMenu').props.onSelect(2);
    const readCount = net.calls.filter(call => !call.options.method || call.options.method === 'GET').length;
    net.respondDelete({ ok: true, json: async () => ({ commentCount: 1 }) });
    env.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress(); await flush();
    assert.equal(commentsProps().commentCount, 1); assert.equal(list().props.data[0].commentCount, 1);
    assert.equal(list().props.data[1], other); assert.equal(list().props.data[0].likeCount, 12);
    feedState.focus(); await flush();
    assert.equal(net.calls.filter(call => !call.options.method || call.options.method === 'GET').length, readCount);
    assert.equal(env.refresh.communityFeedRevision(), revision); assert.equal(list().key, undefined);
    list().props.onEndReached(); await flush();
    assert.equal(new URL(net.calls.at(-1).url).searchParams.get('cursor'), 'page2');
  } finally { env.state.cleanup(); feedState.cleanup(); detailState.cleanup(); global.fetch = original; }
});

test('same-user /me refresh leaves mounted community feed/detail reads unchanged; real session change reloads', async () => {
  const original = global.fetch, originalDev = global.__DEV__; global.__DEV__ = false;
  const storage = new Map();
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': { isAvailableAsync: async () => true, getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async key => storage.delete(key) },
    '../constants/api': { API_BASE_URL: 'https://api.test' }, './favoriteCache': { clearFavoriteCache() {} },
    './communityFeedRefresh': { clearCommunityLikes() {} },
  });
  const user = { email: 'test@test', nickname: 'before' };
  const env = setup(auth), net = network(), feedState = hooks(), detailState = hooks();
  const apiFetch = global.fetch;
  global.fetch = (url, options) => url.endsWith('/api/users/me')
    ? Promise.resolve({ ok: true, json: async () => ({ ...user, nickname: 'after' }) }) : apiFetch(url, options);
  const Feed = load('src/screens/CommunityScreen.tsx', { ...env.mocks(feedState, '..'),
    '../components/community/CommunityPostItem': { default: 'CommunityPostItem' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 } }).default;
  const Detail = load('src/app/community/[id].tsx', env.mocks(detailState, '../..')).default;
  const render = () => { feedState.render(Feed); detailState.render(Detail); };
  try {
    await auth.saveTokens({ accessToken: 'A', refreshToken: 'R' }); auth.setAuthUser(user);
    render(); await flush(); render(); const count = net.calls.length;
    await auth.refreshAuthUser(); render(); await flush(); render();
    assert.equal(auth.getAuthUser().nickname, 'after');
    assert.equal(net.calls.length, count, 'data-only refresh does not reload either screen');
    await auth.saveTokens({ accessToken: 'B', refreshToken: 'R2' }); auth.setAuthUser(user);
    render(); await flush(); render(); assert.equal(net.calls.length, count + 2);
  } finally {
    feedState.cleanup(); detailState.cleanup(); global.fetch = original; global.__DEV__ = originalDev;
  }
});

test('stale feed reads preserve a just-written commentCount, subsequent reads use server values', async () => {
  const env = setup(); const oldVersion = env.refresh.communityLikeVersion();
  env.refresh.publishCommunityCommentCount(1, 4);
  assert.equal(env.refresh.mergeCommunityCommentCount(post, oldVersion).commentCount, 4);
  assert.equal(env.refresh.mergeCommunityCommentCount({ ...post, commentCount: 5 }, env.refresh.communityLikeVersion()).commentCount, 5);
  const sorted = env.comments.insertCommunityComment([root, reply, third, { ...root, id: 9 }], { ...third, id: 4 });
  assert.deepEqual(sorted.map(item => item.id), [1, 2, 3, 4, 9]);
});

for (const targetType of ['POST', 'REVIEW']) {
test(`${targetType}: list failures have retry and do not allow writing against an incomplete thread list`, async () => {
  const original = global.fetch; const env = setup(undefined, targetType);
  try {
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'failure' });
    env.render(); await flush(); assert.ok(button(env.render(), '댓글 다시 시도'));
    button(env.render(), '댓글 입력').props.onChangeText('hi'); assert.equal(button(env.render(), '댓글 등록').props.disabled, true);
    network(); button(env.render(), '댓글 다시 시도').props.onPress(); env.render(); await flush();
    assert.equal(button(env.render(), '댓글 다시 시도'), undefined);
    assert.equal(button(env.render(), '댓글 등록').props.disabled, false);
  } finally { env.state.cleanup(); global.fetch = original; }
});
}
test('typed deletion tombstones reject stale root/reply resurrection without changing same-ID POST', async () => {
  const original = global.fetch, env = setup(undefined, 'REVIEW'); let resolve;
  try {
    global.fetch = () => new Promise(done => { resolve = done; });
    const pending = env.comments.getCommunityComments(1, new AbortController().signal, 'REVIEW');
    await flush();
    env.refresh.publishCommunityCommentDeletion(1, root, 'REVIEW');
    env.refresh.publishCommunityCommentCount(1, 1, 'REVIEW');
    assert.deepEqual(env.refresh.mergeCommunityCommentDeletions(1, [root, reply], 0, 'POST'), [root, reply]);
    resolve({ ok: true, json: async () => ({ items: [root, reply, third, { ...root, id: 9 }], commentCount: 4 }) });
    const result = await pending;
    assert.deepEqual(result.items.map(item => item.id), [9]);
    assert.equal(result.commentCount, 1);
    global.fetch = async () => ({ ok: true, json: async () => ({ items: [{ ...root, id: 9 }], commentCount: 1 }) });
    assert.equal((await env.comments.getCommunityComments(1, new AbortController().signal, 'REVIEW')).items.length, 1);
  } finally { env.state.cleanup(); global.fetch = original; }
});

test('REVIEW deletion late old-session 401 preserves new credentials and draft', async () => {
  const original = global.fetch, env = setup(undefined, 'REVIEW'), net = network(); let resolve;
  try {
    env.render(); await flush();
    button(env.render(), '댓글 입력').props.onChangeText('draft');
    net.respondDelete(() => new Promise(done => { resolve = done; }));
    confirmDelete(env, 1)(); await flush();
    env.newSession('new'); env.render(); await flush();
    resolve({ ok: false, status: 401, text: async () => '' }); await flush();
    assert.equal(await env.auth.getSavedAccessToken(), 'new');
    assert.deepEqual(env.routes, []);
    assert.equal(button(env.render(), '댓글 입력').props.value, 'draft');
  } finally { env.state.cleanup(); global.fetch = original; }
});
