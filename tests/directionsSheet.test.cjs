const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runtime,nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {reanimatedTransitionMock}=require('./helpers/reanimatedTransitionMock.cjs');
const file='src/components/place/DirectionsSheet.tsx';
const style=n=>Object.assign({},...[n.props.style].flat().filter(Boolean));
async function app(platform='ios', autoFinish=true){
  const selected=[],animations=[];let closed=0,tags=['ja-JP'];
  const animate=kind=>(value,options)=>({start:fn=>{animations.push({kind,...options});value.setValue(options.toValue);fn?.({finished:true});}});
  let ui;
  const motion=reanimatedTransitionMock(()=>ui,{autoFinish});
  ui=runtime({
    'react-native-reanimated':motion.module,
    'react-native-worklets':{scheduleOnRN:fn=>fn()},
    'react-native':{View:'View',Text:'Text',Image:'Image',Pressable:'Pressable',Modal:'Modal',Platform:{OS:platform},
      StyleSheet:{create:s=>s,absoluteFill:{position:'absolute',left:0,right:0,top:0,bottom:0},hairlineWidth:1},
      PanResponder:{create:handlers=>({panHandlers:handlers})},
      Animated:{View:'AnimatedView',Value:class{constructor(v){this.value=v;}setValue(v){this.value=v;}stopAnimation(){}},
        timing:animate('timing'),spring:animate('spring'),parallel:list=>({start:fn=>{list.forEach(a=>a.start());fn?.({finished:true});}})}},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:34,left:0,right:0})},
    fetch:()=>assert.fail('opening/language changing a sheet must not request data'),
  },{transform:compilerTransform([file,'src/hooks/useTranslation.ts'])});
  const language=ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>tags});
  const Sheet=ui.load(file).default,props={onClose:()=>closed++,onSelect:s=>selected.push(s)};
  const root=ui.mount(()=>Sheet(props));
  return {...ui,root,selected,motion,animations:motion.animations,language,closed:()=>closed,
    rows:()=>nodes(root.tree).filter(n=>n.type==='Pressable'&&n.key),
    os(tag){tags=[tag];language.refreshSystemLanguage();}};
}
test('edge sheet retains zero outer margins, safe area, row geometry and compiled ko→ja→ko/system updates',async()=>{
  const s=await app(),slots=s.root.slots,surface=nodes(s.root.tree).find(n=>n.props?.accessibilityViewIsModal);
  const layout=style(surface);assert.equal(layout.marginHorizontal,0);assert.equal(layout.marginBottom,0);
  assert.equal(layout.paddingBottom,42);assert.equal(layout.paddingLeft,20);assert.equal(layout.paddingRight,20);
  assert.equal(layout.borderTopLeftRadius,24);assert.equal(layout.borderTopRightRadius,24);
  assert.equal(layout.borderBottomLeftRadius??0,0);assert.equal(layout.backgroundColor,'#FFFFFF');
  assert.deepEqual(s.rows().map(n=>n.key),['google','naver','apple']);
  const row=Object.assign({},...s.rows()[0].props.style({pressed:false}).filter(Boolean));assert.equal(row.minHeight,56);assert.equal(row.paddingVertical,12);
  const handle=nodes(s.root.tree).find(n=>style(n).width===36);assert.equal(style(handle).height,4);
  const handleArea=nodes(s.root.tree).find(n=>n.type==='View'&&n.props.children===handle);assert.equal(style(handleArea).height,32);
  for(const [lang,title,labels] of [['ja','経路案内',['Google マップ','NAVER マップ','Apple マップ']],['ko','길찾기',['Google 지도','네이버 지도','Apple 지도']],['system','経路案内',['Google マップ','NAVER マップ','Apple マップ']]]){
    await s.language.setLanguagePreference(lang);assert.ok(texts(s.root.tree).includes(title));assert.deepEqual(s.rows().map(texts),labels);
    assert.equal(s.root.slots,slots);assert.equal(s.closed(),0);assert.deepEqual(s.selected,[]);
  }
  s.os('ko-KR');assert.equal(texts(s.rows()[1]),'네이버 지도');s.os('ja-JP');assert.equal(texts(s.rows()[2]),'Apple マップ');
  s.root.tree.props.onShow();assert.ok(s.animations.every(a=>a.config.duration===200));s.dispose();
});
for(const method of ['backdrop','back'])test(`${method} dismisses without selecting a service`,async()=>{
  const s=await app('android');
  if(method==='backdrop')nodes(s.root.tree).find(n=>n.type==='Pressable').props.onPress();
  if(method==='back')s.root.tree.props.onRequestClose();
  assert.equal(s.root.tree.props.visible,false);assert.equal(s.closed(),1);assert.deepEqual(s.selected,[]);s.dispose();
});
for(const platform of ['ios','android','web']) for(const service of ['google','naver','apple'])test(`${platform}: ${service} selection closes once and respects native dismissal/browser activation`,async()=>{
  const s=await app(platform),rows=s.rows();rows.find(row=>row.key===service).props.onPress();rows.find(row=>row.key!==service).props.onPress();
  assert.equal(s.root.tree.props.visible,false);
  if(platform==='ios'){assert.deepEqual(s.selected,[]);assert.equal(s.closed(),0);s.root.tree.props.onDismiss();}
  assert.deepEqual(s.selected,[service]);assert.equal(s.closed(),1);s.root.tree.props.onDismiss();assert.equal(s.closed(),1);
  assert.ok(s.animations.every(a=>a.config.duration===160));s.dispose();
});

for(const platform of ['ios','android','web'])test(`${platform}: local official app icons retain size, aspect ratio and row touch targets`,async()=>{
  const fs=require('node:fs'),s=await app(platform);
  for(const [index,row] of s.rows().entries()){
    const layout=Object.assign({},...row.props.style({pressed:false}).filter(Boolean));
    assert.equal(layout.flexDirection,'row');assert.equal(layout.alignItems,'center');assert.equal(layout.gap,12);
    assert.equal(layout.borderTopWidth,1);assert.equal(layout.borderTopColor,'#E5E7EB');
    const children=row.props.children;assert.equal(children.length,2);assert.equal(children[0].type,'Image');assert.equal(children[1].type,'Text');
    const icon=children[0];assert.deepEqual(style(icon),{width:32,height:32});
    assert.equal(icon.props.resizeMode,'contain');assert.equal(icon.props.accessible,false);
    assert.equal(icon.props.source,`assets/images/map-apps/${['google-maps','naver-map','apple-maps'][index]}.png`);
    const bytes=fs.readFileSync(icon.props.source);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);
    assert.equal(row.props.accessibilityRole,'button');assert.equal(typeof row.props.onPress,'function');
  }
  s.dispose();
});

test('actual detail button opens the sheet with loaded coordinates, closes and keeps detail requests/state',async()=>{
  const {app:detailApp,detail}=require('./helpers/mapDetailRuntime.cjs');
  const s=await detailApp(),Screen=s.load('src/app/places/[id].tsx').default;
  const root=s.mount(()=>Screen());await s.settle();const slots=root.slots;
  const count=s.calls.detail.length;
  const button=()=>nodes(root.tree).find(n=>n.type==='Pressable'&&texts(n)==='길찾기');
  assert.ok(button());button().props.onPress();
  const sheet=()=>nodes(root.tree).find(n=>n.type?.name==='DirectionsSheet');assert.ok(sheet());
  for(const language of ['ja','ko','system']){
    await s.language(language);assert.ok(sheet());assert.equal(root.slots,slots);assert.equal(s.calls.detail.length,count);
  }
  sheet().props.onSelect('google');await s.settle();
  assert.equal(new URL(s.calls.links.at(-1)).searchParams.get('destination'),`${detail.latitude},${detail.longitude}`);
  sheet().props.onClose();assert.equal(sheet(),undefined);assert.equal(s.calls.detail.length,count);s.dispose();
});

test('Reanimated keeps 320dp, timing and easing, and waits for both exit animations before iOS dismissal',async()=>{
  const s=await app('ios',false);
  assert.equal(s.root.tree.props.animationType,'none');assert.equal(s.root.tree.props.transparent,true);
  assert.equal(s.motion.sharedValues[0].get(),320);assert.equal(s.motion.sharedValues[1].get(),0);
  s.root.tree.props.onShow();
  assert.deepEqual(s.animations.map(a=>[a.to,a.config.duration]),[[0,200],[1,200]]);
  assert.equal(s.motion.easingCalls[0].fn,s.motion.module.Easing.ease);
  s.animations.slice().forEach(s.motion.finish);
  s.rows()[0].props.onPress();s.rows()[1].props.onPress();
  const exit=s.animations.slice(2);
  assert.deepEqual(exit.map(a=>[a.to,a.config.duration]),[[320,160],[0,160]]);
  assert.ok(exit.every(a=>a.config.easing===s.motion.easingCalls[0].easing));
  s.motion.finish(exit[0]);assert.equal(s.root.tree.props.visible,true);assert.deepEqual(s.selected,[]);
  s.motion.finish(exit[1]);assert.equal(s.root.tree.props.visible,false);assert.equal(s.closed(),0);
  s.root.tree.props.onDismiss();s.root.tree.props.onDismiss();
  assert.deepEqual(s.selected,['google']);assert.equal(s.closed(),1);s.dispose();
});

test('closing during entrance cancels it and ignores late onShow; fresh sheet can reopen',async()=>{
  const s=await app('ios',false);s.root.tree.props.onShow();
  const entrance=s.animations.slice();
  s.motion.sharedValues[0].presentation=160;s.motion.sharedValues[1].presentation=0.5;
  s.root.tree.props.onRequestClose();assert.ok(entrance.every(a=>a.finished));
  assert.equal(s.motion.sharedValues[0].get(),160);
  const count=s.animations.length;s.root.tree.props.onShow();assert.equal(s.animations.length,count);
  s.animations.slice(2).forEach(s.motion.finish);s.root.tree.props.onDismiss();
  assert.equal(s.closed(),1);assert.deepEqual(s.selected,[]);s.dispose();
  const next=await app();assert.equal(next.root.tree.props.visible,true);
  assert.equal(next.motion.sharedValues[0].get(),320);next.dispose();
});

test('Web map opens in the press event and unmount cancels unfinished transitions',async()=>{
  const s=await app('web',false);s.rows()[0].props.onPress();
  assert.deepEqual(s.selected,['google']);assert.equal(s.closed(),0);
  s.animations.forEach(s.motion.finish);assert.equal(s.closed(),1);s.dispose();
  const pending=await app('ios',false);pending.root.tree.props.onShow();pending.root.tree.props.onRequestClose();
  pending.dispose();assert.ok(pending.animations.every(a=>a.finished));
  pending.root.tree.props.onDismiss();assert.deepEqual(pending.selected,[]);assert.equal(pending.closed(),0);
});

test('original handle remains decorative with no gesture handlers or spring',async()=>{
  const s=await app('ios',false);s.root.tree.props.onShow();s.animations.slice().forEach(s.motion.finish);
  assert.ok(!nodes(s.root.tree).some(n=>Object.keys(n.props??{}).some(key=>/PanResponder|ShouldSetResponder/.test(key))));
  const handle=nodes(s.root.tree).find(n=>style(n).width===36);
  assert.deepEqual(style(handle),{width:36,height:4,borderRadius:2,backgroundColor:'#6B7280',opacity:0.4});
  const handleArea=nodes(s.root.tree).find(n=>n.props.children===handle);
  assert.deepEqual(style(handleArea),{height:32,alignItems:'center',justifyContent:'center'});
  s.root.tree.props.onRequestClose();s.animations.filter(a=>!a.finished).forEach(s.motion.finish);
  s.root.tree.props.onDismiss();assert.equal(s.closed(),1);assert.deepEqual(s.selected,[]);s.dispose();
});
