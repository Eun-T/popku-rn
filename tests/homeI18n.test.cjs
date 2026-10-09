const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props, key) => ({ type, props, key });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children);
const component = (tree, name) => nodes(tree).find(node => node.type?.name === name);

class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [2026, 9, 9, 12])); }
  static now() { return new Clock().getTime(); }
}

// The real translation, store, subscription hook and home data hook run in the
// project's Node hook harness. Native rendering and text measurement are separate.
function runtime() {
  let current, cursor = 0;
  const owners = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const owner = current, slot = cursor++;
      owner.slots[slot] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [owner.slots[slot].value, next => {
        owner.slots[slot].value = typeof next === 'function' ? next(owner.slots[slot].value) : next;
        owner.render();
      }];
    },
    useMemo(fn, deps) {
      const slot = cursor++;
      if (!same(current.slots[slot]?.deps, deps)) current.slots[slot] = { deps, value: fn() };
      return current.slots[slot].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const owner = current, slot = cursor++;
      if (!same(owner.slots[slot]?.deps, deps)) {
        owner.effects.push(() => { owner.slots[slot]?.cleanup?.(); owner.slots[slot] = { deps, cleanup: fn() }; });
      }
    },
    useSyncExternalStore(subscribe, snapshot) {
      const owner = current, slot = cursor++;
      if (owner.slots[slot]?.subscribe !== subscribe) {
        owner.slots[slot]?.cleanup?.();
        owner.slots[slot] = { subscribe, cleanup: subscribe(() => owner.render()) };
      }
      return snapshot();
    },
  };
  function mount(render) {
    const owner = { slots: [], effects: [], count: 0, render() {
      const previous = current; current = owner; cursor = 0;
      owner.count++; owner.tree = render();
      owner.effects.splice(0).forEach(fn => fn()); current = previous;
    } };
    owners.push(owner); owner.render(); return owner;
  }
  return { react, mount, dispose() { owners.forEach(owner => owner.slots.forEach(slot => slot?.cleanup?.())); } };
}

function loader(overrides) {
  const cache = new Map();
  function load(file) {
    if (file in overrides) return overrides[file];
    if (cache.has(file)) return cache.get(file);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (file.endsWith('.png')) return 'original-placeholder';
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', 'Date', source)(name => {
      if (name in overrides) return overrides[name];
      assert.ok(name.startsWith('.'), `Missing dependency: ${name}`);
      let relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      if (!path.posix.extname(relative)) relative += fs.existsSync(`${relative}.ts`) ? '.ts'
        : fs.existsSync(`${relative}.tsx`) ? '.tsx' : '/index.ts';
      return load(relative);
    }, module, module.exports, Clock);
    cache.set(file, module.exports); return module.exports;
  }
  return load;
}

const popup = index => ({ publicId: `public-${index}`, name: `서버 팝업 ${index}`, countryCode: 'JP',
  regionId: 23, regionName: '서버 지역', tags: [{ id: 17, name: '서버 태그' }],
  coverImageUrl: `https://image.example/${index}`, startDate: '2026-10-08', endDate: '2026-10-31' });

async function home({ popups = Array.from({ length: 8 }, (_, i) => popup(i)), fail = false, favoritesStatus = 'ready' } = {}) {
  const ui = runtime(), requests = [], routes = [], taps = [], favorites = [], retries = [];
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', ScrollView: 'ScrollView',
    useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: styles => styles } };
  const api = async (section, country) => {
    requests.push({ section, country });
    if (fail) throw new Error('request failure');
    return popups;
  };
  const load = loader({ react: ui.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'lucide-react-native': { Store: 'Store', Heart: 'Heart' },
    'expo-router': { useRouter: () => ({ push: value => routes.push(value) }) },
    'src/lib/popups.ts': { currentWeekRange: () => ({ openingFrom: '2026-10-05', openingTo: '2026-10-11' }),
      getNowHotPopups: country => api('trending', country), getNewPopups: country => api('new', country) },
    'src/hooks/usePopupFavorites.ts': { usePopupFavorites: () => ({
      isFavorite: () => true, isFavoriteDisabled: () => false, toggleFavorite: item => favorites.push(item.publicId),
      favoritesStatus, retryFavorites: async () => retries.push('retry'),
    }) },
    'src/components/home/HomePopupSkeleton.tsx': { HomeTrendingSkeleton: 'TrendingSkeleton',
      RankingSkeletonFooter: 'RankingSkeletonFooter', HomeNewPopupSkeleton: 'NewSkeleton' },
  });
  const { languageStore } = load('src/locales/languageStore.ts');
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ja-JP'] });
  const Trending = load('src/components/home/HomeTrendingSection.tsx').default;
  const New = load('src/components/home/HomeNewPopupSection.tsx').default;
  const props = { onPressPopup: id => taps.push(id) };
  const trending = ui.mount(() => Trending(props)), fresh = ui.mount(() => New(props));
  await flush(); await flush();
  return { ...ui, load, languageStore, trending, fresh, props, popups, requests, routes, taps, favorites, retries };
}

const files = ['HomeTrendingSection', 'HomeNewPopupSection', 'NewPopupCard', 'PopupRankingCard']
  .map(name => `src/components/home/${name}.tsx`);

test('home region/category labels update by verified IDs without changing originals, carousel or card actions', async () => {
  const known = Object.freeze({ ...popup(0), countryCode:'KR', regionId:1, regionName:'성수',
    tags:Object.freeze([Object.freeze({ id:5,name:'뷰티' })]) });
  const env=await home({popups:[known]});
  const original=JSON.stringify(known), before=env.requests.slice();
  const cards=()=>[component(env.trending.tree,'PopupRankingCard'),component(env.fresh.tree,'NewPopupCard')];
  const originals=cards().map(c=>({ key:c.key,title:c.props.title,image:c.props.image,period:c.props.period }));
  cards().forEach(c=>assert.deepEqual(c.props.tags,['성수','뷰티']));
  await env.languageStore.setLanguagePreference('ja'); await flush();
  cards().forEach((c,i)=>{
    assert.deepEqual(c.props.tags,['聖水','ビューティー']);
    assert.deepEqual({ key:c.key,title:c.props.title,image:c.props.image,period:c.props.period },originals[i]);
    c.props.onPress(); c.props.onToggleFavorite();
  });
  assert.deepEqual(env.taps,[known.publicId,known.publicId]); assert.deepEqual(env.favorites,[known.publicId,known.publicId]);
  assert.deepEqual(env.requests,before); assert.equal(JSON.stringify(known),original);
  await env.languageStore.setLanguagePreference('ko'); cards().forEach(c=>assert.deepEqual(c.props.tags,['성수','뷰티']));
  env.dispose();
});
const lookup = (dictionary, key) => key.split('.').reduce((node, part) => node?.[part], dictionary);

test('all 18 used home keys exist in ko/ja with matching placeholders and no new duplicate text keys', () => {
  const keys = new Set();
  for (const file of files) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteral(node) && /^(home\.|place\.filters\.(countries\.|collapse$)|place\.explore\.viewDetails$)/.test(node.text)) keys.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.equal(keys.size, 18);
  assert.equal([...keys].filter(key => key.startsWith('home.')).length, 14);
  const ko = JSON.parse(fs.readFileSync('src/locales/ko.json', 'utf8'));
  const ja = JSON.parse(fs.readFileSync('src/locales/ja.json', 'utf8'));
  const placeholders = message => [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of keys) {
    for (const resource of [ko, ja]) assert.ok(typeof lookup(resource, key) === 'string' && lookup(resource, key).trim(), key);
    assert.deepEqual(placeholders(lookup(ko, key)), placeholders(lookup(ja, key)), key);
  }
  assert.equal(new Set([...keys].map(key => lookup(ko, key))).size, 18);
});

test('Korean UI preserves original text and the expanded ranking/country state survives live ko/ja/system switching', async () => {
  const env = await home();
  assert.deepEqual(text(env.trending.tree).slice(0, 2), ['지금 뜨는 팝업 🔥', '요즘 인기 있는 팝업을 모아봤어요!']);
  assert.deepEqual(text(env.fresh.tree).slice(0, 2), ['이번 주 새로 열려요 ✨', '이번 주 새롭게 오픈하는 팝업을 만나보세요!']);
  const filter = () => component(env.trending.tree, 'FilterChips');
  assert.deepEqual(filter().props.options, [{ label: '한국', value: 'KR' }, { label: '일본', value: 'JP' }]);
  component(env.trending.tree, 'MoreButton').props.onPress();
  assert.equal(component(env.trending.tree, 'MoreButton').props.label, '접기');
  const stylesBefore = nodes(env.trending.tree).filter(node => node.type === 'Text').map(node => node.props.style);
  const callsBefore = env.requests.length;
  await env.languageStore.setLanguagePreference('ja'); await flush();
  assert.equal(text(env.trending.tree)[0], '今話題のポップアップ 🔥');
  assert.equal(text(env.fresh.tree)[0], '今週オープン ✨');
  assert.equal(component(env.trending.tree, 'MoreButton').props.label, '閉じる');
  assert.equal(nodes(env.trending.tree).filter(node => node.type?.name === 'PopupRankingCard').length, 8);
  assert.equal(filter().props.value, 'KR');
  assert.deepEqual(filter().props.options, [{ label: '韓国', value: 'KR' }, { label: '日本', value: 'JP' }]);
  assert.deepEqual(nodes(env.trending.tree).filter(node => node.type === 'Text').map(node => node.props.style), stylesBefore);
  assert.equal(env.requests.length, callsBefore, 'UI language must not trigger a new data request');
  await env.languageStore.setLanguagePreference('ko');
  assert.equal(component(env.trending.tree, 'MoreButton').props.label, '접기');
  await env.languageStore.setLanguagePreference('system');
  assert.equal(env.languageStore.getSnapshot().resolvedLanguage, 'ja');
  assert.equal(text(env.trending.tree)[0], '今話題のポップアップ 🔥');
  const reentry = env.mount(() => env.load('src/components/home/HomeTrendingSection.tsx').default(env.props));
  assert.equal(text(reentry.tree)[0], '今話題のポップアップ 🔥');
  assert.equal(env.requests.length, callsBefore);
  env.dispose();
});

test('country chips render real translated labels and keep KR/JP values; more navigation preserves query IDs/range', async () => {
  const env = await home();
  for (const section of [env.trending, env.fresh]) {
    const element = component(section.tree, 'FilterChips');
    const filterTree = element.type(element.props);
    nodes(filterTree).filter(node => node.type === 'Pressable')[1].props.onPress();
  }
  await flush(); await flush();
  const before = env.requests.length;
  const carousel = () => nodes(env.fresh.tree).find(node => node.type === 'ScrollView');
  const carouselBefore = carousel();
  const dataBefore = nodes(env.fresh.tree).filter(node => node.type?.name === 'NewPopupCard')
    .map(node => ({ key: node.key, title: node.props.title, image: node.props.image, period: node.props.period, tags: node.props.tags }));
  await env.languageStore.setLanguagePreference('ja'); await flush();
  assert.equal(component(env.fresh.tree, 'FilterChips').props.value, 'JP');
  assert.equal(component(env.trending.tree, 'FilterChips').props.value, 'JP');
  assert.equal(env.requests.length, before);
  assert.deepEqual(env.requests.slice(-2), [{ section: 'trending', country: 'JP' }, { section: 'new', country: 'JP' }]);
  assert.equal(carousel().key, carouselBefore.key);
  assert.equal(carousel().props.horizontal, true);
  assert.deepEqual(carousel().props.style, carouselBefore.props.style);
  assert.deepEqual(nodes(env.fresh.tree).filter(node => node.type?.name === 'NewPopupCard')
    .map(node => ({ key: node.key, title: node.props.title, image: node.props.image, period: node.props.period, tags: node.props.tags })), dataBefore);
  const more = component(env.fresh.tree, 'MoreButton');
  const moreTree = more.type(more.props);
  assert.equal(moreTree.props.accessibilityLabel, 'もっと見る');
  moreTree.props.onPress();
  assert.equal(env.routes[0].pathname, '/(tabs)/places');
  assert.deepEqual(env.routes[0].params, { tab: 'all', countryCode: 'JP', openingFrom: '2026-10-05', openingTo: '2026-10-11', homeNewEntry: String(Clock.now()) });
  env.dispose();
});

test('both retained cards translate accessibility labels while preserving server data, images, styles and tap/favorite actions', async () => {
  const env = await home();
  const cardElements = [nodes(env.trending.tree).find(node => node.type?.name === 'PopupRankingCard'),
    nodes(env.fresh.tree).find(node => node.type?.name === 'NewPopupCard')];
  for (const element of cardElements) {
    const props = element.props;
    const card = env.mount(() => element.type(props));
    const presses = () => nodes(card.tree).filter(node => node.type === 'Pressable');
    assert.equal(presses()[0].props.accessibilityLabel, `${props.title} 상세 보기`);
    assert.equal(presses()[1].props.accessibilityLabel, `${props.title} 찜 취소`);
    const imagesBefore = nodes(card.tree).filter(node => node.type === 'Image').map(node => node.props);
    const stylesBefore = nodes(card.tree).map(node => node.props.style);
    const renderBefore = card.count;
    await env.languageStore.setLanguagePreference('ja');
    assert.ok(card.count > renderBefore, 'identical card props still receive the language update');
    assert.equal(presses()[0].props.accessibilityLabel, `${props.title}の詳細を見る`);
    assert.equal(presses()[1].props.accessibilityLabel, `${props.title}のお気に入りを解除`);
    assert.deepEqual(presses()[1].props.accessibilityState, { selected: true, disabled: false });
    assert.deepEqual(nodes(card.tree).filter(node => node.type === 'Image').map(node => node.props), imagesBefore);
    assert.deepEqual(nodes(card.tree).map(node => node.props.style), stylesBefore);
    assert.ok(text(card.tree).includes(props.title));
    assert.ok(text(card.tree).flat().includes('서버 태그'));
    presses()[0].props.onPress();
    let stopped = false;
    presses()[1].props.onPress({ stopPropagation: () => { stopped = true; } });
    if (element.type.name === 'NewPopupCard') assert.equal(stopped, true);
    const unselected = env.mount(() => element.type({ ...props, isFavorite: false }));
    assert.equal(nodes(unselected.tree).find(node => node.props?.accessibilityLabel?.endsWith('をお気に入りに追加'))
      .props.accessibilityLabel, `${props.title}をお気に入りに追加`);
    await env.languageStore.setLanguagePreference('ko');
  }
  assert.deepEqual(env.taps, ['public-0', 'public-0']);
  assert.deepEqual(env.favorites, ['public-0', 'public-0']);
  env.dispose();
});

test('empty and error states and favorite retry controls update immediately without exposing resource keys', async () => {
  for (const fail of [false, true]) {
    const env = await home({ popups: [], fail, favoritesStatus: 'error' });
    assert.ok(text(env.trending.tree).includes('찜 상태를 불러오지 못했어요. 다시 시도'));
    assert.ok(text(env.trending.tree).includes(fail ? '팝업을 불러오지 못했어요.' : '진행 중인 팝업이 없어요'));
    assert.ok(text(env.fresh.tree).includes(fail ? '팝업을 불러오지 못했어요.' : '이번 주 새로 여는 팝업이 없어요.'));
    await env.languageStore.setLanguagePreference('ja');
    const trendingText = text(env.trending.tree), freshText = text(env.fresh.tree);
    assert.ok(trendingText.includes(fail ? 'ポップアップを読み込めませんでした。' : '開催中のポップアップはありません'));
    assert.ok(freshText.includes(fail ? 'ポップアップを読み込めませんでした。' : '今週オープンするポップアップはありません。'));
    assert.ok([...trendingText, ...freshText].every(value => !/[가-힣]/.test(value) && !/^(home|place)\./.test(value)));
    for (const section of [env.trending, env.fresh]) nodes(section.tree)
      .find(node => node.props?.accessibilityLabel === 'お気に入りを再読み込み').props.onPress();
    assert.deepEqual(env.retries, ['retry', 'retry']);
    env.dispose();
  }
});
