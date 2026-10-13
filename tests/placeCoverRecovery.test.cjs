const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function managerEnvironment() {
  let now = 1_800_000_000_000;
  class Clock extends Date { static now() { return now; } }
  const code = ts.transpileModule(readFileSync('src/lib/placeCoverRecovery.ts','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const lib = {};
  new Function('exports','Date',code)(lib,Clock);
  const requests = [], patches = [];
  const manager = lib.createPlaceCoverRecovery((id,signal) => {
    const wait = deferred(); requests.push({ id, signal, ...wait }); return wait.promise;
  }, (...args) => patches.push(args));
  const item = { publicId:'popup-a', name:'원문 제목', countryCode:'KR', regionId:1, regionName:'성수',
    startDate:'2026-10-01', endDate:'2026-10-31', latitude:37, longitude:127, tags:[{id:5,name:'뷰티'}],
    coverImageUrl:'https://images.test/old', coverImageCacheKey:'object-a', coverImageFetchedAt:now-lib.COVER_URL_FRESH_MS };
  return { lib, manager, requests, patches, item, advance:ms => now+=ms, now:() => now };
}
async function app({ path=null, fresh=false, missing=false, compiled=false, popup, environment=managerEnvironment() }={}) {
  const env = environment, cacheCalls=[];
  function ExpoImage() {}
  ExpoImage.getCachePathAsync = async key => { cacheCalls.push(key); return path; };
  const ui = runtime({
    'src/lib/placeCoverRecovery.ts':env.lib,
    'expo-image': { Image:ExpoImage },
    'react-native': { ...Object.fromEntries(['View','Text','Pressable'].map(n=>[n,n])),
      StyleSheet:{create:s=>s}, useWindowDimensions:()=>({width:390,fontScale:1}) },
    '@expo/vector-icons':{Ionicons:'Ionicons'},'lucide-react-native':{Heart:'Heart'},
  }, compiled ? {transform:compilerTransform(['src/components/place/PopupGridCard.tsx','src/hooks/useTranslation.ts'])} : {});
  const store=ui.load('src/locales/languageStore.ts').languageStore;
  await store.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP']});
  const hook=ui.load('src/hooks/usePlaceCoverImage.ts').usePlaceCoverImage;
  const Card=ui.load('src/components/place/PopupGridCard.tsx').default;
  const recover=item=>env.manager.recover(item);
  let item={...(popup??env.item),...(fresh?{coverImageFetchedAt:env.now()}:{}),...(missing?{coverImageUrl:null}:{})};
  const hookRoot=ui.mount(()=>hook(item,recover));
  const cardRoot=ui.mount(()=>Card({item,width:170,isFavorite:false,isFavoriteDisabled:false,
    onToggleFavorite(){},onPress(){},onRecoverCover:recover}));
  const image=()=>nodes(cardRoot.tree).find(n=>n.type===ExpoImage);
  const settle=async()=>{await flush();await flush();};
  await settle();
  return {...env,...ui,store,cacheCalls,hookRoot,cardRoot,image,settle,
    replace:patch=>{item={...item,...patch};hookRoot.render();cardRoot.render();},
    unmount:()=>ui.dispose()};
}

test('failed recovery becomes eligible after cooldown; sharing and repeated failures stay bounded',async()=>{
  const e=managerEnvironment();
  const first=e.manager.recover(e.item);assert.equal(first,e.manager.recover(e.item));await Promise.resolve();
  e.requests[0].reject(Error('offline'));assert.equal(await first,null);
  for(let i=0;i<30;i++)assert.equal(await e.manager.recover(e.item),null);
  assert.equal(e.requests.length,1);e.advance(29_999);assert.equal(await e.manager.recover(e.item),null);
  e.advance(1);const retry=e.manager.recover(e.item);assert.equal(retry,e.manager.recover(e.item));await Promise.resolve();
  assert.equal(e.requests.length,2);e.requests[1].resolve({...e.item,coverImageUrl:'https://images.test/new'});
  assert.equal((await retry).coverImageUrl,'https://images.test/new');assert.equal(e.patches.length,1);
  e.advance(60_000);assert.equal(await e.manager.recover(e.item),null);assert.equal(e.requests.length,2);
});

test('rapid card mounts share a pending request and do not bypass cooldown; later remount recovers',async()=>{
  const environment=managerEnvironment();
  let s=await app({environment});
  for(let i=0;i<5;i++){s.unmount();s=await app({environment});}
  assert.equal(environment.requests.length,1);
  environment.requests[0].reject(Error('offline'));await s.settle();s.unmount();
  for(let i=0;i<10;i++){
    s=await app({environment});assert.match(s.image().props.source,/ranking-placeholder\.png$/);s.unmount();
  }
  assert.equal(environment.requests.length,1);assert.equal(environment.patches.length,0);
  environment.advance(30_000);s=await app({environment});assert.equal(environment.requests.length,2);
  environment.requests[1].reject(Error('still offline'));await s.settle();s.unmount();
  environment.advance(29_999);s=await app({environment});assert.equal(environment.requests.length,2);s.unmount();
  environment.advance(1);s=await app({environment});
  try{
    assert.equal(environment.requests.length,3);
    environment.requests[2].resolve({...environment.item,coverImageUrl:'https://images.test/reconnected'});await s.settle();
    assert.equal(s.image().props.source.uri,'https://images.test/reconnected');assert.equal(environment.patches.length,1);
  }finally{s.unmount();}
});

test('disk image loading error recovers once; retired source events cannot hide its replacement',async()=>{
  const s=await app({path:'/cache/poster.jpg'});
  try{
    const retired=s.image().props.onError;
    assert.equal(s.image().props.source.uri,'file:///cache/poster.jpg');assert.equal(s.requests.length,0);
    retired();s.hookRoot.tree.onError();await s.settle();assert.equal(s.requests.length,1);
    assert.match(s.image().props.source,/ranking-placeholder\.png$/);
    s.requests[0].resolve({...s.item,coverImageUrl:'https://images.test/fixed'});await s.settle();
    assert.equal(s.image().props.source.uri,'https://images.test/fixed');
    retired();await s.settle();assert.equal(s.image().props.source.uri,'https://images.test/fixed');assert.equal(s.requests.length,1);
  }finally{s.unmount();}
});

test('reset aborts pending recovery and old failure cannot throttle a new list generation',async()=>{
  const e=managerEnvironment();const old=e.manager.recover(e.item);await Promise.resolve();e.manager.reset();
  const current=e.manager.recover(e.item);await Promise.resolve();assert.equal(e.requests[0].signal.aborted,true);
  e.requests[0].reject(Error('old failure'));assert.equal(await old,null);assert.equal(e.manager.recover(e.item),current);
  e.requests[1].reject(Error('current failure'));assert.equal(await current,null);
  e.manager.reset();const afterReset=e.manager.recover(e.item);await Promise.resolve();assert.equal(e.requests.length,3);
  const replacement={...e.item,coverImageUrl:'https://images.test/replacement',coverImageCacheKey:'object-b'};
  e.requests[2].resolve(replacement);await afterReset;e.advance(60_000);
  assert.equal(await e.manager.recover(replacement),null);assert.equal(e.requests.length,3);
});

test('final recovery failure and missing/fresh broken images use existing placeholder without resizing',async()=>{
  const s=await app();
  try {
    const poster=s.image().props.style,card=s.cardRoot.tree.props.style;
    s.requests[0].reject(Error('offline'));await s.settle();
    assert.match(s.image().props.source,/ranking-placeholder\.png$/);
    assert.deepEqual(s.image().props.style,poster);assert.deepEqual(s.cardRoot.tree.props.style,card);
    assert.equal(nodes(s.cardRoot.tree).find(n=>n.props?.style?.aspectRatio).props.style.aspectRatio,4/5);
    s.image().props.onError();await s.settle();assert.equal(s.requests.length,1);
  }finally{s.unmount();}
  for(const options of [{missing:true},{fresh:true}]){
    const s=await app(options);
    try{
      if(!options.missing)s.image().props.onError();await s.settle();
      assert.match(s.image().props.source,/ranking-placeholder\.png$/);assert.equal(s.requests.length,0);
    }finally{s.unmount();}
  }
});

test('old source callbacks and late recovery responses cannot change a new image or an unmounted hook',async()=>{
  const s=await app();const oldError=s.hookRoot.tree.onError;
  s.replace({publicId:'popup-b',coverImageUrl:'https://images.test/b',coverImageCacheKey:'object-b',coverImageFetchedAt:s.now()});
  oldError();s.requests[0].resolve({...s.item,coverImageUrl:'https://images.test/late-a'});await s.settle();
  assert.equal(s.hookRoot.tree.source.uri,'https://images.test/b');assert.equal(s.requests.length,1);s.unmount();
  const detached=await app({path:'/cache/broken.jpg'});
  detached.hookRoot.tree.onError();await detached.settle();const before=detached.hookRoot.tree;
  detached.unmount();detached.requests[0].resolve({...detached.item,coverImageUrl:'https://images.test/late'});await detached.settle();
  assert.equal(detached.hookRoot.tree,before,'no state publication after unmount');
});

test('server confirms no cover: placeholder remains and no retry occurs after cooldown',async()=>{
  const environment=managerEnvironment();let s=await app({environment});
  environment.requests[0].resolve({...environment.item,coverImageUrl:null,coverImageCacheKey:null});await s.settle();
  assert.match(s.image().props.source,/ranking-placeholder\.png$/);assert.equal(environment.patches.length,1);s.unmount();
  environment.advance(60_000);s=await app({environment});
  try{assert.match(s.image().props.source,/ranking-placeholder\.png$/);assert.equal(environment.requests.length,1);}
  finally{s.unmount();}
});

test('successful recovery keeps cache identity; recovered URL failure terminates with placeholder',async()=>{
  const s=await app();
  try{
    s.requests[0].resolve({...s.item,coverImageUrl:'https://images.test/new'});await s.settle();
    assert.deepEqual(s.hookRoot.tree.source,{uri:'https://images.test/new',cacheKey:'object-a'});
    assert.equal(s.image().props.cachePolicy,'memory-disk');s.image().props.onError();await s.settle();
    assert.match(s.image().props.source,/ranking-placeholder\.png$/);assert.equal(s.requests.length,1);
    s.advance(60_000);s.image().props.onError();await s.settle();assert.equal(s.requests.length,1);
  }finally{s.unmount();}
});

test('successful cover can expire twice: cache misses recover newer URL generations with the same image key',async()=>{
  const environment=managerEnvironment();let s=await app({environment});
  try{
    let popup=environment.item;
    for(let generation=1;generation<=3;generation++){
      assert.equal(environment.requests.length,generation,'an expired renewed URL must remain recoverable');
      const detail={...popup,coverImageUrl:`https://images.test/generation-${generation}`};
      environment.requests[generation-1].resolve(detail);await s.settle();
      assert.equal(s.image().props.source.uri,detail.coverImageUrl);
      assert.equal(s.image().props.source.cacheKey,'object-a');
      const [original,recovered,fetchedAt]=environment.patches.at(-1);
      popup=environment.lib.mergeRecoveredCover([popup],original,recovered,fetchedAt)[0];
      s.replace(popup);s.image().props.onLoad();s.hookRoot.tree.onLoad();
      assert.equal(await environment.manager.recover(environment.item),null,'obsolete original source stays blocked');
      if(generation===3)break;
      environment.advance(300_001);s.cardRoot.render();s.hookRoot.render();await s.settle();
      assert.equal(environment.requests.length,generation,'a visible loaded poster never renews just because time passed');
      s.unmount();s=await app({environment,popup});
      assert.match(s.image().props.source,/ranking-placeholder\.png$/);
    }
    assert.equal(environment.patches.length,3);
  }finally{s.unmount();}
});

test('mounted renewed poster recovers a later loading error while sharing the second request',async()=>{
  const s=await app();
  try{
    const first={...s.item,coverImageUrl:'https://images.test/first'};
    s.requests[0].resolve(first);await s.settle();
    s.replace({...first,coverImageFetchedAt:s.patches[0][2]});
    s.image().props.onLoad();s.hookRoot.tree.onLoad();s.advance(300_001);
    s.image().props.onError();s.hookRoot.tree.onError();await s.settle();
    assert.equal(s.requests.length,2);assert.match(s.image().props.source,/ranking-placeholder\.png$/);
    s.requests[1].resolve({...first,coverImageUrl:'https://images.test/second'});await s.settle();
    assert.equal(s.image().props.source.uri,'https://images.test/second');
    assert.equal(s.image().props.cachePolicy,'memory-disk');
  }finally{s.unmount();}
});

test('failed later renewal preserves successful generation guards and the thirty second cooldown',async()=>{
  const e=managerEnvironment(),first=e.manager.recover(e.item);await Promise.resolve();
  const detail={...e.item,coverImageUrl:'https://images.test/first'};
  e.requests[0].resolve(detail);await first;
  const renewed=e.lib.mergeRecoveredCover([e.item],e.item,detail,e.patches[0][2])[0];
  e.advance(300_001);const second=e.manager.recover(renewed);
  assert.equal(second,e.manager.recover(renewed));await Promise.resolve();e.requests[1].reject(Error('offline'));await second;
  e.advance(29_999);assert.equal(await e.manager.recover(renewed),null);assert.equal(e.requests.length,2);
  assert.equal(await e.manager.recover(e.item),null,'a failed newer attempt must not erase the original source guard');
  e.advance(1);const retry=e.manager.recover(renewed);await Promise.resolve();assert.equal(e.requests.length,3);
  e.requests[2].resolve({...detail,coverImageUrl:'https://images.test/second'});await retry;
  assert.equal(await e.manager.recover(renewed),null,'the now retired first renewal is blocked');
});

test('slow successful requests cannot immediately loop on the freshly received URL',async()=>{
  const e=managerEnvironment(),first=e.manager.recover(e.item);await Promise.resolve();e.advance(300_001);
  const detail={...e.item,coverImageUrl:'https://images.test/slow'};e.requests[0].resolve(detail);await first;
  const renewed=e.lib.mergeRecoveredCover([e.item],e.item,detail,e.patches[0][2])[0];
  assert.equal(e.lib.isCoverUrlStale(renewed),true,'request-start age alone overestimates the newly delivered URL age');
  for(let i=0;i<10;i++)assert.equal(await e.manager.recover(renewed),null);
  e.advance(e.lib.COVER_URL_FRESH_MS-1);assert.equal(await e.manager.recover(renewed),null);
  e.advance(1);const next=e.manager.recover(renewed);await Promise.resolve();assert.equal(e.requests.length,2);
  e.requests[1].resolve({...detail,coverImageUrl:'https://images.test/next'});await next;
});

test('pending recovery never supplies an older URL generation to another source of the same image',async()=>{
  const e=managerEnvironment(),old=e.manager.recover(e.item);await Promise.resolve();e.advance(300_001);
  const current={...e.item,coverImageUrl:'https://images.test/newer-list',coverImageFetchedAt:e.now()-e.lib.COVER_URL_FRESH_MS};
  const blocked=e.manager.recover(current);assert.notEqual(blocked,old);assert.equal(await blocked,null);
  assert.equal(await e.manager.recover({...current,coverImageCacheKey:'different-object'}),null);
  const retired={...e.item,coverImageUrl:'https://images.test/late'};e.requests[0].resolve(retired);await old;
  assert.equal(e.lib.mergeRecoveredCover([current],...e.patches[0])[0],current);
  assert.equal(e.requests.length,1);
});

test('mounted compiled card keeps normal images and request count across ko-ja-ko/system changes',async()=>{
  const s=await app({fresh:true,compiled:true});
  try{
    s.hookRoot.tree.onLoad();s.image().props.onLoad();s.advance(s.lib.COVER_URL_FRESH_MS);
    const source=s.image().props.source;
    for(const preference of ['ja','ko','system']){
      await s.store.setLanguagePreference(preference);
      assert.ok(texts(s.cardRoot.tree).includes(preference==='ko'?'진행중':'開催中'));
      assert.deepEqual(s.image().props.source,source);assert.equal(s.requests.length,0);assert.equal(s.cacheCalls.length,0);
    }
  }finally{s.unmount();}
});
