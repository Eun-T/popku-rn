const assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{test}=require('node:test'),ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key});
function load(file,mocks,globals={}){
  mocks=require('./helpers/uiDependencies.cjs').withUiDependencies(file,mocks);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};new Function('require','module','exports',...Object.keys(globals),code)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports,...Object.values(globals));return module.exports;
}
const sample={id:1,type:'GENERAL',title:'title',status:'PENDING',createdAt:'2026-10-08T10:00:00+09:00',author:{id:1,nickname:'me'}};
const detail={...sample,content:'body',answer:null,answeredAt:null,updatedAt:sample.createdAt};
function api({token='jwt',body={items:[],nextCursor:null},status=200}={}){
  const calls=[],cleared=[];const session={accessToken:token,generation:1};
  return {calls,cleared,session,...load('src/lib/inquiries.ts',{'../constants/api':{API_BASE_URL:'https://api'},'./auth':{getAuthSession:async()=>({...session}),clearTokens:async generation=>{cleared.push(generation);}}},{fetch:async(url,init)=>{calls.push({url,...init});return{ok:status<400,status,json:async()=>body};}})};
}
test('inquiry API requires JWT, never calls API signed out and propagates HTTP errors',async()=>{
  const a=api({token:null});await assert.rejects(a.getMyInquiries(null,new AbortController().signal),e=>e.status===401);assert.equal(a.calls.length,0);
  const b=api({status:401});await assert.rejects(b.getMyInquiries(null,new AbortController().signal),e=>e.status===401);assert.deepEqual(b.cleared,[1]);
  await assert.rejects(api({status:500}).getMyInquiries(null,new AbortController().signal),e=>e.status===500);
});
test('own page cursor and fields preserve server order and append eliminates all duplicates',async()=>{
  const a=api({body:{items:[{...sample,id:2},sample],nextCursor:'1'}}),signal=new AbortController().signal;
  const page=await a.getMyInquiries('20',signal);assert.equal(a.calls[0].url,'https://api/api/inquiries/me?cursor=20');assert.equal(a.calls[0].headers.Authorization,'Bearer jwt');assert.equal(a.calls[0].signal,signal);
  assert.deepEqual(page.items.map(i=>i.id),[2,1]);assert.deepEqual(a.appendInquiries([sample],[sample,{...sample,id:2},{...sample,id:2}]).map(i=>i.id),[1,2]);
});
test('creation validates trimmed input and sends only editable fields',async()=>{
  const a=api({body:{id:1}});assert.equal(a.validInquiry('  ','body'),false);assert.equal(a.validInquiry('title','\u00a0'),false);assert.equal(a.validInquiry('x'.repeat(151),'b'),false);assert.equal(a.validInquiry('t','가'.repeat(21846)),false);
  await assert.rejects(a.createInquiry('INVALID','t','b'));assert.equal(a.calls.length,0);
  assert.deepEqual(await a.createInquiry('BUG',' title ',' body '),{id:1});assert.deepEqual(JSON.parse(a.calls[0].body),{type:'BUG',title:'title',content:'body'});
});
test('detail distinguishes pending/resolved and rejects inconsistent or malformed answers',async()=>{
  assert.equal((await api({body:detail}).getInquiry(1,new AbortController().signal)).answer,null);
  const answered={...detail,status:'RESOLVED',answer:'answer',answeredAt:'2026-10-08T11:00:00+09:00'};assert.equal((await api({body:answered}).getInquiry(1,new AbortController().signal)).answer,'answer');
  for(const body of [{...detail,answer:'fake'},{...detail,status:'RESOLVED'},{...answered,answeredAt:null}])await assert.rejects(api({body}).getInquiry(1,new AbortController().signal),/Invalid/);
  await assert.rejects(api({body:null}).getInquiry(1,new AbortController().signal),/Invalid/);
});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children),...nodes(tree.props?.ListEmptyComponent),...nodes(tree.props?.ListFooterComponent)];
function harness(){
  const slots=[];let cursor=0,dirty=false;const pending=[];const changed=(old,deps)=>!old||!deps.every((v,j)=>Object.is(v,old.deps[j]));
  const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},useRef(initial){return slots[cursor++]??={current:initial};},useCallback(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn,deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
  return{react,render(C){let tree,count=0;do{assert.ok(count++<30);cursor=0;dirty=false;tree=C();pending.splice(0).forEach(fn=>fn());}while(dirty);return tree;},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
function screen(name,authenticated=true){
  const h=harness(),calls=[],routes=[];let tree,focus,beforeRemove;const session={ready:true,authenticated,generation:1,error:false,retry(){}};
  const guard=require('./helpers/preventRemove.cjs').removalDriver(h.react);
  const router={canGoBack:()=>true,back:()=>routes.push('back'),replace:path=>routes.push(path),push:path=>routes.push(path)};
  const native={ActivityIndicator:'ActivityIndicator',FlatList:'FlatList',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'ios'},StyleSheet:{create:styles=>styles}};
  const a=api(),theme=load('src/theme/tokens.ts',{}),defer=(kind,args)=>new Promise((resolve,reject)=>calls.push({kind,args,resolve,reject}));
  const C=load(`src/app/profile/inquiries/${name==='detail'?'[id]':name}.tsx`,{react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>router,useNavigation:()=>guard.navigation,useLocalSearchParams:()=>({id:'1'}),useFocusEffect:fn=>{focus=fn;h.react.useEffect(fn,[fn]);}},'expo-router/react-navigation':{usePreventRemove:guard.usePreventRemove},'react-native':native,
    'lucide-react-native':{Pencil:'Pencil'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({right:0,bottom:34})},
    '../../../components/profile/InquiryLayout':{__esModule:true,default:'Layout',InquiryEmpty:'Empty',inquiryStyles:{}},'../../../hooks/useInquirySession':{useInquirySession:()=>session},'../../../lib/inquiries':{...a,getMyInquiries:(...args)=>defer('list',args),getInquiry:(...args)=>defer('detail',args),createInquiry:(...args)=>defer('create',args)},'../../../theme/tokens':theme}).default;
  const render=()=>tree=h.render(C),find=type=>nodes(tree).find(n=>n.type===type),texts=()=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children);
  const button=text=>nodes(tree).find(n=>n.type==='Pressable'&&nodes(n).some(child=>child.type==='Text'&&child.props.children===text));
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}};
  render();return{calls,routes,session,Error:a.InquiryApiError,render,find,texts,button,settle,refocus:()=>{focus();render();},unmount:h.unmount};
}
test('inquiry floating compose button preserves rows, opens once, and clears navigation lock after returning',async()=>{
  const s=screen('index');
  s.calls[0].resolve({items:[sample],nextCursor:null});await s.settle();
  const button=s.button('문의글'),style=Object.assign({},...button.props.style);
  assert.equal(style.height,48);assert.equal(style.borderRadius,999);assert.equal(style.backgroundColor,'#111827');
  assert.equal(style.bottom,34+16);assert.equal(style.right,16);
  assert.equal(nodes(button).filter(n=>n.type==='Pencil').length,1);
  assert.ok(!s.texts().includes('내 문의 내역'));assert.ok(!s.texts().includes('+ 문의 작성'));
  assert.deepEqual(s.find('FlatList').props.data,[sample]);
  assert.ok(s.find('FlatList').props.contentContainerStyle[1].paddingBottom>=style.bottom+48+16);
  button.props.onPress();button.props.onPress();assert.deepEqual(s.routes,['/profile/inquiries/write']);
  s.refocus();s.calls.at(-1).resolve({items:[{...sample,id:2},sample],nextCursor:null});await s.settle();
  assert.deepEqual(s.find('FlatList').props.data.map(item=>item.id),[2,1]);
  s.button('문의글').props.onPress();assert.equal(s.routes.length,2);s.unmount();
});
test('signed-out main permits visits, makes no API calls, keeps login text and hides compose/login buttons',()=>{
  const s=screen('index',false);assert.equal(s.calls.length,0);assert.equal(s.find('Empty').props.title,'로그인이 필요합니다');assert.equal(s.find('Empty').props.description,'문의 내역을 확인하려면 로그인해주세요.');
  assert.equal(s.button('로그인이 필요합니다'),undefined);assert.equal(s.button('문의글'),undefined);assert.equal(nodes(s.find('Layout')).filter(n=>n.type==='Pressable').length,0);assert.deepEqual(s.routes,[]);s.unmount();
});
test('main separates loading/empty/error, blocks duplicate pagination and reloads on return from creation',async()=>{
  const s=screen('index');assert.equal(s.calls.length,1);assert.equal(s.find('ActivityIndicator').props.accessibilityLabel,'문의 내역 불러오는 중');
  s.calls[0].reject(Error('offline'));await s.settle();assert.ok(s.texts().includes('문의 내역을 불러오지 못했어요.'));assert.equal(s.find('Empty'),undefined);
  s.button('다시 시도하기').props.onPress();s.calls[1].resolve({items:[],nextCursor:null});await s.settle();assert.equal(s.find('Empty').props.title,'아직 문의 내역이 없어요');s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,2);
  s.refocus();s.calls[2].resolve({items:[{...sample,id:3},sample],nextCursor:'1'});await s.settle();s.find('FlatList').props.onEndReached();s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,4);
  s.calls[3].resolve({items:[sample,{...sample,id:2},{...sample,id:2}],nextCursor:null});await s.settle();assert.deepEqual(s.find('FlatList').props.data.map(i=>i.id),[3,1,2]);s.find('FlatList').props.onEndReached();assert.equal(s.calls.length,4);
  s.find('FlatList').props.renderItem({item:sample}).props.onPress();assert.equal(s.routes[0],'/profile/inquiries/1');s.unmount();
});
test('write disables blanks, locks concurrent submits, keeps draft after failure and returns after success',async()=>{
  const s=screen('write');assert.equal(s.button('문의 등록하기').props.disabled,true);
  nodes(s.find('ScrollView')).find(n=>n.props?.accessibilityLabel==='문의 제목').props.onChangeText('title');nodes(s.find('ScrollView')).find(n=>n.props?.accessibilityLabel==='문의 내용').props.onChangeText('body');s.render();
  const submit=s.button('문의 등록하기').props.onPress;submit();submit();assert.equal(s.calls.length,1);assert.deepEqual(s.calls[0].args,['GENERAL','title','body']);s.render();assert.equal(s.find('Layout').props.busy,true);
  s.calls[0].reject(Error('offline'));await s.settle();assert.equal(nodes(s.find('ScrollView')).find(n=>n.props?.accessibilityLabel==='문의 내용').props.value,'body');assert.ok(s.texts().some(t=>typeof t==='string'&&t.includes('등록하지 못했어요')));
  s.button('문의 등록하기').props.onPress();s.calls[1].resolve({id:1});await s.settle();assert.deepEqual(s.routes,['back']);assert.equal(s.find('KeyboardAvoidingView').props.behavior,'padding');s.unmount();
});
test('detail displays actual waiting text or answer and rejects cross-user/missing requests distinctly',async()=>{
  const s=screen('detail');s.calls[0].resolve(detail);await s.settle();assert.ok(s.texts().includes('답변을 기다리고 있어요.'));assert.ok(!s.texts().includes('운영자 답변'));
  s.refocus();s.calls[1].resolve({...detail,status:'RESOLVED',answer:'real answer',answeredAt:sample.createdAt});await s.settle();assert.ok(s.texts().includes('운영자 답변'));assert.ok(s.texts().includes('real answer'));s.unmount();
  const absent=screen('detail');absent.calls[0].reject(new absent.Error(404));await absent.settle();assert.equal(absent.find('Empty').props.title,'문의를 찾을 수 없어요');absent.unmount();
});
test('session hook restores credentials and immediately hides/aborts private lists on session changes',async()=>{
  const h=harness();let subscriber,auth={accessToken:null,generation:1},session;
  const hook=load('src/hooks/useInquirySession.ts',{react:h.react,'../lib/auth':{getAuthSession:async()=>auth,subscribeAuthSession:fn=>{subscriber=fn;return()=>{};}}}).useInquirySession;
  const C=()=>{session=hook();return null;};h.render(C);assert.equal(session.ready,false);await Promise.resolve();h.render(C);assert.equal(session.authenticated,false);
  auth={accessToken:'jwt',generation:2};subscriber();h.render(C);assert.equal(session.ready,false);await Promise.resolve();h.render(C);assert.equal(session.authenticated,true);assert.equal(session.generation,2);h.unmount();
  const s=screen('index');s.session.authenticated=false;s.session.generation=2;s.render();assert.equal(s.calls[0].args[1].aborted,true);s.calls[0].resolve({items:[sample],nextCursor:null});await s.settle();assert.equal(s.find('FlatList'),undefined);s.unmount();
});
