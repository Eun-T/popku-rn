const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const settingsFile = 'src/app/profile/settings.tsx';
const sheetFile = 'src/components/profile/ThemePreferenceSheet.tsx';
const style = node => Object.assign({}, ...[node.props.style].flat().filter(Boolean));

async function app({ saved = null, failWrite = false, user = { id:7, provider:'LOCAL' }, enabled = true } = {}) {
  let scheme = 'light';
  const stored = new Map(saved ? [['poparchive.themePreference',saved]] : []), writes = [], calls = [], routes = [], bailouts = [];
  const ui = runtime({
    'src/theme/themeFeature.js': { DARK_MODE_ENABLED:enabled },
    'react-native': { ...Object.fromEntries(['View','Text','Modal','Pressable','ScrollView','ActivityIndicator'].map(n=>[n,n])),
      StyleSheet:{create:x=>x,hairlineWidth:1,absoluteFill:{position:'absolute'}},Alert:{alert(){}} },
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:34,left:0,right:0})},
    'lucide-react-native':Object.fromEntries(['ChevronLeft','ChevronRight','Check','X'].map(n=>[n,n])),
    'expo-router':{useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r),back:()=>routes.push('back'),
      canGoBack:()=>true,dismissTo:r=>routes.push(r)})},
    'src/lib/auth.ts':{getAuthUser:()=>user,subscribeAuthUser:()=>()=>{},logout:async()=>{calls.push('logout');user=null;}},
    '@react-native-async-storage/async-storage':{getItem:async k=>stored.get(k)??null,setItem:async(k,v)=>{
      writes.push([k,v]);if(failWrite)throw Error('storage');stored.set(k,v);
    }},
    fetch:async()=>{calls.push('fetch');throw Error('unexpected request');},
  },{transform:compilerTransform([settingsFile,sheetFile,'src/theme/useTheme.ts','src/hooks/useTranslation.ts'],{
    allowBailout:[settingsFile],onBailout:file=>bailouts.push(file),
  })});
  const theme = ui.load('src/theme/themeStore.ts').themeStore;
  const storage = ui.load('src/theme/themeStorage.ts');
  const environment = {read:storage.readThemePreference,write:storage.writeThemePreference,getColorScheme:()=>scheme};
  await theme.initialize(environment);
  const language = ui.load('src/locales/languageStore.ts').languageStore;
  let languageTags = ['ja-JP'];
  await language.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>languageTags});
  const Settings = ui.load(settingsFile).default, root = ui.mount(()=>Settings());
  const sheetNode = ()=>nodes(root.tree).find(n=>n.type?.name==='ThemePreferenceSheet');
  const sheet = ui.mount(()=>{const n=sheetNode();return n.type(n.props);});
  const renderSheet = ()=>sheet.render();
  const themeRow = ()=>nodes(root.tree).find(n=>n.props?.accessibilityLabel?.startsWith(
    ui.load('src/locales/index.ts').translate(language.getSnapshot().resolvedLanguage,'account.settings.theme.title')+', '));
  return {...ui,root,sheet,theme,language,environment,stored,writes,calls,routes,bailouts,themeRow,
    open(){themeRow().props.onPress();renderSheet();},
    choose(value){nodes(sheet.tree).find(n=>n.type==='Pressable'&&n.key===value).props.onPress();renderSheet();},
    os(value){scheme=value;theme.refreshSystemTheme();},
    async lang(value){await language.setLanguagePreference(value);},
    systemLanguage(tag){languageTags=[tag];language.refreshSystemLanguage();},
    async settle(){await flush();await flush();},
  };
}

test('settings menu with compiled sheet chooses all modes immediately, checks current value and skips duplicate writes', async () => {
  const s = await app(), slots = s.root.slots;
  assert.ok(texts(s.themeRow()).includes('시스템')); s.open();
  assert.equal(nodes(s.sheet.tree).find(n=>n.key==='system').props.accessibilityState.checked,true);
  for(const [value,label,resolved] of [['dark','다크','dark'],['light','라이트','light'],['system','시스템','light']]) {
    s.choose(value);
    assert.equal(s.theme.getSnapshot().themePreference,value);
    assert.equal(s.theme.getSnapshot().resolvedTheme,resolved);
    assert.ok(texts(s.themeRow()).includes(label)); assert.equal(s.sheet.tree,null);
    await s.settle(); assert.equal(s.stored.get('poparchive.themePreference'),value);
    s.open();
    for(const option of nodes(s.sheet.tree).filter(n=>n.props?.accessibilityRole==='radio')) {
      assert.equal(option.props.accessibilityState.checked,option.key===value);
      assert.equal(nodes(option).some(n=>n.type==='Check'),option.key===value);
    }
    const snapshot=s.theme.getSnapshot(),count=s.writes.length;
    s.choose(value);await s.settle();assert.equal(s.writes.length,count);assert.equal(s.theme.getSnapshot(),snapshot);s.open();
  }
  assert.equal(s.root.slots,slots);assert.deepEqual(s.calls,[]);assert.deepEqual(s.routes,[]);
  if(s.bailouts.length) console.log('Settings Compiler optimization skipped: existing logout try/finally; sheet and Hooks compiled successfully');
  s.dispose();
});

test('open compiled sheet follows OS only in system and updates readable tokens without remounting',async()=>{
  const s=await app();s.open();const slots=s.sheet.slots;
  const panel=()=>nodes(s.sheet.tree).find(n=>n.props?.accessibilityViewIsModal);
  assert.equal(style(panel()).backgroundColor,'#FFFFFF');
  s.os('dark');assert.equal(style(panel()).backgroundColor,'#242424');
  assert.ok(nodes(s.sheet.tree).filter(n=>n.type==='Text').every(n=>style(n).color==='#F5F5F5'));
  assert.ok(texts(s.themeRow()).includes('시스템'));
  s.choose('light');s.open();s.os('dark');assert.equal(style(panel()).backgroundColor,'#FFFFFF');
  s.choose('dark');s.open();s.os('light');assert.equal(style(panel()).backgroundColor,'#242424');
  assert.equal(s.sheet.slots,slots);assert.deepEqual(s.calls,[]);s.dispose();
});

test('ko → ja → ko and system-language changes update menu, value and open sheet independently of theme',async()=>{
  const s=await app({saved:'dark'});s.open();const snapshot=s.theme.getSnapshot();
  for(const [locale,title,labels] of [['ja','画面テーマ',['システム','ライト','ダーク']],['ko','화면 테마',['시스템','라이트','다크']]]) {
    await s.lang(locale);assert.ok(texts(s.themeRow()).includes(title));assert.ok(texts(s.themeRow()).includes(labels[2]));
    assert.ok(texts(s.sheet.tree).includes(title));for(const label of labels)assert.ok(texts(s.sheet.tree).includes(label));
    assert.equal(nodes(s.sheet.tree).find(n=>n.key==='dark').props.accessibilityState.checked,true);
    assert.equal(s.theme.getSnapshot(),snapshot);assert.equal(s.writes.length,0);
  }
  await s.lang('system');s.systemLanguage('ja-JP');assert.ok(texts(s.sheet.tree).includes('画面テーマ'));
  s.systemLanguage('ko-KR');assert.ok(texts(s.sheet.tree).includes('화면 테마'));
  s.choose('light');assert.equal(s.language.getSnapshot().languagePreference,'system');
  assert.equal(s.language.getSnapshot().resolvedLanguage,'ko');assert.deepEqual(s.calls,[]);s.dispose();
});

test('close button, backdrop and Android request-close dismiss without saving',async()=>{
  const s=await app();
  for(const close of [tree=>nodes(tree).find(n=>n.type==='Pressable'&&nodes(n).some(c=>c.type==='X')).props.onPress,
    tree=>nodes(tree).find(n=>n.type==='Pressable').props.onPress,
    tree=>tree.props.onRequestClose]) {
    s.open();close(s.sheet.tree)();s.sheet.render();assert.equal(s.sheet.tree,null);
  }
  assert.deepEqual(s.writes,[]);assert.deepEqual(s.routes,[]);s.dispose();
});

test('saved preferences restore UI on a fresh app; failed save follows D1 system fallback',async()=>{
  for(const value of ['light','dark','system']) {
    const first=await app();first.open();first.choose(value);await first.settle();
    const saved=first.stored.get('poparchive.themePreference')??'system';first.dispose();
    const next=await app({saved});assert.equal(next.theme.getSnapshot().themePreference,value);
    next.open();assert.equal(nodes(next.sheet.tree).find(n=>n.key===value).props.accessibilityState.checked,true);next.dispose();
  }
  const s=await app({failWrite:true});s.open();s.choose('dark');assert.ok(texts(s.themeRow()).includes('다크'));
  await s.settle();assert.equal(s.theme.getSnapshot().storageError,'write');assert.ok(texts(s.themeRow()).includes('시스템'));
  s.open();assert.equal(nodes(s.sheet.tree).find(n=>n.key==='system').props.accessibilityState.checked,true);s.dispose();
});

test('existing account navigation, back, logout and unauthenticated login remain available',async()=>{
  const s=await app();
  for(const [label,route] of [['닉네임 변경','/profile/nickname'],['비밀번호 변경','/profile/password'],['회원탈퇴','/profile/withdrawal'],[s.load('src/locales/ko.json').language.back,'back']]) {
    nodes(s.root.tree).find(n=>n.props?.accessibilityLabel===label).props.onPress();assert.equal(s.routes.at(-1),route);
  }
  s.open();s.choose('dark');await s.settle();
  nodes(s.root.tree).find(n=>n.props?.accessibilityLabel==='로그아웃').props.onPress();await s.settle();
  assert.deepEqual(s.calls,['logout']);assert.equal(s.routes.at(-1),'/profile');s.dispose();
  const loggedOut=await app({user:null});nodes(loggedOut.root.tree).find(n=>n.type==='Pressable'&&texts(n)==='로그인').props.onPress();
  assert.deepEqual(loggedOut.routes,['/profile/login']);loggedOut.dispose();
});

test('disabled theme menu/sheet stay hidden through ko/ja changes; saved choice and account UI remain',async()=>{
  const s=await app({saved:'dark',enabled:false}),slots=s.root.slots;
  for (const locale of ['ko','ja','ko','system']) {
    await s.lang(locale);assert.equal(s.themeRow(),undefined);assert.equal(s.sheet.tree,null);
    assert.equal(nodes(s.root.tree).find(n=>n.type?.name==='ThemePreferenceSheet').props.visible,false);
    assert.equal(s.theme.getSnapshot().themePreference,'dark');assert.equal(s.theme.getSnapshot().resolvedTheme,'light');
    assert.equal(s.root.slots,slots);assert.deepEqual(s.writes,[]);assert.deepEqual(s.calls,[]);
    assert.equal(nodes(s.root.tree).filter(n=>n.props?.accessibilityRole==='radio').length,0);
  }
  s.os('dark');assert.equal(s.theme.getSnapshot().resolvedTheme,'light');
  assert.equal(s.stored.get('poparchive.themePreference'),'dark');s.dispose();
});
