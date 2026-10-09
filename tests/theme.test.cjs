const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const fs = require('node:fs');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture(value = null, overrides = {}) {
  const ui = runtime({ 'src/theme/themeFeature.js': { DARK_MODE_ENABLED:true }, ...overrides }), logic = ui.load('src/theme/themeStore.ts');
  let scheme = 'dark';
  const writes = [], store = logic.createThemeStore();
  const environment = { read: async () => value, write: async v => { writes.push(v); }, getColorScheme: () => scheme };
  return { ...logic, ui, store, environment, writes, os(v) { scheme = v; store.refreshSystemTheme(); } };
}

test('default system, stored light/dark and invalid values restore safely', async () => {
  for (const [saved, preference, theme] of [[null,'system','dark'],['system','system','dark'],
    ['light','light','light'],['dark','dark','dark'],['invalid','system','dark'],['"dark"','system','dark']]) {
    const f = fixture(saved);
    assert.equal(f.store.getSnapshot().themePreference, 'system');
    await f.store.initialize(f.environment);
    assert.deepEqual(f.store.getSnapshot(), { themePreference: preference, resolvedTheme: theme, isHydrated: true, storageError: null });
    assert.deepEqual(f.writes, []);
  }
});

test('OS changes update system immediately; explicit choices ignore OS; unknown OS is light', async () => {
  const f = fixture(); await f.store.initialize(f.environment);
  let updates = 0; const unsubscribe = f.store.subscribe(() => updates++);
  f.os('light'); assert.equal(f.store.getSnapshot().resolvedTheme, 'light'); assert.equal(updates, 1);
  await f.store.setThemePreference('dark'); f.os('light'); assert.equal(f.store.getSnapshot().resolvedTheme, 'dark');
  await f.store.setThemePreference('light'); f.os('dark'); assert.equal(f.store.getSnapshot().resolvedTheme, 'light');
  await f.store.setThemePreference('system'); assert.equal(f.store.getSnapshot().resolvedTheme, 'dark');
  f.os(null); assert.equal(f.store.getSnapshot().resolvedTheme, 'light'); unsubscribe();
  assert.deepEqual(f.writes, ['dark','light','system']);
});

test('read/write errors fall back to system and later selections can save', async () => {
  const f = fixture(); f.environment.read = async () => { throw Error('read'); };
  await f.store.initialize(f.environment); assert.equal(f.store.getSnapshot().storageError, 'read');
  f.environment.write = async () => { throw Error('write'); };
  await f.store.setThemePreference('light');
  assert.deepEqual(f.store.getSnapshot(), { themePreference:'system',resolvedTheme:'dark',isHydrated:true,storageError:'write' });
  f.environment.write = async v => { f.writes.push(v); };
  await f.store.setThemePreference('light'); assert.equal(f.store.getSnapshot().storageError, null);
  assert.deepEqual(f.writes, ['light']);
});

test('restore timeout hydrates system; a late read cannot override selection', async () => {
  let timeout;
  const f = fixture(null, { setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() {} });
  const read = deferred(); f.environment.read = () => read.promise;
  const initializing = f.store.initialize(f.environment);
  timeout(); await initializing; assert.equal(f.store.getSnapshot().storageError, 'read');
  await f.store.setThemePreference('light'); read.resolve('dark'); await flush();
  assert.equal(f.store.getSnapshot().themePreference, 'light');
});

test('selection during restore wins and serial writes preserve the latest choice across restart', async () => {
  const f = fixture(), read = deferred(), first = deferred(), started = [];
  let saved = null;
  f.environment.read = () => read.promise;
  f.environment.write = async value => { started.push(value); if (value === 'dark') await first.promise; saved = value; };
  const init = f.store.initialize(f.environment);
  const a = f.store.setThemePreference('dark'), b = f.store.setThemePreference('light');
  await flush(); assert.deepEqual(started, ['dark']);
  read.resolve('dark'); await init; assert.equal(f.store.getSnapshot().themePreference, 'light');
  first.resolve(); await Promise.all([a,b]); assert.deepEqual(started, ['dark','light']);
  const restarted = f.createThemeStore();
  await restarted.initialize({ ...f.environment, read: async () => saved });
  assert.equal(restarted.getSnapshot().themePreference, 'light');
});

test('AsyncStorage reads/writes only the independent theme key', async () => {
  const values = new Map([['poparchive.languagePreference','ja'],['accessToken','untouched']]);
  const ui = runtime({ '@react-native-async-storage/async-storage': {
    getItem: async key => values.get(key) ?? null, setItem: async (key,value) => { values.set(key,value); },
  } });
  const storage = ui.load('src/theme/themeStorage.ts');
  assert.equal(await storage.readThemePreference(), null);
  await storage.writeThemePreference('dark'); assert.equal(await storage.readThemePreference(), 'dark');
  assert.equal(values.get('poparchive.languagePreference'), 'ja'); assert.equal(values.get('accessToken'), 'untouched');
});

test('palettes preserve all legacy light values and every confirmed dark token', async () => {
  const f = fixture(), colors = f.ui.load('src/theme/tokens.ts').colors;
  const community = f.ui.load('src/theme/communityColors.ts').communityColors;
  assert.deepEqual(colors, { primary:'#22C55E',primaryLight:'#DCFCE7',primaryDark:'#15803D',infoLight:'#DBEAFE',infoDark:'#1D4ED8',
    background:'#FFFFFF',surface:'#F8FAFC',moreButtonBackground:'#F7F8FC',text:'#111827',secondaryText:'#6B7280',inactiveText:'#9CA3AF',
    inactiveTabText:'#B8BEC8',border:'#E5E7EB',paginationActive:'#494B4F',paginationInactive:'#E5E7EB',brandGradient:['#22C55E','#86EFAC'] });
  assert.deepEqual(community, { background:'#FFFFFF',text:'#252D3A',secondaryText:'#818B9B',divider:'#E8EBF0',mutedSurface:'#F1F3F7',
    charcoal:'#303A49',placeLink:'#526071',white:'#FFFFFF' });
  const { lightThemeColors: light, darkThemeColors: dark } = f.ui.load('src/theme/themeColors.ts');
  assert.deepEqual(dark, { background:'#121212',surface:'#242424',surfaceSecondary:'#303030',
    cardBackground:'#242424',moreButtonBackground:'#242424',skeletonBackground:'#303030',tagBackground:'#303030',tagText:'#B0B0B0',
    inactiveIcon:'#B0B0B0',bannerFallback:'#242424',textPrimary:'#F5F5F5',textSecondary:'#B0B0B0',
    border:'#484848',accent:'#22C55E',onAccent:'#071B0E',onImage:'#FFFFFF',imageShade:'#000000',filterUnselectedBg:'#303030',
    filterUnselectedText:'#F5F5F5',filterSelectedBg:'#22C55E',filterSelectedText:'#071B0E',searchBackground:'#242424',bottomSheetBg:'#242424',
    navIndicator:'#484848',navIcon:'#F5F5F5',navIconInactive:'#B0B0B0',ongoingBg:'#173B27',ongoingText:'#4ADE80',upcomingBg:'#3B2D15',
    upcomingText:'#FBBF24',endedBg:'#303030',endedText:'#B0B0B0' });
  assert.deepEqual(Object.keys(light), Object.keys(dark)); assert.ok(Object.isFrozen(light)); assert.ok(Object.isFrozen(dark));
  const before = JSON.stringify({ colors, community });
  await f.store.initialize(f.environment); await f.store.setThemePreference('dark');
  assert.equal(JSON.stringify({ colors, community }), before);
});

test('actual Compiler output updates mounted consumer in both directions, independent of ko/ja and API/draft state', async () => {
  const files = ['src/theme/useTheme.ts','tests/fixtures/themeConsumer.tsx'];
  const ui = runtime({ 'react-native': { View:'View',Text:'Text' }, 'src/theme/themeFeature.js': { DARK_MODE_ENABLED:true } }, { transform: compilerTransform(files) });
  const theme = ui.load('src/theme/themeStore.ts').themeStore, language = ui.load('src/locales/languageStore.ts').languageStore;
  let scheme = 'light';
  await theme.initialize({ read:async()=>null,write:async()=>{},getColorScheme:()=>scheme });
  await language.initialize({ read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP'] });
  const Consumer = ui.load('tests/fixtures/themeConsumer.tsx').ThemeConsumer;
  let requests = 0; const request = () => requests++;
  const root = ui.mount(() => Consumer({request})); root.tree.props.onTouchEnd();
  const hook = ui.mount(() => ui.load('src/theme/useTheme.ts').useTheme());
  const setter = hook.tree.setThemePreference;
  for (const [mode,bg] of [['dark','#121212'],['light','#FFFFFF'],['dark','#121212']]) {
    await setter(mode); assert.equal(root.tree.props.style.backgroundColor,bg);
    assert.equal(language.getSnapshot().resolvedLanguage,'ko');
    assert.equal(root.tree.props.children.props.children.at(-1),'edited'); assert.equal(requests,1);
    assert.equal(hook.tree.setThemePreference,setter);
  }
  for (const lang of ['ja','ko']) {
    await language.setLanguagePreference(lang); assert.equal(hook.tree.resolvedTheme,'dark');
    assert.equal(root.tree.props.children.props.children[2],lang); assert.equal(requests,1);
  }
  await setter('system'); scheme='dark'; theme.refreshSystemTheme();
  assert.equal(root.tree.props.style.backgroundColor,'#121212'); scheme='light'; theme.refreshSystemTheme();
  assert.equal(root.tree.props.style.backgroundColor,'#FFFFFF'); assert.equal(requests,1); ui.dispose();
});

test('compiled Provider gates startup once, listens to Appearance/foreground and preserves Root Stack options', async () => {
  let scheme = 'dark', appearanceCallback, foregroundCallback, removed = 0;
  const read = deferred(), child = { retained:'screen' };
  const ui = runtime({
    'src/theme/themeFeature.js': { DARK_MODE_ENABLED:true },
    'expo-status-bar': {StatusBar:'StatusBar'},
    'react-native': { Platform:{OS:'ios'}, Appearance:{setColorScheme(){},getColorScheme:()=>scheme,addChangeListener(fn){appearanceCallback=fn;return {remove(){removed++;}};}},
      AppState:{addEventListener(_name,fn){foregroundCallback=fn;return {remove(){removed++;}};}} },
    '@react-native-async-storage/async-storage': { getItem:()=>read.promise,setItem:async()=>{} },
    'src/locales/LanguageProvider.tsx': {__esModule:true,default:'LanguageProvider'},
    'expo-router': { Stack:Object.assign('Stack', {Screen:'Screen'}) },
  }, { transform:compilerTransform(['src/theme/ThemeProvider.tsx','src/theme/useTheme.ts']) });
  const Provider = ui.load('src/theme/ThemeProvider.tsx').default, store = ui.load('src/theme/themeStore.ts').themeStore;
  const mounted = ui.mount(()=>Provider({children:child})); assert.equal(mounted.tree,null);
  read.resolve('light'); await flush(); assert.equal(mounted.tree,child);
  await store.setThemePreference('system'); appearanceCallback(); assert.equal(store.getSnapshot().resolvedTheme,'dark');
  scheme='light'; appearanceCallback(); assert.equal(store.getSnapshot().resolvedTheme,'light');
  scheme='dark'; foregroundCallback('active'); assert.equal(store.getSnapshot().resolvedTheme,'dark'); assert.equal(mounted.tree,child);
  const root = ui.load('src/app/_layout.tsx').default();
  assert.equal(root.type,Provider); assert.equal(root.props.children.type,'LanguageProvider');
  const stack = root.props.children.props.children;
  assert.deepEqual(stack.props.screenOptions,{headerShown:false});
  assert.deepEqual(stack.props.children.map(n=>n.props.name),['(tabs)','community/[id]','community/write','reviews/write','reviews/[id]','places/[id]']);
  for (const screen of stack.props.children.slice(1)) assert.deepEqual(screen.props.options,{presentation:'card',contentStyle:{backgroundColor:'#FFFFFF'}});
  ui.dispose(); assert.equal(removed,2);
});

test('disabled production flag forces light for every OS/saved choice without changing stored preferences', async () => {
  assert.equal(require('../src/theme/themeFeature.js').DARK_MODE_ENABLED, false);
  for (const saved of [null,'system','light','dark']) for (const initialOS of ['light','dark']) {
    const ui = runtime(), { createThemeStore } = ui.load('src/theme/themeStore.ts');
    const store = createThemeStore(); let scheme = initialOS; const writes = [];
    await store.initialize({read:async()=>saved,write:async value=>writes.push(value),getColorScheme:()=>scheme});
    assert.equal(store.getSnapshot().themePreference,saved??'system');
    assert.equal(store.getSnapshot().resolvedTheme,'light');
    const snapshot=store.getSnapshot();scheme=initialOS==='light'?'dark':'light';store.refreshSystemTheme();
    assert.equal(store.getSnapshot(),snapshot);assert.deepEqual(writes,[]);
    // Re-enabled code restores the exact same saved choice, without a migration/write.
    const active = fixture(saved);active.os(initialOS);await active.store.initialize(active.environment);
    assert.equal(active.store.getSnapshot().resolvedTheme,saved==='dark'?'dark':saved==='light'?'light':initialOS);
    assert.deepEqual(active.writes,[]);
  }
});

test('disabled compiled Provider overrides native appearance/status bar and keeps children stable', async () => {
  let os='dark', onAppearance, onForeground;const nativeModes=[],writes=[];
  const ui=runtime({
    'react-native':{Platform:{OS:'ios'},Appearance:{getColorScheme:()=>os,setColorScheme:mode=>nativeModes.push(mode),
      addChangeListener:fn=>{onAppearance=fn;return {remove(){}};}},
      AppState:{addEventListener:(_name,fn)=>{onForeground=fn;return {remove(){}};}}},
    'expo-status-bar':{StatusBar:'StatusBar'},
    '@react-native-async-storage/async-storage':{getItem:async()=> 'dark',setItem:async(...args)=>writes.push(args)},
  },{transform:compilerTransform(['src/theme/ThemeProvider.tsx','src/theme/useTheme.ts'])});
  const child={retained:'screen'},Provider=ui.load('src/theme/ThemeProvider.tsx').default;
  const mounted=ui.mount(()=>Provider({children:child}));await flush();
  assert.deepEqual(nativeModes,['light']);
  assert.equal(mounted.tree.props.children[0].props.style,'dark');assert.equal(mounted.tree.props.children[1],child);
  const tree=mounted.tree;os='light';onAppearance();os='dark';onAppearance();onForeground('active');
  assert.equal(mounted.tree,tree);assert.deepEqual(writes,[]);
  assert.equal(ui.load('src/theme/themeStore.ts').themeStore.getSnapshot().themePreference,'dark');ui.dispose();
});

for (const [platform, hasOverride] of [['web',false],['web',true],['ios',true],['android',true],['ios',false]]) {
  test(`Provider mounts with light theme on ${platform}, setColorScheme available=${hasOverride}`, async () => {
    const modes=[], writes=[]; let onAppearance;
    const appearance={getColorScheme:()=> 'dark', addChangeListener:fn=>{
      onAppearance=fn;return {remove(){}};
    }};
    if(hasOverride)appearance.setColorScheme=mode=>modes.push(mode);
    const ui=runtime({
      'react-native':{Platform:{OS:platform},Appearance:appearance,
        AppState:{addEventListener:()=>({remove(){}})}},
      'expo-status-bar':{StatusBar:'StatusBar'},
      '@react-native-async-storage/async-storage':{getItem:async()=> 'dark',setItem:async(...args)=>writes.push(args)},
    },{transform:compilerTransform(['src/theme/ThemeProvider.tsx','src/theme/useTheme.ts'])});
    const child={retained:'app'},Provider=ui.load('src/theme/ThemeProvider.tsx').default;
    const root=ui.mount(()=>Provider({children:child}));await flush();
    assert.equal(root.tree.props.children[1],child);
    assert.deepEqual(modes,platform!=='web'&&hasOverride?['light']:[]);
    const store=ui.load('src/theme/themeStore.ts').themeStore;
    assert.equal(store.getSnapshot().resolvedTheme,'light');
    assert.equal(store.getSnapshot().themePreference,'dark');
    const tree=root.tree;onAppearance();assert.equal(root.tree,tree);
    assert.deepEqual(writes,[]);ui.dispose();
  });
}

test('Expo native config follows the single flag and preserves all other static configuration', () => {
  const config=require('../app.json').expo;
  const disabled=require('../app.config.js')({config});assert.deepEqual(disabled,{...config,userInterfaceStyle:'light'});
  const loaded=require('@expo/config').getConfig(process.cwd(),{skipSDKVersionRequirement:true});
  assert.equal(loaded.exp.userInterfaceStyle,'light');
  const module={exports:{}};
  new Function('require','module',fs.readFileSync('app.config.js','utf8'))(name=>{
    assert.equal(name,'./src/theme/themeFeature.js');return {DARK_MODE_ENABLED:true};
  },module);
  assert.deepEqual(module.exports({config}),{...config,userInterfaceStyle:'automatic'});
  assert.equal(config.userInterfaceStyle,'automatic');
});
