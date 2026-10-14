const assert=require('node:assert/strict'),fs=require('node:fs'),{test}=require('node:test');
const {app}=require('./helpers/accountI18nRuntime.cjs');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const detailFile='src/components/profile/PolicyDetailScreen.tsx',listFile='src/app/profile/policies/index.tsx';
const files={terms:'利用規約_ja.md',privacy:'プライバシーポリシー_ja.md',location:'位置情報サービス利用規約_ja.md'};
const koreanFiles={terms:'이용약관.md',privacy:'개인정보처리방침.md',location:'약관정책.md'};
const plainLines=source=>source.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()&&l!=='---').map(l=>l.replace(/^#{1,3} /,'').replace(/^- /,''));
const dataLines=p=>[p.title,p.effectiveDate,...p.sections.flatMap(s=>[...(s.title?[s.title]:[]),...(s.blocks??[]).flatMap(b=>b.text.split('\n')),...s.paragraphs??[],...s.bullets??[]])];
for(const [id,file]of Object.entries(koreanFiles))test(`Korean ${id}: the complete release source and app content match`,async()=>{
 const s=await app();
 try{
  const p=s.load('src/content/policies.ts').policies[id];
  const source=fs.readFileSync('docs/legal/ko/'+file,'utf8').replace(/^# 팝카이브 /,'# ');
  assert.deepEqual(dataLines(p),plainLines(source));
  assert.equal(p.sections.filter(section=>/^제\d+조|^\d+\./.test(section.title)).length,{terms:12,privacy:11,location:8}[id]);
  assert.equal(p.effectiveDate,'시행일: 2026년 10월 14일');
  assert.equal(p.sections.at(-1).title,'부칙');
  assert.ok(dataLines(p).at(-1).includes('2026년 10월 14일부터 시행합니다.'));
  assert.doesNotMatch(source,/\[[^\]]+\]|YYYY|추후 확정|출시 전/);
 }finally{s.dispose();}
});
test('both languages disclose Apple signup and the same minimum signup age',async()=>{
 const s=await app();
 try{
  const {policies,japanesePolicies}=s.load('src/content/policies.ts');
  for(const id of ['terms','privacy']){
   const ko=dataLines(policies[id]).join('\n'),ja=dataLines(japanesePolicies[id]).join('\n');
   assert.match(ko,/이메일[\s\S]*Google[\s\S]*Apple/);assert.match(ko,/만 14세 이상/);
   assert.match(ja,/メール[\s\S]*Google[\s\S]*Apple/);assert.match(ja,/満14歳以上/);
  }
 }finally{s.dispose();}
});
for(const [id,file]of Object.entries(files))test(`Japanese ${id}: all source text, article numbers, lists, dates, contacts and supplementary provisions match`,()=>{
 const p=require('../src/content/policies.ja.json')[id],source=fs.readFileSync('docs/legal/ja/'+file,'utf8');
 assert.deepEqual(dataLines(p),plainLines(source));assert.equal(p.sections.filter(s=>/^第\d+条|^\d+\./.test(s.title)).length,{terms:12,privacy:11,location:8}[id]);
 assert.ok(dataLines(p).includes('運営者：김은태'));assert.ok(dataLines(p).includes('メールアドレス：popchive.support@gmail.com'));assert.equal(p.effectiveDate,'施行日：2026年10月14日');assert.equal(p.sections.at(-1).title,'附則');
 assert.ok(dataLines(p).at(-1).includes('2026年10月14日から施行します。'));
 assert.doesNotMatch(source,/未定|今後確定|2026年10月13日/);
 assert.ok(!dataLines(p).join('\n').match(/\[運営者名\]|\[サービス専用メールアドレス\]|YYYY|POPKU/));
});
for(const compiled of [false,true])test(`${compiled?'actual React Compiler':'Hook'}: retained policy list and all three full documents change ko-ja-ko/system without I/O or remount`,async()=>{
 const transform=compiled?compilerTransform([detailFile,listFile,'src/hooks/useTranslation.ts']):undefined;
 const s=await app(transform,true),{policies,japanesePolicies,getLocalizedPolicy}=s.load('src/content/policies.ts');
 const List=s.load(listFile).default,Detail=s.load(detailFile).default,list=s.mount(()=>List());
 const owners=Object.fromEntries(Object.keys(files).map(id=>[id,s.mount(()=>Detail({policy:policies[id]}))]));
 const slots=Object.values(owners).map(o=>o.slots),scrolls=Object.values(owners).map(o=>nodes(o.tree).find(n=>n.type==='ScrollView').props.style),original=JSON.stringify(policies);
 for(const language of ['ja','ko','system']){
  await s.language(language);const ja=language!=='ko';
  for(const [id,root]of Object.entries(owners)){
   const p=ja?japanesePolicies[id]:policies[id];assert.equal(getLocalizedPolicy(policies[id],ja?'ja':'ko'),p);assert.ok(texts(root.tree).includes(p.effectiveDate));
   const expected=[s.text(p.title),...dataLines(p).slice(1)];
   for(const value of expected)assert.ok(texts(root.tree).includes(value),id+': '+value);
  }
  assert.deepEqual(Object.values(owners).map(o=>o.slots),slots);assert.deepEqual(Object.values(owners).map(o=>nodes(o.tree).find(n=>n.type==='ScrollView').props.style),scrolls);assert.equal(JSON.stringify(policies),original);assert.equal(s.calls.length,0);
  for(const ko of ['이용약관','개인정보처리방침','위치기반서비스 이용약관'])assert.ok(texts(list.tree).includes(s.text(ko)));
 }
 await s.system('ko-KR');for(const [id,root]of Object.entries(owners))assert.ok(texts(root.tree).includes(policies[id].effectiveDate));assert.equal(s.calls.length,0);
 nodes(list.tree).find(n=>n.key==='/profile/policies/terms').props.onPress();assert.deepEqual(s.routes,['/profile/policies/terms']);
 nodes(owners.terms.tree).find(n=>n.type==='Pressable').props.onPress();assert.equal(s.routes.at(-1),'back');s.dispose();
});
