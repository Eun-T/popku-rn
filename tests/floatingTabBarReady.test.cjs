const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const file = 'src/components/navigation/FloatingTabBar.tsx';
const style = node => Object.assign({}, ...[node.props.style].flat().filter(Boolean));

function app(platform = 'ios') {
  const animations = [], navigationCalls = [], bailouts = [];
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() {}
    addListener() { return 'listener'; }
    removeListener() {}
  }
  const animate = kind => (value, options) => ({
    start() { animations.push({ kind, options }); value.setValue(options.toValue); },
    stop() {},
  });
  let state = { index: 0, routes: ['index', 'places', 'map', 'community', 'profile'].map(name => ({ name, key: name })) };
  let root;
  const ui = runtime({
    'react-native': {
      View: 'View', Pressable: 'Pressable', Platform: { OS: platform },
      StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' } },
      Easing: { out: value => value, quad: 'quad' },
      Animated: { View: 'AnimatedView', Value, spring: animate('spring'), timing: animate('timing'),
        parallel: list => ({ start: () => list.forEach(animation => animation.start()) }) },
      PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    'expo-router': { usePathname: () => '/' },
    'expo-blur': { BlurView: 'BlurView' },
    'expo-glass-effect': { GlassView: 'GlassView', isLiquidGlassAvailable: () => true, isGlassEffectAPIAvailable: () => true },
    'lucide-react-native': { LayoutGrid: 'Icon', MessageCircle: 'Icon', UserRound: 'Icon' },
    '../icons/FilledTabIcons': { HouseFilledIcon: 'Icon', MapPinnedFilledIcon: 'Icon', UserRoundFilledIcon: 'Icon' },
    '../icons/HouseIcon': { HouseIcon: 'Icon' }, '../icons/MapPinnedIcon': { MapPinnedIcon: 'Icon' },
    fetch: () => assert.fail('theme/layout readiness must not request data'),
  }, { transform: compilerTransform([file], { allowBailout: [file], onBailout: (_file, events) => bailouts.push(...events) }) });
  // This harness checks state/effect transitions; it does not draw native frames.
  ui.react.useLayoutEffect = ui.react.useEffect;
  const Component = ui.load(file).default;
  const navigation = {
    emit: event => { navigationCalls.push(event); return { defaultPrevented: false }; },
    navigate(name) {
      navigationCalls.push(name);
      state = { ...state, index: state.routes.findIndex(route => route.name === name) };
      root.render();
    },
  };
  root = ui.mount(() => Component({ state, navigation, descriptors: Object.fromEntries(state.routes.map(route => [route.key, { options: {} }])) }));
  const items = () => nodes(root.tree).find(node => node.props?.onPanResponderGrant);
  const tabs = () => nodes(root.tree).filter(node => node.props?.accessibilityRole === 'tab');
  const indicator = () => nodes(root.tree).find(node => node.props?.pointerEvents === 'none' && node.type === 'AnimatedView');
  const parentLayout = width => items().props.onLayout({ nativeEvent: { layout: { width } } });
  const tabLayout = (index, width = 347) => tabs()[index].props.onLayout({ nativeEvent: { layout: { x: index * width / 5, width: width / 5 } } });
  return { ...ui, root, animations, navigationCalls, bailouts, items, tabs, indicator, parentLayout, tabLayout,
    ready() { parentLayout(347); for (let index = 0; index < 5; index++) tabLayout(index); },
    assertVisible(visible) {
      assert.equal(style(root.tree).opacity, undefined);
      assert.equal(style(items()).opacity, visible ? 1 : 0);
      assert.equal(style(indicator()).opacity, visible ? 1 : 0);
      assert.equal(root.tree.props.pointerEvents, visible ? 'auto' : 'none');
    },
  };
}

for (const platform of ['ios', 'android']) test(`${platform}: Compiler-processed mount keeps the background visible and reveals icons/indicator together after placement`, () => {
  const s = app(platform);
  s.assertVisible(false);
  assert.equal(s.tabs().length, 5);
  assert.equal(nodes(s.root.tree).some(node => node.type === (platform === 'ios' ? 'GlassView' : 'BlurView')), true);
  s.parentLayout(347);
  s.assertVisible(false);
  s.tabLayout(0);
  s.assertVisible(true);
  assert.equal(style(s.indicator()).transform[0].translateX.value, 1.5);
  assert.equal(style(s.indicator()).width, 72);
  assert.equal(style(s.indicator().props.children).height, 50);
  assert.deepEqual(s.animations, []);
  assert.deepEqual(s.navigationCalls, []);
  if (s.bailouts.length) console.log('FloatingTabBar Compiler optimization skipped: existing refs during render; transformed component readiness updates verified');
  s.dispose();
});

test('child-first layout and a later positive width complete readiness without measureInWindow or timers', () => {
  const s = app();
  s.tabLayout(0);
  s.parentLayout(0);
  s.assertVisible(false);
  // The optional native ref is absent; window measurement is only needed for dragging.
  assert.equal(s.items().props.ref.current, null);
  s.parentLayout(347);
  s.assertVisible(true);
  s.parentLayout(349);
  s.assertVisible(true);
  assert.equal(style(s.indicator()).transform[0].translateX.value, 2.5);
  assert.deepEqual(s.animations, []);
  s.dispose();
});

test('ready tab presses retain spring settings, touch geometry and drag scale animations', () => {
  const s = app();
  s.ready();
  const slots = s.root.slots;
  s.tabs()[1].props.onPress();
  s.assertVisible(true);
  assert.equal(s.root.slots, slots);
  assert.deepEqual(s.animations[0], { kind: 'spring', options: { toValue: 69.5, stiffness: 750, damping: 44, mass: 0.7, useNativeDriver: true } });
  assert.equal(style(s.root.tree).left, 22);
  assert.equal(style(s.root.tree).right, 22);
  assert.equal(style(s.root.tree).height, 60);
  assert.equal(style(s.tabs()[0]).height, '100%');
  const items = s.items();
  items.props.ref.current = { measureInWindow: callback => callback(22) };
  s.parentLayout(347);
  assert.equal(s.items().props.onMoveShouldSetPanResponderCapture(null, { dx: 10, dy: 0 }), true);
  s.items().props.onPanResponderGrant(null, { moveX: 22 + 100 });
  s.items().props.onPanResponderMove(null, { moveX: 22 + 120 });
  s.items().props.onPanResponderRelease(null, { moveX: 22 + 120 });
  s.assertVisible(true);
  assert.ok(s.animations.some(animation => animation.kind === 'timing' && animation.options.toValue === 1.03));
  assert.ok(s.animations.some(animation => animation.kind === 'timing' && animation.options.toValue === 1.08));
  assert.ok(s.animations.some(animation => animation.kind === 'timing' && animation.options.toValue === 1));
  s.dispose();
});

test('repeated fresh mounts keep GlassView and every ancestor free of readiness opacity', () => {
  function backgroundPath(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const path = backgroundPath(child, type);
        if (path) return path;
      }
      return null;
    }
    if (node.type === type) return [node];
    const path = backgroundPath(node.props?.children, type);
    return path ? [node, ...path] : null;
  }
  for (const platform of ['ios', 'android']) for (let mount = 0; mount < 3; mount++) {
    const s = app(platform);
    const type = platform === 'ios' ? 'GlassView' : 'BlurView';
    const initialPath = backgroundPath(s.root.tree, type);
    assert.ok(initialPath);
    const initialProps = initialPath.at(-1).props;
    s.assertVisible(false);
    for (const node of initialPath) assert.equal(style(node).opacity, undefined);
    assert.equal(nodes(s.items()).some(node => node.type === type), false);
    s.ready();
    s.assertVisible(true);
    const readyPath = backgroundPath(s.root.tree, type);
    assert.equal(readyPath.length, initialPath.length);
    for (const node of readyPath) assert.equal(style(node).opacity, undefined);
    assert.deepEqual(readyPath.at(-1).props, initialProps);
    assert.deepEqual(s.animations, []);
    assert.deepEqual(s.navigationCalls, []);
    s.dispose();
  }
});
