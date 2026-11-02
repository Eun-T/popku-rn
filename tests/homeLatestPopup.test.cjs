const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const sectionFile = 'src/components/home/HomeLatestPopupSection.tsx';
const cardFile = 'src/components/home/LatestPopupCard.tsx';
const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const rows = Array.from({ length: 10 }, (_, i) => ({
  publicId: `popup-${i}`, name: `서버 제목 ${i}`, countryCode: i % 2 ? 'KR' : 'JP',
  startDate: '2026-10-01', endDate: '2026-10-31', tags: [],
  coverImageUrl: `https://images.test/${i}`, coverImageCacheKey: `object-${i}`,
}));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function app(t, { fail = false, empty = false, slow = false } = {}) {
  let width = 390, system = 'ja-JP';
  const calls = [], opened = [], gate = deferred(), details = [];
  const ui = runtime({
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView'].map(n => [n, n])),
      StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width }) },
    'expo-image': { Image: 'ExpoImage' },
    'expo-router': { useRouter: () => ({}) },
    'lucide-react-native': { ArrowUpRight: 'ArrowUpRight', Store: 'Store', Heart: 'Heart' },
    'src/theme/useTheme.ts': { useTheme: () => ({ themeColors: {
      textPrimary: '#111827', textSecondary: '#6B7280', surface: '#F8FAFC', background: '#FFFFFF',
    } }) },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({}) },
    'src/components/common/SkeletonBlock.tsx': { __esModule: true, default: 'SkeletonBlock' },
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async url => {
      calls.push(url);
      const parsed = new URL(url), language = parsed.searchParams.get('languageCode');
      if (/\/api\/popups\/popup-/.test(parsed.pathname)) {
        const wait = deferred(); details.push(wait); return wait.promise;
      }
      const latest = parsed.searchParams.get('limit') === '10';
      if (slow && latest) await gate.promise;
      return { ok: !(fail && latest), json: async () => ({
        popups: empty && latest ? [] : rows.map(item => ({ ...item, name: `${item.name}:${language}` })), nextCursor: 'unused',
      }) };
    },
  }, { transform: compilerTransform([sectionFile, cardFile, 'src/hooks/useHomePopups.ts', 'src/hooks/useTranslation.ts']) });
  t.after(() => ui.dispose());
  const language = ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => [system] });
  const Section = ui.load(sectionFile).default, Card = ui.load(cardFile).default;
  const props = { onPressPopup: id => opened.push(id) };
  const section = ui.mount(() => Section(props));
  const cards = () => nodes(section.tree).filter(n => n.type === Card);
  const settle = async () => { await flush(); await flush(); ui.renderAll(); await flush(); };
  return { ...ui, section, cards, calls, opened, details, language, settle, gate, Section, props,
    card: () => ui.mount(() => { const card = cards()[0]; return card ? Card(card.props) : null; }),
    resize: value => { width = value; ui.renderAll(); },
    system: value => { system = value; language.refreshSystemLanguage(); },
  };
}

test('latest uses one unfiltered first page, preserves mixed server order and cache through remounts', async t => {
  const s = await app(t, { slow: true });
  assert.equal(nodes(s.section.tree).filter(n => n.type === 'SkeletonBlock').length, 9);
  s.mount(() => s.Section(s.props));
  assert.equal(s.calls.length, 1, 'simultaneous consumers share an in-flight request');
  s.gate.resolve(); await s.settle();
  const url = new URL(s.calls[0]);
  assert.equal(url.pathname, '/api/popups');
  assert.deepEqual([...url.searchParams], [['limit', '10'], ['languageCode', 'ko']]);
  assert.deepEqual(s.cards().map(n => n.props.popup.publicId), rows.slice(0, 7).map(p => p.publicId));
  assert.deepEqual(new Set(s.cards().map(n => n.props.popup.countryCode)), new Set(['JP', 'KR']));
  const width = (390 - 32 - 24) / 2.3;
  assert.equal(s.cards()[0].props.width, width);
  const scroll = nodes(s.section.tree).find(n => n.type === 'ScrollView');
  assert.equal(scroll.props.horizontal, true); assert.equal(scroll.props.pagingEnabled, undefined);
  assert.equal(scroll.props.snapToInterval, undefined); assert.equal(scroll.props.nestedScrollEnabled, true);
  assert.equal(flat(scroll.props.contentContainerStyle).columnGap, 12);
  assert.equal(flat(s.section.tree.props.style).paddingHorizontal, 16);
  s.cards()[2].props.onPress(); assert.deepEqual(s.opened, ['popup-2']);
  s.resize(430); assert.equal(s.cards()[0].props.width, (430 - 32 - 24) / 2.3);
  s.mount(() => s.Section(s.props)); await s.settle(); assert.equal(s.calls.length, 1);
  const screen = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  assert.ok(screen.indexOf('<HomeCategoryShortcuts') < screen.indexOf('<HomeLatestPopupSection'));
  assert.ok(screen.indexOf('<HomeLatestPopupSection') < screen.indexOf('<HomeTrendingSection'));
});

test('Compiler updates mounted ko→ja→ko and system, preserving layout and reusing each language cache', async t => {
  const s = await app(t); await s.settle(); const card = s.card();
  assert.match(texts(s.section.tree), /새로 올라온 팝업 ✨/);
  const title = nodes(s.section.tree).find(n => n.type === 'Text');
  assert.deepEqual(flat(title.props.style), { fontSize: 20, fontWeight: '700', lineHeight: 28, color: '#111827' });
  const image = () => nodes(card.tree).find(n => n.type === 'ExpoImage');
  const source = image().props.source;
  assert.equal(image().props.contentFit, 'cover'); assert.equal(image().props.cachePolicy, 'memory-disk');
  const size = flat(image().props.style); assert.equal(size.width, size.height); assert.equal(size.borderRadius, 12);
  const labels = nodes(card.tree).filter(n => n.type === 'Text');
  assert.ok(labels.every(n => n.props.numberOfLines === 1 && n.props.ellipsizeMode === 'tail'));
  assert.equal(flat(labels[0].props.style).fontSize, 14); assert.equal(flat(labels[0].props.style).fontWeight, '600');
  assert.equal(flat(labels[0].props.style).marginTop, 8);
  assert.equal(flat(labels[1].props.style).fontSize, 12); assert.equal(flat(labels[1].props.style).fontWeight, '400');
  assert.equal(flat(labels[1].props.style).marginTop, 4); assert.equal(flat(labels[1].props.style).color, '#6B7280');
  assert.equal(labels[1].props.children, '26.10.01 - 10.31');
  await s.language.setLanguagePreference('ja'); await s.settle();
  assert.match(texts(s.section.tree), /新着ポップアップ ✨/);
  assert.match(card.tree.props.accessibilityLabel, /詳細/);
  await s.language.setLanguagePreference('ko'); await s.settle();
  assert.match(texts(s.section.tree), /새로 올라온 팝업 ✨/);
  assert.equal(s.calls.length, 2); assert.deepEqual(image().props.source, source);
  await s.language.setLanguagePreference('system'); await s.settle();
  assert.match(texts(s.section.tree), /新着ポップアップ ✨/);
  s.system('ko-KR'); await s.settle(); assert.match(texts(s.section.tree), /새로 올라온 팝업 ✨/);
  assert.equal(s.calls.length, 2, 'cached language switches do not refetch');
});

test('empty/error latest hides entirely and leaves the separate trending request ready', async t => {
  for (const options of [{ empty: true }, { fail: true }]) {
    const s = await app(t, options);
    const useHome = s.load('src/hooks/useHomePopups.ts').useHomePopups;
    const trending = s.mount(() => useHome('trending', 'KR'));
    await s.settle(); assert.equal(s.section.tree, null);
    assert.equal(trending.tree.status, 'ready'); assert.equal(trending.tree.popups.length, 10);
    s.renderAll(); await s.settle(); assert.equal(s.calls.length, 2);
  }
});

test('actual image error shares recovery with country section and preserves order and list TTL', async t => {
  const s = await app(t); await s.settle();
  const home = s.load('src/hooks/useHomePopups.ts').useHomePopups;
  const latest = s.mount(() => home('latest', 'ALL'));
  const trending = s.mount(() => home('trending', 'JP')); await s.settle();
  const card = s.card(), order = latest.tree.popups.map(p => p.publicId);
  nodes(card.tree).find(n => n.type === 'ExpoImage').props.onError();
  const other = trending.tree.recoverCover(trending.tree.popups[0]); await s.settle();
  assert.equal(s.details.length, 1);
  s.details[0].resolve({ ok: true, json: async () => ({ ...rows[0], coverImageUrl: 'https://images.test/recovered' }) });
  await other; await s.settle();
  assert.equal(latest.tree.popups[0].coverImageUrl, 'https://images.test/recovered');
  assert.equal(trending.tree.popups[0].coverImageUrl, 'https://images.test/recovered');
  assert.deepEqual(latest.tree.popups.map(p => p.publicId), order);
  assert.equal(s.calls.filter(url => new URL(url).searchParams.get('limit') === '10').length, 1);
});
