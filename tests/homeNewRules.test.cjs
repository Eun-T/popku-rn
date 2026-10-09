const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(file, mocks, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
    name => { assert.ok(name in mocks, name); return mocks[name]; }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 9, 23, 59])); } }
const status = load('src/lib/popupStatus.ts', {}, { Date: Clock });
const tokens = load('src/theme/tokens.ts', {});
const native = { Image: 'Image', Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: s => s } };
const common = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '../../theme/tokens': tokens };
const all = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(all)
  : [tree, ...all(tree.props?.children)];
const popup = (id, startDate = '2026-10-05', endDate = '2026-10-11') => ({
  publicId: `popup-${id}`, name: `Popup ${id}`, startDate, endDate, regionName: '성수', tags: [], coverImageUrl: 'cover',
});
function section(popups) {
  let country = 'KR'; const routes = [], toggles = [], queries = [];
  const module = load('src/components/home/HomeNewPopupSection.tsx', {
    ...common, react: { useState: () => [country, value => { country = value; }] },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '../../lib/popups': { currentWeekRange: () => ({ openingFrom: '2026-10-05', openingTo: '2026-10-11' }) },
    '../../lib/popupStatus': status,
    '../../hooks/useHomePopups': { useHomePopups: (...args) => { queries.push(args); return { status: 'ready', popups }; } },
    '../../hooks/usePopupFavorites': { usePopupFavorites: () => ({ isFavorite: () => true, isFavoriteDisabled: () => false,
      toggleFavorite: item => toggles.push(item) }) },
    '../common/MoreButton': { __esModule: true, default: 'More' }, '../common/FilterChips': { __esModule: true, default: 'Filter' },
    './HomePopupSkeleton': {}, './NewPopupCard': { __esModule: true, default: 'Card' }, '../../../assets/images/ranking-placeholder.png': 'placeholder',
  });
  return { module, routes, toggles, queries, render: () => module.default({ onPressPopup() {} }) };
}
test('ended omitted, inclusive end/start dates green, future opening blue, input order preserved', () => {
  const list = [popup(1, '2026-10-05', '2026-10-08'), popup(2, '2026-10-05', '2026-10-09'),
    popup(3, '2026-10-09'), popup(4, '2026-10-10')];
  const env = section(list), cards = all(env.render()).filter(n => n.type === 'Card');
  assert.deepEqual(cards.map(n => n.props.title), ['Popup 2', 'Popup 3', 'Popup 4']);
  assert.deepEqual(cards.map(n => n.props.isUpcoming), [false, false, true]);
  cards[0].props.onToggleFavorite(); assert.equal(env.toggles[0], list[1]);
});
test('zero through seven has no more; eight shows seven and routes both countries into same opening range', () => {
  for (let count = 0; count <= 7; count++) {
    const tree = section(Array.from({ length: count }, (_, i) => popup(i))).render();
    assert.equal(all(tree).filter(n => n.type === 'Card').length, count);
    assert.equal(all(tree).filter(n => n.type === 'More').length, 0);
  }
  const env = section(Array.from({ length: 8 }, (_, i) => popup(i)));
  for (const country of ['KR', 'JP']) {
    let tree = env.render(); all(tree).find(n => n.type === 'Filter').props.onChange(country); tree = env.render();
    assert.equal(all(tree).filter(n => n.type === 'Card').length, 7);
    all(tree).find(n => n.type === 'More').props.onPress();
    const route = env.routes.at(-1);
    assert.equal(route.pathname, '/(tabs)/places'); assert.equal(route.params.tab, 'all');
    assert.equal(route.params.countryCode, country); assert.equal(route.params.openingFrom, '2026-10-05');
    assert.equal(route.params.openingTo, '2026-10-11');
  }
});
test('period pill uses existing status colors without status labels and preserves heart', () => {
  const Card = load('src/components/home/NewPopupCard.tsx', { ...common, 'lucide-react-native': { Heart: 'Heart' } }).default;
  for (const isUpcoming of [false, true]) {
    const tree = Card({ width: 152, image: { uri: 'cover' }, title: 'Popup', period: '26.10.07 - 10.22', tags: [],
      isUpcoming, isFavorite: false, isFavoriteDisabled: false, onPress() {}, onToggleFavorite() {} });
    const [frame, pill] = tree.props.children;
    const flatten = styles => Object.assign({}, ...styles.filter(Boolean));
    assert.equal(flatten(pill.props.style).backgroundColor, isUpcoming ? tokens.colors.infoLight : tokens.colors.primaryLight);
    assert.equal(flatten(pill.props.children.props.style).color, isUpcoming ? tokens.colors.infoDark : tokens.colors.primaryDark);
    assert.equal(pill.props.children.props.children, '26.10.07 - 10.22');
    assert.deepEqual(frame.props.style, { width: 152, height: 152 });
    assert.equal(all(frame).filter(n => n.type === 'Heart').length, 2);
  }
});
test('API explicitly requests home mode eight and preserves opening range in Place paginated query', async () => {
  const urls = [], api = load('src/lib/popups.ts', { '../constants/api': { API_BASE_URL: 'http://api' },
    '../locales': { getLocale: () => 'ko' } }, { Date: Clock, fetch: async url => {
      urls.push(new URL(url)); return { ok: true, json: async () => ({ popups: [], nextCursor: null }) };
    } });
  await api.getNewPopups('JP', new AbortController().signal);
  assert.equal(urls[0].searchParams.get('homeNew'), 'true'); assert.equal(urls[0].searchParams.get('limit'), '8');
  assert.equal(urls[0].searchParams.get('openingFrom'), '2026-10-05'); assert.equal(urls[0].searchParams.get('openingTo'), '2026-10-11');
  await api.getPopupPage('JP', new AbortController().signal, { openingFrom: '2026-10-05', openingTo: '2026-10-11' }, 'cursor');
  assert.equal(urls[1].searchParams.get('limit'), '10'); assert.equal(urls[1].searchParams.get('openingFrom'), '2026-10-05');
  assert.equal(urls[1].searchParams.get('openingTo'), '2026-10-11'); assert.equal(urls[1].searchParams.get('cursor'), 'cursor');
});
test('weekly upcoming status now selects its existing blue pill style', () => {
  const Weekly = load('src/components/place/PlaceWeeklyPopupList.tsx', {
    ...common, 'lucide-react-native': { Heart: 'Heart' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../../assets/images/ranking-placeholder.png': 'placeholder',
  }, { Date: Clock }).default;
  const tree = Weekly({ popups: [popup(1, '2026-10-10')], onPressPopup() {}, isFavorite: () => false,
    isFavoriteDisabled: () => false, onToggleFavorite() {} });
  const text = all(tree).find(n => n.type === 'Text' && n.props.children === '오픈예정');
  assert.equal(text.props.style[1].color, tokens.colors.infoDark);
  const pill = all(tree).find(n => n.props?.children === text);
  assert.equal(pill.props.style[1].backgroundColor, tokens.colors.infoLight);
});
