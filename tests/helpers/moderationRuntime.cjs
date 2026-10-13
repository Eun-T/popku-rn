const { runtime, nodes, texts, flush } = require('./i18nRuntime.cjs');
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300,
  json: async () => body, text: async () => JSON.stringify(body) });
const post = { id: 10, type: 'POST', category: 'FREE', author: { id: 2, nickname: 'writer', avatarUrl: null },
  content: 'post body', createdAt: '2026-10-10T09:00:00+09:00', updatedAt: '2026-10-10T09:00:00+09:00',
  images: [], likeCount: 3, liked: false, commentCount: 2, viewCount: 0, rating: null, regionName: null, popup: null, isOwner: false };
const review = { ...post, type: 'REVIEW', category: 'REVIEW', rating: 4, popup: { publicId: 'popup', title: 'popup' } };
const root = { id: 20, content: 'root secret', author: post.author, createdAt: post.createdAt, updatedAt: post.updatedAt,
  parentCommentId: null, replyToUser: null, isOwner: false, isBlocked: false };
const reply = { ...root, id: 21, content: 'normal reply', parentCommentId: 20, author: { id: 3, nickname: 'reply writer', avatarUrl: null } };
async function app({ guest = false, transform } = {}) {
  let generation = 0, user = guest ? null : { id: 1, email: 'me@example.test' }, handler;
  const userListeners = new Set(), sessionListeners = new Set(), calls = [], alerts = [], routes = [], focuses = [];
  const auth = {
    getAuthStatus: () => user ? 'authenticated' : 'anonymous',
    subscribeAuthStatus: fn => { userListeners.add(fn); return () => userListeners.delete(fn); },
    getAuthUser: () => user, subscribeAuthUser: fn => { userListeners.add(fn); return () => userListeners.delete(fn); },
    authSessionGeneration: () => generation,
    getAuthSession: async () => ({ accessToken: user ? 'test-token' : null, generation }),
    getSavedAccessToken: async () => user ? 'test-token' : null,
    subscribeAuthSession: fn => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); },
    clearTokens: async expected => { if (expected !== generation) return false; changeUser(null); return true; },
  };
  function changeUser(next) {
    generation++; user = next; userListeners.forEach(fn => fn()); sessionListeners.forEach(fn => fn());
  }
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'ScrollView', 'FlatList', 'Image', 'Modal', 'ActivityIndicator', 'KeyboardAvoidingView'].map(n => [n,n]));
  const animation = () => ({ start: cb => cb?.({ finished: true }) });
  Object.assign(native, { Platform: { OS: 'ios' }, StyleSheet: { create: v => v, absoluteFill: { position: 'absolute' }, hairlineWidth: 1 },
    Alert: { alert: (...args) => alerts.push(args) }, PanResponder: { create: v => ({ panHandlers: v }) },
    Animated: { Value: class { setValue() {} stopAnimation() {} }, View: 'AnimatedView', timing: animation, spring: animation, parallel: animation },
    useWindowDimensions: () => ({ width: 375 }), Keyboard: { dismiss() {} },
  });
  const router = { push: r => routes.push(r), replace: r => routes.push(r), back: () => routes.push('back'), canGoBack: () => true };
  const ui = runtime({
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) },
    'lucide-react-native': Object.fromEntries(['Flag','UserRoundX','UserRound','Pencil','Trash2','MoreHorizontal','ChevronLeft','ChevronRight','X','Heart','Star','MessageCircle'].map(n => [n,n])),
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id: '10' }), useNavigation: () => ({ dispatch() {} }), useScrollToTop() {},
      useFocusEffect: fn => ui.react.useEffect(() => { const cleanup = fn(); focuses.push({ fn, cleanup }); return cleanup; }, [fn]) },
    'src/lib/auth.ts': auth,
    'src/lib/communityImages.ts': {},
    'src/components/community/CommunityImageCarousel.tsx': { __esModule: true, default: 'Carousel' },
    'src/components/community/CommunityPostItem.tsx': { __esModule: true, default: 'Card' },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
    'src/hooks/useCommunityNow.ts': { useCommunityNow: () => ({ now: Date.parse(post.createdAt), updateNow }) },
    'src/lib/communityLikes.ts': { changeCommunityLike: async () => {} },
    'src/constants/api.ts': { API_BASE_URL: 'https://mock.test' },
    fetch: async (url, init = {}) => {
      const call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal };
      calls.push(call);
      if (handler) return handler(call);
      if (url.endsWith('/reports')) return response({ id: 1, status: 'PENDING' }, 201);
      if (call.method === 'POST') return response(null, 201);
      if (call.method === 'DELETE') return response(null, 204);
      if (url.includes('/comments')) return response({ items: [root, reply], commentCount: 2 });
      if (url.includes('/feed')) return response({ items: [post, review], nextCursor: 'next' });
      if (url.includes('/users/me/blocks')) return response({ items: [], nextCursor: null });
      if (url.includes('/popups/')) return response({ items: [review], nextCursor: 'next' });
      if (url.includes('/reviews/')) return response(review);
      return response(post);
    },
  }, { transform });
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ja-JP'] });
  const locale = ui.load('src/locales/index.ts');
  return { ...ui, calls, alerts, routes, native, focuses, auth, post, review, root, reply, response,
    api: ui.load('src/lib/moderation.ts'), state: ui.load('src/lib/moderationState.ts'),
    setHandler: fn => { handler = fn; }, changeUser, generation: () => generation,
    t: (key, params) => locale.translate(languageStore.getSnapshot().resolvedLanguage, key, params),
    async language(value) { await languageStore.setLanguagePreference(value); await flush(); },
    async settle() { await flush(); await flush(); },
  };
}
function updateNow() {}
const button = (screen, label) => nodes(screen.tree).find(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || texts(n) === label));
module.exports = { app, button, nodes, texts, flush, response, post, review, root, reply };
