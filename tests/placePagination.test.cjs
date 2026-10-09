const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const jsx = (type, props, key) => ({ type, props, key });
function load(file, mocks, globals = {}) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  globals = { __DEV__: false, ...globals };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const theme = load('src/theme/tokens.ts', {});
const filters = load('src/constants/placeFilters.ts', {});
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.ListHeaderComponent), ...nodes(tree.props?.ListFooterComponent)];
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function harness() {
  const slots = []; let cursor=0, dirty=false, tree; const pending=[];
  const react = {
    useState(initial) { const i=cursor++; if (!slots[i]) slots[i]={ value: typeof initial==='function' ? initial() : initial };
      return [slots[i].value, next => { const value=typeof next==='function' ? next(slots[i].value) : next;
        if (!Object.is(value,slots[i].value)) { slots[i].value=value; dirty=true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn,deps) { const i=cursor++, old=slots[i];
      if (!old || !deps.every((value,j)=>Object.is(value,old.deps[j]))) {
        slots[i]={ deps, cleanup: old?.cleanup }; pending.push(()=>{ slots[i].cleanup?.(); slots[i].cleanup=fn(); });
      } },
  };
  return { react, render(Component) { let count=0; do { assert.ok(count++<30); cursor=0; dirty=false; tree=Component(); pending.splice(0).forEach(fn=>fn()); } while(dirty); return tree; },
    unmount() { slots.forEach(slot=>slot?.cleanup?.()); } };
}
function screen(Clock=Date, entry={}) {
  const h=harness(), pages=[], endings=[], details=[];
  const native={ FlatList:'FlatList', Pressable:'Pressable', Text:'Text', TextInput:'TextInput', View:'View',
    StyleSheet:{ create:s=>s }, useWindowDimensions:()=>({ width:390 }) };
  const mocks={ react:h.react, 'react/jsx-runtime':{ jsx,jsxs:jsx }, 'expo-router':{ useScrollToTop(){}, useLocalSearchParams:()=>entry },
    'lucide-react-native':{ Bell:'Bell',Search:'Search',X:'X' }, 'react-native':native,
    'react-native-safe-area-context':{ SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({ top:0,bottom:0,left:0,right:0 }) },
    '../theme/tokens':theme, '../constants/placeFilters':filters, '../constants/placeRegionMocks':{ placeRegionPages:[] },
    '../locales':require('./helpers/uiDependencies.cjs').loadPure('src/locales/index.ts'), '../hooks/usePopupNavigation':{ usePopupNavigation:()=>()=>{} },
    '../hooks/usePopupFavorites':{ usePopupFavorites:()=>({ isFavorite(){},isFavoriteDisabled(){},toggleFavorite(){} }) },
    '../lib/filterOptions':{ getRegions:async()=>[],getTags:async()=>[] },
    '../lib/popups':{ emptyPopupFilters:()=>({ regionIds:[],tagIds:[],status:undefined }),
      getPopupDetail(id,signal) { const d=deferred(); details.push({id,signal,...d}); return d.promise; },
      getPopupPage(country,signal,detail,cursor) { const d=deferred(); pages.push({country,signal,detail,cursor,...d}); return d.promise; },
      getEndingSoonPopups(country,signal) { endings.push({country,signal}); return Promise.resolve([]); } },
    '../components/navigation/FloatingTabBar':{ FLOATING_TAB_BAR_BOTTOM_GAP:12,FLOATING_TAB_BAR_HEIGHT:60 },
  };
  mocks['../lib/placeCoverRecovery']=load('src/lib/placeCoverRecovery.ts',{}, {Date:Clock});
  for(const name of ['AppliedFilterBar','PlaceFilterSheet','PopupGridCard','PopupGridSkeleton','QuickFilterBar','PlaceRegionSection','PlaceInterestSection','PlaceWeeklySection','TodayOpeningCarousel'])
    mocks[`../components/place/${name}`]={default:name};
  const Component=load('src/screens/PlaceScreen.tsx',mocks,{setInterval:()=>1,clearInterval(){},Date:Clock}).default;
  let tree; const render=()=>tree=h.render(Component); const find=type=>nodes(tree).find(n=>n.type===type);
  const tab=name=>{ nodes(tree).find(n=>n.type==='Pressable'&&n.props.children?.props.children===name).props.onPress(); render(); };
  const settle=async()=>{ for(let i=0;i<6;i++){ await Promise.resolve(); render(); } };
  render(); return {pages,endings,details,render,find,tab,settle,setEntry(value){entry=value;render();},unmount:h.unmount};
}
const popup = id => ({publicId:String(id),name:`popup ${id}`,startDate:'2026-10-01',endDate:'2026-10-30'});

test('cover recovery shares in-flight work, attempts once, ignores reset responses and merges only image fields',async()=>{
  const lib=load('src/lib/placeCoverRecovery.ts',{}), calls=[], patches=[];
  const manager=lib.createPlaceCoverRecovery((id,signal)=>{const d=deferred();calls.push({id,signal,...d});return d.promise;},
    (...args)=>patches.push(args));
  const original={...popup(1),coverImageUrl:'old',coverImageCacheKey:'object-a',coverImageFetchedAt:Date.now()-lib.COVER_URL_FRESH_MS};
  const other=popup(2), detail={...popup(1),name:'different detail',coverImageUrl:'new',coverImageCacheKey:'object-b'};
  assert.equal(lib.isCoverUrlStale(original,original.coverImageFetchedAt+lib.COVER_URL_FRESH_MS-1),false);
  assert.equal(lib.isCoverUrlStale(original,original.coverImageFetchedAt+lib.COVER_URL_FRESH_MS),true);
  assert.equal(await manager.recover({...original,coverImageFetchedAt:Date.now()}),null);
  const first=manager.recover(original), duplicate=manager.recover(original);assert.equal(first,duplicate);
  assert.equal(await manager.recover({...original,coverImageCacheKey:'different-pending-revision'}),null);
  await Promise.resolve();assert.equal(calls.length,1);calls[0].resolve(detail);await first;
  assert.equal(patches.length,1);assert.equal(await manager.recover(original),null);assert.equal(calls.length,1);
  const merged=lib.mergeRecoveredCover([original,other],original,detail,123);
  assert.equal(merged[1],other);assert.equal(merged[0].name,original.name);
  assert.equal(merged[0].coverImageUrl,'new');assert.equal(merged[0].coverImageCacheKey,'object-b');assert.equal(merged[0].coverImageFetchedAt,123);
  assert.equal(lib.mergeRecoveredCover(merged,original,detail,456)[0],merged[0]);
  manager.reset();const stale=manager.recover(original);await Promise.resolve();manager.reset();
  assert.equal(calls[1].signal.aborted,true);calls[1].resolve(detail);assert.equal(await stale,null);assert.equal(patches.length,1);
  const failure=manager.recover(original);await Promise.resolve();calls[2].reject(new Error('offline'));await failure;
  assert.equal(await manager.recover(original),null);assert.equal(calls.length,3);
});

function coverHook({stale=true,path=null}={}) {
  const h=harness(), cacheCalls=[], requests=[];let now=Date.now();
  class Clock extends Date {static now(){return now;}}
  const lib=load('src/lib/placeCoverRecovery.ts',{}, {Date:Clock});
  const manager=lib.createPlaceCoverRecovery((id,signal)=>{const d=deferred();requests.push({id,signal,...d});return d.promise;},()=>{});
  const hook=load('src/hooks/usePlaceCoverImage.ts',{
    react:h.react,'expo-image':{Image:{getCachePathAsync:key=>{cacheCalls.push(key);return Promise.resolve(path);}}},
    '../lib/placeCoverRecovery':lib,
  }).usePlaceCoverImage;
  let item={...popup(1),coverImageUrl:'signed-old',coverImageCacheKey:'stable-a',coverImageFetchedAt:now-(stale?lib.COVER_URL_FRESH_MS:0)}, result;
  const render=()=>result=h.render(()=>hook(item,value=>manager.recover(value)));
  const settle=async()=>{for(let i=0;i<8;i++){await Promise.resolve();render();}};
  render();return{cacheCalls,requests,render,settle,get result(){return result;},advance:()=>{now+=lib.COVER_URL_FRESH_MS;},
    replace(next){item={...item,...next};render();},unmount(){h.unmount();manager.reset();}};
}

test('stale disk cache hit uses the cached file without an API refresh or repeated render probes',async()=>{
  const c=coverHook({path:'/cache/cover.jpg'});await c.settle();
  assert.deepEqual(c.result.source,{uri:'file:///cache/cover.jpg',cacheKey:'stable-a'});
  assert.equal(c.requests.length,0);assert.deepEqual(c.cacheCalls,['stable-a']);
  c.render();c.render();assert.equal(c.cacheCalls.length,1);c.unmount();
});

test('a successfully displayed cover stays visible when its URL becomes stale during an unrelated render',async()=>{
  const c=coverHook({stale:false});await c.settle();c.result.onLoad();c.advance();c.render();await c.settle();
  assert.deepEqual(c.result.source,{uri:'signed-old',cacheKey:'stable-a'});
  assert.equal(c.cacheCalls.length,0);assert.equal(c.requests.length,0);c.unmount();
});

test('fresh cover downloads its original URL; stale miss recovers only once and ignores error text',async()=>{
  const fresh=coverHook({stale:false});await fresh.settle();
  assert.deepEqual(fresh.result.source,{uri:'signed-old',cacheKey:'stable-a'});
  fresh.result.onError({error:'403'});await fresh.settle();assert.equal(fresh.requests.length,0);assert.equal(fresh.cacheCalls.length,0);
  fresh.advance();fresh.result.onError({error:'unknown native error'});fresh.result.onError();await fresh.settle();
  assert.equal(fresh.requests.length,1);
  fresh.requests[0].resolve({...popup(1),coverImageUrl:'signed-new',coverImageCacheKey:'stable-a'});await fresh.settle();
  assert.deepEqual(fresh.result.source,{uri:'signed-new',cacheKey:'stable-a'});
  fresh.result.onError();await fresh.settle();assert.equal(fresh.requests.length,1);fresh.unmount();
  const stale=coverHook();await stale.settle();assert.equal(stale.requests.length,1);assert.equal(stale.result.source,null);
  stale.requests[0].resolve({...popup(1),coverImageUrl:'fresh-miss',coverImageCacheKey:'stable-a'});await stale.settle();
  assert.equal(stale.result.source.uri,'fresh-miss');stale.unmount();
});

test('a previous cover check cannot replace a new object source',async()=>{
  const c=coverHook();await c.settle();assert.equal(c.requests.length,1);
  c.replace({coverImageUrl:'replacement',coverImageCacheKey:'stable-b',coverImageFetchedAt:Date.now()});
  c.requests[0].resolve({...popup(1),coverImageUrl:'late-old',coverImageCacheKey:'stable-a'});await c.settle();
  assert.deepEqual(c.result.source,{uri:'replacement',cacheKey:'stable-b'});c.unmount();
});

test('Place cover recovery preserves page timestamps, cursor, order, scroll and active load-more state',async()=>{
  let now=Date.now();class Clock extends Date {static now(){return now;}}
  const s=screen(Clock);s.tab('전체');
  s.pages[0].resolve({popups:[{...popup(1),coverImageUrl:'old',coverImageCacheKey:'a'}],nextCursor:'page2'});await s.settle();
  const list=()=>s.find('FlatList');const first=list().props.data[0];
  const scrollCalls=[];const retainedRef=list().props.ref;
  retainedRef.current={scrollToOffset:options=>scrollCalls.push(options)};
  now+=4*60*1000;list().props.onEndReached();
  s.pages[1].resolve({popups:[{...popup(2),coverImageUrl:'page2-image',coverImageCacheKey:'b'}],nextCursor:'page3'});await s.settle();
  assert.equal(list().props.data[0].coverImageFetchedAt,first.coverImageFetchedAt);
  assert.equal(list().props.data[1].coverImageFetchedAt,now);
  list().props.onEndReached();assert.equal(s.pages[2].cursor,'page3');
  const card=list().props.renderItem({item:first});const recovery=card.props.onRecoverCover(first);
  card.props.onRecoverCover(first);await Promise.resolve();assert.equal(s.details.length,1);
  s.details[0].resolve({...popup(1),name:'not merged',coverImageUrl:'new',coverImageCacheKey:'a'});await recovery;await s.settle();
  assert.equal(list().props.data[0].coverImageUrl,'new');assert.equal(list().props.data[0].name,first.name);
  assert.equal(s.pages.length,3);assert.equal(s.pages[1].cursor,'page2');
  assert.deepEqual(list().props.data.map(p=>p.publicId),['1','2']);
  assert.equal(list().props.data[0].coverImageFetchedAt,now);assert.equal(list().props.data[1].coverImageFetchedAt,now);
  assert.equal(list().props.ref,retainedRef);assert.deepEqual(scrollCalls,[]);
  list().props.onEndReached();assert.equal(s.pages.length,3);
  s.unmount();
});

test('취향 local 이미지는 expo-image 캐시를 사용하고 기존 카드 선택을 유지한다',()=>{
  const assets=[
    '../../../assets/images/categories/anime-character.webp',
    '../../../assets/images/categories/beauty.webp',
    '../../../assets/images/categories/game-digital.webp',
    '../../../assets/images/categories/fashion.webp',
  ];
  const mocks={
    'expo-image':{Image:'ExpoImage'},
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' },
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{Pressable:'Pressable',StyleSheet:{create:s=>s},Text:'Text',View:'View'},
    '../../constants/placeFilters':filters,'../../locales':{t:key=>key},'../../theme/tokens':theme,
  };
  assets.forEach((path,index)=>{mocks[path]=index+1;});
  const Interest=load('src/components/place/PlaceInterestSection.tsx',mocks).default;
  const pressed=[];const tree=Interest({onPressCategory:id=>pressed.push(id)});
  const images=nodes(tree).filter(n=>n.type==='ExpoImage');assert.equal(images.length,4);
  images.forEach((image,index)=>{
    assert.equal(image.props.source,mocks[assets[index]]);
    assert.equal(image.props.cachePolicy,'memory-disk');assert.equal(image.props.contentFit,'cover');
    assert.equal(image.props.transition,undefined);assert.equal(image.props.fadeDuration,undefined);
    assert.equal(image.props.cacheKey,undefined);
    assert.deepEqual(image.props.style,{position:'absolute',top:0,left:0,width:'100%',height:'100%'});
  });
  nodes(tree).filter(n=>n.type==='Pressable').forEach(card=>{
    assert.equal(card.props.style.height,70);assert.equal(card.props.style.width,'100%');
    card.props.onPress();
  });
  assert.deepEqual(pressed,['animeCharacter','beauty','game','fashion']);
});
test('explore makes no general list request; first all entry paginates and tab switches preserve rows/cursor',async()=>{
  const s=screen(); await s.settle(); assert.equal(s.pages.length,0); assert.equal(s.endings.length,1);
  assert.ok(s.find('PlaceWeeklySection')); assert.equal(s.find('PlaceWeeklySection').props.popups,undefined);
  s.tab('전체'); assert.equal(s.pages.length,1); assert.equal(s.pages[0].cursor,null);
  s.pages[0].resolve({popups:Array.from({length:10},(_,i)=>popup(i)),nextCursor:'next'}); await s.settle();
  assert.equal(s.find('FlatList').props.data.length,10);
  s.tab('탐색'); s.tab('전체'); assert.equal(s.pages.length,1);
  s.find('FlatList').props.onEndReached(); s.find('FlatList').props.onEndReached(); assert.equal(s.pages.length,2);
  assert.equal(s.pages[1].cursor,'next'); assert.deepEqual(s.pages[1].detail,s.pages[0].detail);
  s.pages[1].resolve({popups:[popup(9),popup(10)],nextCursor:null}); await s.settle();
  assert.equal(s.find('FlatList').props.data.length,11);
  s.find('FlatList').props.onEndReached(); assert.equal(s.pages.length,2); s.unmount();
});
test('filter reset aborts stale reads; Sheet draft is inert and applying combines filters',async()=>{
  const s=screen(); s.tab('전체'); const old=s.pages[0];
  s.find('QuickFilterBar').props.onOpenDetails(); s.render();
  s.find('PlaceFilterSheet').props.onToggleTag(3); s.find('PlaceFilterSheet').props.onPeriodChange('week'); s.render();
  assert.equal(s.pages.length,1);
  s.find('PlaceFilterSheet').props.onApply(); s.render(); assert.equal(s.pages.length,2); assert.equal(old.signal.aborted,true);
  assert.equal(s.pages[1].cursor,null); assert.deepEqual(s.pages[1].detail.tagIds,[3]); assert.equal(s.pages[1].detail.visitPeriod,'week');
  old.resolve({popups:[popup('stale')],nextCursor:'stale'}); await s.settle(); assert.equal(s.find('FlatList').props.data.length,0);
  s.pages[1].resolve({popups:[popup('fresh')],nextCursor:'fresh'}); await s.settle();
  assert.equal(s.find('FlatList').props.data[0].publicId,'fresh');
  s.find('FlatList').props.onEndReached(); const staleNext=s.pages[2];
  s.find('AppliedFilterBar').props.onReset(); s.render(); assert.equal(staleNext.signal.aborted,true);
  assert.equal(s.pages[3].cursor,null); assert.equal(s.pages[3].detail.status,undefined);
  staleNext.resolve({popups:[popup('old-next')],nextCursor:null});
  s.pages[3].resolve({popups:[popup('reset')],nextCursor:null}); await s.settle();
  assert.deepEqual(s.find('FlatList').props.data.map(p=>p.publicId),['reset']); s.unmount();
});
test('rapid tab switching does not cancel or duplicate an active first page',async()=>{
  const s=screen(); s.tab('전체'); s.tab('탐색'); s.tab('전체'); assert.equal(s.pages.length,1); assert.equal(s.pages[0].signal.aborted,false);
  s.pages[0].resolve({popups:[popup(1)],nextCursor:null}); await s.settle(); assert.equal(s.find('FlatList').props.data.length,1); s.unmount();
});
test('탭 전환은 Explore의 동일한 자식 위치를 유지하고 숨겨진 레이아웃과 터치를 제외한다', async()=>{
  const s=screen(); await s.settle();
  function explore() {
    return nodes(s.find('FlatList').props.ListHeaderComponent).find(n=>n.type==='View'
      && Array.isArray(n.props.children) && n.props.children.some(child=>child?.type==='PlaceRegionSection'));
  }
  const children=view=>view.props.children.map(child=>child.type);
  const first=explore(), types=children(first), regionPages=s.find('PlaceRegionSection').props.pages;
  assert.equal(first.props.pointerEvents,'auto');
  assert.equal(s.find('PlaceRegionSection').props.isActive,true);
  assert.equal(s.find('PlaceWeeklySection').props.isActive,true);
  s.tab('전체');
  const hidden=explore(); assert.deepEqual(children(hidden),types);
  assert.equal(hidden.props.style.display,'none'); assert.equal(hidden.props.pointerEvents,'none');
  assert.equal(hidden.props.accessibilityElementsHidden,true);
  assert.equal(hidden.props.importantForAccessibility,'no-hide-descendants');
  assert.equal(s.find('PlaceRegionSection').props.pages,regionPages);
  assert.equal(s.find('PlaceRegionSection').props.isActive,false);
  assert.equal(s.find('PlaceWeeklySection').props.isActive,false);
  s.tab('탐색'); assert.deepEqual(children(explore()),types); assert.equal(explore().props.pointerEvents,'auto');
  assert.equal(s.find('PlaceRegionSection').props.isActive,true);
  assert.equal(s.find('PlaceRegionSection').props.pages,regionPages); s.unmount();
});
test('유지된 지역 캐러셀은 페이지 state와 local asset source를 보존하고 숨김의 0 너비를 무시한다',()=>{
  const h=harness();
  const Region=load('src/components/place/PlaceRegionSection.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'expo-image':{Image:'ExpoImage'},
    'react-native':{FlatList:'FlatList',Pressable:'Pressable',StyleSheet:{create:s=>s},Text:'Text',View:'View'},
    '../../constants/placeFilters':{regionFilters:[{id:'seongsu',labelKey:'seongsu'}]},
    '../../constants/placeRegionMocks':{placeRegionSectionTitleKey:'regions'},
    '../../locales':{t:key=>key},'../../theme/tokens':theme,
  }).default;
  const pages=[{id:'KR',descriptionKey:'KR',items:[{id:'seongsu',image:123}]},
    {id:'JP',descriptionKey:'JP',items:[{id:'tokyo',image:456}]}];
  let tree, isActive=true;const offsets=[];
  const render=()=>tree=h.render(()=>Region({pages,width:358,onPress(){},isActive}));
  const list=()=>nodes(tree).find(n=>n.type==='FlatList');
  const selectedPage=()=>nodes(tree).filter(n=>n.props?.accessibilityState).findIndex(n=>n.props.accessibilityState.selected);
  render(); const initialList=list(), listRef=initialList.props.ref;
  listRef.current={scrollToOffset:options=>offsets.push(options)};
  assert.equal(initialList.key,undefined);assert.equal(initialList.props.initialScrollIndex,undefined);
  assert.equal(initialList.props.initialNumToRender,pages.length);assert.equal(initialList.props.removeClippedSubviews,false);
  list().props.onScrollBeginDrag();list().props.onScroll({nativeEvent:{contentOffset:{x:374}}});render();assert.equal(selectedPage(),1);
  const source=nodes(list().props.renderItem({item:pages[1]})).find(n=>n.type==='ExpoImage').props.source;
  for(let i=0;i<4;i++) {
    isActive=false;render();
    nodes(tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:0}}});
    list().props.onScroll({nativeEvent:{contentOffset:{x:0}}});
    list().props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:0}}});render();
    assert.equal(selectedPage(),1);assert.equal(list().props.style.width,358);
    isActive=true;render();
    assert.deepEqual(offsets.at(-1),{offset:374,animated:false});
    list().props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:0}}});render();assert.equal(selectedPage(),1);
    list().props.onScroll({nativeEvent:{contentOffset:{x:374}}});render();
    assert.equal(list().key,initialList.key);assert.equal(list().props.ref,listRef);
  }
  nodes(tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:357.5}}});render();
  assert.equal(list().key,initialList.key);assert.equal(list().props.ref,listRef);
  assert.equal(list().props.style.width,357.5);assert.deepEqual(offsets.at(-1),{offset:373.5,animated:false});
  assert.equal(selectedPage(),1);
  assert.equal(nodes(list().props.renderItem({item:pages[1]})).find(n=>n.type==='ExpoImage').props.source,source);
  for(const page of pages) {
    const images=nodes(list().props.renderItem({item:page})).filter(n=>n.type==='ExpoImage');
    assert.equal(images.length,page.items.length);
    images.forEach((image,index)=>{
      assert.equal(image.props.source,page.items[index].image);
      assert.equal(image.props.contentFit,'cover');assert.equal(image.props.cachePolicy,'memory-disk');
      assert.equal(image.props.transition,undefined);assert.equal(image.props.fadeDuration,undefined);
      assert.equal(image.props.cacheKey,undefined);assert.equal(image.props.resizeMode,undefined);
    });
  }
  h.unmount();
});
test('failed next page keeps existing rows and cursor until explicit retry succeeds',async()=>{
  const s=screen(); s.tab('전체');
  s.pages[0].resolve({popups:[popup(1)],nextCursor:'next'}); await s.settle();
  s.find('FlatList').props.onEndReached(); s.pages[1].reject(new Error('offline')); await s.settle();
  assert.deepEqual(s.find('FlatList').props.data.map(p=>p.publicId),['1']);
  s.find('FlatList').props.onEndReached(); assert.equal(s.pages.length,2);
  s.find('FlatList').props.ListFooterComponent.props.onPress(); assert.equal(s.pages.length,3); assert.equal(s.pages[2].cursor,'next');
  s.pages[2].resolve({popups:[popup(2)],nextCursor:null}); await s.settle();
  assert.deepEqual(s.find('FlatList').props.data.map(p=>p.publicId),['1','2']); s.unmount();
});
test('pagination and weekly parameters stay unchanged; Home explicitly requests eight',async()=>{
  const calls=[]; const api=load('src/lib/popups.ts',{'../constants/api':{API_BASE_URL:'https://test'},'../locales':{getLocale:()=> 'ko'}},
    {fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>({popups:[],nextCursor:null})};}});
  const signal=new AbortController().signal;
  await api.getPopupPage('JP',signal,{regionIds:[1,2],tagIds:[3],status:'ENDED',visitPeriod:'weekend'},'date|id');
  const url=new URL(calls[0]); assert.equal(url.searchParams.get('limit'),'10'); assert.equal(url.searchParams.get('cursor'),'date|id');
  assert.equal(url.searchParams.get('status'),'ENDED'); assert.equal(url.searchParams.get('regionIds'),'1,2'); assert.equal(url.searchParams.get('visitPeriod'),'weekend');
  await api.getWeeklyPopups('KR','2026-10-05','2026-10-11',signal);
  assert.equal(calls[1],'https://test/api/popups?weekStart=2026-10-05&weekEnd=2026-10-11&countryCode=KR');
  await api.getNewPopups('KR',signal); assert.equal(new URL(calls[2]).searchParams.get('limit'),'8'); assert.equal(new URL(calls[2]).searchParams.get('homeNew'),'true');
});
test('weekly section requests current local week and each selected week; obsolete response is ignored',async()=>{
  const h=harness(),requests=[];
  const Animated={Value:class{setValue(){}},View:'AnimatedView',timing:()=>({start:fn=>fn({finished:true})})};
  const Component=load('src/components/place/PlaceWeeklySection.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react-native':{ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'},
    'react-native':{Animated,FlatList:'FlatList',PanResponder:{create:()=>({panHandlers:{}})},Pressable:'Pressable',StyleSheet:{create:s=>s},Text:'Text',View:'View'},
    '../../theme/tokens':theme,'../../lib/popups':{getWeeklyPopups(country,start,end,signal){const d=deferred(); requests.push({country,start,end,signal,...d});return d.promise;}},
    './PlaceWeeklyPopupList':{default:'WeeklyList'},
  }).default;
  const props={country:undefined,onPressPopup(){},isFavorite(){},isFavoriteDisabled(){},onToggleFavorite(){}};
  let tree; const render=()=>tree=h.render(()=>Component(props)); const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}};
  render(); const now=new Date(); const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12); monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const date=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  assert.equal(requests.length,1); assert.equal(requests[0].start,date(monday));
  nodes(tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:300}}}); render();
  nodes(tree).find(n=>n.type==='Pressable' && n.key===1).props.onPress(); render();
  assert.equal(requests.length,2); assert.equal(requests[0].signal.aborted,true);
  monday.setDate(monday.getDate()+7); assert.equal(requests[1].start,date(monday));
  requests[0].resolve([popup('stale')]); requests[1].resolve([popup('fresh')]); await settle();
  nodes(tree).filter(n=>n.props?.onLayout)[2].props.onLayout({nativeEvent:{layout:{width:300}}}); render();
  const pager = nodes(tree).find(n=>n.type==='FlatList');
  assert.deepEqual(nodes(pager.props.renderItem({item:pager.props.data[0]})).find(n=>n.type==='WeeklyList').props.popups.map(p=>p.publicId),['fresh']);
  nodes(tree).find(n=>n.type==='Pressable' && n.key===-1).props.onPress(); render(); assert.equal(requests.length,3);
  assert.equal(requests[2].start,requests[0].start); h.unmount();
});

function weekly() {
  const h=harness(), requests=[];
  let now=Date.now();
  class Clock extends Date { static now() { return now; } }
  const Animated={Value:class{setValue(){}},View:'AnimatedView',timing:()=>({start:fn=>fn({finished:true})})};
  const Component=load('src/components/place/PlaceWeeklySection.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react-native':{ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'},
    'react-native':{Animated,FlatList:'FlatList',PanResponder:{create:()=>({panHandlers:{}})},Pressable:'Pressable',StyleSheet:{create:s=>s},Text:'Text',View:'View'},
    '../../theme/tokens':theme,'../../lib/popups':{getWeeklyPopups(country,start,end,signal){const d=deferred();requests.push({country,start,end,signal,...d});return d.promise;}},
    './PlaceWeeklyPopupList':{default:'WeeklyList'},
  },{Date:Clock}).default;
  const props={country:undefined,isActive:true,onPressPopup(){},isFavorite(){},isFavoriteDisabled(){},onToggleFavorite(){}};
  let tree;
  const scrollEvents=[];
  const render=()=>{
    tree=h.render(()=>Component(props));
    const carousel=nodes(tree).filter(n=>n.props?.onLayout)[2];
    if(carousel){carousel.props.onLayout({nativeEvent:{layout:{width:300}}});tree=h.render(()=>Component(props));}
    const pager=nodes(tree).find(n=>n.type==='FlatList');
    if(pager){
      pager.props.ref.current={scrollToOffset(options){scrollEvents.push({key:pager.key,...options});}};
      for(const event of scrollEvents.splice(0)){
        if(event.key===pager.key)pager.props.onScroll({nativeEvent:{contentOffset:{x:event.offset}}});
      }
      tree=h.render(()=>Component(props));
    }else scrollEvents.length=0;
    return tree;
  };
  const find=type=>{
    if(type!=='WeeklyList')return nodes(tree).find(n=>n.type===type);
    const pager=nodes(tree).find(n=>n.type==='FlatList');
    if(!pager||pager.props.data.length===0)return undefined;
    const selected=nodes(tree).find(n=>n.props?.accessibilityLabel?.startsWith('주간 팝업 ')&&n.props.accessibilityState.selected);
    const index=selected?.key??0;
    return nodes(pager.props.renderItem({item:pager.props.data[index],index})).find(n=>n.type===type);
  };
  const label=text=>text==='다음 주'||text==='이전 주'
    ? nodes(tree).find(n=>n.type==='Pressable'&&n.key===(text==='다음 주'?1:-1))
    : nodes(tree).find(n=>n.props?.accessibilityLabel===text);
  const settle=async()=>{for(let i=0;i<6;i++){await Promise.resolve();render();}};
  const move=direction=>{label(direction>0?'다음 주':'이전 주').props.onPress();render();};
  const content=()=>nodes(tree).filter(n=>n.props?.onLayout)[1];
  render(); nodes(tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:300}}});render();
  return {requests,props,render,find,label,settle,move,content,advance:ms=>{now+=ms;},unmount:h.unmount};
}

test('Weekly는 최대 9개를 3개씩 페이지로 표시하고 페이지 이동은 API를 호출하지 않는다',async()=>{
  const s=weekly(); s.requests[0].resolve(Array.from({length:12},(_,i)=>popup(i+1))); await s.settle();
  const ids=()=>s.find('WeeklyList').props.popups.map(p=>p.publicId);
  assert.deepEqual(ids(),['1','2','3']); assert.ok(s.label('주간 팝업 3페이지')); assert.equal(s.label('주간 팝업 4페이지'),undefined);
  s.label('주간 팝업 2페이지').props.onPress();s.render();assert.deepEqual(ids(),['4','5','6']);
  s.label('주간 팝업 3페이지').props.onPress();s.render();assert.deepEqual(ids(),['7','8','9']);assert.equal(s.requests.length,1);
  s.props.isActive=false;s.render();s.props.isActive=true;s.render();
  assert.deepEqual(ids(),['7','8','9']);assert.equal(s.requests.length,1);s.unmount();
});

test('Weekly fresh 주는 즉시 재사용하고 빈 결과도 캐시하며 주 변경은 첫 페이지로 복귀한다',async()=>{
  const s=weekly();s.requests[0].resolve(Array.from({length:9},(_,i)=>popup(i+1)));await s.settle();
  s.label('주간 팝업 2페이지').props.onPress();s.render();s.move(1);
  s.requests[1].resolve([]);await s.settle();assert.deepEqual(s.find('FlatList').props.data,[]);
  s.move(-1);assert.equal(s.requests.length,2);assert.deepEqual(s.find('WeeklyList').props.popups.map(p=>p.publicId),['1','2','3']);
  s.move(1);assert.equal(s.requests.length,2);assert.deepEqual(s.find('FlatList').props.data,[]);s.unmount();
});

test('Weekly는 4분 경계에서 재조회하고 요청 지연을 freshness에 더하지 않으며 국가별 캐시를 분리한다',async()=>{
  const s=weekly();s.advance(30_000);s.requests[0].resolve([popup('old')]);await s.settle();
  s.move(1);s.requests[1].resolve([]);await s.settle();
  s.advance(210_000);s.move(-1);assert.equal(s.requests.length,3);assert.equal(s.find('WeeklyList'),undefined);
  s.requests[2].resolve([popup('new')]);await s.settle();
  s.props.country='KR';s.render();assert.equal(s.requests.length,4);assert.equal(s.requests[3].country,'KR');
  s.requests[3].resolve([popup('kr')]);await s.settle();
  s.props.country=undefined;s.render();assert.equal(s.requests.length,4);assert.equal(s.find('WeeklyList').props.popups[0].publicId,'new');s.unmount();
});

test('탭을 숨겼다 돌아와도 선택 주는 유지하고 stale 캐시만 새로 요청한다',async()=>{
  const s=weekly();s.requests[0].resolve([]);await s.settle();s.move(1);
  s.requests[1].resolve([popup('next')]);await s.settle();const week=s.requests[1].start;
  s.props.isActive=false;s.render();s.advance(240_000);assert.equal(s.requests.length,2);
  s.props.isActive=true;s.render();assert.equal(s.requests.length,3);assert.equal(s.requests[2].start,week);
  s.requests[2].resolve([popup('refreshed')]);await s.settle();s.unmount();
});

test('Weekly loading과 실패는 직전 3개 페이지 높이를 유지하고 짧은 응답 후에는 실제 높이를 허용한다',async()=>{
  const s=weekly();assert.equal(s.content().props.style.minHeight,276);
  s.requests[0].resolve(Array.from({length:9},(_,i)=>popup(i)));await s.settle();
  s.content().props.onLayout({nativeEvent:{layout:{height:408}}});s.move(1);
  assert.equal(s.content().props.style.minHeight,408);assert.equal(s.find('WeeklyList'),undefined);
  s.requests[1].reject(new Error('offline'));await s.settle();assert.equal(s.content().props.style.minHeight,408);
  s.move(1);assert.equal(s.content().props.style.minHeight,408);
  s.requests[2].resolve([popup('one')]);await s.settle();assert.equal(s.content().props.style,undefined);
  assert.equal(s.find('WeeklyList').props.popups.length,1);s.content().props.onLayout({nativeEvent:{layout:{height:128}}});
  s.move(1);assert.equal(s.content().props.style.minHeight,128);s.unmount();
});

test('빠른 주 이동과 캐시 복귀 뒤 도착한 이전 응답은 현재 주와 캐시를 덮지 않는다',async()=>{
  const s=weekly();s.requests[0].resolve([popup('current')]);await s.settle();
  s.move(1);const next=s.requests[1];s.move(1);const later=s.requests[2];assert.equal(next.signal.aborted,true);
  next.resolve([popup('stale')]);later.resolve([popup('later')]);await s.settle();assert.equal(s.find('WeeklyList').props.popups[0].publicId,'later');
  s.move(-1);const retry=s.requests[3];s.move(-1);assert.equal(retry.signal.aborted,true);assert.equal(s.requests.length,4);
  retry.resolve([popup('stale-again')]);await s.settle();assert.equal(s.find('WeeklyList').props.popups[0].publicId,'current');s.unmount();
});

test('Home more consumes country and opening range into existing All filters; pagination and chip removal retain semantics',async()=>{
  const s=screen(Date,{tab:'all',countryCode:'JP',openingFrom:'2026-10-05',openingTo:'2026-10-11',homeNewEntry:'entry-1'});
  await s.settle();
  const request=s.pages.at(-1);assert.equal(request.country,'JP');
  assert.equal(request.detail.openingFrom,'2026-10-05');assert.equal(request.detail.openingTo,'2026-10-11');
  request.resolve({popups:[popup(1)],nextCursor:'next'});await s.settle();
  assert.equal(s.find('FlatList').props.data.length,1);
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.at(-1).cursor,'next');
  assert.deepEqual(s.pages.at(-1).detail,request.detail);
  s.find('AppliedFilterBar').props.onRemove('openingWeek','openingWeek');await s.settle();
  assert.equal(s.pages.at(-1).detail.openingFrom,undefined);assert.equal(s.pages.at(-1).country,'JP');
  s.setEntry({tab:'all',countryCode:'KR',openingFrom:'2026-10-12',openingTo:'2026-10-18',homeNewEntry:'entry-2'});
  await s.settle();assert.equal(s.pages.at(-1).country,'KR');assert.equal(s.pages.at(-1).detail.openingFrom,'2026-10-12');s.unmount();
});
