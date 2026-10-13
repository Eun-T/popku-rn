const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const popup = (id='a', country='KR', language='ko') => ({ publicId:id, name:`${country}:${language}:${id}`, countryCode:country,
  regionId:1, regionName:'성수', latitude:37, longitude:127, startDate:'2026-10-05', endDate:'2026-10-11', tags:[],
  coverImageUrl:`https://images.test/${country}/${language}/${id}/old`, coverImageCacheKey:`object-${country}-${id}` });
const child = (tree,name) => nodes(tree).find(n => n.type===name || n.type?.name===name);

async function app({ compiled=false, slowLists=false, withScreen=false }={}) {
  let now=1_800_000_000_000, country, systemTag='ja-JP';
  const lists=[], details=[], opened=[], toggled=[], bailouts=[];
  const weeklyFile='src/components/place/PlaceWeeklySection.tsx', carouselFile='src/components/place/TodayOpeningCarousel.tsx';
  const compile=compilerTransform(['src/components/place/PlaceWeeklyPopupList.tsx',carouselFile,
    'src/components/place/ExplorePopupPoster.tsx','src/hooks/useTranslation.ts'], { allowBailout:[], onBailout:f=>bailouts.push(f) });
  const ui=runtime({
    'test-clock':{ now:()=>now },
    'react-native':{ ...Object.fromEntries(['View','Text','Pressable','TextInput','FlatList','Image'].map(n=>[n,n])),
      StyleSheet:{ create:s=>s, absoluteFill:{position:'absolute',left:0,right:0,top:0,bottom:0} },
      useWindowDimensions:()=>({width:390}), Animated:{ Value:class{setValue(){}},View:'AnimatedView',timing:()=>({start:cb=>cb?.({finished:true})}) },
      PanResponder:{create:()=>({panHandlers:{}})} },
    'expo-image':{ Image:'ExpoImage' }, 'expo-blur':{ BlurTargetView:'BlurTargetView',BlurView:'BlurView' },
    'react-native-svg':{ __esModule:true,default:'Svg',Defs:'Defs',LinearGradient:'LinearGradient',Rect:'Rect',Stop:'Stop' },
    'lucide-react-native':Object.fromEntries(['Heart','Bell','Search','X','ChevronLeft','ChevronRight'].map(n=>[n,n])),
    '@expo/vector-icons':{Ionicons:'Ionicons'},
    'expo-router':{useLocalSearchParams:()=>({}),useScrollToTop(){},useFocusEffect(){}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})},
    'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
    'src/hooks/usePopupNavigation.ts':{usePopupNavigation:()=>id=>opened.push(id)},
    'src/hooks/usePopupFavorites.ts':{usePopupFavorites:()=>({isFavorite:()=>false,isFavoriteDisabled:()=>false,toggleFavorite(){}})},
    'src/lib/filterOptions.ts':{getRegions:async()=>[],getTags:async()=>[]},
    ...Object.fromEntries(['AppliedFilterBar','PlaceFilterSheet','PopupGridCard','PopupGridSkeleton','QuickFilterBar',
      'PlaceRegionSection','PlaceInterestSection','PlaceWeeklySection','TodayOpeningCarousel'].map(n=>[
      `src/components/place/${n}.tsx`,{__esModule:true,default:n}]).filter(([f])=>f!==weeklyFile && f!==carouselFile)),
    'src/lib/popups.ts':{
      emptyPopupFilters:()=>({regionIds:[],tagIds:[]}),getPopupPage:async()=>({popups:[],nextCursor:null}),
      getWeeklyPopups:(c,start,end,signal,l)=>list('week',c,signal,l,start),
      getEndingSoonPopups:(c,signal,l)=>list('ending',c,signal,l),
      getPopupDetail:(id,signal,token,language)=>{const wait=deferred();details.push({id,signal,token,language,...wait});return wait.promise;},
    },
  },{transform:(file,source)=>{source=source.replaceAll('Date.now()',"require('test-clock').now()");return compiled?compile(file,source):source;}});
  function list(kind,c,signal,l,start) {
    const wait=deferred();lists.push({kind,c,signal,l,start,...wait});
    if(!slowLists)wait.resolve([popup('a',c??'KR',l),popup('b',c??'KR',l)]);
    return wait.promise;
  }
  const store=ui.load('src/locales/languageStore.ts').languageStore;
  await store.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>[systemTag]});
  const Section=ui.load(weeklyFile).default, Weekly=ui.load('src/components/place/PlaceWeeklyPopupList.tsx').default;
  const props=()=>({country,isActive:true,onPressPopup:p=>opened.push(p.publicId),isFavorite:()=>false,
    isFavoriteDisabled:()=>false,onToggleFavorite:p=>toggled.push(p.publicId)});
  let sectionActive=true;
  const section=ui.mount(()=>Section({...props(),isActive:sectionActive}));
  const Screen=withScreen?ui.load('src/screens/PlaceScreen.tsx').default:null;
  const screen=Screen?ui.mount(()=>Screen()):null;
  const weekList=()=>child(section.tree,'FlatList');
  const weeklyProps=()=>weekList()?.props.renderItem({item:weekList().props.data[0]})?.props.children.props;
  const settle=async()=>{await flush();await flush();ui.renderAll();await flush();ui.renderAll();};
  await settle();
  for(const n of nodes(section.tree).filter(n=>n.props?.onLayout))n.props.onLayout({nativeEvent:{layout:{width:300,height:280}}});
  await settle();
  // Native FlatList mounts children separately; keep that boundary in the fixture too.
  const weekly=ui.mount(()=>Weekly(weeklyProps()??{...props(),popups:[]}));
  function poster(kind='week',index=0) {
    let root, alive=true, carousel, override;
    if(kind==='week')root=weekly;
    else {
      const Carousel=ui.load(carouselFile).default;
      carousel=ui.mount(()=>Carousel(screen?child(screen.tree,'TodayOpeningCarousel').props:{
        items:[popup('a',country??'KR',store.getSnapshot().resolvedLanguage)],width:343,today:'2026-10-09',loading:false,error:false,
        onPressPopup:p=>opened.push(p.publicId),onRecoverCover:weeklyProps()?.onRecoverCover,coverScope:weeklyProps()?.coverScope}));
      root={get tree(){const list=child(carousel.tree,'FlatList');return list?.props.renderItem({item:list.props.data[index]});}};
    }
    const imageNode=()=>nodes(root.tree).filter(n=>n.type?.name==='ExplorePopupPoster')[index]??child(root.tree,'ExpoImage')??child(root.tree,'Image');
    const first=imageNode();
    const imageRoot=typeof first?.type==='function'?ui.mount(()=>alive&&imageNode()?imageNode().type(override??imageNode().props):null):null;
    const image=()=>imageRoot?child(imageRoot.tree,'ExpoImage'):imageNode();
    return {root,imageRoot,carousel,image,props:()=>imageNode()?.props,
      retry:()=>nodes(imageRoot?.tree).find(n=>n.props?.testID==='explore-cover-retry'),
      replace(p){override={...imageNode().props,popup:p};imageRoot.render();},
      background(){const n=child(imageRoot.tree,'PosterBackground');const r=ui.mount(()=>n.type(child(imageRoot.tree,'PosterBackground').props));
        return {root:r,image:()=>child(r.tree,'ExpoImage')};},
      unmount(){alive=false;imageRoot?.slots.forEach(s=>s?.cleanup?.());}};
  }
  return {...ui,section,screen,weekly,weekList,weeklyProps,poster,lists,details,opened,toggled,bailouts,store,settle,
    advance(ms){now+=ms;},now:()=>now,
    async country(c){country=c;if(screen){child(screen.tree,'PlaceFilterSheet').props.onToggleCountry(c);
      ui.renderAll();child(screen.tree,'PlaceFilterSheet').props.onApply();}ui.renderAll();await settle();},
    async language(l){await store.setLanguagePreference(l);await settle();},
    async system(tag){systemTag=tag;store.refreshSystemLanguage();await settle();},
    async active(value){sectionActive=value;ui.renderAll();await settle();},
    async week(direction){nodes(section.tree).find(n=>n.type==='Pressable'&&n.key===direction).props.onPress();await settle();},
  };
}

for(const kind of ['week','ending']) test(`${kind}: native image errors recover only the failed poster with a stable key`,async()=>{
  const s=await app({withScreen:kind==='ending'}),c=s.poster(kind),initialLists=s.lists.length;
  try {
    c.image().props.onLoad?.();assert.equal(s.details.length,0);
    assert.equal(typeof c.image().props.onError,'function','poster has no recovery error handler');
    s.advance(300_001);c.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    s.details[0].resolve({...popup(),name:'must not replace text',coverImageUrl:'https://images.test/renewed'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/renewed');
    assert.equal(c.image().props.source.cacheKey,'object-KR-a');assert.equal(c.image().props.cachePolicy,'memory-disk');
    assert.equal(s.lists.length,initialLists,'cover recovery must not fetch either list');
    assert.equal(s.weekList().props.data[0][1].coverImageUrl,popup('b').coverImageUrl);
    assert.equal(s.weekList().props.data[0][0].name,popup().name);
  } finally{s.dispose();}
});

for(const kind of ['week','ending']) test(`${kind}: fresh network failure, failed recovery and same-screen manual retry after 30 seconds`,async()=>{
  const s=await app({withScreen:kind==='ending'}),c=s.poster(kind);
  try {
    c.image().props.onError();await s.settle();assert.equal(s.details.length,1,'fresh URL native errors must recover too');
    s.details[0].reject(new Error('offline'));await s.settle();
    assert.match(c.image().props.source,/ranking-placeholder/);assert.ok(c.retry());
    let stopped=false;c.retry().props.onPress({stopPropagation(){stopped=true;}});await s.settle();
    assert.ok(stopped);assert.deepEqual(s.opened,[]);assert.equal(s.details.length,1);
    s.advance(29_999);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,1);
    s.advance(1);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,2);
    s.details[1].resolve({...popup(),coverImageUrl:'https://images.test/online'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/online');assert.equal(c.retry(),undefined);
  }finally{s.dispose();}
});

test('weekly and carousel background/foreground errors share one promise and fresh replacement errors terminate',async()=>{
  const s=await app({withScreen:true}),a=s.poster(),b=s.poster('ending'),bg=b.background();
  try {
    a.image().props.onError();b.image().props.onError();bg.image().props.onError();await s.settle();
    assert.equal(s.details.length,1);assert.equal(s.details[0].language,'ko');
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/shared'});await s.settle();
    for(const c of [a,b,bg])assert.equal(c.image().props.source.uri,'https://images.test/shared');
    assert.equal(bg.image().props.cachePolicy,'memory-disk');assert.equal(bg.image().props.contentFit,'cover');
    assert.equal(b.image().props.contentFit,'contain');
    a.image().props.onError();b.image().props.onError();bg.image().props.onError();await s.settle();
    assert.equal(s.details.length,1);assert.match(a.image().props.source,/placeholder/);
    s.advance(300_001);a.unmount();const remounted=s.poster();
    remounted.image().props.onError();await s.settle();assert.equal(s.details.length,2);
    s.details[1].resolve({...popup(),coverImageUrl:'https://images.test/second-generation'});await s.settle();
    assert.equal(remounted.image().props.source.uri,'https://images.test/second-generation');
    remounted.image().props.onError();await s.settle();assert.equal(s.details.length,2);
  }finally{s.dispose();}
});

test('rapid remounts share in-flight work, honor failure cooldown and retry on re-entry without updating unmounted cards',async()=>{
  const s=await app(),a=s.poster();
  try {
    a.image().props.onError();await s.settle();a.unmount();
    const before=a.imageRoot.slots.map(v=>v.value);
    for(let i=0;i<5;i++){const c=s.poster();c.image().props.onError();await s.settle();c.unmount();}
    assert.equal(s.details.length,1);
    s.details[0].reject(new Error('offline'));await s.settle();
    assert.deepEqual(a.imageRoot.slots.map(v=>v.value),before);
    const during=s.poster();during.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    during.unmount();s.advance(30_000);const retry=s.poster();retry.image().props.onError();await s.settle();
    assert.equal(s.details.length,2);s.details[1].resolve({...popup(),coverImageUrl:'https://images.test/re-entry'});await s.settle();
    assert.equal(retry.image().props.source.uri,'https://images.test/re-entry');
  }finally{s.dispose();}
});

for(const change of ['country','language','week']) test(`${change} change ignores an old recovery result`,async()=>{
  const s=await app(),c=s.poster();
  try {
    c.image().props.onError();await s.settle();
    if(change==='country')await s.country('JP');
    if(change==='language')await s.language('ja');
    if(change==='week')await s.week(1);
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/obsolete'});await s.settle();
    assert.notEqual(c.image().props.source.uri,'https://images.test/obsolete');
    assert.notEqual(s.weekList().props.data[0][0].coverImageUrl,'https://images.test/obsolete');
  }finally{s.dispose();}
});

test('changed image object and missing image never inherit another object recovery or expose retry',async()=>{
  const s=await app(),c=s.poster();
  try {
    c.image().props.onError();await s.settle();
    c.replace({...popup(),publicId:'other-popup',coverImageCacheKey:'other-object',coverImageUrl:'https://images.test/other'});
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/old-object'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/other');
    c.replace({...popup(),coverImageUrl:null});
    assert.match(c.image().props.source,/placeholder/);
    c.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    assert.equal(c.retry(),undefined);
  }finally{s.dispose();}
});
const uiPoster=s=>s.load('src/components/place/ExplorePopupPoster.tsx').default;

test('an older list GET preserves recovered cover fields; a different server image key remains authoritative',async()=>{
  const s=await app({slowLists:true});
  try {
    s.lists[0].resolve([popup(),popup('b')]);await s.settle();
    for(const n of nodes(s.section.tree).filter(n=>n.props?.onLayout))n.props.onLayout({nativeEvent:{layout:{width:300,height:280}}});await s.settle();
    const recover=s.weeklyProps().onRecoverCover,original=s.weekList().props.data[0][0];
    const pending=recover(original);await s.settle();
    s.advance(240_001);await s.active(false);await s.active(true);assert.equal(s.lists.length,2);
    // This GET began after recovery started, but before the recovery URL was issued.
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/newest'});await pending;await s.settle();
    s.lists[1].resolve([popup(),popup('b')]);await s.settle();
    assert.equal(s.weekList().props.data[0][0].coverImageUrl,'https://images.test/newest');
    s.advance(240_001);await s.active(false);await s.active(true);
    s.lists[2].resolve([{...popup(),coverImageCacheKey:'replacement-object',coverImageUrl:'https://images.test/replacement'}]);await s.settle();
    assert.equal(s.weekList().props.data[0][0].coverImageUrl,'https://images.test/replacement');
  }finally{s.dispose();}
});

test('compiled carousel UI/retry labels follow ko-ja-ko/system with fixed poster props and no extra recovery requests',async()=>{
  const s=await app({compiled:true}),c=s.poster(),carousel=s.poster('ending');
  try {
    c.image().props.onError();await s.settle();s.details[0].reject(new Error('offline'));await s.settle();
    const Poster=uiPoster(s),fixed=c.props(),fixedPoster=s.mount(()=>Poster(fixed));
    // Freeze parent inputs. Subscription alone must update the child retry text.
    child(fixedPoster.tree,'ExpoImage').props.onError();await s.settle();
    const calls=s.details.length;
    for(const language of ['ja','ko']){
      await s.store.setLanguagePreference(language);
      assert.ok(texts(fixedPoster.tree).includes(language==='ja'?'再試行':'다시 시도'));
      assert.ok(texts(carousel.carousel.tree).includes(s.load('src/locales/index.ts').translate(language,'place.explore.endingSoonTitle')));
    }
    await s.store.setLanguagePreference('system');assert.ok(texts(fixedPoster.tree).includes('再試行'));
    await s.system('ko-KR');assert.ok(texts(fixedPoster.tree).includes('다시 시도'));
    assert.equal(s.details.length,calls);assert.deepEqual(s.bailouts,[]);
  }finally{s.dispose();}
});

for(const kind of ['week','ending']) test(`${kind}: a mounted recovered poster can expire again; its immediately broken replacement cannot loop`,async()=>{
  const s=await app({withScreen:kind==='ending'}),c=s.poster(kind);
  try {
    c.image().props.onError();await s.settle();s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/generation-1'});await s.settle();
    c.image().props.onLoad();s.advance(300_001);c.image().props.onError();await s.settle();assert.equal(s.details.length,2);
    s.details[1].resolve({...popup(),coverImageUrl:'https://images.test/generation-2'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/generation-2');
    c.image().props.onError();await s.settle();assert.equal(s.details.length,2);assert.match(c.image().props.source,/placeholder/);
    s.advance(30_000);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,3);
    s.details[2].resolve({...popup(),coverImageUrl:'https://images.test/manual'});await s.settle();assert.equal(c.image().props.source.uri,'https://images.test/manual');
  }finally{s.dispose();}
});

test('a new list timestamp or remount cannot bypass the guard for the freshly recovered URL',async()=>{
  const s=await app(),c=s.poster();
  try {
    c.image().props.onError();await s.settle();s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/fresh'});await s.settle();
    c.unmount();s.advance(30_001);
    const manager=s.load('src/lib/exploreCoverRecovery.ts');
    assert.equal(await manager.recoverExploreCover({...popup(),coverImageUrl:'https://images.test/fresh',coverImageFetchedAt:s.now()},undefined,'ko'),null);
    assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

test('healthy sibling retains its displayed poster and uses the known replacement after an error without a second GET',async()=>{
  const s=await app(),healthy=s.poster(),failed=s.poster();
  try {
    healthy.image().props.onLoad();const before=healthy.image().props.source,oldKey=healthy.image().key;
    failed.image().props.onError();await s.settle();s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/shared-renewal'});await s.settle();
    assert.deepEqual(healthy.image().props.source,before);assert.equal(healthy.image().key,oldKey);
    healthy.image().props.onError();await s.settle();assert.equal(healthy.image().props.source.uri,'https://images.test/shared-renewal');assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

for(const change of ['country','language']) test(`ending ${change} change ignores an old result without crossing scopes`,async()=>{
  const s=await app({withScreen:true}),c=s.poster('ending');
  try {
    c.image().props.onError();await s.settle();
    if(change==='country')await s.country('JP');else await s.language('ja');
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/retired'});await s.settle();
    assert.notEqual(c.image().props.source.uri,'https://images.test/retired');
    assert.notEqual(child(s.screen.tree,'TodayOpeningCarousel').props.items[0].coverImageUrl,'https://images.test/retired');
  }finally{s.dispose();}
});

test('missing/failed posters preserve geometry, weekly favorite/detail actions and carousel swipe/detail actions',async()=>{
  const s=await app({withScreen:true}),w=s.poster(),c=s.poster('ending');
  try {
    const wrapper=()=>child(w.imageRoot.tree,'View').props.style;
    const before=wrapper();assert.equal(before[0].width,90);assert.equal(before[0].height,90);
    w.image().props.onLoad();
    w.replace({...popup(),coverImageUrl:null});assert.match(w.image().props.source,/placeholder/);assert.deepEqual(wrapper(),before);
    const row=nodes(s.weekly.tree).find(n=>n.type==='Pressable');row.props.onPress();
    const favorite=nodes(s.weekly.tree).find(n=>n.props?.accessibilityState?.selected===false);
    let stopped=false;favorite.props.onPress({stopPropagation(){stopped=true;}});assert.ok(stopped);assert.deepEqual(s.toggled,['a']);
    const list=child(c.carousel.tree,'FlatList');assert.equal(list.props.snapToInterval,358);assert.equal(list.props.horizontal,true);
    list.props.renderItem({item:list.props.data[0]}).props.onPress();assert.deepEqual(s.opened,['a','a']);
    list.props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:358}}});await s.settle();
    assert.ok(nodes(c.carousel.tree).some(n=>n.props?.accessibilityLabel===s.load('src/locales/index.ts').translate('ko','place.explore.previous')));
    c.image().props.onError();await s.settle();s.details[0].resolve({...popup(),coverImageUrl:null});await s.settle();
    assert.match(c.image().props.source,/placeholder/);assert.equal(c.retry(),undefined);
    const posterStyle=child(c.imageRoot.tree,'View').props.style[0];assert.equal(posterStyle[0].height,210);assert.equal(posterStyle[1].width,210);
    assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

test('late ending-soon GET cannot overwrite a recovery while language round-trip retains the current list',async()=>{
  const s=await app({slowLists:true,withScreen:true});
  try {
    for(const request of s.lists)request.resolve([popup(),popup('b')]);await s.settle();
    const c=s.poster('ending');s.advance(1);
    await s.language('ja');await s.language('ko');
    const pending=s.lists.filter(r=>r.kind==='ending'&&r.l==='ko').at(-1);
    c.image().props.onError();await s.settle();s.advance(1);
    s.details[0].resolve({...popup(),name:'do not merge detail text',coverImageUrl:'https://images.test/ending-newest'});await s.settle();
    pending.resolve([popup(),popup('b')]);await s.settle();
    const items=child(s.screen.tree,'TodayOpeningCarousel').props.items;
    assert.equal(items[0].coverImageUrl,'https://images.test/ending-newest');assert.equal(c.image().props.source.uri,'https://images.test/ending-newest');
    assert.equal(items[0].name,popup().name);assert.deepEqual(items.map(p=>p.publicId),['a','b']);
    assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

test('weekly recovery preserves cached week, original four-minute TTL and selection/page data across re-entry',async()=>{
  const s=await app(),c=s.poster();
  try {
    s.advance(120_000);c.image().props.onError();await s.settle();
    s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/week-cached'});await s.settle();
    await s.week(1);assert.equal(s.lists.length,2);await s.week(-1);assert.equal(s.lists.length,2);
    assert.equal(s.weekList().props.data[0][0].coverImageUrl,'https://images.test/week-cached');
    await s.active(false);await s.active(true);assert.equal(s.lists.length,2);
    s.advance(120_001);await s.active(false);await s.active(true);assert.equal(s.lists.length,3,'recovery must not extend the week list TTL');
    assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

test('unmounted weekly/ending owners do not update after their shared detail request completes',async()=>{
  const s=await app({withScreen:true}),a=s.poster(),b=s.poster('ending');
  a.image().props.onError();b.image().props.onError();await s.settle();assert.equal(s.details.length,1);
  s.dispose();const week=s.section.slots.map(slot=>slot.value),ending=s.screen.slots.map(slot=>slot.value);
  s.details[0].resolve({...popup(),coverImageUrl:'https://images.test/after-unmount'});await flush();await flush();
  assert.deepEqual(s.section.slots.map(slot=>slot.value),week);assert.deepEqual(s.screen.slots.map(slot=>slot.value),ending);
});
