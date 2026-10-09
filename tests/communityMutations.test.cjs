const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
function load(file, mocks = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  mocks = { '../../components/community/CommunityPostMenu': { __esModule: true, default: 'CommunityPostMenu' }, ...mocks };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in mocks)) throw new Error(`Missing ${name} in ${file}`);
    return mocks[name];
  }, module, module.exports); return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const button = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);
const post = { id: 1, category: 'QUESTION', author: { id: 1, nickname: 'owner', avatarUrl: null }, content: 'original',
  createdAt: '2026-10-04T10:00:00+09:00', updatedAt: '2026-10-04T10:00:00+09:00', images: ['signed:old'], imageIds: [10],
  liked: true, likeCount: 12, commentCount: 4, viewCount: 20, isOwner: true };
const item = { ...post, type: 'POST', popup: null, rating: null, regionName: null };
const patch = { content: 'edited', images: ['signed:new'], imageIds: [11], updatedAt: '2026-10-04T11:00:00+09:00' };
const diagnostics = load('src/lib/communityDiagnostics.ts');
function hooks() {
  const states = [], refs = [], effects = [], callbacks = [], focuses = [];
  let s = 0, r = 0, e = 0, c = 0, f = 0;
  const equal = (a, b) => a?.length === b.length && b.every((value, i) => value === a[i]);
  const react = {
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useState(initial) { const i = s++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[r++] ??= { current: initial }; },
    useEffect(fn, deps) { const i = e++, previous = effects[i]; if (previous && equal(previous.deps, deps)) return;
      previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; },
    useCallback(fn, deps) { const i = c++, previous = callbacks[i]; if (previous && equal(previous.deps, deps)) return previous.fn;
      callbacks[i] = { fn, deps }; return fn; },
  };
  return { react, render(Component) { s = r = e = c = f = 0; return Component(); },
    useFocusEffect(fn) { const i = f++, previous = focuses[i]; if (fn === previous?.fn) return;
      previous?.cleanup?.(); focuses[i] = { fn, cleanup: fn() }; },
    focus() { focuses.forEach(effect => { effect.cleanup = effect.fn(); }); },
    blur() { focuses.forEach(effect => effect.cleanup?.()); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); focuses.forEach(effect => effect.cleanup?.()); },
  };
}
function setup({ owner = true } = {}) {
  const sync = load('src/lib/communityFeedRefresh.ts');
  const alerts = [], routes = [], calls = [];
  let back = 0, cleared = 0, beforeRemove;
  let update = async () => ({ ...post, ...patch });
  let remove = async () => {};
  let editRead = async () => ({ ...post, isOwner: owner });
  let feedResponse = async cursor => ({ items: cursor ? [{ ...item, id: 2 }] : [item, { ...item, id: 1, type: 'REVIEW', category: 'REVIEW' }], nextCursor: cursor ? 'cursor-2' : 'cursor-1' });
  class ApiError extends Error { constructor(status) { super(String(status)); this.status = status; } }
  const api = { CommunityApiError: ApiError, getCommunityPost: async () => ({ ...post, isOwner: owner }),
    getCommunityPostForEdit: (...args) => editRead(...args), updateCommunityPost: (...args) => { calls.push(['patch', ...args]); return update(...args); },
    deleteCommunityPost: (...args) => { calls.push(['delete', ...args]); return remove(...args); },
    getCommunityFeed: (category, sort, cursor) => { calls.push(['feed', category, sort, cursor]); return feedResponse(cursor); },
    createCommunityPost: async () => { throw new Error('edit must not create'); },
  };
  const auth = { getAuthUser: () => ({ email: 'me' }), subscribeAuthUser: () => () => {}, subscribeAuthSession: () => () => {}, clearTokens: async () => { cleared++; } };
  const jsx = (type, props, key) => ({ type, props, key });
  const native = Object.fromEntries(['ActivityIndicator','FlatList','Pressable','ScrollView','Text','View','Image','TextInput','KeyboardAvoidingView'].map(name => [name,name]));
  native.StyleSheet = { create: value => value }; native.Platform = { OS: 'ios' };
  native.Alert = { alert: (...args) => alerts.push(args) };
  const base = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top:0,bottom:0,left:0,right:0 }) },
    'lucide-react-native': Object.fromEntries(['ChevronLeft','Heart','MessageCircle','MoreHorizontal','ImagePlus','X','Pencil','Settings'].map(name => [name,name])),
  };
  function screen(file, params, prefix) {
    const state = hooks();
    const guard = require('./helpers/preventRemove.cjs').removalDriver(state.react);
    const router = { push(route) { routes.push(route); }, back() { back++; }, canGoBack: () => true, replace(route) { routes.push(route); } };
    const common = { ...base, react: state.react,
      'expo-router': { useRouter: () => router, useLocalSearchParams: () => params, useFocusEffect: fn => state.useFocusEffect(fn), useScrollToTop() {},
        useNavigation: () => guard.navigation },
      'expo-router/react-navigation': { usePreventRemove: guard.usePreventRemove },
      [`${prefix}/lib/community`]: api, [`${prefix}/lib/communityFeedRefresh`]: sync,
      [`${prefix}/lib/auth`]: auth, [`${prefix}/lib/communityDiagnostics`]: diagnostics,
      [`${prefix}/lib/communityLikes`]: { changeCommunityLike: async () => {} },
      [`${prefix}/lib/communityRefresh`]: { waitForCommunityRefresh: async () => {} },
      [`${prefix}/hooks/useCommunityNow`]: { useCommunityNow: () => ({ now: Date.now(), updateNow: stableNow }) },
      [`${prefix}/locales`]: { t: key => key }, [`${prefix}/theme/communityColors`]: { communityColors: {} },
      [`${prefix}/theme/tokens`]: { radius:{}, spacing:{}, typography:{} },
      [`${prefix}/components/community/CommunityAuthor`]: { __esModule:true, default:'CommunityAuthor' },
      [`${prefix}/components/community/CommunityImageCarousel`]: { __esModule:true, default:'CommunityImageCarousel' },
      [`${prefix}/components/community/CommunityComments`]: { __esModule:true, default:'CommunityComments' },
      [`${prefix}/components/community/CommunityPostItem`]: { __esModule:true, default:'CommunityPostItem' },
      [`${prefix}/components/navigation/FloatingTabBar`]: { FLOATING_TAB_BAR_BOTTOM_GAP:0, FLOATING_TAB_BAR_HEIGHT:0 },
      [`${prefix}/lib/communityImages`]: { MAX_POST_IMAGES:5, ImageSelectionError:class extends Error {},
        selectPostImages: async (_, observer, count) => { calls.push(['select', count]); const image = { uri:'file://new.webp', width:100,height:100,mimeType:'image/webp' };
          observer.onSelected([image]); observer.onConverted(0, image); },
        updatePostWithImages: async (id, content, retained, added) => { calls.push(['images', id, content, retained, added]); return update(); },
      },
    };
    const Component = load(file, common).default;
    beforeRemove = () => { const count = guard.completed.length; guard.request({ type: 'GO_BACK' }); return guard.completed.length === count; };
    return { state, render: () => state.render(Component), list: () => nodes(state.render(Component)).find(node => node.type === 'FlatList') };
  }
  return { sync, alerts, calls, routes, ApiError, get back() { return back; }, get cleared() { return cleared; },
    feed: () => screen('src/screens/CommunityScreen.tsx', {}, '..'),
    detail: () => screen('src/app/community/[id].tsx', { id:'1' }, '../..'),
    edit: () => screen('src/app/community/write.tsx', { editId:'1' }, '../..'),
    update(fn) { update = fn; }, remove(fn) { remove = fn; }, editRead(fn) { editRead = fn; },
    feedResponse(fn) { feedResponse = fn; },
    tryLeave() { return beforeRemove?.() ?? false; },
  };
}
const stableNow = () => {};
const sheet = detail => nodes(detail.render()).find(node => node.type === 'CommunityPostMenu');
const openSheet = detail => { button(detail.render(), 'community.postMenu').props.onPress(); return sheet(detail).props.onSelect; };

test('only owner can open bottom sheet; destructive delete requires confirmation; cancel changes nothing', async () => {
  for (const owner of [false,true]) {
    const env = setup({ owner }), detail = env.detail(); detail.render(); await flush();
    const menu = button(detail.render(), 'community.postMenu');
    assert.equal(Boolean(menu), owner);
    if (owner) {
      assert.equal(sheet(detail), undefined, 'sheet opens only on menu press');
      menu.props.onPress(); menu.props.onPress();
      assert.equal(nodes(detail.render()).filter(node => node.type === 'CommunityPostMenu').length, 1);
      sheet(detail).props.onSelect(0);
      assert.equal(sheet(detail), undefined);
      assert.equal(env.calls.length, 0); assert.equal(env.routes.length, 0);
      openSheet(detail)(2);
      assert.equal(env.alerts[0][0], 'community.delete.title');
      assert.equal(env.alerts[0][2][1].style,'destructive');
      env.alerts[0][2][0].onPress(); assert.equal(env.calls.length,0); assert.equal(env.back,0);
      assert.equal(env.sync.communityFeedRevision(),0);
    }
    detail.state.cleanup();
  }
});

test('edit navigation locks synchronously and is available again only after detail regains focus', async () => {
  const env = setup(), detail = env.detail(); detail.render(); await flush();
  const select = openSheet(detail);
  select(1); select(1);
  assert.deepEqual(env.routes, [{ pathname:'/community/write', params:{ editId:'1' } }]);
  detail.state.blur(); detail.state.focus();
  openSheet(detail)(1);
  assert.equal(env.routes.length,2); detail.state.cleanup();
});

test('shared edit form prefills content and retained images, fixes category, saves once and patches detail/feed only', async () => {
  const env = setup(), feed = env.feed(), detail = env.detail(), edit = env.edit();
  feed.render(); detail.render(); edit.render(); await flush();
  let tree = edit.render();
  assert.equal(nodes(tree).find(n => n.type === 'TextInput').props.value,'original');
  assert.equal(nodes(tree).find(n => n.type === 'Image').props.source.uri,'signed:old');
  const categories = nodes(tree).filter(n => n.type === 'Pressable' && n.props.accessibilityState?.selected !== undefined);
  assert.equal(categories.length,2); assert.ok(categories.every(n => n.props.disabled));
  categories[1].props.onPress();
  nodes(tree).find(n => n.type === 'TextInput').props.onChangeText('edited');
  let resolve; env.update(() => new Promise(done => { resolve = done; }));
  const save = button(edit.render(),'community.edit.save'); save.props.onPress(); save.props.onPress();
  assert.deepEqual(env.calls.filter(c => c[0] === 'patch'), [['patch',1,'edited',[10]]]);
  assert.equal(env.tryLeave(),true);
  const originalList = feed.list();
  resolve({ ...post, ...patch, likeCount:0, commentCount:0, liked:false }); await flush();
  assert.equal(env.back,1); assert.equal(env.tryLeave(),false);
  const list = feed.list(); assert.equal(list.key,originalList.key);
  assert.equal(list.props.data[0].content,'edited'); assert.deepEqual(list.props.data[0].images,patch.images);
  assert.equal(list.props.data[0].liked,true); assert.equal(list.props.data[0].likeCount,12); assert.equal(list.props.data[0].commentCount,4);
  assert.equal(list.props.data[1].content,'original','REVIEW with same ID untouched');
  assert.ok(nodes(detail.render()).some(n => n.props?.children === 'edited'));
  feed.state.focus(); assert.equal(env.calls.filter(c => c[0] === 'feed').length,1);
  list.props.onEndReached(); await flush(); assert.deepEqual(env.calls.at(-1),['feed','ALL','LATEST','cursor-1']);
  assert.equal(env.sync.communityFeedRevision(),0);
  [feed,detail,edit].forEach(s => s.state.cleanup());
});

test('edit removes retained image and adds converted image through existing pipeline; selection includes retained count', async () => {
  const env = setup(), edit = env.edit(); edit.render(); await flush();
  button(edit.render(),'community.attachImage').props.onPress(); await flush();
  assert.deepEqual(env.calls[0],['select',1]);
  button(edit.render(),'community.removeImage').props.onPress();
  const previews = nodes(edit.render()).filter(n => n.type === 'Image');
  assert.deepEqual(previews.map(n => n.props.source.uri),['file://new.webp']);
  button(edit.render(),'community.edit.save').props.onPress(); await flush();
  const request = env.calls.find(c => c[0] === 'images');
  assert.equal(request[1],1); assert.deepEqual(request[3],[]); assert.equal(request[4][0].mimeType,'image/webp');
  assert.equal(env.sync.communityFeedRevision(),0); edit.state.cleanup();
});

test('failed edit preserves form/images/detail/feed and permits retry; expired auth clears tokens and opens login', async () => {
  const env = setup(), feed = env.feed(), detail = env.detail(), edit = env.edit();
  feed.render(); detail.render(); edit.render(); await flush();
  nodes(edit.render()).find(n => n.type === 'TextInput').props.onChangeText('keep my edit');
  env.update(async () => { throw new Error('network'); });
  button(edit.render(),'community.edit.save').props.onPress(); await flush();
  assert.equal(nodes(edit.render()).find(n => n.type === 'TextInput').props.value,'keep my edit');
  assert.equal(nodes(edit.render()).filter(n => n.type === 'Image').length,1);
  assert.equal(button(edit.render(),'community.edit.save').props.disabled,false);
  assert.equal(feed.list().props.data[0].content,'original'); assert.equal(env.back,0);
  assert.ok(nodes(detail.render()).some(n => n.props?.children === 'original'));
  env.update(async () => { throw new env.ApiError(401); });
  button(edit.render(),'community.edit.save').props.onPress(); await flush();
  assert.equal(env.cleared,1); assert.deepEqual(env.routes.at(-1),{pathname:'/login',params:{intent:'resume',resumeKey:'write'}});
  [feed,detail,edit].forEach(s => s.state.cleanup());
});

test('delete calls once, removes only matching feed POST before back, preserves cursor and never refetches', async () => {
  const env = setup(), feed = env.feed(), detail = env.detail(); feed.render(); detail.render(); await flush();
  let resolve; env.remove(() => new Promise(done => { resolve = done; }));
  openSheet(detail)(2);
  const remove = env.alerts[0][2][1]; remove.onPress(); remove.onPress();
  assert.deepEqual(env.calls.filter(c => c[0] === 'delete'),[['delete',1]]);
  assert.equal(feed.list().props.data.length,2,'not removed while pending');
  const observations = []; env.sync.subscribeCommunityPostChanges(() => observations.push(env.back));
  resolve(); await flush();
  assert.deepEqual(observations,[0],'remove event precedes back'); assert.equal(env.back,1);
  assert.deepEqual(feed.list().props.data.map(i => i.type),['REVIEW']);
  feed.state.focus(); assert.equal(env.calls.filter(c => c[0] === 'feed').length,1);
  feed.list().props.onEndReached(); await flush(); assert.deepEqual(env.calls.at(-1),['feed','ALL','LATEST','cursor-1']);
  assert.equal(env.sync.communityFeedRevision(),0); feed.state.cleanup(); detail.state.cleanup();
});

test('failed delete keeps detail/feed, unlocks retry and handles expired auth', async () => {
  const env = setup(), feed = env.feed(), detail = env.detail(); feed.render(); detail.render(); await flush();
  env.remove(async () => { throw new Error('network'); });
  const press = () => { openSheet(detail)(2); env.alerts.at(-1)[2][1].onPress(); };
  press(); await flush(); assert.equal(env.back,0); assert.equal(feed.list().props.data.length,2);
  assert.ok(nodes(detail.render()).some(n => n.props?.children === 'original'));
  assert.equal(button(detail.render(),'community.postMenu').props.disabled,false);
  env.remove(async () => { throw new env.ApiError(401); }); press(); await flush();
  assert.equal(env.cleared,1); assert.equal(env.routes.at(-1),'/profile/login'); assert.equal(feed.list().props.data.length,2);
  feed.state.cleanup(); detail.state.cleanup();
});

test('in-flight feed replies cannot overwrite an edit or restore deleted POST; later server refresh remains authoritative', async () => {
  const sync = load('src/lib/communityFeedRefresh.ts');
  const version = sync.communityLikeVersion(); sync.publishCommunityPostChange(1,patch);
  assert.equal(sync.mergeCommunityPostChange(item,version).content,'edited');
  assert.equal(sync.mergeCommunityPostChange({ ...item, content:'server latest' },sync.communityLikeVersion()).content,'server latest');
  assert.equal(sync.mergeCommunityPostChange(item,version).content,'edited','later read cannot erase protection for an older in-flight read');
  sync.publishCommunityPostChange(1,null);
  assert.equal(sync.mergeCommunityPostChange(item,version),null);
  assert.equal(sync.mergeCommunityPostChange(item,sync.communityLikeVersion()),null);
  assert.equal(sync.communityFeedRevision(),0);
});

test('authenticated edit/PATCH/DELETE client uses bearer and retained IDs with no client owner/category/userId', async () => {
  const sync = load('src/lib/communityFeedRefresh.ts'); let token = 'saved'; const calls = [];
  const api = load('src/lib/community.ts', { './communityFeedRefresh':sync, './communityDiagnostics':diagnostics,
    '../constants/api':{ API_BASE_URL:'https://api.example' }, './auth':{ getAuthSession:async () => ({ accessToken:token, generation:0 }) } });
  const original = global.fetch;
  global.fetch = async (url,options) => { calls.push({url,options}); return { ok:true, json:async () => post }; };
  try {
    const signal = new AbortController().signal;
    await api.getCommunityPostForEdit(1,signal); await api.updateCommunityPost(1,'edited',[10],'upload'); await api.deleteCommunityPost(1);
    assert.deepEqual(calls.map(c => c.options.method),['GET','PATCH','DELETE']);
    assert.equal(calls[0].url,'https://api.example/api/community/posts/1/edit');
    assert.deepEqual(JSON.parse(calls[1].options.body),{content:'edited',retainedImageIds:[10],uploadToken:'upload'});
    assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer saved'));
    token = null; await assert.rejects(api.deleteCommunityPost(1),error => error.status === 401); assert.equal(calls.length,3);
  } finally { global.fetch = original; }
});

test('image edit shares binary WebP upload and retries identical signed batch after ambiguous failure', async () => {
  class ApiError extends Error { constructor(status) { super(); this.status=status; } }
  let presigns = 0, saves = 0, cancelled = 0; const updates = [];
  const helper = load('src/lib/communityImages.ts', { 'expo-image-picker':{}, 'expo-image-manipulator':{},
    './communityDiagnostics':diagnostics, './community':{ CommunityApiError:ApiError,
      communityRequest:async (_, method) => { if (method === 'DELETE') { cancelled++; return {}; }
        presigns++; return { text:async () => JSON.stringify({ uploadToken:'same-batch', images:[{imageKey:'key.webp', uploadUrl:'https://s3.example/put',sortOrder:0,contentType:'image/webp'}] }) }; },
      updateCommunityPost:async (...args) => { updates.push(args); if (++saves === 1) throw new ApiError(500); return {...post,...patch}; },
    } });
  const original = global.fetch; const uploads=[];
  global.fetch = async (url,options) => { if (options) { uploads.push(options); return {ok:true}; }
    return {ok:true,arrayBuffer:async () => new ArrayBuffer(3)}; };
  try {
    const attempt={current:null}, images=[{uri:'file://new.webp',width:100,height:100,mimeType:'image/webp'}];
    await assert.rejects(helper.updatePostWithImages(1,'immutable',[10],images,attempt));
    assert.deepEqual(attempt.current,{postId:1,content:'immutable',retainedImageIds:[10],uploadToken:'same-batch',authRequired:false,outcomeUnknown:true});
    await helper.updatePostWithImages(1,'changed elsewhere',[],images,attempt);
    assert.equal(presigns,1); assert.equal(uploads.length,1); assert.ok(uploads[0].body instanceof ArrayBuffer);
    assert.equal(uploads[0].headers['Content-Type'],'image/webp');
    assert.deepEqual(updates,[[1,'immutable',[10],'same-batch'],[1,'immutable',[10],'same-batch']]);
    assert.equal(cancelled,0); assert.equal(attempt.current,null);
  } finally { global.fetch=original; }
});
