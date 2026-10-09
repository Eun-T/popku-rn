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
const post=id=>({id,type:'POST',category:id%2?'QUESTION':'FREE',author:{id:1,nickname:'me',avatarUrl:null},popup:null,rating:null,content:'written',createdAt:'2026-10-08T10:00:00+09:00',images:['https://signed/image'],regionName:null,likeCount:0,commentCount:0,viewCount:0,liked:false});
function api(token='jwt',body={items:[post(1)],nextCursor:null},status=200,refresh=load('src/lib/communityFeedRefresh.ts',{}),fetcher) {
  const calls=[];
  return {calls,...load('src/lib/myPosts.ts',{'../constants/api':{API_BASE_URL:'https://api'},'./auth':{getAuthSession:async()=>({accessToken:token,generation:7})},'./community':{CommunityApiError:ApiError},'./communityDiagnostics':{readCommunityErrorBody:async()=> 'error'},'./communityFeedRefresh':refresh},{fetch:fetcher??(async(url,init)=>{calls.push({url,...init});return {ok:status<400,status,json:async()=>body};})})};
}
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
function screen(loggedIn=true,canGoBack=true) {
  const h=harness(),pages=[],routes=[];let tree,authListener,changeListener,countListener,focus,blur,user=loggedIn?{email:'me'}:null;
  const router={canGoBack:()=>canGoBack,back:()=>routes.push('back'),replace:path=>routes.push(path),push:path=>routes.push(path)};
  const my=api();
  const Component=load('src/app/profile/posts.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'expo-router':{useRouter:()=>router,useFocusEffect:fn=>h.react.useEffect(()=>{focus=()=>{blur=fn();};focus();return()=>blur?.();},[fn])},
    'lucide-react-native':{ChevronLeft:'ChevronLeft',MessageSquare:'MessageSquare'},
    'react-native':{ActivityIndicator:'ActivityIndicator',FlatList:'FlatList',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:s=>s}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../../components/community/CommunityPostItem':{__esModule:true,default:'Card'},
    '../../hooks/useCommunityNow':{useCommunityNow:()=>({now:123})},
    '../../lib/auth':{clearTokens:async generation=>{assert.equal(generation,7);user=null;authListener();return true;},getAuthUser:()=>user,subscribeAuthSession:fn=>{authListener=fn;return()=>{};}},
    '../../lib/community':{CommunityApiError:ApiError},
    '../../lib/communityFeedRefresh':{subscribeCommunityPostChanges:fn=>{changeListener=fn;return()=>{};},subscribeCommunityCommentCounts:fn=>{countListener=fn;return()=>{};}},
    '../../lib/myPosts':{appendMyPosts:my.appendMyPosts,getMyPosts:(cursor,signal)=>new Promise((resolve,reject)=>pages.push({cursor,signal,resolve,reject}))},
    '../../theme/tokens':load('src/theme/tokens.ts',{}),
  }).default;
  const render=()=>tree=h.render(Component),find=type=>nodes(tree).find(n=>n.type===type),texts=()=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children);
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}};
  const press=text=>nodes(tree).find(n=>n.type==='Pressable'&&n.props.children?.props.children===text).props.onPress();
  render();return {pages,routes,render,find,texts,settle,press,auth:next=>{user=next;authListener();render();},change:(...args)=>{changeListener(...args);render();},count:(...args)=>{countListener(...args);render();},blur:()=>blur(),focus:()=>{focus();render();},unmount:h.unmount};
}
test('API uses authenticated own endpoint, cursor, abort signal and original card fields',async()=>{
  const a=api('jwt',{items:[post(2),post(1)],nextCursor:'1'}),signal=new AbortController().signal;
  const page=await a.getMyPosts('20',signal);
  assert.equal(a.calls[0].url,'https://api/api/users/me/posts?cursor=20');assert.deepEqual(a.calls[0].headers,{Authorization:'Bearer jwt'});assert.equal(a.calls[0].signal,signal);
  assert.deepEqual(page.items,[post(2),post(1)]);
  const absent=api(null);await assert.rejects(absent.getMyPosts(null,signal),e=>e.status===401&&e.authGeneration===7);assert.equal(absent.calls.length,0);
  for(const status of [401,500]) await assert.rejects(api('jwt',null,status).getMyPosts(null,signal),e=>e.status===status);
  for(const body of [null,{items:[]},{items:[{...post(1),type:'REVIEW'}],nextCursor:null},{items:[{...post(1),category:'ON_SITE_INFO'}],nextCursor:null}])
    await assert.rejects(api('jwt',body).getMyPosts(null,signal),/Invalid/);
  const c=new AbortController();c.abort();const aborted=api();await assert.rejects(aborted.getMyPosts(null,c.signal),/aborted/);assert.equal(aborted.calls.length,0);
});
test('logged out screen makes no calls, shows login guidance and never redirects',()=>{
  const s=screen(false);assert.equal(s.pages.length,0);assert.ok(s.texts().includes('로그인이 필요해요'));assert.deepEqual(s.routes,[]);
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,0);s.auth({email:'me'});assert.equal(s.pages.length,1);s.unmount();
});
test('initial loading, errors, retry and empty state are distinct',async()=>{
  const s=screen();assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'게시글 불러오는 중');
  s.pages[0].reject(Error('offline'));await s.settle();assert.ok(s.texts().includes('게시글을 불러오지 못했어요'));
  assert.ok(!s.texts().includes('아직 작성한 게시글이 없어요.'));s.press('다시 시도하기');
  s.pages[1].resolve({items:[],nextCursor:null});await s.settle();assert.ok(s.texts().includes('아직 작성한 게시글이 없어요.'));
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,2);s.unmount();
});
test('additional loading locks requests, retries same cursor, deduplicates and stops on last page',async()=>{
  const s=screen();s.pages[0].resolve({items:[post(3),post(2)],nextCursor:'2'});await s.settle();
  s.find('FlatList').props.onEndReached();s.find('FlatList').props.onEndReached();s.render();assert.equal(s.pages.length,2);assert.equal(s.pages[1].cursor,'2');
  assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'게시글 추가 로딩');s.pages[1].reject(Error('offline'));await s.settle();
  assert.equal(s.find('FlatList').props.data.length,2);s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,2);s.press('다시 시도하기');assert.equal(s.pages[2].cursor,'2');
  s.pages[2].resolve({items:[post(2),post(1),post(1)],nextCursor:null});await s.settle();assert.deepEqual(s.find('FlatList').props.data.map(p=>p.id),[3,2,1]);
  s.find('FlatList').props.onEndReached();assert.equal(s.pages.length,3);s.unmount();
});
test('reuses card and exact detail route, prevents repeated navigation, supports back and fallback',async()=>{
  const s=screen();const item=post(4);s.pages[0].resolve({items:[item],nextCursor:null});await s.settle();
  const card=s.find('FlatList').props.renderItem({item}).props.children;assert.equal(card.type,'Card');assert.deepEqual(card.props.post,item);
  card.props.onPressPost();card.props.onPressPost();assert.deepEqual(s.routes,[{pathname:'/community/[id]',params:{id:'4'}}]);
  s.blur();s.focus();card.props.onPressPost();assert.equal(s.routes.length,2);
  nodes(s.find('SafeAreaView')).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();assert.equal(s.routes[2],'back');s.unmount();
  const f=screen(false,false);nodes(f.find('SafeAreaView')).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();assert.deepEqual(f.routes,['/profile']);f.unmount();
  assert.match(readFileSync('src/app/(tabs)/profile/index.tsx','utf8'),/label=\{t\('profile\.posts\.title'\)\}\s+onPress=\{\(\) => router.push\("\/profile\/posts"/);
});
test('blur, unmount, logout and expired JWT cancel private reads without redirect or stale data',async()=>{
  const s=screen();s.blur();assert.ok(s.pages[0].signal.aborted);s.pages[0].resolve({items:[post(1)],nextCursor:null});await s.settle();assert.equal(s.find('FlatList').props.data.length,0);
  s.focus();assert.equal(s.pages.length,2);s.auth(null);assert.ok(s.pages[1].signal.aborted);s.pages[1].resolve({items:[post(1)],nextCursor:null});await s.settle();assert.equal(s.find('FlatList').props.data.length,0);assert.deepEqual(s.routes,[]);s.unmount();
  const expired=screen();expired.pages[0].reject(new ApiError(401,undefined,7));await expired.settle();assert.ok(expired.texts().includes('로그인이 필요해요'));assert.deepEqual(expired.routes,[]);expired.unmount();
  const u=screen();u.unmount();assert.ok(u.pages[0].signal.aborted);u.pages[0].resolve({items:[post(1)],nextCursor:null});await Promise.resolve();
});
test('existing post edits, deletes and comment events update only matching POST items',async()=>{
  const s=screen();s.pages[0].resolve({items:[post(1)],nextCursor:null});await s.settle();
  s.change(1,{content:'edited',images:[],updatedAt:'now'},'REVIEW');assert.equal(s.find('FlatList').props.data[0].content,'written');
  s.change(1,{content:'edited',images:[],updatedAt:'now'},'POST');assert.equal(s.find('FlatList').props.data[0].content,'edited');
  s.count(1,3,'POST');assert.equal(s.find('FlatList').props.data[0].commentCount,3);s.change(1,null,'POST');assert.equal(s.find('FlatList').props.data.length,0);s.unmount();
});
test('in-flight responses preserve newer edits, deletion and comment counts',async()=>{
  const refresh=load('src/lib/communityFeedRefresh.ts',{});let resolve;
  const a=api('jwt',null,200,refresh,async()=>({ok:true,json:()=>new Promise(r=>resolve=r)}));
  const pending=a.getMyPosts(null,new AbortController().signal);await Promise.resolve();await Promise.resolve();
  refresh.publishCommunityPostChange(2,{content:'new',images:[],updatedAt:'now'},'POST');refresh.publishCommunityPostChange(1,null,'POST');
  refresh.publishCommunityCommentCount(2,3,'POST');resolve({items:[post(2),post(1)],nextCursor:null});
  const page=await pending;assert.equal(page.items.length,1);assert.equal(page.items[0].content,'new');assert.equal(page.items[0].commentCount,3);
});
