const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {test}=require('node:test');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {app,button,child,input}=require('./helpers/communityI18nRuntime.cjs');
const files=['src/screens/CommunityScreen.tsx','src/app/community/[id].tsx','src/app/community/write.tsx',
 'src/components/community/CommunityPostItem.tsx','src/components/community/CommunityAuthor.tsx','src/components/community/CommunityComments.tsx',
 'src/hooks/useTranslation.ts','src/components/community/CommunityPostMenu.tsx','src/components/community/CommunityImageCarousel.tsx'];
const bailouts=new Map(),transform=compilerTransform(files,{allowBailout:[files[1],files[2],files[5],files[7]],onBailout:(f,e)=>bailouts.set(f,e)});
const propsForComments=s=>({postId:10,commentCount:2,now:Date.parse('2026-10-09T03:00:00Z'),padding:{paddingLeft:16,paddingRight:16},compactDisplay:true,onLogin:()=>s.routes.push('/profile/login'),children:null});
const list=root=>nodes(root.tree).find(n=>n.type==='FlatList');
const images=root=>nodes(root.tree).filter(n=>n.type==='Image').map(n=>n.props.source.uri);

test('community used keys, dynamic categories/errors/time and variables exist in both resources',()=>{
 const ko=JSON.parse(fs.readFileSync('src/locales/ko.json','utf8')),ja=JSON.parse(fs.readFileSync('src/locales/ja.json','utf8')),keys=new Set();
 for(const file of files.slice(0,6)){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function walk(n){if(ts.isStringLiteral(n)&&/^(community|place|review)\./.test(n.text))keys.add(n.text);ts.forEachChild(n,walk);}walk(ast);
 }
 for(const suffix of ['all','review','info','question','free'])keys.add('community.category.'+suffix);
 for(const suffix of ['minutesAgo','hoursAgo','daysAgo'])keys.add('community.time.'+suffix);
 for(const suffix of ['permission','limit','conversion'])keys.add('community.imageError.'+suffix);
 ['community.detail.missing','community.detail.failed'].forEach(k=>keys.add(k));
 const lookup=(o,k)=>k.split('.').reduce((v,p)=>v?.[p],o);
 for(const key of keys){const a=lookup(ko,key),b=lookup(ja,key);assert.ok(a?.trim(),`ko ${key}`);assert.ok(b?.trim(),`ja ${key}`);assert.deepEqual(a.match(/\{\w+\}/g)??[],b.match(/\{\w+\}/g)??[],key);}
 assert.deepEqual(Object.keys(ko.community.comments),Object.keys(ja.community.comments));
});

test('compiler-cached feed retains category/list/cursor/ref and loaded pages across live languages and return',async()=>{
 const s=await app({transform}),Screen=s.load(files[0]).default,root=s.mount(()=>Screen());await s.settle();
 nodes(root.tree).find(n=>n.type==='Pressable'&&n.key==='FREE').props.onPress();await s.settle();
 list(root).props.onEndReached();await s.settle();
 const requests=s.calls.slice(),data=list(root).props.data,ref=list(root).props.ref,key=list(root).key,style=list(root).props.style;
 for(const lang of ['ja','ko','system']){await s.language(lang);
  assert.ok(texts(root.tree).includes(s.t('community.title')));assert.ok(button(s,root,'community.write'));
  assert.equal(list(root).props.data,data);assert.equal(list(root).props.ref,ref);assert.equal(list(root).key,key);assert.equal(list(root).props.style,style);
  assert.equal(nodes(root.tree).find(n=>n.key==='FREE').props.accessibilityState.selected,true);assert.deepEqual(s.calls,requests);
  const row=list(root).props.renderItem({item:data[0]});assert.equal(row.props.post.content,s.post.content);assert.equal(row.props.post.id,10);
  root.render();assert.deepEqual(s.calls,requests);
 }
 const row=list(root).props.renderItem({item:data[0]});row.props.onPressPost();assert.deepEqual(s.routes,[{pathname:'/community/[id]',params:{id:'10'}}]);s.dispose();
});

for(const editing of [false,true])test(`Compiler-processed ${editing?'edit':'create'} preserves content/type/images/order/mode/guard and exact submit values`,async()=>{
 const s=await app({editing,transform}),Screen=s.load(files[2]).default,root=s.mount(()=>Screen());await s.settle();
 assert.equal(nodes(root.tree).filter(n=>n.type==='TextInput').length,1,'no title field is invented');
 if(!editing)nodes(root.tree).find(n=>n.key==='FREE').props.onPress();
 input(root).props.onChangeText('編集中のユーザー原文');
 if(editing)button(s,root,'community.removeImage',{index:1}).props.onPress();
 button(s,root,'community.attachImage').props.onPress();await s.settle();
 const order=images(root),requests=s.calls.slice(),inputStyle=input(root).props.style,inputKey=input(root).key;
 for(const lang of ['ja','ko','system']){await s.language(lang);
  assert.equal(input(root).props.value,'編集中のユーザー原文');assert.equal(input(root).props.placeholder,s.t('community.writePlaceholder'));
  assert.ok(texts(root.tree).includes(s.t(editing?'community.edit.title':'community.write')));assert.deepEqual(images(root),order);
  assert.equal(input(root).key,inputKey);assert.equal(input(root).props.style,inputStyle);assert.ok(s.removal().enabled);assert.deepEqual(s.calls,requests);
  const selected=nodes(root.tree).find(n=>n.type==='Pressable'&&n.key===(editing?'QUESTION':'FREE'));assert.equal(selected.props.accessibilityState.selected,true);assert.equal(selected.props.disabled,editing);
 }
 await s.systemLanguage('ko-KR');assert.equal(input(root).props.placeholder,s.t('community.writePlaceholder'));
 await s.systemLanguage('ja-JP');assert.equal(input(root).props.placeholder,s.t('community.writePlaceholder'));
 s.removal().fn({data:{action:{type:'GO_BACK'}}});assert.equal(s.alerts.at(-1)[0],s.t('review.write.leaveTitle'));s.alerts.at(-1)[2][0].onPress();
 assert.equal(input(root).props.value,'編集中のユーザー原文');
 button(s,root,editing?'community.edit.save':'community.register').props.onPress();await s.settle();
 const args=s.calls.find(c=>c[0]===(editing?'updateImages':'createImages')).slice(1);
 assert.deepEqual(args.slice(0,editing?3:2),editing?[10,'編集中のユーザー原文',[8]]:['FREE','編集中のユーザー原文']);
 assert.equal(args[editing?3:2][0].uri,s.image.uri);assert.deepEqual(s.routes,['back']);s.dispose();
});

test('Compiler-processed create error remains reactive without changing original user text',async()=>{
 const s=await app({transform}),Screen=s.load(files[2]).default,root=s.mount(()=>Screen());input(root).props.onChangeText('error draft 原文');
 s.failWrite(new Error('server free text'));button(s,root,'community.register').props.onPress();await s.settle();const requests=s.calls.slice();
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('community.writeFailed')));assert.equal(input(root).props.value,'error draft 原文');assert.deepEqual(s.calls,requests);}
 s.dispose();
});

test('Compiler-processed detail preserves ID/content/images and old open-menu callback uses current language',async()=>{
 const s=await app({transform}),Screen=s.load(files[1]).default,root=s.mount(()=>Screen());await s.settle();
 button(s,root,'community.postMenu').props.onPress();const select=child(root.tree,'CommunityPostMenu').props.onSelect;
 const calls=s.calls.slice(),key=child(root.tree,'CommunityComments').key,imagesKey=child(root.tree,'CommunityImageCarousel').key;
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('community.detail.title')));
  assert.ok(texts(root.tree).includes(s.t('community.category.question')));assert.ok(texts(root.tree).includes(s.t('community.time.minutesAgo',{count:5})));
  assert.ok(texts(root.tree).includes(s.post.content));assert.ok(texts(root.tree).includes(s.post.author.nickname));
  assert.equal(child(root.tree,'CommunityPostMenu').props.onSelect,select);assert.equal(child(root.tree,'CommunityComments').key,key);
  assert.equal(child(root.tree,'CommunityImageCarousel').key,imagesKey);assert.equal(child(root.tree,'CommunityImageCarousel').props.images,s.post.images);
  assert.equal(nodes(root.tree).some(n=>n.type==='Heart'),false,'POST likes stay absent');assert.deepEqual(s.calls,calls);
 }
 select(2);assert.equal(s.alerts.at(-1)[0],s.t('community.delete.title'));assert.equal(s.alerts.at(-1)[2][0].text,s.t('community.cancel'));
 s.alerts.at(-1)[2][0].onPress();button(s,root,'community.postMenu').props.onPress();child(root.tree,'CommunityPostMenu').props.onSelect(1);
 assert.deepEqual(s.routes,[{pathname:'/community/write',params:{editId:'10'}}]);s.dispose();
});

test('compiler-cached shared card/author translate category/time without altering raw content or avatar state',async()=>{
 const s=await app({transform}),Card=s.load(files[3]).default,Author=s.load(files[4]).default,onPress=()=>s.routes.push(10);
 const props={post:s.post,now:Date.parse('2026-10-09T03:00:00Z'),onPressPost:onPress},root=s.mount(()=>Card(props));
 const authorProps={author:{...s.post.author,avatarUrl:'originalAvatar.webp'},createdAt:s.post.createdAt,now:props.now},author=s.mount(()=>Author(authorProps));
 nodes(author.tree).find(n=>n.type==='Image').props.onError();
 const original=JSON.stringify(s.post),style=root.tree.props.style;
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('community.category.question')));assert.ok(texts(root.tree).includes(s.t('community.time.minutesAgo',{count:5})));
  assert.ok(texts(author.tree).includes(s.t('community.time.minutesAgo',{count:5})));assert.ok(texts(root.tree).includes(s.post.content));
  assert.deepEqual(images(root),[s.post.images[0]]);assert.equal(root.tree.props.style,style);assert.equal(nodes(author.tree).some(n=>n.type==='Image'),false);
  assert.equal(nodes(root.tree).some(n=>n.type==='Heart'),false);assert.equal(JSON.stringify(s.post),original);}
 root.tree.props.onPress();assert.deepEqual(s.routes,[10]);assert.deepEqual(s.calls,[]);s.dispose();
});

test('Compiler-processed comments retain draft/reply root/user ID/list/open menu and preserve actual reply payload',async()=>{
 const s=await app({transform}),Comments=s.load(files[5]).default,props=propsForComments(s),root=s.mount(()=>Comments(props));await s.settle();
 button(s,root,'community.comments.replyTo',{nickname:s.replyComment.author.nickname}).props.onPress();await s.settle();
 input(root).props.onChangeText('回答のユーザー原文');button(s,root,'community.comments.menu',{id:1}).props.onPress();
 const calls=s.calls.slice(),key=input(root).key,ref=input(root).props.ref,order=()=>nodes(root.tree).filter(n=>[1,2].includes(n.key)).map(n=>n.key);
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.equal(input(root).props.placeholder,s.t('community.comments.placeholder'));assert.equal(input(root).props.value,'回答のユーザー原文');
  assert.ok(texts(root.tree).includes(s.t('community.comments.replyTo',{nickname:'@'+s.replyComment.author.nickname})));assert.deepEqual(order(),[1,2]);assert.ok(child(root.tree,'CommunityPostMenu'));
  assert.equal(input(root).key,key);assert.equal(input(root).props.ref,ref);assert.deepEqual(s.calls,calls);
  for(const content of [s.rootComment.content,s.replyComment.content])assert.ok(texts(root.tree).includes(content));
 }
 child(root.tree,'CommunityPostMenu').props.onSelect(0);button(s,root,'community.comments.register').props.onPress();await s.settle();
 const args=s.calls.find(c=>c[0]==='commentCreate').slice(1);assert.deepEqual(args.slice(0,3),[10,'回答のユーザー原文',{commentId:2,parentCommentId:1,replyToUserId:2,nickname:s.replyComment.author.nickname}]);
 assert.equal(args[3],'token-original');assert.equal(args[4],'POST');assert.equal(input(root).props.value,'');s.dispose();
});

test('Compiler-processed comments error keys, length limit, delete confirmation and guest login translate',async()=>{
 const s=await app({transform}),Comments=s.load(files[5]).default,props=propsForComments(s),root=s.mount(()=>Comments(props));await s.settle();
 input(root).props.onChangeText('失敗しても原文');s.failComment(new Error('server free text'));button(s,root,'community.comments.register').props.onPress();await s.settle();
 for(const lang of ['ja','ko']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('community.comments.createFailed')));assert.equal(input(root).props.value,'失敗しても原文');}
 input(root).props.onChangeText('가'.repeat(2001));button(s,root,'community.comments.register').props.onPress();await s.settle();
 for(const lang of ['ja','ko']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('community.comments.lengthExceeded',{count:'2,000'})));}
 s.failAuth();button(s,root,'community.comments.replyTo',{nickname:s.post.author.nickname}).props.onPress();await s.settle();await s.language('ja');assert.ok(texts(root.tree).includes(s.t('community.comments.authFailed')));
 button(s,root,'community.comments.menu',{id:1}).props.onPress();child(root.tree,'CommunityPostMenu').props.onSelect(2);assert.equal(s.alerts.at(-1)[0],s.t('community.comments.deleteTitle'));s.alerts.at(-1)[2][0].onPress();s.dispose();
 const guest=await app({transform,guest:true}),GuestComments=guest.load(files[5]).default,p=propsForComments(guest),g=guest.mount(()=>GuestComments(p));await guest.settle();await guest.language('ja');
 assert.equal(input(g),undefined);button(guest,g,'community.comments.input').props.onPress();assert.deepEqual(guest.routes,['/profile/login']);assert.equal(guest.calls.filter(c=>c[0]==='commentCreate').length,0);guest.dispose();
});

for(const target of ['feed','detail','edit','comments'])test(`Compiler-processed ${target} read error reacts ko/ja without an extra read`,async()=>{
 const s=await app({transform,editing:target==='edit',failRead:true}),file=target==='feed'?files[0]:target==='detail'?files[1]:target==='edit'?files[2]:files[5],Screen=s.load(file).default,props=propsForComments(s),root=s.mount(()=>target==='comments'?Screen(props):Screen());await s.settle();
 const calls=s.calls.slice(),key={feed:'community.feed.loadFailed',detail:'community.detail.failed',edit:'community.edit.loadFailed',comments:'community.comments.loadFailed'}[target];
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t(key)));assert.deepEqual(s.calls,calls);}s.dispose();
});

test('Compiler cache assertions remain strict for feed/card/author/hook; legacy finally/ref bailouts are reported',()=>{
 for(const file of [files[0],files[3],files[4],files[6],files[8]])assert.ok(!bailouts.has(file),file);
 for(const [file,events]of bailouts)for(const e of events.filter(e=>e.kind==='CompileError'))assert.match(e.detail.reason,/TryStatement with a finalizer|Cannot access refs during render|UpdateExpression to variables captured within lambdas/,file);
});
