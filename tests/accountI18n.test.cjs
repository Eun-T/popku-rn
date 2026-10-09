const assert=require('node:assert/strict'),{test}=require('node:test');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {app,files,inputs,button}=require('./helpers/accountI18nRuntime.cjs');
test('account resource parity, interpolation and unknown server text fallback',async()=>{
 const ko=require('../src/locales/ko.json').account,ja=require('../src/locales/ja.json').account;
 function compare(a,b){assert.deepEqual(Object.keys(a),Object.keys(b));for(const k in a){if(typeof a[k]==='object')compare(a[k],b[k]);else{assert.ok(b[k].trim());assert.deepEqual(a[k].match(/\{\w+\}/g)||[],b[k].match(/\{\w+\}/g)||[]);}}}compare(ko,ja);
 const s=await app();await s.language('ja');assert.equal(s.text('server raw error'),'server raw error');assert.equal(s.text('account.unknown.server'),'account.unknown.server');s.dispose();
});
test('retained login validation and credentials update ko-ja-ko-system with no extra login request',async()=>{
 const s=await app(),Screen=s.load(files[0]).default,root=s.mount(()=>Screen());button(s,root,'로그인').props.onPress();
 inputs(root)[0].props.onChangeText(' raw@example.test ');inputs(root)[1].props.onChangeText('rawPassword1');const refs=inputs(root).map(n=>n.props.ref);
 for(const l of ['ja','ko','system']){await s.language(l);assert.ok(texts(root.tree).includes(s.text('이메일과 비밀번호를 입력해 주세요.')));assert.deepEqual(inputs(root).map(n=>n.props.value),[' raw@example.test ','rawPassword1']);assert.deepEqual(inputs(root).map(n=>n.props.ref),refs);assert.equal(s.calls.length,0);}
 button(s,root,'로그인').props.onPress();await s.settle();assert.deepEqual(s.calls,[['login','raw@example.test','rawPassword1']]);assert.ok(texts(root.tree).includes('server raw error'));s.dispose();
});
test('signup first step keeps entered email/password and verification stage during language changes',async()=>{
 const s=await app(),Screen=s.load(files[1]).default,root=s.mount(()=>Screen());
 inputs(root)[0].props.onChangeText('raw@example.test');button(s,root,'인증번호 받기').props.onPress();await s.settle();inputs(root)[1].props.onChangeText('123456');button(s,root,'인증하기').props.onPress();await s.settle();
 assert.equal(inputs(root).length,4);inputs(root)[2].props.onChangeText('Password123');inputs(root)[3].props.onChangeText('Password123');const calls=s.calls.slice();
 for(const l of ['ja','ko','system']){await s.language(l);assert.deepEqual(inputs(root).map(n=>n.props.value),['raw@example.test','123456','Password123','Password123']);assert.deepEqual(s.calls,calls);assert.ok(texts(root.tree).includes(s.text('회원가입')));assert.ok(texts(root.tree).includes(s.text('이메일 인증이 완료됐어요.')));}s.dispose();
});
test('password parent and mounted field retain values and visibility; validation changes without PATCH',async()=>{
 const s=await app(),Screen=s.load(files[2]).default,root=s.mount(()=>Screen({kind:'password'}));
 const fields=()=>nodes(root.tree).filter(n=>n.type?.name==='PasswordField');fields()[0].props.onChange('Current123');fields()[1].props.onChange('New12345');fields()[2].props.onChange('different');
 const child=s.mount(()=>fields()[0].type(fields()[0].props));nodes(child.tree).find(n=>n.type==='Pressable').props.onPress();button(s,root,'저장').props.onPress();
 for(const l of ['ja','ko','system']){await s.language(l);child.render();assert.deepEqual(fields().map(n=>n.props.value),['Current123','New12345','different']);assert.equal(inputs(child)[0].props.secureTextEntry,false);assert.ok(texts(root.tree).includes(s.text('새 비밀번호와 확인값이 일치하지 않아요.')));assert.equal(s.calls.length,0);}s.dispose();
});
test('inquiry raw draft equal to UI text, type code and removal action remain intact across language changes',async()=>{
 const s=await app(),Screen=s.load(files[5]).default,root=s.mount(()=>Screen());inputs(root)[0].props.onChangeText('문의하기');inputs(root)[1].props.onChangeText('로그인');nodes(root.tree).find(n=>n.key==='BUG').props.onPress();
 for(const l of ['ja','ko','system']){await s.language(l);assert.deepEqual(inputs(root).map(n=>n.props.value),['문의하기','로그인']);assert.equal(nodes(root.tree).find(n=>n.key==='BUG').props.accessibilityState.selected,true);assert.equal(s.calls.length,0);}
 const action={type:'GO_BACK',key:'original'};s.guard().callback({data:{action}});assert.equal(s.alerts.at(-1)[0],s.text('작성을 그만둘까요?'));s.alerts.at(-1)[2][0].onPress();button(s,root,'문의 등록하기').props.onPress();await s.settle();assert.deepEqual(s.calls,[['inquiry','BUG','문의하기','로그인']]);s.dispose();
});
test('notice/inquiry retained lists and detail translate enums without refetch or changing raw server content',async()=>{
 for(const file of ['notices/index','notices/[id]','inquiries/index','inquiries/[id]']){
  const s=await app(undefined,true),Screen=s.load('src/app/profile/'+file+'.tsx').default,root=s.mount(()=>Screen());await s.settle();const calls=s.calls.slice();
  const list=()=>nodes(root.tree).find(n=>n.type==='FlatList');const data=list()?.props.data;
  for(const l of ['ja','ko','system']){await s.language(l);assert.deepEqual(s.calls,calls);
   if(data){assert.equal(list().props.data,data);const row=list().props.renderItem({item:data[0]});assert.ok(texts(row).includes(data[0].title));assert.ok(texts(row).includes(s.text(file.startsWith('notices')?'업데이트':'오류 신고')));}
   else{assert.ok(texts(root.tree).includes('로그인'));assert.ok(texts(root.tree).includes(file.startsWith('notices')?'회원가입':'문의하기'));assert.ok(texts(root.tree).includes(s.text(file.startsWith('notices')?'업데이트':'운영자 답변')));}
  }s.dispose();
 }
});
test('shared header raw navigation title and policy content remain unchanged while fixed labels update',async()=>{
 const s=await app(undefined,true),Layout=s.load('src/components/profile/InquiryLayout.tsx').default,root=s.mount(()=>Layout({title:'문의하기',children:null}));
 const policy={title:'이용약관',effectiveDate:'원문 날짜',sections:[{title:'원문 조항',paragraphs:['로그인'],bullets:['문의하기']}]};
 const Detail=s.load('src/components/profile/PolicyDetailScreen.tsx').default,detail=s.mount(()=>Detail({policy}));const raw=JSON.stringify(policy);
 for(const l of ['ja','ko','system']){await s.language(l);assert.ok(texts(root.tree).includes(s.text('문의하기')));assert.ok(texts(detail.tree).includes(s.text('이용약관')));assert.ok(texts(detail.tree).includes('로그인'));assert.ok(texts(detail.tree).includes('문의하기'));assert.equal(JSON.stringify(policy),raw);}s.dispose();
});
test('logout and withdrawal pending failures display the current language and preserve duplicate-request locks',async()=>{
 for(const index of [3,4]){
  const s=await app(),Screen=s.load(files[index]).default,root=s.mount(()=>Screen());
  if(index===3){const press=button(s,root,'로그아웃').props.onPress;press();press();}
  else{button(s,root,'회원탈퇴').props.onPress();const confirm=s.alerts.at(-1)[2].find(b=>b.style==='destructive');assert.ok(confirm);confirm.onPress();confirm.onPress();}
  await s.language('ja');await s.settle();assert.equal(s.calls.length,1);assert.equal(s.alerts.at(-1)[0],s.text(index===3?'로그아웃':'회원탈퇴'));assert.equal(s.alerts.at(-1)[1],s.text(index===3?'로그아웃에 실패했습니다. 다시 시도해주세요.':'회원탈퇴에 실패했습니다. 다시 시도해주세요.'));assert.equal(s.routes.length,0);assert.equal(s.user.id,7);s.dispose();
 }
});
