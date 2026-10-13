const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const file = 'src/components/place/PlaceWeeklyPopupList.tsx';
const popup = Object.freeze({ publicId: 'same-popup', name: '번역 없는 한국어 원문', countryCode: 'KR',
  regionId: 1, regionName: '성수', latitude: 37, longitude: 127,
  startDate: '2026-10-01', endDate: '2026-10-31', coverImageUrl: 'https://images.test/same-poster',
  tags: Object.freeze([Object.freeze({ id: 5, name: '뷰티' }), Object.freeze({ id: 999, name: '미등록 태그 원문' })]) });

async function app(compiled, serverResponse) {
  const calls = [], opened = [], toggled = [];
  const ui = runtime({
    'react-native': { ...Object.fromEntries(['View','Text','Pressable','Image'].map(n => [n,n])), StyleSheet: { create: s => s } },
    'expo-image': { Image: 'ExpoImage' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'lucide-react-native': { Heart: 'Heart' },
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    fetch: async (url, options) => {
      calls.push({ url, options });
      assert.ok(serverResponse, 'language-only rendering must not fetch');
      return { ok: true, json: async () => serverResponse(url) };
    },
  }, compiled ? { transform: compilerTransform([file, 'src/hooks/useTranslation.ts']) } : {});
  const store = ui.load('src/locales/languageStore.ts').languageStore;
  let systemTag = 'ja-JP';
  await store.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => [systemTag] });
  const Weekly = ui.load(file).default;
  const props = Object.freeze({ popups: Object.freeze([
    popup, Object.freeze({ ...popup, publicId: 'upcoming', startDate: '2027-01-01', endDate: '2027-01-31' }),
    Object.freeze({ ...popup, publicId: 'ended', startDate: '2026-01-01', endDate: '2026-01-31' }),
  ]), onPressPopup: p => opened.push(p), isFavorite: id => id === popup.publicId,
  isFavoriteDisabled: () => false, onToggleFavorite: p => toggled.push(p) });
  // Parent deliberately has no language subscription and is never rendered again.
  let parentRenders = 0;
  const parent = ui.mount(() => { parentRenders++; return { type: Weekly, props }; });
  const root = ui.mount(() => parent.tree.type(parent.tree.props));
  const posters = nodes(root.tree).filter(n => n.type?.name === 'ExplorePopupPoster').map(n => ui.mount(() => n.type(n.props)));
  return { ...ui, calls, opened, toggled, root, posters, props, store, parentRenders: () => parentRenders,
    language: value => store.setLanguagePreference(value),
    system: tag => { systemTag = tag; store.refreshSystemLanguage(); } };
}

function assertLanguage(s, language) {
  const translate = s.load('src/locales/index.ts').translate;
  const stale = [];
  for (const status of ['ongoing','upcoming','ended']) {
    if (!texts(s.root.tree).includes(translate(language, `place.all.card.${status}`))) stale.push(`status:${status}`);
  }
  const labels = nodes(s.root.tree).map(n => n.props?.accessibilityLabel);
  for (const action of ['removeFavorite','addFavorite']) if (!labels.includes(translate(language, `place.all.${action}`))) stale.push(`favorite:${action}`);
  if (!texts(s.root.tree).includes(language === 'ja' ? '聖水' : '성수')) stale.push('region');
  if (!texts(s.root.tree).includes(language === 'ja' ? 'ビューティー' : '뷰티')) stale.push('tag');
  assert.deepEqual(stale, [], `UI must follow ${language}`);
  assert.ok(texts(s.root.tree).includes('미등록 태그 원문'));
  assert.ok(texts(s.root.tree).includes(popup.name), 'missing server translation remains original');
}

for (const compiled of [false, true]) test(`${compiled ? 'actual Compiler output' : 'uncompiled'}: weekly labels follow ko-ja-ko/system with fixed props and no parent render or GET`, async () => {
  const s = await app(compiled);
  try {
    const before = JSON.stringify(s.props), initialStyles = nodes(s.root.tree).map(n => n.props?.style);
    const imageSources = () => s.posters.flatMap(p => nodes(p.tree)).filter(n => n.type === 'ExpoImage').map(n => n.props.source);
    const initialImages = imageSources(); assert.equal(initialImages.length, 3);
    assertLanguage(s, 'ko');
    await s.language('ja'); assertLanguage(s, 'ja');
    await s.language('ko'); assertLanguage(s, 'ko');
    await s.language('system'); assertLanguage(s, 'ja');
    s.system('ko-KR'); assertLanguage(s, 'ko');
    assert.equal(s.parentRenders(), 1); assert.deepEqual(s.calls, []); assert.equal(JSON.stringify(s.props), before);
    assert.deepEqual(nodes(s.root.tree).map(n => n.props?.style), initialStyles);
    assert.deepEqual(imageSources(), initialImages);
    nodes(s.root.tree).find(n => n.type === 'Pressable').props.onPress();
    const heart = nodes(s.root.tree).find(n => n.props?.accessibilityState?.selected === true);
    let stopped = false; heart.props.onPress({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.deepEqual(s.opened, [popup]); assert.deepEqual(s.toggled, [popup]);
  } finally { s.dispose(); }
});

test('actual weekly API and compiled cards show supplied ko/ja titles and preserve untranslated fallback', async () => {
  const titles = { ko: '한국어 번역 제목', ja: '日本語の翻訳タイトル' };
  const s = await app(true, url => {
    const language = new URL(url).searchParams.get('languageCode');
    return { popups: [{ ...popup, name: titles[language] }, { ...popup, publicId: 'fallback', name: popup.name }] };
  });
  try {
    const api = s.load('src/lib/popups.ts'), Weekly = s.load(file).default;
    let props = s.props;
    const cards = s.mount(() => Weekly(props));
    for (const language of ['ko','ja','ko']) {
      await s.language(language);
      const popups = await api.getWeeklyPopups('KR', '2026-10-05', '2026-10-11', new AbortController().signal, language);
      props = { ...s.props, popups }; cards.render();
      assert.ok(texts(cards.tree).includes(titles[language]));
      assert.ok(texts(cards.tree).includes(popup.name));
      assert.deepEqual(nodes(cards.tree).filter(n => n.type === 'Pressable' && !n.props.accessibilityState).map(n => n.props.accessibilityLabel), [titles[language], popup.name]);
      assert.deepEqual(popups.map(p => p.publicId), ['same-popup','fallback']);
      assert.ok(popups.every(p => p.coverImageUrl === popup.coverImageUrl));
      const query = new URL(s.calls.at(-1).url).searchParams;
      assert.equal(query.get('languageCode'), language); assert.equal(query.get('countryCode'), 'KR');
      assert.equal(query.get('weekStart'), '2026-10-05'); assert.equal(query.get('weekEnd'), '2026-10-11');
    }
    assert.equal(s.calls.length, 3, 'only explicit content requests; card subscriptions add no GET');
  } finally { s.dispose(); }
});
