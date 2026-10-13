const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const signed = (name, generation = 'old') => `https://posters.s3.ap-northeast-2.amazonaws.com/content/${name}.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${generation}`;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return {promise,resolve,reject}; };
async function app({ compiled=false }={}) {
  let now=1800000000000,system='ja-JP',props={images:[signed('a'),signed('b'),signed('c')],width:300,popupId:'popup-a',countryCode:'KR',fetchedAt:now};
  const requests=[],sizes=[],file='src/components/place/IntroductionImageCarousel.tsx';
  const NativeImage=Object.assign(()=>null,{getSize:()=>{throw new Error('getSize must not perform a separate image download');}});
  const compile=compilerTransform([file,'src/hooks/useTranslation.ts']);
  const ui=runtime({
    'test-clock':{now:()=>now},
    'react-native':{Image:NativeImage,...Object.fromEntries(['View','Text','Pressable','ActivityIndicator','FlatList'].map(n=>[n,n])),StyleSheet:{create:s=>s}},
    'expo-image':{Image:'ExpoImage'},
    'src/lib/popups.ts':{getPopupDetail:(id,signal,token,language)=>{const wait=deferred();requests.push({id,signal,token,language,...wait});return wait.promise;}},
  },{transform:(path,source)=>{source=source.replaceAll('Date.now()',"require('test-clock').now()");return compiled?compile(path,source):source;}});
  const language=ui.load('src/locales/languageStore.ts').languageStore;
  await language.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>[system]});
  const Carousel=ui.load(file).default,root=ui.mount(()=>Carousel(props));
  const list=()=>nodes(root.tree).find(n=>n.type==='FlatList');
  const slide=index=>{
    let alive=true;const seen=new Set();
    const owner=ui.mount(()=>{
      if(!alive||index>=props.images.length)return null;
      const element=list().props.renderItem({item:props.images[index],index}),tree=typeof element.type==='function'?element.type(element.props):element;
      const image=nodes(tree).find(n=>n.type==='ExpoImage');
      if(image&&!seen.has(image.key)){seen.add(image.key);sizes.push({uri:image.props.source.uri,
        ok:(width,height)=>image.props.onLoad({source:{width,height}}),fail:()=>image.props.onError()});}
      return tree;
    });
    owner.stop=()=>{alive=false;owner.slots.forEach(s=>s?.cleanup?.());};return owner;
  };
  const settle=async()=>{await flush();ui.renderAll();await flush();};
  return {...ui,root,list,slide,requests,sizes,language,settle,
    advance:ms=>{now+=ms;},now:()=>now,props:()=>props,
    update:next=>{props={...props,...next};ui.renderAll();},
    response:(generation='new',images=props.images.map((_,i)=>signed(['a','b','c'][i],generation)))=>({publicId:props.popupId,countryCode:props.countryCode,contentImageUrls:images}),
    async locale(value){await language.setLanguagePreference(value);await settle();},
    system(tag){system=tag;language.refreshSystemLanguage();},
  };
}
const poster=root=>nodes(root.tree).find(n=>n.type==='ExpoImage'||n.props?.source?.uri);
const retry=root=>nodes(root.tree).find(n=>n.props?.testID==='introduction-image-retry');
const page=root=>nodes(root.tree).filter(n=>n.type==='Text').map(n=>[].concat(n.props.children).join('')).find(t=>t.includes(' / '));
test('normal introduction images do not request detail data',async()=>{
  const s=await app(),a=s.slide(0),b=s.slide(1);
  s.sizes.forEach(x=>x.ok(600,800));await s.settle();
  assert.ok(poster(a));assert.ok(poster(b));assert.equal(s.requests.length,0);s.dispose();
});
test('only the failed image receives a refreshed URL; carousel page and healthy image stay unchanged',async()=>{
  const s=await app(),a=s.slide(0),b=s.slide(1);s.sizes.forEach(x=>x.ok(600,800));await s.settle();
  s.list().props.onScroll({nativeEvent:{contentOffset:{x:300}}});
  const before=poster(a).props.source.uri,key=s.list().props.keyExtractor(s.props().images[1],1);
  poster(b).props.onError();await s.settle();assert.equal(s.requests.length,1);
  s.requests[0].resolve(s.response());await s.settle();
  assert.equal(poster(b).props.source.uri,signed('b','new'));assert.equal(poster(a).props.source.uri,before);
  assert.equal(s.list().props.keyExtractor(s.props().images[1],1),key);assert.equal(page(s.root),'2 / 3');s.dispose();
});
test('image sizing no longer depends on getSize; native load failure recovers and new onLoad supplies dimensions',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();assert.equal(s.requests.length,1);
  s.requests[0].resolve(s.response());await s.settle();
  const size=s.sizes.at(-1);size.ok(600,800);await s.settle();assert.equal(poster(b).props.source.uri,signed('b','new'));s.dispose();
});
test('failed GET keeps the sized placeholder; manual retry waits 30 seconds and duplicate taps are ignored',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].ok(100,200);await s.settle();
  const height=s.root.tree.props.style[1].height;poster(b).props.onError();await s.settle();s.requests[0].reject(new Error('offline'));await s.settle();
  assert.equal(poster(b),undefined);assert.ok(texts(b.tree).includes('이미지를 불러올 수 없습니다'));assert.equal(s.root.tree.props.style[1].height,height);
  retry(b).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,1);
  s.advance(29999);retry(b).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,1);
  s.advance(1);const press=retry(b).props.onPress;press({stopPropagation(){}});press({stopPropagation(){}});await s.settle();
  assert.equal(s.requests.length,2);assert.equal(retry(b).props.disabled,true);
  s.requests[1].resolve(s.response('retry'));await s.settle();assert.equal(poster(b).props.source.uri,signed('b','retry'));assert.equal(retry(b),undefined);s.dispose();
});
test('two failing objects and duplicate instances share a detail GET, but leave a healthy slide URL untouched',async()=>{
  const s=await app(),a=s.slide(0),b=s.slide(1),duplicate=s.slide(1),c=s.slide(2);s.sizes.forEach(x=>x.ok(600,800));await s.settle();
  poster(a).props.onError();poster(b).props.onError();poster(duplicate).props.onError();await s.settle();assert.equal(s.requests.length,1);
  s.requests[0].resolve(s.response('renewed',[signed('c','renewed'),signed('b','renewed'),signed('a','renewed')]));await s.settle();
  assert.equal(poster(a).props.source.uri,signed('a','renewed'));assert.equal(poster(b).props.source.uri,signed('b','renewed'));
  assert.equal(poster(duplicate).props.source.uri,signed('b','renewed'));assert.equal(poster(c).props.source.uri,signed('c'));s.dispose();
});
test('duplicate native onError events coalesce; a freshly renewed URL error stops, then five-minute expiry permits recovery',async()=>{
  const s=await app(),b=s.slide(1),error=poster(b).props.onError;
  s.sizes[0].fail();error();error();await s.settle();assert.equal(s.requests.length,1);
  s.requests[0].resolve(s.response());await s.settle();s.sizes.at(-1).ok(600,800);await s.settle();
  poster(b).props.onError();await s.settle();assert.equal(s.requests.length,1);assert.equal(poster(b),undefined);
  s.advance(30000);retry(b).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,2);
  s.requests[1].resolve(s.response('second'));await s.settle();
  s.advance(5*60000);poster(b).props.onError();await s.settle();assert.equal(s.requests.length,3);
  s.requests[2].resolve(s.response('third'));await s.settle();assert.equal(poster(b).props.source.uri,signed('b','third'));s.dispose();
});
test('rapid re-entry shares pending work and failure cooldown; detached slide never updates after response',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();b.stop();const snapshot=JSON.stringify(b.slots.map(slot=>slot?.value));
  const next=s.slide(1);s.sizes.at(-1).fail();await s.settle();assert.equal(s.requests.length,1);
  s.requests[0].reject(new Error('offline'));await s.settle();assert.equal(JSON.stringify(b.slots.map(slot=>slot?.value)),snapshot);next.stop();
  const again=s.slide(1);s.sizes.at(-1).fail();await s.settle();assert.equal(s.requests.length,1);
  s.advance(30000);retry(again).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,2);
  s.requests[1].resolve(s.response());await s.settle();assert.equal(poster(again).props.source.uri,signed('b','new'));s.dispose();
});
test('changing object, deleting an image or rejecting an unmatched API array never substitutes an index neighbor',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();
  s.update({images:[signed('a'),signed('replacement'),signed('c')]});const stale=s.sizes[0];stale.ok(5,1000);
  s.requests[0].resolve(s.response('new',[signed('a','new'),signed('b','new'),signed('c','new')]));await s.settle();
  assert.equal(poster(b).props.source.uri,signed('replacement'));assert.equal(s.root.tree.props.style[1].height,225);
  poster(b).props.onError();await s.settle();s.requests[1].resolve(s.response('gone',[signed('a','new'),signed('c','new')]));await s.settle();
  assert.equal(poster(b),undefined);assert.ok(retry(b));s.update({images:[]});await s.settle();assert.equal(s.root.tree,null);s.dispose();
});
for(const field of ['popupId','countryCode','language'])test(`${field} changes reject the old image response`,async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();
  const old={...s.response()};if(field==='language')await s.locale('ja');else s.update({[field]:field==='countryCode'?'JP':'popup-b'});
    s.requests[0].resolve(old);await s.settle();assert.notEqual(poster(b)?.props.source.uri,signed('b','new'));s.dispose();
});
test('a late detail array preserves the recovered URL, stable item keys, order and active page',async()=>{
  const s=await app(),a=s.slide(0),b=s.slide(1);s.sizes.forEach(x=>x.ok(600,800));await s.settle();
  s.list().props.onScroll({nativeEvent:{contentOffset:{x:300}}});const keys=s.props().images.map((u,i)=>s.list().props.keyExtractor(u,i));
  poster(b).props.onError();await s.settle();s.advance(50);s.requests[0].resolve(s.response());await s.settle();
  const cacheKey=poster(b).props.source.cacheKey;s.update({images:[signed('a','late'),signed('b','late'),signed('c','late')],fetchedAt:s.now()-100});await s.settle();
  assert.equal(poster(b).props.source.uri,signed('b','new'));assert.equal(poster(a).props.source.uri,signed('a'));
  assert.deepEqual(s.props().images.map((u,i)=>s.list().props.keyExtractor(u,i)),keys);assert.equal(page(s.root),'2 / 3');assert.equal(poster(b).props.source.cacheKey,cacheKey);
  assert.equal(s.requests.length,1);s.dispose();
});
test('healthy loaded image survives a URL-only refresh without another dimension lookup, and uses the known URL after an error',async()=>{
  const s=await app(),a=s.slide(0);s.sizes[0].ok(100,200);await s.settle();poster(a).props.onLoad({source:{width:100,height:200}});await s.settle();
  s.update({images:[signed('a','known'),signed('b'),signed('c')],fetchedAt:s.now()+1});await s.settle();
  assert.equal(poster(a).props.source.uri,signed('a'));assert.equal(s.sizes.length,1);assert.equal(s.root.tree.props.style[1].height,200);
  poster(a).props.onError();await s.settle();assert.equal(poster(a).props.source.uri,signed('a','known'));assert.equal(s.requests.length,0);s.dispose();
});
test('an older recovery finishing after a newer normal detail GET cannot roll back its URL, including on remount',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();s.advance(50);
  s.update({images:[signed('a','latest'),signed('b','latest'),signed('c','latest')],fetchedAt:s.now()});await s.settle();
  const latest=s.props();s.requests[0].resolve(s.response('older'));await s.settle();assert.equal(poster(b).props.source.uri,signed('b','latest'));
  b.stop();const mounted=s.slide(1);assert.equal(poster(mounted).props.source.uri,signed('b','latest'));
  const lib=s.load('src/lib/introductionImageRecovery.ts');assert.equal(lib.currentIntroductionUrl({popupId:latest.popupId,countryCode:latest.countryCode,languageCode:'ko'},signed('b','latest'),latest.fetchedAt),signed('b','latest'));s.dispose();
});
test('swiping during recovery and reordering/addition preserve image identity, page and existing dimensions',async()=>{
  const s=await app(),a=s.slide(0),b=s.slide(1);s.sizes[0].ok(100,200);s.sizes[1].ok(300,150);await s.settle();
  poster(a).props.onError();await s.settle();s.list().props.onScroll({nativeEvent:{contentOffset:{x:300}}});assert.equal(s.root.tree.props.style[1].height,150);
  const key=s.list().props.keyExtractor(signed('b'),1);s.requests[0].resolve(s.response());await s.settle();assert.equal(page(s.root),'2 / 3');assert.equal(s.root.tree.props.style[1].height,150);
  s.update({images:[signed('c'),signed('b'),signed('a'),signed('d')]});await s.settle();
  assert.equal(s.list().props.keyExtractor(signed('b'),1),key);assert.equal(page(s.root),'2 / 4');assert.equal(s.root.tree.props.style[1].height,150);assert.equal(poster(b).props.source.uri,signed('b'));s.dispose();
});
test('invalid dimensions use finite fallback; real onLoad restores intrinsic size without a GET',async()=>{
  const s=await app(),a=s.slide(0);s.sizes[0].ok(0,Infinity);await s.settle();assert.equal(s.root.tree.props.style[1].height,225);assert.equal(s.requests.length,0);
  poster(a).props.onLoad({source:{width:NaN,height:0}});await s.settle();assert.equal(s.root.tree.props.style[1].height,225);
  poster(a).props.onLoad({source:{width:100,height:200}});await s.settle();assert.equal(s.root.tree.props.style[1].height,200);
  assert.deepEqual(poster(a).props.style[1],{width:100,height:200});assert.equal(poster(a).props.contentFit,'contain');assert.equal(poster(a).props.cachePolicy,'memory-disk');s.dispose();
});
test('unidentified URLs fail safely without index recovery or a misleading stable cacheKey',async()=>{
  const s=await app();s.update({images:['https://external.test/photo?id=1']});const a=s.slide(0);
  assert.equal(poster(a).props.source.cacheKey,undefined);s.sizes[0].fail();await s.settle();assert.equal(s.requests.length,0);assert.equal(retry(a),undefined);s.dispose();
});
test('an empty image slot shows the existing placeholder without a spinner, retry or API call',async()=>{
  const s=await app();s.update({images:['']});const a=s.slide(0);
  assert.equal(poster(a),undefined);assert.equal(retry(a),undefined);assert.ok(texts(a.tree).includes('이미지를 불러올 수 없습니다'));
  assert.equal(nodes(a.tree).some(n=>n.type==='ActivityIndicator'),false);assert.equal(s.requests.length,0);assert.equal(s.root.tree.props.style[1].height,225);s.dispose();
});
test('late native dimension and error events cannot change a detached image or its carousel geometry',async()=>{
  const s=await app(),a=s.slide(0),event=s.sizes[0];a.stop();const values=JSON.stringify(a.slots.map(slot=>slot?.value));
  event.ok(100,1000);event.fail();await s.settle();assert.equal(JSON.stringify(a.slots.map(slot=>slot?.value)),values);
  assert.equal(s.root.tree.props.style[1].height,225);assert.equal(s.requests.length,0);s.dispose();
});
test('S3 identity excludes signing data but preserves bucket, object, version and duplicate slide keys',async()=>{
  const s=await app(),lib=s.load('src/lib/introductionImageRecovery.ts'),id=lib.introductionImageId;
  assert.equal(id(signed('a')),id(signed('a','new')));assert.notEqual(id(signed('a')),id(signed('b')));
  assert.notEqual(id(signed('a')+'&versionId=1'),id(signed('a')+'&versionId=2'));assert.equal(id('https://s3.amazonaws.com.evil.test/a'),null);
  s.update({images:[signed('a'),signed('a','other')]});assert.notEqual(s.list().props.keyExtractor(s.props().images[0],0),s.list().props.keyExtractor(s.props().images[1],1));s.dispose();
});
test('compiled mounted retry labels follow ko-ja-ko/system without refetch or page reset',async()=>{
  const s=await app({compiled:true}),b=s.slide(1);s.list().props.onScroll({nativeEvent:{contentOffset:{x:300}}});
  s.sizes[0].fail();await s.settle();s.requests[0].reject(new Error('offline'));await s.settle();
  for(const [lang,label]of [['ja','再試行'],['ko','다시 시도'],['system','再試行']]){
    await s.locale(lang);assert.equal(retry(b).props.accessibilityLabel,label);
    assert.equal(page(s.root),'2 / 3');assert.equal(s.requests.length,1);
  }
  s.system('ko-KR');await s.settle();assert.equal(retry(b).props.accessibilityLabel,'다시 시도');assert.equal(s.requests.length,1);s.dispose();
});
test('language switches cannot bypass failure cooldown or the immediate recovered-URL guard',async()=>{
  const s=await app(),b=s.slide(1);s.sizes[0].fail();await s.settle();s.requests[0].reject(new Error('offline'));await s.settle();
  await s.locale('ja');retry(b).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,1);
  s.advance(30000);retry(b).props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.requests.length,2);
  s.requests[1].resolve(s.response());await s.settle();await s.locale('ko');s.advance(30001);
  poster(b).props.onError();await s.settle();assert.equal(s.requests.length,2);assert.ok(retry(b));s.dispose();
});

test('real detail owner, favorite, review rows and scroll ref survive introduction recovery and a late summary GET',async()=>{
  const {app:detailApp,detail:base}=require('./helpers/mapDetailRuntime.cjs');
  const pending=[],listeners=new Set(),images=[signed('a'),signed('b')],original={...base,contentImageUrls:images};
  const s=await detailApp({detailResponse:()=>{if(!pending.length){pending.push(null);return original;}const wait=deferred();pending.push(wait);return wait.promise;}});
  const reviewApi=s.load('src/lib/reviews.ts'),oldRead=reviewApi.getPopupReviews;
  reviewApi.subscribeReviews=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
  reviewApi.getPopupReviews=async(...args)=>{await oldRead(...args);return {items:[{id:7,type:'REVIEW',liked:true,likeCount:2,commentCount:0,content:'review',author:{id:1,nickname:'user'}}],nextCursor:'next'};};
  s.load('src/lib/favorites.ts').favoritePopup=async()=>({isFavorited:true,favoriteCount:4});
  const Screen=s.load('src/app/places/[id].tsx').default,screen=s.mount(()=>Screen());await s.settle();
  const find=name=>nodes(screen.tree).find(n=>n.type===name||n.type?.name===name);
  const carousel=s.mount(()=>{const n=find('IntroductionImageCarousel');return n?n.type(n.props):null;});
  const list=()=>nodes(carousel.tree).find(n=>n.type==='FlatList');
  list().props.onScroll({nativeEvent:{contentOffset:{x:358}}});
  const scroll=find('ScrollView'),ref=scroll.props.ref,scrollCalls=[];ref.current={scrollTo:value=>scrollCalls.push(value)};
  const Reviews=s.load('src/components/place/PopupReviews.tsx').default,reviews=s.mount(()=>Reviews({publicId:base.publicId,title:base.name}));await s.settle();
  const rows=()=>nodes(reviews.tree).filter(n=>n.type==='ReviewCard').map(n=>n.props.post),rowSnapshot=rows();
  listeners.forEach(fn=>fn(base.publicId,'edited'));await s.settle();assert.equal(pending.length,2);
  nodes(screen.tree).find(n=>n.props.accessibilityLabel==='찜하기').props.onPress();await s.settle();
  const stable=find('PopupHeroImage').props.popup,heroKey=find('PopupHeroImage').key;
  const b=s.mount(()=>{const n=list()?.props.renderItem({item:images[1],index:1});return n?n.type(n.props):null;});
  poster(b).props.onError();await s.settle();assert.equal(pending.length,3);
  pending[2].resolve({...original,contentImageUrls:[signed('a','new'),signed('b','new')],isFavorited:false,favoriteCount:999,notice:'stale notice'});await s.settle();
  assert.equal(poster(b).props.source.uri,signed('b','new'));
  pending[1].resolve({...original,reviewCount:5,averageRating:4});await s.settle();
  const after=find('PopupHeroImage').props.popup;
  for(const key of ['isFavorited','favoriteCount','notice','benefits','summary','address','operatingHours','coverImageUrl'])assert.deepEqual(after[key],stable[key],key);
  assert.deepEqual(find('IntroductionImageCarousel').props.images,images);assert.equal(find('DetailTabs').props.selectedTab,'info');
  assert.equal(find('ScrollView').props.ref,ref);assert.equal(find('PopupHeroImage').key,heroKey);assert.deepEqual(scrollCalls,[]);assert.equal(page(carousel),'2 / 2');
  assert.deepEqual(rows(),rowSnapshot);assert.equal(s.calls.reviews.length,1);assert.equal(poster(b).props.source.uri,signed('b','new'));
  find('DetailTabs').props.onSelectReviews();assert.equal(find('DetailTabs').props.selectedTab,'reviews');s.dispose();
});
