const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { nodes, flattenStyle } = require('./helpers/uiTree.cjs');
const { withUiDependencies } = require('./helpers/uiDependencies.cjs');

function load(file, mocks) {
  mocks = withUiDependencies(file, mocks);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in mocks, `Missing ${name}`); return mocks[name];
  }, module, module.exports);
  return module.exports.default;
}

function sheet(insets, edgeToEdge = true) {
  const slots = [], effects = [], selected = [], timings = [], pans = []; let cursor = 0, tree;
  const react = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
    useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = {}; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const animation = () => ({ start: callback => callback?.({ finished: true }) });
  const jsx = (type, props) => ({ type, props });
  const Menu = load('src/components/community/CommunityPostMenu.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react-native': { Pencil: 'Pencil', Trash2: 'Trash2' },
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' },
      Animated: { View: 'AnimatedView', Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} },
        timing: (_value, options) => { timings.push(options); return animation(); }, spring: animation, parallel: animation },
      PanResponder: { create: options => { pans.push(options); return { panHandlers: {} }; } },
      StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, hairlineWidth: 1 } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets }, '../../locales': { t: key => key },
  });
  const onSelect = index => selected.push(index);
  const render = () => { cursor = 0; tree = Menu({ edgeToEdge, onSelect }); effects.splice(0).forEach(effect => effect()); return tree; };
  render();
  return { render, get tree() { return tree; }, selected, timings, pans,
    unmount() { slots.forEach(slot => slot.cleanup?.()); } };
}

for (const insets of [{ bottom: 0, left: 0, right: 0 }, { bottom: 34, left: 0, right: 0 }, { bottom: 21, left: 44, right: 44 }]) {
  test(`review sheet is edge-to-edge with internal safe area ${JSON.stringify(insets)}`, () => {
    const s = sheet(insets), all = nodes(s.tree);
    assert.equal(s.tree.type, 'Modal'); assert.equal(s.tree.props.animationType, 'none'); assert.equal(s.tree.props.transparent, true);
    const surface = all.find(node => node.props?.accessibilityViewIsModal), style = flattenStyle(surface.props.style);
    assert.equal(style.marginHorizontal, 0); assert.equal(style.marginBottom, 0);
    assert.equal(style.paddingBottom, insets.bottom + 8);
    assert.equal(style.paddingLeft, insets.left + 20); assert.equal(style.paddingRight, insets.right + 20);
    assert.equal(style.borderRadius, 0); assert.equal(style.borderTopLeftRadius, 24); assert.equal(style.borderTopRightRadius, 24);
    assert.equal(style.borderBottomLeftRadius ?? style.borderRadius, 0); assert.equal(style.borderBottomRightRadius ?? style.borderRadius, 0);
    assert.equal(style.backgroundColor, '#FFFFFF');
    assert.equal(flattenStyle(all.find(node => flattenStyle(node.props?.style).backgroundColor === 'rgba(0, 0, 0, 0.4)').props.style).bottom, 0);
    const handle = all.find(node => flattenStyle(node.props?.style).width === 36);
    assert.equal(flattenStyle(handle.props.style).height, 4);
    const rows = all.filter(node => node.type === 'Pressable' && typeof node.props.style === 'function');
    assert.equal(rows.length, 2); assert.equal(flattenStyle(rows[0].props.style({ pressed: false })).height, 56);
    assert.ok(nodes(rows[0]).some(node => node.type === 'Pencil'));
    assert.ok(nodes(rows[1]).some(node => node.type === 'Trash2' && node.props.color === '#DC2626'));
    assert.equal(flattenStyle(nodes(rows[1]).find(node => node.type === 'Text').props.style).color, '#DC2626');
    s.tree.props.onShow(); assert.ok(s.timings.every(timing => timing.useNativeDriver)); s.unmount();
  });
}

test('non-review menu retains its original card geometry', () => {
  const s = sheet({ bottom: 34, left: 0, right: 0 }, false);
  const style = flattenStyle(nodes(s.tree).find(node => node.props?.accessibilityViewIsModal).props.style);
  assert.equal(style.marginHorizontal, 16); assert.equal(style.marginBottom, 34); assert.equal(style.borderRadius, 24); assert.equal(style.paddingBottom, 8);
  s.unmount();
});

for (const index of [1, 2]) test(`review sheet action ${index} completes once after iOS modal dismissal`, () => {
  const s = sheet({ bottom: 34, left: 0, right: 0 });
  const rows = nodes(s.tree).filter(node => node.type === 'Pressable' && typeof node.props.style === 'function');
  rows[index - 1].props.onPress(); rows[index - 1].props.onPress(); assert.deepEqual(s.selected, []);
  assert.equal(s.render().props.visible, false);
  s.tree.props.onDismiss(); s.tree.props.onDismiss(); assert.deepEqual(s.selected, [index]);
  assert.ok(s.timings.every(timing => timing.useNativeDriver)); s.unmount();
});

for (const method of ['backdrop', 'systemBack', 'handleDrag']) test(`review sheet ${method} closes without choosing edit/delete`, () => {
  const s = sheet({ bottom: 0, left: 0, right: 0 });
  if (method === 'backdrop') nodes(s.tree).find(node => node.props?.accessibilityLabel === 'community.cancel').props.onPress();
  else if (method === 'systemBack') s.tree.props.onRequestClose();
  else s.pans[0].onPanResponderRelease({}, { dy: 61, vy: 0 });
  assert.equal(s.render().props.visible, false); s.tree.props.onDismiss(); assert.deepEqual(s.selected, [0]); s.unmount();
});

test('review card injects the action slot and still separates body and popup navigation without restoring removed comments', () => {
  const routes = [], places = [], slot = { type: 'ReviewActions', props: {} }, jsx = (type, props) => ({ type, props });
  const Card = load('src/components/community/CommunityPostItem.tsx', {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react-native': {}, 'react-native': { Pressable: 'Pressable', View: 'View', Text: 'Text', Image: 'Image', StyleSheet: { create: value => value } },
    '../../lib/auth': { getAuthUser: () => ({ id: 1 }), subscribeAuthUser() {} }, '../../locales': { t: key => key },
  });
  const review = { id: 7, type: 'REVIEW', author: { id: 1, nickname: 'me' }, rating: 4, popup: { publicId: 'popup-x', title: 'Popup' }, images: [], content: 'body', createdAt: new Date().toISOString(), liked: false, likeCount: 0 };
  const tree = Card({ post: review, reviewActions: slot, onPressReview: () => routes.push(review.id), onPressPlace: id => places.push(id) });
  assert.ok(nodes(tree).includes(slot)); tree.props.onPress(); assert.deepEqual(routes, [7]);
  let stopped = 0; nodes(tree).find(node => node.props?.accessibilityLabel === 'Popup').props.onPress({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1); assert.deepEqual(places, ['popup-x']); assert.deepEqual(routes, [7]);
  assert.equal(nodes(tree).some(node => node.props?.accessibilityLabel?.includes('댓글')), false);
});
