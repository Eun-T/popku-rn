const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { runtime,nodes,texts,flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const regions = [
  { id:1,name:'성수',countryCode:'KR' }, { id:4,name:'홍대·신촌',countryCode:'KR' },
  { id:15,name:'도쿄',countryCode:'JP' }, { id:16,name:'오사카',countryCode:'JP' },
];
const tags = [{ id:1,name:'캐릭터/IP' },{ id:2,name:'게임/디지털' },{ id:5,name:'뷰티' }];
const popup = Object.freeze({ publicId:'original-public-id',name:'서버 원문 행사명',countryCode:'KR',
  regionId:1,regionName:'성수',tags:Object.freeze([Object.freeze(tags[2])]),coverImageUrl:'https://original-image',
  startDate:'2026-10-08',endDate:'2026-10-11' });
const child = (tree,name) => nodes(tree).find(n => n.type?.name === name);
const input = tree => nodes(tree).find(n=>n.type==='TextInput');
const tab = (screen,key) => nodes(screen.tree).find(n=>n.type==='Pressable' && n.props.accessibilityRole==='tab' && n.key===key);
const button = (tree,label) => nodes(tree).find(n=>n.type==='Pressable' && (texts(n)===label || n.props.accessibilityLabel===label));
const groups = tree => nodes(tree).filter(n=>n.type?.name==='FilterChipGroup');

async function app({ fail=false,favoritesError=false,renamedMetadata=false,transform }={}) {
  const calls=[],opened=[],favoriteToggles=[],favoriteRetries=[];
  const animation = () => ({ start(cb) { cb?.({finished:true}); },stop(){} });
  const native = { View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',FlatList:'FlatList',ScrollView:'ScrollView',Image:'Image',Modal:'Modal',
    StyleSheet:{ create:s=>s,absoluteFill:{ position:'absolute' } },useWindowDimensions:()=>({ width:390,height:844,fontScale:1 }),
    Animated:{ Value:class { setValue(){} },View:'AnimatedView',timing:animation,spring:animation,parallel:animation },
    PanResponder:{ create:()=>({ panHandlers:{} }) } };
  const icons = Object.fromEntries(['Search','X','Bell','ChevronDown','ChevronUp','ChevronLeft','ChevronRight','RotateCcw','Heart','Store'].map(n=>[n,n]));
  const ui=runtime({
    'react-native':native,'expo-image':{ Image:'ExpoImage' },'lucide-react-native':icons,'@expo/vector-icons':{ Ionicons:'Ionicons' },
    'expo-router':{ useScrollToTop(){},useLocalSearchParams:()=>({}),useFocusEffect(){} },
    'expo-blur':{ BlurTargetView:'BlurTargetView',BlurView:'BlurView' },
    'react-native-svg':{ __esModule:true,default:'Svg',Defs:'Defs',LinearGradient:'LinearGradient',Rect:'Rect',Stop:'Stop' },
    'react-native-safe-area-context':{ SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({ top:0,bottom:0,left:0,right:0 }) },
    'src/components/navigation/FloatingTabBar.tsx':{ FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12 },
    'src/constants/api.ts':{ API_BASE_URL:'https://test' },
    'src/hooks/usePopupNavigation.ts':{ usePopupNavigation:()=> id=>opened.push(id) },
    'src/hooks/usePlaceCoverImage.ts':{ usePlaceCoverImage:item=>({ source:{uri:item.coverImageUrl},onError(){},onLoad(){} }) },
    'src/hooks/useHomeMainBanners.ts':{ useHomeMainBanners:()=>({ status:'ready',popups:[popup] }) },
    'src/hooks/usePopupFavorites.ts':{ usePopupFavorites:()=>({ isFavorite:()=>false,isFavoriteDisabled:()=>false,
      toggleFavorite:item=>favoriteToggles.push(item),favoritesStatus:favoritesError?'error':'ready',retryFavorites:async()=>favoriteRetries.push('retry') }) },
    fetch:async url => {
      calls.push(url);
      const path=new URL(url).pathname;
      const data=path==='/api/regions' ? regions.filter(r=>r.countryCode===new URL(url).searchParams.get('countryCode')).map(({id,name})=>({id,name:renamedMetadata?'同じ名前':name}))
        : path==='/api/tags' ? tags.map(t=>renamedMetadata?{...t,name:'同じ名前'}:t) : { popups:[popup],nextCursor:null };
      if (fail && path==='/api/popups') throw new Error('request failed');
      return { ok:true,json:async()=>data };
    },
  },{transform});
  const { languageStore }=ui.load('src/locales/languageStore.ts');
  let systemTags=['ja-JP'];
  await languageStore.initialize({ read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>systemTags });
  const Screen=ui.load('src/screens/PlaceScreen.tsx').default;
  const screen=ui.mount(()=>Screen());
  await flush(); await flush();
  const list=()=>nodes(screen.tree).find(n=>n.type==='FlatList');
  const sheetProps=()=>child(screen.tree,'PlaceFilterSheet').props;
  const sheet=ui.mount(()=>child(screen.tree,'PlaceFilterSheet').type(sheetProps()));
  return { ...ui,languageStore,screen,sheet,sheetProps,list,calls,opened,favoriteToggles,favoriteRetries,
    systemLanguage(tag) { systemTags=[tag];languageStore.refreshSystemLanguage(); },
    async settle() { await flush(); await flush(); ui.renderAll(); },
    async language(value) { await languageStore.setLanguagePreference(value); ui.renderAll(); },
    openFilters() {
      const quick=child(screen.tree,'QuickFilterBar'), applied=child(screen.tree,'AppliedFilterBar');
      (quick??applied).props.onOpenDetails(); ui.renderAll();
    },
    pressGroup(index,id) {
      const group=groups(sheet.tree)[index];
      const tree=group.type(group.props);
      nodes(tree).find(n=>n.type==='Pressable' && n.key===id).props.onPress(); ui.renderAll();
    },
  };
}

test('compiled retained all-list card tags/regions follow ko-ja-ko/system without changing IDs, filters, data or requests',async()=>{
  const file='src/components/place/PopupGridCard.tsx';
  const s=await app({transform:compilerTransform([file,'src/hooks/useTranslation.ts'])});
  tab(s.screen,'전체').props.onPress();await s.settle();s.openFilters();s.pressGroup(0,'KR');s.pressGroup(1,5);
  const draft=s.sheetProps().filters,data=s.list().props.data,calls=s.calls.slice(),original=JSON.stringify(data);
  const card=s.list().props.renderItem({item:data[0]});const root=s.mount(()=>card.type(card.props));
  const slots=root.slots,styles=nodes(root.tree)[0].props.style,image=()=>nodes(root.tree).find(n=>n.type==='ExpoImage').props;
  const initialImage=image();
  const unknown=Object.freeze({...data[0],tags:Object.freeze([Object.freeze({id:999,name:'미등록 원문'})])});
  const fallback=s.mount(()=>card.type({...card.props,item:unknown}));
  for(const language of ['ja','ko','system']){
    await s.languageStore.setLanguagePreference(language);await flush();
    assert.ok(texts(root.tree).includes(language==='ko'?'뷰티':'ビューティー'));
    assert.ok(texts(root.tree).includes(language==='ko'?'성수':'聖水'));
    assert.ok(texts(fallback.tree).includes('미등록 원문'));
    assert.equal(root.slots,slots);assert.deepEqual(nodes(root.tree)[0].props.style,styles);assert.equal(image().cachePolicy,initialImage.cachePolicy);assert.deepEqual(image().source,initialImage.source);
    assert.equal(s.list().props.data,data);assert.equal(JSON.stringify(data),original);assert.deepEqual(s.sheetProps().filters,draft);assert.deepEqual(s.calls,calls);
  }
  s.systemLanguage('ko-KR');await flush();assert.ok(texts(root.tree).includes('뷰티'));assert.ok(texts(root.tree).includes('성수'));assert.deepEqual(s.calls,calls);
  nodes(root.tree)[0].props.onPress();assert.deepEqual(s.opened,[popup.publicId]);
  const favorite=nodes(root.tree).find(n=>n.props.accessibilityState?.selected===false&&n.props.onPress);favorite.props.onPress({stopPropagation(){}});assert.equal(s.favoriteToggles[0],data[0]);
  assert.deepEqual(s.calls,calls);s.dispose();
});

test('actual compiled card translates ongoing/upcoming/ended status and favorite labels while keeping status styles and source content',async()=>{
  const file='src/components/place/PopupGridCard.tsx',s=await app({transform:compilerTransform([file,'src/hooks/useTranslation.ts'])});
  tab(s.screen,'전체').props.onPress();await s.settle();const data=s.list().props.data,calls=s.calls.slice(),card=s.list().props.renderItem({item:data[0]});
  const rows=[['ongoing','2026-10-08','2026-10-11'],['upcoming','2027-01-01','2027-01-02'],['ended','2026-01-01','2026-01-02']].map(([key,startDate,endDate])=>{
    const item=Object.freeze({...data[0],startDate,endDate});return{key,item,root:s.mount(()=>card.type({...card.props,item}))};
  });
  const nativeStyles=rows.map(({root})=>nodes(root.tree).filter(n=>n.type==='Text').map(n=>n.props.style));
  for(const language of ['ja','ko','system']){
    await s.languageStore.setLanguagePreference(language);await flush();
    const {resolvedLanguage}=s.languageStore.getSnapshot(),translate=s.load('src/locales/index.ts').translate;
    for(const {key,item,root}of rows){assert.ok(texts(root.tree).includes(translate(resolvedLanguage,'place.all.card.'+key)));assert.ok(texts(root.tree).includes(item.name));
      assert.ok(nodes(root.tree).some(n=>n.props.accessibilityLabel===translate(resolvedLanguage,'place.all.addFavorite')));}
    assert.deepEqual(rows.map(({root})=>nodes(root.tree).filter(n=>n.type==='Text').map(n=>n.props.style)),nativeStyles);assert.deepEqual(s.calls,calls);assert.equal(s.list().props.data,data);
  }
  s.systemLanguage('ko-KR');await flush();for(const {key,root}of rows)assert.ok(texts(root.tree).includes(s.load('src/locales/index.ts').translate('ko','place.all.card.'+key)));assert.deepEqual(s.calls,calls);s.dispose();
});

test('all keys used by active Place components, static filters and ID labels exist in ko/ja with matching variables', () => {
  const ui=runtime(),ko=ui.load('src/locales/ko.json'),ja=ui.load('src/locales/ja.json');
  const keys=new Set(['place.explore.regions','place.explore.koreanRegionsDescription','place.explore.japaneseRegionsDescription']);
  for (const file of ['src/screens/PlaceScreen.tsx', ...['AppliedFilterBar','PlaceFilterSheet','PlaceInterestSection','PlaceRegionSection','PlaceWeeklySection','PlaceWeeklyPopupList','PopupGridCard','QuickFilterBar','RegionFilterGroup','TodayOpeningCarousel'].map(n=>`src/components/place/${n}.tsx`)]) {
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(n) { if(ts.isStringLiteral(n) && /^(place|home|community)\./.test(n.text)) keys.add(n.text); ts.forEachChild(n,visit); }
    visit(ast);
  }
  const filters=ui.load('src/constants/placeFilters.ts');
  for (const group of [filters.quickFilters,filters.visitPeriodOptions,filters.operationStatusFilters]) group.forEach(o=>keys.add(o.labelKey));
  for (const o of filters.regionFilters.filter(r=>['seongsu','hongdae','yeouido','gangnam','tokyo','osaka','kyoto','nagoya'].includes(r.id))) keys.add(o.labelKey);
  for (const o of filters.interestFilters.filter(r=>['animeCharacter','beauty','game','fashion'].includes(r.id))) keys.add(o.labelKey);
  const labels=ui.load('src/locales/filterLabels.ts');
  labels.regionLabels.forEach(r=>keys.add(`place.filters.regions.${r.key}`)); labels.tagLabels.forEach(t=>keys.add(`place.filters.interests.${t.key}`));
  const lookup=(d,k)=>k.split('.').reduce((v,p)=>v?.[p],d);
  for (const key of keys) {
    const a=lookup(ko,key),b=lookup(ja,key);
    assert.ok(typeof a==='string' && a.trim(),`ko ${key}`); assert.ok(typeof b==='string' && b.trim(),`ja ${key}`);
    assert.deepEqual([...a.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...b.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),key);
  }
  ui.dispose();
});

test('mounted Place/Sheet keep country, multiple region/tag IDs, status and period across ko/ja/system without API calls', async () => {
  const s=await app();
  assert.ok(texts(s.screen.tree).includes('플레이스')); assert.equal(input(s.screen.tree).props.placeholder,'팝업을 검색해보세요');
  tab(s.screen,'전체').props.onPress(); await s.settle(); s.openFilters();
  s.pressGroup(0,'KR');
  s.sheetProps().onToggleRegion(1); s.sheetProps().onToggleRegion(4); s.renderAll();
  // KR-only sheet groups: quick/tag/status, and KR measured RegionFilterGroup.
  s.pressGroup(1,1); s.pressGroup(1,5); s.pressGroup(2,'ONGOING');
  button(s.sheet.tree,'이번 주').props.onPress(); s.renderAll();
  const draft=s.sheetProps();
  assert.deepEqual(draft.filters,{regionIds:[1,4],tagIds:[1,5],status:'ONGOING'}); assert.equal(draft.period,'week');
  const requests=s.calls.slice(); await s.language('ja');
  assert.equal(input(s.screen.tree).props.placeholder,'ポップアップを検索してみよう');
  assert.ok(texts(s.sheet.tree).includes('ジャンル')); assert.ok(texts(s.sheet.tree).includes('開催状況'));
  const regionGroup=child(s.sheet.tree,'RegionFilterGroup');
  assert.deepEqual(regionGroup.props.options.map(o=>[o.id,o.name]),[[1,'聖水'],[4,'弘大・新村']]);
  const tagGroup=groups(s.sheet.tree)[1];
  const chips=nodes(tagGroup.type(tagGroup.props)).filter(n=>n.type==='Pressable');
  assert.deepEqual(chips.filter(n=>n.props.accessibilityState.selected).map(n=>n.key),[1,5]);
  assert.deepEqual(chips.map(n=>texts(n)),['キャラクター・IP','ゲーム・デジタル','ビューティー']);
  assert.deepEqual(s.calls,requests); assert.deepEqual(s.sheetProps().filters,draft.filters);
  s.sheetProps().onApply(); await s.settle();
  const request=s.calls.filter(u=>new URL(u).pathname==='/api/popups').at(-1);
  const query=new URL(request).searchParams;
  assert.equal(query.get('countryCode'),'KR'); assert.equal(query.get('regionIds'),'1,4'); assert.equal(query.get('tagIds'),'1,5');
  assert.equal(query.get('status'),'ONGOING'); assert.equal(query.get('visitPeriod'),'week'); assert.equal(query.get('limit'),'10');
  const applied=child(s.screen.tree,'AppliedFilterBar');
  const bar=s.mount(()=> {
    const current=child(s.screen.tree,'AppliedFilterBar');
    return current ? applied.type(current.props) : null;
  });
  assert.ok(texts(bar.tree).includes('聖水')); assert.ok(texts(bar.tree).includes('ビューティー'));
  const after=s.calls.slice();
  await s.language('ko'); assert.ok(texts(bar.tree).includes('성수')); assert.ok(texts(bar.tree).includes('뷰티'));
  await s.language('system'); assert.ok(texts(bar.tree).includes('聖水')); assert.deepEqual(s.calls,after);
  const current=child(s.screen.tree,'AppliedFilterBar').props;
  assert.deepEqual(current.detailFilters,draft.filters); assert.deepEqual(current.filters.countries,['KR']);
  tab(s.screen,'탐색').props.onPress(); tab(s.screen,'전체').props.onPress(); await s.settle();
  assert.deepEqual(s.calls,after); assert.deepEqual(child(s.screen.tree,'AppliedFilterBar').props.detailFilters,draft.filters);
  const remove=nodes(bar.tree).find(n=>n.props.accessibilityLabel==='ビューティーのフィルターを解除');
  remove.props.onPress(); await s.settle(); assert.deepEqual(child(s.screen.tree,'AppliedFilterBar').props.detailFilters.tagIds,[1]);
  child(s.screen.tree,'AppliedFilterBar').props.onReset(); await s.settle();
  assert.equal(child(s.screen.tree,'AppliedFilterBar'),undefined); assert.equal(new URL(s.calls.filter(u=>new URL(u).pathname==='/api/popups').at(-1)).searchParams.get('regionIds'),null);
  s.dispose();
});

test('Japanese explore tiles select verified region/tag IDs even when metadata names differ', async () => {
  const s=await app({renamedMetadata:true}); await s.language('ja');
  child(s.screen.tree,'PlaceRegionSection').props.onPress({id:'tokyo'}); await s.settle();
  let query=new URL(s.calls.filter(u=>new URL(u).pathname==='/api/popups').at(-1)).searchParams;
  assert.equal(query.get('countryCode'),'JP'); assert.equal(query.get('regionIds'),'15');
  tab(s.screen,'탐색').props.onPress();
  await child(s.screen.tree,'PlaceInterestSection').props.onPressCategory('beauty'); await s.settle();
  query=new URL(s.calls.filter(u=>new URL(u).pathname==='/api/popups').at(-1)).searchParams;
  assert.equal(query.get('countryCode'),'JP'); assert.equal(query.get('tagIds'),'5'); assert.equal(query.get('regionIds'),null);
  s.openFilters(); const draftBefore=s.sheetProps().filters;
  await s.language('ko'); assert.deepEqual(s.sheetProps().filters,draftBefore);
  s.sheetProps().onToggleTag(2); s.sheetProps().onClose(); s.renderAll(); s.openFilters();
  assert.deepEqual(s.sheetProps().filters.tagIds,[5],'cancel preserves applied tags');
  s.sheetProps().onToggleCountry('KR'); s.renderAll(); await s.settle();
  assert.equal(s.sheetProps().country,'KR'); assert.deepEqual(s.sheetProps().filters.regionIds,[]);
  s.dispose();
});

test('home banner and measured region filter change labels while retaining page/ref/style/selected IDs', async () => {
  const s=await app();
  const Banner=s.load('src/components/home/HomeBanner.tsx').default;
  const root=s.mount(()=>Banner({onPressPopup:id=>s.opened.push(id)}));
  const pages=s.mount(()=>root.tree.type(root.tree.props));
  const region=s.mount(()=>s.load('src/components/place/RegionFilterGroup.tsx').default({
    options:regions.filter(r=>r.countryCode==='KR').map(r=>({...r,name:s.load('src/locales/filterLabels.ts').getRegionDisplayName(r)})),
    selected:[4],onToggle:id=>s.opened.push(id),
  }));
  const width=w=>({nativeEvent:{layout:{width:w}}});
  region.tree.props.onLayout(width(300));
  const measurements=nodes(region.tree).filter(n=>n.type==='View' && n.key!==undefined && n.props.onLayout);
  measurements.forEach(n=>n.props.onLayout(width(90)));
  assert.ok(texts(pages.tree).includes('성수')); const style=pages.tree.props.style;
  const before=s.calls.slice(),bannerKey=root.tree.key;
  await s.language('ja');
  assert.ok(texts(pages.tree).includes('聖水')); assert.ok(texts(pages.tree).includes(popup.name));
  assert.deepEqual(pages.tree.props.style,style); assert.equal(root.tree.key,bannerKey); assert.deepEqual(s.calls,before);
  assert.ok(texts(region.tree).includes('聖水')); assert.ok(texts(region.tree).includes('弘大・新村'));
  const selected=nodes(region.tree).find(n=>n.type==='Pressable' && n.props.accessibilityState?.selected);
  assert.equal(selected.key,4); selected.props.onPress();
  nodes(pages.tree).find(n=>n.type==='Pressable').props.onPress(); assert.deepEqual(s.opened,[4,popup.publicId]);
  s.dispose();
});

test('empty/loading/options error states translate immediately without adding UI or changing callbacks', async () => {
  const s=await app(); await s.language('ja');
  const Ending=s.load('src/components/place/TodayOpeningCarousel.tsx').default;
  const empty=s.mount(()=>Ending({items:[],width:358,today:'2026-10-09',loading:false,error:false,onPressPopup(){}}));
  assert.ok(texts(empty.tree).includes('5日以内に終了するポップアップはありません。'));
  tab(s.screen,'전체').props.onPress(); s.openFilters();
  const Sheet=s.load('src/components/place/PlaceFilterSheet.tsx').default;
  const loading=s.mount(()=>Sheet({...s.sheetProps(),visible:true,optionsStatus:'loading'}));
  const error=s.mount(()=>Sheet({...s.sheetProps(),visible:true,optionsStatus:'error'}));
  assert.ok(texts(loading.tree).includes('フィルターを読み込み中です。'));
  assert.ok(texts(error.tree).includes('フィルターを読み込めませんでした。'));
  await s.language('ko'); assert.ok(texts(empty.tree).includes('5일 안에 종료되는 팝업이 없어요.'));
  assert.ok(texts(loading.tree).includes('필터 항목을 불러오는 중이에요.')); assert.ok(texts(error.tree).includes('필터 항목을 불러오지 못했어요.'));
  s.dispose();
});

test('grid and weekly card labels react with identical props; original content, image, dates and callbacks survive', async () => {
  const s=await app(), original=JSON.stringify(popup);
  const Grid=s.load('src/components/place/PopupGridCard.tsx').default;
  const Weekly=s.load('src/components/place/PlaceWeeklyPopupList.tsx').default;
  const props={ item:popup,width:170,isFavorite:false,isFavoriteDisabled:false,onToggleFavorite:()=>s.favoriteToggles.push(popup),onPress:item=>s.opened.push(item.publicId) };
  const grid=s.mount(()=>Grid(props));
  const weekly=s.mount(()=>Weekly({ popups:[popup],onPressPopup:item=>s.opened.push(item.publicId),isFavorite:()=>true,isFavoriteDisabled:()=>false,onToggleFavorite:item=>s.favoriteToggles.push(item) }));
  const koStyle=grid.tree.props.style;
  assert.ok(texts(grid.tree).includes('진행중')); assert.ok(texts(grid.tree).includes('성수')); assert.ok(texts(grid.tree).includes('뷰티'));
  await s.language('ja');
  for (const o of [grid,weekly]) { assert.ok(texts(o.tree).includes('開催中')); assert.ok(texts(o.tree).includes('聖水')); assert.ok(texts(o.tree).includes('ビューティー')); assert.ok(texts(o.tree).includes(popup.name)); }
  assert.deepEqual(grid.tree.props.style,koStyle); assert.equal(nodes(grid.tree).find(n=>n.type==='ExpoImage').props.source.uri,popup.coverImageUrl);
  let stopped=0; grid.tree.props.onPress(); button(grid.tree,'お気に入りに追加').props.onPress({stopPropagation(){stopped++;}});
  nodes(weekly.tree).find(n=>n.type==='Pressable').props.onPress(); button(weekly.tree,'お気に入りを解除').props.onPress({stopPropagation(){stopped++;}});
  assert.equal(stopped,2); assert.deepEqual(s.opened,[popup.publicId,popup.publicId]); assert.deepEqual(s.favoriteToggles,[popup,popup]); assert.equal(JSON.stringify(popup),original);
  // Every status keeps its existing badge style/date calculation while text changes.
  const upcoming=s.mount(()=>Grid({...props,item:{...popup,startDate:'2026-10-10',endDate:'2026-10-20'}}));
  const ended=s.mount(()=>Grid({...props,item:{...popup,startDate:'2026-10-01',endDate:'2026-10-08'}}));
  assert.ok(texts(upcoming.tree).includes('オープン予定')); assert.ok(texts(ended.tree).includes('終了'));
  await s.language('ko'); assert.ok(texts(upcoming.tree).includes('오픈예정')); assert.ok(texts(ended.tree).includes('종료됨'));
  s.dispose();
});

test('ending/weekly/error/retry/search UI translates without changing request policy or carousel identity', async () => {
  const s=await app({fail:true,favoritesError:true});
  const Ending=s.load('src/components/place/TodayOpeningCarousel.tsx').default;
  const ending=s.mount(()=>Ending({items:[popup],width:358,today:'2026-10-11',loading:false,error:false,onPressPopup:p=>s.opened.push(p.publicId)}));
  const card=()=>nodes(ending.tree).find(n=>n.type==='FlatList').props.renderItem({item:popup});
  assert.ok(texts(card()).includes('오늘 종료'));
  const Weekly=s.load('src/components/place/PlaceWeeklySection.tsx').default;
  const weekly=s.mount(()=>Weekly({country:'KR',onPressPopup(){},isFavorite:()=>false,isFavoriteDisabled:()=>false,onToggleFavorite(){}}));
  await s.settle(); tab(s.screen,'전체').props.onPress(); await s.settle();
  const before=s.calls.slice(); const endingRef=nodes(ending.tree).find(n=>n.type==='FlatList').props.ref;
  await s.language('ja');
  assert.ok(texts(s.screen.tree).includes('ポップアップを読み込めませんでした。'));
  assert.ok(texts(s.screen.tree).includes('お気に入りを読み込めませんでした。再試行'));
  assert.ok(texts(weekly.tree).includes('今週の注目は？')); assert.ok(texts(weekly.tree).includes('ポップアップを読み込めませんでした。再試行'));
  assert.ok(texts(ending.tree).includes('まもなく終了')); assert.ok(texts(card()).includes('本日終了'));
  assert.equal(nodes(ending.tree).find(n=>n.type==='FlatList').props.ref,endingRef); assert.deepEqual(s.calls,before);
  button(s.screen.tree,'お気に入りを再読み込み').props.onPress(); assert.equal(s.favoriteRetries.length,1);
  button(s.screen.tree,'再試行').props.onPress(); await s.settle(); assert.equal(s.calls.filter(u=>new URL(u).pathname==='/api/popups').length,before.filter(u=>new URL(u).pathname==='/api/popups').length+1);
  input(s.screen.tree).props.onChangeText('서버'); s.renderAll();
  button(s.screen.tree,'検索キーワードをクリア').props.onPress(); assert.equal(input(s.screen.tree).props.value,'');
  const beforeReentry=s.calls.slice(); const Screen=s.load('src/screens/PlaceScreen.tsx').default;
  const reentered=s.mount(()=>Screen()); assert.equal(input(reentered.tree).props.placeholder,'ポップアップを検索してみよう');
  // Re-entry can fetch; language changes on mounted screens did not.
  assert.ok(s.calls.length>=beforeReentry.length); s.dispose();
});
