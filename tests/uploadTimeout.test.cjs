const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const limits = { local: 15_000, presign: 30_000, put: 120_000, commit: 60_000, cleanup: 10_000 };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const image = { uri: 'file:fixture.webp', width: 100, height: 100, mimeType: 'image/webp' };
const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null },
  text: async () => JSON.stringify(body), json: async () => body, arrayBuffer: async () => new Uint8Array([1, 2]).buffer });

function setup(kind, heldStage, realAuth = false) {
  const gate = deferred(), cleanupGate = deferred(), authGate = deferred(), logoutGate = deferred(), commitGates = [], calls = [], activeTimers = new Set(), cache = new Map();
  let commitAuthRead = 0, authReads = 0;
  let hold = heldStage, serial = 0, errorStatus = 403, cleanupPending = false, cleanupMode, putFails = false, commitStatus;
  const putError = new Error('fixture PUT failure'), cleanupError = new Error('fixture cleanup offline'), logs = [];
  const abortError = new Error('fixture native abort'); abortError.name = 'AbortError';
  const diagnostics = { logCommunityError: (stage, details, error) => logs.push({ stage, details, error }), describeS3Put: () => ({}),
    readCommunityErrorBody: r => r.text(), readS3PutError: async r => ({ responseBody: await r.text() }) };
  const overrides = {
    'src/constants/api.ts': { API_BASE_URL: 'https://fixture-api' },
    'src/lib/auth.ts': { getAuthSession: async () => {
      if (++authReads === commitAuthRead) await authGate.promise;
      return { accessToken: 'fixture-auth', generation: 3 };
    }, clearTokens: async () => false, authSessionGeneration: () => 3,
      getAuthUser: () => ({ id: 1, email: 'A@fixture.test', nickname: 'Fixture A' }), getAuthStatus: () => 'authenticated',
      isAuthSessionCurrent: generation => generation === 3, subscribeAuthSession: () => () => {}, subscribeAuthSessionInvalidation: () => () => {} },
    'src/lib/moderationState.ts': { captureModerationRead: () => ({}), assertModerationRead() {} },
    'src/lib/communityFeedRefresh.ts': { markCommunityFeedChanged() {} },
    'src/lib/communityDiagnostics.ts': diagnostics,
  };
  const storage = new Map([['accessToken', 'fixture-A'], ['refreshToken', 'fixture-refresh-A']]);
  if (realAuth) {
    delete overrides['src/lib/auth.ts'];
    overrides['expo-secure-store'] = {
      isAvailableAsync: async () => true,
      getItemAsync: async key => {
        const value = storage.get(key) ?? null;
        if ((key === 'session.v1' && value !== null)
          || (key === 'accessToken' && !storage.has('session.v1') && value !== null)) {
          if (++authReads === commitAuthRead) await authGate.promise;
        }
        return value;
      },
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => { storage.delete(key); },
    };
    overrides['src/lib/favoriteCache.ts'] = { clearFavoriteCache() {} };
    overrides['src/lib/communityFeedRefresh.ts'] = { markCommunityFeedChanged() {}, clearCommunityLikes() {} };
  }
  const fetch = async (url, init = {}) => {
    const phase = url.endsWith('/auth/logout') ? 'logout' : url.startsWith('file:') ? 'local' : init.method === 'PUT' ? 'put'
      : init.method === 'DELETE' ? 'cleanup' : url.endsWith('image-uploads') ? 'presign' : 'commit';
    calls.push({ phase, signal: init.signal, body: init.body, method: init.method, authorization: init.headers?.Authorization });
    if (phase === 'logout') return logoutGate.promise;
    if (phase === 'commit' && commitGates.length) return commitGates.shift().promise;
    if (phase === 'cleanup' && cleanupPending) return cleanupGate.promise;
    if (phase === 'cleanup' && cleanupMode === 'network') throw cleanupError;
    if (phase === 'cleanup' && cleanupMode === 'abort') throw abortError;
    if (phase === 'cleanup' && typeof cleanupMode === 'number') return response({ message: 'fixture cleanup rejection' }, cleanupMode);
    if (phase === 'put' && putFails) throw putError;
    if (phase === 'commit' && commitStatus) return response({ message: 'fixture commit rejection' }, commitStatus);
    if (hold === phase) return gate.promise;
    const body = phase === 'presign' ? { uploadToken: `fixture-batch-${++serial}`, images: Array.from({ length: JSON.parse(init.body).count }, (_, i) => ({ imageKey: `fixture-${i}.webp`,
      uploadUrl: `https://fixture-s3/put-${i}`, contentType: 'image/webp', sortOrder: i })) } : { id: 7 };
    const result = response(body);
    if (hold === phase + '-body') {
      if (phase === 'local') result.arrayBuffer = () => gate.promise;
      else { result.text = () => gate.promise; result.json = () => gate.promise; }
    }
    if (hold === phase + '-error-body') {
      result.ok = false; result.status = errorStatus; result.text = () => gate.promise;
    }
    return result;
  };
  function load(file) {
    if (file === 'src/lib/deviceId.ts') return { getDeviceId: async () => 'device' };
    if (file in overrides) return file === 'src/lib/auth.ts'
      ? require('./helpers/authRequestMock.cjs').authRequestMock(overrides[file], fetch) : overrides[file];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', '__DEV__', code)(name => {
      if (name in overrides) return overrides[name];
      if (name.startsWith('expo-image-')) return {};
      if (!name.startsWith('.')) throw new Error('Unexpected dependency: ' + name);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      return load(target + '.ts');
    }, module, module.exports, fetch, (fn, ms) => {
      const timer = setTimeout(() => { activeTimers.delete(timer); fn(); }, ms); activeTimers.add(timer); return timer;
    }, timer => { activeTimers.delete(timer); clearTimeout(timer); }, false);
    return module.exports;
  }
  const auth = load('src/lib/auth.ts');
  if (realAuth) auth.setAuthUser({ id: 1, email: 'A@fixture.test', nickname: 'Fixture A' });
  const posts = load('src/lib/community.ts'), images = load('src/lib/communityImages.ts'), reviews = load('src/lib/reviews.ts');
  const attempt = { current: null };
  const publish = (content = 'original', signal) => kind === 'post' ? images.publishPostWithImages('QUESTION', content, [image], attempt, signal)
    : reviews.publishReviewWithImages('popup', 5, content, [image], attempt, signal);
  return { calls, gate, cleanupGate, logoutGate, activeTimers, attempt, publish, posts, reviews, images, load, putError, logs, auth, storage,
    async switchAccount(account = 'B', publishUser = true) {
      await auth.saveTokens({ accessToken: `fixture-${account}`, refreshToken: `fixture-refresh-${account}` });
      if (publishUser) auth.setAuthUser({ id: account === 'A' ? 1 : 2, email: `${account}@fixture.test`, nickname: `Fixture ${account}` });
    },
    release() { hold = null; gate.resolve(response({ id: 99 })); }, setHold(value) { hold = value; },
    setErrorStatus(value) { errorStatus = value; }, holdCleanup() { cleanupPending = true; },
    failPut() { putFails = true; }, setCommitStatus(value) { commitStatus = value; }, setCleanupMode(value) { cleanupMode = value; },
    holdCommitAuth(hasUpload = true) { commitAuthRead = hasUpload ? 2 : 1; }, releaseAuth() { authGate.resolve(); },
    queueCommit(gate) { commitGates.push(gate); },
    resetFailures() { putFails = false; commitStatus = undefined; cleanupPending = false; cleanupMode = undefined; hold = null; } };
}

function mountWriter(env, kind, editing = false) {
  const slots = [], effects = new Map(), effectSetups = new Map(); let cursor = 0, backCalls = 0, unmounted = false, lateSetters = 0, alerts = 0, setterCalls = 0;
  const react = {
    useState(initial) { const key = cursor++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { setterCalls++; if (unmounted) lateSetters++; slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
    useRef(initial) { const key = cursor++; return slots[key] ??= { current: initial }; },
    useEffect(effect) { const key = cursor++; if (!effects.has(key)) { effectSetups.set(key, effect); effects.set(key, effect()); } },
  };
  const native = Object.fromEntries(['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView',
    'Text', 'TextInput', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value }; native.Platform = { OS: 'ios' }; native.Alert = { alert() { alerts++; } };
  const file = `src/app/${kind === 'post' ? 'community' : 'reviews'}/write.tsx`;
  const jsx = (type, props) => ({ type, props });
  const mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'expo-router': { useLocalSearchParams: () => ({ ...(kind === 'review' ? { publicId: 'popup' } : {}), ...(editing ? { editId: '7' } : {}) }),
      useRouter: () => ({ canGoBack: () => true, back() { backCalls++; }, replace() { backCalls++; }, push() { backCalls++; } }),
      useNavigation: () => ({ dispatch() {}, getState: () => ({ index: 0, routes: [{ key: 'fixture-write', name: `${kind === 'post' ? 'community' : 'reviews'}/write` }] }) }) },
    'expo-router/react-navigation': { usePreventRemove() {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', ImagePlus: 'ImagePlus', X: 'X', Star: 'Star' },
    '../../locales': { t: key => key },
    '../../lib/auth': env.auth,
    '../../lib/requestTimeout': env.load('src/lib/requestTimeout.ts'),
    '../../lib/submissionSession': env.load('src/lib/submissionSession.ts'),
    '../../lib/community': { ...env.posts, getCommunityPostForEdit: async () => ({ id: 7, content: 'original', category: 'QUESTION', imageIds: [], images: [] }) },
    '../../lib/communityImages': { ...env.images,
      publishPostWithImages(...args) { env.screenAttempt = args[3]; return env.images.publishPostWithImages(...args); },
      updatePostWithImages(...args) { env.screenAttempt = args[4]; return env.images.updatePostWithImages(...args); },
      selectPostImages: async (current, observer) => {
      const added = env.selectedImages ?? [image];
      observer?.onSelected(added); added.forEach((item, index) => observer?.onConverted(index, item)); return [...current, ...added];
    } },
    '../../lib/reviews': { ...env.reviews, reviewsCreated() { env.feedChanges = (env.feedChanges ?? 0) + 1; },
      getReviewDetail: async () => ({ id: 7, rating: 5, content: 'original', images: [], popup: { publicId: 'popup', title: 'Fixture popup' } }),
      publishReviewWithImages(...args) { env.screenAttempt = args[4]; return env.reviews.publishReviewWithImages(...args); },
      updateReviewWithImages(...args) { env.screenAttempt = args[6]; return env.reviews.updateReviewWithImages(...args); } },
    '../../lib/popups': { getPopupDetail: async () => ({ name: 'Fixture popup' }) },
    '../../lib/communityDiagnostics': { logCommunityError() {} },
    '../../lib/communityFeedRefresh': { markCommunityFeedChanged() { env.feedChanges = (env.feedChanges ?? 0) + 1; } },
  });
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in mocks)) throw new Error('Missing writer mock: ' + name); return mocks[name];
  }, module, module.exports);
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
    : [tree, ...nodes(tree.props?.children)];
  return { render() { cursor = 0; return nodes(module.exports.default()); },
    unmount() { unmounted = true; for (const cleanup of effects.values()) cleanup?.(); },
    restartEffects() { unmounted = false; for (const [key, effect] of effectSetups) effects.set(key, effect()); },
    get setterCalls() { return setterCalls; },
    get lateSetters() { return lateSetters; }, get alerts() { return alerts; }, get backCalls() { return backCalls; } };
}

async function startWriter(env, kind, withImage = true, editing = false) {
  const screen = mountWriter(env, kind, editing); screen.render(); await flush(); let nodes = screen.render();
  nodes.find(n => n.type === 'TextInput').props.onChangeText('fixture draft');
  if (kind === 'review') nodes.find(n => n.props?.accessibilityLabel === 'review.write.rating').props.onPress();
  if (withImage) nodes.find(n => n.props?.accessibilityLabel === (kind === 'post' ? 'community.attachImage' : 'review.write.addPhoto')).props.onPress();
  await flush(); nodes = screen.render();
  const submit = nodes.find(n => n.props?.accessibilityLabel === (kind === 'post'
    ? editing ? 'community.edit.save' : 'community.register' : editing ? 'review.write.save' : 'review.write.register'));
  submit.props.onPress(); submit.props.onPress(); await flush(); return screen;
}

for (const kind of ['post', 'review']) {
  test(`${kind} account: earlier-generation response cannot mutate the new explicit same-account retry snapshot`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit', true), screen = await startWriter(env, kind);
    t.mock.timers.tick(limits.commit); await flush(); env.setHold(null);
    const oldReply = deferred(), newReply = deferred(), label = kind === 'post' ? 'community.register' : 'review.write.register';
    env.queueCommit(oldReply); screen.render().find(n => n.props?.accessibilityLabel === label).props.onPress(); await flush();
    const oldSnapshot = env.screenAttempt.current; await env.switchAccount('B'); await env.switchAccount('A');
    env.queueCommit(newReply); screen.render().find(n => n.props?.accessibilityLabel === label).props.onPress(); await flush();
    const newSnapshot = env.screenAttempt.current, setters = screen.setterCalls;
    assert.notEqual(oldSnapshot, newSnapshot); assert.equal(newSnapshot.authRequired, false);
    oldReply.resolve(response({}, 403)); await flush();
    assert.equal(env.screenAttempt.current, newSnapshot); assert.equal(newSnapshot.authRequired, false);
    assert.equal(screen.setterCalls, setters); assert.equal(screen.backCalls, 0);
    newReply.resolve(response({ id: 7 })); await flush(); assert.equal(screen.backCalls, 1);
    assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1); assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    screen.unmount(); env.release(); await flush();
  });
  test(`${kind} account: a token with no verifiable owner is not adopted by the current account`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, undefined, true);
    env.attempt.current = { uploadToken: 'fixture-unowned-token', content: 'original', outcomeUnknown: true,
      ...(kind === 'post' ? { category: 'QUESTION' } : { publicId: 'popup', rating: 5 }) };
    await assert.rejects(env.publish(), error => error.name === 'SubmissionSessionChangedError');
    assert.equal(env.calls.length, 0); assert.equal(env.attempt.current.uploadToken, 'fixture-unowned-token');
  });
  for (const stage of ['presign', 'put', 'auth', 'commit']) test(`${kind} account: edit at ${stage} never commits/cleans up or updates B`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, stage === 'auth' ? undefined : stage, true);
    if (stage === 'auth') env.holdCommitAuth();
    const screen = await startWriter(env, kind, true, true), active = env.calls.at(-1);
    await env.switchAccount(); await flush(); const setters = screen.setterCalls;
    if (stage === 'commit') {
      assert.equal(active.method, 'PATCH'); assert.equal(active.signal.aborted, false);
      t.mock.timers.tick(limits.commit); await flush(); assert.equal(env.screenAttempt.current.outcomeUnknown, true);
    } else {
      env.releaseAuth(); env.gate.resolve(response({ uploadToken: 'fixture-old-grant', images: [{ imageKey: 'old.webp', uploadUrl: 'https://fixture-s3/old', contentType: 'image/webp', sortOrder: 0 }] }));
      await flush(); assert.equal(env.calls.some(c => c.phase === 'commit'), false);
    }
    assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    assert.equal(screen.setterCalls, setters); assert.equal(screen.backCalls, 0); screen.unmount(); env.release(); await flush();
  });
  test(`${kind} account: cleanup checks owner again after pending auth read and never sends B DELETE`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, undefined, true); env.holdCommitAuth(false);
    const owner = env.load('src/lib/submissionSession.ts').captureSubmissionOwner();
    const cleaning = env.images.cancelUpload('fixture-A-grant', kind === 'post' ? env.posts.communityRequest : env.reviews.reviewRequest,
      kind === 'post' ? 'post-image-uploads' : 'popups/popup/review-image-uploads', owner);
    await flush(); await env.switchAccount(); env.releaseAuth(); await cleaning;
    assert.equal(env.calls.length, 0); assert.equal(env.activeTimers.size, 0);
    assert.ok(env.logs.some(log => log.stage === 'CLEANUP'));
  });
  test(`${kind} account: completed submission removes invalidation and session listeners`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put', true); let listeners = 0;
    for (const name of ['subscribeAuthSession', 'subscribeAuthSessionInvalidation']) {
      const original = env.auth[name]; env.auth[name] = listener => {
        listeners++; const stop = original(listener); return () => { listeners--; stop(); };
      };
    }
    const screen = await startWriter(env, kind); assert.equal(listeners, 2);
    await env.switchAccount(); await flush(); assert.equal(listeners, 0); screen.unmount(); env.release(); await flush();
  });
  test(`${kind} account: multiple images stop before next PUT when saveTokens starts, before /me publishes B`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put', true);
    env.selectedImages = [image, { ...image, uri: 'file:second.webp' }]; const screen = await startWriter(env, kind);
    await env.switchAccount('B', false); await flush();
    assert.equal(env.calls.find(c => c.phase === 'put').signal.aborted, true);
    env.release(); await flush();
    assert.equal(env.calls.filter(c => c.phase === 'put').length, 1);
    assert.equal(env.calls.some(c => c.phase === 'commit' || c.phase === 'cleanup'), false);
    const nodes = screen.render(); assert.equal(nodes.some(n => n.type === 'ActivityIndicator'), false);
    assert.equal(nodes.find(n => n.type === 'TextInput').props.value, 'fixture draft'); screen.unmount();
  });
  test(`${kind} account: logout starts cancellation even before its server response; same A login cannot revive work`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put', true), screen = await startWriter(env, kind);
    const generation = env.auth.authSessionGeneration(), loggingOut = env.auth.logout(); await flush();
    assert.equal(env.auth.authSessionGeneration(), generation, 'logout server response has not yet invalidated storage');
    assert.equal(env.calls.find(c => c.phase === 'put').signal.aborted, true);
    env.logoutGate.resolve(response({})); await loggingOut; await env.switchAccount('A'); env.release(); await flush();
    assert.ok(env.auth.authSessionGeneration() > generation);
    assert.equal(env.calls.some(c => c.phase === 'commit' || c.phase === 'cleanup'), false); screen.unmount();
  });
  test(`${kind} account: same-session access token rotation continues with latest credentials`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put', true), screen = await startWriter(env, kind);
    const generation = env.auth.authSessionGeneration(); env.storage.set('accessToken', 'fixture-A-rotated');
    env.auth.setAuthUser({ id: 1, email: 'A@fixture.test', nickname: 'Renamed A' }); env.release(); await flush();
    assert.equal(env.auth.authSessionGeneration(), generation);
    assert.equal(env.calls.find(c => c.phase === 'commit').authorization, 'Bearer fixture-A-rotated');
    assert.equal(screen.backCalls, 1); assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1); screen.unmount();
  });
  test(`${kind} account: B cannot retry A unknown token; explicit same-A reauthentication uses original token without PUT`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit', true), screen = await startWriter(env, kind);
    await env.switchAccount('B'); t.mock.timers.tick(limits.commit); await flush();
    const token = env.screenAttempt.current.uploadToken;
    let nodes = screen.render();
    const label = kind === 'post' ? 'community.register' : 'review.write.register';
    nodes.find(n => n.props?.accessibilityLabel === label).props.onPress(); await flush();
    assert.equal(env.calls.filter(c => c.phase === 'commit').length, 1);
    assert.equal(env.screenAttempt.current.uploadToken, token); assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    await env.switchAccount('A'); env.setHold(null); nodes = screen.render();
    nodes.find(n => n.props?.accessibilityLabel === label).props.onPress(); await flush();
    assert.equal(env.calls.filter(c => c.phase === 'commit').length, 2); assert.equal(screen.backCalls, 1);
    assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1); assert.equal(env.calls.filter(c => c.phase === 'put').length, 1);
    assert.equal(JSON.parse(env.calls.at(-1).body).uploadToken, token); screen.unmount(); env.release(); await flush();
  });
  test(`${kind} account: fresh commit 401 still clears only its own session and opens draft login`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, undefined, true); env.setCommitStatus(401);
    const screen = await startWriter(env, kind);
    assert.equal(env.auth.getAuthUser(), null); assert.equal(screen.backCalls, 1);
    assert.equal(env.calls.some(c => c.phase === 'cleanup' && c.authorization !== 'Bearer fixture-A'), false);
    assert.equal(screen.render().some(n => n.type === 'ActivityIndicator'), false); screen.unmount();
  });
  for (const stage of ['presign', 'put', 'auth']) test(`${kind} account: A to B at ${stage} blocks later requests and wrong-account DELETE`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, stage === 'auth' ? undefined : stage, true);
    if (stage === 'auth') env.holdCommitAuth();
    const screen = await startWriter(env, kind), active = env.calls.at(-1);
    await env.switchAccount(); await flush(); const abortObserved = active.signal.aborted;
    env.releaseAuth();
    if (stage === 'presign') env.gate.resolve(response({ uploadToken: 'fixture-old-grant', images: [{ imageKey: 'old.webp', uploadUrl: 'https://fixture-s3/old', contentType: 'image/webp', sortOrder: 0 }] }));
    else env.release();
    await flush(); t.mock.timers.tick(limits.put + limits.commit); await flush();
    assert.equal(env.calls.some(c => c.phase === 'commit'), false, 'A draft must not register with B credentials');
    if (stage === 'presign') assert.equal(env.calls.some(c => c.phase === 'put'), false);
    if (stage !== 'auth') assert.equal(abortObserved, true);
    assert.equal(env.calls.some(c => c.phase === 'cleanup'), false, 'do not delete A token with B credentials');
    assert.equal(screen.backCalls, 0); assert.equal(env.activeTimers.size, 0); screen.unmount();
  });
  test(`${kind} account: image-free POST is blocked after delayed auth changes to B`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, undefined, true); env.holdCommitAuth(false);
    const screen = await startWriter(env, kind, false); await env.switchAccount(); env.releaseAuth(); await flush();
    assert.equal(env.calls.length, 0); assert.equal(screen.backCalls, 0); screen.unmount();
  });
  for (const outcome of ['success', 'unknown', 'rejection']) test(`${kind} account: already sent A POST ${outcome} cannot mutate B UI/cache or DELETE`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit', true);
    const screen = await startWriter(env, kind), commit = env.calls.at(-1);
    assert.equal(commit.authorization, 'Bearer fixture-A'); await env.switchAccount(); await flush();
    const setters = screen.setterCalls;
    if (outcome === 'unknown') t.mock.timers.tick(limits.commit);
    else env.gate.resolve(response({ id: 99 }, outcome === 'rejection' ? 403 : 200));
    await flush();
    assert.equal(screen.setterCalls, setters, 'A late completion must not update B spinner/error');
    assert.equal(screen.backCalls, 0); assert.equal(env.feedChanges ?? 0, 0);
    assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    if (outcome === 'unknown') assert.equal(env.screenAttempt.current.outcomeUnknown, true);
    screen.unmount(); env.release(); await flush();
  });
}

for (const kind of ['post', 'review']) {
  for (const stage of ['presign', 'put', 'auth', 'commit']) test(`${kind} lifetime: editing unmount at ${stage} uses the same upload/commit boundary`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, stage === 'auth' ? undefined : stage);
    if (stage === 'auth') env.holdCommitAuth();
    const screen = await startWriter(env, kind, true, true), call = env.calls.at(-1);
    screen.unmount(); await flush();
    if (stage === 'commit') {
      assert.equal(call.signal.aborted, false); t.mock.timers.tick(limits.commit); await flush();
      assert.equal(env.screenAttempt.current.outcomeUnknown, true);
      assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    } else {
      if (stage !== 'auth') assert.equal(call.signal.aborted, true);
      env.releaseAuth(); env.release(); await flush();
      assert.equal(env.calls.some(c => c.phase === 'commit'), false);
      assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, stage === 'presign' ? 0 : 1);
    }
    assert.equal(screen.lateSetters, 0); assert.equal(screen.backCalls, 0); assert.equal(env.activeTimers.size, 0);
    env.release(); await flush();
  });
  test(`${kind} lifetime: cancellation while cleanup is pending never duplicates DELETE or aborts its independent deadline`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind); env.failPut(); env.holdCleanup();
    const screen = await startWriter(env, kind), cleanup = env.calls.at(-1);
    assert.equal(cleanup.phase, 'cleanup'); screen.unmount(); await flush();
    assert.equal(cleanup.signal.aborted, false); t.mock.timers.tick(limits.cleanup); await flush();
    assert.equal(cleanup.signal.aborted, true); assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, 1);
    assert.equal(screen.lateSetters, 0); assert.equal(screen.backCalls, 0); assert.equal(env.activeTimers.size, 0);
    env.cleanupGate.resolve(response({})); await flush(); assert.equal(screen.lateSetters, 0);
  });
  test(`${kind} lifetime: unknown retry cancelled before fetch preserves the earlier token`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit'); env.holdCommitAuth();
    // The first commit pauses before fetch. Seed an earlier ambiguous attempt to model rechecking it.
    env.attempt.current = { uploadToken: 'previous-token', content: 'original', outcomeUnknown: true,
      owner: env.load('src/lib/submissionSession.ts').captureSubmissionOwner(),
      ...(kind === 'post' ? { category: 'QUESTION' } : { publicId: 'popup', rating: 5 }) };
    // With no new presign this commit is the first auth read.
    env.holdCommitAuth(false); const controller = new AbortController();
    const pending = env.publish('edited', controller.signal);
    const rejected = assert.rejects(pending, error => error.name === 'RequestCancelledError');
    await flush(); controller.abort(); env.releaseAuth(); await rejected;
    assert.equal(env.calls.length, 0); assert.equal(env.attempt.current.uploadToken, 'previous-token');
    assert.equal(env.attempt.current.outcomeUnknown, true); assert.equal(env.attempt.current.content, 'original');
  });
  test(`${kind} lifetime: cancelled first PUT cannot start a second PUT or commit`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put'), controller = new AbortController();
    const pending = env.images.uploadPostImages([image, { ...image, uri: 'file:second.webp' }],
      kind === 'post' ? env.posts.communityRequest : env.reviews.reviewRequest,
      kind === 'post' ? 'post-image-uploads' : 'popups/popup/review-image-uploads', controller.signal);
    const result = assert.rejects(pending, error => error.name === 'RequestCancelledError');
    await flush(); controller.abort(); await result; env.release(); await flush();
    assert.equal(env.calls.filter(c => c.phase === 'put').length, 1);
    assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, 1);
    assert.equal(env.calls.some(c => c.phase === 'commit'), false); assert.equal(env.activeTimers.size, 0);
  });
  test(`${kind} lifetime: image-free commit also checks unmount after async auth`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind); env.holdCommitAuth(false);
    const screen = await startWriter(env, kind, false); screen.unmount(); env.releaseAuth(); await flush();
    assert.equal(env.calls.length, 0); assert.equal(screen.lateSetters, 0); assert.equal(screen.backCalls, 0);
    assert.equal(env.activeTimers.size, 0);
  });
  test(`${kind} lifetime: cancellation before rechecking an unknown token never deletes or reuploads`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit');
    const first = env.publish().catch(() => {}); await flush(); t.mock.timers.tick(limits.commit); await first;
    const snapshot = { ...env.attempt.current }, controller = new AbortController(); controller.abort();
    await assert.rejects(env.publish('edited', controller.signal), error => error.name === 'RequestCancelledError');
    assert.deepEqual(env.attempt.current, snapshot); assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1);
    assert.equal(env.calls.some(c => c.phase === 'cleanup'), false); env.release(); await flush();
  });
  test(`${kind} lifetime: effect cleanup/setup cannot revive an invalidated submission`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit');
    const screen = await startWriter(env, kind); screen.unmount(); screen.restartEffects(); await flush();
    const setters = screen.setterCalls; env.release(); await flush();
    assert.equal(screen.setterCalls, setters, 'mounted flag alone must not revive old completion');
    assert.equal(screen.backCalls, 0); assert.equal(screen.alerts, 0); screen.unmount();
  });
  for (const stage of ['local', 'presign', 'put']) test(`${kind} lifetime: unmount during ${stage} aborts and prevents later stages/UI`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const env = setup(kind, stage), screen = await startWriter(env, kind), call = env.calls.at(-1);
    assert.equal(call.phase, stage); screen.unmount(); await flush();
    const aborted = call.signal.aborted;
    env.release(); await flush();
    // Also settle the old implementation so the failing reproduction leaves no real timers.
    t.mock.timers.tick(limits.put + limits.presign + limits.commit); await flush();
    assert.equal(aborted, true, 'unmount must abort the active upload request');
    assert.equal(env.calls.some(c => c.phase === 'commit'), false);
    if (stage === 'presign') assert.equal(env.calls.some(c => c.phase === 'put'), false);
    assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, stage === 'put' ? 1 : 0);
    assert.equal(screen.lateSetters, 0); assert.equal(screen.alerts, 0); assert.equal(screen.backCalls, 0);
    assert.equal(env.activeTimers.size, 0);
  });
  test(`${kind} lifetime: unmount after upload but before authenticated commit fetch prevents POST`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind); env.holdCommitAuth();
    const screen = await startWriter(env, kind);
    assert.deepEqual(env.calls.map(c => c.phase), ['local', 'presign', 'put']);
    screen.unmount(); env.releaseAuth(); await flush();
    assert.equal(env.calls.some(c => c.phase === 'commit'), false);
    assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, 1);
    assert.equal(env.screenAttempt.current, null); assert.equal(screen.lateSetters, 0);
    assert.equal(screen.backCalls, 0); assert.equal(env.activeTimers.size, 0);
  });
  for (const outcome of ['success', 'unknown', 'rejected']) test(`${kind} lifetime: already sent POST ${outcome} retains commit policy without stale UI`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit');
    const screen = await startWriter(env, kind), commit = env.calls.at(-1);
    assert.equal(commit.phase, 'commit'); const token = env.screenAttempt.current.uploadToken;
    screen.unmount(); await flush(); assert.equal(commit.signal.aborted, false, 'unmount must not cancel a possibly saved commit');
    if (outcome === 'unknown') t.mock.timers.tick(limits.commit);
    else if (outcome === 'rejected') env.gate.resolve(response({ message: 'denied' }, 403));
    else env.release();
    await flush();
    assert.equal(screen.lateSetters, 0); assert.equal(screen.backCalls, 0); assert.equal(screen.alerts, 0);
    assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, outcome === 'rejected' ? 1 : 0);
    if (outcome === 'unknown') {
      assert.equal(env.screenAttempt.current.uploadToken, token); assert.equal(env.screenAttempt.current.outcomeUnknown, true);
      assert.equal(env.screenAttempt.current.content, 'fixture draft'); env.release(); await flush();
      assert.equal(env.screenAttempt.current.uploadToken, token);
    } else assert.equal(env.screenAttempt.current, null);
    assert.equal(env.activeTimers.size, 0);
  });
}

for (const kind of ['post', 'review']) {
  for (const [stage, timeout] of [['local', limits.local], ['presign', limits.presign], ['put', limits.put],
    ['commit', limits.commit], ['commit-body', limits.commit]]) test(`${kind} writer: ${stage} deadline releases ref lock and keeps draft/photos`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, stage), screen = mountWriter(env, kind);
    screen.render(); await flush(); let nodes = screen.render();
    nodes.find(n => n.type === 'TextInput').props.onChangeText('fixture draft');
    if (kind === 'review') nodes.find(n => n.props?.accessibilityLabel === 'review.write.rating').props.onPress();
    nodes.find(n => n.props?.accessibilityLabel === (kind === 'post' ? 'community.attachImage' : 'review.write.addPhoto')).props.onPress();
    await flush(); nodes = screen.render();
    const button = nodes.find(n => n.props?.accessibilityLabel === (kind === 'post' ? 'community.register' : 'review.write.register'));
    assert.equal(button.props.disabled, false); button.props.onPress(); button.props.onPress(); await flush();
    nodes = screen.render(); assert.ok(nodes.some(n => n.type === 'ActivityIndicator'));
    t.mock.timers.tick(timeout); await flush(); nodes = screen.render();
    assert.equal(nodes.some(n => n.type === 'ActivityIndicator'), false, 'timeout must end spinner');
    assert.equal(nodes.find(n => n.type === 'TextInput').props.value, 'fixture draft');
    assert.equal(nodes.find(n => n.type === 'Image').props.source.uri, image.uri);
    assert.equal(screen.backCalls, 0);
    const retry = nodes.find(n => n.props?.accessibilityLabel === (kind === 'post' ? 'community.register' : 'review.write.register'));
    assert.equal(retry.props.disabled, false); assert.equal(env.calls.filter(c => c.phase === 'presign').length, stage === 'local' ? 0 : 1);
    env.setHold(null); retry.props.onPress(); await flush(); assert.equal(screen.backCalls, 1, 'retry must be unlocked');
  });
  for (const [stage, timeout] of [
    ['local', limits.local], ['local-body', limits.local], ['presign', limits.presign],
    ['presign-body', limits.presign], ['put', limits.put], ['put-error-body', limits.put], ['commit', limits.commit], ['commit-body', limits.commit],
  ]) test(`${kind}: ${stage} timeout aborts the actual fetch and rejects the submission`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const env = setup(kind, stage); let outcome;
    const pending = env.publish().then(value => { outcome = { value }; }, error => { outcome = { error }; });
    await flush(); const call = env.calls.at(-1); assert.equal(call.phase, stage.split('-')[0]);
    t.mock.timers.tick(timeout - 1); await flush(); assert.equal(outcome, undefined);
    t.mock.timers.tick(1); await flush();
    assert.equal(outcome?.error?.name, 'RequestTimeoutError', 'deadline must end the pending submission');
    assert.equal(call.signal.aborted, true); assert.equal(env.activeTimers.size, 0);
    if (stage.startsWith('commit')) {
      assert.equal(env.attempt.current.outcomeUnknown, true);
      assert.equal(env.attempt.current.content, 'original');
      assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    } else {
      assert.equal(env.attempt.current, null); assert.equal(env.calls.some(c => c.phase === 'commit'), false);
    }
    const snapshot = env.calls.length, token = env.attempt.current?.uploadToken;
    env.release(); await flush(); assert.equal(env.calls.length, snapshot, 'late fetch/body must not continue the old operation');
    if (token) assert.equal(env.attempt.current.uploadToken, token);
    await pending;
  });

  test(`${kind}: successful upload/commit clears timers and preserves the v2 binary request`, async () => {
    const env = setup(kind); assert.deepEqual(await env.publish(), { id: 7 });
    assert.deepEqual(env.calls.map(c => c.phase), ['local', 'presign', 'put', 'commit']);
    assert.equal(env.activeTimers.size, 0); assert.equal(env.attempt.current, null);
    assert.ok(env.calls.every(c => !c.signal.aborted), 'successful requests must not be aborted');
    assert.ok(env.calls[2].body instanceof ArrayBuffer);
    assert.deepEqual(JSON.parse(env.calls[1].body), { version: 2, count: 1, contentType: 'image/webp', sizeBytes: [2] });
  });

  test(`${kind}: commit timeout retry reuses the exact token/payload without presign, PUT or DELETE`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'commit'); let error;
    const pending = env.publish().catch(value => { error = value; }); await flush();
    t.mock.timers.tick(limits.commit); await flush(); assert.equal(error?.name, 'RequestTimeoutError'); await pending;
    const token = env.attempt.current.uploadToken;
    env.setHold(null); assert.deepEqual(await env.publish('edited'), { id: 7 });
    const commits = env.calls.filter(c => c.phase === 'commit').map(c => JSON.parse(c.body));
    assert.deepEqual(commits[0], commits[1]); assert.equal(commits[1].uploadToken, token);
    assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1);
    assert.equal(env.calls.filter(c => c.phase === 'put').length, 1);
    assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    const count = env.calls.length; env.release(); await flush();
    assert.equal(env.calls.length, count); assert.equal(env.attempt.current, null, 'old reply cannot restore a completed attempt');
  });

  for (const phase of ['presign', 'commit']) for (const status of [401, 403, 500])
    test(`${kind}: received ${status} survives a stalled ${phase} error body with its auth generation`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, phase + '-error-body');
      env.setErrorStatus(status); let error; const pending = env.publish().catch(value => { error = value; });
      await flush(); const call = env.calls.at(-1); t.mock.timers.tick(limits[phase]); await flush(); await pending;
      assert.ok(error instanceof env.posts.CommunityApiError); assert.equal(error.status, status);
      assert.equal(error.authGeneration, 3); assert.equal(call.signal.aborted, true);
      if (phase === 'commit' && status === 500) {
        assert.equal(env.attempt.current.outcomeUnknown, true); assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
      } else assert.equal(env.attempt.current, null);
      assert.equal(env.activeTimers.size, 0);
    });

  test(`${kind}: pending DELETE has its own deadline and preserves the original PUT timeout`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind, 'put'); env.holdCleanup(); let error;
    const pending = env.publish().catch(value => { error = value; }); await flush();
    t.mock.timers.tick(limits.put); await flush(); const cleanup = env.calls.at(-1);
    assert.equal(cleanup.phase, 'cleanup'); assert.ok(cleanup.signal instanceof AbortSignal);
    assert.equal(env.calls.find(c => c.phase === 'put').signal.aborted, true);
    t.mock.timers.tick(limits.cleanup - 1); await flush(); assert.equal(error, undefined);
    t.mock.timers.tick(1); await flush(); assert.equal(error?.name, 'RequestTimeoutError');
    assert.equal(error.stage, 'put'); assert.equal(cleanup.signal.aborted, true);
    assert.equal(env.activeTimers.size, 0); await pending;
    env.cleanupGate.resolve(response({})); await flush(); assert.equal(error.stage, 'put');
  });

  for (const failure of ['put', 'commit']) for (const mode of ['success', 'pending', 'body-pending', 403, 500, 'network', 'abort'])
    test(`${kind}: ${failure} error survives cleanup ${mode}`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind);
      if (failure === 'put') env.failPut(); else env.setCommitStatus(403);
      if (mode === 'pending') env.holdCleanup(); else if (mode === 'body-pending') env.setHold('cleanup-error-body'); else env.setCleanupMode(mode);
      let error; const pending = env.publish().catch(value => { error = value; }); await flush();
      const cleanup = env.calls.find(c => c.phase === 'cleanup'); assert.ok(cleanup);
      if (mode === 'pending' || mode === 'body-pending') {
        t.mock.timers.tick(limits.cleanup - 1); await flush(); assert.equal(error, undefined);
        t.mock.timers.tick(1); await flush(); assert.ok(error, 'cleanup deadline must release the original error');
        assert.equal(cleanup.signal.aborted, true);
      }
      await pending;
      if (failure === 'put') assert.equal(error, env.putError, 'preserve the exact PUT error instance');
      else {
        assert.ok(error instanceof env.posts.CommunityApiError); assert.equal(error.status, 403);
        assert.equal(error.authGeneration, 3); assert.ok(error.responseBody.includes('fixture commit rejection'));
      }
      assert.equal(env.attempt.current, null); assert.equal(env.activeTimers.size, 0);
      assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, 1);
      if (mode !== 'success') assert.ok(env.logs.some(log => log.stage === 'CLEANUP'), 'record cleanup request errors without changing the submission error');
      if (failure === 'put') assert.equal(env.calls.some(c => c.phase === 'commit'), false);
      const before = { count: env.calls.length, error, token: env.attempt.current };
      env.cleanupGate.resolve(response({})); env.gate.resolve('{}'); await flush();
      assert.equal(env.calls.length, before.count); assert.equal(error, before.error); assert.equal(env.attempt.current, before.token);
    });

  for (const failure of ['put', 'commit']) test(`${kind} writer: ${failure} error reaches UI after pending cleanup deadline`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup(kind), screen = mountWriter(env, kind);
    if (failure === 'put') env.failPut(); else env.setCommitStatus(403); env.holdCleanup();
    screen.render(); await flush(); let nodes = screen.render();
    nodes.find(n => n.type === 'TextInput').props.onChangeText('fixture cleanup draft');
    if (kind === 'review') nodes.find(n => n.props?.accessibilityLabel === 'review.write.rating').props.onPress();
    nodes.find(n => n.props?.accessibilityLabel === (kind === 'post' ? 'community.attachImage' : 'review.write.addPhoto')).props.onPress();
    await flush(); nodes = screen.render();
    const label = kind === 'post' ? 'community.register' : 'review.write.register';
    const button = nodes.find(n => n.props?.accessibilityLabel === label); button.props.onPress(); button.props.onPress();
    await flush(); nodes = screen.render(); assert.ok(nodes.some(n => n.type === 'ActivityIndicator'));
    t.mock.timers.tick(limits.cleanup); await flush(); nodes = screen.render();
    assert.equal(nodes.some(n => n.type === 'ActivityIndicator'), false, 'cleanup must not trap spinner');
    assert.ok(nodes.some(n => n.props?.accessibilityRole === 'alert')); assert.equal(screen.backCalls, 0);
    assert.equal(nodes.find(n => n.type === 'TextInput').props.value, 'fixture cleanup draft');
    assert.equal(nodes.find(n => n.type === 'Image').props.source.uri, image.uri);
    assert.equal(nodes.find(n => n.props?.accessibilityLabel === label).props.disabled, false);
    assert.equal(env.calls.filter(c => c.phase === 'cleanup').length, 1, 'ref lock still prevents duplicate submissions');
    env.resetFailures(); nodes.find(n => n.props?.accessibilityLabel === label).props.onPress(); await flush();
    assert.equal(screen.backCalls, 1, 'same-screen retry works before the old DELETE reply arrives');
    env.cleanupGate.resolve(response({})); await flush(); assert.equal(screen.backCalls, 1);
    assert.equal(screen.render().find(n => n.type === 'TextInput').props.value, 'fixture cleanup draft');
  });

  test(`${kind}: immediate registration 5xx retains the token and never starts DELETE`, async () => {
    const env = setup(kind); env.setCommitStatus(500); env.holdCleanup();
    await assert.rejects(env.publish(), error => error.status === 500);
    assert.equal(env.attempt.current.outcomeUnknown, true); assert.equal(env.attempt.current.content, 'original');
    assert.ok(env.attempt.current.uploadToken); assert.equal(env.calls.some(c => c.phase === 'cleanup'), false);
    env.resetFailures(); await env.publish('changed');
    assert.equal(env.calls.filter(c => c.phase === 'presign').length, 1); assert.equal(env.calls.filter(c => c.phase === 'put').length, 1);
  });
}

test('explicit cancellation is distinct from timeout; listeners/timers are removed and abort happens once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup('post'), parent = new AbortController();
  const utility = env.load('src/lib/requestTimeout.ts'); let added = 0, removed = 0, aborts = 0, signal;
  const add = parent.signal.addEventListener.bind(parent.signal), remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener = (...args) => { added++; return add(...args); };
  parent.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const gate = deferred(); const pending = utility.withRequestTimeout('fixture', 100, async child => {
    signal = child; child.addEventListener('abort', () => { aborts++; }); return gate.promise;
  }, parent.signal);
  const checked = assert.rejects(pending, error => error instanceof utility.RequestCancelledError);
  parent.abort(); await checked; assert.equal(signal.aborted, true); assert.equal(aborts, 1);
  assert.equal(added, 1); assert.equal(removed, 1); assert.equal(env.activeTimers.size, 0);
  t.mock.timers.tick(1000); assert.equal(aborts, 1); gate.resolve('late'); await flush();
});

test('already cancelled parent never starts work; normal/rejected work clears parent listener and timer', async () => {
  const env = setup('post'), utility = env.load('src/lib/requestTimeout.ts'), parent = new AbortController();
  parent.abort(); let started = false;
  await assert.rejects(utility.withRequestTimeout('fixture', 100, async () => { started = true; }, parent.signal), utility.RequestCancelledError);
  assert.equal(started, false); assert.equal(env.activeTimers.size, 0);
  for (const failing of [false, true]) {
    const activeParent = new AbortController(); let removed = 0;
    const remove = activeParent.signal.removeEventListener.bind(activeParent.signal);
    activeParent.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
    const pending = utility.withRequestTimeout('fixture', 100, async () => { if (failing) throw new Error('fixture failure'); return 1; }, activeParent.signal);
    if (failing) await assert.rejects(pending, /fixture failure/); else assert.equal(await pending, 1);
    assert.equal(removed, 1); assert.equal(env.activeTimers.size, 0);
  }
});

test('native fetch rejection on abort still exposes the typed timeout exactly once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const env = setup('post'), utility = env.load('src/lib/requestTimeout.ts');
  let aborts = 0;
  const pending = utility.withRequestTimeout('fixture', 100, signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborts++; reject(new Error('native abort')); });
  }));
  const checked = assert.rejects(pending, error => error instanceof utility.RequestTimeoutError && error.stage === 'fixture');
  t.mock.timers.tick(100); await checked; assert.equal(aborts, 1); assert.equal(env.activeTimers.size, 0);
});

test('upload parent cancellation aborts PUT and keeps registration from starting without changing leave policy', async () => {
  const env = setup('post', 'put'), parent = new AbortController();
  const pending = env.images.uploadPostImages([image], undefined, undefined, parent.signal);
  const checked = assert.rejects(pending, error => error.name === 'RequestCancelledError');
  await flush(); parent.abort(); await checked;
  assert.equal(env.calls.find(c => c.phase === 'put').signal.aborted, true);
  assert.equal(env.calls.some(c => c.phase === 'commit'), false); assert.equal(env.activeTimers.size, 0);
});
