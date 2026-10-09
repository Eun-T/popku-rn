const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {test} = require('node:test');
const ts = require('typescript');
function load(file,mocks,globals={}) {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',...Object.keys(globals),code)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports,...Object.values(globals));
  return module.exports;
}
class ApiError extends Error { constructor(status,body,authGeneration){super(String(status));Object.assign(this,{status,authGeneration});} }
const review=id=>({id,type:'REVIEW',category:'REVIEW',author:{id:1,nickname:'me',avatarUrl:null},popup:{publicId:`popup-${id}`,title:`Popup ${id}`},rating:4,content:'visited',createdAt:'2026-10-08T10:00:00+09:00',images:['https://signed/image'],regionName:null,likeCount:0,commentCount:0,viewCount:0,liked:false});
function api(token='jwt',body={items:[review(1)],nextCursor:null},status=200) {
  const calls=[];
  return {calls,...load('src/lib/myReviews.ts',{'../constants/api':{API_BASE_URL:'https://api'},'./auth':{getAuthSession:async()=>({accessToken:token,generation:7})},'./community':{CommunityApiError:ApiError},'./communityDiagnostics':{readCommunityErrorBody:async()=> 'error'},'./communityFeedRefresh':load('src/lib/communityFeedRefresh.ts',{})},{fetch:async(url,init)=>{calls.push({url,...init});return {ok:status<400,status,json:async()=>body};}})};
}
test('authenticated endpoint, encoded cursor, actual review fields and server order',async()=>{
  const a=api('jwt',{items:[review(2),review(1)],nextCursor:'1'}),signal=new AbortController().signal;
  const page=await a.getMyReviews('20',signal);
  assert.equal(a.calls[0].url,'https://api/api/users/me/reviews?cursor=20');
  assert.deepEqual(a.calls[0].headers,{Authorization:'Bearer jwt'});assert.equal(a.calls[0].signal,signal);
  assert.deepEqual(page.items.map(r=>r.id),[2,1]);assert.equal(page.items[0].rating,4);assert.equal(page.items[0].content,'visited');assert.equal(page.items[0].popup.title,'Popup 2');assert.equal(page.items[0].images[0],'https://signed/image');
});
test('empty page is distinct from authentication, HTTP and malformed response errors',async()=>{
  const signal=new AbortController().signal;
  assert.deepEqual(await api('jwt',{items:[],nextCursor:null}).getMyReviews(null,signal),{items:[],nextCursor:null});
  const absent=api(null);await assert.rejects(absent.getMyReviews(null,signal),e=>e.status===401&&e.authGeneration===7);assert.equal(absent.calls.length,0);
  await assert.rejects(api('jwt',null,500).getMyReviews(null,signal),e=>e.status===500);
  await assert.rejects(api('jwt',null,401).getMyReviews(null,signal),e=>e.status===401&&e.authGeneration===7);
  await assert.rejects(api('jwt',{items:[{...review(1),popup:null}],nextCursor:null}).getMyReviews(null,signal),/Invalid/);
  await assert.rejects(api('jwt',{items:[]}).getMyReviews(null,signal),/Invalid/);
});
test('appending removes overlap and duplicate IDs within a page, retaining order',()=>{
  const a=api();assert.deepEqual(a.appendMyReviews([review(3)],[review(3),review(2),review(2),review(1)]).map(r=>r.id),[3,2,1]);
});

const jsx=(type,props,key)=>({type,props,key});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children),...nodes(tree.props?.ListEmptyComponent),...nodes(tree.props?.ListFooterComponent)];
function harness() {
  const slots=[];let cursor=0,dirty=false;const pending=[];
  const changed=(old,deps)=>!old||!deps.every((v,j)=>Object.is(v,old.deps[j]));
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useCallback(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
  };
  return {react,render(Component){let tree,count=0;do{assert.ok(count++<25);cursor=0;dirty=false;tree=Component();pending.splice(0).forEach(fn=>fn());}while(dirty);return tree;},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
function screen(canGoBack=true) {
  const h=harness(),pages=[],opened=[],routes=[];let tree,authListener,changeListener;
  const router={push:route=>routes.push(route),canGoBack:()=>canGoBack,back:()=>routes.push('back'),replace:path=>routes.push(path),dismissTo:path=>routes.push(path)};
  const theme=load('src/theme/tokens.ts',{}),my=api();
  const Component=load('src/app/profile/reviews.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>router,useFocusEffect:fn=>h.react.useEffect(fn,[fn])},'lucide-react-native':{ChevronLeft:'ChevronLeft',Star:'Star'},
    'react-native':{ActivityIndicator:'ActivityIndicator',FlatList:'FlatList',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:s=>s}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../../components/community/CommunityPostItem':{__esModule:true,default:'Card'},
    '../../hooks/usePopupNavigation':{usePopupNavigation:()=>id=>opened.push(id)},'../../hooks/useCommunityNow':{useCommunityNow:()=>({now:123})},
    '../../lib/auth':{clearTokens:async()=>true,getAuthUser:()=>null,subscribeAuthSession:fn=>{authListener=fn;return()=>{};}},
    '../../lib/community':{CommunityApiError:ApiError},'../../lib/communityFeedRefresh':{subscribeCommunityPostChanges:fn=>{changeListener=fn;return()=>{};}},
    '../../lib/myReviews':{appendMyReviews:my.appendMyReviews,getMyReviews:(cursor,signal)=>new Promise((resolve,reject)=>pages.push({cursor,signal,resolve,reject}))},
    '../../lib/reviews':{subscribeReviews:()=>()=>{}},
    '../../theme/tokens':theme,
  }).default;
  const render=()=>tree=h.render(Component),find=type=>nodes(tree).find(n=>n.type===type),texts=()=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children);
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}};
  render();return {pages,opened,routes,render,find,texts,settle,auth:()=>{authListener();render();},change:(...args)=>{changeListener(...args);render();},unmount:h.unmount};
}
test('screen initial loading, empty page, error and retry remain distinct',async()=>{
  const s=screen();assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'방문 리뷰 불러오는 중');assert.equal(s.pages.length,1);
  s.pages[0].reject(Error('offline'));await s.settle();assert.ok(s.texts().includes('방문 리뷰를 불러오지 못했어요'));assert.ok(!s.texts().includes('아직 작성한 방문 리뷰가 없어요'));
  const retry=nodes(s.find('FlatList')).find(n=>n.type==='Pressable'&&n.props.children?.props.children==='다시 시도하기');retry.props.onPress();s.render();
  s.pages[1].resolve({items:[],nextCursor:null});await s.settle();assert.ok(s.texts().includes('아직 작성한 방문 리뷰가 없어요'));
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,2);s.unmount();
});
test('screen locks additional requests, deduplicates pages, stops at last page and preserves list on error',async()=>{
  const s=screen();s.pages[0].resolve({items:[review(3),review(2)],nextCursor:'2'});await s.settle();
  s.find('FlatList').props.onEndReached();s.find('FlatList').props.onEndReached();s.render();assert.equal(s.pages.length,2);assert.equal(s.pages[1].cursor,'2');assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'리뷰 추가 로딩');
  s.pages[1].reject(Error('offline'));await s.settle();assert.equal(s.find('FlatList').props.data.length,2);s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,2);
  nodes(s.find('FlatList')).find(n=>n.type==='Pressable'&&n.props.children?.props.children==='다시 시도하기').props.onPress();assert.equal(s.pages[2].cursor,'2');
  s.pages[2].resolve({items:[review(2),review(1),review(1)],nextCursor:null});await s.settle();assert.deepEqual(s.find('FlatList').props.data.map(r=>r.id),[3,2,1]);
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,3);s.render();assert.equal(s.pages.length,3);s.unmount();
});
test('screen reuses card data, opens review by review ID, keeps popup link, handles back/fallback and aborts private reads on logout',async()=>{
  const s=screen();const item=review(4);s.pages[0].resolve({items:[item],nextCursor:null});await s.settle();
  const card=s.find('FlatList').props.renderItem({item}).props.children;assert.equal(card.type,'Card');assert.deepEqual(card.props.post,item);
  card.props.onPressReview();card.props.onPressReview();assert.deepEqual(s.routes,[{pathname:'/reviews/[id]',params:{id:'4'}}]);
  card.props.onPressPlace(item.popup.publicId);assert.deepEqual(s.opened,['popup-4']);
  assert.equal(card.props.reviewActions.type,'ReviewActions');assert.deepEqual(card.props.reviewActions.props.review,item);
  nodes(s.find('SafeAreaView')).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();assert.deepEqual(s.routes,[{pathname:'/reviews/[id]',params:{id:'4'}},'back']);
  s.change(4,{rating:5,content:'edited',images:[]},'REVIEW');assert.equal(s.find('FlatList').props.data[0].content,'edited');s.change(4,null,'REVIEW');assert.equal(s.find('FlatList').props.data.length,0);s.unmount();
  const fallback=screen(false);nodes(fallback.find('SafeAreaView')).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();assert.equal(fallback.routes[0],'/profile');
  fallback.auth();assert.ok(fallback.pages[0].signal.aborted);assert.equal(fallback.routes[1],'/profile/login');fallback.pages[0].resolve({items:[item],nextCursor:null});await fallback.settle();assert.equal(fallback.find('FlatList').props.data.length,0);fallback.unmount();
});
test('menu is enabled only for authenticated users and popup hook uses the existing route',()=>{
  const { profileMenu } = require('./helpers/profileMenu.cjs');
  const signedIn = profileMenu({ email: 'me@test', nickname: 'me' });
  const action = signedIn.find('내가 쓴 방문 리뷰');
  assert.equal(action.props.disabled, false); action.props.onPress();
  assert.deepEqual(signedIn.routes, ['/profile/reviews']);
  const anonymous = profileMenu(null).find('내가 쓴 방문 리뷰');
  assert.equal(anonymous.props.disabled, true); assert.equal(anonymous.props.onPress, undefined);
  let focus;const routes=[];const open=load('src/hooks/usePopupNavigation.ts',{react:{useCallback:fn=>fn,useRef:()=>({current:false})},'expo-router':{useRouter:()=>({push:route=>routes.push(route)}),useFocusEffect:fn=>{focus=fn;}}}).usePopupNavigation();
  focus();open('popup-4');open('popup-4');assert.deepEqual(routes,[{pathname:'/places/[id]',params:{id:'popup-4'}}]);focus();open('popup-5');assert.equal(routes.length,2);
});

test('existing review card maps popup, rating, content, date and signed image URLs',()=>{
  const dates=[],places=[],opened=[];
  const Card=load('src/components/community/CommunityPostItem.tsx',{
    'lucide-react-native':{ChevronRight:'ChevronRight',Heart:'Heart',MessageCircle:'MessageCircle',MoreHorizontal:'MoreHorizontal',Star:'Star'},
    react:{useSyncExternalStore:()=>({id:1})},'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{Image:'Image',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:s=>s}},
    '../../lib/auth':{getAuthUser:()=>({id:1}),subscribeAuthUser:()=>()=>{}},
    '../../lib/communityTime':{formatCommunityTime:(date,now)=>{dates.push({date,now});return 'DATE';}},
    '../../locales':{t:key=>key},'../../theme/communityColors':load('src/theme/communityColors.ts',{}),'../../theme/tokens':load('src/theme/tokens.ts',{}),
  }).default;
  const item=review(4),tree=Card({post:item,now:123,onPressReview:()=>opened.push(item.popup.publicId),onPressPlace:id=>places.push(id)});
  const all=nodes(tree),texts=all.filter(n=>n.type==='Text').map(n=>n.props.children);
  assert.ok(texts.includes('Popup 4'));assert.ok(texts.includes('4.0'));assert.ok(texts.includes('visited'));assert.ok(texts.includes('DATE'));
  assert.ok(dates.some(d=>d.date===item.createdAt&&d.now===123));assert.equal(all.find(n=>n.type==='Image').props.source.uri,item.images[0]);
  tree.props.onPress();assert.deepEqual(opened,['popup-4']);
  all.find(n=>n.props?.accessibilityLabel==='Popup 4').props.onPress({stopPropagation(){}});assert.deepEqual(places,['popup-4']);
});
test('in-flight own-review reads keep newer edits and deletions',async()=>{
  const refresh=load('src/lib/communityFeedRefresh.ts',{});let resolve;
  const a=load('src/lib/myReviews.ts',{'../constants/api':{API_BASE_URL:'https://api'},'./auth':{getAuthSession:async()=>({accessToken:'jwt',generation:7})},'./community':{CommunityApiError:ApiError},'./communityDiagnostics':{readCommunityErrorBody:async()=>''},'./communityFeedRefresh':refresh},{fetch:async()=>({ok:true,json:()=>new Promise(r=>resolve=r)})});
  const pending=a.getMyReviews(null,new AbortController().signal);await Promise.resolve();await Promise.resolve();
  refresh.publishCommunityPostChange(2,{rating:5,content:'new',images:[],updatedAt:'now'},'REVIEW');refresh.publishCommunityPostChange(1,null,'REVIEW');
  resolve({items:[review(2),review(1)],nextCursor:null});const page=await pending;assert.equal(page.items.length,1);assert.equal(page.items[0].content,'new');assert.equal(page.items[0].rating,5);
});
