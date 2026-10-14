const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/i18nRuntime.cjs');

// Execute the actual screen handlers; native gestures and Reanimated dispatch are mocked.
function screen() {
  let handlers, renders = 0, writes = 0;
  const ui = runtime({
    'react-native': { ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    'react-native-reanimated': {
      __esModule: true, default: { ScrollView: 'AnimatedScrollView' },
      useSharedValue(initial) {
        let value = initial;
        return { get value() { return value; }, set value(next) { writes++; value = next; } };
      },
      useAnimatedScrollHandler(value) { handlers = value; return value; },
    },
    'src/hooks/usePopupNavigation.ts': { usePopupNavigation: () => () => {} },
    'src/theme/useTheme.ts': { useTheme: () => ({ themeColors: { background: '#FFFFFF' } }) },
    'src/components/home/HomeBanner.tsx': { __esModule: true, default: 'HomeBanner' },
    'src/components/home/HomeTrendingSection.tsx': { __esModule: true, default: 'HomeTrendingSection' },
    'src/components/home/HomeNewPopupSection.tsx': { __esModule: true, default: 'HomeNewPopupSection' },
    'src/components/navigation/FloatingTabBar.tsx': { FLOATING_TAB_BAR_HEIGHT: 60, FLOATING_TAB_BAR_BOTTOM_GAP: 12 },
  });
  const HomeScreen = ui.load('src/screens/HomeScreen.tsx').default;
  const mounted = ui.mount(() => { renders++; return HomeScreen(); });
  const distance = mounted.tree.props.children[0].props.pullDistance;
  const context = {};
  const send = (name, y) => handlers[name]({ contentOffset: { x: 0, y } }, context);
  return {
    begin: y => send('onBeginDrag', y), end: y => send('onEndDrag', y), scroll: y => send('onScroll', y),
    get distance() { return distance.value; }, get renders() { return renders; }, get writes() { return writes; },
  };
}

test('direct pull from the top stretches and retains the native bounce after release', () => {
  const s = screen();
  s.begin(0);
  for (const y of [-10, -35, -80, -60]) {
    s.scroll(y);
    assert.equal(s.distance, -y);
  }
  s.end(-60);
  for (const y of [-65, -45, -15, 0]) {
    s.scroll(y);
    assert.equal(s.distance, Math.max(0, -y));
  }
  // A later rebound must not initiate a second stretch.
  s.scroll(-5);
  assert.equal(s.distance, 0);
  assert.equal(s.renders, 1);
});

test('a drag beginning in lower content cannot stretch even before the finger is released', () => {
  const s = screen();
  s.begin(500);
  for (const y of [250, 50, 0, -10, -45]) {
    s.scroll(y);
    assert.equal(s.distance, 0);
  }
  s.end(-45);
  s.scroll(-20);
  s.scroll(0);
  assert.equal(s.writes, 0);
});

test('a fast fling from lower content cannot stretch; a new top pull still works', () => {
  const s = screen();
  s.begin(900);
  s.scroll(550);
  s.end(550);
  for (const y of [200, 40, -70, -30, 0]) {
    s.scroll(y);
    assert.equal(s.distance, 0);
  }
  s.begin(0);
  s.scroll(-25);
  assert.equal(s.distance, 25);
});

test('programmatic scroll or overscroll without a drag never starts stretching', () => {
  const s = screen();
  for (const y of [350, 100, 0, -35, 0]) {
    s.scroll(y);
    assert.equal(s.distance, 0);
  }
  assert.equal(s.writes, 0);
});

test('an upward drag from the top cannot trigger on reversal or release overshoot', () => {
  const s = screen();
  s.begin(0);
  for (const y of [20, 50, 10, 0, -30]) s.scroll(y);
  assert.equal(s.distance, 0);
  s.end(-30);
  s.scroll(-40);
  assert.equal(s.distance, 0);
});

test('release before negative movement cannot activate a pull from momentum alone', () => {
  const s = screen();
  s.begin(0);
  s.end(0);
  s.scroll(-25);
  assert.equal(s.distance, 0);
});

test('grabbing an unaccepted negative bounce needs an actual downward movement', () => {
  const s = screen();
  s.scroll(-50);
  s.begin(-50);
  s.scroll(-35);
  assert.equal(s.distance, 0);
  s.scroll(-45);
  assert.equal(s.distance, 45);
});

test('normal scrolling and clamped Android-style top offsets leave the banner unchanged', () => {
  const s = screen();
  s.begin(0);
  for (const y of [0, 0, 10, 200, 80, 0]) s.scroll(y);
  s.end(0);
  assert.equal(s.distance, 0);
  assert.equal(s.writes, 0);
  assert.equal(s.renders, 1);
});
