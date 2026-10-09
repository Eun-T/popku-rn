const {runtime,flush}=require('./i18nRuntime.cjs');
const marker = Object.freeze({ id:'internal-id',publicId:'public-id',name:'サーバー原文 행사명',
  latitude:37.54,longitude:127.05,startDate:'2026-10-08',endDate:'2026-10-11',coverImageUrl:null,
  tags:Object.freeze([Object.freeze({id:5,name:'뷰티'}),Object.freeze({id:999,name:'미등록 원문'})]) });
const detail = Object.freeze({ ...marker,regionId:1,regionName:'성수',countryCode:'KR',isFavorited:false,favoriteCount:3,
  reviewCount:2,averageRating:4.5,contentImageUrls:Object.freeze([]),summary:'서버 소개 원문',
  notice:'서버 공지 원문',benefits:'서버 혜택 원문',operatingHours:'매일 10시~20시',address:'서울시 상세 주소 원문',
  locationDetail:'서버 층수 원문',highlights:Object.freeze([Object.freeze({type:'GOODS',text:'서버 상품 원문'})]),
  socialLinks:Object.freeze({website:'https://original.test'}),reservationUrl:'https://reserve.test',
  reservationStartAt:'2026-10-01T10:00:00',reservationEndAt:'2026-10-10T18:00:00' });

async function app({failDetail=false,failReviews=false,realReviewCard=false,transform}={}) {
  const calls={ detail:[],reviews:[],routes:[],links:[],share:[],images:[] };
  const nativeImage=function Image(){};
  nativeImage.resolveAssetSource=()=>({width:100,height:100});
  nativeImage.getSize=(uri,ok,fail)=>{ calls.images.push(uri); fail(); };
  const native={ Platform:{OS:'ios'},View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',FlatList:'FlatList',Image:nativeImage,
    ActivityIndicator:'ActivityIndicator',StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:390,height:844,fontScale:1}),
    Alert:{alert(){}},Share:{share:async value=>calls.share.push(value)},Linking:{openURL:async url=>calls.links.push(url)} };
  const ui=runtime({
    'expo-constants':{__esModule:true,default:{expoConfig:{ios:{bundleIdentifier:'com.popku.app'},android:{package:'com.popku.app'}}}},
    'react-native':native,'lucide-react-native':Object.fromEntries(['ArrowLeft','ArrowUpRight','CalendarDays','ChevronLeft','ChevronRight','Clock3','Heart','MapPin','MessageCircle','Share2','Star','Ticket'].map(n=>[n,n])),
    'expo-router':{useFocusEffect(){},useLocalSearchParams:()=>({id:detail.publicId}),useRouter:()=>({back(){},push:r=>calls.routes.push(r),dismissTo:r=>calls.routes.push(r)})},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:40,bottom:20})},
    'src/components/common/Tag.tsx':{__esModule:true,default:'Tag'},
    'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
    'src/components/place/PlaceMapPreview.tsx':{__esModule:true,default:'MapPreview',isMapPreviewAvailable:true},
    ...Object.fromEntries(['PopupHeroImage','PopupDetailSkeleton','OfficialChannelIcon'].map(n=>[`src/components/place/${n}.tsx`,{__esModule:true,default:n}])),
    ...(!realReviewCard ? {'src/components/community/CommunityPostItem.tsx':{__esModule:true,default:'ReviewCard'}} : {}),
    'src/components/reviews/ReviewActions.tsx':{__esModule:true,default:'ReviewActions'},
    'src/hooks/useCommunityNow.ts':{useCommunityNow:()=>({now:1})},
    'src/lib/auth.ts':{getAuthUser:()=>null,subscribeAuthUser:()=>()=>{},subscribeAuthSession:()=>()=>{},getAuthSession:async()=>({accessToken:null,generation:0})},
    'src/lib/favorites.ts':{favoritePopup:async()=>{},unfavoritePopup:async()=>{},FavoriteUnauthorizedError:class extends Error{}},
    'src/lib/popups.ts':{getPopupDetail:async(...args)=>{ calls.detail.push(args); if(failDetail) throw new Error('read failed'); return detail; },PopupDetailUnauthorizedError:class extends Error{}},
    'src/lib/reviews.ts':{subscribeReviews:()=>()=>{},getPopupReviews:async(...args)=>{ calls.reviews.push(args); if(failReviews) throw new Error('read failed'); return {items:[],nextCursor:null}; }},
    'src/lib/communityFeedRefresh.ts':Object.fromEntries(['subscribeCommunityLikes','subscribeCommunityCommentCounts','subscribeCommunityPostChanges'].map(n=>[n,()=>()=>{}])),
    'src/lib/communityLikes.ts':{changeCommunityLike:async()=>{}},
    'src/components/home/HomeNewPopupSection.tsx':{displayDate:date=>date.slice(5).replace('-','.')},
  },{transform});
  const {languageStore}=ui.load('src/locales/languageStore.ts');
  await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>['ja-JP']});
  return { ...ui,calls,languageStore,async language(value) { await languageStore.setLanguagePreference(value); },async settle() { await flush(); await flush(); } };
}

module.exports={app,marker,detail};
