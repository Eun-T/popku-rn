const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { removalDriver } = require('./helpers/preventRemove.cjs');
const { nodes } = require('./helpers/uiTree.cjs');
const { withUiDependencies } = require('./helpers/uiDependencies.cjs');

function hooks() {
  const slots = [], effects = []; let cursor = 0, dirty = false;
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (old && deps.length === old.deps.length && deps.every((value, j) => Object.is(value, old.deps[j]))) return;
      slots[i] = { deps, cleanup: old?.cleanup };
      effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    },
  };
  return { react, render(Screen) {
    let tree, count = 0;
    do { assert.ok(count++ < 30); cursor = 0; dirty = false; tree = Screen(); effects.splice(0).forEach(fn => fn()); } while (dirty);
    return tree;
  }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function load(file, mocks) {
  mocks = withUiDependencies(file, mocks);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in mocks, `Missing ${name} in ${file}`); return mocks[name];
  }, module, module.exports);
  return module.exports;
}

const image = { uri: 'file://new.webp', width: 100, height: 100, mimeType: 'image/webp' };
function screen(kind, { editing = false, history = true } = {}) {
  const state = hooks(), guard = removalDriver(state.react), alerts = [], calls = [], pushed = [], changes = [], clears = [];
  let tree, select = async (_current, observer) => {
    observer?.onSelected([image]); observer?.onConverted(0, image); return [image];
  };
  const write = (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject }));
  class ApiError extends Error { constructor(status) { super(String(status)); this.status = status; this.authGeneration = 4; } }
  const router = {
    canGoBack: () => history, back: () => guard.request({ type: 'GO_BACK' }),
    replace: route => guard.request({ type: 'REPLACE', payload: { route } }), push: route => pushed.push(route),
  };
  const native = Object.fromEntries(['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'SafeAreaView'].map(name => [name, name]));
  native.Platform = { OS: 'ios' }; native.StyleSheet = { create: value => value };
  native.Alert = { alert: (...args) => alerts.push(args) };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const shared = {
    react: state.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'expo-router': { useRouter: () => router, useNavigation: () => guard.navigation,
      useLocalSearchParams: () => editing ? { editId: '10' } : { publicId: 'popup' } },
    'expo-router/react-navigation': { usePreventRemove: guard.usePreventRemove },
    'lucide-react-native': Object.fromEntries(['ChevronLeft', 'ImagePlus', 'Star', 'X', 'MessageSquare'].map(name => [name, name])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../../lib/auth': { clearTokens: async generation => { clears.push(generation); return true; } },
    '../../lib/community': { CommunityApiError: ApiError, createCommunityPost: write, updateCommunityPost: write,
      getCommunityPostForEdit: async () => ({ category: 'QUESTION', content: 'original', images: ['old.webp'], imageIds: [7] }) },
    '../../lib/communityFeedRefresh': { markCommunityFeedChanged: () => changes.push('created'), publishCommunityPostChange: (...args) => changes.push(args) },
    '../../lib/communityDiagnostics': { logCommunityError() {} },
    '../../lib/communityImages': { MAX_POST_IMAGES: 5, ImageSelectionError: class extends Error {},
      selectPostImages: (...args) => select(...args), publishPostWithImages: write, updatePostWithImages: write },
    '../../lib/popups': { getPopupDetail: async () => ({ name: 'Popup' }) },
    '../../lib/reviews': { MAX_REVIEW_CONTENT_BYTES: 65535, reviewContentBytes: value => Buffer.byteLength(value),
      getReviewDetail: async () => ({ popup: { title: 'Popup', publicId: 'popup' }, rating: 4, content: 'original', images: [{ id: 7, url: 'old.webp' }] }),
      createReview: write, publishReviewWithImages: write, updateReview: write, updateReviewWithImages: write,
      reviewsCreated: value => changes.push(value), reviewUpdated: value => changes.push(value) },
    '../../locales': require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'),
  };
  let Screen;
  if (kind === 'inquiry') {
    const tokens = require('./helpers/uiDependencies.cjs').loadPure('src/theme/tokens.ts');
    const Layout = load('src/components/profile/InquiryLayout.tsx', { ...shared, '../../theme/tokens': tokens }).default;
    Screen = load('src/app/profile/inquiries/write.tsx', { ...shared,
      '../../../components/profile/InquiryLayout': { __esModule: true, default: Layout, inquiryStyles: {} },
      '../../../hooks/useInquirySession': { useInquirySession: () => ({ ready: true, authenticated: true, error: false }) },
      '../../../lib/inquiries': { inquiryTypes: { GENERAL: '일반 문의' }, validInquiry: (title, content) => !!(title.trim() && content.trim()), createInquiry: write },
      '../../../theme/tokens': tokens,
    }).default;
  } else Screen = load(`src/app/${kind === 'post' ? 'community' : 'reviews'}/write.tsx`, shared).default;
  const render = () => { tree = state.render(Screen); return tree; };
  const find = label => nodes(tree).find(node => node.props?.accessibilityLabel === require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts').translate('ko', label));
  const input = () => kind === 'inquiry' ? find('문의 내용') : nodes(tree).find(node => node.type === 'TextInput');
  const submit = () => kind === 'inquiry'
    ? nodes(tree).find(node => node.type === 'Pressable' && nodes(node).some(child => child.props?.children === '문의 등록하기'))
    : find(kind === 'post' ? editing ? 'community.edit.save' : 'community.register' : editing ? '수정 완료' : '등록');
  const back = () => find(kind === 'post' ? 'community.writeBack' : kind === 'inquiry' ? '뒤로가기' : '뒤로 가기');
  const fill = (value = 'draft') => { input().props.onChangeText(value); if (kind === 'inquiry') find('문의 제목').props.onChangeText('title'); if (kind === 'review' && !editing) find('별점 4점').props.onPress(); render(); };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  const choose = text => { const action = alerts.at(-1)?.[2].find(button => button.text === text); assert.ok(action); action.onPress(); render(); };
  render();
  return { guard, alerts, calls, pushed, changes, clears, ApiError, render, find, input, submit, back, fill, settle, choose,
    unmount: state.unmount, select(fn) { select = fn; } };
}

for (const kind of ['post', 'review', 'inquiry']) {
  test(`${kind}: empty draft leaves normally; swipe/hardware/header use the same confirmation and retain draft on cancel`, async () => {
    const s = screen(kind); await s.settle();
    assert.equal(s.guard.nativeFlags.at(-1), false);
    s.back().props.onPress(); assert.equal(s.guard.completed.length, 1); assert.equal(s.alerts.length, 0);
    s.fill(); const before = s.input().props.value;
    assert.equal(s.guard.nativeFlags.at(-1), true, 'installed hook registers native prevent-remove context');
    for (const origin of ['ios-swipe', 'android-hardware', 'header']) {
      const count = s.guard.completed.length;
      if (origin === 'header') s.back().props.onPress(); else s.guard.request({ type: 'POP', payload: { count: 1 }, origin });
      assert.equal(s.guard.completed.length, count); assert.equal(s.input().props.value, before);
      const alerts = s.alerts.length; s.guard.request({ type: 'GO_BACK' }); assert.equal(s.alerts.length, alerts, 'only one dialog');
      s.choose('계속 작성'); assert.equal(s.guard.completed.length, count); assert.equal(s.input().props.value, before);
    }
    s.guard.request({ type: 'POP', payload: { count: 1 }, origin: 'ios-swipe' });
    s.choose('나가기'); assert.equal(s.guard.completed.length, 2);
    assert.equal(s.guard.completed.at(-1).origin, 'ios-swipe', 'replay the original remove action exactly once');
    assert.equal(s.calls.length, 0); s.unmount(); assert.equal(s.guard.listenerCount, 0); assert.equal(s.guard.nativeFlags.at(-1), false);
  });

  test(`${kind}: submit locks duplicate requests and removal; failure preserves draft; success leaves without confirmation`, async () => {
    const s = screen(kind); await s.settle(); s.fill();
    const submit = s.submit().props.onPress; submit(); submit(); s.render(); assert.equal(s.calls.length, 1);
    s.guard.request({ type: 'POP', origin: 'ios-swipe' }); s.guard.request({ type: 'GO_BACK' });
    assert.equal(s.guard.completed.length, 0); assert.equal(s.alerts.length, 0); assert.equal(s.back().props.disabled, true);
    s.calls[0].reject(Error('offline')); await s.settle(); assert.equal(s.input().props.value, 'draft');
    s.guard.request({ type: 'GO_BACK' }); s.choose('계속 작성');
    s.submit().props.onPress(); s.render(); s.calls[1].resolve({ id: 10 }); await s.settle();
    assert.equal(s.guard.completed.length, 1); assert.equal(s.alerts.length, 1); assert.equal(s.guard.completed[0].type, 'GO_BACK');
    s.unmount();
  });

  test(`${kind}: a stale discard dialog cannot remove a form once a request has started`, async () => {
    const s = screen(kind); await s.settle(); s.fill(); s.guard.request({ type: 'GO_BACK' });
    s.submit().props.onPress(); s.render(); s.choose('나가기'); assert.equal(s.guard.completed.length, 0);
    s.calls[0].resolve({ id: 10 }); await s.settle(); assert.equal(s.guard.completed.length, 1); s.unmount();
  });

  test(`${kind}: direct-entry fallback replace is guarded and successful submission bypasses confirmation`, async () => {
    const s = screen(kind, { history: false }); await s.settle(); s.fill();
    s.back().props.onPress(); s.choose('계속 작성'); assert.equal(s.guard.completed.length, 0);
    s.submit().props.onPress(); s.calls[0].resolve({ id: 10 }); await s.settle();
    assert.equal(s.guard.completed.length, 1); assert.equal(s.guard.completed[0].type, 'REPLACE'); assert.equal(s.alerts.length, 1); s.unmount();
  });

  test(`${kind}: a dialog opened before success cannot trigger a second pop afterwards`, async () => {
    const s = screen(kind); await s.settle(); s.fill(); s.guard.request({ type: 'GO_BACK' });
    const discard = s.alerts[0][2].find(button => button.text === '나가기').onPress;
    s.submit().props.onPress(); s.calls[0].resolve({ id: 10 }); await s.settle();
    assert.equal(s.guard.completed.length, 1);
    discard(); assert.equal(s.guard.completed.length, 1); s.unmount();
  });
}

for (const kind of ['post', 'review']) {
  test(`${kind}: edit compares original content/rating/images; undo returns to clean state`, async () => {
    const s = screen(kind, { editing: true }); await s.settle();
    assert.equal(s.guard.nativeFlags.at(-1), false, 'preloaded nonempty content is not a change');
    s.back().props.onPress(); assert.equal(s.alerts.length, 0);
    s.input().props.onChangeText('edited'); s.render(); assert.equal(s.guard.nativeFlags.at(-1), true);
    s.guard.request({ type: 'GO_BACK' }); s.choose('계속 작성'); assert.equal(s.input().props.value, 'edited');
    s.input().props.onChangeText('original'); s.render(); assert.equal(s.guard.nativeFlags.at(-1), false);
    if (kind === 'review') {
      s.find('별점 5점').props.onPress(); s.render(); assert.equal(s.guard.nativeFlags.at(-1), true);
      s.find('별점 4점').props.onPress(); s.render(); assert.equal(s.guard.nativeFlags.at(-1), false);
    }
    s.find(kind === 'post' ? 'community.attachImage' : '사진 추가').props.onPress(); await s.settle();
    assert.equal(s.guard.nativeFlags.at(-1), true, 'adding an image is a real edit');
    const addedImageButton = kind === 'post'
      ? s.find('2번째 이미지 삭제')
      : s.find('사진 2 삭제');
    addedImageButton.props.onPress(); s.render();
    assert.equal(s.guard.nativeFlags.at(-1), false, 'removing the new image restores original IDs and order');
    s.find(kind === 'post' ? '1번째 이미지 삭제' : '사진 1 삭제').props.onPress(); s.render();
    assert.equal(s.guard.nativeFlags.at(-1), true, 'removing an original image is a real edit');
    s.guard.request({ type: 'GO_BACK' }); s.choose('계속 작성'); assert.equal(nodes(s.render()).filter(node => node.type === 'Image').length, 0);
    s.submit().props.onPress(); s.render(); s.calls[0].resolve({ id: 10 }); await s.settle();
    assert.equal(s.alerts.length, 2); assert.equal(s.guard.completed.length, 2, 'successful edit leaves without another dialog'); s.unmount();
  });

  test(`${kind}: even an unchanged edit locks removal while its save request is pending`, async () => {
    const s = screen(kind, { editing: true }); await s.settle();
    assert.equal(s.guard.nativeFlags.at(-1), false);
    const save = s.submit().props.onPress; save(); save(); s.render();
    assert.equal(s.calls.length, 1); assert.equal(s.guard.nativeFlags.at(-1), true);
    s.guard.request({ type: 'POP', origin: 'ios-swipe' });
    assert.equal(s.guard.completed.length, 0); assert.equal(s.alerts.length, 0);
    s.calls[0].resolve({ id: 10 }); await s.settle();
    assert.equal(s.guard.completed.length, 1); assert.equal(s.alerts.length, 0); s.unmount();
  });

  test(`${kind}: image selection/conversion blocks removal and cancel retains converted images`, async () => {
    const s = screen(kind); await s.settle(); let finish, observer;
    s.select((_current, callbacks) => { observer = callbacks; observer?.onSelected([image]); return new Promise(resolve => { finish = resolve; }); });
    s.find(kind === 'post' ? 'community.attachImage' : '사진 추가').props.onPress(); s.render();
    s.guard.request({ type: 'POP', origin: 'ios-swipe' }); assert.equal(s.guard.completed.length, 0); assert.equal(s.alerts.length, 0);
    observer?.onConverted(0, image); finish([image]); await s.settle();
    s.guard.request({ type: 'GO_BACK' }); s.choose('계속 작성');
    assert.equal(nodes(s.render()).filter(node => node.type === 'Image').length, 1); assert.equal(s.calls.length, 0); s.unmount();
  });

  test(`${kind}: 401 pushes login without removing the dirty form; return still requires discard confirmation`, async () => {
    const s = screen(kind); await s.settle(); s.fill(); s.submit().props.onPress();
    s.calls[0].reject(new s.ApiError(401)); await s.settle();
    assert.deepEqual(s.pushed, [{ pathname: '/login', params: { intent: 'resume', resumeKey: 'write' } }]); assert.deepEqual(s.clears, [4]);
    assert.equal(s.input().props.value, 'draft'); assert.equal(s.guard.completed.length, 0);
    s.guard.request({ type: 'GO_BACK' }); s.choose('계속 작성'); assert.equal(s.input().props.value, 'draft');
    s.submit().props.onPress(); s.calls[1].resolve({ id: 10 }); await s.settle(); assert.equal(s.guard.completed.length, 1); s.unmount();
  });
}
