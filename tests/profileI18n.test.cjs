const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {test}=require('node:test');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {app,files,button,list,input}=require('./helpers/profileI18nRuntime.cjs');
test('profile fixed UI keys and app-mapped errors exist with matching variables in ko/ja',()=>{
 const resources=['ko','ja'].map(l=>require('../src/locales/'+l+'.json')),keys=new Set();
 for(const f of files){const ast=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n){if(ts.isStringLiteral(n)&&/^(profile|language|place|community)\./.test(n.text)&&!n.text.endsWith('.'))keys.add(n.text);ts.forEachChild(n,visit);}visit(ast);}
 const lookup=(o,k)=>k.split('.').reduce((v,p)=>v?.[p],o);
 for(const k of keys){const [a,b]=resources.map(r=>lookup(r,k));assert.ok(a?.trim(),k);assert.ok(b?.trim(),k);assert.deepEqual(a.match(/\{\w+\}/g)??[],b.match(/\{\w+\}/g)??[],k);}
 assert.deepEqual(Object.keys(resources[0].profile),Object.keys(resources[1].profile));
});
test('profile main and menu keep raw user/links/session restore while subscribing to language',async()=>{
 const s=await app(),Screen=s.load(files[0]).default,root=s.mount(()=>Screen());await s.settle();
 const original=s.user(),calls=s.calls.slice();
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.title')));assert.ok(texts(root.tree).includes(original.nickname));assert.ok(texts(root.tree).includes(original.email));
  const menus=nodes(root.tree).filter(n=>n.type?.name==='MenuRow');assert.ok(menus.some(n=>n.props.label===s.t('profile.posts.title')));assert.equal(s.user(),original);assert.deepEqual(s.calls,calls);}
 nodes(root.tree).find(n=>n.type?.name==='MenuRow'&&n.props.label===s.t('profile.posts.title')).props.onPress();assert.deepEqual(s.routes,['/profile/posts']);s.dispose();
});
for(const [index,key]of [[1,'posts'],[2,'reviews']])test(`my ${key}: retained loaded pages/cursor/raw IDs and card props do not refetch on language changes`,async()=>{
 const s=await app(),Screen=s.load(files[index]).default,root=s.mount(()=>Screen());await s.settle();list(root).props.onEndReached();await s.settle();
 const data=list(root).props.data,calls=s.calls.slice(),keyFn=list(root).props.keyExtractor,styles=list(root).props.contentContainerStyle;
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t(`profile.${key}.title`)));assert.equal(list(root).props.data,data);assert.equal(list(root).props.keyExtractor(data[0]),keyFn(data[0]));assert.equal(list(root).props.contentContainerStyle,styles);assert.deepEqual(s.calls,calls);
  const row=list(root).props.renderItem({item:data[0]}),card=nodes(row).find(n=>n.type==='Card');assert.equal(card.props.post,data[0]);assert.equal(card.props.post.images,data[0].images);}
 const card=nodes(list(root).props.renderItem({item:data[0]})).find(n=>n.type==='Card');card.props[index===1?'onPressPost':'onPressReview']();assert.equal(s.routes.at(-1).params.id,String(data[0].id));s.dispose();
});
test('favorites preserves F12 cache/list/IDs and displays translated numeric tags and schedule fallback',async()=>{
 const s=await app(),Screen=s.load(files[3]).default,root=s.mount(()=>Screen());await s.settle();const cache=s.cache(),calls=s.calls.slice(),raw=JSON.stringify(cache);
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.favorites.title')));assert.ok(texts(root.tree).includes(s.t('place.detail.schedulePending')));assert.ok(texts(root.tree).includes(lang==='ko'?'뷰티':'ビューティー'));assert.ok(texts(root.tree).includes('미등록 원문'));assert.equal(s.cache(),cache);assert.equal(JSON.stringify(cache),raw);assert.deepEqual(s.calls,calls);}
 const card=nodes(root.tree).find(n=>n.key===s.popup.publicId);assert.equal(card.props.accessibilityLabel,s.t('place.explore.viewDetails',{title:s.popup.name}));card.props.onPress();assert.deepEqual(s.routes,[s.popup.publicId]);s.dispose();
});
test('nickname retains input and reactive validation/success without redoing availability or PATCH',async()=>{
 const s=await app(),Screen=s.load(files[4]).default,root=s.mount(()=>Screen({kind:'nickname'}));
 input(root).props.onChangeText('!');button(s,root,'profile.nickname.save').props.onPress();assert.ok(texts(root.tree).includes(s.t('profile.nickname.invalid')));
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.equal(input(root).props.value,'!');assert.ok(texts(root.tree).includes(s.t('profile.nickname.invalid')));assert.equal(s.calls.length,0);}
 input(root).props.onChangeText('新しい名前');const before=input(root).props.ref;await s.language('ko');assert.equal(input(root).props.ref,before);assert.equal(input(root).props.value,'新しい名前');
 button(s,root,'profile.nickname.save').props.onPress();await s.settle();const calls=s.calls.slice();assert.equal(s.user().nickname,'新しい名前');
 for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.nickname.changed')));assert.equal(s.user().nickname,'新しい名前');assert.deepEqual(s.calls,calls);}
 for(const [available,error,key]of [[false,null,'taken'],[true,new s.ApiError(409),'taken'],[true,new Error('server free text'),'saveFailed']]){
  s.available(available);s.failSave(error);input(root).props.onChangeText('別の名前');button(s,root,'profile.nickname.save').props.onPress();await s.settle();const requests=s.calls.slice();
  for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.nickname.'+key)));assert.equal(input(root).props.value,'別の名前');assert.equal(s.user().nickname,'新しい名前');assert.deepEqual(s.calls,requests);}
 }s.dispose();
});
test('empty/error/guest profile states translate without changing request counts or retry behavior',async()=>{
 for(const [index,key]of [[1,'profile.posts.empty'],[2,'profile.reviews.empty'],[3,'profile.favorites.empty']]){
  const s=await app({empty:true}),Screen=s.load(files[index]).default,root=s.mount(()=>Screen());await s.settle();const calls=s.calls.slice();
  for(const lang of ['ja','ko']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t(key)));assert.deepEqual(s.calls,calls);}s.dispose();}
 for(const [index,key]of [[1,'community.feed.loadFailed'],[2,'place.detail.reviews.loadFailed'],[3,'profile.favorites.loadFailed']]){
  const s=await app({fail:true}),Screen=s.load(files[index]).default,root=s.mount(()=>Screen());await s.settle();const calls=s.calls.slice();
  for(const lang of ['ja','ko']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t(key)));assert.ok(!texts(root.tree).includes(s.t(index===1?'profile.posts.empty':index===2?'profile.reviews.empty':'profile.favorites.empty')));assert.deepEqual(s.calls,calls);}
  button(s,root,'profile.retry').props.onPress();await s.settle();assert.equal(s.calls.filter(c=>c[0]===['','posts','reviews','favorites'][index]).length,2);s.dispose();}
 const s=await app({guest:true,fail:true}),Screen=s.load(files[0]).default,root=s.mount(()=>Screen());await s.settle();
 for(const lang of ['ja','ko']){await s.language(lang);assert.ok(texts(root.tree).includes(s.t('profile.loginTitle')));assert.ok(texts(root.tree).includes(s.t('profile.userLoadFailed')));}button(s,root,'profile.login').props.onPress();assert.deepEqual(s.routes,[{pathname:'/profile/login',params:{loginOrigin:'profile'}}]);s.dispose();
});
