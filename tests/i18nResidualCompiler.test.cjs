const assert=require('node:assert/strict');
const {test}=require('node:test');
const {nodes,texts}=require('./helpers/i18nRuntime.cjs');
const {compilerTransform}=require('./helpers/reactCompiler.cjs');
const {app,marker,detail}=require('./helpers/mapDetailRuntime.cjs');
const scope=['src/components/map/MapSearchOverlay.tsx','src/components/map/MapPopupListSheet.tsx','src/components/map/MapPopupPreviewCard.tsx',
 'src/app/places/[id].tsx','src/components/place/PopupReviews.tsx','src/components/place/PopupGuidanceCarousel.tsx',
 'src/components/place/IntroductionImageCarousel.tsx','src/hooks/useTranslation.ts','src/components/community/CommunityPostItem.tsx',
 'src/screens/MapScreen.native.tsx','src/components/place/PlaceWeeklySection.tsx'];
const bailouts=new Map(),transform=compilerTransform(scope,{allowBailout:[scope[3],scope[4],scope[9],scope[10]],onBailout:(f,e)=>bailouts.set(f,e)});
const child=(tree,name)=>nodes(tree).find(n=>n.type?.name===name),list=root=>nodes(root.tree).find(n=>n.type==='FlatList');

test('compiler-cached search overlay changes fixed UI while keeping query/results/provider and selection IDs',async()=>{
 const s=await app({transform}),Overlay=s.load(scope[0]).default,selected=[];
 const props={query:'원문',search:{status:'error',results:[]},places:{status:'success',results:[]},resolvingPlaceId:null,resolveError:null,maxHeight:300,
  onSelect:p=>selected.push(p.id),onSelectPlace:p=>selected.push(p.placeId)},root=s.mount(()=>Overlay(props));
 const before=JSON.stringify(props),style=root.tree.props.style;
 for(const [lang,label]of [['ja','ポップアップを検索できませんでした'],['ko','검색에 실패했어요. 다시 시도해 주세요.'],['system','ポップアップを検索できませんでした']]) {
  await s.language(lang);const t=s.load('src/locales/index.ts').t;assert.ok(texts(root.tree).includes(t('map.search.failed')));
  assert.equal(JSON.stringify(props),before);assert.deepEqual(root.tree.props.style,style);assert.deepEqual(s.calls.detail,[]);
 }s.dispose();
});

test('compiler-cached map preview/list rows keep data/list key/IDs and update statuses and numeric tag labels',async()=>{
 const s=await app({transform}),Preview=s.load(scope[2]).default,Sheet=s.load(scope[1]).default,opened=[];
 const props={popup:marker,bottomInset:20,onPress:()=>opened.push(marker.id)},preview=s.mount(()=>Preview(props));
 const popups=Object.freeze([marker]),sheetProps={popups,bottomPadding:20,onPopupPress:id=>opened.push(id)},sheet=s.mount(()=>Sheet(sheetProps));
 const row=s.mount(()=>{const element=list(sheet).props.renderItem({item:marker});return element.type(element.props);});
 const key=list(sheet).key,before=JSON.stringify(marker),style=preview.tree.props.style;
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;
  assert.ok(texts(preview.tree).includes(t('place.filters.operationStatuses.open')));
  for(const root of [preview,row]){const labels=nodes(root.tree).filter(n=>n.type==='Tag').map(n=>n.props.label);assert.ok(labels.includes(lang==='ko'?'뷰티':'ビューティー'));assert.ok(labels.includes('미등록 원문'));assert.ok(texts(root.tree).includes(marker.name));}
  assert.equal(list(sheet).props.data,popups);assert.equal(list(sheet).key,key);assert.equal(JSON.stringify(marker),before);assert.deepEqual(preview.tree.props.style,style);
 }
 row.tree.props.onPress();preview.tree.props.onPress();assert.deepEqual(opened,[marker.id,marker.id]);s.dispose();
});

test('Compiler-processed popup detail/sticky tabs retain selected tab, API locale/data/ref/key and numeric labels',async()=>{
 const s=await app({transform}),Screen=s.load(scope[3]).default,root=s.mount(()=>Screen());await s.settle();
 const tabs=s.mount(()=>{const n=child(root.tree,'DetailTabs');return n.type(n.props);});
 nodes(tabs.tree).find(n=>n.type==='Pressable'&&texts(n)==='방문 리뷰').props.onPress();
 const hero=()=>nodes(root.tree).find(n=>n.type==='PopupHeroImage');
 const ref=nodes(root.tree).find(n=>n.type==='ScrollView').props.ref,heroKey=hero().key,calls=s.calls.detail.slice(),before=JSON.stringify(detail);
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;
  assert.ok(texts(tabs.tree).includes(t('place.detail.infoTab')));assert.ok(texts(tabs.tree).includes(t('community.reviewFilterLabel')));
  assert.equal(child(root.tree,'DetailTabs').props.selectedTab,'reviews');assert.equal(child(root.tree,'PopupReviews').props.publicId,marker.publicId);
  assert.equal(nodes(root.tree).find(n=>n.type==='ScrollView').props.ref,ref);assert.equal(hero().key,heroKey);
  nodes(tabs.tree).find(n=>n.type==='Pressable'&&texts(n)===t('place.detail.infoTab')).props.onPress();
  const labels=nodes(root.tree).filter(n=>n.type==='Tag').map(n=>n.props.label);assert.ok(labels.includes(lang==='ko'?'성수':'聖水'));
  for(const raw of [detail.summary,detail.notice,detail.benefits,detail.address,marker.name])assert.ok(texts(root.tree).includes(raw)||JSON.stringify(root.tree).includes(raw));
  nodes(tabs.tree).find(n=>n.type==='Pressable'&&texts(n)===t('community.reviewFilterLabel')).props.onPress();
  assert.deepEqual(s.calls.detail,calls);assert.equal(s.calls.detail[0][3],'ko');assert.equal(JSON.stringify(detail),before);
  nodes(root.tree).find(n=>n.props?.accessibilityLabel===t('place.detail.share')).props.onPress();
  assert.deepEqual(s.calls.share.at(-1),{message:detail.name});
 }s.dispose();
});

test('Compiler-processed visit-review empty tab updates without invoking review API again',async()=>{
 const s=await app({transform}),Reviews=s.load(scope[4]).default,props={publicId:marker.publicId,title:marker.name},root=s.mount(()=>Reviews(props));await s.settle();
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;assert.ok(texts(root.tree).includes(t('place.detail.reviews.empty')));assert.ok(texts(root.tree).includes(t('place.detail.reviews.loginWrite')));assert.equal(s.calls.reviews.length,1);}s.dispose();
});

test('compiler-cached guidance titles and introduction errors update without replacing measured page/image keys',async()=>{
 const s=await app({transform}),Guidance=s.load(scope[5]).default,Carousel=s.load(scope[6]).default;
 const props={popupId:marker.publicId,languageCode:'ko',notice:detail.notice,benefits:detail.benefits},root=s.mount(()=>Guidance(props));
 const pager=s.mount(()=>{const n=child(root.tree,'GuidancePager');return n.type(n.props);});pager.tree.props.onLayout({nativeEvent:{layout:{width:300}}});
 const measured=s.mount(()=>{const n=child(pager.tree,'MeasuredPager');return n.type(n.props);});
 nodes(measured.tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{height:100}}});
 nodes(measured.tree).find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:300}}});
 const cards=nodes(measured.tree).filter(n=>n.type?.name==='GuidanceCard').map((n,i)=>s.mount(()=>{const card=nodes(measured.tree).filter(n=>n.type?.name==='GuidanceCard')[i];return card.type(card.props);}));
 const images=Object.freeze(['original1','original2']),image=s.mount(()=>Carousel({images,width:300}));list(image).props.onScroll({nativeEvent:{contentOffset:{x:300}}});
 const key=child(root.tree,'GuidancePager').key,pageKey=child(pager.tree,'MeasuredPager').key;
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;
  assert.ok(cards.some(c=>texts(c.tree).includes(t('place.detail.notice'))));assert.ok(cards.some(c=>texts(c.tree).includes(detail.benefits)));
  assert.equal(child(root.tree,'GuidancePager').key,key);assert.equal(child(pager.tree,'MeasuredPager').key,pageKey);
  assert.deepEqual(nodes(measured.tree).find(n=>n.type==='ScrollView').props.children.map(n=>n.props.accessibilityElementsHidden),[true,false]);
  assert.ok(nodes(image.tree).some(n=>n.type==='Text'&&[].concat(n.props.children).join('')==='2 / 2'));assert.equal(list(image).props.data,images);
  assert.ok(texts(list(image).props.renderItem({item:images[1],index:1})).includes(t('place.detail.imageFailed')));
  assert.deepEqual(s.calls.images,images);
 }s.dispose();
});

test('Compiler-processed retained native map changes placeholder/chips/list labels while keeping marker/filter/query/ref/camera/sheet/API state',async()=>{
 const s=await require('./helpers/mapI18nRuntime.cjs').app({transform}),Map=s.load(scope[9]).default,root=s.mount(()=>Map());
 const map=()=>nodes(root.tree).find(n=>n.type==='MapView');
 map().props.ref.current={animateToRegion:r=>s.camera.push(r),getMapBoundaries:async()=>({northEast:{latitude:37.557,longitude:127.069},southWest:{latitude:37.532,longitude:127.043}})};
 map().props.onMapReady();await s.settle();
 nodes(root.tree).find(n=>n.type==='ScrollView'&&n.props.onLayout).props.onLayout({nativeEvent:{layout:{y:100,height:40}}});
 nodes(root.tree).find(n=>n.type==='ReanimatedView'&&n.props.onLayout).props.onLayout({nativeEvent:{layout:{height:400}}});
 const chip=nodes(root.tree).find(n=>n.type==='Pressable'&&n.key==='뷰티');chip.props.onPress();
 const markerNode=()=>nodes(root.tree).find(n=>n.type==='Marker');markerNode().props.onPress();
 const searchInput=()=>nodes(root.tree).find(n=>n.type==='TextInput');searchInput().props.onChangeText('검색 원문');
 const markerKey=markerNode().key,mapKey=map().key,mapRef=map().props.ref,preview=()=>nodes(root.tree).find(n=>n.type==='Preview');
 assert.equal(preview().props.popup.id,s.popup.id);
 const calls=s.calls.slice(),camera=s.camera.slice(),timings=s.timings.slice(),timerCount=s.timers.size;
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;
  assert.equal(searchInput().props.placeholder,t('map.search.placeholder'));assert.equal(searchInput().props.value,'검색 원문');
  assert.ok(texts(nodes(root.tree).find(n=>n.key==='뷰티')).includes(lang==='ko'?'뷰티':'ビューティー'));
  assert.equal(markerNode().key,markerKey);assert.equal(map().key,mapKey);assert.equal(map().props.ref,mapRef);assert.equal(preview().props.popup.id,s.popup.id);
  assert.deepEqual(s.calls,calls);assert.deepEqual(s.camera,camera);assert.deepEqual(s.timings,timings);assert.equal(s.timers.size,timerCount);
 }
 nodes(root.tree).find(n=>n.type==='Pressable'&&texts(n).includes(s.load('src/locales/index.ts').t('map.viewPopups',{count:1}))).props.onPress();
 const listTimings=s.timings.slice();
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;
  assert.ok(texts(root.tree).includes(t('map.returnToMap')));assert.ok(nodes(root.tree).some(n=>n.type==='ListSheet'));
  assert.equal(markerNode().key,markerKey);assert.equal(map().props.ref,mapRef);assert.equal(searchInput().props.value,'검색 원문');
  assert.deepEqual(s.calls,calls);assert.deepEqual(s.camera,camera);assert.deepEqual(s.timings,listTimings);assert.equal(s.timers.size,timerCount);
 }
 nodes(root.tree).find(n=>n.type==='Pressable'&&texts(n)===s.load('src/locales/index.ts').t('map.returnToMap')).props.onPress();
 assert.equal(preview().props.popup.id,s.popup.id);s.dispose();
});

test('Compiler-processed weekly headers preserve selected week/country/carousel/page/cache and API request conditions',async()=>{
 const s=await require('./helpers/mapI18nRuntime.cjs').app({transform}),Weekly=s.load(scope[10]).default;
 const props={country:'KR',onPressPopup(){},isFavorite:()=>false,isFavoriteDisabled:()=>false,onToggleFavorite(){}},root=s.mount(()=>Weekly(props));await s.settle();
 const calls=s.calls.slice(),flat=list(root),key=flat?.key,ref=flat?.props.ref;
 for(const lang of ['ja','ko','system']){await s.language(lang);const t=s.load('src/locales/index.ts').t;assert.ok(texts(root.tree).includes(t('place.explore.weeklyTitle')));
  assert.equal(list(root)?.key,key);assert.equal(list(root)?.props.ref,ref);assert.deepEqual(s.calls,calls);}
 assert.equal(s.calls.filter(c=>c[0]==='weekly').length,1);assert.equal(s.calls[0][1],'KR');s.dispose();
});

test('Compiler whole-file bailout scope stays explicit; presentation files emit actual cache code',()=>{
 for(const [file,events]of bailouts){assert.ok([scope[3],scope[4],scope[9],scope[10]].includes(file));for(const e of events.filter(e=>e.kind==='CompileError'))assert.match(e.detail.reason,/TryStatement with a finalizer|Cannot access refs during render/,file);}
});
