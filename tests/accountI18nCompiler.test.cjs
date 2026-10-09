const assert=require('node:assert/strict'),{test}=require('node:test');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {app,files,inputs,button}=require('./helpers/accountI18nRuntime.cjs');
for(const index of [0,1,2,3,4,5])test(`React Compiler account screen ${index}: retained language subscription and state`,async()=>{
 const bailoutFiles=[files[0],files[3],files[4],files[5]],bailouts=[],transform=compilerTransform([...files,'src/hooks/useTranslation.ts'],{allowBailout:bailoutFiles,onBailout:(f,e)=>bailouts.push([f,e.filter(x=>x.kind==='CompileError').map(x=>x.detail?.reason)])});
 const s=await app(transform),Screen=s.load(files[index]).default,root=s.mount(()=>Screen({kind:'password'}));
 if(inputs(root).length)inputs(root)[0].props.onChangeText('原文@example.test');
 const values=inputs(root).map(n=>n.props.value),calls=s.calls.slice(),slots=root.slots;
 for(const l of ['ja','ko','system']){await s.language(l);assert.equal(root.slots,slots);assert.deepEqual(inputs(root).map(n=>n.props.value),values);assert.deepEqual(s.calls,calls);
  const ko=['로그인','회원가입','비밀번호 변경',null,'회원탈퇴','문의 유형'][index];if(ko)assert.ok(texts(root.tree).includes(s.text(ko)));else assert.ok(texts(root.tree).includes(s.t('language.settings')));}
 await s.system('ko-KR');assert.deepEqual(inputs(root).map(n=>n.props.value),values);assert.deepEqual(s.calls,calls);
 if(bailouts.length)console.log('compiler bailout (existing component restriction):',JSON.stringify(bailouts));s.dispose();
});
test('actual compiled PasswordField caches invalidate labels and retain visibility, value and input reference',async()=>{
 const transform=compilerTransform([files[2],'src/hooks/useTranslation.ts']);const s=await app(transform),Screen=s.load(files[2]).default,root=s.mount(()=>Screen({kind:'password'}));
 const field=()=>nodes(root.tree).find(n=>n.type?.name==='PasswordField');field().props.onChange('RawPassword123');
 const child=s.mount(()=>field().type(field().props)),input=inputs(child)[0];nodes(child.tree).find(n=>n.type==='Pressable').props.onPress();
 for(const l of ['ja','ko','system']){await s.language(l);child.render();assert.equal(inputs(child)[0].props.value,'RawPassword123');assert.equal(inputs(child)[0].props.secureTextEntry,false);assert.equal(inputs(child)[0].props.ref,input.props.ref);assert.equal(inputs(child)[0].props.accessibilityLabel,s.text('현재 비밀번호'));assert.equal(nodes(child.tree).find(n=>n.type==='Pressable').props.accessibilityLabel,s.text('현재 비밀번호')+' '+s.text('숨기기'));assert.equal(s.calls.length,0);}s.dispose();
});
