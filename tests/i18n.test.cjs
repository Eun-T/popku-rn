const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function modules(overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', 'fetch', code)(name => {
      if (name in overrides) return overrides[name];
      if (!name.startsWith('.')) throw new Error(`Missing dependency ${name}`);
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      if (!path.posix.extname(target)) target += fs.existsSync(`${target}.ts`) ? '.ts'
        : fs.existsSync(`${target}.tsx`) ? '.tsx' : '/index.ts';
      return load(target);
    }, module, module.exports, overrides.fetch ?? globalThis.fetch);
    return module.exports;
  }
  return load;
}
const logic = modules()('src/locales/languageStore.ts');
function storageFixture({ current = null, legacy = null, asyncOverrides = {}, secureOverrides = {} } = {}) {
  const key = logic.LANGUAGE_STORAGE_KEY;
  const asyncValues = new Map([['unrelated.data', 'keep async data']]);
  const secureValues = new Map([['accessToken', 'keep token'], ['refreshToken', 'keep refresh']]);
  if (current !== null) asyncValues.set(key, current);
  if (legacy !== null) secureValues.set(key, legacy);
  const calls = [];
  const load = modules({ '@react-native-async-storage/async-storage': {
    getItem: async requestedKey => { calls.push(['read', requestedKey]); return asyncValues.get(requestedKey) ?? null; },
    setItem: async (requestedKey, value) => { calls.push(['write', requestedKey, value]); asyncValues.set(requestedKey, value); },
    ...asyncOverrides,
  }, 'expo-secure-store': {
    getItemAsync: async requestedKey => { calls.push(['legacy-read', requestedKey]); return secureValues.get(requestedKey) ?? null; },
    deleteItemAsync: async requestedKey => { calls.push(['legacy-delete', requestedKey]); secureValues.delete(requestedKey); },
    ...secureOverrides,
  } });
  return { storage: load('src/locales/languageStorage.ts'), asyncValues, secureValues, calls, key };
}

test('migrates each legacy preference once, removes only its key and restores from AsyncStorage thereafter', async () => {
  for (const preference of ['system', 'ko', 'ja']) {
    const fixture = storageFixture({ legacy: preference });
    assert.equal(await fixture.storage.readLanguagePreference(), preference);
    assert.equal(fixture.asyncValues.get(fixture.key), preference);
    assert.equal(fixture.secureValues.has(fixture.key), false);
    assert.deepEqual(fixture.calls, [['read', fixture.key], ['legacy-read', fixture.key],
      ['write', fixture.key, preference], ['legacy-delete', fixture.key]]);
    const writesBefore = fixture.calls.filter(call => call[0] === 'write').length;
    const legacyReadsBefore = fixture.calls.filter(call => call[0] === 'legacy-read').length;
    assert.equal(await fixture.storage.readLanguagePreference(), preference);
    assert.equal(fixture.calls.filter(call => call[0] === 'write').length, writesBefore);
    assert.equal(fixture.calls.filter(call => call[0] === 'legacy-read').length, legacyReadsBefore);
    assert.equal(fixture.asyncValues.get('unrelated.data'), 'keep async data');
    assert.equal(fixture.secureValues.get('accessToken'), 'keep token');
    assert.equal(fixture.secureValues.get('refreshToken'), 'keep refresh');
    assert.ok(fixture.calls.every(call => call[1] === fixture.key));
  }
});

test('AsyncStorage takes precedence over legacy values, including invalid values falling back to system', async () => {
  for (const current of ['ko', 'system', 'invalid', '']) {
    const fixture = storageFixture({ current, legacy: 'ja' });
    const store = logic.createLanguageStore();
    await store.initialize({ read: fixture.storage.readLanguagePreference, write: fixture.storage.writeLanguagePreference,
      getLanguageTags: () => ['ko'] });
    assert.equal(store.getSnapshot().languagePreference, current === 'ko' ? 'ko' : 'system');
    assert.equal(fixture.asyncValues.get(fixture.key), current);
    assert.equal(fixture.secureValues.has(fixture.key), false);
    assert.ok(!fixture.calls.some(call => call[0] === 'legacy-read' || call[0] === 'write'));
  }
});

test('missing preference performs no write, and invalid legacy values migrate as system', async () => {
  const empty = storageFixture();
  assert.equal(await empty.storage.readLanguagePreference(), null);
  assert.deepEqual(empty.calls, [['read', empty.key], ['legacy-read', empty.key]]);
  const invalid = storageFixture({ legacy: 'ja-JP' });
  assert.equal(await invalid.storage.readLanguagePreference(), 'system');
  assert.equal(invalid.asyncValues.get(invalid.key), 'system');
  assert.equal(invalid.secureValues.has(invalid.key), false);
});

test('destination read failure preserves legacy data and completes the existing safe fallback', async () => {
  const fixture = storageFixture({ legacy: 'ja', asyncOverrides: {
    getItem: async () => { throw new Error('AsyncStorage read failed'); },
  } });
  const store = logic.createLanguageStore();
  await store.initialize({ read: fixture.storage.readLanguagePreference, write: fixture.storage.writeLanguagePreference,
    getLanguageTags: () => ['ko'] });
  assert.equal(store.getSnapshot().languagePreference, 'system');
  assert.equal(store.getSnapshot().isHydrated, true);
  assert.equal(store.getSnapshot().storageError, 'read');
  assert.equal(fixture.secureValues.get(fixture.key), 'ja');
  assert.deepEqual(fixture.calls, []);
});

test('legacy read failure neither writes nor deletes anything', async () => {
  const fixture = storageFixture({ legacy: 'ja', secureOverrides: {
    getItemAsync: async () => { throw new Error('legacy read failed'); },
  } });
  await assert.rejects(fixture.storage.readLanguagePreference(), /legacy read failed/);
  assert.equal(fixture.secureValues.get(fixture.key), 'ja');
  assert.equal(fixture.asyncValues.has(fixture.key), false);
  assert.deepEqual(fixture.calls, [['read', fixture.key]]);
});

test('failed migration keeps the legacy preference for retry without poisoning subsequent writes', async () => {
  let failing = true;
  const fixture = storageFixture({ legacy: 'ja', asyncOverrides: {
    setItem: async (key, value) => {
      if (failing) throw new Error('migration write failed');
      fixture.asyncValues.set(key, value);
    },
  } });
  await assert.rejects(fixture.storage.readLanguagePreference(), /migration write failed/);
  assert.equal(fixture.secureValues.get(fixture.key), 'ja');
  assert.equal(fixture.asyncValues.has(fixture.key), false);
  assert.ok(!fixture.calls.some(call => call[0] === 'legacy-delete'));
  failing = false;
  assert.equal(await fixture.storage.readLanguagePreference(), 'ja');
  assert.equal(fixture.secureValues.has(fixture.key), false);
  await fixture.storage.writeLanguagePreference('ko');
  assert.equal(fixture.asyncValues.get(fixture.key), 'ko');
});

test('failed cleanup keeps the migrated value authoritative and retries cleanup without remigration', async () => {
  let failing = true;
  const fixture = storageFixture({ legacy: 'ja', secureOverrides: {
    deleteItemAsync: async key => {
      if (failing) throw new Error('delete failed');
      fixture.secureValues.delete(key);
    },
  } });
  assert.equal(await fixture.storage.readLanguagePreference(), 'ja');
  assert.equal(fixture.asyncValues.get(fixture.key), 'ja');
  assert.equal(fixture.secureValues.get(fixture.key), 'ja');
  const callsBefore = fixture.calls.length;
  failing = false;
  assert.equal(await fixture.storage.readLanguagePreference(), 'ja');
  assert.equal(fixture.secureValues.has(fixture.key), false);
  assert.deepEqual(fixture.calls.slice(callsBefore), [['read', fixture.key]]);
});

test('a stalled legacy cleanup does not delay restored UI', async () => {
  const cleanup = deferred();
  const fixture = storageFixture({ legacy: 'ja', secureOverrides: { deleteItemAsync: () => cleanup.promise } });
  assert.equal(await fixture.storage.readLanguagePreference(), 'ja');
  assert.equal(fixture.asyncValues.get(fixture.key), 'ja');
  cleanup.resolve();
});

test('late legacy restore after a user selection cannot overwrite AsyncStorage', async () => {
  const legacyRead = deferred();
  const fixture = storageFixture({ secureOverrides: { getItemAsync: () => legacyRead.promise } });
  const reading = fixture.storage.readLanguagePreference(); await flush();
  await fixture.storage.writeLanguagePreference('ko');
  legacyRead.resolve('ja'); await reading;
  assert.equal(fixture.asyncValues.get(fixture.key), 'ko');
  assert.deepEqual(fixture.calls.filter(call => call[0] === 'write'), [['write', fixture.key, 'ko']]);
});

test('timed-out in-flight migration finishes before the new selection so the latest value wins', async () => {
  const migrationWrite = deferred(); let count = 0;
  const fixture = storageFixture({ legacy: 'ja', asyncOverrides: {
    setItem: async (key, value) => {
      if (++count === 1) await migrationWrite.promise;
      fixture.asyncValues.set(key, value);
    },
  } });
  const store = logic.createLanguageStore();
  await store.initialize({ read: fixture.storage.readLanguagePreference, write: fixture.storage.writeLanguagePreference,
    getLanguageTags: () => ['ko'] });
  assert.equal(store.getSnapshot().isHydrated, true);
  assert.equal(store.getSnapshot().storageError, 'read');
  const saving = store.setLanguagePreference('ko');
  assert.equal(store.getSnapshot().resolvedLanguage, 'ko');
  migrationWrite.resolve(); await saving; await flush();
  assert.equal(fixture.asyncValues.get(fixture.key), 'ko');
  assert.equal(store.getSnapshot().languagePreference, 'ko');
  assert.equal(fixture.secureValues.has(fixture.key), false);
});

test('rapid adapter writes recover from an older failure and keep the latest value', async () => {
  const first = deferred(); let count = 0;
  const fixture = storageFixture({ asyncOverrides: { setItem: async (key, value) => {
    if (++count === 1) await first.promise;
    fixture.asyncValues.set(key, value);
  } } });
  const older = fixture.storage.writeLanguagePreference('ja');
  const olderRejected = assert.rejects(older, /old failure/);
  await flush();
  const latest = fixture.storage.writeLanguagePreference('system');
  first.reject(new Error('old failure'));
  await Promise.all([olderRejected, latest]);
  assert.equal(fixture.asyncValues.get(fixture.key), 'system');
});

function environment({ value = null, tags = ['ko-KR'], read, write } = {}) {
  let saved = value, languageTags = tags;
  const writes = [];
  return { read: read ?? (async () => saved),
    write: write ?? (async value => { writes.push(value); saved = value; }),
    getLanguageTags: () => languageTags,
    tags: tags => { languageTags = tags; }, saved: () => saved, writes };
}

for (const [tags, expected] of [
  [['ko-KR'], 'ko'], [['ko'], 'ko'], [['ja-JP'], 'ja'], [['ja'], 'ja'],
  [['en-US'], 'ko'], [['zh-CN'], 'ko'], [[], 'ko'],
  [['en-US', 'ja-JP', 'ko-KR'], 'ja'], [['ja_JP'], 'ja'], [['KO-kr', 'ja'], 'ko'],
]) test(`first launch ${JSON.stringify(tags)} resolves ${expected}`, async () => {
  const store = logic.createLanguageStore();
  assert.equal(store.getSnapshot().isHydrated, false);
  await store.initialize(environment({ tags }));
  assert.deepEqual(store.getSnapshot(), { languagePreference: 'system', resolvedLanguage: expected,
    isHydrated: true, storageError: null });
});

test('explicit preference overrides the OS; transitions publish immediately and persist', async () => {
  const store = logic.createLanguageStore(), env = environment({ tags: ['ja-JP'] });
  await store.initialize(env);
  for (const [preference, language] of [['ko', 'ko'], ['ja', 'ja'], ['system', 'ja']]) {
    const saving = store.setLanguagePreference(preference);
    assert.equal(store.getSnapshot().languagePreference, preference);
    assert.equal(store.getSnapshot().resolvedLanguage, language);
    await saving;
    const restart = logic.createLanguageStore();
    await restart.initialize(env);
    assert.equal(restart.getSnapshot().languagePreference, preference);
    assert.equal(restart.getSnapshot().resolvedLanguage, language);
  }
  assert.deepEqual(env.writes, ['ko', 'ja', 'system']);
});

test('only system, ko and ja are accepted as stored preferences', async () => {
  for (const value of [null, '', 'en', 'KO', 'ja-JP', 'null', ' system ', '{"locale":"ja"}']) {
    const store = logic.createLanguageStore();
    await store.initialize(environment({ value, tags: ['ja'] }));
    assert.equal(store.getSnapshot().languagePreference, 'system');
    assert.equal(store.getSnapshot().resolvedLanguage, 'ja');
  }
});

test('read failure and device detection failure safely complete hydration', async () => {
  const store = logic.createLanguageStore();
  await store.initialize({ read: async () => { throw new Error('read'); }, write: async () => {},
    getLanguageTags: () => { throw new Error('device'); } });
  assert.deepEqual(store.getSnapshot(), { languagePreference: 'system', resolvedLanguage: 'ko',
    isHydrated: true, storageError: 'read' });
});

test('a stalled read times out and its late result cannot replace the active preference', async () => {
  const store = logic.createLanguageStore(), read = deferred();
  await store.initialize(environment({ read: () => read.promise, tags: ['ja'] }));
  assert.equal(store.getSnapshot().isHydrated, true);
  assert.equal(store.getSnapshot().storageError, 'read');
  await store.setLanguagePreference('ko');
  read.resolve('ja'); await flush();
  assert.equal(store.getSnapshot().languagePreference, 'ko');
});

test('a late restore cannot override a selection and initialization is shared', async () => {
  const store = logic.createLanguageStore(), read = deferred();
  const env = environment({ read: () => read.promise });
  const restoring = store.initialize(env);
  assert.equal(store.initialize(env), restoring);
  await store.setLanguagePreference('ja');
  read.resolve('ko'); await restoring;
  assert.equal(store.getSnapshot().resolvedLanguage, 'ja');
  assert.equal(store.getSnapshot().isHydrated, true);
});

test('write failure keeps the selected UI language and the same selection retries', async () => {
  const store = logic.createLanguageStore(); let failing = true, saved;
  await store.initialize(environment({ write: async value => {
    if (failing) throw new Error('write'); saved = value;
  } }));
  await store.setLanguagePreference('ja');
  assert.equal(store.getSnapshot().resolvedLanguage, 'ja');
  assert.equal(store.getSnapshot().storageError, 'write');
  failing = false;
  await store.setLanguagePreference('ja');
  assert.equal(saved, 'ja');
  assert.equal(store.getSnapshot().storageError, null);
});

test('rapid changes serialize writes; older failures cannot flag the latest selection', async () => {
  const first = deferred(), store = logic.createLanguageStore(), writes = []; let saved;
  const env = environment({ write: async value => {
    writes.push(value);
    if (writes.length === 1) await first.promise;
    saved = value;
  } });
  await store.initialize(env);
  const a = store.setLanguagePreference('ja'); await flush();
  const b = store.setLanguagePreference('ko'), c = store.setLanguagePreference('system');
  assert.equal(store.getSnapshot().languagePreference, 'system');
  assert.deepEqual(writes, ['ja']);
  first.reject(new Error('old write')); await Promise.all([a, b, c]);
  assert.deepEqual(writes, ['ja', 'ko', 'system']);
  assert.equal(saved, 'system');
  assert.equal(store.getSnapshot().storageError, null);
  const restart = logic.createLanguageStore();
  await restart.initialize(environment({ value: saved }));
  assert.equal(restart.getSnapshot().languagePreference, 'system');
});

test('foreground changes system language only; explicit overrides and snapshot identity remain stable', async () => {
  const store = logic.createLanguageStore(), env = environment();
  await store.initialize(env);
  env.tags(['ja']); store.refreshSystemLanguage();
  assert.equal(store.getSnapshot().resolvedLanguage, 'ja');
  await store.setLanguagePreference('ko'); const previous = store.getSnapshot();
  env.tags(['en']); store.refreshSystemLanguage();
  assert.equal(store.getSnapshot(), previous);
  await store.setLanguagePreference('system');
  assert.equal(store.getSnapshot().resolvedLanguage, 'ko');
});

test('a slow successful old write completes before the latest preference is persisted', async () => {
  const first = deferred(), store = logic.createLanguageStore(); let saved, count = 0;
  await store.initialize(environment({ write: async value => {
    if (++count === 1) await first.promise;
    saved = value;
  } }));
  const older = store.setLanguagePreference('ja'); await flush();
  const latest = store.setLanguagePreference('ko');
  assert.equal(store.getSnapshot().resolvedLanguage, 'ko');
  first.resolve(); await Promise.all([older, latest]);
  assert.equal(saved, 'ko');
});

test('real API defaults stay ko for both display languages and popup countries', async () => {
  const requests = [];
  let country = 'KR';
  const load = modules({ '../constants/api': { API_BASE_URL: 'https://api.example' },
    fetch: async url => {
      requests.push(url);
      return { ok: true, status: 200, json: async () => url.includes('main-banners')
        ? { popups: [] } : { publicId: 'popup', countryCode: country, name: 'Original popup' } };
    } });
  const { languageStore } = load('src/locales/languageStore.ts');
  await languageStore.initialize(environment());
  const { getPopupDetail } = load('src/lib/popups.ts');
  const { getMainBanners } = load('src/lib/mainBanners.ts');
  for (const preference of ['ko', 'ja']) {
    await languageStore.setLanguagePreference(preference);
    for (const popupCountry of ['KR', 'JP']) {
      country = popupCountry;
      const detail = await getPopupDetail('popup', new AbortController().signal);
      assert.equal(detail.countryCode, popupCountry);
      assert.equal(detail.name, 'Original popup');
      await getMainBanners(new AbortController().signal);
    }
  }
  assert.equal(requests.length, 8);
  assert.ok(requests.every(url => url.endsWith('languageCode=ko')));
});

function uiRuntime() {
  const renders = new Set(), effects = [], cleanups = [];
  let current, index;
  const react = {
    useSyncExternalStore(subscribe, snapshot) {
      const slot = index++, owner = current;
      if (!owner.slots[slot]) {
        owner.slots[slot] = {};
        owner.cleanups.push(subscribe(() => owner.render()));
      }
      return snapshot();
    },
    useMemo(fn, deps) {
      const slot = index++, old = current.slots[slot];
      if (!old || old.deps.some((value, i) => value !== deps[i])) current.slots[slot] = { deps, value: fn() };
      return current.slots[slot].value;
    },
    useEffect(fn) { index++; effects.push(fn); },
    useRef(value) { const slot = index++; return current.slots[slot] ??= { current: value }; },
    useState(value) {
      const slot = index++, owner = current;
      owner.slots[slot] ??= { value };
      return [owner.slots[slot].value, value => { owner.slots[slot].value = value; owner.render(); }];
    },
  };
  function mount(render) {
    const owner = { slots: [], cleanups: [], count: 0,
      render() { current = owner; index = 0; owner.count++; owner.tree = render(); } };
    renders.add(owner); owner.render();
    effects.splice(0).forEach(fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); });
    return owner;
  }
  return { react, mount, dispose() { renders.forEach(owner => owner.cleanups.forEach(fn => fn())); cleanups.forEach(fn => fn()); } };
}
const jsx = (type, props, key) => ({ type, props, key });
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: value => value, hairlineWidth: 1 }, ActivityIndicator: 'ActivityIndicator' };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children)];

test('real t supports fallback, object labels and interpolation; API language stays independent', async () => {
  const load = modules(), { languageStore } = load('src/locales/languageStore.ts');
  const locale = load('src/locales/index.ts');
  await languageStore.initialize(environment());
  await languageStore.setLanguagePreference('ja');
  assert.equal(locale.getLocale(), 'ja');
  assert.equal(locale.getApiLocale(), 'ko');
  assert.equal(locale.t('place.detail.about'), 'ポップアップ紹介');
  assert.equal(locale.t('missing.key'), 'missing.key');
  assert.equal(locale.t('place.filters.details'), '詳細フィルター');
  assert.equal(locale.t('place.explore.back'), '戻る');
  assert.equal(locale.t('place.explore.notFound'), locale.translate('ko', 'place.explore.notFound'));
  assert.equal(locale.translate('ko', 'place.filters.regions'), '지역');
  assert.equal(locale.t('place.filters.regions'), 'エリア');
  assert.equal(locale.t('community.views', { count: 3 }), locale.translate('ja', 'community.views', { count: 3 }));
});

test('retained components with real t and subscription update with identical props and preserve filters', async () => {
  const runtime = uiRuntime();
  const load = modules({ react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...native, FlatList: 'FlatList', Image: 'Image' }, 'lucide-react-native': { ChevronDown: 'ChevronDown' } });
  const { languageStore } = load('src/locales/languageStore.ts');
  const locale = load('src/locales/index.ts'), { useTranslation } = load('src/hooks/useTranslation.ts');
  await languageStore.initialize(environment());
  const selectedFilters = { countries: ['JP'], quickFeatures: ['preReservation'] }, calls = [];
  const props = { selectedFilters, onToggleCountry: value => calls.push(value),
    onToggleFeature: value => calls.push(value), onOpenDetails() {} };
  const Component = load('src/components/place/QuickFilterBar.tsx').default;
  const tab = runtime.mount(() => Component(props));
  const Carousel = load('src/components/community/CommunityImageCarousel.tsx').default;
  const images = ['original-user-image'];
  const carousel = runtime.mount(() => Carousel({ images }));
  nodes(carousel.tree).find(node => node.props?.onLayout).props.onLayout({ nativeEvent: { layout: { width: 300 } } });
  const imageLabel = () => nodes(carousel.tree).find(node => node.type === 'FlatList')
    .props.renderItem({ item: images[0], index: 0 }).props.accessibilityLabel;
  assert.equal(imageLabel(), '1번째 게시글 이미지');
  const memo = runtime.mount(() => {
    const { resolvedLanguage } = useTranslation();
    return runtime.react.useMemo(() => locale.t('language.settings'), [resolvedLanguage]);
  });
  assert.equal(memo.tree, '설정');
  const previousCount = tab.count;
  await languageStore.setLanguagePreference('ja');
  assert.ok(tab.count > previousCount, 'subscription updates an already mounted component');
  assert.equal(memo.tree, '設定');
  assert.equal(imageLabel(), '1枚目の投稿画像');
  assert.deepEqual(images, ['original-user-image']);
  assert.deepEqual(selectedFilters, { countries: ['JP'], quickFeatures: ['preReservation'] });
  assert.deepEqual(calls, []);
  assert.equal(nodes(tab.tree).filter(node => node.props?.accessibilityState?.selected).length, 2);
  const reentry = runtime.mount(() => Component(props));
  assert.deepEqual(nodes(reentry.tree).filter(node => node.type === 'Text').map(node => node.props.children),
    nodes(tab.tree).filter(node => node.type === 'Text').map(node => node.props.children));
  runtime.dispose();
});

test('all current t and community-time UI consumers subscribe to the language store', () => {
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
  }
  for (const file of walk('src').filter(file => file.endsWith('.tsx'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"][^'"]*locales['"]/.test(source)
      || /import\s*\{[^}]*formatCommunityTime[^}]*\}/.test(source)) {
      assert.match(source, /\buseTranslation\(\)/, `Missing subscription in ${file}`);
    }
  }
});

test('language settings works anonymously, exposes checked radios, switches immediately and preserves back navigation', async () => {
  const runtime = uiRuntime(), navigation = [];
  const load = modules({ react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...native, Alert: { alert() {} } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'lucide-react-native': { ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight' },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back: () => navigation.push('back') }) },
    '../../lib/auth': { getAuthUser: () => null, subscribeAuthUser: () => () => {}, logout: async () => {} },
    '../../components/profile/ThemePreferenceSheet': { default: 'ThemePreferenceSheet' },
    '../../theme/useTheme': { useTheme: () => ({ themePreference: 'system' }) },
  });
  const { languageStore } = load('src/locales/languageStore.ts');
  await languageStore.initialize(environment());
  const Screen = load('src/app/profile/language.tsx').default;
  const screen = runtime.mount(() => Screen());
  let radios = nodes(screen.tree).filter(node => node.props?.accessibilityRole === 'radio');
  assert.deepEqual(radios.map(node => node.props.accessibilityLabel), ['시스템 설정', '한국어', '日本語']);
  assert.equal(radios[0].props.accessibilityState.checked, true);
  radios[2].props.onPress();
  assert.equal(languageStore.getSnapshot().resolvedLanguage, 'ja');
  radios = nodes(screen.tree).filter(node => node.props?.accessibilityRole === 'radio');
  assert.equal(radios[0].props.accessibilityLabel, 'システム設定');
  assert.equal(radios[2].props.accessibilityState.checked, true);
  nodes(screen.tree).find(node => node.props?.accessibilityLabel === '戻る').props.onPress();
  assert.deepEqual(navigation, ['back']);
  await flush(); runtime.dispose();
});

test('provider gates the first frame, uses a dedicated storage key, rechecks foreground and removes listener', async () => {
  const runtime = uiRuntime(), read = deferred(), calls = []; let listener, removed = false, tags = ['ja-JP'];
  const load = modules({ react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...native, AppState: { addEventListener: (event, fn) => {
      assert.equal(event, 'change'); listener = fn; return { remove: () => { removed = true; } };
    } } },
    'expo-localization': { getLocales: () => tags.map(languageTag => ({ languageTag })) },
    '@react-native-async-storage/async-storage': {
      getItem: key => { calls.push(['read', key]); return read.promise; },
      setItem: async (key, value) => calls.push(['write', key, value]),
    },
    'expo-secure-store': { deleteItemAsync: async key => calls.push(['legacy-delete', key]) },
    'expo-splash-screen': { preventAutoHideAsync: async () => calls.push(['prevent']),
      hideAsync: async () => calls.push(['hide']) },
  });
  const { languageStore, LANGUAGE_STORAGE_KEY } = load('src/locales/languageStore.ts');
  const Provider = load('src/locales/LanguageProvider.tsx').default;
  const screen = runtime.mount(() => Provider({ children: 'retained stack' }));
  assert.equal(screen.tree, null);
  assert.equal(calls.some(call => call[0] === 'hide'), false);
  read.resolve('ja'); await flush();
  assert.equal(screen.tree.props.children, 'retained stack');
  assert.equal(languageStore.getSnapshot().resolvedLanguage, 'ja');
  screen.tree.props.onLayout(); await flush();
  assert.ok(calls.some(call => call[0] === 'hide'));
  await languageStore.setLanguagePreference('system');
  tags = ['ko-KR']; listener('background');
  assert.equal(languageStore.getSnapshot().resolvedLanguage, 'ja');
  listener('active');
  assert.equal(languageStore.getSnapshot().resolvedLanguage, 'ko');
  assert.ok(calls.some(call => call[0] === 'write' && call[1] === LANGUAGE_STORAGE_KEY && call[2] === 'system'));
  runtime.dispose(); assert.equal(removed, true);
});
