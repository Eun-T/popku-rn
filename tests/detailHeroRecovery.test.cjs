const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const child = (tree,name) => nodes(tree).find(n=>n.type===name||n.type?.name===name);
const detail = (id='popup-a',language='ko') => ({publicId:id,name:`${language}:${id}`,countryCode:'KR',regionId:1,regionName:'성수',
  latitude:37,longitude:127,startDate:'2026-10-01',endDate:'2026-10-31',coverImageUrl:`https://images.test/${id}/${language}/original`,coverImageCacheKey:`object-${id}`,
  favoriteCount:3,isFavorited:false,reviewCount:2,averageRating:4.5,tags:[],contentImageUrls:['https://images.test/introduction'],
  notice:'notice',benefits:'benefits',summary:'summary',address:'address',locationDetail:'floor',operatingHours:'10-20',highlights:[],
  socialLinks:null,reservationUrl:null,reservationStartAt:null,reservationEndAt:null});

async function app({compiled=false,realReviews=false}={}) {
  let now=1_800_000_000_000,id='popup-a',alive=true,system='ja-JP',user={id:1};
  const requests=[],mutations=[],reviewRequests=[],reviewListeners=new Set(),likes=new Set(),authListeners=new Set(),scrolls=[],routes=[];
  const heroFile='src/components/place/PopupHeroImage.tsx';
  const compile=compilerTransform([heroFile,'src/hooks/useTranslation.ts']);
  const ui=runtime({
    'test-clock':{now:()=>now},
    'react-native':{...Object.fromEntries(['Image','View','Text','Pressable','ScrollView','ActivityIndicator'].map(n=>[n,n])),
      StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:390,height:844}),Platform:{OS:'ios'},
      Alert:{alert(){}},Linking:{openURL:async()=>{}},Share:{share:async()=>{}}},
    'expo-image':{Image:'ExpoImage'},'expo-constants':{__esModule:true,default:{expoConfig:{ios:{bundleIdentifier:'com.test'}}}},
    'lucide-react-native':Object.fromEntries(['ArrowLeft','ArrowUpRight','CalendarDays','ChevronLeft','ChevronRight','Clock3','Heart','MapPin','MessageCircle','Share2','Star','Ticket'].map(n=>[n,n])),
    'expo-router':{useLocalSearchParams:()=>({id}),useFocusEffect(){},useRouter:()=>({back:()=>routes.push('back'),push:r=>routes.push(r)})},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:40,bottom:20,left:0,right:0})},
    'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
    'src/components/place/PlaceMapPreview.tsx':{__esModule:true,default:'MapPreview',isMapPreviewAvailable:true},
    ...Object.fromEntries(['DirectionsSheet','IntroductionImageCarousel','OfficialChannelIcon','PopupDetailSkeleton','PopupGuidanceCarousel','PopupReviews']
      .filter(n=>!realReviews||n!=='PopupReviews').map(n=>[`src/components/place/${n}.tsx`,{__esModule:true,default:n}])),
    'src/components/community/CommunityPostItem.tsx':{__esModule:true,default:'ReviewCard'},
    'src/components/reviews/ReviewActions.tsx':{__esModule:true,default:'ReviewActions'},
    'src/hooks/useCommunityNow.ts':{useCommunityNow:()=>({now:1})},
    'src/hooks/useModerationRevision.ts':{useModerationRevision:()=>0},
    'src/lib/moderationState.ts':{isLocallyBlocked:()=>false},
    'src/lib/communityFeedRefresh.ts':{subscribeCommunityLikes:fn=>{likes.add(fn);return ()=>likes.delete(fn);},
      subscribeCommunityCommentCounts:()=>()=>{},subscribeCommunityPostChanges:()=>()=>{}},
    'src/lib/communityLikes.ts':{changeCommunityLike:async()=>{}},
    'src/lib/auth.ts':{getAuthUser:()=>user,subscribeAuthUser:fn=>{authListeners.add(fn);return ()=>authListeners.delete(fn);},
      getAuthStatus:()=> 'authenticated',subscribeAuthStatus:()=>()=>{},subscribeAuthSession:()=>()=>{},
      getAuthSession:async()=>({accessToken:'fixture-session',generation:1}),clearTokens:async()=>{}},
    'src/lib/favorites.ts':{FavoriteUnauthorizedError:class extends Error{},
      favoritePopup:async()=>{mutations.push('add');return {publicId:id,isFavorited:true,favoriteCount:4};},
      unfavoritePopup:async()=>{mutations.push('remove');return {publicId:id,isFavorited:false,favoriteCount:3};}},
    'src/lib/reviews.ts':{subscribeReviews:fn=>{reviewListeners.add(fn);return ()=>reviewListeners.delete(fn);},
      getPopupReviews:async(publicId,cursor)=>{reviewRequests.push({publicId,cursor});return {items:[{
        id:7,type:'REVIEW',liked:false,likeCount:0,commentCount:0,author:{id:1,nickname:'author'},body:'review body'}],nextCursor:'next'};}},
    'src/lib/popups.ts':{PopupDetailUnauthorizedError:class extends Error{},
      getPopupDetail:(publicId,signal,token,language)=>{const wait=deferred();requests.push({id:publicId,signal,token,language,...wait});
        if(requests.length===1)wait.resolve(detail(publicId,language));return wait.promise;}},
  },{transform:(file,source)=>{source=source.replaceAll('Date.now()',"require('test-clock').now()");return compiled?compile(file,source):source;}});
  const store=ui.load('src/locales/languageStore.ts').languageStore;
  await store.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>[system]});
  const Screen=ui.load('src/app/places/[id].tsx').default,screen=ui.mount(()=>alive?Screen():null);
  const settle=async()=>{await flush();await flush();ui.renderAll();await flush();};
  await settle();
  const heroProps=()=>child(screen.tree,'PopupHeroImage')?.props;
  const Hero=ui.load(heroFile).default;
  function hero() {
    let mounted=true,override;
    const root=ui.mount(()=>mounted&&heroProps()?Hero(override??heroProps()):null);
    const images=()=>nodes(root.tree).filter(n=>n.type==='Image'||n.type==='ExpoImage');
    return {root,images,poster:()=>images().at(-1),background:()=>images().length===2?images()[0]:null,
      retry:()=>nodes(root.tree).find(n=>n.props?.testID==='detail-cover-retry'),
      replace(popup){override={...heroProps(),uri:popup.coverImageUrl,popup};root.render();},
      unmount(){mounted=false;root.slots.forEach(s=>s?.cleanup?.());}};
  }
  const scroll=()=>child(screen.tree,'ScrollView');
  scroll().props.ref.current={scrollTo:options=>scrolls.push(options)};
  return {...ui,screen,hero,heroProps,requests,mutations,reviewRequests,scrolls,routes,scroll,store,settle,
    advance(ms){now+=ms;},now:()=>now,
    reviewChanged(){reviewListeners.forEach(fn=>fn(id));},
    liked(){likes.forEach(fn=>fn(7,{liked:true,likeCount:1},'REVIEW'));},
    async language(l){await store.setLanguagePreference(l);await settle();},
    async system(tag){system=tag;store.refreshSystemLanguage();await settle();},
    systemSnapshot(tag){system=tag;store.refreshSystemLanguage();},
    async popup(next){id=next;ui.renderAll();await settle();},
    async authChanged(){user={id:2};authListeners.forEach(fn=>fn());await settle();},
    unmount(){alive=false;ui.dispose();},
  };
}

test('normal hero has no extra API; native poster failure recovers only the image',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onLoad?.();await s.settle();assert.equal(s.requests.length,1);
    h.poster().props.onError();await s.settle();assert.equal(s.requests.length,2,'current hero cannot request a new cover URL');
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/renewed',name:'do not replace detail',favoriteCount:0,isFavorited:false});await s.settle();
    assert.equal(h.poster().props.source.uri,'https://images.test/renewed');assert.ok(texts(s.screen.tree).includes('ko:popup-a'));
    assert.equal(s.heroProps().popup.coverImageCacheKey,'object-popup-a');
  }finally{s.dispose();}
});

test('failed recovery shows placeholder and same-screen retry honors 30 seconds and ignores duplicate taps',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();s.requests[1].reject(new Error('offline'));await s.settle();
    assert.match(h.poster().props.source,/ranking-placeholder/);assert.equal(h.background(),null);
    assert.ok(h.retry());let stopped=false;
    h.retry().props.onPress({stopPropagation(){stopped=true;}});await s.settle();assert.ok(stopped);assert.equal(s.requests.length,2);
    s.advance(29_999);h.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,2);
    s.advance(1);const retry=h.retry().props.onPress;retry({stopPropagation(){}});retry({stopPropagation(){}});await s.settle();
    assert.equal(s.requests.length,3);assert.equal(h.retry().props.disabled,true);assert.deepEqual(s.routes,[]);
    s.requests[2].resolve({...detail(),coverImageUrl:'https://images.test/online'});await s.settle();
    assert.equal(h.poster().props.source.uri,'https://images.test/online');assert.equal(h.retry(),undefined);
    assert.equal(s.heroProps().uri,'https://images.test/online');
  }finally{s.dispose();}
});

test('background/foreground and two instances share recovery; immediate replacement errors stop without a loop',async()=>{
  const s=await app(),a=s.hero(),b=s.hero();
  try {
    a.poster().props.onError();a.background()?.props.onError();b.background().props.onError();b.poster().props.onError();await s.settle();
    assert.equal(s.requests.length,2);assert.equal(s.requests[1].token,undefined);
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/shared'});await s.settle();
    assert.equal(a.poster().props.source.uri,'https://images.test/shared');assert.equal(b.poster().props.source.uri,'https://images.test/shared');
    assert.equal(a.background().props.source,a.poster().props.source);assert.equal(a.poster().props.source.cacheKey,'object-popup-a');
    assert.equal(a.poster().props.cachePolicy,'memory-disk');assert.equal(a.background().props.cachePolicy,'memory-disk');
    a.poster().props.onError();b.poster().props.onError();await s.settle();assert.equal(s.requests.length,2);
    assert.match(a.poster().props.source,/placeholder/);
  }finally{s.dispose();}
});

test('a mounted recovered URL can expire a second time; fresh replacement stays guarded and manual retry remains available',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/first'});await s.settle();
    h.poster().props.onLoad();s.advance(300_001);h.poster().props.onError();await s.settle();assert.equal(s.requests.length,3);
    s.requests[2].resolve({...detail(),coverImageUrl:'https://images.test/second'});await s.settle();assert.equal(h.poster().props.source.uri,'https://images.test/second');
    h.poster().props.onError();await s.settle();assert.equal(s.requests.length,3);assert.match(h.poster().props.source,/placeholder/);
    s.advance(30_000);h.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,4);
    s.requests[3].resolve({...detail(),coverImageUrl:'https://images.test/manual'});await s.settle();assert.equal(h.poster().props.source.uri,'https://images.test/manual');
  }finally{s.dispose();}
});

test('rapid unmount/remount shares in-flight requests and cannot bypass a failed request cooldown',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();h.unmount();const before=h.root.slots.map(v=>v.value);
    for(let i=0;i<5;i++){const next=s.hero();next.poster().props.onError();await s.settle();next.unmount();}
    assert.equal(s.requests.length,2);s.requests[1].reject(new Error('offline'));await s.settle();assert.deepEqual(h.root.slots.map(v=>v.value),before);
    const during=s.hero();during.poster().props.onError();await s.settle();assert.equal(s.requests.length,2);during.unmount();
    s.advance(30_000);const after=s.hero();after.poster().props.onError();await s.settle();assert.equal(s.requests.length,3);
    s.requests[2].resolve({...detail(),coverImageUrl:'https://images.test/re-entry'});await s.settle();assert.equal(after.poster().props.source.uri,'https://images.test/re-entry');
  }finally{s.dispose();}
});

test('image revision changes ignore late results and old native callbacks',async()=>{
  const s=await app(),h=s.hero();
  try {
    const oldError=h.poster().props.onError;oldError();await s.settle();
    h.replace({...s.heroProps().popup,coverImageUrl:'https://images.test/new-object',coverImageCacheKey:'new-object'});
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/old-object'});await s.settle();
    assert.equal(h.poster().props.source.uri,'https://images.test/new-object');oldError();await s.settle();assert.equal(s.requests.length,2);
  }finally{s.dispose();}
});

for(const change of ['popup','language'])test(`${change} changes discard previous cover responses`,async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();s.advance(1);
    if(change==='popup')await s.popup('popup-b');else await s.language('ja');
    s.requests[2].resolve(detail(change==='popup'?'popup-b':'popup-a',change==='language'?'ja':'ko'));await s.settle();
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/retired'});await s.settle();
    assert.notEqual(h.poster().props.source.uri,'https://images.test/retired');assert.notEqual(s.heroProps().uri,'https://images.test/retired');
  }finally{s.dispose();}
});

test('leaving the detail screen prevents owner and image updates after the shared GET completes',async()=>{
  const s=await app(),h=s.hero();h.poster().props.onError();await s.settle();s.unmount();
  const parent=s.screen.slots.map(v=>v.value),image=h.root.slots.map(v=>v.value);
  s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/after-back'});await flush();await flush();
  assert.deepEqual(s.screen.slots.map(v=>v.value),parent);assert.deepEqual(h.root.slots.map(v=>v.value),image);
});

test('late review-summary GET preserves repaired image and favorite mutation; recovery leaves other detail fields untouched',async()=>{
  const s=await app(),h=s.hero();
  try {
    s.reviewChanged();await s.settle();assert.equal(s.requests.length,2);
    child(s.screen.tree,'DetailTabs').props.onSelectReviews();s.scroll().props.onScroll({nativeEvent:{contentOffset:{y:500}}});
    nodes(s.screen.tree).find(n=>n.props?.testID==='popup-floating-favorite').props.onPress();await s.settle();
    const state=()=>s.screen.slots.find(v=>v?.value?.detail)?.value.detail;
    const original=state(),scrollRef=s.scroll().props.ref,heroKey=child(s.screen.tree,'PopupHeroImage').key,scrolled=[...s.scrolls];
    h.poster().props.onError();await s.settle();
    s.requests[2].resolve({...detail(),coverImageUrl:'https://images.test/repaired',notice:'wrong notice',benefits:'wrong benefits',summary:'wrong summary',address:'wrong address',
      isFavorited:false,favoriteCount:0,reviewCount:100,averageRating:1});await s.settle();
    const withoutCover=({coverImageUrl,coverImageCacheKey,coverImageFetchedAt,...rest})=>rest;
    assert.deepEqual(withoutCover(state()),withoutCover(original));assert.equal(state().isFavorited,true);
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/old-get',isFavorited:false,favoriteCount:0,reviewCount:3,averageRating:4});await s.settle();
    assert.equal(s.heroProps().uri,'https://images.test/repaired');assert.equal(state().isFavorited,true);assert.equal(state().favoriteCount,4);
    assert.equal(state().reviewCount,3);assert.equal(state().notice,original.notice);
    assert.equal(s.scroll().props.ref,scrollRef);assert.deepEqual(s.scrolls,scrolled);assert.equal(child(s.screen.tree,'PopupHeroImage').key,heroKey);
    assert.equal(child(s.screen.tree,'DetailTabs').props.selectedTab,'reviews');assert.ok(child(s.screen.tree,'PopupReviews'));
  }finally{s.dispose();}
});

test('a late initial detail GET merges newer cover data without accepting an old session recovery callback',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();s.advance(1);await s.authChanged();assert.equal(s.requests.length,3);
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/latest-cover',name:'wrong name'});await s.settle();
    assert.equal(s.heroProps(),undefined,'old session callback must not create ready detail');
    s.requests[2].resolve({...detail(),name:'new session detail'});await s.settle();
    assert.equal(s.heroProps().uri,'https://images.test/latest-cover');assert.ok(texts(s.screen.tree).includes('new session detail'));
  }finally{s.dispose();}
});

test('real review rows, reaction state and pagination cursor survive hero recovery without a review refetch',async()=>{
  const s=await app({realReviews:true}),h=s.hero();
  try {
    child(s.screen.tree,'DetailTabs').props.onSelectReviews();const Reviews=s.load('src/components/place/PopupReviews.tsx').default;
    const reviews=s.mount(()=>Reviews(child(s.screen.tree,'PopupReviews').props));await s.settle();s.liked();await s.settle();
    const post=()=>child(reviews.tree,'ReviewCard').props.post,before=post();assert.equal(before.liked,true);
    assert.equal(s.reviewRequests.length,1);assert.ok(texts(reviews.tree).includes(s.load('src/locales/index.ts').translate('ko','place.detail.reviews.more')));
    h.poster().props.onError();await s.settle();s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/review-safe'});await s.settle();
    assert.deepEqual(post(),before);assert.equal(s.reviewRequests.length,1);assert.equal(child(s.screen.tree,'DetailTabs').props.selectedTab,'reviews');
  }finally{s.dispose();}
});

test('absent/removed image and server-confirmed absence keep placeholder and safe geometry without retry',async()=>{
  const s=await app(),h=s.hero();
  try {
    const style=h.poster().props.style,rootStyle=h.root.tree.props.style;h.poster().props.onLoad();
    h.replace({...s.heroProps().popup,coverImageUrl:null});assert.match(h.poster().props.source,/placeholder/);
    h.poster().props.onError();await s.settle();assert.equal(s.requests.length,1);assert.equal(h.retry(),undefined);
    const normal=s.hero();normal.poster().props.onError();await s.settle();s.requests[1].resolve({...detail(),coverImageUrl:null});await s.settle();
    assert.match(normal.poster().props.source,/placeholder/);assert.equal(normal.retry(),undefined);
    assert.deepEqual(normal.poster().props.style,style);assert.deepEqual(normal.root.tree.props.style,rootStyle);
  }finally{s.dispose();}
});

test('compiled mounted retry labels follow ko-ja-ko/system with fixed props without any extra GET',async()=>{
  const s=await app({compiled:true}),h=s.hero();
  try {
    // Remove the data owner's language subscription: only the mounted image UI participates.
    s.screen.slots.forEach(v=>v?.cleanup?.());
    const manager=s.load('src/lib/exploreCoverRecovery.ts');
    const props={...s.heroProps(),onRecoverCover:(item,manual)=>manager.recoverExploreCover(item,'KR','ko',manual)};
    const Hero=s.load('src/components/place/PopupHeroImage.tsx').default,root=s.mount(()=>Hero(props));
    nodes(root.tree).filter(n=>n.type==='ExpoImage').at(-1).props.onError();await flush();await flush();
    s.requests[1].reject(new Error('offline'));await flush();await flush();
    const count=s.requests.length,geometry=root.tree.props.style;
    for(const language of ['ja','ko']){await s.store.setLanguagePreference(language);assert.ok(texts(root.tree).includes(language==='ja'?'再試行':'다시 시도'));}
    await s.store.setLanguagePreference('system');assert.ok(texts(root.tree).includes('再試行'));
    // Refresh the system snapshot without manually rerendering the data owner.
    s.systemSnapshot('ko-KR');assert.ok(texts(root.tree).includes('다시 시도'));
    assert.equal(s.requests.length,count);assert.deepEqual(root.tree.props.style,geometry);
  }finally{s.dispose();}
});

test('changed country rejects old recovery while using the new detail image namespace',async()=>{
  const s=await app(),h=s.hero();
  try {
    h.poster().props.onError();await s.settle();s.advance(1);await s.authChanged();
    s.requests[2].resolve({...detail(),countryCode:'JP',coverImageCacheKey:'object-jp',coverImageUrl:'https://images.test/jp'});await s.settle();
    s.requests[1].resolve({...detail(),coverImageUrl:'https://images.test/old-kr'});await s.settle();
    assert.equal(h.poster().props.source.uri,'https://images.test/jp');assert.equal(h.poster().props.source.cacheKey,'object-jp');
  }finally{s.dispose();}
});
