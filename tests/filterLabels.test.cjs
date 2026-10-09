const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/i18nRuntime.cjs');

// Public metadata read from the configured API on 2026-10-09; not invented IDs.
const regionNames = ['성수','여의도','잠실','홍대·신촌','강남·서초','용산','서울 기타','경기·인천','부산','대구·경북','대전·충청','광주·전라','강원','제주','도쿄','오사카','교토','나고야','후쿠오카','삿포로','일본 기타'];
const japaneseRegions = ['聖水','汝矣島','蚕室','弘大・新村','江南・瑞草','龍山','ソウルその他','京畿・仁川','釜山','大邱・慶北','大田・忠清','光州・全羅','江原','済州','東京','大阪','京都','名古屋','福岡','札幌','日本その他'];
const tagNames = ['캐릭터/IP','게임/디지털','연예/크리에이터','패션','뷰티','F&B','아트/전시','문구/소품','라이프','패밀리/펫','기타'];
const japaneseTags = ['キャラクター・IP','ゲーム・デジタル','芸能・クリエイター','ファッション','ビューティー','グルメ・飲食','アート・展示','文具・雑貨','ライフスタイル','ファミリー・ペット','その他'];
const regions = regionNames.map((name,index) => Object.freeze({ id:index+1,name,countryCode:index<14?'KR':'JP' }));
const tags = tagNames.map((name,index) => Object.freeze({ id:index+1,name }));

test('verified 21 region and 11 tag IDs resolve both languages without mutating API objects', () => {
  const app=runtime(), labels=app.load('src/locales/filterLabels.ts');
  assert.deepEqual(labels.regionLabels.map(r=>r.id),regions.map(r=>r.id));
  assert.deepEqual(labels.tagLabels.map(r=>r.id),tags.map(r=>r.id));
  assert.deepEqual(regions.map(r=>labels.getRegionDisplayName(r,'ko')),regionNames);
  assert.deepEqual(regions.map(r=>labels.getRegionDisplayName(r,'ja')),japaneseRegions);
  assert.deepEqual(tags.map(t=>labels.getTagDisplayName(t,'ko')),tagNames);
  assert.deepEqual(tags.map(t=>labels.getTagDisplayName(t,'ja')),japaneseTags);
  assert.deepEqual(regions.map(r=>r.name),regionNames); assert.deepEqual(tags.map(t=>t.name),tagNames);
  app.dispose();
});

test('unknown IDs, same names at different IDs, missing names and country mismatch fall back safely', () => {
  const app=runtime(), labels=app.load('src/locales/filterLabels.ts');
  assert.equal(labels.getRegionDisplayName({ id:999,name:'성수',countryCode:'KR' },'ja'),'성수');
  assert.equal(labels.getRegionDisplayName({ id:1,name:'성수',countryCode:'KR' },'ja'),'聖水');
  assert.equal(labels.getRegionDisplayName({ id:15,name:'성수',countryCode:'JP' },'ja'),'東京');
  assert.equal(labels.getRegionDisplayName({ id:1,name:'성수',countryCode:'JP' },'ja'),'성수');
  assert.equal(labels.getRegionDisplayName({ id:null,name:null },'ja'),'');
  assert.equal(labels.getRegionDisplayName({ id:1,name:null },'ko'),'성수');
  assert.equal(labels.getPopupRegionDisplayName({regionId:1,regionName:null,countryCode:'KR'},'ja'),'');
  assert.equal(labels.getTagDisplayName({ id:999,name:'뷰티' },'ja'),'뷰티');
  assert.equal(labels.getTagDisplayName({ id:5,name:'뷰티' },'ja'),'ビューティー');
  assert.equal(labels.getTagDisplayName({ id:4,name:'뷰티' },'ja'),'ファッション');
  assert.equal(labels.getRegionDisplayName({ id:1,name:'기존 서버 표기' },'ko'),'기존 서버 표기');
  assert.equal(labels.getTagDisplayName({ id:1,name:'기존 서버 표기' },'ko'),'기존 서버 표기');
  const ja=app.load('src/locales/ja.json');
  const missing=structuredClone(ja); missing.place.filters.regions.seongsu=''; missing.place.filters.interests.beauty='';
  const fallback=runtime({'src/locales/ja.json':missing}).load('src/locales/filterLabels.ts');
  assert.equal(fallback.getRegionDisplayName(regions[0],'ja'),'성수');
  assert.equal(fallback.getTagDisplayName(tags[4],'ja'),'뷰티');
  app.dispose();
});

test('default labels follow resolved system language; explore tile mappings use actual IDs', async () => {
  const app=runtime(), { languageStore }=app.load('src/locales/languageStore.ts');
  await languageStore.initialize({ read:async()=> 'system',write:async()=>{},getLanguageTags:()=>['ja-JP'] });
  const labels=app.load('src/locales/filterLabels.ts');
  assert.equal(labels.getRegionDisplayName(regions[0]),'聖水'); assert.equal(labels.getTagDisplayName(tags[4]),'ビューティー');
  await languageStore.setLanguagePreference('ko');
  assert.equal(labels.getRegionDisplayName(regions[0]),'성수'); assert.equal(labels.getTagDisplayName(tags[4]),'뷰티');
  assert.equal(labels.getExploreRegionId('hongdae'),4); assert.equal(labels.getExploreRegionId('tokyo'),15);
  assert.equal(labels.getExploreTagId('beauty'),5); assert.equal(labels.getExploreTagId('game'),2);
  assert.equal(labels.getExploreRegionId('unknown'),undefined); assert.equal(labels.getExploreTagId('unknown'),undefined);
  app.dispose();
});

module.exports={ regions,tags,japaneseRegions,japaneseTags };
