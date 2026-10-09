const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runtime,nodes,texts,flush}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const settingsFile='src/app/profile/settings.tsx',languageFile='src/app/profile/language.tsx';
const key='poparchive.languagePreference';

async function app(saved='ko',canGoBack=true) {
  const stored=new Map([[key,saved],['poparchive.themePreference','dark']]),writes=[],routes=[],calls=[],bailouts=[];
  let tags=['ja-JP'];
  const ui=runtime({
    'react-native':{...Object.fromEntries(['View','Text','Pressable','ScrollView','ActivityIndicator'].map(n=>[n,n])),
      StyleSheet:{create:s=>s,hairlineWidth:1},Alert:{alert(){}}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    'lucide-react-native':{ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'},
    'expo-router':{useRouter:()=>({push:r=>routes.push(r),back:()=>routes.push('back'),
      replace:r=>routes.push(r),canGoBack:()=>canGoBack,dismissTo:r=>routes.push(r)})},
    'src/lib/auth.ts':{getAuthUser:()=>({id:1,provider:'LOCAL'}),subscribeAuthUser:()=>()=>{},logout:async()=>calls.push('logout')},
    '@react-native-async-storage/async-storage':{getItem:async k=>stored.get(k)??null,
      setItem:async(k,v)=>{writes.push([k,v]);stored.set(k,v);}},
    'expo-secure-store':{deleteItemAsync:async()=>{},getItemAsync:async()=>null},
    'src/components/profile/ThemePreferenceSheet.tsx':{__esModule:true,default:'ThemePreferenceSheet'},
    fetch:()=>assert.fail('language changes must not request data'),
  },{transform:compilerTransform([settingsFile,languageFile,'src/hooks/useTranslation.ts'],{
    allowBailout:[settingsFile],onBailout:f=>bailouts.push(f),
  })});
  const language=ui.load('src/locales/languageStore.ts').languageStore;
  const storage=ui.load('src/locales/languageStorage.ts');
  await language.initialize({read:storage.readLanguagePreference,write:storage.writeLanguagePreference,getLanguageTags:()=>tags});
  const theme=ui.load('src/theme/themeStore.ts').themeStore;
  await theme.initialize({read:async()=> 'dark',write:async()=>assert.fail('language must not write theme'),getColorScheme:()=> 'dark'});
  const Settings=ui.load(settingsFile).default,Language=ui.load(languageFile).default;
  const settings=ui.mount(()=>Settings()),screen=ui.mount(()=>Language());
  const radios=()=>nodes(screen.tree).filter(n=>n.props?.accessibilityRole==='radio');
  return {...ui,stored,writes,routes,calls,bailouts,language,theme,settings,screen,radios,
    async choose(value){radios().find(n=>n.key===value).props.onPress();await flush();await flush();},
    os(tag){tags=[tag];language.refreshSystemLanguage();},
  };
}

test('flat settings order, Root language link and native back fallback preserve account actions',async()=>{
  const s=await app();
  const rows=nodes(s.settings.tree).filter(n=>n.type==='Pressable').slice(1);
  assert.deepEqual(rows.map(n=>texts(n)),['닉네임 변경','비밀번호 변경','언어 설정','로그아웃','회원탈퇴']);
  assert.equal(nodes(s.settings.tree).some(n=>n.props?.accessibilityRole==='radio'),false);
  assert.ok(!texts(s.settings.tree).includes('앱 언어'));assert.ok(!texts(s.settings.tree).includes('계정'));
  for(const [index,route] of [[0,'/profile/nickname'],[1,'/profile/password'],[2,'/profile/language'],[4,'/profile/withdrawal']]){
    rows[index].props.onPress();assert.equal(s.routes.at(-1),route);
  }
  nodes(s.screen.tree).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();
  assert.equal(s.routes.at(-1),'back');s.dispose();
  const direct=await app('ko',false);
  nodes(direct.screen.tree).find(n=>n.props?.accessibilityLabel==='뒤로가기').props.onPress();
  assert.deepEqual(direct.routes,['/profile/settings']);direct.dispose();
});

test('Compiler output updates retained settings/language UI ko→ja→ko/system and saves without theme/API changes',async()=>{
  const s=await app(),settingsSlots=s.settings.slots,screenSlots=s.screen.slots,snapshot=s.theme.getSnapshot();
  assert.deepEqual(s.radios().map(n=>texts(n)),['시스템 설정','한국어','日本語']);
  for(const [value,title,systemLabel] of [['ja','言語設定','システム設定'],['ko','언어 설정','시스템 설정'],['system','言語設定','システム設定']]){
    await s.choose(value);
    assert.ok(texts(s.settings.tree).includes(title));assert.ok(texts(s.screen.tree).includes(title));
    assert.equal(s.radios()[0].props.accessibilityLabel,systemLabel);
    assert.deepEqual(s.radios().filter(n=>n.props.accessibilityState.checked).map(n=>n.key),[value]);
    assert.equal(s.stored.get(key),value);assert.equal(s.theme.getSnapshot(),snapshot);
    assert.equal(s.settings.slots,settingsSlots);assert.equal(s.screen.slots,screenSlots);
  }
  s.os('ko-KR');assert.ok(texts(s.screen.tree).includes('언어 설정'));assert.ok(texts(s.settings.tree).includes('언어 설정'));
  s.os('ja-JP');assert.ok(texts(s.screen.tree).includes('言語設定'));
  assert.deepEqual(s.writes,[[key,'ja'],[key,'ko'],[key,'system']]);
  assert.equal(s.stored.get('poparchive.themePreference'),'dark');assert.deepEqual(s.calls,[]);assert.deepEqual(s.routes,[]);
  if(s.bailouts.length)console.log('Settings retains existing Compiler bailout; LanguageSettings is compiled without bailout');
  s.dispose();
});

test('saved system/ko/ja choices restore checked radios on fresh language screen mounts',async()=>{
  for(const value of ['system','ko','ja']){
    const first=await app();await first.choose(value);const saved=first.stored.get(key);first.dispose();
    const next=await app(saved);
    assert.deepEqual(next.radios().filter(n=>n.props.accessibilityState.checked).map(n=>n.key),[value]);
    assert.deepEqual(next.writes,[]);next.dispose();
  }
});
