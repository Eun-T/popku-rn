const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  mocks = { '../../components/community/CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' }, ...mocks };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
class ApiError extends Error { constructor(status, body, authGeneration) { super(String(status)); Object.assign(this, { status, authGeneration }); } }
const flush = () => new Promise(resolve => setImmediate(resolve));
const image = index => ({ uri: `file:${index}.webp`, width: 1600, height: 1200, mimeType: 'image/webp' });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
function api(options = {}) {
  let session = { accessToken: 'token', generation: 4 }, revisions = 0;
  const calls = [], clears = [];
  const refresh = load('src/lib/communityFeedRefresh.ts', {});
  const diagnostics = { readCommunityErrorBody: async r => r.text(), logCommunityError() {}, describeS3Put: () => ({}), readS3PutError: async () => ({}) };
  const fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    if (options.fetch) return options.fetch(url, init);
    if (url.startsWith('file:')) return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
    if (init.method === 'PUT') { assert.ok(init.body instanceof ArrayBuffer); return response({}); }
    if (url.endsWith('review-image-uploads') && init.method === 'POST') return response({ uploadToken: 'review-token', images:
      Array.from({ length: JSON.parse(init.body).count }, (_, i) => ({ imageKey: `community/reviews/1/batch/${i}.webp`, uploadUrl: `https://s3/${i}`, contentType: 'image/webp', sortOrder: i })) });
    return response(init.method === 'POST' ? { id: 12 } : { items: [], nextCursor: null });
  };
  const images = load('src/lib/communityImages.ts', {
    'expo-image-picker': {}, 'expo-image-manipulator': {}, './community': { CommunityApiError: ApiError }, './communityDiagnostics': diagnostics,
  }, { fetch });
  const auth = {
      getAuthSession: async () => ({ ...session }), clearTokens: async generation => { clears.push(generation); if (session.generation !== generation) return false; session.accessToken = null; return true; },
  };
  const community = load('src/lib/community.ts', {
    '../constants/api': { API_BASE_URL: 'https://api' }, './auth': auth, './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh,
  }, { fetch });
  const reviews = load('src/lib/reviews.ts', {
    '../constants/api': { API_BASE_URL: 'https://api' }, './auth': auth,
    './community': { CommunityApiError: ApiError, publicCommunityRequest: community.publicCommunityRequest }, './communityFeedRefresh': { ...refresh, markCommunityFeedChanged: () => revisions++ },
    './communityImages': images, './communityDiagnostics': diagnostics,
  }, { fetch });
  return { ...reviews, auth, community, refresh, calls, clears, setSession: value => { session = value; }, get revisions() { return revisions; } };
}

test('review API uses current popup and authenticated author; integer ratings, schema byte limit and empty content', async () => {
  const env = api();
  await env.createReview('popup/one', 4, '');
  assert.equal(env.calls[0].url, 'https://api/api/popups/popup%2Fone/reviews');
  assert.deepEqual(JSON.parse(env.calls[0].body), { rating: 4, content: '' });
  assert.equal(env.calls[0].headers.Authorization, 'Bearer token');
  assert.equal(env.reviewContentBytes('A가😀'), 8);
  for (const rating of [0, 6, 4.5, NaN]) await assert.rejects(env.createReview('popup', rating, 'body'));
  await assert.rejects(env.createReview('popup', 4, '가'.repeat(21846)));
  env.setSession({ accessToken: null, generation: 5 });
  await assert.rejects(env.createReview('popup', 4, 'body'), error => error.status === 401 && error.authGeneration === 5);
  assert.equal(env.calls.length, 1, 'anonymous writes never reach fetch');
});

test('review photo upload reuses binary WebP PUT and binds grant to popup; 1-5 accepted, six rejected', async () => {
  for (let count = 1; count <= 5; count++) {
    const env = api(), attempt = { current: null };
    assert.deepEqual(await env.publishReviewWithImages('popup', 5, 'visited', Array.from({ length: count }, (_, i) => image(i)), attempt), { id: 12 });
    const puts = env.calls.filter(call => call.method === 'PUT');
    assert.equal(puts.length, count); assert.ok(puts.every(call => call.headers['Content-Type'] === 'image/webp'));
    assert.equal(env.calls[0].url, 'https://api/api/popups/popup/review-image-uploads');
    assert.deepEqual(JSON.parse(env.calls.at(-1).body), { rating: 5, content: 'visited', uploadToken: 'review-token' });
    assert.equal(attempt.current, null);
    await assert.rejects(env.publishReviewWithImages('popup', 5, '', Array.from({ length: 6 }, (_, i) => image(i)), attempt));
  }
});

test('unknown review commit keeps original popup/rating/content/token for retry', async () => {
  let commit = 0; const calls = [];
  const env = api({ fetch: async (url, init) => {
    calls.push({ url, ...init });
    if (url.startsWith('file:')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    if (init.method === 'PUT') return response({});
    if (url.endsWith('review-image-uploads') && init.method === 'POST') return response({ uploadToken: 'grant', images: [{ imageKey: '0.webp', uploadUrl: 'https://s3/0', contentType: 'image/webp', sortOrder: 0 }] });
    if (url.endsWith('/reviews')) { if (++commit === 1) throw new Error('lost response'); return response({ id: 3 }); }
    return response({});
  } });
  const attempt = { current: null };
  await assert.rejects(env.publishReviewWithImages('popup-1', 3, 'original', [image(0)], attempt));
  assert.equal(attempt.current.outcomeUnknown, true);
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
  await env.publishReviewWithImages('popup-2', 5, 'changed', [], attempt);
  const creates = calls.filter(call => call.url.endsWith('/reviews'));
  assert.equal(creates[0].url, creates[1].url); assert.equal(creates[0].body, creates[1].body);
  assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
});

test('PUT failure cleans up review grant without committing; expired session preserves an earlier unknown commit', async () => {
  let putFails = true, commitFails = true; const events = [];
  const env = api({ fetch: async (url, init) => {
    events.push({ url, ...init });
    if (url.startsWith('file:')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    if (init.method === 'PUT') return response({}, putFails ? 500 : 200);
    if (url.endsWith('review-image-uploads') && init.method === 'POST') return response({ uploadToken: 'grant', images: [{ imageKey: '0.webp', uploadUrl: 'https://s3/0', contentType: 'image/webp', sortOrder: 0 }] });
    if (url.endsWith('/reviews')) { if (commitFails) throw new Error('unknown commit'); return response({ id: 1 }); }
    return response({});
  } });
  const attempt = { current: null };
  await assert.rejects(env.publishReviewWithImages('popup', 4, 'body', [image(0)], attempt));
  assert.equal(attempt.current, null); assert.ok(events.some(event => event.method === 'DELETE' && event.url.endsWith('review-image-uploads')));
  assert.equal(events.some(event => event.url.endsWith('/reviews')), false);
  putFails = false;
  await assert.rejects(env.publishReviewWithImages('popup', 4, 'body', [image(0)], attempt));
  const cleanupCount = events.filter(event => event.method === 'DELETE').length;
  env.setSession({ accessToken: null, generation: 6 });
  await assert.rejects(env.publishReviewWithImages('popup', 4, 'body', [], attempt), error => error.status === 401);
  assert.equal(attempt.current.authRequired, true); assert.equal(events.filter(event => event.method === 'DELETE').length, cleanupCount);
  env.setSession({ accessToken: 'new', generation: 7 }); commitFails = false;
  await env.publishReviewWithImages('popup', 4, 'body', [], attempt); assert.equal(attempt.current, null);
});

test('public review reads retry with new session after an old 401 and never invalidate newer credentials', async () => {
  let env, count = 0;
  env = api({ fetch: async () => { if (++count === 1) {
    env.setSession({ accessToken: 'new', generation: 5 }); return response({}, 401);
  } return response({ items: [], nextCursor: null }); } });
  await env.getPopupReviews('popup', null, new AbortController().signal);
  assert.deepEqual(env.clears, [4]); assert.equal(env.calls[1].headers.Authorization, 'Bearer new');
});

test('review invalidation targets only subscribed popup and uses existing feed revision', () => {
  const env = api(); let first = 0, second = 0;
  const off = env.subscribeReviews(id => { if (id === 'first') first++; if (id === 'second') second++; });
  env.reviewsCreated('first'); assert.equal(first, 1); assert.equal(second, 0); assert.equal(env.revisions, 1);
  off(); env.reviewsCreated('first'); assert.equal(first, 1);
});

function hooks() {
  const slots = [], effects = []; let index = 0;
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) {
      slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
    } },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) slots[i] = { deps, fn }; return slots[i].fn; },
  };
  return { react, render(component, props) { index = 0; const tree = component(props); effects.splice(0).forEach(fn => fn()); return tree; }, cleanup() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx };
const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'Image', 'ActivityIndicator', 'KeyboardAvoidingView'].map(name => [name, name]));
native.StyleSheet = { create: value => value }; native.Platform = { OS: 'ios' }; native.Alert = { alert() {} };
const theme = { radius: {}, spacing: {}, typography: {} };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const button = (tree, label) => nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);

const detailFixture = (count = 0) => ({ id: 10, type: 'REVIEW', author: { id: 1, nickname: 'author', avatarUrl: null },
  popup: { publicId: 'popup-1', title: 'Popup One' }, rating: 4, content: 'review body', createdAt: '2026-10-05T10:00:00+09:00',
  updatedAt: '2026-10-05T10:00:00+09:00', images: Array.from({ length: count }, (_, i) => ({ id: i + 1, url: `signed:${i}` })),
  likeCount: 2, commentCount: 3, liked: false, isOwner: false });

test('POP_TO explains the regression: it removes REVIEW when the target popup is absent', () => {
  const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');
  const router = StackRouter({ initialRouteName: '(tabs)' });
  const options = { routeParamList: {}, routeGetIdList: { 'places/[id]': ({ params }) => params.id } };
  const popup = { key: 'popup-key', name: 'places/[id]', params: { id: 'popup-1' } };
  const root = { type: 'stack', key: 'root', index: 2, routeNames: ['(tabs)', 'places/[id]', 'reviews/[id]'],
    routes: [{ key: 'tabs-key', name: '(tabs)' }, popup, { key: 'review-key', name: 'reviews/[id]', params: { id: '10' } }], preloadedRoutes: [] };
  const action = { type: 'POP_TO', payload: { name: 'places/[id]', params: { id: 'popup-1' } } };
  const next = router.getStateForAction(root, action, options);
  assert.deepEqual(next.routes.map(route => route.key), ['tabs-key', 'popup-key']);
  const fromFeed = { ...root, index: 1, routes: [root.routes[0], root.routes[2]] };
  const replaced = router.getStateForAction(fromFeed, action, options);
  assert.equal(replaced.routes.length, 2); assert.equal(replaced.routes[1].name, 'places/[id]');
  assert.equal(replaced.routes[1].params.id, 'popup-1');
});

test('review detail public API keeps REVIEW namespace and retries an expired session safely', async () => {
  let env, attempts = 0;
  env = api({ fetch: async () => { if (++attempts === 1) { env.setSession({ accessToken: 'new', generation: 5 }); return response({}, 401); }
    return response(detailFixture(5)); } });
  const detail = await env.getReviewDetail(10, new AbortController().signal);
  assert.equal(detail.type, 'REVIEW'); assert.equal(detail.images.length, 5);
  assert.equal(env.calls[0].url, 'https://api/api/community/reviews/10');
  assert.equal(env.calls[1].headers.Authorization, 'Bearer new'); assert.deepEqual(env.clears, [4]);
  const anonymous = api({ fetch: async () => response(detailFixture()) });
  anonymous.setSession({ accessToken: null, generation: 6 });
  await anonymous.getReviewDetail(10, new AbortController().signal);
  assert.equal(anonymous.calls[0].headers?.Authorization, undefined);
  await assert.rejects(anonymous.getReviewDetail(NaN, new AbortController().signal), error => error.status === 404);
  await assert.rejects(api({ fetch: async () => response({}, 404) }).getReviewDetail(10, new AbortController().signal), error => error.status === 404);
  await assert.rejects(api({ fetch: async () => response({ ...detailFixture(), type: 'POST' }) }).getReviewDetail(10, new AbortController().signal));
});

test('review detail reuses author/carousel, locks popup navigation and never refetches on focus/back', async () => {
  for (let count = 0; count <= 5; count++) {
    for (const origin of ['community', 'same-popup', 'different-popup']) {
    const state = hooks(), routes = [], reads = []; let focus;
    const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');
    const stackRouter = StackRouter({ initialRouteName: '(tabs)' });
    const options = { routeParamList: {}, routeGetIdList: { 'places/[id]': ({ params }) => params.id } };
    const initialRoutes = [{ key: 'community-key', name: '(tabs)' }];
    if (origin !== 'community') initialRoutes.push({ key: 'popup-key', name: 'places/[id]', params: { id: origin === 'same-popup' ? 'popup-1' : 'popup-2' } });
    const reviewRoute = { key: 'review-key', name: 'reviews/[id]', params: { id: '10' } };
    initialRoutes.push(reviewRoute);
    let stack = { type: 'stack', key: 'root', index: initialRoutes.length - 1,
      routeNames: ['(tabs)', 'places/[id]', 'reviews/[id]'], routes: initialRoutes, preloadedRoutes: [] };
    const dispatch = action => { stack = stackRouter.getStateForAction(stack, action, options); };
    const Screen = load('src/app/reviews/[id].tsx', {
      react: state.react, 'react/jsx-runtime': runtime, 'react-native': native,
      'lucide-react-native': Object.fromEntries(['ChevronLeft', 'ChevronRight', 'Heart', 'MapPin', 'MessageCircle', 'Star'].map(name => [name, name])),
      'expo-router': { useLocalSearchParams: () => ({ id: '10' }), useFocusEffect: fn => { if (focus !== fn) { focus = fn; fn(); } },
        useNavigation: () => ({ getState: () => stack }),
        useRouter: () => ({ push: route => { routes.push(route); dispatch({ type: 'PUSH', payload: { name: 'places/[id]', params: route.params } }); },
          canGoBack: () => stack.index > 0, back: () => { routes.push('back'); dispatch({ type: 'GO_BACK' }); } }) },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
      '../../components/community/CommunityAuthor': { __esModule: true, default: 'Author' },
      '../../components/community/CommunityImageCarousel': { __esModule: true, default: 'Carousel' },
      '../../components/community/CommunityComments': { __esModule: true, default: 'CommunityComments' },
      '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 100 }) },
      '../../lib/auth': { subscribeAuthSession: () => () => {} }, '../../lib/community': { CommunityApiError: ApiError },
      '../../lib/communityFeedRefresh': { subscribeCommunityLikes: () => () => {}, subscribeCommunityCommentCounts: () => () => {}, subscribeCommunityPostChanges: () => () => {} },
      '../../lib/communityLikes': { changeCommunityLike: async () => {} },
      '../../lib/reviews': { getReviewDetail: async (id, signal) => { reads.push({ id, signal }); return detailFixture(count); } },
      '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
    }).default;
    state.render(Screen); await flush(); const tree = state.render(Screen);
    assert.deepEqual(nodes(tree).find(node => node.type === 'Carousel').props.images, detailFixture(count).images.map(image => image.url));
    assert.equal(nodes(tree).find(node => node.type === 'Author').props.now, 100);
    assert.ok(nodes(tree).some(node => node.props?.children === 'review body'));
    const link = button(tree, 'Popup One'); link.props.onPress(); link.props.onPress();
    if (origin === 'same-popup') {
      assert.deepEqual(routes, ['back']);
      assert.deepEqual(stack.routes.map(route => route.key), ['community-key', 'popup-key'], 'existing popup preserved, no duplicate push');
    } else {
      assert.deepEqual(routes, [{ pathname: '/places/[id]', params: { id: 'popup-1' } }], 'rapid tap pushes once');
      assert.equal(stack.routes.at(-2).key, 'review-key', 'REVIEW stays in history');
      dispatch({ type: 'GO_BACK' });
      assert.equal(stack.routes.at(-1).key, 'review-key', 'popup back returns to REVIEW');
    }
    focus(); state.render(Screen); assert.equal(reads.length, 1);
    button(tree, 'community.writeBack').props.onPress(); assert.equal(routes.at(-1), 'back');
    assert.equal(stack.routes.at(-1).key, origin === 'different-popup' ? 'popup-key' : 'community-key');
    assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 3, 'back, popup and like are actionable');
    state.cleanup(); assert.equal(reads[0].signal.aborted, true);
    }
  }
});

test('write screen requires rating, keeps draft on failure, blocks rapid registration and returns to popup after success', async () => {
  const state = hooks(), routes = [], writes = [], invalidations = [], clears = []; let beforeRemove, resolve, fail = false;
  const env = api();
  const Screen = load('src/app/reviews/write.tsx', {
    react: state.react, 'react/jsx-runtime': runtime, 'react-native': native, 'lucide-react-native': { Star: 'Star' },
    'expo-router': { useLocalSearchParams: () => ({ publicId: 'popup' }), useNavigation: () => ({ addListener: (_, fn) => { beforeRemove = fn; return () => {}; } }),
      useRouter: () => ({ canGoBack: () => true, back: () => routes.push('back'), push: route => routes.push(route) }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
    '../../lib/popups': { getPopupDetail: async () => ({ publicId: 'popup', name: 'Current Popup' }) },
    '../../lib/auth': { clearTokens: async generation => { clears.push(generation); return false; } }, '../../lib/community': { CommunityApiError: ApiError },
    '../../lib/communityImages': { MAX_POST_IMAGES: 5, selectPostImages: async () => [], ImageSelectionError: class extends Error {} },
    '../../lib/reviews': { ...env, createReview: (...args) => { writes.push(args); return fail ? Promise.reject(new ApiError(401, '', 4)) : new Promise(done => { resolve = done; }); }, reviewsCreated: id => invalidations.push(id) },
    '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
  }).default;
  let tree = state.render(Screen); await flush(); tree = state.render(Screen);
  assert.equal(button(tree, '등록').props.disabled, true);
  assert.equal(nodes(tree).filter(node => node.type === 'Star').length, 5);
  button(tree, '별점 4점').props.onPress();
  nodes(tree).find(node => node.type === 'TextInput').props.onChangeText('my visit');
  tree = state.render(Screen); assert.equal(button(tree, '등록').props.disabled, false);
  fail = true; button(tree, '등록').props.onPress(); await flush(); tree = state.render(Screen);
  assert.equal(nodes(tree).find(node => node.type === 'TextInput').props.value, 'my visit');
  assert.deepEqual(clears, [4]); assert.deepEqual(routes, [], 'old 401 cannot redirect new session');
  fail = false; button(tree, '등록').props.onPress(); button(tree, '등록').props.onPress();
  assert.equal(writes.length, 2, 'one failing request and one pending request');
  let prevented = false; beforeRemove({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  resolve({ id: 1 }); await flush(); assert.deepEqual(routes, ['back']); assert.deepEqual(invalidations, ['popup']);
  assert.deepEqual(writes.at(-1), ['popup', 4, 'my visit']); state.cleanup();
});

test('popup review tab empty/error states, authenticated entry lock, pagination and popup-only refresh', async () => {
  const state = hooks(), routes = [], reads = []; let listener, focus, token = null;
  const item = { id: 1, type: 'REVIEW', category: 'REVIEW' };
  let result = { items: [], nextCursor: null };
  const Tab = load('src/components/place/PopupReviews.tsx', {
    react: state.react, 'react/jsx-runtime': runtime, 'react-native': native,
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }), useFocusEffect: fn => { if (fn !== focus) { focus = fn; fn(); } } },
    '../community/CommunityPostItem': { __esModule: true, default: 'Card' }, '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 100 }) },
    '../../lib/auth': { getAuthSession: async () => ({ accessToken: token }), subscribeAuthSession: () => () => {} },
    '../../lib/communityFeedRefresh': { subscribeCommunityLikes: () => () => {}, subscribeCommunityCommentCounts: () => () => {}, subscribeCommunityPostChanges: () => () => {} },
    '../../lib/communityLikes': { changeCommunityLike: async () => {} },
    '../../lib/reviews': { getPopupReviews: async (id, cursor) => { reads.push([id, cursor]); return result; }, subscribeReviews: fn => { listener = fn; return () => {}; } },
    '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
  }).default;
  const props = { publicId: 'popup', title: 'Popup' };
  state.render(Tab, props); await flush(); let tree = state.render(Tab, props);
  assert.ok(nodes(tree).some(node => node.props?.children === '아직 방문 리뷰가 없어요'));
  button(tree, '방문 리뷰 작성').props.onPress(); button(tree, '방문 리뷰 작성').props.onPress(); await flush();
  assert.deepEqual(routes, ['/profile/login']);
  token = 'token'; focus(); button(tree, '방문 리뷰 작성').props.onPress(); await flush();
  assert.equal(routes[1].params.publicId, 'popup'); assert.equal(routes[1].pathname, '/reviews/write');
  result = { items: [item], nextCursor: '1' }; listener('other'); state.render(Tab, props); assert.equal(reads.length, 1);
  listener('popup'); state.render(Tab, props); await flush(); tree = state.render(Tab, props);
  assert.equal(nodes(tree).filter(node => node.type === 'Card').length, 1);
  assert.ok(button(tree, '방문 리뷰 작성'));
  focus();
  const reviewCard = nodes(tree).find(node => node.type === 'Card');
  const beforeRoutes = routes.length, beforeReads = reads.length;
  reviewCard.props.onPressReview(); reviewCard.props.onPressReview();
  assert.equal(routes.length, beforeRoutes + 1); assert.deepEqual(routes.at(-1), { pathname: '/reviews/[id]', params: { id: '1' } });
  focus(); tree = state.render(Tab, props);
  assert.equal(reads.length, beforeReads, 'simple back does not refetch popup reviews');
  result = { items: [{ ...item, id: 2 }], nextCursor: null };
  nodes(tree).find(node => node.type === 'Pressable' && node.props.children?.props?.children === '리뷰 더 보기').props.onPress();
  await flush(); tree = state.render(Tab, props);
  assert.deepEqual(reads.at(-1), ['popup', '1']); assert.equal(nodes(tree).filter(node => node.type === 'Card').length, 2);
  state.cleanup();
});

test('review edit GET/PATCH contracts and image retry share immutable grant without repeated PUT', async () => {
  let patches = 0;
  const env = api({ fetch: async (url, init) => {
    if (url.startsWith('file:')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    if (init.method === 'PUT') return response({});
    if (url.endsWith('review-image-uploads')) return response({ uploadToken: 'edit-grant', images: [{ imageKey: 'new.webp', uploadUrl: 'https://s3/new', contentType: 'image/webp', sortOrder: 0 }] });
    if (init.method === 'PATCH' && ++patches === 1) throw new Error('response lost');
    return response({ ...detailFixture(2), rating: 5, content: 'edited' });
  } });
  await env.getReviewDetail(10, new AbortController().signal, true);
  assert.equal(env.calls[0].url, 'https://api/api/community/reviews/10/edit');
  assert.equal(env.calls[0].headers.Authorization, 'Bearer token');
  const attempt = { current: null };
  await assert.rejects(env.updateReviewWithImages(10, 'popup-1', 5, 'edited', [1], [image(1)], attempt));
  assert.equal(attempt.current.outcomeUnknown, true);
  await env.updateReviewWithImages(99, 'other', 1, 'changed draft', [], [image(2)], attempt);
  assert.equal(attempt.current, null);
  const requests = env.calls.filter(call => call.method === 'PATCH');
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[1].url, 'https://api/api/community/reviews/10');
  assert.deepEqual(JSON.parse(requests[1].body), { rating: 5, content: 'edited', retainedImageIds: [1], uploadToken: 'edit-grant' });
  assert.equal(env.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(env.revisions, 0);
  await assert.rejects(env.updateReview(10, 0, '', []));
  await assert.rejects(env.updateReview(10, 5, '', [1,1]));
  assert.throws(() => env.updateReviewWithImages(10, 'popup-1', 5, '', [1,2,3,4,5], [image(0)], { current: null }));
});

test('review edits protect old detail/feed/popup GETs and preserve typed reaction state', async () => {
  const pending = new Map();
  const env = api({ fetch: url => new Promise(resolve => pending.set(url, resolve)) });
  const signal = new AbortController().signal;
  const detail = env.getReviewDetail(10, signal);
  const popup = env.getPopupReviews('popup-1', null, signal);
  const feed = env.community.getCommunityFeed('ALL', 'LATEST', null, signal);
  await flush();
  const old = detailFixture(1), reviewItem = { ...old, category: 'REVIEW', images: ['signed:0'] };
  env.refresh.publishCommunityLike(10, { liked: true, likeCount: 8 }, false, 'REVIEW');
  env.refresh.publishCommunityCommentCount(10, 9, 'REVIEW');
  env.reviewUpdated({ ...detailFixture(2), rating: 5, content: 'new', updatedAt: 'later', liked: false, likeCount: 0, commentCount: 0 });
  for (const [url, resolve] of pending) resolve(response(url.includes('/feed?')
    ? { items: [reviewItem, { ...reviewItem, type: 'POST' }], nextCursor: null }
    : url.includes('/popups/') ? { items: [reviewItem], nextCursor: null } : old));
  const results = await Promise.all([detail, popup, feed]);
  for (const item of [results[0], results[1].items[0], results[2].items[0]]) {
    assert.equal(item.rating, 5); assert.equal(item.content, 'new');
    assert.equal(item.likeCount, 8); assert.equal(item.commentCount, 9); assert.equal(item.liked, true);
    assert.equal(item.images.length, 2);
  }
  assert.equal(results[2].items[1].content, 'review body');
  assert.equal(results[2].items[1].likeCount, 2);
  assert.equal(env.revisions, 0);
});

test('review edit screen reuses form, removes retained image, adds only new image and preserves draft on 401', async () => {
  const state = hooks(), routes = [], calls = [], changes = [], clears = []; let resolve, failing = true;
  const env = api();
  const Screen = load('src/app/reviews/write.tsx', {
    react: state.react, 'react/jsx-runtime': runtime, 'react-native': native, 'lucide-react-native': { Star: 'Star' },
    'expo-router': { useLocalSearchParams: () => ({ editId: '10' }), useNavigation: () => ({ addListener: () => () => {} }),
      useRouter: () => ({ canGoBack: () => true, back: () => routes.push('back'), push: route => routes.push(route) }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
    '../../lib/popups': { getPopupDetail: async () => { throw new Error('edit must not fetch/select popup'); } },
    '../../lib/auth': { clearTokens: async generation => { clears.push(generation); return true; } }, '../../lib/community': { CommunityApiError: ApiError },
    '../../lib/communityImages': { MAX_POST_IMAGES: 5, ImageSelectionError: class extends Error {},
      selectPostImages: async (current, observer, count) => { assert.equal(count, 1); return [image(7)]; } },
    '../../lib/reviews': { ...env, getReviewDetail: async (id, signal, edit) => { assert.equal(edit, true); return { ...detailFixture(2), isOwner: true }; },
      updateReviewWithImages: (...args) => { calls.push(args); return failing ? Promise.reject(new ApiError(401, '', 4)) : new Promise(done => { resolve = done; }); },
      reviewUpdated: review => changes.push(review), reviewsCreated: () => { throw new Error('edit must not bump revision'); } },
    '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
  }).default;
  state.render(Screen); await flush(); let tree = state.render(Screen);
  assert.equal(button(tree, '별점 4점').props.accessibilityState.selected, true);
  assert.equal(nodes(tree).find(node => node.type === 'TextInput').props.value, 'review body');
  assert.equal(nodes(tree).filter(node => node.type === 'Image').length, 2);
  button(tree, '뒤로 가기').props.onPress(); assert.deepEqual(routes, ['back']); routes.length = 0;
  button(tree, '사진 1 삭제').props.onPress(); tree = state.render(Screen);
  button(tree, '사진 추가').props.onPress(); await flush(); tree = state.render(Screen);
  button(tree, '별점 5점').props.onPress(); nodes(tree).find(node => node.type === 'TextInput').props.onChangeText('edited');
  tree = state.render(Screen); button(tree, '수정 완료').props.onPress(); await flush(); tree = state.render(Screen);
  assert.deepEqual(clears, [4]); assert.equal(routes.at(-1), '/profile/login');
  assert.equal(nodes(tree).find(node => node.type === 'TextInput').props.value, 'edited');
  assert.equal(nodes(tree).filter(node => node.type === 'Image').length, 2);
  failing = false; routes.length = 0;
  const save = button(tree, '수정 완료').props.onPress; save(); save();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.at(-1).slice(0,6), [10, 'popup-1', 5, 'edited', [2], [{ ...image(7), kind: 'new' }]]);
  resolve({ ...detailFixture(2), content: 'edited', rating: 5 }); await flush();
  assert.deepEqual(routes, ['back']); assert.equal(changes.length, 1);
  state.cleanup();
});

test('owner REVIEW menu retains edit navigation and also enables deletion', async () => {
  for (const isOwner of [false, true]) {
    const state = hooks(), routes = [], env = api(); let focus;
    const Screen = load('src/app/reviews/[id].tsx', {
      react: state.react, 'react/jsx-runtime': runtime, 'react-native': native,
      'lucide-react-native': { MoreHorizontal: 'MoreHorizontal' },
      'expo-router': { useLocalSearchParams: () => ({ id: '10' }), useFocusEffect: fn => { focus = fn; },
        useNavigation: () => ({ getState: () => ({ index: 1, routes: [{ name: '(tabs)' }, { name: 'reviews/[id]' }] }) }),
        useRouter: () => ({ push: route => routes.push(route), canGoBack: () => true, back: () => routes.push('back') }) },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
      '../../components/community/CommunityAuthor': { __esModule: true, default: 'Author' },
      '../../components/community/CommunityImageCarousel': { __esModule: true, default: 'Carousel' },
      '../../components/community/CommunityComments': { __esModule: true, default: 'CommunityComments' },
      '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 100 }) },
      '../../lib/auth': { subscribeAuthSession: () => () => {} }, '../../lib/community': { CommunityApiError: ApiError },
      '../../lib/communityFeedRefresh': env.refresh,
      '../../lib/communityLikes': { changeCommunityLike: async () => {} },
      '../../lib/reviews': { ...env, getReviewDetail: async () => ({ ...detailFixture(), isOwner }) },
      '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
    }).default;
    state.render(Screen); await flush(); let tree = state.render(Screen);
    if (!isOwner) assert.equal(button(tree, '리뷰 메뉴'), undefined);
    else {
      const open = button(tree, '리뷰 메뉴').props.onPress; open(); open();
      tree = state.render(Screen);
      const menu = nodes(tree).find(node => node.type === 'CommunityPostMenu');
      assert.notEqual(menu.props.showDelete, false);
      menu.props.onSelect(1); menu.props.onSelect(1);
      assert.deepEqual(routes, [{ pathname: '/reviews/write', params: { editId: '10' } }]);
      focus(); state.render(Screen);
      assert.equal(env.revisions, 0);
    }
    state.cleanup();
  }
});

test('REVIEW deletion tombstone filters stale feed/popup and rejects stale detail without removing same-ID POST', async () => {
  const pending = new Map(), env = api({ fetch: url => new Promise(resolve => pending.set(url, resolve)) });
  const signal = new AbortController().signal, review = detailFixture(1);
  const detail = env.getReviewDetail(10, signal);
  const rejected = assert.rejects(detail, error => error.status === 404);
  const popup = env.getPopupReviews('popup-1', null, signal);
  const feed = env.community.getCommunityFeed('ALL', 'LATEST', null, signal);
  await flush();
  env.refresh.publishCommunityPostChange(10, null, 'REVIEW');
  for (const [url, resolve] of pending) resolve(response(url.includes('/feed?')
    ? { items: [review, { ...review, type: 'POST' }], nextCursor: 'cursor' }
    : url.includes('/popups/') ? { items: [review], nextCursor: '10' } : review));
  await rejected;
  assert.deepEqual((await popup).items, []);
  const result = await feed;
  assert.deepEqual(result.items.map(item => item.type), ['POST']); assert.equal(result.nextCursor, 'cursor');
  assert.equal(env.revisions, 0);
  const inverse = api();
  inverse.refresh.publishCommunityPostChange(10, null, 'POST');
  assert.equal(inverse.refresh.mergeCommunityPostChange(review, 0).type, 'REVIEW');
});

test('REVIEW delete API uses authenticated REVIEW namespace and does not treat response-loss retry 404 as success', async () => {
  let first = true;
  const env = api({ fetch: async () => { if (first) { first = false; throw new Error('response lost'); } return response({}, 404); } });
  await assert.rejects(env.deleteReview(10), /response lost/);
  await assert.rejects(env.deleteReview(10), error => error.status === 404);
  assert.ok(env.calls.every(call => call.url === 'https://api/api/community/reviews/10' && call.method === 'DELETE' && call.body === undefined));
  env.setSession({ accessToken: null, generation: 9 });
  await assert.rejects(env.deleteReview(10), error => error.status === 401 && error.authGeneration === 9);
  assert.equal(env.calls.length, 2);
});

test('REVIEW delete confirmation cancels, locks duplicates and mutations, then pops to original popup/community', async () => {
  for (const origin of ['community', 'popup']) {
    const state = hooks(), alerts = [], routes = []; let resolve, focus;
    const env = api({ fetch: () => new Promise(done => { resolve = done; }) });
    const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');
    const router = StackRouter({ initialRouteName: '(tabs)' });
    const previous = origin === 'popup' ? { key: 'popup', name: 'places/[id]', params: { id: 'popup-1' } } : { key: 'community', name: '(tabs)' };
    let stack = { type: 'stack', key: 'root', index: 1, routeNames: ['(tabs)', 'places/[id]', 'reviews/[id]'],
      routes: [previous, { key: 'review', name: 'reviews/[id]', params: { id: '10' } }], preloadedRoutes: [] };
    const Screen = load('src/app/reviews/[id].tsx', {
      react: state.react, 'react/jsx-runtime': runtime, 'react-native': { ...native, Alert: { alert: (...args) => alerts.push(args) } },
      'lucide-react-native': {}, 'expo-router': { useLocalSearchParams: () => ({ id: '10' }),
        useFocusEffect: fn => { focus = fn; fn(); }, useNavigation: () => ({ getState: () => stack }),
        useRouter: () => ({ push: route => routes.push(route), canGoBack: () => true, back: () => {
          routes.push('back'); stack = router.getStateForAction(stack, { type: 'GO_BACK' }, { routeParamList: {}, routeGetIdList: {} });
        } }) },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
      '../../components/community/CommunityAuthor': { __esModule: true, default: 'Author' }, '../../components/community/CommunityImageCarousel': { __esModule: true, default: 'Carousel' },
      '../../components/community/CommunityComments': { __esModule: true, default: 'CommunityComments' }, '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 100 }) },
      '../../lib/auth': { ...env.auth, subscribeAuthSession: () => () => {} }, '../../lib/community': { CommunityApiError: ApiError },
      '../../lib/communityFeedRefresh': env.refresh, '../../lib/communityLikes': { changeCommunityLike: () => { throw new Error('like must be locked'); } },
      '../../lib/reviews': { ...env, getReviewDetail: async () => ({ ...detailFixture(), isOwner: true }) },
      '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': theme,
    }).default;
    const render = () => state.render(Screen);
    const confirm = () => {
      button(render(), '리뷰 메뉴').props.onPress();
      nodes(render()).find(node => node.type === 'CommunityPostMenu').props.onSelect(2);
      return alerts.at(-1)[2];
    };
    render(); await flush();
    confirm().find(action => action.style === 'cancel').onPress();
    assert.equal(env.calls.length, 0);
    const remove = confirm().find(action => action.style === 'destructive').onPress;
    remove(); remove(); await flush();
    assert.equal(env.calls.length, 1); assert.deepEqual(routes, []);
    let tree = render();
    assert.equal(button(tree, '리뷰 메뉴').props.disabled, true);
    assert.equal(nodes(tree).find(node => node.type === 'CommunityComments').props.mutationDisabled, true);
    button(tree, '좋아요').props.onPress();
    for (const failure of [403, 404, 500, 'old401', 'current401']) {
      if (failure === 'old401') env.setSession({ accessToken: 'new', generation: 9 });
      resolve(response({}, typeof failure === 'number' ? failure : 401)); await flush();
      tree = render();
      assert.ok(button(tree, '리뷰 메뉴')); assert.equal(button(tree, '리뷰 메뉴').props.disabled, false);
      assert.equal(nodes(tree).find(node => node.type === 'CommunityComments').props.commentCount, 3);
      assert.ok(env.refresh.mergeCommunityPostChange(detailFixture(), 0));
      if (failure === 'current401') {
        assert.deepEqual(routes, ['/profile/login']); assert.equal(env.clears.at(-1), 9);
        routes.length = 0; env.setSession({ accessToken: 'restored', generation: 10 }); focus();
      } else assert.deepEqual(routes, [], 'failed deletion / stale 401 cannot pop or redirect');
      const retry = confirm().find(action => action.style === 'destructive').onPress;
      retry(); retry(); await flush();
    }
    assert.equal(env.calls.length, 6);
    resolve(response({}, 204)); await flush(); tree = render();
    assert.deepEqual(routes, ['back']); assert.equal(stack.routes.at(-1).key, previous.key);
    assert.equal(nodes(tree).some(node => node.type === 'CommunityComments'), false);
    assert.equal(env.revisions, 0); state.cleanup();
  }
});
