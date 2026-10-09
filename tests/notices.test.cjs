const assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{test}=require('node:test'),ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key});
function load(file,mocks,globals={}){
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};new Function('require','module','exports',...Object.keys(globals),code)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports,...Object.values(globals));return module.exports;
}
const notice=id=>({id,category:'GENERAL',title:`Notice ${id}`,content:'line one\nline two',publishedAt:'2026-10-08T10:00:00+09:00'});
function api(body={items:[notice(1)],nextCursor:null},status=200){
  const calls=[];return{calls,...load('src/lib/notices.ts',{'../constants/api':{API_BASE_URL:'https://api'}},{fetch:async(url,init)=>{calls.push({url,...init});return{ok:status<400,status,json:async()=>body};}})};
}
test('public list/detail require no credentials and never import or mutate authentication',async()=>{
  const a=api(),signal=new AbortController().signal;await a.getNotices('a|+/=',signal);
  assert.equal(a.calls[0].url,'https://api/api/notices?cursor=a%7C%2B%2F%3D');assert.equal(a.calls[0].headers,undefined);assert.equal(a.calls[0].signal,signal);
  const b=api(notice(2));assert.deepEqual(await b.getNotice(2,signal),notice(2));assert.equal(b.calls[0].url,'https://api/api/notices/2');
  await assert.rejects(api(null,401).getNotices(null,signal),e=>e.status===401);await assert.rejects(api(null,500).getNotices(null,signal),e=>e.status===500);
});
test('public page validates fields and keeps server order while append removes overlaps and within-page duplicates',async()=>{
  const a=api({items:[notice(1),notice(3),notice(2)],nextCursor:'opaque'}),signal=new AbortController().signal;
  assert.deepEqual((await a.getNotices(null,signal)).items.map(i=>i.id),[1,3,2]);
  assert.deepEqual(a.appendNotices([notice(1)],[notice(1),notice(3),notice(3),notice(2)]).map(i=>i.id),[1,3,2]);
  for(const body of [{items:[{...notice(1),publishedAt:null}],nextCursor:null},{items:[{...notice(1),category:'BAD'}],nextCursor:null},{items:[]}])await assert.rejects(api(body).getNotices(null,signal),/Invalid/);
  const controller=new AbortController();controller.abort();await assert.rejects(a.getNotices(null,controller.signal),/aborted/);
});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children),...nodes(tree.props?.ListEmptyComponent),...nodes(tree.props?.ListFooterComponent)];
function harness(){
  const slots=[];let cursor=0,dirty=false;const pending=[];const changed=(old,deps)=>!old||!deps.every((v,j)=>Object.is(v,old.deps[j]));
  const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},useRef(initial){return slots[cursor++]??={current:initial};},useCallback(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn,deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
  return{react,render(C){let tree,count=0;do{assert.ok(count++<30);cursor=0;dirty=false;tree=C();pending.splice(0).forEach(fn=>fn());}while(dirty);return tree;},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
function screen(detail=false){
  const h=harness(),calls=[],routes=[];let tree;
  const a=api(),router={canGoBack:()=>true,back:()=>routes.push('back'),replace:path=>routes.push(path),push:path=>routes.push(path)};
  const C=load(`src/app/profile/notices/${detail?'[id]':'index'}.tsx`,{react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>router,useLocalSearchParams:()=>({id:'1'}),useFocusEffect:fn=>h.react.useEffect(fn,[fn])},'react-native':{ActivityIndicator:'ActivityIndicator',FlatList:'FlatList',Pressable:'Pressable',Text:'Text',View:'View',ScrollView:'ScrollView'},
    '../../../components/profile/NoticeLayout':{__esModule:true,default:'Layout',noticeStyles:{}},'../../../lib/notices':{...a,getNotices:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject})),getNotice:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))},'../../../theme/tokens':load('src/theme/tokens.ts',{})}).default;
  const render=()=>tree=h.render(C),find=type=>nodes(tree).find(n=>n.type===type),texts=()=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children),button=text=>nodes(tree).find(n=>n.type==='Pressable'&&n.props.children?.props.children===text);
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}};
  render();return{calls,routes,Error:a.NoticeApiError,render,find,texts,button,settle,unmount:h.unmount};
}
test('list separates loading, empty and API error and retries without a login flow',async()=>{
  const s=screen();assert.equal(s.calls.length,1);assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'공지사항 불러오는 중');
  s.calls[0].reject(Error('offline'));await s.settle();assert.ok(s.texts().includes('공지사항을 불러오지 못했어요.'));assert.ok(!s.texts().includes('등록된 공지사항이 없어요'));
  s.button('다시 시도하기').props.onPress();s.calls[1].resolve({items:[],nextCursor:null});await s.settle();assert.ok(s.texts().includes('등록된 공지사항이 없어요'));s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,2);assert.deepEqual(s.routes,[]);s.unmount();
});
test('list locks extra requests, retries failed pages, deduplicates and stops after the final cursor',async()=>{
  const s=screen();s.calls[0].resolve({items:[notice(3),notice(2)],nextCursor:'cursor'});await s.settle();
  s.find('FlatList').props.onEndReached();s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,2);assert.equal(s.calls[1].args[0],'cursor');s.render();assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'공지사항 추가 로딩');
  s.calls[1].reject(Error('offline'));await s.settle();assert.equal(s.find('FlatList').props.data.length,2);s.button('다시 시도하기').props.onPress();
  s.calls[2].resolve({items:[notice(2),notice(1),notice(1)],nextCursor:null});await s.settle();assert.deepEqual(s.find('FlatList').props.data.map(i=>i.id),[3,2,1]);s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,3);
  const row=s.find('FlatList').props.renderItem({item:notice(1)});assert.ok(nodes(row).some(n=>n.props?.children==='일반'));assert.ok(nodes(row).some(n=>n.props?.children==='2026.10.08'));row.props.onPress();row.props.onPress();assert.deepEqual(s.routes,['/profile/notices/1']);s.unmount();
});
test('detail renders long multiline text in ScrollView and distinguishes hidden/missing notices from outages',async()=>{
  const s=screen(true),long={...notice(1),content:'긴 문장\n'.repeat(500)};s.calls[0].resolve(long);await s.settle();assert.equal(s.find('Layout').props.detail,true);assert.ok(s.find('ScrollView'));assert.ok(s.texts().includes(long.content));s.unmount();
  const missing=screen(true);missing.calls[0].reject(new missing.Error(404));await missing.settle();assert.ok(missing.texts().includes('공지사항을 찾을 수 없어요.'));missing.unmount();
  const fail=screen(true);fail.calls[0].reject(Error('offline'));await fail.settle();assert.ok(fail.texts().includes('공지사항을 불러오지 못했어요.'));fail.unmount();
});
test('header/back fallback and menu preserve existing public profile navigation',()=>{
  const calls=[],router={canGoBack:()=>false,replace:path=>calls.push(path),back:()=>calls.push('back')};
  const Layout=load('src/components/profile/NoticeLayout.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>router},'lucide-react-native':{ChevronLeft:'ChevronLeft'},'react-native':{Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:s=>s,hairlineWidth:1}},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../../theme/tokens':load('src/theme/tokens.ts',{})}).default;
  for(const detail of [false,true])nodes(Layout({children:null,detail})).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();router.canGoBack=()=>true;nodes(Layout({children:null})).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();assert.deepEqual(calls,['/profile','/profile/notices','back']);
  for (const user of [null, { email: 'me@test', nickname: 'me' }]) {
    const menu = require('./helpers/profileMenu.cjs').profileMenu(user);
    const action = menu.find('공지사항'); assert.equal(action.props.disabled, false);
    action.props.onPress(); assert.deepEqual(menu.routes, ['/profile/notices']);
  }
});
