const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { nodes } = require('./helpers/uiTree.cjs');

function load(file, mocks = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { reportDiagnostics: true, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  assert.deepEqual(compiled.diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error), [], `Valid syntax: ${file}`);
  new Function('require', 'module', 'exports', '__DEV__', 'fetch', compiled.outputText)(name => {
    assert.ok(name in mocks, `Missing ${name} in ${file}`); return mocks[name];
  }, module, module.exports, false, mocks.fetch);
  return module.exports;
}

function hooks() {
  const slots = [], effects = []; let cursor = 0, dirty = false, focused = true, tree;
  const same = (a, b) => a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]; if (same(old?.deps, deps)) return;
      slots[i] = { deps, cleanup: old?.cleanup };
      effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      react.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]);
      return getSnapshot();
    },
  };
  return { react,
    useFocusEffect(fn) { react.useEffect(() => focused ? fn() : undefined, [fn, focused]); },
    render(Component) {
      let count = 0;
      do { assert.ok(count++ < 30, 'stable render'); cursor = 0; dirty = false; tree = Component(); effects.splice(0).forEach(fn => fn()); } while (dirty);
      return tree;
    },
    focus(value) { focused = value; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const popup = { publicId: 'one', name: 'One', startDate: '2026-10-01', endDate: '2100-10-15', tags: [], coverImageUrl: null, regionName: null };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function setup(t) {
  const calls = [], alerts = [], routes = [], clients = [], secure = new Map();
  let ignoreAbort = false, read = async key => secure.get(key) ?? null;
  const fetch = (url, init = {}) => new Promise((resolve, reject) => {
    const call = { url, ...init, resolve, reject }; calls.push(call);
    if (!ignoreAbort) {
      const abort = () => reject(new Error('aborted'));
      if (init.signal?.aborted) abort(); else init.signal?.addEventListener('abort', abort, { once: true });
    }
  });
  const cache = load('src/lib/favoriteCache.ts');
  const auth = load('src/lib/auth.ts', {
    fetch, 'expo-secure-store': { isAvailableAsync: async () => true, getItemAsync: key => read(key),
      setItemAsync: async (key, value) => secure.set(key, value), deleteItemAsync: async key => secure.delete(key) },
    '../constants/api': { API_BASE_URL: 'https://api.test' }, './favoriteCache': cache,
    './communityFeedRefresh': load('src/lib/communityFeedRefresh.ts'),
  });
  const api = load('src/lib/favorites.ts', { fetch, '../constants/api': { API_BASE_URL: 'https://api.test' }, './auth': auth, './favoriteCache': cache });
  const router = { push: route => routes.push(route), replace: route => routes.push(route), dismissTo: route => routes.push(route), canGoBack: () => true, back: () => routes.push('back') };
  let active;
  const native = Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value }; native.useWindowDimensions = () => ({ width: 390 });
  native.Alert = { alert: (...args) => alerts.push(args) };
  const react = Object.fromEntries(['useState', 'useRef', 'useCallback', 'useEffect', 'useSyncExternalStore'].map(name => [name, (...args) => active.react[name](...args)]));
  const expo = { useRouter: () => router, useFocusEffect: fn => active.useFocusEffect(fn) };
  const hook = load('src/hooks/usePopupFavorites.ts', { react, 'expo-router': expo, 'react-native': native,
    '../lib/auth': auth, '../lib/favorites': api, '../lib/favoriteCache': cache }).usePopupFavorites;
  const tokens = load('src/theme/tokens.ts');
  const jsx = (type, props) => ({ type, props });
  function client(Component) {
    const state = hooks(); let value;
    const render = () => { active = state; value = state.render(Component); return value; };
    const c = { render, get value() { return value; }, focus(value) { state.focus(value); render(); }, unmount: state.unmount };
    clients.push(c); render(); return c;
  }
  function home(kind) {
    const file = kind === 'trending' ? 'HomeTrendingSection' : 'HomeNewPopupSection';
    const Component = load(`src/components/home/${file}.tsx`, {
      react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'expo-router': expo,
      'lucide-react-native': { Store: 'Store' }, '../../theme/tokens': tokens,
      '../../hooks/usePopupFavorites': { usePopupFavorites: hook },
      '../../hooks/useHomePopups': { useHomePopups: () => ({ status: 'ready', popups: [popup] }) },
      '../../lib/popups': { currentWeekRange: () => ({}) }, '../../lib/popupStatus': { popupOperatingStatus: () => '운영 중' },
      '../common/FilterChips': { __esModule: true, default: 'Filter' }, '../common/MoreButton': { __esModule: true, default: 'More' },
      './HomePopupSkeleton': {}, './NewPopupCard': { __esModule: true, default: 'NewCard' },
      './PopupRankingCard': { __esModule: true, default: 'RankingCard' }, '../../../assets/images/ranking-placeholder.png': 'placeholder',
    }).default;
    return client(() => Component({ onPressPopup() {} }));
  }
  function page() {
    const Component = load('src/app/profile/favorites.tsx', {
      react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'expo-router': expo,
      'lucide-react-native': { ChevronLeft: 'ChevronLeft', Heart: 'Heart' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      '../../hooks/usePopupNavigation': { usePopupNavigation: () => id => routes.push(id) },
      '../../lib/auth': auth, '../../lib/favorites': api, '../../lib/favoriteCache': cache,
      '../../theme/tokens': tokens, '../../theme/communityColors': { communityColors: tokens.colors },
      '../../../assets/images/ranking-placeholder.png': 'placeholder',
    }).default;
    return client(Component);
  }
  async function settle() { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); clients.forEach(c => c.render()); } }
  async function account(name) {
    await auth.saveTokens({ accessToken: `${name}-token`, refreshToken: `${name}-refresh` });
    auth.setAuthUser({ email: `${name}@example.test`, nickname: name });
  }
  await account('A');
  t.after(async () => {
    clients.forEach(c => c.unmount()); calls.forEach(call => call.reject(Error('cleanup')));
    await new Promise(resolve => setImmediate(resolve));
  });
  return { auth, api, cache, calls, alerts, routes, account, settle, home, page, hook: () => client(hook),
    ignoreAbort() { ignoreAbort = true; }, read(fn) { read = fn; }, secure };
}

for (const items of [[popup], []]) {
  test(`initial successful favorites distinguish known ${items.length ? 'populated' : 'empty'} state`, async t => {
    const e = await setup(t), s = e.hook(); await e.settle();
    assert.equal(s.value.favoritesStatus, 'loading'); assert.equal(s.value.isFavoriteDisabled('one'), true);
    e.calls[0].resolve(response({ popups: items })); await e.settle();
    assert.equal(s.value.favoritesStatus, 'ready'); assert.equal(s.value.isFavorite('one'), items.length > 0);
    assert.equal(s.value.isFavoriteDisabled('one'), false); assert.deepEqual(e.cache.getFavoriteCache(), items);
  });
}

for (const failure of ['network', 503, 'invalid-json']) {
  test(`initial ${failure} failure remains unknown/error; retries share one GET and never blindly mutate`, async t => {
    const e = await setup(t), a = e.hook(), b = e.hook(); await e.settle(); assert.equal(e.calls.length, 1);
    if (failure === 'network') e.calls[0].reject(Error('offline'));
    else e.calls[0].resolve(response(failure === 'invalid-json' ? {} : { popups: [] }, failure === 503 ? 503 : 200));
    await e.settle();
    assert.equal(e.cache.getFavoriteIds(), null); assert.equal(e.cache.getFavoriteCache(), null);
    for (const s of [a, b]) { assert.equal(s.value.favoritesStatus, 'error'); assert.equal(s.value.isFavoriteDisabled('one'), true); }
    await a.value.toggleFavorite(popup); assert.equal(e.calls.length, 1, 'unknown state cannot send POST/DELETE');
    const retry = a.value.retryFavorites(); a.value.retryFavorites(); b.value.retryFavorites(); await e.settle();
    assert.equal(e.calls.length, 2); assert.equal(a.value.favoritesStatus, 'loading');
    e.calls[1].resolve(response({ popups: [popup] })); await retry; await e.settle();
    for (const s of [a, b]) { assert.equal(s.value.favoritesStatus, 'ready'); assert.equal(s.value.isFavorite('one'), true); assert.equal(s.value.isFavoriteDisabled('one'), false); }
  });
}

test('failed cold load recovers on focus reentry without an explicit retry', async t => {
  const e = await setup(t), s = e.hook(); await e.settle(); e.calls[0].reject(Error('offline')); await e.settle();
  s.focus(false); s.focus(true); await e.settle(); assert.equal(e.calls.length, 2);
  e.calls[1].resolve(response({ popups: [] })); await e.settle(); assert.equal(s.value.favoritesStatus, 'ready'); assert.equal(s.value.isFavoriteDisabled('one'), false);
});

test('home sections display a real retry action, retain popup rows and recover their heart props', async t => {
  const e = await setup(t), trending = e.home('trending'), fresh = e.home('new'); await e.settle();
  assert.equal(e.calls.length, 1); e.calls[0].resolve(response({}, 500)); await e.settle();
  const retry = tree => nodes(tree).find(node => node.props?.accessibilityLabel === '찜 상태 다시 시도');
  for (const s of [trending, fresh]) { assert.ok(retry(s.value)); assert.ok(nodes(s.value).some(node => ['NewCard', 'RankingCard'].includes(node.type))); }
  retry(trending.value).props.onPress(); retry(fresh.value).props.onPress(); await e.settle(); assert.equal(e.calls.length, 2);
  e.calls[1].resolve(response({ popups: [popup] })); await e.settle();
  for (const s of [trending, fresh]) {
    assert.equal(retry(s.value), undefined);
    const card = nodes(s.value).find(node => ['NewCard', 'RankingCard'].includes(node.type));
    assert.equal(card.props.isFavorite, true); assert.equal(card.props.isFavoriteDisabled, false);
  }
});

test('add/remove are server-confirmed, isolate duplicate taps across hooks and preserve state on mutation failure', async t => {
  const e = await setup(t), a = e.hook(), b = e.hook(); await e.settle(); e.calls[0].resolve(response({ popups: [] })); await e.settle();
  const add = a.value.toggleFavorite(popup); await b.value.toggleFavorite(popup); await e.settle();
  assert.equal(e.calls.length, 2); assert.equal(e.calls[1].method, 'POST'); assert.equal(e.cache.getFavoriteIds().has('one'), false);
  e.calls[1].resolve(response({ publicId: 'one', isFavorited: true, favoriteCount: 1 })); await add; await e.settle();
  assert.equal(a.value.isFavorite('one'), true); assert.equal(b.value.isFavorite('one'), true);
  const failedRemove = a.value.toggleFavorite(popup); await e.settle(); e.calls[2].resolve(response({}, 500)); await failedRemove; await e.settle();
  assert.equal(a.value.isFavorite('one'), true); assert.equal(a.value.isFavoriteDisabled('one'), false); assert.equal(e.alerts.length, 1);
  const remove = b.value.toggleFavorite(popup); await e.settle(); assert.equal(e.calls[3].method, 'DELETE');
  e.calls[3].resolve(response({ publicId: 'one', isFavorited: false, favoriteCount: 0 })); await remove; await e.settle();
  assert.equal(a.value.isFavorite('one'), false); assert.deepEqual(e.cache.getFavoriteCache(), []);
});

test('logout immediately clears favorites and old render handlers cannot mutate another session', async t => {
  const e = await setup(t), s = e.hook(); await e.settle(); e.calls[0].resolve(response({ popups: [popup] })); await e.settle();
  const staleToggle = s.value.toggleFavorite; await e.auth.clearTokens(); s.render();
  assert.equal(e.cache.getFavoriteIds(), null); assert.equal(s.value.isFavorite('one'), false);
  await staleToggle(popup); assert.equal(e.calls.length, 1);
  await e.settle(); assert.equal(s.value.favoritesStatus, 'idle');
  await s.value.toggleFavorite(popup); assert.deepEqual(e.routes, ['/profile/login']); assert.equal(e.calls.length, 1);
});

for (const oldResult of ['success', 'network', 401, 503]) {
  test(`A pending load cannot delay or overwrite B; late A ${oldResult} cannot clear B pending request`, async t => {
    const e = await setup(t), s = e.hook(); await e.settle(); const old = e.calls[0];
    await e.account('B'); await e.settle(); assert.equal(e.calls.length, 2); assert.equal(e.calls[1].headers.Authorization, 'Bearer B-token');
    if (oldResult === 'network') old.reject(Error('old network'));
    else old.resolve(response({ popups: [popup] }, typeof oldResult === 'number' ? oldResult : 200));
    await e.settle(); s.value.retryFavorites(); const second = e.hook(); await e.settle();
    assert.equal(e.calls.length, 2, 'a new consumer still shares B Promise after old A finally');
    assert.equal(e.cache.getFavoriteIds(), null); assert.equal(s.value.favoritesStatus, 'loading');
    e.calls[1].resolve(response({ popups: [{ ...popup, publicId: 'b-only' }] })); await e.settle();
    assert.deepEqual([...e.cache.getFavoriteIds()], ['b-only']); assert.equal(s.value.favoritesStatus, 'ready');
    assert.equal(second.value.favoritesStatus, 'ready');
    assert.equal(await e.auth.getSavedAccessToken(), 'B-token'); assert.equal(e.routes.length, 0);
  });
}

test('B can mutate the same popup while A mutation is pending; A finally cannot unlock B duplicate taps', async t => {
  const e = await setup(t), s = e.hook(); await e.settle(); e.calls[0].resolve(response({ popups: [] })); await e.settle();
  const old = s.value.toggleFavorite(popup); await e.settle();
  await e.account('B'); await e.settle(); e.calls[2].resolve(response({ popups: [] })); await e.settle();
  const current = s.value.toggleFavorite(popup); await e.settle(); assert.equal(e.calls.length, 4);
  e.calls[1].resolve(response({ publicId: 'one', isFavorited: true, favoriteCount: 1 })); await old; await e.settle();
  assert.equal(s.value.isFavorite('one'), false); assert.equal(s.value.isFavoriteDisabled('one'), true);
  await s.value.toggleFavorite(popup); assert.equal(e.calls.length, 4);
  e.calls[3].resolve(response({ publicId: 'one', isFavorited: true, favoriteCount: 1 })); await current; await e.settle();
  assert.equal(s.value.isFavorite('one'), true); assert.equal(s.value.isFavoriteDisabled('one'), false);
});

test('current mutation 401 clears its session and opens login; late old 401 cannot log out B', async t => {
  const e = await setup(t), s = e.hook(); await e.settle(); e.calls[0].resolve(response({ popups: [] })); await e.settle();
  const old = s.value.toggleFavorite(popup); await e.settle(); await e.account('B'); await e.settle();
  e.calls[2].resolve(response({ popups: [] })); await e.settle(); e.calls[1].resolve(response({}, 401)); await old; await e.settle();
  assert.equal(await e.auth.getSavedAccessToken(), 'B-token'); assert.deepEqual(e.routes, []);
  const current = s.value.toggleFavorite(popup); await e.settle(); e.calls[3].resolve(response({}, 401)); await current; await e.settle();
  assert.equal(await e.auth.getSavedAccessToken(), null); assert.equal(e.cache.getFavoriteIds(), null); assert.deepEqual(e.routes, ['/profile/login']);
});

test('initial 401 becomes signed out without an error/retry loop', async t => {
  const e = await setup(t), s = e.hook(); await e.settle(); e.calls[0].resolve(response({}, 401)); await e.settle();
  assert.equal(await e.auth.getSavedAccessToken(), null); assert.equal(s.value.favoritesStatus, 'idle'); assert.equal(e.calls.length, 1);
});

test('stalled list times out at 12s, preserves unknown cache and can retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e = await setup(t), s = e.hook(); await e.settle(); t.mock.timers.tick(12000); await e.settle();
  assert.equal(e.calls[0].signal.aborted, true); assert.equal(s.value.favoritesStatus, 'error'); assert.equal(e.cache.getFavoriteIds(), null);
  s.value.retryFavorites(); await e.settle(); assert.equal(e.calls.length, 2);
  e.calls[1].resolve(response({ popups: [] })); await e.settle(); assert.equal(s.value.favoritesStatus, 'ready');
});

test('detail mutation invalidating cold GET triggers bounded recovery instead of a permanent disabled state', async t => {
  const e = await setup(t), s = e.hook(); await e.settle();
  e.cache.updateFavoriteCache('one', true); e.calls[0].resolve(response({ popups: [] })); await e.settle();
  assert.equal(e.calls.length, 2); assert.equal(e.cache.getFavoriteIds(), null);
  e.calls[1].resolve(response({ popups: [popup] })); await e.settle(); assert.equal(s.value.isFavorite('one'), true); assert.equal(s.value.isFavoriteDisabled('one'), false);
});

test('favorites page distinguishes error from empty, deduplicates retry and recovers on focus reentry', async t => {
  const e = await setup(t), s = e.page(); await e.settle(); e.calls[0].resolve(response({}, 503)); await e.settle();
  const retry = () => nodes(s.value).find(node => node.type === 'Pressable' && nodes(node).some(child => child.props?.children === '다시 시도하기'));
  assert.ok(retry()); assert.equal(nodes(s.value).some(node => node.props?.children === '아직 찜한 팝업이 없어요'), false);
  const press = retry().props.onPress; press(); press(); await e.settle(); assert.equal(e.calls.length, 2);
  e.calls[1].resolve(response({ popups: [popup] })); await e.settle(); assert.ok(nodes(s.value).some(node => node.props?.children === 'One'));
  s.focus(false); s.focus(true); await e.settle(); e.calls[2].reject(Error('offline')); await e.settle();
  assert.ok(nodes(s.value).some(node => node.props?.children === 'One'), 'refresh failure preserves cached rows');
  s.focus(false); s.focus(true); await e.settle(); e.calls[3].resolve(response({ popups: [] })); await e.settle();
  assert.ok(nodes(s.value).some(node => node.props?.children === '아직 찜한 팝업이 없어요'));
});

test('focused favorites page aborts previous account request and immediately requests B without refocus', async t => {
  const e = await setup(t); e.ignoreAbort(); const s = e.page(); await e.settle(); const old = e.calls[0];
  await e.account('B'); await e.settle(); assert.equal(old.signal.aborted, true); assert.equal(e.calls.length, 2);
  e.calls[1].resolve(response({ popups: [{ ...popup, publicId: 'b', name: 'B row' }] })); await e.settle();
  old.resolve(response({ popups: [{ ...popup, name: 'A row' }] })); await e.settle();
  assert.deepEqual([...e.cache.getFavoriteIds()], ['b']); assert.ok(nodes(s.value).some(node => node.props?.children === 'B row'));
  assert.equal(nodes(s.value).some(node => node.props?.children === 'A row'), false);
  await e.auth.clearTokens(); await e.settle(); assert.equal(e.cache.getFavoriteIds(), null); assert.equal(e.routes.at(-1), '/profile/login');
});

test('favorites page current 401 clears the session and redirects once without refetching forever', async t => {
  const e = await setup(t); e.page(); await e.settle(); e.calls[0].resolve(response({}, 401)); await e.settle();
  assert.equal(await e.auth.getSavedAccessToken(), null); assert.equal(e.cache.getFavoriteIds(), null);
  assert.deepEqual(e.routes, ['/profile/login']); assert.equal(e.calls.length, 1);
});

test('credential read crossing an account boundary cannot send an old operation with new account credentials', async t => {
  const e = await setup(t); let release, blocked = true;
  e.read(key => blocked ? new Promise(resolve => { release = resolve; }) : Promise.resolve(e.secure.get(key) ?? null));
  const operation = e.api.getFavoritePopups().catch(error => error); await Promise.resolve(); await Promise.resolve();
  await e.account('B'); blocked = false; release('A-token');
  assert.ok(await operation instanceof e.api.FavoriteSessionChangedError); assert.equal(e.calls.length, 0);
});
