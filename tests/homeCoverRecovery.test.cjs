const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const poster = (country='KR', language='ko') => ({ publicId:'popup-a', name:`${country}:${language}`, countryCode:country,
  regionId:1, regionName:'성수', latitude:37, longitude:127, startDate:'2026-10-08', endDate:'2026-10-31', tags:[],
  coverImageUrl:`https://images.test/${country}/${language}/old`, coverImageCacheKey:`object-${country}` });
async function app({ compiled=false, slowList=false, differentSignatures=false }={}) {
  let now=1_800_000_000_000, country='KR', system='ja-JP', timerId=0;
  const lists=[], details=[], timers=new Map(), opened=[], toggled=[];
  const compiler=compilerTransform(['src/components/home/NewPopupCard.tsx','src/components/home/PopupRankingCard.tsx','src/hooks/useTranslation.ts']);
  const ui=runtime({
    'test-clock':{now:()=>now},
    'react-native':{Image:'Image',View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:s=>s}},
    'expo-image':{Image:'ExpoImage'},'lucide-react-native':{Heart:'Heart'},
    'src/theme/useTheme.ts':{useTheme:()=>({resolvedTheme:'light',themeColors:{}})},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,at:now+delay});return timerId;},clearTimeout:id=>timers.delete(id),
    'src/lib/popups.ts':{
      getNewPopups:(c,signal,l)=>list('new',c,signal,l),getNowHotPopups:(c,signal,l)=>list('trending',c,signal,l),
      getPopupDetail:(id,signal,token,language)=>{const wait=deferred();details.push({id,signal,token,language,...wait});return wait.promise;},
    },
  },{transform:(file,source)=>{
    source=source.replaceAll('Date.now()', "require('test-clock').now()");
    return compiled ? compiler(file,source) : source;
  }});
  function list(section,c,signal,l){
    const wait=deferred();lists.push({section,c,signal,l,...wait});
    const item=poster(c,l);
    if(differentSignatures)item.coverImageUrl+=`/${section}`;
    if(!slowList)wait.resolve([item,{...item,publicId:'popup-b',coverImageCacheKey:`other-${c}`}]);
    return wait.promise;
  }
  const languageStore=ui.load('src/locales/languageStore.ts').languageStore;
  await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>[system]});
  const home=ui.load('src/hooks/useHomePopups.ts').useHomePopups;
  const root=ui.mount(()=>home('new',country));
  const settle=async()=>{await flush();await flush();ui.renderAll();await flush();};
  const card=(kind='NewPopupCard',listRoot=root,index=0)=>{
    const Card=ui.load(`src/components/home/${kind}.tsx`).default;
    const r=ui.mount(()=>{
      const item=listRoot.tree.popups[index];
      return Card({width:152,rank:1,image:item?.coverImageUrl?{uri:item.coverImageUrl}:123,popup:item,
        coverScope:`${country}:${languageStore.getSnapshot().resolvedLanguage}`,onRecoverCover:listRoot.tree.recoverCover,
        title:item?.name??'',period:'date',tags:[],isFavorite:false,isFavoriteDisabled:false,
        onPress:()=>opened.push(item?.publicId),onToggleFavorite:()=>toggled.push(item?.publicId)});
    });
    return {root:r,image:()=>nodes(r.tree).find(n=>n.type==='ExpoImage'||n.type==='Image'),
      retry:()=>nodes(r.tree).find(n=>n.props?.testID==='home-cover-retry'),
      unmount:()=>r.slots.forEach(s=>s?.cleanup?.())};
  };
  await settle();
  return {...ui,root,card,lists,details,timers,opened,toggled,settle,languageStore,
    more:section=>ui.mount(()=>home(section,country)),
    advance(ms){now+=ms;},now:()=>now,
    async runTimers(){for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await settle();},
    async country(value){country=value;ui.renderAll();await settle();},
    async language(value){await languageStore.setLanguagePreference(value);await settle();},
    async system(value){system=value;languageStore.refreshSystemLanguage();await settle();},
  };
}

for(const kind of ['NewPopupCard','PopupRankingCard']) {
  test(`${kind}: normal image has no recovery; expired error refreshes only cover fields using stable key`,async()=>{
    const s=await app();const c=s.card(kind);
    try{
      c.image().props.onLoad?.();await s.settle();assert.equal(s.details.length,0);
      const untouched=s.root.tree.popups[1],before=s.root.tree.popups[0];s.advance(360_000);
      assert.equal(typeof c.image().props.onError,'function','old home cards cannot recover an image error');
      c.image().props.onError();await s.settle();assert.equal(s.details.length,1);assert.equal(s.lists.length,1);
      s.details[0].resolve({...before,name:'must not replace title',coverImageUrl:'https://images.test/new'});await s.settle();
      assert.equal(c.image().props.source.uri,'https://images.test/new');assert.equal(c.image().props.source.cacheKey,before.coverImageCacheKey);
      assert.equal(c.image().props.cachePolicy,'memory-disk');assert.equal(s.root.tree.popups[0].name,before.name);
      assert.equal(s.root.tree.popups[1],untouched);assert.equal(c.retry(),undefined);
      assert.equal(s.lists.length,1);s.more('new');await s.settle();assert.equal(s.lists.length,1,'cached remount must not re-fetch');
      s.advance(240_001);await s.runTimers();assert.equal(s.lists.length,2,'original ten minute TTL must not move after recovery');
    }finally{s.dispose();}
  });
}

test('fresh network error also recovers; failed API has placeholder and mounted user retry after cooldown',async()=>{
  const s=await app(),c=s.card();
  try{
    c.image().props.onError();await s.settle();s.details[0].reject(Error('offline'));await s.settle();
    assert.match(c.image().props.source,/ranking-placeholder\.png$/);assert.ok(c.retry());
    let stopped=0;for(let i=0;i<10;i++)c.retry().props.onPress({stopPropagation(){stopped++;}});
    await s.settle();assert.equal(s.details.length,1);assert.deepEqual(s.opened,[]);
    s.advance(29_999);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,1);
    s.advance(1);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,2);
    s.details[1].resolve({...poster(),coverImageUrl:'https://images.test/online'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/online');assert.equal(c.retry(),undefined);assert.equal(stopped,10);
  }finally{s.dispose();}
});

test('new and trending cards share same-image requests; rapid remounts do not bypass cooldown',async()=>{
  const s=await app();const trending=s.more('trending');await s.settle();let a=s.card(),b=s.card('PopupRankingCard',trending);
  try{
    a.image().props.onError();b.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    for(let i=0;i<6;i++){a.unmount();a=s.card();a.image().props.onError();await s.settle();}
    assert.equal(s.details.length,1);s.details[0].reject(Error('offline'));await s.settle();
    for(let i=0;i<6;i++){a.unmount();a=s.card();a.image().props.onError();await s.settle();}
    assert.equal(s.details.length,1);s.advance(30_000);a.retry().props.onPress({stopPropagation(){}});await s.settle();
    assert.equal(s.details.length,2);s.details[1].resolve({...poster(),coverImageUrl:'https://images.test/shared'});await s.settle();
    assert.equal(a.image().props.source.uri,'https://images.test/shared');assert.equal(b.image().props.source.uri,'https://images.test/shared');
  }finally{s.dispose();}
});

test('same stable image with different signed URLs shares recovery and terminates replacement URL errors',async()=>{
  const s=await app({differentSignatures:true});s.advance(5);const trending=s.more('trending');await s.settle();
  const a=s.card(),b=s.card('PopupRankingCard',trending);
  try{
    a.image().props.onError();b.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    s.details[0].resolve({...poster(),coverImageUrl:'https://images.test/shared',coverImageCacheKey:'new-object'});await s.settle();
    assert.equal(a.image().props.source.uri,'https://images.test/shared');assert.equal(b.image().props.source.uri,'https://images.test/shared');
    assert.equal(trending.tree.popups[0].coverImageUrl,'https://images.test/shared');
    a.image().props.onError();b.image().props.onError();await s.settle();assert.equal(s.details.length,1);
    assert.ok(a.retry());assert.ok(b.retry());
  }finally{s.dispose();}
});

test('loaded healthy sibling keeps its image while another card recovers; known new URL is used without another API',async()=>{
  const s=await app(),trending=s.more('trending');await s.settle();const a=s.card(),b=s.card('PopupRankingCard',trending);
  try{
    b.image().props.onLoad();const visible=b.image().props.source,key=b.image().key;
    a.image().props.onError();await s.settle();assert.deepEqual(b.image().props.source,visible);
    s.details[0].resolve({...poster(),coverImageUrl:'https://images.test/new'});await s.settle();
    assert.deepEqual(b.image().props.source,visible);assert.equal(b.image().key,key);assert.equal(s.details.length,1);
    b.image().props.onError();await s.settle();assert.equal(b.image().props.source.uri,'https://images.test/new');assert.equal(s.details.length,1);
  }finally{s.dispose();}
});

test('absent initial cover never requests recovery or exposes retry; repeated API failures require manual cooldown retries',async()=>{
  const empty=await app({slowList:true});empty.lists[0].resolve([{...poster(),coverImageUrl:null}]);await empty.settle();
  try{const c=empty.card();assert.match(c.image().props.source,/ranking-placeholder\.png$/);c.image().props.onError();await empty.settle();
    assert.equal(empty.details.length,0);assert.equal(c.retry(),undefined);}finally{empty.dispose();}
  const s=await app(),c=s.card();
  try{
    c.image().props.onError();await s.settle();
    for(let i=0;i<3;i++){
      s.details[i].reject(Error('offline'));await s.settle();s.advance(30_000);await s.runTimers();
      assert.equal(s.details.length,i+1,'time passage must not automatically retry');
      if(i<2){c.retry().props.onPress({stopPropagation(){}});await s.settle();}
    }
    assert.equal(s.lists.length,1);assert.match(c.image().props.source,/ranking-placeholder\.png$/);
  }finally{s.dispose();}
});

test('recovered URL error terminates automatically, but manual retry and later URL expiration remain possible',async()=>{
  const s=await app(),c=s.card();
  try{
    c.image().props.onError();await s.settle();s.details[0].resolve({...poster(),coverImageUrl:'https://images.test/recovered'});await s.settle();
    c.image().props.onError();await s.settle();assert.equal(s.details.length,1);assert.ok(c.retry());
    for(let i=0;i<10;i++){c.image().props.onError();await s.settle();}assert.equal(s.details.length,1);
    s.advance(30_000);c.retry().props.onPress({stopPropagation(){}});await s.settle();assert.equal(s.details.length,2);
    s.details[1].resolve({...poster(),coverImageUrl:'https://images.test/recovered-again'});await s.settle();
    s.advance(300_001);c.image().props.onError();await s.settle();assert.equal(s.details.length,3,'stable image key must not permanently block later renewal');
    s.details[2].resolve({...poster(),coverImageUrl:'https://images.test/renewed'});await s.settle();assert.equal(c.image().props.source.uri,'https://images.test/renewed');
  }finally{s.dispose();}
});

test('country/language switch and replaced image ignore old responses and callbacks; unmounted card cannot update',async()=>{
  const s=await app(),c=s.card();
  try{
    const oldError=c.image().props.onError;oldError();await s.settle();
    await s.country('JP');await s.language('ja');oldError();
    s.details[0].resolve({...poster(),coverImageUrl:'https://images.test/old-country'});await s.settle();
    assert.equal(c.image().props.source.uri,poster('JP','ja').coverImageUrl);assert.equal(s.details.length,1);
    c.image().props.onError();await s.settle();const before=c.root.tree;c.unmount();
    s.details[1].resolve({...poster('JP','ja'),coverImageUrl:'https://images.test/late'});await flush();await flush();
    assert.equal(c.root.tree,before);assert.equal(s.details[1].language,'ja');
  }finally{s.dispose();}
});

test('late list GET cannot overwrite newer recovered cover, while a different image ID stays authoritative',async()=>{
  const s=await app({slowList:true});s.lists[0].resolve([poster()]);await s.settle();const c=s.card();
  try{
    s.advance(600_001);await s.runTimers();assert.equal(s.lists.length,2);
    c.image().props.onError();await s.settle();s.details[0].resolve({...poster(),coverImageUrl:'https://images.test/latest'});await s.settle();
    s.lists[1].resolve([poster()]);await s.settle();assert.equal(c.image().props.source.uri,'https://images.test/latest');
    s.advance(600_001);await s.runTimers();c.image().props.onError();await s.settle();
    s.lists[2].resolve([{...poster(),coverImageUrl:'https://images.test/replaced',coverImageCacheKey:'object-replaced'}]);await s.settle();
    s.details[1].resolve({...poster(),coverImageUrl:'https://images.test/retired'});await s.settle();
    assert.equal(c.image().props.source.uri,'https://images.test/replaced');assert.equal(c.image().props.source.cacheKey,'object-replaced');
  }finally{s.dispose();}
});

test('missing cover and server-confirmed absence remain placeholders with unchanged geometry/detail/favorite actions',async()=>{
  const s=await app();
  try{
    for(const kind of ['NewPopupCard','PopupRankingCard']){
      const c=s.card(kind),before=c.image().props.style;
      c.root.tree.props.onPress?.();
      const detail=nodes(c.root.tree).find(n=>n.props?.accessibilityLabel?.includes('상세보기'));detail?.props.onPress();
      c.image().props.onError();await s.settle();s.details.at(-1).resolve({...poster(),coverImageUrl:null,coverImageCacheKey:null});await s.settle();
      assert.match(c.image().props.source,/ranking-placeholder\.png$/);assert.deepEqual(c.image().props.style,before);assert.equal(c.retry(),undefined);
      c.image().props.onError();await s.settle();assert.equal(s.details.length,1);c.unmount();
    }
    assert.ok(s.opened.includes('popup-a'));
  }finally{s.dispose();}
});

test('compiled mounted retry text follows ko-ja-ko/system without extra recovery or state loss',async()=>{
  const s=await app({compiled:true}),c=s.card();
  try{
    c.image().props.onError();await s.settle();s.details[0].reject(Error('offline'));await s.settle();
    const slots=c.root.slots;
    for(const lang of ['ja','ko','system']){
      await s.language(lang);c.image().props.onError();await s.settle();
      if(s.details.length>1&&s.details.at(-1).language==='ja')s.details.at(-1).reject(Error('offline'));
      await s.settle();assert.ok(texts(c.root.tree).includes(lang==='ko'?'다시 시도':'再試行'));
      assert.equal(c.root.slots,slots);
    }
    const count=s.details.length;await s.language('ja');await s.settle();assert.equal(s.details.length,count);
  }finally{s.dispose();}
});
