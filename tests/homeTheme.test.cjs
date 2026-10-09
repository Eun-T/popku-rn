const assert=require('node:assert/strict'),{test}=require('node:test');
const {runtime,nodes,texts,flush}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const home=n=>`src/components/home/${n}.tsx`;
const compiled=[...['HomeBanner','HomeTrendingSection','HomeNewPopupSection','NewPopupCard','PopupRankingCard','HomePopupSkeleton'].map(home),
  ...['FilterChips','MoreButton','SkeletonBlock'].map(n=>`src/components/common/${n}.tsx`),'src/screens/HomeScreen.tsx','src/theme/useTheme.ts','src/hooks/useTranslation.ts'];
const child=(tree,name)=>nodes(tree).find(n=>n.type?.name===name);
const flat=node=>Object.assign({},...[node.props.style].flat(Infinity).filter(Boolean));
const popup=Object.freeze({placeId:1,publicId:'popup-1',name:'서버 원문',countryCode:'KR',regionId:1,regionName:'성수',
  startDate:'2026-10-08',endDate:'2026-10-31',coverImageUrl:'https://image.test/poster',coverImageCacheKey:'original-cache',tags:[{id:5,name:'뷰티'}]});
async function app(state, enabled = true) {
  const calls=[],opened=[],toggles=[];let scheme='light',starts=0,stops=0;
  const animation=()=>({start(){starts++;},stop(){stops++;}});
  const ui=runtime({
    ...(enabled ? {'src/theme/themeFeature.js': { DARK_MODE_ENABLED:true }} : {}),
    'react-native':{...Object.fromEntries(['View','Text','Pressable','ScrollView','Image'].map(n=>[n,n])),
      StyleSheet:{create:x=>x,absoluteFill:{position:'absolute'}},useWindowDimensions:()=>({width:390,height:844}),
      Animated:{Value:class{setValue(){}},View:'AnimatedView',loop:animation,sequence:animation,timing:animation}},
    'expo-image':{Image:'ExpoImage'},'@expo/vector-icons':{Ionicons:'Ionicons'},
    'lucide-react-native':{Heart:'Heart',Store:'Store'},
    'react-native-svg':{__esModule:true,default:'Svg',Defs:'Defs',LinearGradient:'LinearGradient',Rect:'Rect',Stop:'Stop'},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:40,bottom:20,left:0,right:0})},
    'expo-router':{useRouter:()=>({push:r=>opened.push(r)})},
    'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
    'src/hooks/usePopupNavigation.ts':{usePopupNavigation:()=>id=>opened.push(id)},
    'src/hooks/usePopupFavorites.ts':{usePopupFavorites:()=>({isFavorite:()=>false,isFavoriteDisabled:()=>false,
      toggleFavorite:p=>toggles.push(p),retryFavorites:()=>toggles.push('retry'),favoritesStatus:state?'error':'ready'})},
    ...(state?{'src/hooks/useHomePopups.ts':{useHomePopups:()=>({status:state,popups:[]})}}:{}),
    'src/constants/api.ts':{API_BASE_URL:'https://api.test'},setTimeout:()=>1,clearTimeout(){},
    fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({popups:Array.from({length:8},(_,i)=>({...popup,publicId:`popup-${i}`})),nextCursor:null})};},
  },{transform:compilerTransform(compiled)});
  const theme=ui.load('src/theme/themeStore.ts').themeStore,language=ui.load('src/locales/languageStore.ts').languageStore;
  await theme.initialize({read:async()=>null,write:async()=>{},getColorScheme:()=>scheme});
  await language.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP']});
  return {...ui,theme,language,calls,opened,toggles,pulse:()=>({starts,stops}),
    mountFile(file,props={}){return ui.mount(()=>ui.load(file).default(props));},
    mountChild(root,name){return ui.mount(()=>{const n=child(root.tree,name);return n.type(n.props);});},
    async mode(value){await theme.setThemePreference(value);ui.renderAll();},os(value){scheme=value;theme.refreshSystemTheme();ui.renderAll();},
    async settle(){await flush();await flush();}};
}

test('actual Compiler updates full home and preserves country/expanded/banner pages, images, API and navigation',async()=>{
  const s=await app(),screen=s.mountFile('src/screens/HomeScreen.tsx'),trending=s.mountChild(screen,'HomeTrendingSection'),fresh=s.mountChild(screen,'HomeNewPopupSection'),banner=s.mountChild(screen,'HomeBanner');
  await s.settle();
  child(trending.tree,'FilterChips').props.onChange('JP');child(fresh.tree,'FilterChips').props.onChange('JP');await s.settle();
  child(trending.tree,'MoreButton').props.onPress();
  const pages=s.mount(()=>banner.tree.type(banner.tree.props));
  nodes(pages.tree).find(n=>n.type==='ScrollView').props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:390}}});
  const ranking=s.mountChild(trending,'PopupRankingCard'),card=s.mountChild(fresh,'NewPopupCard');
  const filter=s.mountChild(trending,'FilterChips'),more=s.mountChild(trending,'MoreButton');
  const requestSnapshot=s.calls.slice(),source=nodes(card.tree).find(n=>n.type==='Image').props.source,scroll=()=>nodes(fresh.tree).find(n=>n.type==='ScrollView'),key=scroll().key,slots=screen.slots;
  const light={ranking:flat(ranking.tree),card:flat(card.tree),filter:flat(nodes(filter.tree).find(n=>n.key==='JP'))};
  assert.equal(flat(screen.tree).backgroundColor,'#FFFFFF');assert.equal(light.ranking.backgroundColor,'#FFFFFF');
  assert.equal(light.filter.backgroundColor,'#111827');assert.equal(flat(nodes(more.tree).find(n=>n.type==='Text')).color,'#111827');
  assert.equal(flat({props:{style:more.tree.props.style({pressed:false})}}).backgroundColor,'#F7F8FC');
  for(const mode of ['dark','light','system']) {
    if(mode==='system')s.os('dark');await s.mode(mode);const dark=mode!=='light';
    assert.equal(flat(screen.tree).backgroundColor,dark?'#121212':'#FFFFFF');
    assert.equal(flat(ranking.tree).backgroundColor,dark?'#242424':'#FFFFFF');assert.equal(flat(ranking.tree).borderBottomColor,dark?'#484848':'#E5E7EB');
    assert.equal(flat(card.tree).backgroundColor,dark?'#242424':'#FFFFFF');
    assert.equal(flat(nodes(filter.tree).find(n=>n.key==='JP')).backgroundColor,dark?'#22C55E':'#111827');
    assert.equal(flat(nodes(filter.tree).find(n=>n.key==='KR')).backgroundColor,dark?'#303030':'#FFFFFF');
    assert.equal(flat(nodes(nodes(filter.tree).find(n=>n.key==='JP')).find(n=>n.type==='Text')).color,dark?'#071B0E':'#FFFFFF');
    assert.equal(flat({props:{style:more.tree.props.style({pressed:false})}}).backgroundColor,dark?'#242424':'#F7F8FC');
    assert.equal(flat(pages.tree).backgroundColor,dark?'#242424':'#F8FAFC');
    assert.ok(nodes(pages.tree).filter(n=>n.type==='Text').every(n=>flat(n).color==='#FFFFFF'));
    assert.deepEqual(nodes(card.tree).find(n=>n.type==='Image').props.source,source);assert.equal(scroll().key,key);assert.equal(screen.slots,slots);
    assert.equal(child(trending.tree,'FilterChips').props.value,'JP');assert.equal(child(fresh.tree,'FilterChips').props.value,'JP');
    assert.equal(nodes(trending.tree).filter(n=>n.type?.name==='PopupRankingCard').length,8);
    assert.equal(nodes(pages.tree).find(n=>n.props?.accessibilityState?.selected).key,'popup-1');assert.deepEqual(s.calls,requestSnapshot);
    if(!dark){assert.deepEqual(flat(ranking.tree),light.ranking);assert.deepEqual(flat(card.tree),light.card);}
  }
  s.os('light');assert.equal(flat(screen.tree).backgroundColor,'#FFFFFF');s.os('dark');assert.equal(flat(screen.tree).backgroundColor,'#121212');
  for(const locale of ['ja','ko']) {await s.language.setLanguagePreference(locale);assert.equal(s.theme.getSnapshot().resolvedTheme,'dark');
    assert.ok(texts(trending.tree).includes(locale==='ja'?'今話題のポップアップ':'지금 뜨는 팝업'));assert.deepEqual(s.calls,requestSnapshot);}
  nodes(ranking.tree).find(n=>n.props?.accessibilityState).props.onPress();assert.equal(s.toggles.at(-1).publicId,'popup-0');
  nodes(ranking.tree).find(n=>n.props?.accessibilityLabel?.includes('서버 원문')).props.onPress();assert.equal(s.opened.at(-1),'popup-0');s.dispose();
});

test('paired upcoming/ongoing badges and tags change while poster heart and ranking onImage stay fixed',async()=>{
  const s=await app(),props={width:152,image:{uri:'poster'},period:'period',title:'title',tags:['tag'],isFavorite:false,isFavoriteDisabled:false,onPress(){},onToggleFavorite(){}};
  const card=s.mountFile(home('NewPopupCard'),props),upcoming=s.mountFile(home('NewPopupCard'),{...props,isUpcoming:true});
  const ranking=s.mountFile(home('PopupRankingCard'),{...props,rank:1});
  const hearts=()=>nodes(card.tree).filter(n=>n.type==='Heart').map(n=>({color:n.props.color,fill:n.props.fill}));const original=hearts();
  const badge=root=>nodes(root.tree).find(n=>n.type==='View'&&nodes(n).some(c=>c.type==='Text'&&c.props.children==='period'));
  assert.equal(flat(badge(card)).backgroundColor,'#DCFCE7');assert.equal(flat(badge(upcoming)).backgroundColor,'#DBEAFE');
  await s.mode('dark');assert.equal(flat(badge(card)).backgroundColor,'#173B27');assert.equal(flat(badge(upcoming)).backgroundColor,'#3B2D15');
  assert.equal(flat(nodes(card.tree).find(n=>n.props?.children==='period')).color,'#4ADE80');
  assert.equal(flat(nodes(upcoming.tree).find(n=>n.props?.children==='period')).color,'#FBBF24');
  assert.equal(flat(nodes(card.tree).find(n=>n.props?.children==='tag')).color,'#B0B0B0');assert.deepEqual(hearts(),original);
  assert.equal(flat(nodes(ranking.tree).find(n=>n.props?.children===1)).color,'#FFFFFF');
  assert.equal(nodes(ranking.tree).find(n=>n.type==='Heart').props.color,'#F5F5F5');s.dispose();
});

test('empty/error/favorite retry states use tokens; shared components retain legacy default colors',async()=>{
  for(const state of ['ready','error']) {
    const s=await app(state),trending=s.mountFile(home('HomeTrendingSection'),{onPressPopup(){}}),fresh=s.mountFile(home('HomeNewPopupSection'),{onPressPopup(){}});
    await s.mode('dark');assert.ok(nodes(trending.tree).filter(n=>n.type==='Text').every(n=>['#F5F5F5','#B0B0B0'].includes(flat(n).color)));
    assert.ok(nodes(fresh.tree).filter(n=>n.type==='Text').every(n=>['#F5F5F5','#B0B0B0'].includes(flat(n).color)));
    if(state==='ready')assert.equal(nodes(trending.tree).find(n=>n.type==='Store').props.color,'#B0B0B0');
    nodes(trending.tree).find(n=>n.props?.accessibilityLabel==='찜 상태 다시 시도').props.onPress();assert.deepEqual(s.toggles,['retry']);
    const filter=s.mountFile('src/components/common/FilterChips.tsx',{options:[{value:'KR',label:'KR'}],value:'KR',onChange(){}});
    assert.equal(flat(nodes(filter.tree).find(n=>n.key==='KR')).backgroundColor,'#111827');
    const more=s.mountFile('src/components/common/MoreButton.tsx',{label:'more',onPress(){}});
    assert.equal(flat({props:{style:more.tree.props.style({pressed:false})}}).backgroundColor,'#F7F8FC');s.dispose();
  }
});

test('home Skeleton color changes preserve the shared pulse; banner fallback retains cache/error state',async()=>{
  const s=await app(),skeleton=s.load(home('HomePopupSkeleton'));
  const rows=s.mount(()=>skeleton.HomeTrendingSkeleton()),row=s.mount(()=>{const n=rows.tree.props.children[0];return n.type(n.props);});
  const block=s.mountChild(row,'SkeletonBlock');assert.equal(flat(block.tree).backgroundColor,'#F1F3F5');
  const pulse=s.pulse();await s.mode('dark');assert.equal(flat(block.tree).backgroundColor,'#303030');assert.deepEqual(s.pulse(),pulse);
  const defaultBlock=s.mountFile('src/components/common/SkeletonBlock.tsx',{width:20,height:20});assert.equal(flat(defaultBlock.tree).backgroundColor,'#F1F3F5');
  const banner=s.mountFile(home('HomeBanner'),{onPressPopup(){}});await s.settle();const pages=s.mount(()=>banner.tree.type(banner.tree.props)),bg=s.mountChild(pages,'BannerBackground');
  assert.equal(flat(bg.tree).backgroundColor,'#242424');const image=nodes(bg.tree).find(n=>n.type==='ExpoImage');assert.equal(image.props.source.cacheKey,'original-cache');
  image.props.onError();assert.equal(nodes(bg.tree).some(n=>n.type==='ExpoImage'),false);
  await s.mode('light');assert.equal(flat(bg.tree).backgroundColor,'#252525');assert.equal(nodes(bg.tree).some(n=>n.type==='ExpoImage'),false);
  s.dispose();assert.equal(s.pulse().stops,1);
});

test('disabled actual Compiler home remains light with dark preference/OS, no new requests or remount',async()=>{
  const s=await app(undefined,false),screen=s.mountFile('src/screens/HomeScreen.tsx'),trending=s.mountChild(screen,'HomeTrendingSection'),fresh=s.mountChild(screen,'HomeNewPopupSection');
  await s.settle();const calls=s.calls.slice(),slots=screen.slots,scroll=()=>nodes(fresh.tree).find(n=>n.type==='ScrollView'),key=scroll().key;
  for(const mode of ['dark','light','system']) {
    await s.mode(mode);s.os('dark');assert.equal(s.theme.getSnapshot().resolvedTheme,'light');
    assert.equal(flat(screen.tree).backgroundColor,'#FFFFFF');assert.equal(child(trending.tree,'FilterChips').props.themeColors.filterSelectedBg,'#111827');
    await s.language.setLanguagePreference('ja');await s.language.setLanguagePreference('ko');
    assert.equal(s.theme.getSnapshot().themePreference,mode);assert.equal(screen.slots,slots);assert.equal(scroll().key,key);assert.deepEqual(s.calls,calls);
  }
  s.dispose();
});
