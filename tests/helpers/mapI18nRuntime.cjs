const {runtime,flush}=require('./i18nRuntime.cjs');
const {marker}=require('./mapDetailRuntime.cjs');
async function app({transform}={}) {
 const calls=[],camera=[],timings=[],timers=new Map();let timerId=0;
 const popup=Object.freeze({...marker,latitude:37.5445,longitude:127.056,primaryTag:'뷰티'}),popups=Object.freeze([popup]);
 const animation=()=>({start:cb=>cb?.({finished:true}),stop(){}});
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','FlatList','Image'].map(n=>[n,n]));
 Object.assign(native,{StyleSheet:{create:s=>s},Platform:{OS:'ios'},Dimensions:{get:()=>({width:390,height:844})},
  useWindowDimensions:()=>({width:390,height:844,fontScale:1}),Keyboard:{addListener:()=>({remove(){}}),dismiss(){}},Alert:{alert(){}},Easing:{out:x=>x,cubic:0},
  Animated:{View:'AnimatedView',Value:class{interpolate(){return 0;}stopAnimation(){}setValue(){}},timing:animation,parallel:animation,spring:animation},PanResponder:{create:p=>({panHandlers:p})}});
 const refresh=async()=>{calls.push('mapRefresh');return popups;},openPopup=id=>calls.push(['open',id]);
 const ui=runtime({
  'react-native':native,'react-native-maps':{__esModule:true,default:'MapView',Marker:'Marker',PROVIDER_GOOGLE:'google'},
  'react-native-svg':{__esModule:true,default:'Svg',Circle:'Circle',Path:'Path'},
  'react-native-reanimated':{__esModule:true,default:{View:'ReanimatedView'},Easing:{out:x=>x,cubic:0},cancelAnimation(){},
   useSharedValue:initial=>ui.react.useRef({value:initial,get(){return this.value;},set(n){this.value=n;}}).current,
   useAnimatedStyle:fn=>fn(),withTiming:(value,config)=>{timings.push(config);return value;}},
  'supercluster':{__esModule:true,default:class{load(){}getClusters(){return [];}}},
  '@expo/vector-icons':{MaterialIcons:'MaterialIcons'},'expo-location':{getForegroundPermissionsAsync:async()=>({status:'denied'}),requestForegroundPermissionsAsync:async()=>({status:'denied'})},
  'expo-modules-core':{uuid:{v4:()=> 'original-token'}},
  'expo-router':{useLocalSearchParams:()=>({}),useRouter:()=>({setParams(){}})},
  'lucide-react-native':Object.fromEntries(['ArrowLeft','LocateFixed','Search','X','Heart'].map(n=>[n,n])),
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:40,bottom:20})},
  'src/hooks/useMapPopups.ts':{useMapPopups:()=>({popups,status:'ready',refresh})},
  'src/hooks/usePopupNavigation.ts':{usePopupNavigation:()=>openPopup},
  'src/lib/placeSearch.ts':{autocompletePlaces:async q=>{calls.push(['autocomplete',q]);return {enabled:true,items:[]};},resolvePlace:async()=>{calls.push('resolve');}},
  'src/components/map/MapPopupListSheet.tsx':{__esModule:true,default:'ListSheet'},
  'src/components/map/MapPopupPreviewCard.tsx':{__esModule:true,default:'Preview'},
  'src/components/map/MapSearchOverlay.tsx':{__esModule:true,default:'SearchOverlay',GooglePlaceAttribution:'Attribution'},
  'src/components/place/PlaceWeeklyPopupList.tsx':{__esModule:true,default:'WeeklyList'},
  'src/lib/popups.ts':{searchPopups:async q=>{calls.push(['search',q]);return [];},getWeeklyPopups:async(...args)=>{calls.push(['weekly',...args]);return Array.from({length:8},(_,i)=>({...popup,publicId:'week-'+i}));}},
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),
 },{transform});
 const {languageStore}=ui.load('src/locales/languageStore.ts');await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP']});
 return {...ui,popup,popups,calls,camera,timings,timers,language:async value=>{await languageStore.setLanguagePreference(value);await flush();},settle:async()=>{await flush();await flush();}};
}
module.exports={app};
