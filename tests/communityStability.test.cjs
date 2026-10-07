const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in mocks)) throw new Error(`Missing mock ${name} in ${file}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const response = (body, status = 200) => ({ ok: status < 400, status,
  json: async () => body, text: async () => JSON.stringify(body) });
const row = { type: 'POST', id: 1, category: 'FREE', content: 'post',
  author: { id: 1, nickname: 'author', avatarUrl: null }, images: [], imageIds: [],
  createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
  liked: false, likeCount: 0, commentCount: 3, viewCount: 1, isOwner: true };

function setup(t) {
  const originalFetch = global.fetch, originalDev = global.__DEV__;
  global.__DEV__ = false;
  t.after(() => { global.fetch = originalFetch; global.__DEV__ = originalDev; });
  const sync = load('src/lib/communityFeedRefresh.ts');
  const storage = new Map([['accessToken', 'A'], ['refreshToken', 'refresh-A']]);
  const deleted = [], requests = [];
  let deleteGate, readGate;
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': {
      isAvailableAsync: async () => true,
      getItemAsync: async key => {
        const value = storage.get(key) ?? null, gate = readGate; readGate = undefined;
        if (gate) await gate;
        return value;
      },
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => { deleted.push(key); if (deleteGate) await deleteGate; storage.delete(key); },
    },
    '../constants/api': { API_BASE_URL: 'https://api.test' },
    './favoriteCache': { clearFavoriteCache() {} }, './communityFeedRefresh': sync,
  });
  const diagnostics = load('src/lib/communityDiagnostics.ts');
  const api = load('src/lib/community.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' },
    './auth': auth, './communityFeedRefresh': sync, './communityDiagnostics': diagnostics });
  const likes = load('src/lib/communityLikes.ts', { './auth': auth, './community': api, './communityFeedRefresh': sync });
  const images = load('src/lib/communityImages.ts', { 'expo-image-picker': {}, 'expo-image-manipulator': {},
    './community': api, './communityDiagnostics': diagnostics });
  global.fetch = (url, options) => { const gate = deferred(); requests.push({ url, options, ...gate }); return gate.promise; };
  return { sync, auth, api, likes, images, diagnostics, storage, deleted, requests,
    blockNextRead(promise) { readGate = promise; },
    blockDeletes(promise) { deleteGate = promise; } };
}
const read = (env, kind, signal = new AbortController().signal) => kind === 'feed'
  ? env.api.getCommunityFeed('ALL', 'LATEST', null, signal)
  : env.api.getCommunityPost(1, signal);
const answer = (request, kind, item) => request.resolve(response(kind === 'feed' ? { items: [item], nextCursor: 'cursor' } : item));
const itemOf = (value, kind) => kind === 'feed' ? value.items[0] : value;

for (const [first, second] of [['feed', 'detail'], ['detail', 'feed']]) {
  test(`${first} A -> mutations -> ${second} B -> B completes -> A preserves latest like/count`, async t => {
    const env = setup(t);
    const a = read(env, first); await flush();
    env.sync.publishCommunityLike(1, { liked: true, likeCount: 1 });
    env.sync.publishCommunityCommentCount(1, 4);
    const b = read(env, second); await flush();
    const latest = { ...row, liked: true, likeCount: 2, commentCount: 5 };
    answer(env.requests[1], second, latest); await b;
    answer(env.requests[0], first, row);
    const result = itemOf(await a, first);
    assert.equal(result.liked, true); assert.equal(result.likeCount, 2); assert.equal(result.commentCount, 5);
    // Once the older reader is gone, acknowledged protection is collected.
    assert.deepEqual(env.sync.mergeCommunityLike(row, -1), row);
    assert.deepEqual(env.sync.mergeCommunityCommentCount(row, -1), row);
    const c = read(env, first); await flush(); answer(env.requests[2], first, { ...row, likeCount: 9, commentCount: 8 });
    assert.equal(itemOf(await c, first).commentCount, 8);
    assert.equal(env.sync.communityFeedRevision(), 0);
  });
}

test('A -> mutation -> A completes -> later B uses authoritative server values', async t => {
  const env = setup(t), a = read(env, 'feed'); await flush();
  env.sync.publishCommunityLike(1, { liked: true, likeCount: 1 }); env.sync.publishCommunityCommentCount(1, 4);
  answer(env.requests[0], 'feed', row);
  const first = (await a).items[0]; assert.equal(first.liked, true); assert.equal(first.commentCount, 4);
  const b = read(env, 'detail'); await flush(); answer(env.requests[1], 'detail', { ...row, commentCount: 7 });
  const latest = await b; assert.equal(latest.liked, false); assert.equal(latest.commentCount, 7);
});

test('optimistic rollback remains protected across overlapping real GETs', async t => {
  const env = setup(t), updates = [];
  env.sync.subscribeCommunityLikes((id, state) => updates.push(state));
  const a = read(env, 'feed'); await flush();
  let failures = 0;
  const mutation = env.likes.changeCommunityLike(row, () => assert.fail('unexpected login'), () => failures++);
  await flush(); assert.equal(updates.at(-1).liked, true);
  const b = read(env, 'detail'); await flush();
  answer(env.requests[2], 'detail', row); assert.equal((await b).liked, true);
  env.requests[1].reject(new Error('offline')); await mutation;
  answer(env.requests[0], 'feed', { ...row, liked: true, likeCount: 1 });
  assert.equal((await a).items[0].liked, false); assert.equal(failures, 1);
  assert.deepEqual(updates.at(-1), { liked: false, likeCount: 0 });
});

test('edit patch and delete tombstone still protect overlapping reads without revision changes', async t => {
  const env = setup(t), a = read(env, 'feed'); await flush();
  env.sync.publishCommunityPostChange(1, { content: 'edited', images: [], updatedAt: row.updatedAt });
  const b = read(env, 'detail'); await flush(); answer(env.requests[1], 'detail', { ...row, content: 'edited' }); await b;
  answer(env.requests[0], 'feed', row); assert.equal((await a).items[0].content, 'edited');
  const c = read(env, 'feed'); await flush(); env.sync.publishCommunityPostChange(1, null);
  answer(env.requests[2], 'feed', row); assert.deepEqual((await c).items, []);
  const d = read(env, 'detail'); await flush(); answer(env.requests[3], 'detail', row);
  await assert.rejects(d, error => error.status === 404);
  assert.equal(env.sync.communityFeedRevision(), 0);
});

test('aborted reads release protection, ignore late bodies, and unused settled records are bounded', async t => {
  const env = setup(t), controller = new AbortController();
  const a = read(env, 'feed', controller.signal); await flush();
  env.sync.publishCommunityLike(1, { liked: true, likeCount: 1 }); env.sync.publishCommunityCommentCount(1, 4);
  const b = read(env, 'detail'); await flush(); answer(env.requests[1], 'detail', { ...row, liked: true, likeCount: 1, commentCount: 4 }); await b;
  controller.abort();
  assert.deepEqual(env.sync.mergeCommunityLike(row, -1), row);
  assert.deepEqual(env.sync.mergeCommunityCommentCount(row, -1), row);
  answer(env.requests[0], 'feed', row); await assert.rejects(a, /aborted/);
  const protectedRead = env.sync.beginCommunityRead(new AbortController().signal);
  for (let id = 1; id <= 600; id++) {
    env.sync.publishCommunityLike(id, { liked: true, likeCount: 1 }); env.sync.publishCommunityCommentCount(id, 4);
  }
  assert.equal(env.sync.mergeCommunityLike(row, protectedRead.version).liked, true, 'active old reads defeat idle eviction');
  assert.equal(env.sync.mergeCommunityCommentCount(row, protectedRead.version).commentCount, 4);
  protectedRead.finish();
  assert.deepEqual(env.sync.mergeCommunityLike(row, -1), row, 'old unused record was evicted');
  assert.deepEqual(env.sync.mergeCommunityCommentCount(row, -1), row);
  assert.equal(env.sync.mergeCommunityLike({ ...row, id: 600 }, -1).liked, true);
});

test('failed GET releases its protection even without a subsequent successful response', async t => {
  const env = setup(t), a = read(env, 'feed'); await flush();
  env.sync.publishCommunityLike(1, { liked: true, likeCount: 1 }); env.sync.publishCommunityCommentCount(1, 4);
  const b = read(env, 'detail'); await flush(); answer(env.requests[1], 'detail', { ...row, liked: true, likeCount: 1, commentCount: 4 }); await b;
  env.requests[0].reject(new Error('offline')); await assert.rejects(a);
  assert.deepEqual(env.sync.mergeCommunityLike(row, -1), row);
  assert.deepEqual(env.sync.mergeCommunityCommentCount(row, -1), row);
});

test('old token A late 401 cannot clear token B; public retry uses current B', async t => {
  const env = setup(t), request = env.api.publicCommunityRequest('feed', new AbortController().signal);
  await flush(); assert.equal(env.requests[0].options.headers.Authorization, 'Bearer A');
  await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  env.requests[0].resolve(response({}, 401)); await flush();
  assert.equal(env.requests[1].options.headers.Authorization, 'Bearer B');
  env.requests[1].resolve(response({})); await request;
  assert.equal(await env.auth.getSavedAccessToken(), 'B'); assert.deepEqual(env.deleted, []);
});

test('current-session concurrent 401s invalidate once and retry as anonymous', async t => {
  const env = setup(t); await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  env.auth.setAuthUser({ email: 'b@example.test', nickname: 'B' });
  let notifications = 0; env.auth.subscribeAuthUser(() => notifications++);
  const a = env.api.publicCommunityRequest('feed', new AbortController().signal);
  const b = env.api.publicCommunityRequest('posts/1', new AbortController().signal); await flush();
  env.requests[0].resolve(response({}, 401)); env.requests[1].resolve(response({}, 401)); await flush();
  assert.equal(env.requests.length, 4);
  for (const retry of env.requests.slice(2)) { assert.equal(retry.options.headers, undefined); retry.resolve(response({})); }
  await Promise.all([a, b]);
  assert.equal(await env.auth.getSavedAccessToken(), null); assert.equal(env.auth.getAuthUser(), null);
  assert.equal(notifications, 1); assert.deepEqual(env.deleted.sort(), ['accessToken', 'refreshToken']);
});

test('login arriving during SecureStore deletion survives; stale invalidation does not notify new user', async t => {
  const env = setup(t), gate = deferred(); env.blockDeletes(gate.promise);
  const session = await env.auth.getAuthSession();
  let notifications = 0; env.auth.subscribeAuthUser(() => notifications++);
  const clearing = env.auth.clearTokens(session.generation); await flush();
  const saving = env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  gate.resolve(); assert.equal(await clearing, false); await saving;
  assert.equal(await env.auth.getSavedAccessToken(), 'B'); assert.equal(env.storage.get('refreshToken'), 'refresh-B');
  assert.equal(notifications, 0);
});

test('same token string saved again is a new session; authenticated and anonymous public reads remain normal', async t => {
  const env = setup(t), old = await env.auth.getAuthSession();
  await env.auth.saveTokens({ accessToken: 'A', refreshToken: 'new-refresh' });
  assert.equal(await env.auth.clearTokens(old.generation), false);
  const a = env.api.publicCommunityRequest('feed', new AbortController().signal); await flush();
  assert.equal(env.requests[0].options.headers.Authorization, 'Bearer A'); env.requests[0].resolve(response({})); await a;
  await env.auth.clearTokens();
  const b = env.api.publicCommunityRequest('feed', new AbortController().signal); await flush();
  assert.equal(env.requests[1].options.headers, undefined); env.requests[1].resolve(response({})); await b;
  assert.equal(env.requests.length, 2);
});

const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
function writeScreen(env, editing = false) {
  const state = [], refs = [], effects = []; let i = 0, r = 0, e = 0, beforeRemove;
  const router = { routes: [], backCalls: 0, push(path) { this.routes.push(path); }, back() { this.backCalls++; }, canGoBack: () => true };
  const react = {
    useState(initial) { const index = i++; if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef(initial) { return refs[r++] ??= { current: initial }; },
    useEffect(fn, deps) { const index = e++, previous = effects[index];
      if (previous && deps.every((v, j) => v === previous.deps[j])) return;
      previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; },
  };
  const navigation = { addListener(_, fn) { beforeRemove = fn; return () => {}; } };
  const native = Object.fromEntries(['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value }; native.Platform = { OS: 'ios' };
  const jsx = (type, props) => ({ type, props });
  const Screen = load('src/app/community/write.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'expo-router': { useRouter: () => router, useNavigation: () => navigation, useLocalSearchParams: () => editing ? { editId: '1' } : {} },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', ImagePlus: 'ImagePlus', X: 'X' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../../lib/community': env.api, '../../lib/communityFeedRefresh': env.sync, '../../lib/auth': env.auth,
    '../../lib/communityDiagnostics': env.diagnostics,
    '../../lib/communityImages': { ...env.images, selectPostImages: async (_, observer) => {
      const image = { uri: 'file://draft.webp', width: 100, height: 100, mimeType: 'image/webp' };
      observer.onSelected([image]); observer.onConverted(0, image);
    } },
    '../../locales': { t: key => key }, '../../theme/communityColors': { communityColors: {} },
    '../../theme/tokens': { spacing: {}, radius: {}, typography: {} },
  }).default;
  const render = () => { i = r = e = 0; return Screen(); };
  return { render, router,
    button(label) { return nodes(render()).find(n => n.props?.accessibilityLabel === label); },
    input() { return nodes(render()).find(n => n.type === 'TextInput'); },
    blocked() { let blocked = false; beforeRemove({ preventDefault() { blocked = true; } }); return blocked; },
  };
}

function uploadNetwork(env, commit, cleanup = () => response({}, 401)) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith('file:')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    if (options.method === 'PUT') return response({});
    if (url.endsWith('/posts/1/edit')) return response(row);
    if (url.endsWith('/post-image-uploads')) {
      if (options.method === 'DELETE') return cleanup();
      return response({ uploadToken: 'same-upload', images: [{ imageKey: 'key.webp', uploadUrl: 'https://s3.test/put', contentType: 'image/webp', sortOrder: 0 }] });
    }
    if (url.endsWith('/posts') || url.endsWith('/posts/1')) return commit(options);
    throw new Error(`Unexpected request ${url}`);
  };
  return calls;
}

test('image create final 401 releases form/back, retains draft, invalidates session and opens login; retry can succeed', async t => {
  const env = setup(t); let rejected = true;
  const calls = uploadNetwork(env, () => rejected ? response({}, 401) : response({ id: 8 }, 201));
  const screen = writeScreen(env); screen.input().props.onChangeText('keep draft');
  screen.button('community.attachImage').props.onPress(); await flush();
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.input().props.value, 'keep draft'); assert.equal(screen.input().props.editable, true);
  assert.equal(nodes(screen.render()).filter(n => n.type === 'Image').length, 1);
  assert.equal(screen.blocked(), false); assert.equal(screen.button('community.writeBack').props.disabled, false);
  assert.deepEqual(screen.router.routes, ['/profile/login']); assert.equal(await env.auth.getSavedAccessToken(), null);
  assert.equal(env.sync.communityFeedRevision(), 0);
  rejected = false; await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.router.backCalls, 1); assert.equal(env.sync.communityFeedRevision(), 1);
  assert.equal(calls.filter(c => c.options?.method === 'PUT').length, 2, 'definitely rejected attempt can upload anew');
});

test('unknown commit -> retry 401 permits authentication/exit without deleting or replacing original upload token', async t => {
  const env = setup(t); let tries = 0;
  const calls = uploadNetwork(env, () => { if (++tries === 1) throw new Error('lost response');
    return tries === 2 ? response({}, 401) : response({ id: 8 }, 201); });
  const screen = writeScreen(env); screen.input().props.onChangeText('immutable draft');
  screen.button('community.attachImage').props.onPress(); await flush();
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.blocked(), true); assert.equal(screen.input().props.editable, false);
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.blocked(), false); assert.equal(screen.button('community.writeBack').props.disabled, false);
  assert.equal(screen.input().props.value, 'immutable draft'); assert.deepEqual(screen.router.routes, ['/profile/login']);
  assert.equal(calls.some(c => c.options?.method === 'DELETE'), false);
  await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  screen.button('community.register').props.onPress(); await flush();
  const bodies = calls.filter(c => c.url.endsWith('/posts')).map(c => JSON.parse(c.options.body));
  assert.equal(calls.filter(c => c.options?.method === 'PUT').length, 1);
  assert.deepEqual(bodies, Array(3).fill({ category: 'QUESTION', content: 'immutable draft', uploadToken: 'same-upload' }));
  assert.equal(screen.router.backCalls, 1); assert.equal(env.sync.communityFeedRevision(), 1);
});

test('late image POST 401 after new login releases draft but cannot clear new credentials or redirect them', async t => {
  const env = setup(t), gate = deferred(); uploadNetwork(env, () => gate.promise);
  const screen = writeScreen(env); screen.input().props.onChangeText('keep draft');
  screen.button('community.attachImage').props.onPress(); await flush();
  screen.button('community.register').props.onPress(); await flush();
  await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  gate.resolve(response({}, 401)); await flush();
  assert.equal(await env.auth.getSavedAccessToken(), 'B'); assert.deepEqual(screen.router.routes, []);
  assert.equal(screen.input().props.value, 'keep draft'); assert.equal(screen.input().props.editable, true);
  assert.equal(screen.blocked(), false); assert.equal(env.sync.communityFeedRevision(), 0);
});

test('401 draft recovery never waits for a stalled best-effort image cleanup', async t => {
  const env = setup(t), cleanup = deferred(); uploadNetwork(env, () => response({}, 401), () => cleanup.promise);
  const screen = writeScreen(env); screen.input().props.onChangeText('keep draft');
  screen.button('community.attachImage').props.onPress(); await flush();
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.blocked(), false); assert.equal(screen.input().props.editable, true);
  assert.deepEqual(screen.router.routes, ['/profile/login']);
  cleanup.resolve(response({}, 401)); await flush();
});

test('session snapshot retries if login changes while SecureStore read is pending', async t => {
  const env = setup(t), gate = deferred(); env.blockNextRead(gate.promise);
  const reading = env.auth.getAuthSession(); await flush();
  await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  gate.resolve(); const session = await reading;
  assert.equal(session.accessToken, 'B');
  assert.equal(await env.auth.clearTokens(session.generation), true);
  assert.equal(await env.auth.getSavedAccessToken(), null);
});

test('late comments GET cannot publish a pre-mutation count after a newer detail read', async t => {
  const env = setup(t);
  const comments = load('src/lib/communityComments.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' },
    './community': env.api, './communityDiagnostics': env.diagnostics, './communityFeedRefresh': env.sync });
  const a = comments.getCommunityComments(1, new AbortController().signal); await flush();
  env.sync.publishCommunityCommentCount(1, 4);
  const b = read(env, 'detail'); await flush(); answer(env.requests[1], 'detail', { ...row, commentCount: 4 }); await b;
  env.requests[0].resolve(response({ items: [], commentCount: 3 }));
  assert.equal((await a).commentCount, 4);
});

test('image-free creation 401 preserves editable draft and opens login without invalidating feed', async t => {
  const env = setup(t); uploadNetwork(env, () => response({}, 401));
  const screen = writeScreen(env); screen.input().props.onChangeText('text only');
  screen.button('community.register').props.onPress(); await flush();
  assert.equal(screen.input().props.value, 'text only'); assert.equal(screen.input().props.editable, true);
  assert.equal(screen.blocked(), false); assert.deepEqual(screen.router.routes, ['/profile/login']);
  assert.equal(env.sync.communityFeedRevision(), 0);
});

for (const unknownFirst of [false, true]) {
  test(`image edit 401 preserves draft and exit; earlier unknown outcome=${unknownFirst}`, async t => {
    const env = setup(t); let tries = 0;
    const calls = uploadNetwork(env, () => {
      tries++;
      if (unknownFirst && tries === 1) throw new Error('lost PATCH response');
      return tries === (unknownFirst ? 2 : 1) ? response({}, 401) : response({ ...row, content: 'edited' });
    });
    const screen = writeScreen(env, true); screen.render(); await flush();
    screen.input().props.onChangeText('edited'); screen.button('community.attachImage').props.onPress(); await flush();
    screen.button('community.edit.save').props.onPress(); await flush();
    if (unknownFirst) { assert.equal(screen.blocked(), true); screen.button('community.edit.save').props.onPress(); await flush(); }
    assert.equal(screen.input().props.value, 'edited'); assert.equal(screen.blocked(), false);
    assert.equal(screen.button('community.writeBack').props.disabled, false);
    assert.equal(screen.input().props.editable, !unknownFirst);
    assert.deepEqual(screen.router.routes, ['/profile/login']);
    await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
    screen.button('community.edit.save').props.onPress(); await flush();
    assert.equal(screen.router.backCalls, 1); assert.equal(env.sync.communityFeedRevision(), 0);
    if (unknownFirst) {
      assert.equal(calls.filter(c => c.options?.method === 'PUT').length, 1);
      assert.equal(calls.some(c => c.options?.method === 'DELETE'), false);
    }
  });
}

for (const operation of ['list', 'POST', 'DELETE']) {
  test(`shared favorite ${operation} unauthorized error carries old session; new login survives`, async t => {
    const env = setup(t);
    const favorites = load('src/lib/favorites.ts', { '../constants/api': { API_BASE_URL: 'https://api.test' },
      './auth': env.auth, './favoriteCache': load('src/lib/favoriteCache.ts') });
    const result = (operation === 'list' ? favorites.getFavoritePopups()
      : operation === 'POST' ? favorites.favoritePopup('p1') : favorites.unfavoritePopup('p1')).catch(error => error);
    await flush(); await env.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
    env.requests[0].resolve(response({}, 401)); const error = await result;
    assert.ok(error instanceof favorites.FavoriteUnauthorizedError);
    assert.equal(await env.auth.clearTokens(error.authGeneration), false);
    assert.equal(await env.auth.getSavedAccessToken(), 'B');
  });
}
