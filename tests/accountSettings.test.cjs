const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
function load(file,mocks,globals={},extra='') {
  mocks = require('./helpers/uiDependencies.cjs').withUiDependencies(file, mocks);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',...Object.keys(globals),code+extra)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports,...Object.values(globals));
  return module.exports;
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const policy=load('src/lib/accountPolicy.ts',{});
function client() {
  let generation=7,user={email:'me@example.com',nickname:'본인',provider:'LOCAL'},reply=async()=>new Response(JSON.stringify({...user,nickname:'새이름'}));
  const calls=[],updates=[];
  const auth={getAuthSession:async()=>({accessToken:generation===0?null:'jwt',generation}),getAuthUser:()=>user,setAuthUser:value=>{user=value;updates.push(value);}};
  const api=load('src/lib/accountSettings.ts',{'../constants/api':{API_BASE_URL:'https://api'},'./auth':auth},{fetch:async(url,options)=>{calls.push({url,options});return reply();}});
  return {api,calls,updates,auth,respond:fn=>reply=fn,session:(value,next=user)=>{generation=value;user=next;}};
}
test('shared signup rules preserve nickname normalization and password boundaries',()=>{
  assert.equal(policy.normalizeNickname('  하나 '),'하나');
  for(const value of ['ab','하나','みどり','日本語','a_123','abcdefghij']) assert.ok(policy.isValidNickname(value));
  for(const value of ['a','abcdefghijk','a b','😀😀']) assert.ok(!policy.isValidNickname(value));
  for(const value of ['Popku123!','abcdef12','a1'+'x'.repeat(70)]) assert.ok(policy.isValidPassword(value));
  for(const value of ['short1','abcdefgh','12345678','한글123456','abc 12345','a1'+'x'.repeat(71)]) assert.ok(!policy.isValidPassword(value));
  assert.equal(policy.passwordChangeError('Old12345','New12345','New12345'),null);
  for(const values of [['','New12345','New12345'],['Old12345','weak','weak'],['Old12345','New12345','Mismatch1'],['Old12345','Old12345','Old12345']]) assert.ok(policy.passwordChangeError(...values));
  const signup=readFileSync('src/app/(tabs)/profile/signup.tsx','utf8');assert.match(signup,/import \{ normalizeNickname, isValidNickname, isValidPassword \} from '..\/..\/..\/lib\/accountPolicy'/);
});
test('nickname PATCH contains no userId and updates subscribed user state using response',async()=>{
  const c=client();const signal=new AbortController().signal;
  await c.api.updateMyNickname('새이름',signal);
  assert.equal(c.calls[0].url,'https://api/api/users/me/nickname');assert.equal(c.calls[0].options.method,'PATCH');assert.equal(c.calls[0].options.signal,signal);
  assert.deepEqual(JSON.parse(c.calls[0].options.body),{nickname:'새이름'});assert.equal(c.calls[0].options.headers.Authorization,'Bearer jwt');
  assert.equal(c.auth.getAuthUser().nickname,'새이름');assert.equal(c.updates.length,1);
});
test('stale nickname response never overwrites a newer authenticated session',async()=>{
  const c=client(),gate=deferred();c.respond(()=>gate.promise);
  const pending=c.api.updateMyNickname('새이름',new AbortController().signal);await flush();
  c.session(8,{email:'other@example.com',nickname:'타인',provider:'GOOGLE'});
  gate.resolve(new Response(JSON.stringify({email:'me@example.com',nickname:'새이름',provider:'LOCAL'})));
  await assert.rejects(pending,/session changed/);assert.equal(c.auth.getAuthUser().nickname,'타인');assert.equal(c.updates.length,0);
});
test('API maps safe errors, respects authentication and only accepts password 204',async()=>{
  const c=client(),signal=new AbortController().signal;
  for(const [status,reason] of [[409,null],[400,'Current password incorrect'],[403,'Password change unavailable for social account'],[401,null],[500,null]]) {
    c.respond(async()=>new Response(JSON.stringify({error:reason}),{status}));
    await assert.rejects(c.api.changeMyPassword('Old12345','New12345','New12345',signal),error=>error.status===status&&error.authGeneration===7);
  }
  c.respond(async()=>new Response(null,{status:204}));assert.equal(await c.api.changeMyPassword('Old12345','New12345','New12345',signal),7);
  assert.deepEqual(JSON.parse(c.calls.at(-1).options.body),{currentPassword:'Old12345',newPassword:'New12345',confirmPassword:'New12345'});
  c.respond(async()=>new Response('{}',{status:200}));await assert.rejects(c.api.changeMyPassword('Old12345','New12345','New12345',signal),/Invalid/);
  c.session(0);const count=c.calls.length;await assert.rejects(c.api.updateMyNickname('새이름',signal),e=>e.status===401);assert.equal(c.calls.length,count);
});
const jsx=(type,props,key)=>({type,props,key});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
function harness() {
  const slots=[];let cursor=0,dirty=false;const effects=[];
  const changed=(old,deps)=>!old||!deps.every((v,j)=>Object.is(v,old.deps[j]));
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useCallback(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old,deps)){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
    useSyncExternalStore(subscribe,get){return get();},
  };
  return {react,render(Component){let tree,count=0;do{assert.ok(count++<25);cursor=0;dirty=false;tree=Component();effects.splice(0).forEach(fn=>fn());}while(dirty);return tree;},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
function environment(kind='nickname',provider='LOCAL') {
  const h=harness(),requests=[],routes=[],alerts=[],clears=[];let tree,listener,blur,user={email:'me@example.com',nickname:'본인',provider},available=true;
  const auth={getAuthUser:()=>user,subscribeAuthUser:()=>()=>{},subscribeAuthSession:fn=>{listener=fn;return()=>{};},
    clearTokens:async generation=>{clears.push(generation);user=null;listener?.();return true;}};
  const api=client().api;
  const native={ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',StyleSheet:{create:s=>s},Platform:{OS:'ios'},Keyboard:{dismiss(){}},Alert:{alert:(...args)=>alerts.push(args)}};
  const router={push:route=>routes.push(route),replace:route=>routes.push(route),back:()=>routes.push('back'),canGoBack:()=>true,dismissTo:route=>routes.push(route)};
  const mocks={react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>router,useFocusEffect:fn=>h.react.useEffect(()=>{blur=fn();return blur;},[fn])},
    'lucide-react-native':{ChevronLeft:'ChevronLeft',Eye:'Eye',EyeOff:'EyeOff'},'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '../../lib/auth':auth,'../../lib/accountPolicy':policy,'../../theme/tokens':load('src/theme/tokens.ts',{}),
    '../../lib/nicknameAvailability':{checkNicknameAvailability:async(nickname,signal)=>{requests.push({kind:'availability',nickname,signal});return available;}},
    '../../lib/accountSettings':{...api,
      updateMyNickname:(nickname,signal)=>{const gate=deferred();requests.push({kind:'nickname',nickname,signal,...gate});return gate.promise.then(value=>{if(!signal.aborted)user={...user,nickname:value.nickname};return value;});},
      changeMyPassword:(...values)=>{const gate=deferred();requests.push({kind:'password',values,...gate});return gate.promise;}}};
  const module=load('src/components/profile/AccountSettingsScreen.tsx',mocks,{},'\nmodule.exports.PasswordField=PasswordField;');
  const render=()=>tree=h.render(()=>module.default({kind}));
  const find=label=>nodes(tree).find(n=>n.props?.accessibilityLabel===label);
  const texts=()=>nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children);
  const settle=async()=>{await flush();render();};
  function input(label,value) { const node=find(label)??nodes(tree).find(n=>n.props?.label===label);assert.ok(node,label);(node.props.onChangeText??node.props.onChange)(value);render(); }
  render();return {requests,routes,alerts,clears,auth,mocks,module,ErrorClass:api.AccountSettingsError,render,find,texts,settle,input,save:()=>{find('저장').props.onPress();render();},available:value=>available=value,blur:()=>{blur();render();},unmount:h.unmount,tree:()=>tree};
}
test('settings menus expose nickname for all accounts and password only for LOCAL',()=>{
  for(const provider of ['LOCAL','GOOGLE']) {
    const e=environment('nickname',provider);
    const Settings=load('src/app/profile/settings.tsx',{
      '../../components/profile/ThemePreferenceSheet':{default:'ThemePreferenceSheet'},
      '../../theme/useTheme':{useTheme:()=>({themePreference:'system'})},
      react:e.mocks.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':e.mocks['expo-router'],'lucide-react-native':{ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'},
      'react-native':e.mocks['react-native'],'react-native-safe-area-context':e.mocks['react-native-safe-area-context'],
      '../../lib/auth':{...e.auth,logout:()=>assert.fail('no logout change')},'../../theme/tokens':e.mocks['../../theme/tokens'],
    }).default;
    const tree=Settings(),all=nodes(tree);all.find(n=>n.props?.accessibilityLabel==='닉네임 변경').props.onPress();assert.equal(e.routes[0],'/profile/nickname');
    assert.equal(all.some(n=>n.props?.accessibilityLabel==='비밀번호 변경'),provider==='LOCAL');e.unmount();
  }
});
test('nickname validates, skips own nickname, reuses availability and updates current display after save',async()=>{
  const e=environment();assert.ok(e.texts().includes('본인'));
  e.input('새 닉네임','a');e.save();assert.equal(e.requests.length,0);assert.ok(e.texts().some(t=>typeof t==='string'&&t.includes('2~10')));
  e.input('새 닉네임',' 본인 ');e.save();assert.equal(e.requests.length,0);assert.ok(e.texts().includes('현재 닉네임과 같아요.'));
  e.input('새 닉네임',' 새이름 ');e.save();e.save();await e.settle();assert.equal(e.requests.filter(r=>r.kind==='nickname').length,1);
  e.requests.at(-1).resolve({nickname:'새이름'});await e.settle();assert.ok(e.texts().includes('새이름'));assert.ok(e.texts().includes('닉네임이 변경됐어요.'));
  e.find('뒤로가기').props.onPress();assert.equal(e.routes[0],'back');assert.equal(e.auth.getAuthUser().nickname,'새이름');e.unmount();
});
test('nickname availability and DB UNIQUE errors remain visible, and failed PATCH can retry',async()=>{
  const e=environment();e.available(false);e.input('새 닉네임','새이름');e.save();await e.settle();assert.ok(e.texts().includes('이미 사용 중인 닉네임이에요.'));assert.equal(e.requests.filter(r=>r.kind==='nickname').length,0);
  e.available(true);e.save();await e.settle();e.requests.at(-1).reject(new e.ErrorClass(409,null,7));await e.settle();
  assert.ok(e.texts().includes('이미 사용 중인 닉네임이에요.'));e.save();await e.settle();e.requests.at(-1).reject(Error('offline'));await e.settle();
  assert.ok(e.texts().some(t=>typeof t==='string'&&t.includes('네트워크 연결')));assert.equal(e.auth.getAuthUser().nickname,'본인');e.unmount();
});
test('password visibility toggles independently without modifying input values',()=>{
  const e=environment('password');const h=harness();
  const Field=load('src/components/profile/AccountSettingsScreen.tsx',{...e.mocks,react:h.react},{},'\nmodule.exports.PasswordField=PasswordField;').PasswordField;
  let tree;const render=()=>tree=h.render(()=>Field({label:'현재 비밀번호',value:'Old12345',onChange:()=>{},pending:false,current:true}));
  render();let input=nodes(tree).find(n=>n.type==='TextInput');assert.equal(input.props.secureTextEntry,true);assert.equal(input.props.autoComplete,'current-password');
  nodes(tree).find(n=>n.props?.accessibilityLabel==='현재 비밀번호 표시').props.onPress();render();input=nodes(tree).find(n=>n.type==='TextInput');assert.equal(input.props.secureTextEntry,false);assert.equal(input.props.value,'Old12345');
  nodes(tree).find(n=>n.props?.accessibilityLabel==='현재 비밀번호 숨기기').props.onPress();render();assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.secureTextEntry,true);e.unmount();
});
test('password validates fields, locks duplicate saves, clears inputs and signs out only request generation',async()=>{
  const e=environment('password');e.save();assert.equal(e.requests.length,0);assert.ok(e.texts().includes('현재 비밀번호를 입력해 주세요.'));
  e.input('현재 비밀번호','Old12345');e.input('새 비밀번호','weak');e.input('새 비밀번호 확인','weak');e.save();assert.equal(e.requests.length,0);
  e.input('새 비밀번호','New12345');e.input('새 비밀번호 확인','different');e.save();assert.equal(e.requests.length,0);
  e.input('새 비밀번호 확인','New12345');e.save();e.save();assert.equal(e.requests.length,1);assert.equal(e.find('저장').props.disabled,true);
  e.requests[0].resolve(7);await e.settle();assert.deepEqual(e.clears,[7]);assert.equal(e.auth.getAuthUser(),null);
  assert.ok(e.texts().includes('비밀번호가 변경됐어요. 다시 로그인해 주세요.'));assert.equal(e.alerts.length,1);
  e.alerts[0][2][0].onPress();assert.deepEqual(e.routes,['/profile/login']);e.unmount();
});
test('password mismatch from server is shown and failed requests retain inputs for correction',async()=>{
  const e=environment('password');for(const [label,value] of [['현재 비밀번호','Old12345'],['새 비밀번호','New12345'],['새 비밀번호 확인','New12345']])e.input(label,value);
  e.save();e.requests[0].reject(new e.ErrorClass(400,'Current password incorrect',7));await e.settle();
  assert.ok(e.texts().includes('현재 비밀번호가 일치하지 않아요.'));assert.deepEqual(e.clears,[]);
  assert.equal(nodes(e.tree()).find(n=>n.props?.label==='현재 비밀번호').props.value,'Old12345');e.unmount();
});
test('social accounts cannot submit password changes and expired JWT clears current session',async()=>{
  const social=environment('password','GOOGLE');assert.equal(social.find('저장'),undefined);assert.ok(social.texts().includes('소셜 로그인 계정은 비밀번호를 변경할 수 없어요.'));assert.equal(social.requests.length,0);social.unmount();
  const e=environment();e.input('새 닉네임','새이름');e.save();await e.settle();e.requests.at(-1).reject(new e.ErrorClass(401,null,7));await e.settle();assert.deepEqual(e.clears,[7]);assert.equal(e.find('저장'),undefined);assert.equal(e.requests.length,2);e.unmount();
});
test('blur aborts save and clears password drafts; keyboard layout supports scrolling and iOS avoidance',()=>{
  const e=environment('password');e.input('현재 비밀번호','Old12345');e.input('새 비밀번호','New12345');e.input('새 비밀번호 확인','New12345');e.save();
  const all=nodes(e.tree());assert.equal(all.find(n=>n.type==='KeyboardAvoidingView').props.behavior,'padding');assert.equal(all.find(n=>n.type==='ScrollView').props.keyboardShouldPersistTaps,'handled');
  e.blur();assert.ok(e.requests[0].values[3].aborted);assert.equal(nodes(e.tree()).find(n=>n.props?.label==='현재 비밀번호').props.value,'');e.requests[0].reject(Error('aborted'));e.unmount();
});
