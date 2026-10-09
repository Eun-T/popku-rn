const assert=require('node:assert/strict');
const {test}=require('node:test');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {runtime,nodes,texts,flush}=require('./helpers/i18nRuntime.cjs');

const compiledFiles=new Set(['HomeTrendingSection','HomeNewPopupSection','HomeBanner'].map(n=>`src/components/home/${n}.tsx`)
  .concat(['PlaceRegionSection','PlaceInterestSection'].map(n=>`src/components/place/${n}.tsx`),'src/hooks/useTranslation.ts'));
const transform=compilerTransform(compiledFiles);
const child=(tree,name)=>nodes(tree).find(n=>n.type?.name===name);
const list=tree=>nodes(tree).find(n=>n.type==='FlatList');
const popup=Object.freeze({placeId:1,publicId:'original-id',name:'서버 공식 팝업명',countryCode:'KR',regionId:1,regionName:'성수',
  tags:Object.freeze([{id:5,name:'뷰티'}]),startDate:'2026-10-08',endDate:'2026-10-31',coverImageUrl:null,coverImageCacheKey:null});
const unknown=Object.freeze({...popup,placeId:2,publicId:'unknown-id',regionId:null,regionName:'서버 장소 원문'});

async function app() {
  const calls=[],opened=[],timers=new Map(); let timerId=0;
  const animation=()=>({start(cb){cb?.({finished:true});},stop(){}});
  const native={View:'View',Text:'Text',Pressable:'Pressable',TextInput:'TextInput',FlatList:'FlatList',ScrollView:'ScrollView',Image:'Image',Modal:'Modal',
    StyleSheet:{create:s=>s,absoluteFill:{position:'absolute'}},useWindowDimensions:()=>({width:390,height:844,fontScale:1}),
    Animated:{Value:class{setValue(){}},View:'AnimatedView',timing:animation,spring:animation,parallel:animation},PanResponder:{create:()=>({panHandlers:{}})}};
  const svg={__esModule:true,default:'Svg',Defs:'Defs',LinearGradient:'LinearGradient',Rect:'Rect',Stop:'Stop'};
  const isFavorite=()=>false,isFavoriteDisabled=()=>false,toggleFavorite=()=>{},retryFavorites=async()=>{};
  const ui=runtime({
    'react-native':native,'expo-image':{Image:'ExpoImage'},'react-native-svg':svg,
    'lucide-react-native':Object.fromEntries(['Store','Heart','Search','X','Bell','ChevronDown','ChevronUp','ChevronLeft','ChevronRight','RotateCcw'].map(n=>[n,n])),
    '@expo/vector-icons':{Ionicons:'Ionicons'},'expo-blur':{BlurTargetView:'BlurTargetView',BlurView:'BlurView'},
    'expo-router':{useRouter:()=>({push:r=>opened.push(r)}),useLocalSearchParams:()=>({}),useScrollToTop(){},useFocusEffect(){}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:40,bottom:20,left:0,right:0})},
    'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
    'src/hooks/usePopupFavorites.ts':{usePopupFavorites:()=>({isFavorite,isFavoriteDisabled,toggleFavorite,retryFavorites,favoritesStatus:'ready'})},
    'src/hooks/usePopupNavigation.ts':{usePopupNavigation:()=>id=>opened.push(id)},
    'src/hooks/usePlaceCoverImage.ts':{usePlaceCoverImage:item=>({source:{uri:item.coverImageUrl},onError(){},onLoad(){}})},
    'src/constants/api.ts':{API_BASE_URL:'https://test'},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),
    fetch:async url=> {
      calls.push(url); const pathname=new URL(url).pathname;
      const data=pathname==='/api/main-banners' ? {popups:[popup,unknown]}
        :pathname==='/api/regions' ? [{id:1,name:'성수'},{id:4,name:'홍대·신촌'}]
        :pathname==='/api/tags' ? [{id:1,name:'캐릭터/IP'},{id:5,name:'뷰티'}]
        :{popups:Array.from({length:8},(_,i)=>({...popup,publicId:`popup-${i}`})),nextCursor:null};
      return {ok:true,json:async()=>data};
    },
  },{transform});
  const {languageStore}=ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP']});
  return {...ui,languageStore,calls,opened,timers,async settle(){await flush();await flush();},async language(value){await languageStore.setLanguagePreference(value);await flush();}};
}

test('compiler-cached mounted trending/new headers update ko/ja/system while expanded/country/carousel/API state stays',async()=>{
  const s=await app(),Trending=s.load('src/components/home/HomeTrendingSection.tsx').default,
    New=s.load('src/components/home/HomeNewPopupSection.tsx').default,props={onPressPopup:id=>s.opened.push(id)};
  const trending=s.mount(()=>Trending(props)),fresh=s.mount(()=>New(props));await s.settle();
  child(trending.tree,'FilterChips').props.onChange('JP');child(fresh.tree,'FilterChips').props.onChange('JP');await s.settle();
  child(trending.tree,'MoreButton').props.onPress();
  const requests=s.calls.slice(),carousel=()=>nodes(fresh.tree).find(n=>n.type==='ScrollView'),key=carousel().key,style=carousel().props.style;
  for(const [preference,language]of [['ja','ja'],['ko','ko'],['system','ja']]) {
    await s.language(preference);
    const locale=s.load('src/locales/index.ts');
    for(const [root,prefix]of [[trending,'home.trending'],[fresh,'home.new']]) {
      assert.ok(texts(root.tree).includes(locale.translate(language,`${prefix}.title`)));
      assert.ok(texts(root.tree).includes(locale.translate(language,`${prefix}.description`)));
      assert.equal(child(root.tree,'FilterChips').props.value,'JP');
    }
    assert.equal(nodes(trending.tree).filter(n=>n.type?.name==='PopupRankingCard').length,8);
    assert.equal(child(trending.tree,'MoreButton').props.label,locale.translate(language,'place.filters.collapse'));
    assert.equal(carousel().key,key);assert.deepEqual(carousel().props.style,style);assert.deepEqual(s.calls,requests);
    assert.equal(child(trending.tree,'PopupRankingCard').props.title,popup.name);
  }
  s.dispose();
});

test('compiled banner page keeps stable API data/page/ref/key but resolves numeric region for every live language',async()=>{
  const s=await app(),Banner=s.load('src/components/home/HomeBanner.tsx').default,props={onPressPopup:id=>s.opened.push(id)};
  const root=s.mount(()=>Banner(props));await s.settle();
  const pages=s.mount(()=>root.tree.type(root.tree.props)),pageKey=root.tree.key;
  const scroll=()=>nodes(pages.tree).find(n=>n.type==='ScrollView');
  scroll().props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:390}}});
  const data=root.tree.props.popups,requests=s.calls.slice(),snapshot=JSON.stringify(data);
  for(const [preference,region]of [['ja','聖水'],['ko','성수'],['system','聖水']]) {
    await s.language(preference);
    assert.ok(texts(pages.tree).includes(region));assert.ok(texts(pages.tree).includes(unknown.regionName));assert.ok(texts(pages.tree).includes(popup.name));
    assert.equal(root.tree.key,pageKey);assert.equal(root.tree.props.popups,data);assert.deepEqual(s.calls,requests);
    assert.deepEqual(nodes(pages.tree).filter(n=>n.props?.accessibilityState).map(n=>n.props.accessibilityState.selected),[false,true]);
    assert.equal(JSON.stringify(data),snapshot);
  }
  nodes(pages.tree).find(n=>n.type==='Pressable').props.onPress();assert.deepEqual(s.opened,[popup.publicId]);
  assert.ok(s.calls.filter(u=>u.includes('/main-banners')).every(u=>new URL(u).searchParams.get('languageCode')==='ko'));s.dispose();
});

test('compiled region/interest headers and cached region pages update while hidden tab, page and selected IDs persist',async()=>{
  const s=await app(),Region=s.load('src/components/place/PlaceRegionSection.tsx').default,
    Interest=s.load('src/components/place/PlaceInterestSection.tsx').default,pages=s.load('src/constants/placeRegionMocks.ts').placeRegionPages;
  let active=true;const onPress=item=>s.opened.push(item.id),onCategory=id=>s.opened.push(id);
  const region=s.mount(()=>Region({pages,width:358,isActive:active,onPress})),interest=s.mount(()=>Interest({onPressCategory:onCategory}));
  const ref=list(region.tree).props.ref,key=list(region.tree).key;
  list(region.tree).props.onScrollBeginDrag();list(region.tree).props.onScroll({nativeEvent:{contentOffset:{x:374}}});
  const requests=s.calls.slice();active=false;s.renderAll();
  for(const [preference,language]of [['ja','ja'],['ko','ko'],['system','ja']]) {
    await s.language(preference); const locale=s.load('src/locales/index.ts');
    assert.ok(texts(region.tree).includes(locale.translate(language,'place.explore.regions')));
    assert.ok(texts(interest.tree).includes(locale.translate(language,'place.explore.interests')));
    assert.ok(texts(interest.tree).includes(locale.translate(language,'place.explore.interestsDescription')));
    // FlatList receives invalidation despite unchanged data, and its cached renderItem sees the new language.
    assert.equal(list(region.tree).props.extraData,language);
    for(const page of pages) {
      const pagination=nodes(region.tree).find(n=>n.type==='Pressable'&&n.key===page.id);
      assert.equal(pagination.props.accessibilityLabel,locale.translate(language,page.descriptionKey));
      const labelKey=s.load('src/constants/placeFilters.ts').regionFilters.find(r=>r.id===page.items[0].id).labelKey;
      assert.ok(texts(list(region.tree).props.renderItem({item:page})).includes(locale.translate(language,labelKey)));
    }
    assert.equal(list(region.tree).props.ref,ref);assert.equal(list(region.tree).key,key);assert.equal(list(region.tree).props.data,pages);
    assert.deepEqual(nodes(region.tree).filter(n=>n.props?.accessibilityState).map(n=>n.props.accessibilityState.selected),[false,true]);
    assert.deepEqual(s.calls,requests);
  }
  active=true;s.renderAll();
  assert.ok(texts(region.tree).includes('どこに遊びに行こう！'));
  const first=list(region.tree).props.renderItem({item:pages[0]});nodes(first).find(n=>n.type==='Pressable').props.onPress();
  nodes(interest.tree).find(n=>n.type==='Pressable').props.onPress();assert.deepEqual(s.opened,['seongsu','animeCharacter']);s.dispose();
});

test('retained actual Place explore sections translate across tab return without changing applied multi-filter requests',async()=>{
  const s=await app(),Screen=s.load('src/screens/PlaceScreen.tsx').default;
  const screen=s.mount(()=>Screen());await s.settle();
  const region=s.mount(()=>{const n=child(screen.tree,'PlaceRegionSection');return n.type(n.props);});
  const interest=s.mount(()=>{const n=child(screen.tree,'PlaceInterestSection');return n.type(n.props);});
  const pressTab=key=>nodes(screen.tree).find(n=>n.type==='Pressable'&&n.key===key&&n.props.accessibilityRole==='tab').props.onPress();
  pressTab('전체');await s.settle();child(screen.tree,'QuickFilterBar').props.onOpenDetails();
  const sheet=()=>child(screen.tree,'PlaceFilterSheet').props;
  sheet().onToggleCountry('KR');sheet().onToggleRegion(1);sheet().onToggleRegion(4);sheet().onToggleTag(1);sheet().onToggleTag(5);
  const draft=JSON.stringify(sheet().filters);sheet().onApply();await s.settle();
  const filters=child(screen.tree,'AppliedFilterBar').props,requests=s.calls.slice();
  for(const [preference,language]of [['ja','ja'],['ko','ko']]) {
    await s.language(preference); const locale=s.load('src/locales/index.ts');
    assert.ok(texts(region.tree).includes(locale.translate(language,'place.explore.regions')));
    assert.ok(texts(interest.tree).includes(locale.translate(language,'place.explore.interests')));
    assert.ok(texts(interest.tree).includes(locale.translate(language,'place.explore.interestsDescription')));
    assert.equal(JSON.stringify(sheet().filters),draft);assert.deepEqual(child(screen.tree,'AppliedFilterBar').props.detailFilters,filters.detailFilters);
    assert.deepEqual(child(screen.tree,'AppliedFilterBar').props.filters,filters.filters);assert.deepEqual(s.calls,requests);
    pressTab('탐색');pressTab('전체');await s.settle();assert.deepEqual(s.calls,requests);
  }
  const query=new URL(requests.filter(u=>new URL(u).pathname==='/api/popups').at(-1)).searchParams;
  assert.equal(query.get('countryCode'),'KR');assert.equal(query.get('regionIds'),'1,4');assert.equal(query.get('tagIds'),'1,5');s.dispose();
});

test('language-bound translator invalidates memo values and stays stable when resolved language is unchanged',async()=>{
  const s=await app(),hook=s.load('src/hooks/useTranslation.ts').useTranslation;
  const root=s.mount(()=>{const {t}=hook();return {t,label:s.react.useMemo(()=>t('home.trending.title'),[t])};});
  assert.equal(root.tree.label,'지금 뜨는 팝업 🔥');const ko=root.tree.t;
  await s.language('ja');assert.equal(root.tree.label,'今話題のポップアップ 🔥');assert.notEqual(root.tree.t,ko);
  const ja=root.tree.t;await s.language('system');assert.equal(root.tree.t,ja);
  await s.language('ko');assert.equal(root.tree.label,'지금 뜨는 팝업 🔥');s.dispose();
});
