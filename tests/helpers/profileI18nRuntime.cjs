const {runtime,nodes,texts,flush}=require('./i18nRuntime.cjs');
const post=require('./communityI18nRuntime.cjs').post;
const review=Object.freeze({...post,id:20,type:'REVIEW',rating:4,popup:Object.freeze({publicId:'popup-original',name:'サーバー 행사명',coverImageUrl:null}),category:'REVIEW'});
const popup=Object.freeze({publicId:'popup-original',name:'サーバー 행사명',startDate:null,endDate:null,coverImageUrl:null,
 tags:Object.freeze([Object.freeze({id:5,name:'뷰티'}),Object.freeze({id:999,name:'미등록 원문'})])});
const files=['src/app/(tabs)/profile/index.tsx','src/app/profile/posts.tsx','src/app/profile/reviews.tsx',
 'src/app/profile/favorites.tsx','src/components/profile/AccountSettingsScreen.tsx'];
async function app({guest=false,empty=false,fail=false,transform,realCard=false}={}){
 const calls=[],routes=[],alerts=[],authListeners=new Set(),cacheListeners=new Set(),userListeners=new Set();
 let user=guest?null:Object.freeze({id:7,nickname:'ニックネーム原文',email:'raw@example.test',provider:'LOCAL'});
 let favorites=fail?null:Object.freeze(empty?[]:[popup]),saveFailure=null,available=true,restoreFailure=fail;
 const router={push:x=>routes.push(x),replace:x=>routes.push(x),dismissTo:x=>routes.push(x),back:()=>routes.push('back'),canGoBack:()=>true};
 const subscribe=set=>fn=>{set.add(fn);return()=>set.delete(fn);};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','FlatList','Image','ActivityIndicator','KeyboardAvoidingView'].map(n=>[n,n]));
 Object.assign(native,{Platform:{OS:'ios'},StyleSheet:{create:s=>s,hairlineWidth:1},Keyboard:{dismiss(){}},Alert:{alert:(...args)=>alerts.push(args)}});
 class ApiError extends Error{constructor(status){super('server free text');this.status=status;this.authGeneration=3;}}
 const page=async(type,cursor,signal)=>{calls.push([type,cursor,signal]);if(fail)throw new ApiError(500);
  const item=type==='posts'?post:review;return{items:empty?[]:[cursor?Object.freeze({...item,id:item.id+1}):item],nextCursor:cursor?null:'cursor-original'};};
 const ui=runtime({
  'react-native':native,'expo-blur':{BlurTargetView:'BlurTargetView',BlurView:'BlurView'},
  'expo-router':{useRouter:()=>router,useFocusEffect:fn=>ui.react.useEffect(fn,[fn])},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  'lucide-react-native':Object.fromEntries(['ChevronLeft','ChevronRight','Eye','EyeOff','Heart','MessageSquare','MessageCircle','Settings','Star','UserRound','MoreHorizontal'].map(n=>[n,n])),
  'src/lib/auth.ts':{getAuthUser:()=>user,subscribeAuthUser:subscribe(userListeners),subscribeAuthSession:subscribe(authListeners),
   refreshAuthUser:async()=>{calls.push(['restore']);if(restoreFailure)throw new Error('offline');return user;},
   getAuthSession:async()=>{calls.push(['session']);return{accessToken:guest?null:'token-original',generation:3};},clearTokens:async()=>{throw new Error('no session mutation expected');}},
  'src/lib/community.ts':{CommunityApiError:ApiError},
  'src/lib/communityFeedRefresh.ts':Object.fromEntries(['subscribeCommunityPostChanges','subscribeCommunityCommentCounts'].map(n=>[n,()=>()=>{}])),
  'src/lib/myPosts.ts':{appendMyPosts:(a,b)=>[...a,...b],getMyPosts:(c,s)=>page('posts',c,s)},
  'src/lib/myReviews.ts':{appendMyReviews:(a,b)=>[...a,...b],getMyReviews:(c,s)=>page('reviews',c,s)},
  'src/lib/reviews.ts':{subscribeReviews:()=>()=>{}},
  'src/lib/favoriteCache.ts':{getFavoriteCache:()=>favorites,favoriteSessionGeneration:()=>3,subscribeFavoriteCache:subscribe(cacheListeners)},
  'src/lib/favorites.ts':{FavoriteUnauthorizedError:ApiError,getFavoritePopups:async signal=>{calls.push(['favorites',signal]);if(fail)throw new Error('offline');return favorites;}},
  'src/lib/accountSettings.ts':{AccountSettingsError:ApiError,accountSettingsErrorMessage:(e)=>e.status===409?'이미 사용 중인 닉네임이에요.':e.status===401?'로그인이 만료됐어요. 다시 로그인해 주세요.':'저장하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.',
   updateMyNickname:async(n,signal)=>{calls.push(['nickname',n,signal]);if(saveFailure)throw saveFailure;user=Object.freeze({...user,nickname:n});userListeners.forEach(fn=>fn());return user;},changeMyPassword:()=>{throw new Error('password out of scope');}},
  'src/lib/nicknameAvailability.ts':{checkNicknameAvailability:async(n,signal)=>{calls.push(['availability',n,signal]);return available;}},
  'src/hooks/useCommunityNow.ts':{useCommunityNow:()=>({now:Date.parse('2026-10-09T03:00:00Z')})},
  'src/hooks/usePopupNavigation.ts':{usePopupNavigation:()=>id=>routes.push(id)},
  ...(!realCard?{'src/components/community/CommunityPostItem.tsx':{__esModule:true,default:'Card'}}:{}),
  'src/components/reviews/ReviewActions.tsx':{__esModule:true,default:'ReviewActions'},
 },{transform});
 const {languageStore}=ui.load('src/locales/languageStore.ts');let tags=['ja-JP'];
 await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>tags});
 return{...ui,calls,routes,alerts,post,review,popup,ApiError,files,user:()=>user,cache:()=>favorites,
  t:(k,p)=>ui.load('src/locales/index.ts').translate(languageStore.getSnapshot().resolvedLanguage,k,p),
  language:async pref=>{await languageStore.setLanguagePreference(pref);await flush();},
  system:async tag=>{tags=[tag];languageStore.refreshSystemLanguage();await flush();},
  settle:async()=>{await flush();await flush();},failSave:e=>saveFailure=e,available:v=>available=v};
}
const button=(s,root,key)=>nodes(root.tree).find(n=>n.type==='Pressable'&&(n.props.accessibilityLabel===s.t(key)||texts(n)===s.t(key)));
const list=root=>nodes(root.tree).find(n=>n.type==='FlatList');
const input=root=>nodes(root.tree).find(n=>n.type==='TextInput');
module.exports={app,files,button,list,input};
