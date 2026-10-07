const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
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
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const translate = (key, params) => `${params.count}${key.includes('minutes') ? '분' : key.includes('hours') ? '시간' : '일'} 전`;
const time = load('src/lib/communityTime.ts', { '../locales': { t: translate } });
const wait = load('src/lib/communityRefresh.ts');
const createdAt = '2026-10-04T10:00:00+09:00';
const initialTime = Date.parse(createdAt);
const post = { id: 1, type: 'POST', category: 'FREE', createdAt, content: 'old', author: { id: 1, nickname: 'writer', avatarUrl: null },
  images: [], liked: false, likeCount: 1, commentCount: 2, viewCount: 3, regionName: null, popup: null, rating: null };

function hooks() {
  const states = [], refs = [], callbacks = [], effects = [];
  let stateIndex = 0, refIndex = 0, callbackIndex = 0, effectIndex = 0, focus;
  const react = {
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useCallback(fn, deps) { const index = callbackIndex++, old = callbacks[index];
      if (old && deps.every((dep, i) => dep === old.deps[i])) return old.fn;
      callbacks[index] = { fn, deps }; return fn; },
    useEffect(fn, deps) { const index = effectIndex++, old = effects[index];
      if (old && deps.every((dep, i) => dep === old.deps[i])) return;
      old?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; },
  };
  return { react, render(Component, props) { stateIndex = refIndex = callbackIndex = effectIndex = 0; return Component(props); },
    useFocusEffect(fn) { if (focus !== fn) { focus = fn; fn(); } }, focus() { focus?.(); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); } };
}

function setup() {
  const state = hooks(), listeners = new Set(), calls = [];
  const appState = { currentState: 'active', addEventListener(_, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const hook = load('src/hooks/useCommunityNow.ts', { react: state.react, 'react-native': { AppState: appState } });
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'ScrollView', 'Text', 'View', 'Image'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  let response = async () => ({ items: [post], nextCursor: 'old-cursor' });
  const jsx = (type, props, key) => ({ type, props, key });
  const common = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'lucide-react-native': Object.fromEntries(['Pencil', 'Settings', 'ChevronRight', 'Heart', 'MapPin', 'MessageCircle', 'Star', 'UserRound'].map(name => [name, name])),
    '../../locales': { t: (key, params) => key === 'community.views' ? `조회 ${params.count}` : key }, '../../theme/communityColors': { communityColors: {} },
    '../../theme/tokens': { radius: {}, spacing: {}, typography: {} }, '../../lib/communityTime': time };
  const Card = load('src/components/community/CommunityPostItem.tsx', common).default;
  const Screen = load('src/screens/CommunityScreen.tsx', { ...common, react: state.react,
    'expo-router': { useFocusEffect: fn => state.useFocusEffect(fn), useRouter: () => ({ push() {} }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
    '../components/community/CommunityPostItem': { default: 'CommunityPostItem' },
    '../components/navigation/FloatingTabBar': { FLOATING_TAB_BAR_BOTTOM_GAP: 0, FLOATING_TAB_BAR_HEIGHT: 0 },
    '../lib/community': { getCommunityFeed(category, sort, cursor, signal) { calls.push({ category, sort, cursor, signal }); return response(cursor); } },
    '../lib/communityFeedRefresh': { communityFeedRevision: () => 0, subscribeCommunityLikes: () => () => {}, subscribeCommunityCommentCounts: () => () => {}, subscribeCommunityPostChanges: () => () => {} },
    '../lib/communityLikes': { changeCommunityLike: async () => {} }, '../lib/auth': { subscribeAuthSession: () => () => {} },
    '../hooks/useCommunityNow': hook, '../lib/communityRefresh': wait,
    '../locales': { t: key => key }, '../theme/communityColors': { communityColors: {} },
    '../theme/tokens': { radius: {}, spacing: {}, typography: {} },
  }).default;
  return { calls, state, Card, Screen, listeners,
    list: () => nodes(state.render(Screen)).find(node => node.type === 'FlatList'),
    respond(fn) { response = fn; },
    lifecycle(value) { appState.currentState = value; listeners.forEach(fn => fn(value)); } };
}

test('relative formatter calculates 0, 1, 2 minutes without changing createdAt and handles boundaries', () => {
  for (const minutes of [0, 1, 2]) assert.equal(time.formatCommunityTime(createdAt, initialTime + minutes * 60000), `${minutes}분 전`);
  assert.equal(time.formatCommunityTime(createdAt, initialTime + 59999), '0분 전');
  assert.equal(time.formatCommunityTime(createdAt, initialTime + 3600000), '1시간 전');
  assert.equal(time.formatCommunityTime(createdAt, initialTime + 86400000), '1일 전');
  assert.equal(time.formatCommunityTime(createdAt, initialTime - 60000), '0분 전');
  assert.equal(time.formatCommunityTime('invalid', initialTime), 'invalid');
});

test('one screen clock updates all cards each minute, refreshes immediately and resumes on foreground', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: initialTime });
  const env = setup();
  try {
    env.list(); await flush();
    const cardTime = () => {
      const list = env.list(); const element = list.props.renderItem({ item: list.props.data[0] });
      assert.equal(element.props.now, list.props.extraData);
      return nodes(env.Card(element.props)).find(node => node.type === 'Text' && Array.isArray(node.props.children)).props.children[0];
    };
    assert.equal(cardTime(), '0분 전');
    t.mock.timers.tick(60000); assert.equal(cardTime(), '1분 전');
    t.mock.timers.tick(60000); assert.equal(cardTime(), '2분 전');
    env.lifecycle('background'); t.mock.timers.tick(180000); assert.equal(cardTime(), '2분 전');
    env.lifecycle('active'); assert.equal(cardTime(), '5분 전');
    // Change wall time without firing the interval: refresh itself must update now.
    t.mock.timers.setTime(initialTime + 7 * 60000);
    env.list().props.onRefresh(); assert.equal(cardTime(), '7분 전'); await flush();
    assert.equal(env.list().props.data[0].createdAt, createdAt);
    const authorState = hooks();
    const Author = load('src/components/community/CommunityAuthor.tsx', { react: authorState.react,
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'react-native': { Image: 'Image', Text: 'Text', View: 'View', StyleSheet: { create: x => x } },
      'lucide-react-native': { UserRound: 'UserRound' }, '../../lib/communityTime': time,
      '../../theme/communityColors': { communityColors: {} }, '../../theme/tokens': { radius: {}, spacing: {}, typography: {} } }).default;
    assert.ok(nodes(authorState.render(Author, { author: post.author, createdAt, now: env.list().props.extraData }))
      .some(node => node.props?.children === '7분 전'));
  } finally { env.state.cleanup(); assert.equal(env.listeners.size, 0); }
});

test('refresh replaces same-ID server values and cursor; overlapping pagination updates instead of preserving old values', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: initialTime });
  const env = setup();
  try {
    env.list(); await flush();
    const original = env.list().props.data[0];
    const fresh = { ...post, viewCount: 30, likeCount: 10, commentCount: 20, liked: true, content: 'new', images: ['new.webp'] };
    env.respond(async () => ({ items: [fresh], nextCursor: 'new-cursor' }));
    env.list().props.onRefresh(); await flush();
    assert.equal(env.list().props.data[0], fresh); assert.notEqual(env.list().props.data[0], original);
    assert.deepEqual(env.list().props.data[0], fresh);
    const rendered = env.Card(env.list().props.renderItem({ item: env.list().props.data[0] }).props);
    const text = nodes(rendered).filter(node => node.type === 'Text').map(node => node.props.children);
    assert.ok(text.includes('조회 30')); assert.ok(text.includes(10)); assert.ok(text.includes(20)); assert.ok(text.includes('new'));
    assert.equal(nodes(rendered).find(node => node.props?.accessibilityLabel === '좋아요 취소').props.accessibilityState.selected, true);
    assert.deepEqual(env.calls.at(-1).category, 'ALL'); assert.equal(env.calls.at(-1).sort, 'LATEST'); assert.equal(env.calls.at(-1).cursor, null);
    assert.equal(env.list().props.refreshing, true);
    t.mock.timers.tick(1000); await flush();
    const newer = { ...fresh, viewCount: 31, likeCount: 11, commentCount: 21, liked: false, content: 'newer' };
    env.respond(async () => ({ items: [newer, { ...post, id: 2 }], nextCursor: null }));
    env.list().props.onEndReached(); await flush();
    assert.equal(env.calls.at(-1).cursor, 'new-cursor');
    assert.deepEqual(env.list().props.data.map(item => item.id), [1, 2]); assert.equal(env.list().props.data[0], newer);
    const count = env.calls.length; const saved = env.list().props.data;
    env.state.focus(); await flush(); assert.equal(env.calls.length, count); assert.equal(env.list().props.data, saved);
    assert.equal(env.list().key, undefined);
  } finally { env.state.cleanup(); }
});

test('refresh UI holds for total 1000ms on 200ms/700ms APIs and failures, and adds no delay to a 1500ms API', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: initialTime });
  const env = setup();
  try {
    env.list(); await flush();
    for (const [duration, fail] of [[200, false], [700, false], [700, true], [1500, false], [1500, true]]) {
      let resolve, reject;
      env.respond(() => new Promise((done, failed) => { resolve = done; reject = failed; }));
      env.list().props.onRefresh(); const count = env.calls.length;
      env.list().props.onRefresh(); env.list().props.onEndReached(); assert.equal(env.calls.length, count);
      assert.equal(env.list().props.refreshing, true);
      t.mock.timers.tick(duration);
      if (fail) reject(new Error('offline')); else resolve({ items: [post], nextCursor: 'next' });
      await flush();
      if (duration < 1000) {
        assert.equal(env.list().props.refreshing, true);
        env.list().props.onRefresh(); env.list().props.onEndReached(); assert.equal(env.calls.length, count);
        t.mock.timers.tick(1000 - duration - 1); await flush(); assert.equal(env.list().props.refreshing, true);
        t.mock.timers.tick(1); await flush();
      }
      assert.equal(env.list().props.refreshing, false);
    }
  } finally { env.state.cleanup(); }
});

test('filter changes and unmount abort the minimum-duration wait without stale updates', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: initialTime });
  const env = setup();
  try {
    env.list(); await flush(); env.list().props.onRefresh(); await flush();
    const old = env.calls.at(-1);
    const chip = nodes(env.list().props.ListHeaderComponent).find(node => node.props?.children?.props?.children === 'community.category.question');
    env.respond(async () => ({ items: [], nextCursor: null })); chip.props.onPress(); env.list(); await flush();
    assert.equal(old.signal.aborted, true); assert.equal(env.list().props.refreshing, false);
    assert.equal(env.calls.at(-1).category, 'QUESTION');
    t.mock.timers.tick(1000); await flush(); assert.deepEqual(env.list().props.data, []);
    env.list().props.onRefresh(); await flush(); const last = env.calls.at(-1);
    env.state.cleanup(); await flush(); assert.equal(last.signal.aborted, true);
  } finally { env.state.cleanup(); }
});
