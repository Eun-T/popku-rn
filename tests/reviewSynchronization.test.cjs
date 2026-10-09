const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { nodes } = require('./helpers/uiTree.cjs');
const { withUiDependencies } = require('./helpers/uiDependencies.cjs');

function load(file, mocks = {}, globals = {}) {
  mocks = withUiDependencies(file, mocks);
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  new Function('require', 'module', 'exports', '__DEV__', ...Object.keys(globals), compiled.outputText)(name => {
    assert.ok(name in mocks, `Missing dependency ${name} in ${file}`);
    return mocks[name];
  }, module, module.exports, false, ...Object.values(globals));
  return module.exports;
}

function hooks() {
  const slots = [], effects = []; let cursor = 0, dirty = false, focused = true;
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
      let tree, count = 0;
      do {
        assert.ok(count++ < 30, 'render settles'); cursor = 0; dirty = false;
        tree = Component(); effects.splice(0).forEach(fn => fn());
      } while (dirty);
      return tree;
    },
    focus(value) { focused = value; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const fixture = (id, rating = 4, publicId = 'one') => ({ id, type: 'REVIEW', category: 'REVIEW',
  author: { id: 1, nickname: 'me', avatarUrl: null }, popup: { publicId, title: 'Popup' },
  rating, content: `review ${id}`, createdAt: '2026-10-08T10:00:00+09:00', updatedAt: '2026-10-08T10:00:00+09:00',
  images: [], regionName: null, liked: false, likeCount: 0, commentCount: 0, viewCount: 0, isOwner: true });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body) });
const apiKind = url => url.includes('/users/me/reviews') ? 'mine' : url.includes('/popups/')
  ? url.includes('/reviews') ? 'rows' : 'detail' : 'review';

function setup(t, initial = []) {
  const records = new Map(initial.map(item => [item.id, structuredClone(item)]));
  const calls = [], clients = [], held = [], alerts = [], routes = [], authListeners = new Set();
  let hold = () => false, failure = () => false, nextId = 100, pageSize = 20;
  let user = { id: 1, nickname: 'me' }, generation = 1;
  const auth = { getAuthSession: async () => ({ accessToken: user ? 'jwt' : null, generation }), getAuthUser: () => user,
    authSessionGeneration: () => generation,
    subscribeAuthUser: listener => { authListeners.add(listener); return () => authListeners.delete(listener); },
    subscribeAuthSession: () => () => {}, clearTokens: async expected => {
      if (expected !== generation) return false;
      generation++; user = null; authListeners.forEach(listener => listener()); return true;
    } };
  const refresh = load('src/lib/communityFeedRefresh.ts');
  const diagnostics = { readCommunityErrorBody: async r => r.text() };
  const detailBody = publicId => {
    const rows = [...records.values()].filter(row => row.popup.publicId === publicId);
    return { publicId, name: 'Popup', countryCode: 'KR', tags: [], coverImageUrl: null, contentImageUrls: [],
      socialLinks: null, latitude: null, longitude: null, startDate: null, endDate: null,
      isFavorited: false, favoriteCount: 0, reviewCount: rows.length,
      averageRating: rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : 0 };
  };
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET', kind = apiKind(url), call = { url, ...init, method, kind };
    calls.push(call);
    const failed = failure(call);
    if (failed) {
      const status = typeof failed === 'number' ? failed : 500;
      if (hold(call)) return new Promise(resolve => held.push({ ...call, body: {}, release: () => resolve(response({}, status)) }));
      return response({}, status);
    }
    const path = new URL(url).pathname;
    let body, status = 200;
    if (method === 'POST') {
      const publicId = decodeURIComponent(path.split('/')[3]), data = JSON.parse(init.body);
      const row = { ...fixture(nextId++, data.rating, publicId), content: data.content };
      records.set(row.id, row); body = { id: row.id }; status = 201;
    } else if (method === 'PATCH') {
      const id = Number(path.split('/').at(-1)), data = JSON.parse(init.body);
      body = { ...records.get(id), rating: data.rating, content: data.content, updatedAt: '2026-10-09T00:00:00+09:00' };
      records.set(id, body);
    } else if (method === 'DELETE') {
      records.delete(Number(path.split('/').at(-1))); status = 204;
    } else if (kind === 'detail') body = detailBody(decodeURIComponent(path.split('/')[3]));
    else if (kind === 'review') body = records.get(Number(path.split('/').at(-1)));
    else {
      const publicId = kind === 'rows' ? decodeURIComponent(path.split('/')[3]) : null;
      const after = new URL(url).searchParams.get('cursor');
      const rows = [...records.values()].filter(row => (!publicId || row.popup.publicId === publicId) && (!after || row.id < Number(after))).sort((a, b) => b.id - a.id);
      const items = rows.slice(0, pageSize);
      body = { items, nextCursor: rows.length > pageSize ? String(items.at(-1).id) : null };
    }
    body = structuredClone(body);
    if (hold(call)) {
      // Deliberately ignore abort to exercise guards, even with an uncooperative transport.
      return new Promise(resolve => held.push({ ...call, body, release: (replacement = body) => resolve(response(replacement, status)) }));
    }
    return response(body, status);
  };
  const constants = { API_BASE_URL: 'https://api.test' };
  const locales = require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts');
  const community = load('src/lib/community.ts', { '../constants/api': constants, './auth': auth,
    './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh }, { fetch });
  const reviews = load('src/lib/reviews.ts', { '../constants/api': constants, './auth': auth, './community': community,
    './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh, './communityImages': {} }, { fetch });
  const mine = load('src/lib/myReviews.ts', { '../constants/api': constants, './auth': auth, './community': community,
    './communityDiagnostics': diagnostics, './communityFeedRefresh': refresh }, { fetch });
  const popups = load('src/lib/popups.ts', { '../constants/api': constants, '../locales': locales }, { fetch });
  const jsx = (type, props, key) => ({ type, props, key });
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name]));
  Object.assign(native, { StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }), Alert: { alert: (...args) => alerts.push(args) } });
  const router = { canGoBack: () => true, back: () => routes.push('back'), replace: href => routes.push(href), dismissTo: href => routes.push(href), push: href => routes.push(href) };
  function mount(kind, publicId = 'one', reviewId = 1) {
    const state = hooks();
    const common = { react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'lucide-react-native': {},
      'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id: publicId }), useFocusEffect: fn => state.useFocusEffect(fn) },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }) } };
    let Component;
    if (kind === 'detail') Component = load('src/app/places/[id].tsx', { ...common,
      '../../components/common/Tag': { __esModule: true, default: 'Tag' }, '../../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 12, FLOATING_TAB_BAR_HEIGHT: 60 },
      ...Object.fromEntries(['PopupGuidanceCarousel', 'PopupHeroImage', 'IntroductionImageCarousel', 'OfficialChannelIcon', 'PopupDetailSkeleton', 'PopupReviews']
        .map(name => [`../../components/place/${name}`, { __esModule: true, default: name }])),
      '../../components/place/PlaceMapPreview': { __esModule: true, default: 'MapPreview', isMapPreviewAvailable: false },
      '../../lib/auth': auth, '../../lib/favorites': { favoritePopup: async () => ({ isFavorited: true, favoriteCount: 1 }) },
      '../../lib/popups': popups, '../../lib/reviews': reviews, '../../lib/popupStatus': { popupOperatingStatus: () => null },
      '../../lib/popupDetailContent': load('src/lib/popupDetailContent.ts'), '../../locales': locales,
    }).default;
    else if (kind === 'rows') {
      const Tab = load('src/components/place/PopupReviews.tsx', { ...common,
        '../community/CommunityPostItem': { __esModule: true, default: 'Card' }, '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 123 }) },
        '../../lib/auth': auth, '../../lib/communityFeedRefresh': refresh, '../../lib/communityLikes': {}, '../../lib/reviews': reviews });
      Component = () => Tab.default({ publicId, title: 'Popup' });
    } else if (kind === 'actions') {
      const Actions = load('src/components/reviews/ReviewActions.tsx', { ...common,
        '../community/CommunityPostMenu': { __esModule: true, default: 'Menu' },
        '../../lib/auth': auth, '../../lib/community': community, '../../lib/reviews': reviews,
        '../../locales': locales,
      }).default;
      const row = structuredClone(records.get(reviewId));
      Component = () => Actions({ review: row });
    } else Component = load('src/app/profile/reviews.tsx', { ...common,
      '../../components/community/CommunityPostItem': { __esModule: true, default: 'Card' },
      '../../hooks/usePopupNavigation': { usePopupNavigation: () => () => {} }, '../../hooks/useCommunityNow': { useCommunityNow: () => ({ now: 123 }) },
      '../../lib/auth': auth, '../../lib/community': community, '../../lib/communityFeedRefresh': refresh,
      '../../lib/myReviews': mine, '../../lib/reviews': reviews,
    }).default;
    let tree;
    const render = () => tree = state.render(Component);
    const client = { render, get tree() { return tree; }, focus(value) { state.focus(value); render(); }, unmount: state.unmount,
      texts: () => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children),
      items: () => kind === 'mine' ? nodes(tree).find(node => node.type === 'FlatList').props.data
        : nodes(tree).filter(node => node.type === 'Card').map(node => node.props.post) };
    clients.push(client); render(); return client;
  }
  const settle = async () => { for (let i = 0; i < 35; i++) { await Promise.resolve(); clients.forEach(client => client.render()); } };
  t.after(() => clients.forEach(client => client.unmount()));
  return { records, calls, held, alerts, routes, mount, settle, reviews, refresh, detailBody,
    setUser(next) { user = next; generation++; authListeners.forEach(listener => listener()); },
    count: kind => calls.filter(call => call.kind === kind && call.method === 'GET').length,
    hold: fn => { hold = fn; }, fail: fn => { failure = fn; },
    pageSize: size => { pageSize = size; },
    async create(publicId, rating, content = 'new') {
      const result = await reviews.createReview(publicId, rating, content); reviews.reviewsCreated(publicId); return result;
    },
    async edit(id, rating, content = 'edited') { const row = await reviews.updateReview(id, rating, content, []); reviews.reviewUpdated(row); },
    async remove(id) { const row = records.get(id); await reviews.deleteReview(id); reviews.reviewDeleted(row); },
  };
}

function summary(screen, count, rating) {
  assert.ok(screen.texts().includes(count ? `후기 ${count}개` : '후기'));
  assert.ok(screen.texts().includes(count ? rating.toFixed(1) : '—'));
  assert.ok(nodes(screen.tree).some(node => node.props?.accessibilityLabel === (count
    ? `평균 별점 ${rating.toFixed(1)}점, 방문 리뷰로 이동` : '별점 없음, 방문 리뷰로 이동')));
}

test('F10 create refreshes popup rows, server count/average and mounted own reviews once', async t => {
  const s = setup(t), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); summary(detail, 0, 0); assert.deepEqual(rows.items(), []); assert.deepEqual(mine.items(), []);
  await s.create('one', 5); await s.settle();
  summary(detail, 1, 5); assert.equal(rows.items()[0].content, 'new'); assert.equal(mine.items()[0].rating, 5);
  for (const kind of ['detail', 'rows', 'mine']) assert.equal(s.count(kind), 2);
  detail.focus(false); rows.focus(false); detail.focus(true); rows.focus(true); await s.settle();
  assert.equal(s.count('detail'), 2); assert.equal(s.count('rows'), 2, 'focus after success does not duplicate refresh');
});

test('F10 edit patches rows and own reviews, keeps count and reads the full server average', async t => {
  const s = setup(t, [fixture(1, 5), fixture(2, 1)]), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); summary(detail, 2, 3);
  await s.edit(1, 2, 'changed'); await s.settle(); summary(detail, 2, 1.5);
  for (const list of [rows, mine]) {
    const item = list.items().find(row => row.id === 1); assert.equal(item.content, 'changed'); assert.equal(item.rating, 2);
  }
  assert.equal(s.count('rows'), 1); assert.equal(s.count('mine'), 1, 'edits reuse the typed patch');
  assert.equal(s.count('detail'), 2); assert.equal(s.refresh.communityFeedRevision(), 0);
});

test('F10 delete reduces count, removes rows everywhere and displays no rating after last deletion', async t => {
  const s = setup(t, [fixture(1, 5), fixture(2, 1)]), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); await s.remove(1); await s.settle(); summary(detail, 1, 1);
  assert.deepEqual(rows.items().map(row => row.id), [2]); assert.deepEqual(mine.items().map(row => row.id), [2]);
  await s.remove(2); await s.settle(); summary(detail, 0, 0);
  assert.deepEqual(rows.items(), []); assert.deepEqual(mine.items(), []);
  assert.ok(rows.texts().includes('아직 방문 리뷰가 없어요')); assert.ok(mine.texts().includes('아직 작성한 방문 리뷰가 없어요'));
  assert.equal(s.count('rows'), 1); assert.equal(s.count('mine'), 1); assert.equal(s.refresh.communityFeedRevision(), 0);
});

test('F10 failed refresh preserves existing data and retries the first page, not the old cursor', async t => {
  const s = setup(t, [fixture(1, 4)]), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); detail.focus(false);
  s.fail(call => call.method === 'GET'); await s.create('one', 2); await s.settle();
  summary(detail, 1, 4); assert.deepEqual(rows.items().map(row => row.id), [1]); assert.deepEqual(mine.items().map(row => row.id), [1]);
  assert.ok(rows.texts().includes('방문 리뷰를 불러오지 못했어요')); assert.ok(mine.texts().includes('방문 리뷰를 불러오지 못했어요'));
  const failedCalls = s.calls.length; await s.settle(); assert.equal(s.calls.length, failedCalls, 'failure does not cause an automatic retry loop');
  s.fail(() => false); detail.focus(true);
  for (const [screen, label] of [[rows, '다시 시도'], [mine, '다시 시도하기']]) {
    nodes(screen.tree).find(node => node.type === 'Pressable' && node.props.children?.props?.children === label).props.onPress();
  }
  await s.settle(); summary(detail, 2, 3); assert.equal(rows.items().length, 2); assert.equal(mine.items().length, 2);
  assert.ok(s.calls.filter(call => call.method === 'GET' && ['rows', 'mine'].includes(call.kind)).every(call => !call.url.includes('cursor=')));
});

test('F10 failed mutations emit no invalidation and preserve current data', async t => {
  const s = setup(t, [fixture(1, 4)]), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); const events = []; const off = s.reviews.subscribeReviews((...args) => events.push(args)); t.after(off);
  s.fail(call => call.method !== 'GET');
  await assert.rejects(s.create('one', 5)); await assert.rejects(s.edit(1, 1)); await assert.rejects(s.remove(1));
  await s.settle(); summary(detail, 1, 4); assert.deepEqual(events, []);
  for (const list of [rows, mine]) assert.equal(list.items()[0].rating, 4);
  for (const kind of ['detail', 'rows', 'mine']) assert.equal(s.count(kind), 1);
});

test('F10 old initial GET responses cannot overwrite a create and newer aggregate requests', async t => {
  const s = setup(t); s.hold(call => call.method === 'GET');
  const detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine'); await s.settle();
  assert.equal(s.held.length, 3); const old = [...s.held];
  await s.create('one', 5); await s.settle(); assert.equal(s.held.length, 6);
  for (const read of old) assert.ok(read.signal.aborted, 'mutation invalidates old in-flight reads synchronously');
  for (const read of s.held.slice(3)) read.release(); await s.settle();
  summary(detail, 1, 5); assert.equal(rows.items().length, 1); assert.equal(mine.items().length, 1);
  for (const read of old) read.release(); await s.settle();
  summary(detail, 1, 5); assert.equal(rows.items().length, 1); assert.equal(mine.items().length, 1);
  assert.equal(s.count('detail'), 2);
});

test('F10 successive edits and deletes ignore reversed aggregate responses and preserve favorite changes', async t => {
  const s = setup(t, [fixture(1, 5), fixture(2, 1)]), detail = s.mount('detail'); await s.settle();
  s.hold(call => call.kind === 'detail'); await s.edit(1, 2); await s.settle();
  await s.remove(2); await s.settle(); assert.equal(s.held.length, 2); assert.ok(s.held[0].signal.aborted);
  nodes(detail.tree).find(node => node.props?.testID === 'popup-floating-favorite').props.onPress(); await s.settle();
  s.held[1].release(); await s.settle(); summary(detail, 1, 2);
  s.held[0].release(); await s.settle(); summary(detail, 1, 2);
  assert.equal(nodes(detail.tree).find(node => node.props?.testID === 'popup-floating-favorite').props.accessibilityState.selected, true);
  assert.equal(nodes(detail.tree).find(node => node.props?.accessibilityLabel === '찜 해제').props.children[1].props.children, 1);
  assert.equal(s.count('detail'), 3, 'outdated finally cannot schedule an extra GET');
});

test('F10 initial list GETs preserve newer edit/delete patches while an aggregate GET is invalidated', async t => {
  const s = setup(t, [fixture(1, 5), fixture(2, 1)]); s.hold(call => call.method === 'GET');
  const detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine'); await s.settle();
  await s.edit(1, 2); await s.remove(2); await s.settle();
  for (const read of s.held) read.release(); await s.settle(); summary(detail, 1, 2);
  for (const list of [rows, mine]) { assert.equal(list.items().length, 1); assert.equal(list.items()[0].id, 1); assert.equal(list.items()[0].rating, 2); }
  assert.equal(s.count('rows'), 1); assert.equal(s.count('mine'), 1);
});

test('F10 mutations coalesce in one render and only the affected popup aggregate is refreshed', async t => {
  const s = setup(t, [fixture(1, 4)]), detail = s.mount('detail'), other = s.mount('detail', 'other'), rows = s.mount('rows'), mine = s.mount('mine');
  await s.settle(); s.records.set(3, fixture(3, 2));
  s.reviews.reviewsCreated('one'); s.reviews.reviewsCreated('one'); s.reviews.reviewUpdated(s.records.get(1));
  await s.settle(); summary(detail, 2, 3); summary(other, 0, 0);
  assert.equal(s.count('detail'), 3, 'two initial details and one aggregate refresh');
  assert.equal(s.count('rows'), 2); assert.equal(s.count('mine'), 2); assert.equal(rows.items().length, 2); assert.equal(mine.items().length, 2);
});

test('F10 fresh entry uses latest server values without requiring a mounted mutation subscriber', async t => {
  const s = setup(t); await s.create('one', 5); await s.edit(100, 2);
  const detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine'); await s.settle();
  summary(detail, 1, 2); assert.equal(rows.items()[0].rating, 2); assert.equal(mine.items()[0].rating, 2);
  for (const kind of ['detail', 'rows', 'mine']) assert.equal(s.count(kind), 1);
});

test('F10 malformed aggregate refresh cannot replace valid summary or clear detail', async t => {
  const s = setup(t, [fixture(1, 4)]), detail = s.mount('detail'); await s.settle();
  s.hold(call => call.kind === 'detail'); await s.edit(1, 1); await s.settle();
  s.held[0].release({ ...s.detailBody('one'), reviewCount: -1, averageRating: 6 }); await s.settle();
  summary(detail, 1, 4); assert.ok(nodes(detail.tree).some(node => node.type === 'PopupHeroImage'));
  detail.focus(false); detail.focus(true); await s.settle();
  s.held[1].release(); await s.settle(); summary(detail, 1, 1);
});

test('F10 failed first-page refresh with an existing cursor retries once and retains pagination', async t => {
  const s = setup(t, [fixture(1, 4), fixture(2, 4)]); s.pageSize(1);
  const detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine'); await s.settle();
  s.fail(call => call.method === 'GET'); await s.create('one', 2); await s.settle();
  summary(detail, 2, 4);
  for (const list of [rows, mine]) assert.deepEqual(list.items().map(row => row.id), [2]);
  s.fail(() => false); detail.focus(false); detail.focus(true);
  for (const [screen, label] of [[rows, '다시 시도'], [mine, '다시 시도하기']]) {
    const retry = nodes(screen.tree).find(node => node.type === 'Pressable' && node.props.children?.props?.children === label);
    retry.props.onPress(); retry.props.onPress();
  }
  await s.settle(); summary(detail, 3, 10 / 3);
  for (const list of [rows, mine]) assert.deepEqual(list.items().map(row => row.id), [100]);
  for (const kind of ['rows', 'mine']) {
    const reads = s.calls.filter(call => call.kind === kind && call.method === 'GET');
    assert.equal(reads.length, 3, 'initial, failed refresh and one retry');
    assert.ok(!reads.at(-1).url.includes('cursor='), 'retry revalidates the failed first page');
  }
  nodes(rows.tree).find(node => node.type === 'Pressable' && node.props.children?.props?.children === '리뷰 더 보기').props.onPress();
  nodes(mine.tree).find(node => node.type === 'FlatList').props.onEndReached(); await s.settle();
  for (const list of [rows, mine]) assert.deepEqual(list.items().map(row => row.id), [100, 2]);
  for (const kind of ['rows', 'mine']) assert.ok(s.calls.filter(call => call.kind === kind).at(-1).url.includes('cursor=100'));
});

test('F10 aggregates come from all server reviews regardless of the loaded page', async t => {
  const s = setup(t, [fixture(1, 1), fixture(2, 3), fixture(3, 5)]); s.pageSize(1);
  const detail = s.mount('detail'), rows = s.mount('rows'); await s.settle();
  assert.equal(rows.items()[0].rating, 5); summary(detail, 3, 3);
  await s.edit(1, 4); await s.settle(); summary(detail, 3, 4);
  assert.equal(rows.items().length, 1); assert.equal(rows.items()[0].rating, 5);
  assert.equal(s.count('rows'), 1, 'editing an unloaded row does not reload the page');
});

function reviewMenu(actions) {
  return nodes(actions.tree).find(node => node.type === 'Menu');
}
function openReviewMenu(actions) {
  let stopped = 0;
  const button = nodes(actions.tree).find(node => node.props?.accessibilityLabel === '리뷰 메뉴');
  button.props.onPress({ stopPropagation() { stopped++; } });
  actions.render();
  assert.equal(stopped, 1, 'menu press cannot bubble to review navigation');
  assert.equal(reviewMenu(actions).props.edgeToEdge, true);
  return reviewMenu(actions).props.onSelect;
}

test('review menu: both lists bind the existing action component to review IDs and opening it performs no list reads', async t => {
  const s = setup(t, [fixture(7)]), rows = s.mount('rows'), mine = s.mount('mine'), actions = s.mount('actions', 'one', 7);
  await s.settle();
  const popupCard = nodes(rows.tree).find(node => node.type === 'Card');
  const list = nodes(mine.tree).find(node => node.type === 'FlatList');
  const ownCard = list.props.renderItem({ item: list.props.data[0] }).props.children;
  for (const card of [popupCard, ownCard]) {
    assert.equal(card.props.reviewActions.type, 'ReviewActions');
    assert.equal(card.props.reviewActions.props.review.id, 7);
    assert.equal(card.props.reviewActions.props.review.popup.publicId, 'one');
  }
  const data = list.props.data, reads = s.calls.length;
  const select = openReviewMenu(actions); await s.settle();
  assert.equal(nodes(mine.tree).find(node => node.type === 'FlatList').props.data, data);
  assert.equal(s.calls.length, reads); assert.deepEqual(s.routes, []);
  select(0); await s.settle(); assert.equal(reviewMenu(actions), undefined);
  openReviewMenu(actions)(1); await s.settle();
  assert.deepEqual(s.routes, [{ pathname: '/reviews/write', params: { editId: '7' } }]);
});

test('review menu: ownership uses numeric authenticated user ID and revokes a pending confirmation on account change', async t => {
  const s = setup(t, [fixture(1)]), actions = s.mount('actions'); await s.settle();
  openReviewMenu(actions)(2); await s.settle(); const pending = s.alerts.at(-1)[2];
  s.setUser({ id: 2, nickname: 'me' }); await s.settle();
  assert.equal(nodes(actions.tree).some(node => node.props?.accessibilityLabel === '리뷰 메뉴'), false);
  pending.find(item => item.style === 'destructive').onPress(); await s.settle();
  assert.equal(s.calls.length, 0); assert.ok(s.records.has(1));
  for (const user of [null, { nickname: 'me' }, { id: '1', nickname: 'me' }]) {
    s.setUser(user); await s.settle();
    assert.equal(nodes(actions.tree).some(node => node.props?.accessibilityLabel === '리뷰 메뉴'), false);
  }
});

test('review menu: delete cancel and failure preserve both lists and server aggregate, then retry removes the last review', async t => {
  const s = setup(t, [fixture(1, 5)]), detail = s.mount('detail'), rows = s.mount('rows'), mine = s.mount('mine'), actions = s.mount('actions');
  await s.settle();
  openReviewMenu(actions)(2); await s.settle();
  assert.equal(s.alerts.at(-1)[0], '리뷰를 삭제할까요?');
  s.alerts.at(-1)[2].find(action => action.style === 'cancel').onPress(); await s.settle();
  assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 0);
  s.fail(call => call.method === 'DELETE');
  openReviewMenu(actions)(2); await s.settle();
  s.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress(); await s.settle();
  summary(detail, 1, 5);
  for (const list of [rows, mine]) assert.deepEqual(list.items().map(item => item.id), [1]);
  assert.equal(s.alerts.at(-1)[0], '리뷰를 삭제하지 못했어요');
  s.fail(() => false); openReviewMenu(actions)(2); await s.settle();
  const remove = s.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress;
  remove(); remove(); await s.settle();
  assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 2, 'one failure and one retry, never duplicate DELETE');
  summary(detail, 0, 0); assert.deepEqual(rows.items(), []); assert.deepEqual(mine.items(), []);
  assert.deepEqual(s.routes, []); assert.equal(s.count('detail'), 2);
  assert.equal(s.count('rows'), 1); assert.equal(s.count('mine'), 1);
});

test('review menu: duplicate selections and confirmation callbacks issue one mutation while busy', async t => {
  const s = setup(t, [fixture(1, 5), fixture(2, 1)]), detail = s.mount('detail'), rows = s.mount('rows'), actions = s.mount('actions');
  await s.settle(); s.hold(call => call.method === 'DELETE');
  const select = openReviewMenu(actions); select(2); select(2); await s.settle();
  assert.equal(s.alerts.length, 1);
  const remove = s.alerts[0][2].find(action => action.style === 'destructive').onPress;
  remove(); remove(); await s.settle();
  assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 1);
  assert.equal(nodes(actions.tree).find(node => node.props?.accessibilityLabel === '리뷰 메뉴').props.disabled, true);
  assert.deepEqual(rows.items().map(item => item.id), [2, 1]); summary(detail, 2, 3);
  s.held[0].release(); await s.settle(); summary(detail, 1, 1);
  assert.deepEqual(rows.items().map(item => item.id), [2]);
});

test('review menu: stale confirmation after leaving the list cannot mutate or navigate', async t => {
  const s = setup(t, [fixture(1)]), actions = s.mount('actions'); await s.settle();
  openReviewMenu(actions)(2); await s.settle();
  const remove = s.alerts[0][2].find(action => action.style === 'destructive').onPress;
  actions.focus(false); remove(); await s.settle();
  assert.equal(s.calls.length, 0); assert.deepEqual(s.routes, []);
  actions.focus(true); await s.settle(); const edit = openReviewMenu(actions); edit(1); edit(1); await s.settle();
  assert.deepEqual(s.routes, [{ pathname: '/reviews/write', params: { editId: '1' } }]);
});

for (const stale of [false, true]) test(`review menu: ${stale ? 'stale' : 'current'} delete 401 preserves rows and respects F03 session generation`, async t => {
  const s = setup(t, [fixture(1)]), rows = s.mount('rows'), actions = s.mount('actions'); await s.settle();
  s.fail(call => call.method === 'DELETE' ? 401 : false); s.hold(call => call.method === 'DELETE');
  openReviewMenu(actions)(2); await s.settle();
  s.alerts[0][2].find(action => action.style === 'destructive').onPress(); await s.settle();
  if (stale) s.setUser({ id: 2, nickname: 'new account' });
  s.held[0].release(); await s.settle();
  assert.deepEqual(rows.items().map(item => item.id), [1]); assert.ok(s.records.has(1));
  assert.deepEqual(s.routes, stale ? [] : ['/profile/login']);
  assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 1);
});
