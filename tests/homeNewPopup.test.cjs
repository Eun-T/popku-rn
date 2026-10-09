const assert=require('node:assert/strict'), fs=require('node:fs'), {test}=require('node:test'), ts=require('typescript');
const jsx=(type,props)=>({type,props});
function load(file,mocks) {
  mocks = require('./helpers/uiDependencies.cjs').withI18nDependencies(file, mocks);
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,name);return mocks[name]},module,module.exports);
  return module.exports;
}
const tokens=load('src/theme/tokens.ts',{});
const native={Image:'Image',Pressable:'Pressable',View:'View',Text:'Text',ScrollView:'ScrollView',useWindowDimensions:()=>({width:390}),StyleSheet:{create:s=>s}};
const common={'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'../../theme/tokens':tokens};
function sectionEnv() {
  let country='KR'; const queries=[],toggles=[],navigations=[];
  const popup={publicId:'popup',name:'Popup',coverImageUrl:'cover',startDate:'2026-10-07',endDate:'2026-10-22',regionName:'성수',tags:[{name:'굿즈'}]};
  const module=load('src/components/home/HomeNewPopupSection.tsx',{
    ...common,'expo-router':{useRouter:()=>({push(){}})},
    '../../lib/popups':{currentWeekRange:()=>({openingFrom:'2026-10-05',openingTo:'2026-10-11'})},
    '../../lib/popupStatus':{popupOperatingStatus:()=> '운영 중'},
    '../common/MoreButton':{__esModule:true,default:'More'},react:{useState:()=>[country,value=>{country=value}]},
    '../../hooks/useHomePopups':{useHomePopups:(type,selected)=>{queries.push([type,selected]);return {status:'ready',popups:[popup]}}},
    '../../hooks/usePopupFavorites':{usePopupFavorites:()=>({isFavorite:id=>id==='popup',isFavoriteDisabled:()=>false,toggleFavorite:async item=>{toggles.push(item)}})},
    '../common/FilterChips':{__esModule:true,default:'Filter'},'./HomePopupSkeleton':{},
    './NewPopupCard':{__esModule:true,default:'Card'},'../../../assets/images/ranking-placeholder.png':'placeholder',
  });
  return {module,popup,queries,toggles,navigations,render(){return module.default({onPressPopup:id=>navigations.push(id)})}};
}
function cardEnv(file='src/components/home/NewPopupCard.tsx') {
  return load(file,{...common,'lucide-react-native':{Heart:'Heart'}}).default;
}

test('shared period formatter handles same year, year boundary and missing dates',()=>{
  const {formatPopupPeriod,displayDate}=sectionEnv().module;
  assert.equal(displayDate('2026-10-07'),'10.07');
  assert.equal(formatPopupPeriod('2026-10-07','2026-10-22'),'26.10.07 - 10.22');
  assert.equal(formatPopupPeriod('2026-12-28','2027-01-05'),'26.12.28 - 27.01.05');
  assert.equal(formatPopupPeriod('2026-10-07',null),'26.10.07');
  assert.equal(formatPopupPeriod(null,'2027-01-05'),'27.01.05');
  assert.equal(formatPopupPeriod(null,null),'');
});

test('section uses existing favorite hook and preserves country filtering, detail route, geometry and metadata',()=>{
  const env=sectionEnv(),tree=env.render(),filter=tree.props.children[2].props.children;
  const scroll=tree.props.children.find(node=>node?.type==='ScrollView');assert.ok(scroll);
  const card=scroll.props.children[3][0];
  assert.equal(card.props.width,152);assert.equal(card.props.period,'26.10.07 - 10.22');
  assert.deepEqual(card.props.tags,['성수','굿즈']);assert.equal(card.props.isFavorite,true);assert.equal(card.props.isFavoriteDisabled,false);
  card.props.onToggleFavorite();assert.equal(env.toggles[0],env.popup);
  card.props.onPress();assert.deepEqual(env.navigations,['popup']);
  filter.props.onChange('JP');env.render();assert.deepEqual(env.queries,[['new','KR'],['new','JP']]);
});

test('overlay heart stays inside unchanged square image and stops detail tap propagation',()=>{
  let toggles=0,detail=0,stopped=0;
  const props={width:152,image:{uri:'cover'},period:'26.10.07 - 10.22',title:'Popup',tags:['성수','굿즈'],isFavorite:false,isFavoriteDisabled:false,onToggleFavorite:()=>toggles++,onPress:()=>detail++};
  const card=cardEnv()(props),[frame,pill,title,tags]=card.props.children;
  const [image,heart]=frame.props.children;
  assert.deepEqual(frame.props.style,{width:152,height:152});assert.equal(image.props.resizeMode,'cover');
  assert.deepEqual(image.props.style,[{borderRadius:tokens.radius.radius4},{width:152,height:152}]);
  assert.equal(heart.props.style.position,'absolute');assert.equal(heart.props.style.right,tokens.spacing.space8);assert.equal(heart.props.style.bottom,tokens.spacing.space8);
  assert.equal(heart.props.children.props.children[1].props.size,26);assert.equal(heart.props.children.props.children[1].props.fill,tokens.colors.secondaryText);
  heart.props.onPress({stopPropagation(){stopped++}});assert.equal(stopped,1);assert.equal(toggles,1);assert.equal(detail,0);
  card.props.onPress();assert.equal(detail,1);
  assert.equal(pill.props.style[0].backgroundColor,tokens.colors.primaryLight);assert.equal(pill.props.children.props.style[0].color,tokens.colors.primaryDark);
  assert.equal(title.props.style.fontSize,tokens.typography.body.fontSize);assert.equal(title.props.style.fontWeight,'700');
  assert.equal(tags.props.children[0].props.style.backgroundColor,'#F3F4F6');assert.equal(tags.props.children[0].props.children.props.style.color,'#4B5563');
});

test('favorite selected/disabled states match existing heart and preserve period pill metrics',()=>{
  const props={width:152,image:{uri:'cover'},period:'date',title:'Popup',tags:['tag'],isFavorite:true,isFavoriteDisabled:true,onToggleFavorite(){},onPress(){}};
  const current=cardEnv()(props);
  const heart=current.props.children[0].props.children[1];
  assert.equal(heart.props.disabled,true);assert.deepEqual(heart.props.accessibilityState,{selected:true,disabled:true});
  assert.equal(heart.props.children.props.children[1].props.color,'#FF5A6E');assert.equal(heart.props.children.props.children[1].props.fill,'#FF5A6E');
  assert.deepEqual(current.props.children[0].props.children[0].props.style,[{borderRadius:tokens.radius.radius4},{width:152,height:152}]);
  assert.deepEqual(current.props.children[1].props.style[0],{
    alignSelf:'flex-start',marginTop:tokens.spacing.space8,paddingHorizontal:tokens.spacing.space6,
    paddingVertical:tokens.spacing.space2,borderRadius:tokens.radius.radius4,backgroundColor:tokens.colors.primaryLight,
  });
  assert.deepEqual(current.props.children[1].props.children.props.style[0],{...tokens.typography.caption,fontWeight:'700',color:tokens.colors.primaryDark});
  assert.deepEqual(current.props.style,[{backgroundColor:tokens.colors.background},{width:152}]);
});
