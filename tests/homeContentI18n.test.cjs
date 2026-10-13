const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { app: detailApp, detail } = require('./helpers/mapDetailRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const titles = { ko: '프링글스 굿즈 팝업스토어', ja: 'プリングルズ グッズポップアップストア' };
const untranslated = '번역 없는 원본 제목';
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
function response(url) {
  const query = new URL(url).searchParams;
  const language = query.get('languageCode') || 'ko';
  const country = query.get('countryCode') || 'KR';
  const first = { placeId: 1, publicId: 'pringles', name: titles[language], countryCode: country,
    coverImageUrl: 'https://images.test/poster', coverImageCacheKey: 'same-poster',
    regionId: 1, regionName: 'server-region', startDate: '2026-10-08', endDate: '2026-10-31', tags: [] };
  return { ok: true, status: 200, json: async () => ({ popups: [first, { ...first, placeId: 2, publicId: 'fallback', name: untranslated }] }) };
}
async function homeApp({ slow = false } = {}) {
  const calls = [], timers = new Map();
  let country = 'KR', systemLanguage = 'ja-JP', timerId = 0;
  const ui = runtime({
    'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => {
      const wait = deferred();
      calls.push({ url, options, resolve: () => wait.resolve(response(url)) });
      return slow ? wait.promise : Promise.resolve(response(url));
    },
  }, { transform: compilerTransform(['src/hooks/useHomePopups.ts', 'src/hooks/useHomeMainBanners.ts', 'src/hooks/useTranslation.ts']) });
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => [systemLanguage] });
  const hooks = () => {
    const home = ui.load('src/hooks/useHomePopups.ts').useHomePopups;
    const banner = ui.load('src/hooks/useHomeMainBanners.ts').useHomeMainBanners;
    return [ui.mount(() => home('trending', country)), ui.mount(() => home('new', country)), ui.mount(() => banner())];
  };
  const settle = async () => { await flush(); await flush(); ui.renderAll(); };
  return { ...ui, hooks, calls, timers, languageStore, settle,
    async language(value) { await languageStore.setLanguagePreference(value); },
    country(value) { country = value; ui.renderAll(); },
    system(value) { systemLanguage = value; languageStore.refreshSystemLanguage(); },
  };
}

test('home API forwards explicit language independently of country and leaves server names/fallback untouched', async () => {
  const s = await homeApp(), api = s.load('src/lib/popups.ts'), banner = s.load('src/lib/mainBanners.ts');
  const signal = new AbortController().signal;
  for (const country of ['KR', 'JP']) for (const language of ['ko', 'ja']) {
    for (const fetch of [api.getNowHotPopups, api.getNewPopups]) {
      const result = await fetch(country, signal, language);
      const call = s.calls.at(-1), query = new URL(call.url).searchParams;
      assert.equal(query.get('countryCode'), country);
      assert.equal(query.get('languageCode'), language);
      assert.equal(call.options.signal, signal);
      assert.deepEqual(result.map(p => p.name), [titles[language], untranslated]);
      if (fetch === api.getNewPopups) {
        assert.equal(query.get('homeNew'), 'true'); assert.equal(query.get('limit'), '8');
        assert.equal(query.get('openingFrom'), '2026-10-05'); assert.equal(query.get('openingTo'), '2026-10-11');
      }
    }
  }
  await api.getNewPopups('KR', signal); await api.getNowHotPopups('KR', signal);
  assert.ok(s.calls.slice(-2).every(c => new URL(c.url).searchParams.get('languageCode') === 'ko'), 'old two-argument callers stay compatible');
  await banner.getMainBanners(signal, 'ja');
  assert.equal(new URL(s.calls.at(-1).url).searchParams.has('countryCode'), false);
  const server = { ...detail, name: titles.ja };
  const direct = runtime({ 'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    fetch: async (url, options) => {
      assert.equal(new URL(url).searchParams.get('languageCode'), 'ja'); assert.equal(options.signal, signal);
      return { ok: true, status: 200, json: async () => server };
    } });
  assert.equal(await direct.load('src/lib/popups.ts').getPopupDetail(detail.publicId, signal, undefined, 'ja'), server);
  s.dispose(); direct.dispose();
});

test('home ko/ja/system caches isolate section/country/language, dedup consumers and retain existing TTLs', async () => {
  const s = await homeApp({ slow: true }), roots = s.hooks(); s.hooks();
  const finish = async () => { s.calls.forEach(c => c.resolve()); await s.settle(); };
  await finish();
  const expect = language => roots.forEach(r => {
    assert.equal(r.tree.status, 'ready'); assert.deepEqual(r.tree.popups.map(p => p.name), [titles[language], untranslated]);
  });
  expect('ko'); assert.equal(s.calls.length, 3);
  assert.deepEqual([...s.timers.values()].map(t => t.delay).sort((a,b) => a-b), [240001,240001,600001,600001,600001,600001]);
  await s.language('ja'); roots.forEach(r => assert.deepEqual(r.tree, { status: 'loading', popups: [] }));
  await finish(); expect('ja'); assert.equal(s.calls.length, 6);
  await s.language('ko'); expect('ko'); assert.equal(s.calls.length, 6);
  await s.language('system'); expect('ja'); assert.equal(s.calls.length, 6);
  s.country('JP'); assert.equal(roots[0].tree.status, 'loading'); assert.equal(roots[2].tree.status, 'ready');
  await finish(); expect('ja'); assert.equal(roots[0].tree.popups[0].countryCode, 'JP'); assert.equal(s.calls.length, 8);
  await s.language('ko'); await finish(); expect('ko'); assert.equal(roots[0].tree.popups[0].countryCode, 'JP'); assert.equal(s.calls.length, 10);
  await s.language('system'); expect('ja'); s.system('ko-KR'); expect('ko'); assert.equal(s.calls.length, 10);
  s.country('KR'); expect('ko'); assert.equal(s.calls.length, 10);
  assert.equal(s.load('src/locales/index.ts').getApiLocale(), 'ko');
  s.dispose(); assert.equal(s.timers.size, 0);
});

test('home reversed responses in ko-ja-ko populate only their own language cache', async () => {
  const s = await homeApp({ slow: true }), roots = s.hooks();
  await s.language('ja'); await s.language('ko'); assert.equal(s.calls.length, 6);
  s.calls.slice(3).forEach(c => c.resolve()); await s.settle();
  roots.forEach(r => assert.deepEqual(r.tree, { status: 'loading', popups: [] }));
  s.calls.slice(0, 3).forEach(c => c.resolve()); await s.settle();
  roots.forEach(r => assert.equal(r.tree.popups[0].name, titles.ko));
  await s.language('ja'); roots.forEach(r => assert.equal(r.tree.popups[0].name, titles.ja));
  assert.equal(s.calls.length, 6); s.dispose();
});

test('detail refetches server-translated title, introduction, notice, benefits and hours with system language', async () => {
  const translated = language => ({ ...detail, name: titles[language], summary: `${language}:summary`,
    notice: `${language}:notice`, benefits: `${language}:benefits`, operatingHours: `${language}:hours`,
    highlights: [{ type: 'GOODS', text: untranslated }] });
  const s = await detailApp({ detailResponse: (_id, _signal, _token, language) => translated(language) });
  const Screen = s.load('src/app/places/[id].tsx').default, root = s.mount(() => Screen()); await s.settle();
  for (const [preference, language] of [['ko','ko'], ['ja','ja'], ['ko','ko'], ['system','ja']]) {
    await s.language(preference); await s.settle();
    for (const text of [titles[language], `${language}:summary`, `${language}:hours`, untranslated]) assert.ok(texts(root.tree).includes(text), text);
    const guidance = nodes(root.tree).find(n => n.type?.name === 'PopupGuidanceCarousel');
    assert.equal(guidance.props.notice, `${language}:notice`); assert.equal(guidance.props.benefits, `${language}:benefits`);
    assert.equal(guidance.props.languageCode, language);
  }
  assert.deepEqual(s.calls.detail.map(c => c[3]), ['ko','ja','ko','ja']); s.dispose();
});

test('detail aborts prior language requests and ignores late results even when transport ignores abort', async () => {
  const pending = [];
  const s = await detailApp({ detailResponse: (_id, signal, _token, language) => {
    const wait = deferred(); pending.push({ ...wait, signal, language }); return wait.promise;
  } });
  const Screen = s.load('src/app/places/[id].tsx').default, root = s.mount(() => Screen()); await s.settle();
  await s.language('ja'); await s.settle(); await s.language('ko'); await s.settle();
  assert.deepEqual(pending.map(p => p.language), ['ko','ja','ko']);
  assert.deepEqual(pending.map(p => p.signal.aborted), [true,true,false]);
  pending[2].resolve({ ...detail, name: 'latest ko' }); await s.settle(); assert.ok(texts(root.tree).includes('latest ko'));
  pending[1].resolve({ ...detail, name: titles.ja }); pending[0].resolve({ ...detail, name: 'old ko' }); await s.settle();
  assert.ok(texts(root.tree).includes('latest ko')); assert.ok(!texts(root.tree).includes(titles.ja)); assert.ok(!texts(root.tree).includes('old ko'));
  await s.language('ja'); assert.ok(!texts(root.tree).includes('latest ko')); await s.settle();
  pending[3].resolve({ ...detail, name: untranslated }); await s.settle(); assert.ok(texts(root.tree).includes(untranslated));
  s.dispose();
});
