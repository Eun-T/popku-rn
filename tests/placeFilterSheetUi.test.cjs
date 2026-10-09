const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const jsx = (type, props, key) => ({ type, props, key });
function load(file, mocks = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name];
  }, exports);
  return exports;
}
const theme = load('src/theme/tokens.ts');
const filters = load('src/constants/placeFilters.ts');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children)];
const flatten = style => Object.assign({}, ...[style].flat().filter(Boolean));
function hooks() {
  const slots = []; let index = 0, dirty = false; const effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[index++] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  return { react, render(Component, props) {
    let tree, attempts = 0;
    do { assert.ok(attempts++ < 30); index = 0; dirty = false; tree = Component(props); effects.splice(0).forEach(fn => fn()); } while (dirty);
    return tree;
  }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
  StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } } };
function regionGroup(options, selected = []) {
  const runtime = hooks(), toggles = [];
  const Group = load('src/components/place/RegionFilterGroup.tsx', { react: runtime.react,
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'lucide-react-native': { ChevronDown: 'ChevronDown', ChevronUp: 'ChevronUp' },
    '../../theme/tokens': theme, '../../locales': { t: key => key } }).default;
  const props = { options, selected, onToggle: id => toggles.push(id) };
  let tree;
  const render = () => tree = runtime.render(Group, props);
  render();
  return { props, toggles, render, dispose: runtime.dispose,
    measure(width, chipWidth = 60) {
      tree.props.onLayout({ nativeEvent: { layout: { width } } }); render();
      for (const item of nodes(tree.props.children[0]).filter(n => n.props?.onLayout)) {
        const isMore = Array.isArray(item.props.children);
        const label = isMore ? item.props.children[0].props.children : item.props.children.props.children;
        item.props.onLayout({ nativeEvent: { layout: { width: isMore ? (label.length > 2 ? 58 : 50) : chipWidth } } });
      }
      render();
    },
    buttons: () => nodes(tree).filter(n => n.type === 'Pressable'),
    action: () => nodes(tree).find(n => n.type === 'Pressable' && !n.props.accessibilityState),
  };
}
const korean = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: `Korean ${i + 1}`, countryCode: 'KR' }));

test('restored measurement reserves +N width within two rows and expands/collapses without filter mutations', () => {
  const group = regionGroup(korean);
  group.measure(200);
  assert.equal(group.buttons().length, 6);
  assert.equal(group.action().props.children[0].props.children, '+8');
  assert.deepEqual(group.buttons().slice(0, -1).map(n => n.props.children.props.children), korean.slice(0, 5).map(n => n.name));
  group.action().props.onPress(); group.render();
  assert.equal(group.buttons().length, 14);
  assert.equal(group.action().props.children[0].props.children, 'place.filters.collapse');
  assert.deepEqual(group.toggles, []);
  group.action().props.onPress(); group.render();
  assert.equal(group.buttons().length, 6);
  group.buttons()[0].props.onPress(); assert.deepEqual(group.toggles, [1]);
  group.measure(264);
  assert.equal(group.buttons().length, 8);
  assert.equal(group.action().props.children[0].props.children, '+6');
  group.measure(200, 96);
  assert.equal(group.buttons().length, 4);
  assert.equal(group.action().props.children[0].props.children, '+10');
  group.dispose();
});

test('regions fitting two rows have no +N and selected hidden IDs automatically expand on every entry', () => {
  const short = regionGroup(korean.slice(0, 4)); short.measure(200);
  assert.equal(short.buttons().length, 4); assert.equal(short.action(), undefined); short.dispose();
  for (let entry = 0; entry < 2; entry++) {
    const group = regionGroup(korean, [13]); group.measure(200);
    assert.equal(group.buttons().length, 14);
    const selected = group.buttons().find(n => n.props.accessibilityState?.selected);
    assert.equal(selected.props.children.props.children, 'Korean 13');
    assert.deepEqual(group.toggles, []);
    group.action().props.onPress(); group.render();
    assert.equal(group.buttons().length, 6, 'explicit collapse remains possible after auto expansion');
    group.dispose();
  }
});

function sheet() {
  const runtime = hooks(), animations = []; let closes = 0, applies = 0, resets = 0;
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
  const Animated = { Value, View: 'AnimatedView', timing: (value, config) => ({ value, config }),
    parallel(items) {
      const animation = { items, stopped: false, start(callback) { this.callback = callback; },
        stop() { this.stopped = true; this.callback?.({ finished: false }); },
        finish() { if (!this.stopped) { this.items.forEach(item => item.value.setValue(item.config.toValue)); this.callback?.({ finished: true }); } } };
      animations.push(animation); return animation;
    }, spring(value, config) { return { start() { value.setValue(config.toValue); } }; } };
  const Sheet = load('src/components/place/PlaceFilterSheet.tsx', { react: runtime.react,
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { ...native, Animated,
      useWindowDimensions: () => ({ height: 800 }), PanResponder: { create: handlers => ({ panHandlers: handlers }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../common/MoreButton': { default: 'MoreButton' }, './RegionFilterGroup': { default: 'RegionFilterGroup' },
    '../../constants/placeFilters': filters, '../../theme/tokens': theme, '../../locales': { t: key => key } }).default;
  const japanese = ['Tokyo', 'Osaka', 'Kyoto', 'Nagoya', 'Fukuoka', 'Sapporo', 'Japan other']
    .map((name, i) => ({ id: i + 100, name, countryCode: 'JP' }));
  const props = { visible: false, filters: { regionIds: [13], tagIds: [], status: undefined },
    quickFilters: filters.createEmptyPlaceFilters(), period: 'all', regions: [...korean, ...japanese], tags: [],
    optionsStatus: 'ready', onClose: () => closes++, onApply: () => applies++, onReset: () => resets++,
    onToggleRegion() {} };
  let tree;
  return { props, animations, japanese, render: () => tree = runtime.render(Sheet, props),
    get tree() { return tree; }, get closes() { return closes; }, get applies() { return applies; }, get resets() { return resets; }, dispose: runtime.dispose };
}

test('Sheet renders measured Korean group, border divider and uncollapsed Japanese IDs in original order', () => {
  const s = sheet(); s.props.visible = true; s.render();
  const group = nodes(s.tree).find(n => n.type === 'RegionFilterGroup');
  assert.deepEqual(group.props.options, korean); assert.deepEqual(group.props.selected, [13]);
  const section = nodes(s.tree).find(n => n.type === 'View' && n.props.children?.[1] === group);
  assert.equal(section.props.children[2].props.style.backgroundColor, '#E5E7EB');
  const japanese = section.props.children[3];
  assert.deepEqual(japanese.props.options, s.japanese);
  const buttons = nodes(japanese.type(japanese.props)).filter(n => n.type === 'Pressable');
  assert.deepEqual(buttons.map(n => n.props.children.props.children), s.japanese.map(n => n.name));
  s.props.country = 'JP'; s.render();
  assert.equal(nodes(s.tree).find(n => n.type === 'RegionFilterGroup'), undefined);
  s.props.country = 'KR'; s.render();
  assert.deepEqual(nodes(s.tree).find(n => n.type === 'RegionFilterGroup').props.options, korean);
  s.dispose();
});

test('native Modal does not slide; sibling backdrop fades and only Sheet translates through entry and exit', () => {
  const s = sheet(); assert.equal(s.render(), null);
  s.props.visible = true; s.render();
  assert.equal(s.tree.props.animationType, 'none');
  const [backdrop, panel] = s.tree.props.children.props.children;
  const backdropStyle = flatten(backdrop.props.style), panelStyle = flatten(panel.props.style);
  assert.equal(backdropStyle.position, 'absolute'); assert.equal(backdropStyle.top, 0); assert.equal(backdropStyle.bottom, 0);
  assert.equal(backdropStyle.backgroundColor, 'rgba(0, 0, 0, 0.4)'); assert.equal(backdropStyle.transform, undefined);
  assert.equal(backdropStyle.opacity.value, 0); assert.equal(panelStyle.transform[0].translateY.value, 560);
  assert.equal(panel.props.onPress, undefined);
  assert.equal(panel.props.children[1].type, 'ScrollView');
  assert.equal(panel.props.children[2].type, 'View', 'footer remains a sibling of the scrolling content');
  s.tree.props.onShow();
  const entry = s.animations.at(-1);
  assert.equal(entry.items[0].value, backdropStyle.opacity); assert.equal(entry.items[0].config.toValue, 1);
  assert.equal(entry.items[1].value, panelStyle.transform[0].translateY); assert.equal(entry.items[1].config.toValue, 0);
  assert.ok(entry.items.every(item => item.config.useNativeDriver));
  entry.finish();
  backdrop.props.children.props.onPress(); assert.equal(s.closes, 1);
  s.props.visible = false; s.render(); assert.equal(s.tree.props.visible, true, 'Modal stays mounted through exit animation');
  const exit = s.animations.at(-1);
  assert.equal(exit.items[0].config.toValue, 0); assert.equal(exit.items[1].config.toValue, 560);
  exit.finish(); assert.equal(s.render(), null);
  assert.equal(s.applies, 0); assert.equal(s.resets, 0); s.dispose();
});

test('reopening during exit cancels stale dismissal and drag/Android back retain the close handler', () => {
  const s = sheet(); s.props.visible = true; s.render(); s.tree.props.onShow(); s.animations.at(-1).finish();
  s.props.visible = false; s.render(); const exit = s.animations.at(-1);
  s.props.visible = true; s.render(); assert.equal(exit.stopped, true);
  exit.callback({ finished: true }); assert.ok(s.render()); s.animations.at(-1).finish();
  const panel = s.tree.props.children.props.children[1], handle = panel.props.children[0];
  handle.props.onPanResponderMove(null, { dy: 25 });
  handle.props.onPanResponderRelease(null, { dy: 25, vy: 0 });
  assert.equal(flatten(panel.props.style).transform[0].translateY.value, 0);
  handle.props.onPanResponderRelease(null, { dy: 90, vy: 0 }); assert.equal(s.closes, 1);
  s.tree.props.onRequestClose(); assert.equal(s.closes, 2);
  s.props.visible = false; s.render(); s.animations.at(-1).finish(); assert.equal(s.render(), null); s.dispose();
});
