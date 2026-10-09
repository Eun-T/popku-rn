const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', '__DEV__', code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, exports, false);
  return exports;
}
const jsx = (type, props) => ({ type, props });
const theme = load('src/theme/tokens.ts', {});
const Carousel = load('src/components/place/TodayOpeningCarousel.tsx', {
  react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'expo-router': { useFocusEffect() {} },
  'expo-blur': { BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' },
  'expo-image': { Image: 'Image' },
  'lucide-react-native': { ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight' },
  'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: s => s } },
  'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' },
  '../common/SkeletonBlock': { __esModule: true, default: 'SkeletonBlock' },
  '../../locales': { t: key => key },
  '../../theme/tokens': theme,
  '../../../assets/images/ranking-placeholder.png': 'placeholder',
}).default;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children;

test('ending badge uses D-5, D-1 and today with actual same-year and cross-year periods', () => {
  for (const [today, startDate, endDate, badge, period] of [
    ['2026-10-06', '2026-10-02', '2026-10-11', 'D-5', '26.10.02 ~ 10.11'],
    ['2026-10-10', '2026-10-02', '2026-10-11', 'D-1', '26.10.02 ~ 10.11'],
    ['2026-10-11', '2026-10-02', '2026-10-11', '오늘 종료', '26.10.02 ~ 10.11'],
    ['2026-12-31', '2026-12-28', '2027-01-01', 'D-1', '26.12.28 ~ 27.01.01'],
  ]) {
    const item = { publicId: 'popup', name: '긴 팝업 제목 '.repeat(12), startDate, endDate, coverImageUrl: null };
    let opened;
    const tree = Carousel({ items: [item], width: 343, today, loading: false, error: false, onPressPopup: value => { opened = value; } });
    const list = nodes(tree).find(n => n.type === 'FlatList');
    const card = list.props.renderItem({ item });
    const caption = nodes(card).find(n => n.props?.style?.rowGap === 4);
    const [badgeNode, titleNode, periodNode] = caption.props.children;
    assert.equal(text(badgeNode), badge);
    assert.equal(text(periodNode), period);
    assert.equal(badgeNode.props.style.backgroundColor, '#FF5A6E');
    assert.equal(badgeNode.props.style.minHeight, 24);
    assert.equal(badgeNode.props.style.marginBottom + caption.props.style.rowGap, 8);
    assert.equal(titleNode.props.children, item.name);
    assert.equal(titleNode.props.numberOfLines, 2);
    assert.equal(titleNode.props.ellipsizeMode, 'tail');
    assert.equal(titleNode.props.style.fontSize, 18);
    assert.equal(periodNode.props.style.fontSize, 14);
    assert.equal(periodNode.props.numberOfLines, 1);
    assert.equal(caption.props.style.bottom, 16);
    assert.equal(list.props.snapToInterval, 343);
    card.props.onPress();
    assert.equal(opened, item);
  }
});
