const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes } = require('./helpers/i18nRuntime.cjs');
const { reanimatedTransitionMock } = require('./helpers/reanimatedTransitionMock.cjs');

const file = 'src/components/place/PopupGuidanceSheet.tsx';
const styleOf = node => Object.assign({}, ...[].concat(node.props.style ?? {}));
async function app(platform = 'ios') {
  let ui;
  const reanimated = reanimatedTransitionMock(() => ui, { autoFinish: false });
  const selected = [], nativeAnimations = [], scheduled = [];
  const animate = (kind) => (value, config) => ({ start: done => {
    nativeAnimations.push({ kind, config }); value.setValue(config.toValue); done?.({ finished: true });
  } });
  ui = runtime({
    'react-native-reanimated': reanimated.module,
    'react-native-worklets': { scheduleOnRN: fn => scheduled.push(fn) },
    'react-native': {
      Platform: { OS: platform }, View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
      StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
      PanResponder: { create: config => ({ panHandlers: config }) },
      Animated: { View: 'AnimatedView',
        Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation(callback) { callback?.(this.value); } },
        timing: animate('timing'), spring: animate('spring'), parallel: list => ({ start: done => { list.forEach(a => a.start()); done?.({ finished: true }); } }),
      },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, left: 3, right: 5 }) },
    'lucide-react-native': {},
  });
  await ui.load('src/locales/languageStore.ts').languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ko-KR'] });
  const Component = ui.load(file).default;
  const props = { edgeToEdge: true, showEdit: false, showDelete: false,
    onSelect: index => selected.push(index), content: () => ({ type: 'Text', props: { children: 'original body\n\nparagraph' } }),
  };
  const root = ui.mount(() => Component(props));
  return { ...ui, root, Component, props, selected, nativeAnimations, reanimated, scheduled,
    runScheduled: () => scheduled.splice(0).forEach(fn => fn()),
    backdrop: () => nodes(root.tree).find(n => n.type === 'Pressable'),
    surface: () => nodes(root.tree).find(n => n.props?.accessibilityViewIsModal),
    finishPending: () => reanimated.animations.filter(a => !a.finished).forEach(reanimated.finish),
  };
}

test('iOS transitions use Reanimated with matching timing/easing and wait for both exit animations and native dismissal', async () => {
  const s = await app();
  assert.equal(s.Component.name, 'PopupGuidanceSheet');
  assert.equal(s.root.tree.props.animationType, 'none'); assert.equal(s.root.tree.props.transparent, true);
  assert.equal(s.reanimated.sharedValues[0].get(), 220); assert.equal(s.reanimated.sharedValues[1].get(), 0);
  s.root.tree.props.onShow();
  const entrance = s.reanimated.animations.slice();
  assert.deepEqual(entrance.map(a => [a.to, a.config.duration]), [[0, 200], [1, 200]]);
  assert.ok(entrance.every(a => a.config.easing === s.reanimated.easingCalls[0].easing));
  assert.equal(s.reanimated.easingCalls[0].fn, s.reanimated.module.Easing.ease);
  s.finishPending(); assert.equal(s.reanimated.sharedValues[0].get(), 0); assert.equal(s.reanimated.sharedValues[1].get(), 1);
  s.backdrop().props.onPress(); s.backdrop().props.onPress();
  const exit = s.reanimated.animations.slice(2);
  assert.deepEqual(exit.map(a => [a.to, a.config.duration]), [[0, 160], [220, 160]]);
  s.reanimated.finish(exit[0]); assert.equal(s.scheduled.length, 0); assert.equal(s.root.tree.props.visible, true);
  s.reanimated.finish(exit[1]); assert.equal(s.root.tree.props.visible, true);
  s.runScheduled(); assert.equal(s.root.tree.props.visible, false); assert.deepEqual(s.selected, []);
  s.root.tree.props.onDismiss(); s.root.tree.props.onDismiss(); assert.deepEqual(s.selected, [0]);
  assert.deepEqual(s.nativeAnimations, []); s.dispose();
});

test('early close cancels entrance and ignores a late onShow, preserving presentation until exit finishes', async () => {
  const s = await app(); s.root.tree.props.onShow();
  const opening = s.reanimated.animations.slice();
  s.reanimated.sharedValues[0].presentation = 110; s.reanimated.sharedValues[1].presentation = 0.5;
  s.root.tree.props.onRequestClose();
  assert.ok(opening.every(a => a.finished));
  assert.equal(s.reanimated.sharedValues[0].get(), 110);
  assert.equal(s.reanimated.sharedValues[1].get(), 0.5);
  const count = s.reanimated.animations.length; s.root.tree.props.onShow(); assert.equal(s.reanimated.animations.length, count);
  assert.equal(s.root.tree.props.visible, true); s.finishPending(); s.runScheduled();
  assert.equal(s.root.tree.props.visible, false); s.root.tree.props.onDismiss(); assert.deepEqual(s.selected, [0]);
  s.dispose();
});

for (const platform of ['ios', 'android', 'web']) test(platform + ': no drag handlers, decorative handle stays and backdrop closes normally', async () => {
  const s = await app(platform); s.root.tree.props.onShow(); s.finishPending();
  for (const node of nodes(s.root.tree)) {
    assert.ok(!Object.keys(node.props ?? {}).some(key => /PanResponder|ShouldSetResponder/.test(key)));
  }
  assert.equal(styleOf(s.surface()).paddingTop, undefined);
  assert.equal(styleOf(s.surface()).transform, undefined);
  s.backdrop().props.onPress(); s.finishPending(); s.runScheduled();
  assert.equal(s.root.tree.props.visible, false);
  if (platform === 'ios') { assert.deepEqual(s.selected, []); s.root.tree.props.onDismiss(); }
  assert.deepEqual(s.selected, [0]); assert.deepEqual(s.nativeAnimations, []); s.dispose();
});

test('edge layout, original handle, safe area, content and backdrop are preserved', async () => {
  const s = await app(), style = styleOf(s.surface());
  for (const [key, value] of Object.entries({ marginHorizontal: 0, marginBottom: 0, borderRadius: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', maxHeight: '90%',
    paddingBottom: 42, paddingLeft: 23, paddingRight: 25 })) assert.equal(style[key], value, key);
  assert.ok(nodes(s.root.tree).some(n => styleOf(n).backgroundColor === 'rgba(0, 0, 0, 0.4)'));
  const handle=nodes(s.root.tree).find(n=>styleOf(n).width===36);
  assert.equal(styleOf(handle).height,4);assert.equal(styleOf(handle).borderRadius,2);
  assert.equal(styleOf(handle).backgroundColor,'#818B9B');assert.equal(styleOf(handle).opacity,0.4);
  const handleArea=nodes(s.root.tree).find(n=>n.type==='View'&&n.props.children===handle);
  assert.deepEqual(styleOf(handleArea),{height:32,alignItems:'center',justifyContent:'center'});
  const positioner = nodes(s.root.tree).find(n => n.props?.pointerEvents === 'box-none');
  assert.equal(styleOf(positioner).position, 'absolute'); assert.equal(styleOf(positioner).bottom, 0);
  assert.ok(nodes(s.root.tree).some(n => n.props?.children === 'original body\n\nparagraph')); s.dispose();
});

test('pending UI/JS completion cannot update a sheet after unmount', async () => {
  const s = await app(); s.backdrop().props.onPress(); s.finishPending();
  assert.equal(s.scheduled.length, 1); s.dispose(); s.runScheduled();
  assert.equal(s.root.tree.props.visible, true); s.root.tree.props.onDismiss(); assert.deepEqual(s.selected, []);
});

test('unmount cancels pending UI animations and ignores late callbacks', async () => {
  const s = await app(); s.root.tree.props.onShow(); s.root.tree.props.onRequestClose();
  s.dispose(); assert.ok(s.reanimated.animations.every(a => a.finished));
  s.finishPending(); s.runScheduled(); s.root.tree.props.onShow();
  assert.equal(s.root.tree.props.visible, true); assert.deepEqual(s.selected, []);
});

test('fresh mount after dismissal restarts at 220dp/zero opacity without inheriting closing guards', async () => {
  const s = await app(); s.root.tree.props.onRequestClose(); s.finishPending(); s.runScheduled(); s.root.tree.props.onDismiss();
  const next = s.mount(() => s.Component(s.props));
  assert.equal(next.tree.props.visible, true); assert.equal(s.reanimated.sharedValues.at(-3).get(), 220);
  next.tree.props.onShow(); s.finishPending(); next.tree.props.onRequestClose(); s.finishPending(); s.runScheduled();
  next.tree.props.onDismiss(); assert.deepEqual(s.selected, [0, 0]); s.dispose();
});

test('Android back waits for both Reanimated transitions and completes once', async () => {
  const s = await app('android'); s.root.tree.props.onShow(); s.finishPending();
  s.root.tree.props.onRequestClose(); s.root.tree.props.onRequestClose();
  assert.equal(s.root.tree.props.visible, true); assert.deepEqual(s.selected, []);
  const exit = s.reanimated.animations.slice(-2); s.reanimated.finish(exit[0]); s.runScheduled();
  assert.equal(s.root.tree.props.visible, true); s.reanimated.finish(exit[1]); s.runScheduled();
  assert.equal(s.root.tree.props.visible, false); assert.deepEqual(s.selected, [0]);
  s.root.tree.props.onDismiss(); assert.deepEqual(s.selected, [0]); s.dispose();
});
