const { savedToken } = require('./helpers/authStorage.cjs');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const {runtime,nodes,texts,flush}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const loginFile='src/app/(tabs)/profile/login.tsx',signupFile='src/app/(tabs)/profile/signup.tsx';
const appTokens={accessToken:'popku-access',refreshToken:'popku-refresh'};
const challenge={challengeId:'challenge-id',nonce:'server-raw-nonce',expiresInSeconds:300};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function setup(options={}){
  const calls=[],nativeCalls=[],routes=[],storage=new Map(),bailouts=[];
  let focused=true,params=options.params??{},tags=['ja-JP'];
  const router={push:x=>routes.push(['push',x]),replace:x=>routes.push(['replace',x]),dismissTo:x=>routes.push(['dismissTo',x]),
    back:()=>routes.push(['back']),canGoBack:()=>true,setParams:x=>routes.push(['setParams',x])};
  const navigation={getState:()=>({index:1,routes:[{key:'popup',name:'places/[id]',params:{id:'popup'}},{key:'login',name:'login'}]})};
  const native=Object.fromEntries(['View','Text','TextInput','Pressable','ScrollView','KeyboardAvoidingView','ActivityIndicator'].map(x=>[x,x]));
  Object.assign(native,{Platform:{OS:options.os??'ios'},StyleSheet:{create:x=>x},Keyboard:{dismiss(){}}});
  const appleNative={AppleAuthenticationButton:'AppleButton',AppleAuthenticationButtonType:{CONTINUE:2},AppleAuthenticationButtonStyle:{BLACK:2},AppleAuthenticationScope:{EMAIL:0},
    isAvailableAsync:async()=>{nativeCalls.push(['available']);if(options.availableError)throw Error('missing native module');return options.available!==false;},
    signInAsync:async request=>{nativeCalls.push(['signin',request]);if(options.nativeError)throw options.nativeError;
      if(options.nativeGate)await options.nativeGate.promise;
      return {identityToken:options.missingIdentity?null:'apple-identity',
        authorizationCode:options.authorizationCode===undefined?'apple-code':options.authorizationCode,
        user:'untrusted-user',email:null};}};
  const ui=runtime({
    'react-native':native,'expo-apple-authentication':appleNative,
    'expo-image':{Image:'ExpoImage'},'expo-font':{useFonts:()=>[options.fontReady!==false]},
    'expo-router':{useRouter:()=>router,useNavigation:()=>navigation,useLocalSearchParams:()=>params,
      useFocusEffect:fn=>ui.react.useEffect(()=>focused?fn():undefined,[fn,focused])},
    'expo-router/react-navigation':{usePreventRemove(){}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    'lucide-react-native':{ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight',Check:'Check'},
    'expo-secure-store':{isAvailableAsync:async()=>true,getItemAsync:async key=>storage.get(key)??null,
      setItemAsync:async(key,value)=>storage.set(key,value),deleteItemAsync:async key=>storage.delete(key)},
    'src/constants/api.ts':{API_BASE_URL:'https://api'},
    'src/lib/favoriteCache.ts':{clearFavoriteCache(){}},'src/lib/communityFeedRefresh.ts':{clearCommunityLikes(){}},
    'src/lib/nicknameAvailability.ts':{checkNicknameAvailability:async nickname=>{calls.push(['nickname',nickname]);return true;}},
    fetch:async(url,init={})=>{
      const path=new URL(url).pathname;calls.push([path,init]);
      if(options.gatePath===path)await options.apiGate.promise;
      if(options.networkPath===path)throw new TypeError('network failed');
      if(options.failPath===path)return new Response(JSON.stringify({error:options.errorCode??'unauthorized',message:'sensitive server text'}),{status:options.status??401});
      const body=path.endsWith('/challenge')?(options.challenge??challenge):path.endsWith('/complete')?appTokens:
        path.endsWith('/me')?{id:7,nickname:'회원',email:'relay@privaterelay.appleid.com',provider:'APPLE'}:
        options.loginResult??appTokens;
      return new Response(JSON.stringify(body),{status:path.endsWith('/complete')?201:200});
    },
  },{transform:compilerTransform([loginFile,signupFile,'src/hooks/useTranslation.ts'],{
    allowBailout:[loginFile],onBailout:file=>bailouts.push(file)})});
  const language=ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>tags});
  const apple=ui.load('src/lib/appleAuth.ts'),google=ui.load('src/lib/googleAuth.ts'),auth=ui.load('src/lib/auth.ts');
  const settle=async()=>{for(let i=0;i<4;i++)await flush();};
  let root;
  const mount=(file=loginFile)=>{const Screen=ui.load(file).default;root=ui.mount(()=>Screen());return root;};
  const button=label=>nodes(root.tree).find(n=>n.type==='Pressable'&&(texts(n)===label||n.props.accessibilityLabel===label));
  return {ui,apple,google,auth,calls,nativeCalls,routes,storage,options,bailouts,settle,mount,button,
    appleButton:()=>nodes(root.tree).find(n=>n.props?.testID==='apple-login-button'),root:()=>root,
    leave(){focused=false;ui.renderAll();},
    signup(){params={mode:'apple',...(options.params??{})};apple.beginAppleSignup('apple-signup',600);return mount(signupFile);},
    language:pref=>language.setLanguagePreference(pref),system(tag){tags=[tag];language.refreshSystemLanguage();},
    dispose:()=>ui.dispose(),
  };
}

test('Apple contract: bodyless challenge, raw nonce, EMAIL scope and only trusted API fields',async()=>{
  const s=await setup(),result=await s.apple.authenticateWithApple();
  assert.deepEqual(result,{kind:'existing',tokens:appTokens});
  assert.equal(s.calls[0][0],'/api/auth/apple/challenge');assert.equal(s.calls[0][1].method,'POST');assert.equal(s.calls[0][1].body,undefined);
  assert.deepEqual(s.nativeCalls.find(x=>x[0]==='signin')[1],{nonce:challenge.nonce,requestedScopes:[0]});
  assert.deepEqual(JSON.parse(s.calls[1][1].body),{identityToken:'apple-identity',authorizationCode:'apple-code',challengeId:challenge.challengeId,deviceId:'device'});
  assert.equal(s.storage.size,0,'Apple identity must never be stored as app JWT');s.dispose();
});
test('null authorizationCode retains the backend compatibility policy without storing credentials',async()=>{
  const s=await setup({authorizationCode:null});
  assert.deepEqual(await s.apple.authenticateWithApple(),{kind:'existing',tokens:appTokens});
  assert.equal(JSON.parse(s.calls[1][1].body).authorizationCode,null);
  assert.equal(s.storage.size,0);s.dispose();
});
test('failed Apple request is not retried automatically; a new attempt uses a fresh native code',async()=>{
  const s=await setup({failPath:'/api/auth/apple',status:503,authorizationCode:'first-code'});
  await assert.rejects(s.apple.authenticateWithApple(),e=>e.status===503);
  assert.equal(s.calls.filter(x=>x[0]==='/api/auth/apple').length,1);
  assert.equal(s.nativeCalls.filter(x=>x[0]==='signin').length,1);
  s.options.failPath=undefined;s.options.authorizationCode='fresh-code';
  assert.deepEqual(await s.apple.authenticateWithApple(),{kind:'existing',tokens:appTokens});
  assert.equal(s.calls.filter(x=>x[0]==='/api/auth/apple/challenge').length,2);
  assert.equal(s.nativeCalls.filter(x=>x[0]==='signin').length,2);
  const requests=s.calls.filter(x=>x[0]==='/api/auth/apple');
  assert.deepEqual(requests.map(x=>JSON.parse(x[1].body).authorizationCode),['first-code','fresh-code']);
  assert.equal(s.storage.size,0);s.dispose();
});
test('Apple signup token is separate from Google, expires locally and completes with exact consents',async()=>{
  const s=await setup({loginResult:{status:'SIGNUP_REQUIRED',signupToken:'apple-signup',expiresInSeconds:600}});
  const result=await s.apple.authenticateWithApple();assert.equal(result.kind,'signup');
  s.apple.beginAppleSignup(result.signupToken,600);s.google.beginGoogleSignup('google-signup',600);
  assert.equal(s.apple.getAppleSignupToken(),'apple-signup');assert.equal(s.google.getGoogleSignupToken(),'google-signup');
  const request={signupToken:'apple-signup',nickname:'닉네임',ageConfirmed:true,consents:{termsOfService:true,privacyPolicy:true,marketing:false},deviceId:'phone'};
  assert.deepEqual(await s.apple.completeAppleSignup(request),appTokens);
  assert.deepEqual(JSON.parse(s.calls.at(-1)[1].body),request);
  s.apple.clearAppleSignup();assert.equal(s.google.getGoogleSignupToken(),'google-signup');
  s.apple.beginAppleSignup('expired',-1);assert.equal(s.apple.getAppleSignupToken(),null);s.dispose();
});
for(const os of ['android','web'])test(`${os}: no native calls, API calls or Apple button`,async()=>{
  const s=await setup({os});s.mount();await s.settle();assert.equal(s.appleButton(),undefined);
  assert.equal(await s.apple.isAppleAuthenticationAvailable(),false);
  await assert.rejects(s.apple.authenticateWithApple(),e=>e.code==='unavailable');
  assert.deepEqual(s.nativeCalls,[]);assert.deepEqual(s.calls,[]);s.dispose();
});
test('unavailable/missing native module hides the button safely',async()=>{
  for(const options of [{available:false},{availableError:true}]){
    const s=await setup(options);s.mount();await s.settle();assert.equal(s.appleButton(),undefined);assert.deepEqual(s.calls,[]);s.dispose();
  }
});
test('cancellation is silent; native failure, missing token and malformed API payload fail safely',async()=>{
  const cancelled=await setup({nativeError:{code:'ERR_REQUEST_CANCELED'}});
  cancelled.mount();await cancelled.settle();cancelled.appleButton().props.onPress();await cancelled.settle();
  assert.equal(cancelled.calls.length,1);assert.equal(cancelled.storage.size,0);assert.deepEqual(cancelled.routes,[]);
  assert.ok(!texts(cancelled.root().tree).includes('실패'));cancelled.dispose();
  for(const options of [{nativeError:Error('nonce=secret')},{missingIdentity:true},{challenge:{}},
    {loginResult:{status:'SIGNUP_REQUIRED',signupToken:'x',expiresInSeconds:0}}, {loginResult:{accessToken:'apple-identity'}}]){
    const s=await setup(options);await assert.rejects(s.apple.authenticateWithApple(),e=>e instanceof s.apple.AppleAuthError&&!e.message.includes('secret'));
    assert.equal(s.storage.size,0);s.dispose();
  }
  assert.doesNotMatch(fs.readFileSync('src/lib/appleAuth.ts','utf8'),/console\./);
});
test('existing Apple user saves only app tokens, loads /me, returns once and blocks all duplicate methods',async()=>{
  const apiGate=deferred(),s=await setup({params:{intent:'review',publicId:'popup'},gatePath:'/api/auth/apple',apiGate});
  s.mount();await s.settle();const press=s.appleButton().props.onPress;press();press();
  s.button('Google로 계속하기').props.onPress();s.button('로그인').props.onPress();await s.settle();
  assert.equal(s.calls.filter(x=>x[0]==='/api/auth/apple/challenge').length,1);
  assert.equal(s.appleButton().props.accessibilityState.busy,true);
  apiGate.resolve();await s.settle();
  assert.equal(savedToken(s.storage, 'accessToken'),'popku-access');assert.equal(savedToken(s.storage, 'refreshToken'),'popku-refresh');
  assert.equal(s.auth.getAuthUser().provider,'APPLE');assert.equal(s.calls.filter(x=>x[0]==='/api/users/me').length,1);
  assert.deepEqual(s.routes,[['replace',{pathname:'/reviews/write',params:{publicId:'popup'}}]]);s.dispose();
});
test('new Apple user goes to scoped signup without putting any token in navigation or storage',async()=>{
  const s=await setup({params:{intent:'resume',resumeKey:'draft'},loginResult:{status:'SIGNUP_REQUIRED',signupToken:'apple-signup',expiresInSeconds:600}});
  s.mount();await s.settle();s.appleButton().props.onPress();await s.settle();
  assert.deepEqual(s.routes,[['push',{pathname:'/signup',params:{intent:'resume',resumeKey:'draft',mode:'apple'}}]]);
  assert.equal(s.apple.getAppleSignupToken(),'apple-signup');assert.equal(s.google.getGoogleSignupToken(),null);assert.equal(s.storage.size,0);s.dispose();
});
for(const phase of ['challenge','native','login','profile'])test(`leaving during ${phase} prevents stale Apple login/navigation`,async()=>{
  const gate=deferred(),options=phase==='native'?{nativeGate:gate}:{gatePath:{challenge:'/api/auth/apple/challenge',login:'/api/auth/apple',profile:'/api/users/me'}[phase],apiGate:gate};
  const s=await setup(options);s.mount();await s.settle();s.appleButton().props.onPress();await s.settle();s.leave();gate.resolve();await s.settle();
  assert.equal(s.auth.getAuthUser(),null);assert.equal(s.storage.size,0);assert.deepEqual(s.routes,[]);
  if(phase==='challenge')assert.equal(s.nativeCalls.some(x=>x[0]==='signin'),false);
  if(phase==='native')assert.equal(s.calls.some(x=>x[0]==='/api/auth/apple'),false);s.dispose();
});
test('network/challenge/409/503 errors preserve prior session and update ko-ja-ko/system without new calls',async()=>{
  for(const options of [{networkPath:'/api/auth/apple/challenge'},
    {failPath:'/api/auth/apple',status:401},{failPath:'/api/auth/apple',status:409,errorCode:'email_already_registered'},
    {failPath:'/api/auth/apple',status:401,errorCode:'apple_email_required'},
    {failPath:'/api/auth/apple/challenge',status:503,errorCode:'apple_verification_unavailable'}]){
    const s=await setup(options);await s.auth.saveTokens({accessToken:'prior-access',refreshToken:'prior-refresh'});
    s.auth.setAuthUser({nickname:'이전 회원',email:'prior@test'});s.mount();await s.settle();
    const inputs=nodes(s.root().tree).filter(n=>n.type==='TextInput');inputs[0].props.onChangeText('raw@test');inputs[1].props.onChangeText('rawPassword');
    s.appleButton().props.onPress();await s.settle();const calls=s.calls.length,ko=texts(s.root().tree),slots=s.root().slots;
    assert.equal(savedToken(s.storage, 'accessToken'),'prior-access');assert.equal(s.auth.getAuthUser().nickname,'이전 회원');assert.deepEqual(s.routes,[]);
    await s.language('ja');assert.notEqual(texts(s.root().tree),ko);await s.language('ko');assert.equal(texts(s.root().tree),ko);
    await s.language('system');s.system('ko-KR');assert.equal(texts(s.root().tree),ko);
    assert.equal(s.root().slots,slots);assert.equal(s.calls.length,calls);assert.deepEqual(nodes(s.root().tree).filter(n=>n.type==='TextInput').map(n=>n.props.value),['raw@test','rawPassword']);
    assert.ok(s.bailouts.includes(loginFile),'existing finally-based login compiler bailout is reported');s.dispose();
  }
});
test('custom Apple/Google buttons use local official assets, left-fixed logos and independently centered titles',async()=>{
  const s=await setup();s.mount();await s.settle();const b=s.appleButton();
  const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
  const google=s.button('Google로 계속하기');
  for(const button of [google,b]){
    const style=flat(button.props.style);assert.equal(style.height,52);assert.equal(style.width,'100%');assert.equal(style.borderRadius,8);
    assert.equal(style.alignItems,'center');assert.equal(style.justifyContent,'center');assert.equal(button.props.accessibilityRole,'button');assert.equal(button.props.disabled,false);
    const group=nodes(button).find(n=>n.type==='View');assert.equal(group.props.style.width,'100%');assert.equal(group.props.style.height,'100%');assert.equal(group.props.style.justifyContent,'center');assert.equal(group.props.style.flexDirection,undefined);assert.equal(group.props.style.gap,undefined);assert.equal(group.props.style.alignItems,'center');
  }
  assert.equal(flat(google.props.style).backgroundColor,'#F2F2F2');assert.equal(flat(google.props.style).borderWidth,undefined);
  assert.equal(flat(b.props.style).backgroundColor,'#000000');assert.equal(flat(b.props.style).paddingHorizontal,undefined);
  const gtext=flat(nodes(google).find(n=>n.type==='Text').props.style),atext=flat(nodes(b).find(n=>n.type==='Text').props.style);
  assert.equal(gtext.fontSize,18);assert.equal(gtext.lineHeight,22);assert.equal(gtext.width,'100%');assert.equal(gtext.textAlign,'center');assert.equal(gtext.fontWeight,'500');assert.equal(gtext.fontFamily,'GoogleSansMedium');assert.equal(gtext.color,'#1F1F1F');
  assert.equal(atext.fontSize,18);assert.equal(atext.lineHeight,22);assert.equal(atext.width,'100%');assert.equal(atext.textAlign,'center');assert.equal(atext.fontWeight,'500');assert.equal(atext.color,'#FFFFFF');
  const glogo=nodes(google).find(n=>n.type==='ExpoImage'),alogo=nodes(b).find(n=>n.type==='ExpoImage');
  assert.deepEqual(glogo.props.style,{position:'absolute',left:24,width:20,height:20});assert.equal(alogo.props.style.position,'absolute');const appleVisibleCenter=alogo.props.style.left+(7.75+23.2109027)/2*alogo.props.style.height/44;const googleVisibleCenter=glogo.props.style.left+glogo.props.style.width/2;assert.ok(Math.abs(appleVisibleCenter-googleVisibleCenter)<0.000001);assert.ok(alogo.props.style.left<24);assert.equal(alogo.props.style.height,52);assert.equal(alogo.props.style.width,31*52/44);
  assert.ok(glogo.props.source.endsWith('assets/images/auth/google-g.png'));assert.ok(alogo.props.source.endsWith('assets/images/auth/apple-logo-white.svg'));
  assert.equal(alogo.props.contentFit,'contain');assert.equal(alogo.props.accessible,false);
  const tree=nodes(s.root().tree);assert.ok(tree.indexOf(s.button('Google로 계속하기'))<tree.indexOf(b));s.dispose();
});

test('custom sign-in captions update ko-ja-ko/system without authentication calls, input resets or handler changes',async()=>{
  const s=await setup();s.mount();await s.settle();
  nodes(s.root().tree).find(n=>n.type==='TextInput').props.onChangeText('member@example.com');
  const calls=s.calls.length,signinCalls=s.nativeCalls.filter(c=>c[0]==='signin').length,slots=s.root().slots;
  for(const [language,google,apple]of [['ja','Googleで続ける','Appleで続ける'],['ko','Google로 계속하기','Apple로 계속하기'],['system','Googleで続ける','Appleで続ける']]){
    await s.language(language);assert.ok(s.button(google));assert.equal(s.appleButton().props.accessibilityLabel,apple);assert.ok(texts(s.appleButton()).includes(apple));
    assert.equal(nodes(s.root().tree).find(n=>n.type==='TextInput').props.value,'member@example.com');assert.equal(s.root().slots,slots);
    assert.equal(s.calls.length,calls);assert.equal(s.nativeCalls.filter(c=>c[0]==='signin').length,signinCalls);
  }
  s.system('ko-KR');assert.equal(s.appleButton().props.accessibilityLabel,'Apple로 계속하기');s.dispose();
});
test('login separator reacts to ko-ja-ko and system changes while preserving inputs and API calls',async()=>{
  const s=await setup();s.mount();await s.settle();
  const inputs=()=>nodes(s.root().tree).filter(n=>n.type==='TextInput');
  inputs()[0].props.onChangeText('member@example.com');inputs()[1].props.onChangeText('typed-password');
  const calls=s.calls.length;
  const check=label=>{
    assert.ok(nodes(s.root().tree).some(n=>n.type==='Text'&&texts(n)===label));
    assert.deepEqual(inputs().map(n=>n.props.value),['member@example.com','typed-password']);
    assert.equal(s.calls.length,calls);
  };
  check('또는');await s.language('ja');check('または');await s.language('ko');check('또는');
  await s.language('system');check('または');s.system('ko-KR');check('또는');s.dispose();
});
async function fillSignup(s){
  s.signup();await s.settle();assert.equal(nodes(s.root().tree).filter(n=>n.type==='TextInput').length,1);
  const nickname=nodes(s.root().tree).find(n=>n.type==='TextInput');nickname.props.onChangeText('새회원');
  s.button('다음').props.onPress();await s.settle();
  const consents=nodes(s.root().tree).filter(n=>n.type?.name==='ConsentRow');
  assert.equal(consents.length,2);consents[0].props.onToggle();consents[1].props.onToggle();
  s.button('[필수] 만 14세 이상입니다.').props.onPress();
}
test('Apple nickname and required consents signup retains ko-ja-ko state, tokens and return target',async()=>{
  const s=await setup({params:{intent:'review',publicId:'popup'}});await fillSignup(s);
  const state=s.root().slots,calls=s.calls.length;
  for(const lang of ['ja','ko','system']){await s.language(lang);assert.equal(s.root().slots,state);assert.equal(s.calls.length,calls);}
  s.system('ko-KR');const join=s.button('가입하기');assert.equal(join.props.disabled,false);join.props.onPress();join.props.onPress();await s.settle();
  assert.deepEqual(JSON.parse(s.calls.find(x=>x[0]==='/api/auth/apple/complete')[1].body),{
    signupToken:'apple-signup',nickname:'새회원',ageConfirmed:true,consents:{termsOfService:true,privacyPolicy:true,marketing:false},deviceId:'device'});
  assert.equal(s.calls.filter(x=>x[0]==='/api/auth/apple/complete').length,1);assert.equal(savedToken(s.storage, 'accessToken'),'popku-access');
  assert.deepEqual(s.routes,[['dismissTo',{pathname:'/login',params:{intent:'review',publicId:'popup',completedGeneration:String(s.auth.authSessionGeneration())}}]]);
  assert.equal(s.apple.getAppleSignupToken(),null);s.dispose();
});
test('signup expiration/conflict/network failure remain retryable without session mutation',async()=>{
  for(const options of [{failPath:'/api/auth/apple/complete',status:401},{failPath:'/api/auth/apple/complete',status:409,errorCode:'signup_conflict'},
    {networkPath:'/api/auth/apple/complete'}]){
    const s=await setup(options);await fillSignup(s);s.button('가입하기').props.onPress();await s.settle();
    assert.equal(s.storage.size,0);assert.deepEqual(s.routes,[]);assert.equal(s.button('가입하기').props.disabled,false);
    const ko=texts(s.root().tree);await s.language('ja');assert.notEqual(texts(s.root().tree),ko);await s.language('ko');assert.equal(texts(s.root().tree),ko);s.dispose();
  }
});
test('signup cancellation clears only Apple ticket; expired or absent ticket never submits',async()=>{
  const s=await setup();s.google.beginGoogleSignup('google-ticket',600);s.signup();await s.settle();
  s.button('뒤로가기').props.onPress();assert.equal(s.apple.getAppleSignupToken(),null);assert.equal(s.google.getGoogleSignupToken(),'google-ticket');s.dispose();
  const absent=await setup({params:{mode:'apple'}});absent.mount(signupFile);await absent.settle();assert.deepEqual(absent.routes,[['dismissTo',{pathname:'/login',params:{}}]]);absent.dispose();
  const expired=await setup();await fillSignup(expired);expired.apple.beginAppleSignup('expired',-1);expired.button('가입하기').props.onPress();await expired.settle();
  assert.ok(texts(expired.root().tree).includes('Apple 가입 시간이 만료'));assert.equal(expired.calls.some(x=>x[0].endsWith('/complete')),false);expired.dispose();
});

test('expired challenge never sends identity to the server; every retry obtains a fresh challenge',async()=>{
  const s=await setup({challenge:{...challenge,expiresInSeconds:Number.MIN_VALUE}});
  await assert.rejects(s.apple.authenticateWithApple(),e=>e.code==='challenge_expired');
  assert.equal(s.calls.length,1);s.options.challenge=challenge;
  assert.deepEqual(await s.apple.authenticateWithApple(),{kind:'existing',tokens:appTokens});
  assert.equal(s.calls.filter(x=>x[0]==='/api/auth/apple/challenge').length,2);s.dispose();
});
test('leaving during Apple signup completion prevents late token/profile/navigation updates',async()=>{
  const apiGate=deferred(),s=await setup({gatePath:'/api/auth/apple/complete',apiGate});await fillSignup(s);
  s.button('가입하기').props.onPress();await s.settle();s.leave();apiGate.resolve();await s.settle();
  assert.equal(s.storage.size,0);assert.equal(s.auth.getAuthUser(),null);assert.deepEqual(s.routes,[]);s.dispose();
});
test('Apple /me failure clears its incomplete tokens and does not navigate; later retry can succeed',async()=>{
  const s=await setup({failPath:'/api/users/me',status:500});s.mount();await s.settle();
  s.appleButton().props.onPress();await s.settle();assert.equal(s.storage.size,0);assert.equal(s.auth.getAuthUser(),null);assert.deepEqual(s.routes,[]);
  s.options.failPath=null;s.appleButton().props.onPress();await s.settle();assert.equal(savedToken(s.storage, 'accessToken'),'popku-access');assert.deepEqual(s.routes,[['replace','/(tabs)']]);s.dispose();
});
