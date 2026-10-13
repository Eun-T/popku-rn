const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const { runtime,nodes,flush } = require('./helpers/i18nRuntime.cjs');
const texts = tree => nodes(tree).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children).join('|');

const child = (tree,name) => nodes(tree).find(n => n.type?.name === name);
const button = (tree,label) => nodes(tree).find(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || texts(n) === label));
const list = tree => nodes(tree).find(n => n.type === 'FlatList');
const labels = tree => nodes(tree).filter(n => n.type === 'Tag').map(n => n.props.label);
const {app,marker,detail}=require('./helpers/mapDetailRuntime.cjs');

test('map preview uses a fixed cover poster and untruncated location in a vertically centered content row', async () => {
  const address='서울시 실제 주소\n긴 주소의 두 번째 줄', locationDetail='건물 3층 상세 위치';
  const s=await app({detailResponse:async()=>({...detail,address,locationDetail})});
  const Preview=s.load('src/components/map/MapPopupPreviewCard.tsx').default;
  let popup={...marker,coverImageUrl:'https://images.test/landscape'},pressed=0;
  const view=s.mount(()=>Preview({popup,onPress:()=>pressed++,bottomInset:34}));
  await s.settle();
  const row=view.tree.props.style[0], image=nodes(view.tree).find(n=>n.type===s.load('react-native').Image);
  assert.equal(row.alignItems,'center'); assert.equal(row.gap,12);
  assert.equal(row.height,undefined); assert.equal(row.minHeight,undefined);
  assert.equal(view.tree.props.style[1].paddingBottom,42);
  assert.equal(image.props.resizeMode,'cover');
  assert.equal(image.props.style.width,96); assert.equal(image.props.style.height,128);
  const location=nodes(view.tree).find(n=>n.type==='Text'&&n.props.children===address);
  assert.ok(location); assert.equal(location.props.numberOfLines,undefined); assert.equal(location.props.ellipsizeMode,undefined);
  const content=view.tree.props.children[1];
  const heading=content.props.children[1];
  assert.equal(heading.props.children[0].props.children,popup.name);
  assert.equal(heading.props.children[1].props.children[0].props.children,address);
  assert.equal(heading.props.style.gap,2);assert.equal(content.props.style.gap,6);
  assert.equal(heading.props.children[1].props.style.gap,4);
  assert.equal(content.props.children[0].props.style.flexDirection,'row');
  assert.equal(content.props.children[0].props.children[1].props.children[0].type,'Tag');
  assert.equal(heading.props.children[1].props.children[1].props.children,'26.10.08 ~ 10.11');
  assert.deepEqual(location.props.style,{fontSize:14,fontWeight:'400',lineHeight:20,color:'#6B7280'});
  assert.equal(heading.props.children[0].props.style.fontSize,18);
  assert.equal(heading.props.children[0].props.style.lineHeight,24);
  assert.equal(heading.props.children[0].props.numberOfLines,2);
  assert.ok(!texts(view.tree).includes(locationDetail));
  assert.equal(content.props.style.height,undefined);
  assert.equal(s.calls.detail[0][0],marker.id); assert.equal(s.calls.detail[0][3],'ko');
  for(const uri of ['https://images.test/portrait','https://images.test/square',null]) {
    popup={...popup,coverImageUrl:uri};s.renderAll();
    const poster=nodes(view.tree).find(n=>n.type===s.load('react-native').Image);
    assert.equal(poster.props.style.width,96);assert.equal(poster.props.style.height,128);
  }
  assert.equal(s.calls.detail.length,1);assert.deepEqual(s.calls.images,[]);
  view.tree.props.onPress();assert.equal(pressed,1);s.dispose();
});

test('map preview omits missing addresses and ignores obsolete location responses', async () => {
  const requests=[];
  const s=await app({detailResponse:(...args)=>new Promise((resolve,reject)=>requests.push({args,resolve,reject}))});
  const Preview=s.load('src/components/map/MapPopupPreviewCard.tsx').default;
  let popup=marker;
  const view=s.mount(()=>Preview({popup,onPress(){},bottomInset:0}));
  popup={...marker,id:'other'};s.renderAll();
  assert.equal(requests[0].args[1].aborted,true);
  requests[1].resolve({...detail,address:'same',locationDetail:'same'});await s.settle();
  assert.equal(nodes(view.tree).filter(n=>n.type==='Text'&&n.props.children==='same').length,1);
  requests[0].resolve({...detail,address:'stale',locationDetail:'old'});await s.settle();
  assert.ok(!texts(view.tree).includes('stale'));
  await s.language('ja');assert.ok(!texts(view.tree).includes('same'));
  requests[2].resolve({...detail,address:'',locationDetail:'detail without address'});await s.settle();
  assert.equal(view.tree.props.children[1].props.children[1].props.children[1].props.children[0],null);
  await s.language('ko');requests[3].reject(new Error('network'));await s.settle();
  assert.equal(view.tree.props.children[1].props.children[1].props.children[1].props.children[0],null);s.dispose();
});

test('map preview uses weekly-card status badges and formats same/cross-year dates without timezone conversion', async () => {
  const s=await app(),Preview=s.load('src/components/map/MapPopupPreviewCard.tsx').default;
  let popup={...marker,startDate:'2026-10-02',endDate:'2026-10-11'};
  const view=s.mount(()=>Preview({popup,onPress(){},bottomInset:28}));
  assert.ok(texts(view.tree).includes('26.10.02 ~ 10.11'));
  popup={...popup,startDate:'2026-12-28',endDate:'2027-01-05'};s.renderAll();
  assert.ok(texts(view.tree).includes('26.12.28 ~ 27.01.05'));
  for(const [startDate,endDate,label,color,background] of [
    ['2000-01-01','2099-01-01','진행중','#15803D','#DCFCE7'],
    ['2099-01-01','2099-01-02','오픈예정','#1D4ED8','#DBEAFE'],
    ['2000-01-01','2000-01-02','종료됨','#6B7280','#F8FAFC'],
  ]) {
    popup={...popup,startDate,endDate};s.renderAll();
    const labelNode=nodes(view.tree).find(n=>n.type==='Text'&&n.props.children===label);
    assert.ok(labelNode);assert.deepEqual(labelNode.props.style[0],{fontSize:11,fontWeight:'600',lineHeight:16});
    assert.equal(labelNode.props.style[1].color,color);
    const badge=nodes(view.tree).find(n=>n.type==='View'&&n.props.children===labelNode);
    assert.equal(badge.props.style[0].height,22);assert.equal(badge.props.style[1].backgroundColor,background);
  }
  popup={...popup,startDate:null,endDate:null};s.renderAll();
  assert.ok(texts(view.tree).includes('일정 미정'));
  popup={...popup,startDate:'2026-10-02',endDate:null};s.renderAll();
  assert.ok(texts(view.tree).includes('26.10.02'));
  popup={...popup,startDate:null,endDate:'2026-10-11'};s.renderAll();
  assert.ok(texts(view.tree).includes('10.11'));
  s.dispose();
});

test('map/detail used translation keys and dynamic labels exist in both languages with matching variables', async () => {
  const s=await app(),ko=s.load('src/locales/ko.json'),ja=s.load('src/locales/ja.json'),keys=new Set();
  for(const file of ['src/screens/MapScreen.native.tsx','src/app/places/[id].tsx',
    ...['MapSearchOverlay','MapPopupPreviewCard','MapPopupListSheet'].map(n=>`src/components/map/${n}.tsx`),
    ...['PopupReviews','PopupGuidanceCarousel','IntroductionImageCarousel'].map(n=>`src/components/place/${n}.tsx`),
    ]) {
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(n) { if(ts.isStringLiteral(n) && /^(map|place|community)\./.test(n.text)) keys.add(n.text); ts.forEachChild(n,visit); }
    visit(ast);
  }
  // Only review-branch keys of the shared card are in this stage's scope.
  ['community.reviewFilterLabel','place.detail.reviews.photo','place.detail.reviews.like','place.detail.reviews.unlike',
    'place.detail.notice','place.detail.benefits','place.detail.website'].forEach(k=>keys.add(k));
  Object.values(s.load('src/lib/popupDetailContent.ts').highlightHeadings).forEach(h=>keys.add(h.key));
  const registry=s.load('src/locales/filterLabels.ts');
  registry.regionLabels.forEach(r=>keys.add(`place.filters.regions.${r.key}`));
  registry.tagLabels.forEach(t=>keys.add(`place.filters.interests.${t.key}`));
  ['minutesAgo','hoursAgo','daysAgo'].forEach(k=>keys.add(`community.time.${k}`));
  const lookup=(d,k)=>k.split('.').reduce((v,p)=>v?.[p],d);
  for(const key of keys) {
    const a=lookup(ko,key),b=lookup(ja,key);
    assert.ok(typeof a==='string' && a.trim(),`ko ${key}`); assert.ok(typeof b==='string' && b.trim(),`ja ${key}`);
    assert.deepEqual([...a.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...b.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),key);
  }
  assert.equal(s.load('src/locales/index.ts').t('map.viewPopups',{count:3}),'이 지역 팝업 3개 보기');
  await s.language('ja'); assert.equal(s.load('src/locales/index.ts').t('map.viewPopups',{count:3}),'このエリアのポップアップ3件を見る');
  s.dispose();
});

test('mounted map search overlay translates loading/error/empty while retaining query and original results', async () => {
  const s=await app(),Overlay=s.load('src/components/map/MapSearchOverlay.tsx').default,selected=[];
  let props={query:'원문',search:{status:'success',results:[{...marker,regionName:'성수',address:'서버 주소'}]},
    places:{status:'success',results:[{placeId:'google-id',title:'검색 장소 원문',subtitle:'서버 장소 원문'}]},
    resolvingPlaceId:'google-id',resolveError:'위치를 불러올 수 없어요. 다시 선택해 주세요.',maxHeight:300,
    onSelect:p=>selected.push(p.id),onSelectPlace:p=>selected.push(p.placeId)};
  const root=s.mount(()=>Overlay(props)); const original=JSON.stringify(props);
  assert.ok(texts(root.tree).includes('위치 확인 중...'));
  const style=root.tree.props.style;
  await s.language('ja');
  assert.ok(texts(root.tree).includes('位置を確認中...')); assert.ok(texts(root.tree).includes('位置を取得できませんでした'));
  for(const text of ['검색 장소 원문','서버 장소 원문',marker.name,'성수 · 서버 주소']) assert.ok(texts(root.tree).includes(text));
  assert.equal(JSON.stringify(props),original); assert.deepEqual(root.tree.props.style,style);
  nodes(root.tree).find(n=>n.key===marker.id).props.onPress(); assert.deepEqual(selected,[marker.id]);
  props={...props,search:{status:'error',results:[]},places:{status:'loading',results:[]}}; s.renderAll();
  assert.ok(texts(root.tree).includes('検索中...')); assert.ok(texts(root.tree).includes('検索できませんでした'));
  props={...props,search:{status:'success',results:[]},places:{status:'hidden',results:[]}}; s.renderAll();
  assert.ok(texts(root.tree).includes('検索結果はありません'));
  await s.language('ko'); assert.ok(texts(root.tree).includes('검색 결과가 없어요')); s.dispose();
});

test('retained map preview/list update numeric tag labels and statuses without changing IDs, dates or press target', async () => {
  const s=await app(),Preview=s.load('src/components/map/MapPopupPreviewCard.tsx').default,
    Sheet=s.load('src/components/map/MapPopupListSheet.tsx').default,opened=[];
  const props={popups:[marker],bottomPadding:20,onPopupPress:id=>opened.push(id)};
  const preview=s.mount(()=>Preview({popup:marker,onPress:()=>opened.push(marker.id),bottomInset:20}));
  const sheet=s.mount(()=>Sheet(props));
  const item=s.mount(()=> { const n=list(sheet.tree).props.renderItem({item:marker}); return n.type(n.props); });
  assert.deepEqual(labels(preview.tree),['뷰티','미등록 원문']); assert.ok(texts(item.tree).includes('진행중'));
  const before=JSON.stringify(marker),style=preview.tree.props.style,key=list(sheet.tree).props.keyExtractor(marker);
  await s.language('ja');
  assert.deepEqual(labels(preview.tree),['ビューティー','미등록 원문']); assert.deepEqual(labels(item.tree),['ビューティー','미등록 원문']);
  assert.ok(texts(preview.tree).includes('開催中')); assert.ok(texts(item.tree).includes('開催中'));
  assert.ok(texts(preview.tree).includes('26.10.08 ~ 10.11')); assert.ok(texts(item.tree).includes('26.10.08 ~ 10.11'));
  assert.equal(list(sheet.tree).props.extraData,'ja'); assert.equal(list(sheet.tree).props.data,props.popups);
  assert.equal(list(sheet.tree).props.keyExtractor(marker),key); assert.deepEqual(preview.tree.props.style,style);
  preview.tree.props.onPress(); item.tree.props.onPress(); assert.deepEqual(opened,[marker.id,marker.id]);
  assert.equal(JSON.stringify(marker),before); await s.language('system'); assert.ok(texts(item.tree).includes(marker.name)); s.dispose();
});

test('map list loading/empty/retry and missing schedule translate with the existing callbacks', async () => {
  const s=await app(),Sheet=s.load('src/components/map/MapPopupListSheet.tsx').default,
    Preview=s.load('src/components/map/MapPopupPreviewCard.tsx').default; let status='loading',retried=0;
  const sheet=s.mount(()=>Sheet({popups:[],bottomPadding:20,status,onPopupPress(){},onRetry:()=>retried++}));
  const preview=s.mount(()=>Preview({popup:{...marker,startDate:null,endDate:null},bottomInset:20,onPress(){}}));
  assert.ok(texts(preview.tree).includes('일정 미정')); assert.ok(texts(sheet.tree).includes('팝업을 불러오는 중이에요'));
  await s.language('ja'); assert.ok(texts(preview.tree).includes('日程未定')); assert.ok(texts(sheet.tree).includes('ポップアップを読み込み中です'));
  status='ready'; s.renderAll(); assert.ok(texts(sheet.tree).includes('このエリアのポップアップはありません'));
  status='error'; s.renderAll(); const retry=nodes(sheet.tree).find(n=>n.type==='Pressable'); retry.props.onPress(); assert.equal(retried,1); s.dispose();
});

test('open detail refetches its content language while keeping selected tabs, refs and server fallback', async () => {
  const s=await app(),Screen=s.load('src/app/places/[id].tsx').default;
  const root=s.mount(()=>Screen()); await s.settle();
  const tabs=s.mount(()=> { const n=child(root.tree,'DetailTabs'); return n?n.type(n.props):null; });
  const rows=()=>nodes(root.tree).filter(n=>n.type?.name==='DetailRow').map(n=>n.props.label);
  const before=JSON.stringify(detail),scroll=nodes(root.tree).find(n=>n.type==='ScrollView'),hero=nodes(root.tree).find(n=>n.type==='PopupHeroImage');
  assert.ok(texts(tabs.tree).includes('팝업 정보')); assert.ok(rows().includes('기간')); assert.ok(labels(root.tree).includes('성수'));
  await s.language('ja');await s.settle();
  assert.ok(texts(tabs.tree).includes('ポップアップ情報')); assert.ok(texts(tabs.tree).includes('訪問レビュー'));
  assert.ok(rows().includes('期間')); assert.ok(labels(root.tree).includes('聖水')); assert.ok(labels(root.tree).includes('ビューティー'));
  for(const original of [marker.name,detail.summary,detail.operatingHours,detail.address,detail.locationDetail,detail.highlights[0].text]) assert.ok(texts(root.tree).includes(original));
  const guidance=child(root.tree,'PopupGuidanceCarousel');
  assert.equal(guidance.props.notice,detail.notice); assert.equal(guidance.props.benefits,detail.benefits); assert.equal(guidance.props.languageCode,'ja');
  assert.equal(nodes(root.tree).find(n=>n.type==='ScrollView').props.ref,scroll.props.ref);
  assert.equal(nodes(root.tree).find(n=>n.type==='PopupHeroImage').key,hero.key);
  assert.equal(s.calls.detail.length,2); assert.equal(s.calls.detail[0][0],marker.publicId); assert.deepEqual(s.calls.detail.map(c=>c[3]),['ko','ja']);
  button(root.tree,'地図でポップアップを見る').props.onPress();
  assert.deepEqual(s.calls.routes,[{pathname:'/(tabs)/map',params:{popupId:marker.publicId}}]);
  button(root.tree,'共有する').props.onPress(); assert.deepEqual(s.calls.share,[{message:marker.name}]);
  button(root.tree,'公式サイトの公式チャンネル').props.onPress(); assert.deepEqual(s.calls.links,[detail.socialLinks.website]);
  button(tabs.tree,'訪問レビュー').props.onPress();
  assert.equal(child(root.tree,'DetailTabs').props.selectedTab,'reviews'); assert.equal(child(root.tree,'PopupReviews').props.publicId,marker.publicId);
  nodes(root.tree).find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{y:500}}});
  assert.equal(child(root.tree,'DetailTabs').props.selectedTab,'reviews');
  await s.language('ko');await s.settle(); assert.ok(texts(tabs.tree).includes('방문 리뷰'));
  await s.language('system');await s.settle(); assert.ok(texts(tabs.tree).includes('訪問レビュー')); assert.equal(child(root.tree,'DetailTabs').props.selectedTab,'reviews');
  assert.deepEqual(s.calls.detail.map(c=>c[3]),['ko','ja','ko','ja']); assert.equal(JSON.stringify(detail),before); s.dispose();
});

test('detail error retries in the new language while review empty/login/error UI keeps its requests', async () => {
  const s=await app({failDetail:true,failReviews:true}),Screen=s.load('src/app/places/[id].tsx').default,
    Reviews=s.load('src/components/place/PopupReviews.tsx').default;
  const root=s.mount(()=>Screen()),reviews=s.mount(()=>Reviews({publicId:marker.publicId,title:marker.name})); await s.settle();
  assert.ok(texts(root.tree).includes('팝업 정보를 불러오지 못했습니다.')); assert.ok(texts(reviews.tree).includes('방문 리뷰를 불러오지 못했어요'));
  await s.language('ja');await s.settle();
  assert.ok(texts(root.tree).includes('ポップアップ情報を読み込めませんでした。')); assert.ok(texts(reviews.tree).includes('訪問レビューを読み込めませんでした'));
  assert.equal(s.calls.detail.length,2); assert.equal(s.calls.reviews.length,1); s.dispose();
  const ok=await app(),Empty=ok.load('src/components/place/PopupReviews.tsx').default;
  const empty=ok.mount(()=>Empty({publicId:marker.publicId,title:marker.name})); await ok.settle();
  assert.ok(texts(empty.tree).includes('아직 방문 리뷰가 없어요')); await ok.language('ja');
  assert.ok(texts(empty.tree).includes('まだ訪問レビューはありません')); assert.equal(ok.calls.reviews.length,1);
  button(empty.tree,'ログインしてレビューを書く').props.onPress(); await ok.settle();
  assert.deepEqual(ok.calls.routes,[{pathname:'/login',params:{intent:'review',publicId:marker.publicId}}]); ok.dispose();
});

test('notice/benefits inner cards and image failure text update without resetting measured pager or image page', async () => {
  const s=await app(),Guidance=s.load('src/components/place/PopupGuidanceCarousel.tsx').default,
    Carousel=s.load('src/components/place/IntroductionImageCarousel.tsx').default;
  const root=s.mount(()=>Guidance({popupId:marker.publicId,languageCode:'ko',notice:detail.notice,benefits:detail.benefits}));
  const pager=s.mount(()=> { const n=child(root.tree,'GuidancePager'); return n.type(n.props); });
  pager.tree.props.onLayout({nativeEvent:{layout:{width:300}}});
  const measured=s.mount(()=> { const n=child(pager.tree,'MeasuredPager'); return n.type(n.props); });
  nodes(measured.tree).find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{height:100}}});
  nodes(measured.tree).find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:300}}});
  const cards=nodes(measured.tree).filter(n=>n.type?.name==='GuidanceCard').map((n,i)=>s.mount(()=>nodes(measured.tree).filter(n=>n.type?.name==='GuidanceCard')[i].type(n.props)));
  const images=Object.freeze(['first-original','second-original']),image=s.mount(()=>Carousel({images,width:300}));
  const slides=images.map((item,index)=>s.mount(()=>{const n=list(image.tree).props.renderItem({item,index});return n.type(n.props);}));
  slides.forEach(slide=>nodes(slide.tree).find(n=>n.type==='ExpoImage').props.onError());
  list(image.tree).props.onScroll({nativeEvent:{contentOffset:{x:300}}});
  const key=child(root.tree,'GuidancePager').key,pageKey=child(pager.tree,'MeasuredPager').key;
  assert.ok(texts(image.tree).includes('2 / 2')); assert.ok(texts(slides[1].tree).includes('이미지를 불러올 수 없습니다'));
  await s.language('ja');
  assert.ok(cards.some(c=>texts(c.tree).includes('お知らせ'))); assert.ok(cards.some(c=>texts(c.tree).includes(detail.notice)));
  assert.ok(cards.some(c=>texts(c.tree).includes(detail.benefits))); assert.equal(child(root.tree,'GuidancePager').key,key); assert.equal(child(pager.tree,'MeasuredPager').key,pageKey);
  const pages=nodes(measured.tree).find(n=>n.type==='ScrollView').props.children;
  assert.deepEqual(pages.map(p=>p.props.accessibilityElementsHidden),[true,false]);
  assert.ok(texts(image.tree).includes('2 / 2')); assert.equal(list(image.tree).props.extraData,'ja'); assert.equal(list(image.tree).props.data,images);
  assert.ok(texts(slides[1].tree).includes('画像を読み込めませんでした'));
  assert.deepEqual(s.calls.images,[]); s.dispose();
});

test('shared review card keeps nickname/body/photos/engagement while labels and relative time update', async () => {
  const s=await app({realReviewCard:true}),Card=s.load('src/components/community/CommunityPostItem.tsx').default;
  const post=Object.freeze({id:3,type:'REVIEW',category:'REVIEW',images:Object.freeze(['photo-1','photo-2']),
    author:Object.freeze({nickname:'서버 닉네임'}),rating:4.5,popup:{publicId:marker.publicId,title:marker.name},
    content:'서버 리뷰 원문',createdAt:'2026-10-09T00:00:00Z',likeCount:2,liked:false,commentCount:0,viewCount:0});
  let likes=0; const opened=[];
  const root=s.mount(()=>Card({post,now:Date.parse('2026-10-09T00:05:00Z'),onPressLike:()=>likes++,onPressReview:()=>opened.push(post.id)}));
  assert.ok(texts(root.tree).includes('5분 전'));
  await s.language('ja');
  for(const text of ['5分前','訪問レビュー',post.content,post.author.nickname,marker.name]) assert.ok(texts(root.tree).includes(text));
  const photos=nodes(root.tree).filter(n=>n.props.accessibilityLabel?.startsWith('レビュー写真'));
  assert.deepEqual(photos.map(n=>[n.props.source.uri,n.props.accessibilityLabel]),[['photo-1','レビュー写真1'],['photo-2','レビュー写真2']]);
  button(root.tree,'いいね').props.onPress({stopPropagation(){}}); root.tree.props.onPress();
  assert.equal(likes,1); assert.deepEqual(opened,[post.id]); assert.equal(post.liked,false); s.dispose();
});
