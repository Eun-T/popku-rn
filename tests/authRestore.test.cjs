const { savedToken } = require('./helpers/authStorage.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const profileFile = 'src/app/(tabs)/profile/index.tsx';
const postsFile = 'src/app/profile/posts.tsx';
const reviewsFile = 'src/components/place/PopupReviews.tsx';
const userA = { id: 1, nickname: 'A', email: 'a@example.test', provider: 'LOCAL' };
const userB = { id: 2, nickname: 'B', email: 'b@example.test', provider: 'LOCAL' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const response = (body = {}, status = 200) => ({ ok: status < 400, status, json: async () => body });

// Real root, auth store, login-attempt hook and consuming components. Native
// layout/navigation/SecureStore/HTTP are controlled fixtures, not device tests.
async function app({ saved = true, transform } = {}) {
  const storage = new Map(saved ? [['accessToken', 'A'], ['refreshToken', 'refresh-A']] : []);
  const calls = [], deleted = [], routes = [];
  let meReply = async () => response(userA), logoutReply = async () => response();
  let readGate, readFailure = false, systemTags = ['ja-JP'];
  const noopSubscription = () => () => {};
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'FlatList', 'Text', 'View'].map(n => [n, n]));
  Object.assign(native, { StyleSheet: { create: s => s }, Alert: { alert() {} } });
  const Stack = Object.assign(() => null, { Screen: 'Stack.Screen' });
  const apiError = class extends Error {};
  const ui = runtime({
    'expo-clipboard': { setStringAsync: async () => true },
    'react-native': native,
    'expo-secure-store': {
      isAvailableAsync: async () => true,
      getItemAsync: async key => {
        if (key === 'accessToken' && readGate) { const gate = readGate; readGate = undefined; await gate; }
        if (readFailure) throw new Error('storage unavailable');
        return storage.get(key) ?? null;
      },
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => { deleted.push(key); storage.delete(key); },
    },
    'expo-router': { Stack, useRouter: () => ({ push: r => routes.push(r) }), useScrollToTop() {},
      useFocusEffect: fn => ui.react.useEffect(fn, [fn]) },
    'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }) },
    'lucide-react-native': Object.fromEntries(['Settings', 'Pencil', 'ChevronRight', 'MoreHorizontal', 'Heart', 'Star', 'MessageSquare'].map(n => [n, n])),
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    'src/locales/LanguageProvider.tsx': { default: 'LanguageProvider' },
    'src/theme/ThemeProvider.tsx': { default: 'ThemeProvider' },
    'src/lib/favoriteCache.ts': { clearFavoriteCache() {} },
    'src/lib/communityFeedRefresh.ts': { clearCommunityLikes() {}, communityFeedRevision: () => 0,
      subscribeCommunityCommentCounts: noopSubscription, subscribeCommunityLikes: noopSubscription,
      subscribeCommunityPostChanges: noopSubscription },
    'src/lib/community.ts': { CommunityApiError: apiError, getCommunityFeed: async () => ({ items: [], nextCursor: null }) },
    'src/lib/communityLikes.ts': { changeCommunityLike() {} },
    'src/lib/communityRefresh.ts': { waitForCommunityRefresh: async () => {} },
    'src/lib/reviews.ts': { getPopupReviews: async () => ({ items: [], nextCursor: null }), subscribeReviews: noopSubscription },
    'src/lib/myPosts.ts': { appendMyPosts: (a, b) => [...a, ...b], getMyPosts: async () => ({ items: [], nextCursor: null }) },
    'src/hooks/useModerationRevision.ts': { useModerationRevision: () => 0 },
    'src/hooks/useCommunityNow.ts': { useCommunityNow: () => ({ now: 1000, updateNow() {} }) },
    'src/lib/moderationState.ts': { isLocallyBlocked: () => false },
    'src/components/community/CommunityPostItem.tsx': { default: 'CommunityPostItem' },
    'src/components/community/PostActions.tsx': { default: 'PostActions' },
    'src/components/community/ModerationActions.tsx': { default: 'ModerationActions' },
    'src/components/community/CommunityPostMenu.tsx': { default: 'CommunityPostMenu' },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/api/auth/logout')) return logoutReply();
      assert.ok(url.endsWith('/api/users/me'));
      return meReply(options);
    },
  }, { transform });
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => systemTags });
  const auth = ui.load('src/lib/auth.ts');
  const mount = subject => {
    if (typeof subject === 'function') return ui.mount(subject);
    const Component = ui.load(subject).default; return ui.mount(() => Component());
  };
  return { ...ui, auth, storage, deleted, routes, calls, mount,
    start: () => mount('src/app/_layout.tsx'), profile: () => mount(profileFile),
    meCalls: () => calls.filter(c => c.url.endsWith('/api/users/me')),
    reply: fn => { meReply = fn; }, logoutReply: fn => { logoutReply = fn; },
    blockRead: gate => { readGate = gate; }, failRead: value => { readFailure = value; },
    settle: async () => { await flush(); await flush(); },
    language: async preference => { await languageStore.setLanguagePreference(preference); await flush(); },
    system: async tag => { systemTags = [tag]; languageStore.refreshSystemLanguage(); await flush(); },
    t: key => ui.load('src/locales/index.ts').translate(languageStore.getSnapshot().resolvedLanguage, key),
  };
}
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable'
  && (n.props.accessibilityLabel === label || texts(n) === label));

test('startup restores once without profile focus; mounted community/review/ownership consumers agree', async t => {
  const s = await app(); t.after(s.dispose);
  const gate = deferred(); s.reply(() => gate.promise);
  const community = s.mount('src/screens/CommunityScreen.tsx');
  const Reviews = s.load(reviewsFile).default;
  const reviews = s.mount(() => Reviews({ publicId: 'popup', title: 'Raw title' }));
  const Actions = s.load('src/components/reviews/ReviewActions.tsx').default;
  const actions = s.mount(() => Actions({ review: { id: 10, author: userA, popup: { publicId: 'popup' } } }));
  s.start(); s.start(); await s.settle();
  assert.equal(s.auth.getAuthStatus(), 'restoring');
  assert.equal(s.meCalls().length, 1);
  assert.equal(button(community.tree, s.t('community.write')), undefined);
  assert.ok(!texts(reviews.tree).includes(s.t('place.detail.reviews.loginWrite')));
  gate.resolve(response(userA)); await s.auth.initializeAuth(); await s.settle();
  assert.equal(s.auth.getAuthStatus(), 'authenticated');
  assert.deepEqual(s.auth.getAuthUser(), userA);
  assert.ok(button(community.tree, s.t('community.write')));
  assert.ok(button(reviews.tree, s.t('place.detail.reviews.write')));
  assert.ok(button(actions.tree, s.t('review.menu')));
  const profile = s.profile(); await s.settle();
  assert.ok(texts(profile.tree).includes(userA.nickname));
  s.profile(); s.start(); await s.settle();
  assert.equal(s.meCalls().length, 1, 'profile mounts and root remounts reuse restored state');
});

test('startup without saved tokens settles anonymous without /me or a premature login prompt', async t => {
  const s = await app({ saved: false }); t.after(s.dispose);
  const profile = s.profile();
  assert.ok(nodes(profile.tree).some(n => n.type === 'ActivityIndicator'));
  assert.ok(!button(profile.tree, s.t('profile.login')));
  s.start(); await s.auth.initializeAuth();
  assert.equal(s.auth.getAuthStatus(), 'anonymous'); assert.equal(s.auth.getAuthUser(), null);
  assert.equal(s.meCalls().length, 0);
  assert.ok(button(profile.tree, s.t('profile.login')));
});

test('offline cold restore preserves tokens, exposes retry and deduplicates rapid retries after recovery', async t => {
  const s = await app(); t.after(s.dispose);
  s.reply(async () => { throw new TypeError('offline'); });
  const profile = s.profile(); s.start(); await s.auth.initializeAuth();
  assert.equal(s.auth.getAuthStatus(), 'error');
  assert.equal(s.storage.size, 2); assert.equal(savedToken(s.storage, 'accessToken'), 'A');
  assert.ok(!button(profile.tree, s.t('profile.login')));
  const retry = button(profile.tree, s.t('profile.retry')); assert.ok(retry);
  s.start(); await s.settle(); assert.equal(s.meCalls().length, 1);
  const gate = deferred(); s.reply(() => gate.promise);
  retry.props.onPress(); retry.props.onPress(); await s.settle();
  assert.equal(s.meCalls().length, 2);
  assert.equal(s.auth.getAuthStatus(), 'restoring');
  gate.resolve(response(userA)); await s.settle();
  assert.equal(s.auth.getAuthStatus(), 'authenticated');
  assert.ok(texts(profile.tree).includes(userA.nickname)); assert.ok(!s.deleted.includes('session.v1'), 'late work cannot delete the committed new session');
});

test('logout stops pending startup publication even before its server request finishes', async t => {
  const s = await app(); t.after(s.dispose);
  const me = deferred(), logout = deferred(); s.reply(() => me.promise); s.logoutReply(() => logout.promise);
  s.start(); await s.settle(); const out = s.auth.logout(); await s.settle();
  me.resolve(response(userA)); await s.auth.initializeAuth();
  assert.equal(s.auth.getAuthUser(), null, 'late restoration must not publish during logout');
  logout.resolve(response()); await out;
  assert.equal(s.auth.getAuthStatus(), 'anonymous'); assert.equal(s.storage.size, 0);
});

test('old startup 401 and delayed logout cannot invalidate a login made during logout', async t => {
  const s = await app(); t.after(s.dispose);
  const me = deferred(), logout = deferred(); s.reply(() => me.promise); s.logoutReply(() => logout.promise);
  s.start(); await s.settle(); const out = s.auth.logout(); await s.settle();
  await s.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  s.reply(async () => response(userB)); s.auth.setAuthUser(await s.auth.getCurrentUser('B'));
  me.resolve(response({}, 401)); await s.auth.initializeAuth();
  logout.resolve(response()); await out;
  assert.equal(s.auth.getAuthStatus(), 'authenticated'); assert.deepEqual(s.auth.getAuthUser(), userB);
  assert.equal(savedToken(s.storage, 'accessToken'), 'B'); assert.ok(!s.deleted.includes('session.v1'), 'late work cannot delete the committed new session');
});

for (const oldResult of ['success', '401', 'network error']) test(`new login ignores old startup ${oldResult}`, async t => {
  const s = await app(); t.after(s.dispose);
  const gate = deferred(); s.reply(() => gate.promise); s.start(); await s.settle();
  const Hook = s.load('src/hooks/useLoginAttempt.ts').useLoginAttempt;
  const login = s.mount(() => Hook('login')).tree;
  const attempt = login.begin();
  s.reply(async () => response(userB));
  // Reusing token text still represents a new generation and must not share A's request.
  assert.equal(await login.authenticate(attempt, { accessToken: 'A', refreshToken: 'refresh-B' }), true);
  assert.equal(login.complete(attempt), true); login.release(attempt);
  assert.equal(s.meCalls().length, 2);
  if (oldResult === 'network error') gate.reject(new TypeError('offline'));
  else gate.resolve(response(userA, oldResult === '401' ? 401 : 200));
  await s.auth.initializeAuth();
  assert.equal(s.auth.getAuthStatus(), 'authenticated'); assert.deepEqual(s.auth.getAuthUser(), userB);
  assert.equal(savedToken(s.storage, 'refreshToken'), 'refresh-B'); assert.ok(!s.deleted.includes('session.v1'), 'late work cannot delete the committed new session');
});

test('immediate login during token read makes startup skip the superseded session', async t => {
  const s = await app(); t.after(s.dispose);
  const gate = deferred(); s.blockRead(gate.promise); s.start(); await s.settle();
  await s.auth.saveTokens({ accessToken: 'B', refreshToken: 'refresh-B' });
  s.reply(async () => response(userB)); s.auth.setAuthUser(await s.auth.getCurrentUser('B'));
  gate.resolve(); await s.auth.initializeAuth();
  assert.equal(s.meCalls().length, 1); assert.deepEqual(s.auth.getAuthUser(), userB);
  assert.equal(s.auth.getAuthStatus(), 'authenticated');
});

test('invalid startup token and simultaneous consumers invalidate the current session once', async t => {
  const s = await app(); t.after(s.dispose);
  const gate = deferred(); let sessions = 0;
  s.auth.subscribeAuthSession(() => sessions++); s.reply(() => gate.promise); s.start();
  const other = s.auth.refreshAuthUser(); await s.settle(); assert.equal(s.meCalls().length, 1);
  gate.resolve(response({}, 401)); await Promise.all([s.auth.initializeAuth(), other]);
  assert.equal(s.auth.getAuthStatus(), 'anonymous'); assert.equal(s.auth.getAuthUser(), null);
  assert.equal(s.storage.size, 0); assert.equal(sessions, 1);
  assert.deepEqual(s.deleted.sort(), ['accessToken', 'refreshToken', 'session.v1']);
});

test('SecureStore read failure is recoverable; same-user network failure retains known ownership', async t => {
  const s = await app(); t.after(s.dispose);
  s.failRead(true); s.start(); await s.auth.initializeAuth();
  assert.equal(s.auth.getAuthStatus(), 'error'); assert.equal(s.storage.size, 2); assert.equal(s.meCalls().length, 0);
  s.failRead(false); await s.auth.refreshAuthUser();
  const profile = s.profile();
  s.reply(async () => { throw new TypeError('offline'); });
  await assert.rejects(s.auth.refreshAuthUser(), /offline/);
  assert.equal(s.auth.getAuthStatus(), 'error'); assert.deepEqual(s.auth.getAuthUser(), userA);
  assert.ok(texts(profile.tree).includes(userA.nickname)); assert.ok(!button(profile.tree, s.t('profile.login')));
  assert.equal(s.storage.size, 2);
});

test('repeated login/logout remains usable after initialization and never reruns startup', async t => {
  const s = await app({ saved: false }); t.after(s.dispose);
  s.start(); await s.auth.initializeAuth();
  for (const user of [userA, userB, userA]) {
    await s.auth.saveTokens({ accessToken: user.nickname, refreshToken: 'refresh' });
    s.reply(async () => response(user)); s.auth.setAuthUser(await s.auth.getCurrentUser(user.nickname));
    assert.equal(s.auth.getAuthStatus(), 'authenticated');
    await s.auth.logout(); assert.equal(s.auth.getAuthStatus(), 'anonymous'); assert.equal(s.storage.size, 0);
    s.start(); await s.settle();
  }
  assert.equal(s.meCalls().length, 3);
});

test('compiler output: mounted restore error/retry and review CTA follow ko/ja/system without /me refetch', async t => {
  const bailouts = [];
  const transform = compilerTransform([profileFile, reviewsFile, postsFile], {
    allowBailout: [reviewsFile, postsFile], onBailout: file => bailouts.push(file),
  });
  const s = await app({ transform }); t.after(s.dispose);
  s.reply(async () => { throw new TypeError('offline'); });
  const profile = s.profile(), posts = s.mount(postsFile), Reviews = s.load(reviewsFile).default;
  const reviews = s.mount(() => Reviews({ publicId: 'popup', title: '原文' }));
  s.start(); await s.auth.initializeAuth(); await s.settle();
  const calls = s.meCalls().length;
  for (const pref of ['ja', 'ko', 'system']) {
    await s.language(pref);
    assert.ok(texts(profile.tree).includes(s.t('profile.userLoadFailed')));
    assert.ok(button(profile.tree, s.t('profile.retry')));
    assert.ok(button(posts.tree, s.t('profile.retry')));
    assert.ok(!texts(posts.tree).includes(s.t('profile.posts.loginTitle')));
    assert.ok(!button(profile.tree, s.t('profile.login')));
    assert.ok(button(reviews.tree, s.t('place.detail.reviews.write')));
    assert.equal(s.meCalls().length, calls);
  }
  await s.system('ko-KR'); assert.ok(button(profile.tree, s.t('profile.retry')));
  await s.system('ja-JP'); assert.ok(button(profile.tree, s.t('profile.retry')));
  assert.equal(s.meCalls().length, calls);
  assert.deepEqual(bailouts, [postsFile, reviewsFile], 'Profile is compiled; MyPosts/PopupReviews retain their existing compiler bailouts');
  s.reply(async () => response(userA));
  button(posts.tree, s.t('profile.retry')).props.onPress(); await s.settle();
  assert.equal(s.auth.getAuthStatus(), 'authenticated');
  assert.ok(texts(posts.tree).includes(s.t('profile.posts.empty')));
});
