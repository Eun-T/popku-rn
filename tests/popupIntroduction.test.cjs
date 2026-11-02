const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const { reanimatedTransitionMock } = require('./helpers/reanimatedTransitionMock.cjs');
const file = 'src/components/place/PopupIntroduction.tsx';
const parser = runtime().load('src/lib/popupDetailContent.ts');
const section = text => parser.popupIntroductionSections({ summary: text });
const content = root => nodes(root.tree).find(n => n.props?.testID === 'popup-introduction-content');
const toggle = root => nodes(root.tree).find(n => n.props?.testID === 'popup-introduction-toggle');
const textContent = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(textContent).join('') : textContent(tree?.props?.children ?? '');
const bodyNodes = root => nodes(root.tree).filter(n => n.type === 'Text' && n.props.lineBreakStrategyIOS === 'hangul-word');
const styleOf = node => Object.assign({}, ...[].concat(node.props.style ?? {}));
const button = (root, kind) => nodes(root.tree).find(n => n.props?.testID === 'popup-' + kind + '-button');
const accordion = button;
async function app(initialSections = section('body'), detailImages) {
  let sections = initialSections, systemTag = 'ja-JP';
  const timings = [], requests = [];
  const animate = (value, options) => ({ start: done => { timings.push(options); value.setValue(options.toValue); done?.({ finished: true }); } });
  let ui;
  const reanimated = reanimatedTransitionMock(() => ui);
  ui = runtime({
    'react-native-reanimated': reanimated.module,
    'react-native-worklets': { scheduleOnRN: fn => fn() },
    'lucide-react-native': Object.fromEntries(['ChevronDown','Flag','Pencil','Trash2','UserRoundX'].map(n=>[n,n])),
    'react-native': { View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',Modal:'Modal',KeyboardAvoidingView:'KeyboardAvoidingView',
      Platform:{OS:'ios'}, StyleSheet:{create:s=>s,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844}),
      PanResponder:{create:config=>({panHandlers:config})}, Animated:{View:'AnimatedView',
        Value:class { constructor(value){this.value=value;} setValue(value){this.value=value;} stopAnimation(callback){callback?.(this.value);} },
        timing:animate,spring:animate,parallel:list=>({start:done=>{list.forEach(a=>a.start());done?.({finished:true});}})} },
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:40,bottom:34,left:3,right:5})},
    fetch:(...args)=>{requests.push(args);throw new Error('guidance must not fetch');},
  }, { transform: compilerTransform([file, 'src/hooks/useTranslation.ts']) });
  const languageStore=ui.load('src/locales/languageStore.ts').languageStore;
  await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>[systemTag]});
  const Component=ui.load(file).default, root=ui.mount(()=>Component({sections,detailImages}));
  const sheet=()=>nodes(root.tree).find(n=>['CommunityPostMenu','PopupGuidanceSheet'].includes(n.type?.name));
  return {...ui,root,Component,timings,requests,sheet,
    mountSheet:()=>ui.mount(()=>{const n=sheet();return n?n.type(n.props):null;}),
    update:next=>{sections=next;ui.renderAll();}, language:v=>languageStore.setLanguagePreference(v),
    system:tag=>{systemTag=tag;languageStore.refreshSystemLanguage();},
  };
}

test('guidance pills follow complete introduction and precede images with requested geometry', async () => {
  for (const images of [null, {type:'Images',props:{images:['a','b','c']}}]) {
    const s=await app(parser.popupIntroductionSections({summary:'first\n\nlast',benefits:'benefit',notice:'notice'}),images);
    const all=nodes(s.root.tree),row=all.find(n=>n.props?.testID==='popup-guidance-buttons');
    assert.ok(all.indexOf(content(s.root))<all.indexOf(row));
    if(images)assert.ok(all.indexOf(row)<all.indexOf(images));
    assert.equal(styleOf(row).marginTop,12);assert.equal(styleOf(row).gap,8);
    assert.equal(styleOf(row).flexDirection,'row');
    assert.deepEqual(nodes(row).filter(n=>n.type==='Pressable').map(n=>n.key),['notice','benefits']);
    assert.equal(s.sheet(),undefined);
    for(const kind of ['notice','benefits']) {
      const b=button(s.root,kind),pill=b.props.children,style=styleOf(pill);
      assert.equal(styleOf(b).minHeight,44);
      assert.equal(styleOf(b).justifyContent,'center');
      assert.equal(style.backgroundColor,'#F5F5F5');assert.equal(style.borderRadius,999);
      assert.equal(style.paddingHorizontal,10);assert.equal(style.paddingVertical,6);
      assert.deepEqual(pill.props.children.map(n=>n.type),['Text','ChevronDown']);
      assert.equal(pill.props.children[1].props.size,16);assert.equal(pill.props.children[1].props.color,'#111827');
      assert.equal(styleOf(pill.props.children[0]).fontSize,13);assert.equal(styleOf(pill.props.children[0]).fontWeight,'500');
    }
    s.dispose();
  }
});

test('missing or blank guidance omits its button and empty row; images-only has no extra gap',async()=>{
  for(const kind of ['notice','benefits']) {
    const s=await app(parser.popupIntroductionSections({[kind]:'body'}));
    assert.ok(button(s.root,kind));assert.equal(button(s.root,kind==='notice'?'benefits':'notice'),undefined);
    const row=nodes(s.root.tree).find(n=>n.props?.testID==='popup-guidance-buttons');
    assert.equal(styleOf(row).marginTop,undefined);s.dispose();
  }
  const s=await app([{kind:'notice',titleKey:'place.detail.notice',paragraphs:[' \n ']}]);
  assert.equal(s.root.tree,null);s.dispose();
  const image={type:'Images',props:{}};const only=await app([],image);
  assert.ok(nodes(only.root.tree).includes(image));assert.equal(styleOf(only.root.tree).marginTop,undefined);only.dispose();
});

for(const kind of ['notice','benefits'])test(`${kind}: original text, scrollable content, edge sheet and close/reopen`,async()=>{
  const raw=' 原文\r\n\r\n• line\n'.repeat(100);
  const s=await app(parser.popupIntroductionSections({summary:'intro',[kind]:raw}));
  button(s.root,kind).props.onPress();
  assert.ok(s.sheet().props.edgeToEdge);assert.equal(s.sheet().props.showEdit,false);assert.equal(s.sheet().props.showDelete,false);
  const modal=s.mountSheet();
  const surface=nodes(modal.tree).find(n=>n.props?.accessibilityViewIsModal),style=styleOf(surface);
  assert.equal(style.marginHorizontal,0);assert.equal(style.marginBottom,0);assert.equal(style.borderRadius,0);
  assert.equal(style.borderTopLeftRadius,24);assert.equal(style.borderTopRightRadius,24);
  assert.equal(style.backgroundColor,'#FFFFFF');assert.equal(style.paddingBottom,42);
  assert.equal(style.paddingLeft,23);assert.equal(style.paddingRight,25);
  const scroll=nodes(modal.tree).find(n=>n.props?.testID==='popup-guidance-scroll');
  assert.equal(scroll.type,'ScrollView');assert.ok(styleOf(scroll).maxHeight<844);
  assert.equal(textContent(scroll),raw);assert.equal(styleOf(nodes(scroll).find(n=>n.type==='Text')).fontSize,14);
  assert.equal(styleOf(nodes(scroll).find(n=>n.type==='Text')).lineHeight,22);
  assert.equal(nodes(modal.tree).find(n=>n.props?.testID==='popup-guidance-close'),undefined);
  assert.ok(!nodes(modal.tree).some(n=>n.type==='X'));
  const title=nodes(modal.tree).find(n=>n.props?.accessibilityRole==='header');
  const header=nodes(modal.tree).find(n=>n.type==='View'&&nodes(n).includes(title)&&n.props.style?.marginBottom===12);
  assert.equal(styleOf(header).marginBottom,12);assert.equal(styleOf(header).paddingTop,9);
  assert.equal(styleOf(scroll).paddingTop,undefined);
  assert.equal(scroll.props.contentContainerStyle.paddingTop,undefined);
  assert.equal(styleOf(title).fontSize,18);
  nodes(modal.tree).find(n=>n.type==='Pressable').props.onPress();
  assert.equal(modal.tree.props.visible,false);modal.tree.props.onDismiss();
  assert.equal(s.sheet(),undefined);
  button(s.root,kind).props.onPress();assert.ok(s.sheet());
  assert.deepEqual(s.requests,[]);s.dispose();
});

for(const action of ['backdrop','back'])test(`shared guidance sheet ${action} behavior`,async()=>{
  const s=await app(parser.popupIntroductionSections({notice:'notice'}));button(s.root,'notice').props.onPress();
  const modal=s.mountSheet();
  if(action==='backdrop')nodes(modal.tree).find(n=>n.type==='Pressable').props.onPress();
  if(action==='back')modal.tree.props.onRequestClose();
  assert.ok(!nodes(modal.tree).some(n=>n.props?.onPanResponderRelease));
  assert.equal(modal.tree.props.visible,false);modal.tree.props.onDismiss();assert.equal(s.sheet(),undefined);
  s.dispose();
});

test('compiled mounted ko-ja-ko/system labels update while the open sheet keeps its content and selection',async()=>{
  const s=await app(parser.popupIntroductionSections({summary:'summary',notice:'NOTICE',benefits:'BENEFIT'}));
  button(s.root,'notice').props.onPress();const modal=s.mountSheet();
  for(const [language,notice,benefit] of [['ja','お知らせ','特典'],['ko','공지사항','혜택'],['system','お知らせ','特典']]) {
    await s.language(language);
    assert.equal(button(s.root,'notice').props.accessibilityLabel,notice);
    assert.equal(button(s.root,'benefits').props.accessibilityLabel,benefit);
    const title=nodes(modal.tree).find(n=>n.props?.accessibilityRole==='header');assert.equal(title.props.children,notice);
    assert.equal(button(s.root,'notice').props.accessibilityState.expanded,true);
    assert.ok(texts(modal.tree).includes('NOTICE'));
  }
  s.system('ko-KR');assert.equal(button(s.root,'notice').props.accessibilityLabel,'공지사항');
  assert.deepEqual(s.requests,[]);s.dispose();
});

test('detail keeps image properties, official channels and outer scroll while guidance opens locally',async()=>{
  const {app:detailApp,detail}=require('./helpers/mapDetailRuntime.cjs');
  const images=['https://images.test/one','https://images.test/two'];
  const s=await detailApp({detailResponse:async()=>({...detail,contentImageUrls:images})});
  const Screen=s.load('src/app/places/[id].tsx').default,root=s.mount(()=>Screen());await s.settle();
  const all=nodes(root.tree),intro=all.find(n=>n.type==='PopupIntroduction');
  const imageNodes=nodes(intro.props.detailImages),carousel=imageNodes.find(n=>n.type?.name==='IntroductionImageCarousel');
  assert.deepEqual(carousel.props.images,images);assert.equal(carousel.props.width,358);assert.equal(carousel.key,detail.publicId);
  assert.equal(styleOf(intro.props.detailImages).marginTop,20);
  assert.equal(intro.props.onAccordionToggle,undefined);assert.equal(intro.props.onAccordionHeightChange,undefined);
  const official=all.find(n=>n.type==='Text'&&n.props.children==='공식 채널');
  assert.ok(all.indexOf(intro)<all.indexOf(official));
  assert.ok(all.some(n=>n.props?.accessibilityLabel==='공식 홈페이지 공식 채널'));
  assert.ok(all.some(n=>n.props?.testID==='popup-floating-favorite'));
  s.dispose();
});

test('legacy text and embedded benefit/notice sentences remain byte-for-byte unchanged', () => {
  const raw = ' 첫 문단\r\n\r\n볼거리가 많아요. 판매 상품 안내\r\n혜택\r\n증정합니다.\r\n공지사항\r\n예약 필수\r\n ';
  assert.deepEqual(section(raw).map(s => s.paragraphs), [[raw]]);
  for (const value of [null, undefined, '', ' \n\t']) assert.deepEqual(parser.parsePopupIntroduction(value), []);
});


test('only whole standalone KO/JA headings split sections, preserving exact body line endings', () => {
  for (const headings of [['팝업 소개', '볼거리', '판매 상품'], ['ポップアップ紹介', '見どころ', '販売商品']]) {
    const source = `${headings[0]}\r\n 소개\r\n\r\n문단\r\n  ${headings[1]} \r\n体験\r\n${headings[2]}\r\n 限定商品 `;
    const result = parser.parsePopupIntroduction(source);
    assert.deepEqual(result.map(s => s.kind), ['about', 'attractions', 'products']);
    assert.deepEqual(result.map(s => s.paragraphs), [[' 소개\r\n\r\n문단\r\n'], ['体験\r\n'], [' 限定商品 ']]);
  }
  for (const raw of ['볼거리: 사진', '# 볼거리\n사진', '판매 상품 안내', '팝업 소개입니다', '見どころ：展示']) {
    assert.deepEqual(section(raw).map(s => s.paragraphs), [[raw]]);
  }
});


test('empty sections hide; preamble, repeated headings and out-of-order sections retain authored order', () => {
  const result = parser.parsePopupIntroduction('앞말\n판매 상품\n상품\n볼거리\n전시\n볼거리\n체험\n팝업 소개\n \n');
  assert.deepEqual(result.map(s => s.kind), ['about', 'products', 'attractions', 'attractions']);
  assert.deepEqual(result.flatMap(s => s.paragraphs), ['앞말\n', '상품\n', '전시\n', '체험\n']);
  assert.deepEqual(parser.parsePopupIntroduction('팝업 소개\n볼거리\n판매 상품\n'), []);
});


test('only summary forms the introduction without merging or mutating legacy highlights', () => {
  const types = ['SPECIAL', 'GOODS', 'PRODUCTS', 'VIEW', 'EXPERIENCE', 'FOOD', 'SPACE', 'HIGHLIGHT', 'FUTURE', 'VIEW'];
  const detail = Object.freeze({ summary: ' 紹介\r\n\r\n혜택 문장 ',
    highlights: Object.freeze(types.map((type, i) => Object.freeze({ type, text: i === 9 ? ' 紹介\r\n\r\n혜택 문장 ' : type + ' • ¥1,200 🎁\r\n本文 ' }))),
    benefits: ' 購入特典\n\n原文 ', notice: ' 予約条件 ' });
  const before = JSON.stringify(detail), result = parser.popupIntroductionSections(detail);
  assert.deepEqual(result.map(s => s.kind), ['about', 'benefits', 'notice']);
  assert.deepEqual(result[0].paragraphs, [detail.summary]);
  assert.deepEqual(result[1].paragraphs, [detail.benefits]);
  assert.deepEqual(result[2].paragraphs, [detail.notice]);
  assert.equal(JSON.stringify(detail), before);
});


test('blank summary has no highlights fallback while standalone accordions remain supported', () => {
  for (const empty of [null, undefined, '', ' \r\n\t ']) {
    assert.deepEqual(parser.popupIntroductionSections({ summary: empty, benefits: empty, notice: empty,
      highlights: [{ type: 'VIEW', text: empty }] }), []);
  }
  for (const type of ['VIEW', 'PRODUCTS', 'GOODS', 'FUTURE']) {
    assert.deepEqual(parser.popupIntroductionSections({ highlights: [{ type, text: ' 原文\n• 本文 ' }] })
      .map(s => [s.kind, s.paragraphs]), []);
    for (const summary of [null, undefined, '', ' \r\n\t ']) {
      assert.deepEqual(parser.popupIntroductionSections({ summary, highlights: [{ type, text: '숨길 정보' }] }), []);
    }
  }
  for (const kind of ['benefits', 'notice']) {
    assert.deepEqual(parser.popupIntroductionSections({ [kind]: '原文' }).map(s => s.kind), [kind]);
  }
});


test('API detail retains every original highlight object and text', async () => {
  const highlights = Object.freeze([{ type: 'SPECIAL', text: '特別' }, { type: 'GOODS', text: '굿즈' },
    { type: 'PRODUCTS', text: '• 상품 ¥2,000' }, { type: 'VIEW', text: '展示' }]);
  const source = Object.freeze({ publicId: 'popup-types', summary: '소개', highlights }), before = JSON.stringify(source);
  const ui = runtime({ 'src/constants/api.ts': { API_BASE_URL: 'https://api.test' },
    fetch: async () => ({ ok: true, status: 200, json: async () => source }) });
  const detail = await ui.load('src/lib/popups.ts').getPopupDetail(source.publicId, new AbortController().signal);
  assert.equal(detail.highlights, highlights);
  assert.deepEqual(parser.popupIntroductionSections(detail)[0].paragraphs, ['소개']);
  assert.equal(JSON.stringify(source), before); ui.dispose();
});


test('short and long introductions render fully without toggle, clipping, fade or measurement', async () => {
  for (const text of ['짧은 소개', '긴 소개문 '.repeat(2000)]) {
    const s = await app(section(text));
    assert.equal(textContent(content(s.root)), text);
    assert.equal(content(s.root).type, 'View');
    assert.equal(content(s.root).props.onLayout, undefined);
    assert.equal(content(s.root).props.onPress, undefined);
    assert.equal(toggle(s.root), undefined);
    for (const node of nodes(s.root.tree)) {
      assert.equal(styleOf(node).maxHeight, undefined);
      assert.equal(styleOf(node).height, undefined);
      assert.equal(styleOf(node).overflow, undefined);
      assert.equal(node.props.numberOfLines, undefined);
      assert.notEqual(node.type, 'Svg');
    }
    assert.deepEqual(s.timings, []); s.dispose();
  }
});


test('introduction renders summary once and never displays identical or different highlights', async () => {
  const source = { summary: ' 소개\n\n原文 ', highlights: [{ type: 'VIEW', text: '전시 👀' },
    { type: 'PRODUCTS', text: ' • 상품 ¥2,000\r\n일반 안내' }, { type: 'GOODS', text: '추가 정보' }] };
  const s = await app(parser.popupIntroductionSections(source));
  assert.deepEqual(bodyNodes(s.root).map(n => n.props.children), [' 소개', '原文 ']);
  for (const item of source.highlights) assert.ok(!texts(s.root.tree).includes(item.text));
  s.update(parser.popupIntroductionSections({ ...source, highlights: [{ type: 'VIEW', text: source.summary }] }));
  assert.deepEqual(bodyNodes(s.root).map(n => n.props.children), [' 소개', '原文 ']);
  bodyNodes(s.root).forEach(n => assert.equal(styleOf(n).fontWeight, '400'));
  assert.equal(nodes(s.root.tree).filter(n => n.props?.accessibilityRole === 'header').length, 0);
  assert.equal(nodes(s.root.tree).filter(n => n.props?.style?.width === 3).length, 0);
  assert.equal(accordion(s.root, 'benefits'), undefined); assert.equal(accordion(s.root, 'notice'), undefined);
  s.dispose();
});


test('blank lines use 12dp paragraph spacing while single line breaks, list indentation and source stay intact', async () => {
  const source = Object.freeze({ summary: '첫 줄\n자동 줄바꿈 전 문장\n\n\n둘째 문단\r\n \t\r\n  • 목록\r\n  • 다음 항목',
    benefits: null, notice: null, highlights: [] });
  const before = JSON.stringify(source), s = await app(parser.popupIntroductionSections(source));
  assert.deepEqual(bodyNodes(s.root).map(n => n.props.children), ['첫 줄\n자동 줄바꿈 전 문장', '둘째 문단', '  • 목록\r\n  • 다음 항목']);
  assert.equal(content(s.root).props.style.gap, 12);
  for (const node of bodyNodes(s.root)) {
    assert.equal(styleOf(node).fontSize, 14); assert.equal(styleOf(node).lineHeight, 22);
  }
  assert.equal(JSON.stringify(source), before);
  s.update([{ kind: 'about', paragraphs: ['소개'], titleKey: 'place.detail.about' },
    { kind: 'attractions', paragraphs: ['후속 문단'], titleKey: 'place.detail.introduction.attractions' }]);
  assert.deepEqual(bodyNodes(s.root).map(n => n.props.children), ['소개', '후속 문단']);
  assert.equal(content(s.root).props.style.gap, 12); s.dispose();
});

