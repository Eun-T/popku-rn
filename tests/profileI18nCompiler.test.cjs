const assert=require('node:assert/strict');
const {test}=require('node:test');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {app,files,button,list,input}=require('./helpers/profileI18nRuntime.cjs');
const errors=new Map(),transform=compilerTransform([...files,'src/hooks/useTranslation.ts'],{allowBailout:files,onBailout:(f,e)=>errors.set(f,e)});
test('actual Compiler output updates retained profile/activity/nickname UI ko→ja→ko/system and preserves API/state',async()=>{
 for(let i=0;i<files.length;i++){
  const s=await app({transform}),Screen=s.load(files[i]).default,root=s.mount(()=>i===4?Screen({kind:'nickname'}):Screen());await s.settle();
  if(i===1||i===2){list(root).props.onEndReached();await s.settle();}
  if(i===4)input(root).props.onChangeText('編集中の原文');
  const calls=s.calls.slice(),user=s.user(),cache=s.cache(),data=list(root)?.props.data,key=root.tree.key;
  const title=['profile.title','profile.posts.title','profile.reviews.title','profile.favorites.title','profile.nickname.title'][i];
  let menu;
  if(i===0){const n=nodes(root.tree).find(n=>n.type?.name==='MenuRow');menu=s.mount(()=>n.type({...n.props,onPress:undefined}));}
  for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t(title)));assert.deepEqual(s.calls,calls);assert.equal(s.user(),user);assert.equal(s.cache(),cache);assert.equal(list(root)?.props.data,data);assert.equal(root.tree.key,key);
   if(i===4){assert.equal(input(root).props.value,'編集中の原文');assert.equal(input(root).props.placeholder,s.t('profile.nickname.new'));}
   if(menu)assert.equal(menu.tree.props.accessibilityHint,s.t('profile.unavailable'));
  }
  await s.system('ko-KR');assert.ok(texts(root.tree).includes(s.t(title)));await s.system('ja-JP');assert.ok(texts(root.tree).includes(s.t(title)));assert.deepEqual(s.calls,calls);s.dispose();
 }
 for(const [f,events]of errors)for(const e of events.filter(e=>e.kind==='CompileError'))assert.equal(e.detail.reason,
  f===files[3]?'Existing memoization could not be preserved':"(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause",f);
});
test('Compiler-processed existing nickname error state follows language without overwriting draft',async()=>{
 const s=await app({transform}),Screen=s.load(files[4]).default,root=s.mount(()=>Screen({kind:'nickname'}));input(root).props.onChangeText('!');button(s,root,'profile.nickname.save').props.onPress();
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.nickname.invalid')));assert.equal(input(root).props.value,'!');assert.deepEqual(s.calls,[]);}s.dispose();
});
