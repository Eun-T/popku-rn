const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const files = ['src/app/reviews/write.tsx', 'src/app/reviews/[id].tsx',
  'src/components/reviews/ReviewActions.tsx', 'src/components/community/CommunityPostMenu.tsx',
  'src/components/community/CommunityImageCarousel.tsx', 'src/hooks/useTranslation.ts'];
// Legacy ref-heavy screens may bail out. Still execute the real plugin output;
// keep strict emitted-cache assertions for the hook/carousel and prior home tests.
const bailouts = new Map();
const transform = compilerTransform(files, { allowBailout: files.slice(0,4), onBailout: (file, events) => bailouts.set(file, events) });
const reusedKeys = ['place.explore.back','place.detail.reviews.write','place.detail.reviews.openFailed','place.detail.tryLater',
  'community.delete.message','community.cancel','community.delete.confirm','community.writeBack','community.reviewFilterLabel',
  'community.detail.retry','place.detail.reviews.likeFailed','community.edit.action','community.delete.action','community.detail.image',
  'place.detail.reviews.like','place.detail.reviews.unlike','community.imageError.permission','community.imageError.limit',
  'community.imageError.conversion','community.time.minutesAgo','community.time.hoursAgo','community.time.daysAgo'];
const child = (tree, name) => nodes(tree).find(n => n.type?.name === name);
const image = Object.freeze({ uri: 'file://new.webp', width: 100, height: 100, mimeType: 'image/webp' });
const review = Object.freeze({ id: 10, author: Object.freeze({ id: 1, nickname: '원문 닉네임' }),
  popup: Object.freeze({ title: '공식 팝업 원문', publicId: 'popup-original' }), rating: 4, content: '사용자 리뷰 원문',
  images: Object.freeze([{ id: 7, url: 'old1.webp' }, { id: 8, url: 'old2.webp' }]),
  createdAt: '2026-10-09T02:55:00Z', isOwner: true, liked: false, likeCount: 2 });

async function app({ editing = false, detailFailure = false, popupFailure = false } = {}) {
  const requests = [], routes = [], alerts = [], timings = [], selected = [], changes = [];
  let writeFailure = null, imageFailure = null, pendingWrite = false, deletion = async () => {}, removal;
  const authUser = { id: 1 };
  class ApiError extends Error { constructor(status) { super('server error 원문'); this.status = status; } }
  class ImageSelectionError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
  const write = async (...args) => {
    requests.push(['write', ...args]);
    if (pendingWrite) { args.at(-1).current = { authRequired: false }; throw new Error('unconfirmed server result'); }
    if (writeFailure) throw writeFailure; return review;
  };
  const animation = () => ({ start: cb => cb?.({ finished: true }), stop() {} });
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput', 'ScrollView', 'FlatList', 'Image',
    'Modal', 'ActivityIndicator', 'KeyboardAvoidingView'].map(n => [n, n]));
  Object.assign(native, { Platform: { OS: 'ios' }, StyleSheet: { create: s => s, absoluteFill: { position: 'absolute' } },
    Alert: { alert: (...args) => alerts.push(args) }, PanResponder: { create: config => ({ panHandlers: config }) },
    Animated: { Value: class { setValue() {} stopAnimation() {} }, View: 'AnimatedView',
      timing: (_value, config) => { timings.push(config); return animation(); }, spring: animation, parallel: animation } });
  const router = { push: route => routes.push(route), replace: route => routes.push(route), back: () => routes.push('back'), canGoBack: () => true };
  const ui = runtime({
    'react-native': native, 'lucide-react-native': Object.fromEntries(['ChevronLeft', 'ChevronRight', 'Heart', 'MoreHorizontal', 'Star', 'X', 'ImagePlus', 'Pencil', 'Trash2'].map(n => [n, n])),
    'expo-router': { useRouter: () => router, useNavigation: () => ({ dispatch: a => routes.push(a) }),
      useLocalSearchParams: () => editing ? { editId: '10', id: '10' } : { publicId: 'popup-original', id: '10' }, useFocusEffect() {} },
    'expo-router/react-navigation': { usePreventRemove: (enabled, fn) => { removal = { enabled, fn }; } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) },
    'src/hooks/useCommunityNow.ts': { useCommunityNow: () => ({ now: new Date('2026-10-09T03:00:00Z').getTime() }) },
    'src/lib/auth.ts': { clearTokens: async () => false, subscribeAuthSession: () => () => {}, getAuthUser: () => authUser,
      subscribeAuthUser: () => () => {}, authSessionGeneration: () => 1 },
    'src/lib/community.ts': { CommunityApiError: ApiError },
    'src/lib/communityFeedRefresh.ts': Object.fromEntries(['subscribeCommunityCommentCounts', 'subscribeCommunityLikes', 'subscribeCommunityPostChanges'].map(n => [n, () => () => {}])),
    'src/lib/communityLikes.ts': { changeCommunityLike: async (...args) => requests.push(['like', args[0]]) },
    'src/lib/communityImages.ts': { MAX_POST_IMAGES: 5, ImageSelectionError, selectPostImages: async () => {
      requests.push(['images']); if (imageFailure) throw imageFailure; return [image];
    } },
    'src/lib/popups.ts': { getPopupDetail: async id => { requests.push(['popup', id]); if (popupFailure) throw new Error('server failure'); return { name: review.popup.title }; } },
    'src/lib/reviews.ts': { MAX_REVIEW_CONTENT_BYTES: 65535, reviewContentBytes: s => Buffer.byteLength(s),
      getReviewDetail: async (...args) => { requests.push(['detail', ...args]); if (detailFailure) throw new ApiError(detailFailure); return review; },
      createReview: write, publishReviewWithImages: write, updateReview: write, updateReviewWithImages: write,
      reviewUpdated: r => changes.push(r), reviewsCreated: id => changes.push(id), deleteReview: async id => { requests.push(['delete', id]); await deletion(); },
      reviewDeleted: r => changes.push(r), applyReviewChange: (r, p) => ({ ...r, ...p }) },
  }, { transform });
  const { languageStore } = ui.load('src/locales/languageStore.ts');
  let tags = ['ja-JP'];
  await languageStore.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => tags });
  const locale = ui.load('src/locales/index.ts');
  return { ...ui, requests, routes, alerts, timings, selected, changes, review, ApiError, ImageSelectionError,
    t: (key, params) => locale.translate(languageStore.getSnapshot().resolvedLanguage, key, params),
    async language(value) { await languageStore.setLanguagePreference(value); await flush(); },
    async systemLanguage(value) { tags = [value]; languageStore.refreshSystemLanguage(); await flush(); },
    async settle() { await flush(); await flush(); },
    writeFailure(value) { writeFailure = value; }, imageFailure(value) { imageFailure = value; },
    pendingWrite(value) { pendingWrite = value; },
    deletion(fn) { deletion = fn; },
    removal: () => removal,
  };
}
const button = (s, root, key, params) => nodes(root.tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === s.t(key, params));
const input = root => nodes(root.tree).find(n => n.type === 'TextInput');
const photos = root => nodes(root.tree).filter(n => n.type === 'Image').map(n => n.props.source.uri);

test('review resources: both languages and interpolation match; no empty Japanese review keys', () => {
  const ko = JSON.parse(fs.readFileSync('src/locales/ko.json', 'utf8')), ja = JSON.parse(fs.readFileSync('src/locales/ja.json', 'utf8'));
  const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k,v]) => typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`,v]]);
  const k = new Map(flatten(ko)), j = new Map(flatten(ja));
  assert.deepEqual([...k.keys()].filter(k => k.startsWith('review.')), [...j.keys()].filter(k => k.startsWith('review.')));
  for (const [key,value] of k) if (key.startsWith('review.') || reusedKeys.includes(key)) {
    assert.ok(j.get(key).trim(),key);
    assert.deepEqual(value.match(/\{\w+\}/g) ?? [],j.get(key).match(/\{\w+\}/g) ?? [],key);
  }
});

for (const editing of [false, true]) test(`Compiler-processed ${editing ? 'edit' : 'write'} form translates immediately without resetting draft/rating/images/mode or requesting data`, async () => {
  const s = await app({ editing }), Screen = s.load(files[0]).default, root = s.mount(() => Screen()); await s.settle();
  assert.ok(texts(root.tree).includes(s.t(editing ? 'review.write.editTitle' : 'place.detail.reviews.write')));
  input(root).props.onChangeText('작성 중인 사용자 원문');
  button(s, root, 'review.write.rating', { value: 5 }).props.onPress();
  if (editing) button(s, root, 'review.write.removePhoto', { index: 1 }).props.onPress();
  button(s, root, 'review.write.addPhoto').props.onPress(); await s.settle();
  const requests = s.requests.slice(), imageOrder = photos(root), style = input(root).props.style, inputKey = input(root).key;
  for (const language of ['ja', 'ko', 'system']) {
    await s.language(language);
    assert.ok(texts(root.tree).includes(s.t('review.write.ratingPrompt')));
    assert.ok(texts(root.tree).includes(s.t('review.write.contentPrompt')));
    assert.equal(input(root).props.placeholder,s.t('review.write.placeholder'));
    assert.equal(input(root).props.value,'작성 중인 사용자 원문');
    assert.equal(button(s, root, 'review.write.rating', { value: 5 }).props.accessibilityState.selected,true);
    assert.deepEqual(photos(root),imageOrder);assert.equal(input(root).props.style,style);assert.equal(input(root).key,inputKey);
    assert.ok(texts(root.tree).includes(review.popup.title));assert.deepEqual(s.requests,requests);assert.ok(s.removal().enabled);
  }
  await s.systemLanguage('ko-KR');assert.equal(input(root).props.placeholder,s.t('review.write.placeholder'));
  await s.systemLanguage('ja-JP');assert.equal(input(root).props.placeholder,s.t('review.write.placeholder'));
  s.removal().fn({ data: { action: { type: 'GO_BACK' } } });
  assert.equal(s.alerts.at(-1)[0],s.t('review.write.leaveTitle'));
  s.alerts.at(-1)[2][0].onPress();assert.equal(input(root).props.value,'작성 중인 사용자 원문');
  button(s, root, editing ? 'review.write.save' : 'review.write.register').props.onPress();await s.settle();
  const args = s.requests.find(r => r[0] === 'write').slice(1);
  if (editing) { assert.deepEqual(args.slice(0,5),[10,'popup-original',5,'작성 중인 사용자 원문',[8]]);assert.equal(args[5][0].uri,image.uri); }
  else { assert.deepEqual(args.slice(0,3),['popup-original',5,'작성 중인 사용자 원문']);assert.equal(args[3][0].uri,image.uri); }
  assert.deepEqual(s.routes,['back']);assert.equal(s.changes.length,1);s.dispose();
});

test('Compiler-processed form keeps visible submit/image/byte validation errors reactive and draft intact', async () => {
  const s = await app(), Screen = s.load(files[0]).default, root = s.mount(() => Screen());await s.settle();
  button(s, root, 'review.write.rating', { value: 4 }).props.onPress();input(root).props.onChangeText('原文 draft');
  s.writeFailure(new s.ApiError(409));button(s, root, 'review.write.register').props.onPress();await s.settle();
  for (const language of ['ja','ko']) { await s.language(language);assert.ok(texts(root.tree).includes(s.t('review.write.duplicate')));assert.equal(input(root).props.value,'原文 draft'); }
  s.writeFailure(new Error('server free text'));button(s, root, 'review.write.register').props.onPress();await s.settle();
  await s.language('ja');assert.ok(texts(root.tree).includes(s.t('review.write.createFailed')));assert.ok(!texts(root.tree).includes('server free text'));
  s.imageFailure(new s.ImageSelectionError('permission'));button(s, root, 'review.write.addPhoto').props.onPress();await s.settle();
  for (const language of ['ko','ja']) { await s.language(language);assert.ok(texts(root.tree).includes(s.t('community.imageError.permission'))); }
  input(root).props.onChangeText('가'.repeat(22000));
  for (const language of ['ko','ja']) { await s.language(language);assert.ok(texts(root.tree).includes(s.t('review.write.contentTooLong')));assert.equal(button(s, root, 'review.write.register').props.disabled,true); }
  assert.equal(s.requests.filter(r => r[0] === 'popup').length,1);s.dispose();
});

test('Compiler-processed detail keeps raw content/menu/ID and translates header/time/like/delete without refetch', async () => {
  const s = await app(), Screen = s.load(files[1]).default, root = s.mount(() => Screen());await s.settle();
  button(s,root,'review.menu').props.onPress();const requests = s.requests.slice(), carouselKey = child(root.tree,'CommunityImageCarousel').key;
  for (const language of ['ja','ko','system']) {
    await s.language(language);assert.ok(texts(root.tree).includes(s.t('community.reviewFilterLabel')));
    assert.ok(texts(root.tree).includes(s.t('community.time.minutesAgo',{count:5})));
    assert.ok(button(s,root,'place.detail.reviews.like'));assert.ok(child(root.tree,'CommunityPostMenu'));
    for (const raw of [review.content,review.author.nickname,review.popup.title]) assert.ok(texts(root.tree).includes(raw));
    assert.equal(child(root.tree,'CommunityImageCarousel').key,carouselKey);assert.deepEqual(s.requests,requests);
  }
  child(root.tree,'CommunityPostMenu').props.onSelect(2);assert.equal(s.alerts.at(-1)[0],s.t('review.deleteTitle'));
  assert.equal(s.alerts.at(-1)[2][0].text,s.t('community.cancel'));s.alerts.at(-1)[2][0].onPress();
  button(s,root,'review.menu').props.onPress();child(root.tree,'CommunityPostMenu').props.onSelect(1);
  assert.deepEqual(s.routes,[{pathname:'/reviews/write',params:{editId:'10'}}]);s.dispose();
});

for (const status of [404,500]) test(`Compiler-processed detail ${status} error translates without retrying on language`, async () => {
  const s = await app({detailFailure:status}), Screen=s.load(files[1]).default, root=s.mount(()=>Screen());await s.settle();
  for(const language of ['ja','ko']) {await s.language(language);assert.ok(texts(root.tree).includes(s.t(status===404?'review.missing':'review.loadFailed')));}
  assert.equal(s.requests.length,1);s.dispose();
});

test('Compiler-processed owner action preserves open menu and delete identity/confirmation under language switch', async () => {
  const s=await app(), Actions=s.load(files[2]).default, props={review}, root=s.mount(()=>Actions(props));
  button(s,root,'review.menu').props.onPress({stopPropagation(){}});
  for(const language of ['ja','ko','system']) {await s.language(language);assert.equal(button(s,root,'review.menu').props.accessibilityState.expanded,true);assert.ok(child(root.tree,'CommunityPostMenu'));}
  child(root.tree,'CommunityPostMenu').props.onSelect(2);assert.equal(s.alerts.at(-1)[0],s.t('review.deleteTitle'));
  s.alerts.at(-1)[2][1].onPress();await s.settle();assert.deepEqual(s.requests,[['delete',10]]);assert.equal(s.changes[0],review);s.dispose();
});

test('Compiler-processed native menu translates while modal/animation/gesture and delayed iOS selection stay stable', async () => {
  const s=await app(), Menu=s.load(files[3]).default,onSelect=i=>s.selected.push(i), props={onSelect,edgeToEdge:true},root=s.mount(()=>Menu(props));
  root.tree.props.onShow();const animations=s.timings.slice(),pan=nodes(root.tree).find(n=>n.props?.onPanResponderRelease).props.onPanResponderRelease;
  for(const language of ['ja','ko','system']) {await s.language(language);assert.equal(root.tree.props.visible,true);assert.ok(texts(root.tree).includes(s.t('community.edit.action')));assert.ok(texts(root.tree).includes(s.t('community.delete.action')));assert.deepEqual(s.timings,animations);assert.equal(nodes(root.tree).find(n=>n.props?.onPanResponderRelease).props.onPanResponderRelease,pan);}
  nodes(root.tree).find(n=>n.type==='Pressable' && texts(n).includes(s.t('community.delete.action'))).props.onPress();
  assert.equal(root.tree.props.visible,false);assert.deepEqual(s.selected,[]);root.tree.props.onDismiss();root.tree.props.onDismiss();assert.deepEqual(s.selected,[2]);
  assert.deepEqual(s.timings.map(c=>c.duration),[200,200,160,160]);assert.ok(s.timings.every(c=>c.useNativeDriver));s.dispose();
});

test('compiled image carousel invalidates native list labels while images/page/key stay unchanged', async () => {
  const s=await app(), Carousel=s.load(files[4]).default,images=['raw1.webp','raw2.webp'],props={images},root=s.mount(()=>Carousel(props));
  nodes(root.tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:350}}});
  const list=()=>nodes(root.tree).find(n=>n.type==='FlatList'),key=list().key;
  list().props.onScroll({nativeEvent:{contentOffset:{x:350}}});
  for(const language of ['ja','ko','system']) {await s.language(language);assert.equal(list().key,key);assert.equal(list().props.data,images);
    assert.equal(list().props.extraData,language==='ko'?'ko':'ja');
    const rendered=list().props.renderItem({item:images[1],index:1});assert.equal(rendered.props.accessibilityLabel,s.t('community.detail.image',{index:2}));assert.equal(rendered.props.source.uri,images[1]);
    assert.deepEqual(nodes(root.tree).filter(n=>n.props?.accessibilityState).map(n=>n.props.accessibilityState.selected),[false,true]);}
  assert.deepEqual(s.requests,[]);s.dispose();
});

for (const editing of [false,true]) test(`Compiler-processed ${editing?'edit':'write'} load/pending errors update without restarting reads or losing draft`,async()=>{
  const failed=await app({editing,detailFailure:editing?500:false,popupFailure:!editing}),Screen=failed.load(files[0]).default,root=failed.mount(()=>Screen());await failed.settle();
  const reads=failed.requests.slice();
  for(const language of ['ja','ko']) {await failed.language(language);assert.ok(texts(root.tree).includes(failed.t(editing?'review.write.reviewLoadFailed':'review.write.popupLoadFailed')));assert.deepEqual(failed.requests,reads);}
  failed.dispose();
  const s=await app({editing}),Form=s.load(files[0]).default,form=s.mount(()=>Form());await s.settle();
  input(form).props.onChangeText('保留した原文');button(s,form,'review.write.rating',{value:3}).props.onPress();
  button(s,form,'review.write.addPhoto').props.onPress();await s.settle();s.pendingWrite(true);
  button(s,form,editing?'review.write.save':'review.write.register').props.onPress();await s.settle();const requests=s.requests.slice(),images=photos(form);
  for(const language of ['ja','ko','system']) {await s.language(language);
    assert.ok(texts(form.tree).includes(s.t(editing?'review.write.editPending':'review.write.createPending')));
    assert.ok(texts(form.tree).includes(s.t(editing?'review.write.editFailed':'review.write.createFailed')));
    assert.equal(input(form).props.value,'保留した原文');assert.deepEqual(photos(form),images);
    assert.equal(button(s,form,'review.write.rating',{value:3}).props.accessibilityState.selected,true);
    assert.equal(button(s,form,'place.explore.back').props.disabled,true);assert.deepEqual(s.requests,requests);}
  s.dispose();
});

test('real Compiler emits hook/carousel caches and explicitly bails out only on existing finally/ref constraints',()=>{
  for(const file of files.slice(0,4)) {
    const events=bailouts.get(file);assert.ok(events?.length,file);
    const errors=events.filter(e=>e.kind==='CompileError');
    assert.ok(errors.length,file);
    for(const error of errors) assert.match(error.detail.reason,file.endsWith('CommunityPostMenu.tsx')?/Cannot access refs during render/:/TryStatement with a finalizer/,file);
  }
  assert.ok(!bailouts.has(files[4]));assert.ok(!bailouts.has(files[5]));
});

for(const target of ['detail','actions']) test(`Compiler-processed ${target} pending deletion failure uses the language at completion`,async()=>{
  const s=await app();let reject;s.deletion(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  const Screen=s.load(target==='detail'?files[1]:files[2]).default,props={review},root=s.mount(()=>target==='detail'?Screen():Screen(props));await s.settle();
  button(s,root,'review.menu').props.onPress({stopPropagation(){}});child(root.tree,'CommunityPostMenu').props.onSelect(2);
  s.alerts.at(-1)[2][1].onPress();await s.language('ja');reject(new Error('server free text'));await s.settle();
  assert.equal(s.alerts.at(-1)[0],s.t('review.deleteFailed'));assert.equal(s.alerts.at(-1)[1],s.t('place.detail.tryLater'));
  assert.deepEqual(s.requests.filter(r=>r[0]==='delete'),[['delete',10]]);s.dispose();
});
