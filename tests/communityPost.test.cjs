const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  if (file !== 'src/lib/communityFeedRefresh.ts') mocks = { './communityFeedRefresh': load('src/lib/communityFeedRefresh.ts', {}), ...mocks };
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports,
  );
  return module.exports;
}

const jsx = (type, props) => ({ type, props });
const diagnostics = load('src/lib/communityDiagnostics.ts', {});

function writeScreen(createPost, imageOptions = {}) {
  let feedRefreshes = 0;
  const state = [];
  const refs = [];
  let hook = 0;
  let beforeRemove;
  const navigation = { addListener: (_, callback) => { beforeRemove = callback; return () => {}; } };
  const router = { backCalls: 0, replaceCalls: 0, canGoBack: () => true, back() { this.backCalls++; }, replace() { this.replaceCalls++; } };
  const react = {
    useEffect(effect) { effect(); },
    useState(initial) {
      const index = hook++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = hook++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
  };
  const primitive = Object.fromEntries([
    'ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Platform', 'Pressable', 'ScrollView',
    'StyleSheet', 'Text', 'TextInput', 'View',
  ].map((name) => [name, name]));
  primitive.Platform = { OS: 'ios' };
  primitive.StyleSheet = { create: (styles) => styles };
  const Screen = load('src/app/community/write.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useRouter: () => router, useNavigation: () => navigation, useLocalSearchParams: () => ({}) },
    '../../lib/auth': { clearTokens: async () => {} },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', ImagePlus: 'ImagePlus', X: 'X' },
    react,
    'react-native': primitive,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../../lib/community': { createCommunityPost: createPost, CommunityApiError: class extends Error {} },
    '../../lib/communityFeedRefresh': { markCommunityFeedChanged() { feedRefreshes++; } },
    '../../lib/communityDiagnostics': diagnostics,
    '../../lib/communityImages': {
      MAX_POST_IMAGES: 5, ImageSelectionError: class extends Error {},
      selectPostImages: imageOptions.observe || (async (images, observer) => {
        const result = await (imageOptions.select || (async (current) => current))(images);
        const added = result.slice(images.length);
        observer.onSelected(added);
        added.forEach((image, index) => observer.onConverted(index, image));
        return result;
      }),
      publishPostWithImages: imageOptions.publish || (async () => ({ id: 1 })),
    },
    '../../locales': { t: (key) => key },
    '../../theme/communityColors': { communityColors: { background: '#fff', text: '#222', secondaryText: '#888', divider: '#ddd', mutedSurface: '#eee', charcoal: '#333', white: '#fff' } },
    '../../theme/tokens': { radius: { full: 999, radius8: 8, radius12: 12 }, spacing: { space8: 8, space12: 12, space16: 16, space24: 24, space40: 40 }, typography: { titleS: {}, label: {}, body: {} } },
  }).default;
  return {
    router,
    get feedRefreshes() { return feedRefreshes; },
    tryLeave() { let prevented = false; beforeRemove?.({ preventDefault() { prevented = true; } }); return prevented; },
    render() { hook = 0; return Screen(); },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function registerButton(tree) {
  return nodes(tree).find((node) => node.type === 'Pressable'
    && ['community.register', 'community.registering'].includes(node.props?.accessibilityLabel));
}

test('createCommunityPost sends QUESTION and FREE with the saved bearer token and no userId', async () => {
  const requests = [];
  const createCommunityPost = load('src/lib/community.ts', {
    '../constants/api': { API_BASE_URL: 'https://api.example.test' },
    './auth': { getAuthSession: async () => ({ accessToken: 'saved-token', generation: 0 }) },
    './communityDiagnostics': diagnostics,
  }).createCommunityPost;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 201, text: async () => JSON.stringify({ id: requests.length }) };
  };
  try {
    assert.deepEqual(await createCommunityPost('QUESTION', '질문 본문'), { id: 1 });
    assert.deepEqual(await createCommunityPost('FREE', '자유 본문'), { id: 2 });
    assert.deepEqual(requests.map(({ url }) => url), [
      'https://api.example.test/api/community/posts', 'https://api.example.test/api/community/posts',
    ]);
    assert.deepEqual(requests.map(({ options }) => JSON.parse(options.body)), [
      { category: 'QUESTION', content: '질문 본문' },
      { category: 'FREE', content: '자유 본문' },
    ]);
    for (const { options } of requests) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer saved-token');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal('credentials' in options, false);
    }
    await createCommunityPost('FREE', '이미지 본문', 'signed-upload-token');
    assert.deepEqual(JSON.parse(requests[2].options.body), {
      category: 'FREE', content: '이미지 본문', uploadToken: 'signed-upload-token',
    });
  } finally { global.fetch = originalFetch; }
});

test('write screen prevents empty and duplicate submissions and returns after success', async () => {
  let calls = 0;
  let resolveRequest;
  const requests = [];
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  const screen = writeScreen(async (...request) => { calls++; requests.push(request); return pending; });
  let tree = screen.render();
  let button = registerButton(tree);
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.equal(calls, 0);

  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('내용');
  tree = screen.render();
  nodes(tree).find((node) => node.type === 'Pressable'
    && nodes(node.props?.children).some((child) => child.type === 'Text'
      && child.props?.children === 'community.category.free')).props.onPress();
  tree = screen.render();
  button = registerButton(tree);
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  button.props.onPress();
  assert.equal(calls, 1);
  assert.deepEqual(requests, [['FREE', '내용']]);
  assert.equal(registerButton(screen.render()).props.disabled, true);
  assert.equal(screen.feedRefreshes, 0, 'pending writes do not invalidate the feed');

  resolveRequest({ id: 12 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(screen.router.backCalls, 1);
  assert.equal(screen.feedRefreshes, 1, 'successful text write invalidates the feed exactly once');
});

test('leaving write without submitting does not invalidate the feed', () => {
  const screen = writeScreen(async () => { throw new Error('Must not create a post'); });
  const back = nodes(screen.render()).find((node) => node.props?.accessibilityLabel === 'community.writeBack');
  back.props.onPress();
  assert.equal(screen.router.backCalls, 1);
  assert.equal(screen.feedRefreshes, 0);
});

test('failed write keeps the entered content and shows a visible error', async () => {
  const screen = writeScreen(async () => { throw new Error('request failed'); });
  let tree = screen.render();
  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('작성한 글');
  tree = screen.render();
  registerButton(tree).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  tree = screen.render();
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.value, '작성한 글');
  assert.ok(nodes(tree).some((node) => node.props?.accessibilityRole === 'alert'
    && node.props?.children === 'community.writeFailed'));
  assert.equal(screen.router.backCalls, 0);
  assert.equal(screen.feedRefreshes, 0, 'failed write does not invalidate the feed');
});

test('write screen selects images, removes one, adds again and blocks duplicate image submissions', async () => {
  const image = (id) => ({ uri: `file://${id}.webp`, width: 100, height: 100, mimeType: 'image/webp' });
  let resolvePublish;
  let calls = 0;
  const pending = new Promise((resolve) => { resolvePublish = resolve; });
  const screen = writeScreen(async () => { throw new Error('text API must not run'); }, {
    select: async (current) => [...current, image(current.length)],
    publish: async (category, content, images) => {
      calls++;
      assert.equal(category, 'QUESTION'); assert.equal(content, '이미지 글'); assert.equal(images.length, 1);
      return pending;
    },
  });
  let tree = screen.render();
  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('이미지 글');
  const attach = () => nodes(screen.render()).find((node) => node.props?.accessibilityLabel === 'community.attachImage');
  attach().props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes(screen.render()).filter((node) => node.type === 'Image').length, 1);
  nodes(screen.render()).find((node) => node.props?.accessibilityLabel === 'community.removeImage').props.onPress();
  assert.equal(nodes(screen.render()).filter((node) => node.type === 'Image').length, 0);
  attach().props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  const button = registerButton(screen.render());
  button.props.onPress(); button.props.onPress();
  assert.equal(calls, 1);
  assert.equal(attach().props.disabled, true);
  assert.equal(screen.tryLeave(), true);
  resolvePublish({ id: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(screen.router.backCalls, 1);
  assert.equal(screen.tryLeave(), false);
  assert.equal(screen.feedRefreshes, 1, 'successful image write also invalidates the feed');
});

test('image upload failure keeps text and previews and does not navigate back', async () => {
  const screen = writeScreen(async () => {}, {
    select: async () => [{ uri: 'file://photo.webp', width: 100, height: 100, mimeType: 'image/webp' }],
    publish: async () => { throw new Error('PUT failed'); },
  });
  let tree = screen.render();
  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('유지할 글');
  nodes(tree).find((node) => node.props?.accessibilityLabel === 'community.attachImage').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  registerButton(screen.render()).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  tree = screen.render();
  assert.equal(screen.router.backCalls, 0);
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.value, '유지할 글');
  assert.equal(nodes(tree).filter((node) => node.type === 'Image').length, 1);
});

test('unknown commit keeps immutable form and blocks leaving until the same session retry succeeds', async () => {
  let calls = 0;
  const screen = writeScreen(async () => {}, {
    select: async () => [{ uri: 'file://photo.webp', width: 100, height: 100, mimeType: 'image/webp' }],
    publish: async (category, content, _, attempt) => {
      calls++;
      if (calls === 1) { attempt.current = { uploadToken: 'session', category, content }; throw new Error('unknown commit'); }
      assert.deepEqual(attempt.current, { uploadToken: 'session', category: 'QUESTION', content: '원래 글' });
      attempt.current = null;
      return { id: 19 };
    },
  });
  let tree = screen.render();
  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('원래 글');
  nodes(tree).find((node) => node.props?.accessibilityLabel === 'community.attachImage').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  registerButton(screen.render()).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  tree = screen.render();
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.editable, false);
  assert.equal(registerButton(tree).props.disabled, false);
  assert.equal(screen.tryLeave(), true);
  assert.equal(screen.router.backCalls, 0);
  registerButton(tree).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(screen.router.backCalls, 1);
  assert.equal(screen.tryLeave(), false);
});

test('picker and conversion allow editing; previews update independently and deleted processing images stay deleted', async () => {
  let observer;
  let finishSelection;
  let selectionCalls = 0;
  const published = [];
  const screen = writeScreen(async () => {}, {
    observe: async (_, callbacks) => {
      selectionCalls++;
      observer = callbacks;
      await new Promise((resolve) => { finishSelection = resolve; });
    },
    publish: async (...args) => { published.push(args); return { id: 20 }; },
  });
  const attach = () => nodes(screen.render()).find((node) => node.props?.accessibilityLabel === 'community.attachImage');
  attach().props.onPress();
  attach().props.onPress();
  assert.equal(selectionCalls, 1);
  assert.equal(attach().props.disabled, true);
  let tree = screen.render();
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.editable, true);
  nodes(tree).find((node) => node.type === 'TextInput').props.onChangeText('변환 중 작성');
  const free = nodes(screen.render()).find((node) => node.type === 'Pressable'
    && nodes(node.props?.children).some((child) => child.props?.children === 'community.category.free'));
  assert.equal(free.props.disabled, false);
  free.props.onPress();
  observer.onSelected([1, 2, 3].map((id) => ({ uri: `file://original-${id}` })));
  tree = screen.render();
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'Image').map((node) => node.props.source.uri),
    ['file://original-1', 'file://original-2', 'file://original-3']);
  assert.equal(nodes(tree).filter((node) => node.type === 'ActivityIndicator').length, 4);
  assert.equal(registerButton(tree).props.disabled, true);
  registerButton(tree).props.onPress();
  assert.equal(published.length, 0);
  nodes(tree).filter((node) => node.props?.accessibilityLabel === 'community.removeImage')[0].props.onPress();
  const converted = (id) => ({ uri: `file://converted-${id}.webp`, width: 100, height: 100, mimeType: 'image/webp' });
  observer.onConverted(0, converted(1));
  observer.onConverted(1, converted(2));
  tree = screen.render();
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'Image').map((node) => node.props.source.uri),
    ['file://converted-2.webp', 'file://original-3']);
  observer.onFailed(2);
  finishSelection();
  await new Promise((resolve) => setImmediate(resolve));
  tree = screen.render();
  assert.equal(registerButton(tree).props.disabled, false);
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.value, '변환 중 작성');
  registerButton(tree).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(published[0].slice(0, 3), ['FREE', '변환 중 작성', [converted(2)]]);
  assert.equal(screen.router.backCalls, 1);
});
