const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const file = 'src/components/home/HomeTrendingSection.tsx';

async function screen() {
  const popups = Array.from({ length: 10 }, (_, i) => ({
    publicId: String(i), name: `Popup ${i}`, coverImageUrl: null,
    startDate: '2026-10-01', endDate: '2026-10-31', tags: [],
  }));
  const collapses = [], requests = [];
  const ui = runtime({
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s } },
    'lucide-react-native': { Store: 'Store' },
    'src/theme/useTheme.ts': { useTheme: () => ({ themeColors: {} }) },
    'src/hooks/useHomePopups.ts': { useHomePopups: () => ({ status: 'ready', popups }) },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({ isFavorite: () => false, isFavoriteDisabled: () => false }) },
    'src/components/common/FilterChips.tsx': { __esModule: true, default: 'FilterChips' },
    'src/components/common/MoreButton.tsx': { __esModule: true, default: 'MoreButton' },
    'src/components/home/HomePopupSkeleton.tsx': {},
    'src/components/home/PopupRankingCard.tsx': { __esModule: true, default: 'PopupRankingCard' },
    fetch: (...args) => { requests.push(args); throw new Error('Toggle must not fetch'); },
  }, { transform: compilerTransform([file, 'src/hooks/useTranslation.ts']) });
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ko-KR'] });
  const Component = ui.load(file).default;
  const root = ui.mount(() => Component({ onPressPopup: () => {}, onBeforeCollapse: height => collapses.push(height) }));
  const find = type => nodes(root.tree).find(n => n.type === type);
  return {
    collapses, requests, languageStore,
    count: () => nodes(root.tree).filter(n => n.type === 'PopupRankingCard').length,
    toggle: () => find('MoreButton').props.onPress(),
    label: () => find('MoreButton').props.label,
    layout: height => nodes(root.tree).find(n => n.props.onLayout).props.onLayout({ nativeEvent: { layout: { height } } }),
  };
}

test('5 → 10 → 5 uses the measured height difference and supports repeated toggles', async () => {
  const s = await screen();
  assert.equal(s.count(), 5);
  for (let i = 0; i < 10; i++) {
    s.layout(510);
    s.toggle();
    assert.equal(s.count(), 10);
    s.layout(1110 + i);
    s.toggle();
    assert.equal(s.count(), 5);
    assert.equal(s.collapses.at(-1), 600 + i);
  }
  assert.equal(s.collapses.length, 10);
  assert.equal(s.requests.length, 0);
});

test('rapid toggles before a layout do not reuse an already removed height', async () => {
  const s = await screen();
  s.layout(500);
  s.toggle();
  s.layout(1050);
  s.toggle();
  s.toggle();
  s.toggle();
  assert.equal(s.count(), 5);
  assert.deepEqual(s.collapses, [550]);
  s.layout(500);
  s.toggle();
  s.layout(1050);
  s.toggle();
  assert.deepEqual(s.collapses, [550, 550]);
});

test('mounted language changes keep the expanded cards and collapse measurement', async () => {
  const s = await screen();
  s.layout(500);
  s.toggle();
  s.layout(1100);
  const ko = s.label();
  await s.languageStore.setLanguagePreference('ja');
  assert.equal(s.count(), 10);
  assert.notEqual(s.label(), ko);
  await s.languageStore.setLanguagePreference('ko');
  assert.equal(s.label(), ko);
  s.toggle();
  assert.deepEqual(s.collapses, [600]);
  assert.equal(s.requests.length, 0);
});
