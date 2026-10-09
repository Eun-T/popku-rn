const {runtime,nodes,texts,flush}=require('./i18nRuntime.cjs');
const files=['src/app/(tabs)/profile/login.tsx','src/app/(tabs)/profile/signup.tsx','src/components/profile/AccountSettingsScreen.tsx','src/app/profile/settings.tsx','src/app/profile/withdrawal.tsx','src/app/profile/inquiries/write.tsx'];
async function app(transform,realLayouts=false){
 const calls=[],alerts=[],routes=[],listeners=new Set(),user={id:7,nickname:'原文',provider:'LOCAL'};
 const router={push:x=>routes.push(x),replace:x=>routes.push(x),dismissTo:x=>routes.push(x),back:()=>routes.push('back'),canGoBack:()=>true},navigation={dispatch:x=>routes.push(x)};
 const native=Object.fromEntries(['View','Text','TextInput','Pressable','ScrollView','FlatList','KeyboardAvoidingView','ActivityIndicator'].map(x=>[x,x]));
 Object.assign(native,{Platform:{OS:'ios'},StyleSheet:{create:x=>x,hairlineWidth:1},Keyboard:{dismiss(){}},Alert:{alert:(...x)=>alerts.push(x)}});
 let guard;
 const ui=runtime({'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({bottom:34,right:0})},
  'expo-router':{useRouter:()=>router,useNavigation:()=>navigation,useLocalSearchParams:()=>({id:'1'}),useFocusEffect:fn=>ui.react.useEffect(fn,[fn])},
  'expo-router/react-navigation':{usePreventRemove:(active,callback)=>{guard={active,callback};}},
  'lucide-react-native':Object.fromEntries(['ChevronLeft','ChevronRight','Eye','EyeOff','Check','MessageSquare','Pencil'].map(x=>[x,x])),
  'src/lib/auth.ts':{DEVICE_ID:'device',authSessionGeneration:()=>3,getAuthUser:()=>user,subscribeAuthUser:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},subscribeAuthSession:()=>()=>{},
   logout:async()=>{calls.push(['logout']);throw new Error('offline');},withdrawAccount:async()=>{calls.push(['withdraw']);throw new Error('offline');},clearTokens:async()=>{throw new Error('unexpected session mutation');},login:async(...x)=>{calls.push(['login',...x]);throw new Error('server raw error');}},
  'src/hooks/useLoginAttempt.ts':{useLoginAttempt:()=>({begin:()=>({}),fail:async()=>true,active:()=>true,release(){},valid:()=>true})},
  'src/lib/googleAuth.ts':{getGoogleSignupToken:()=>null,clearGoogleSignup(){},GoogleAuthApiError:class extends Error{}},
  'src/lib/emailVerification.ts':{EmailVerificationApiError:class extends Error{},checkEmailAvailability:async()=>true,sendEmailVerification:async email=>{calls.push(['send',email]);},verifyEmailCode:async(...x)=>{calls.push(['verify',...x]);return 'raw-proof';}},
  'src/lib/signup.ts':{SignupApiError:class extends Error{}},'src/lib/nicknameAvailability.ts':{checkNicknameAvailability:async()=>true},
  'src/lib/accountSettings.ts':{AccountSettingsError:class extends Error{},accountSettingsErrorMessage:()=> '저장하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.',changeMyPassword:async(...x)=>{calls.push(['password',...x]);throw new Error('offline');}},
  'src/hooks/useInquirySession.ts':{useInquirySession:()=>({ready:true,authenticated:true,error:false,generation:3})},
  'src/lib/inquiries.ts':{inquiryTypes:{GENERAL:'일반 문의',BUG:'오류 신고',INFO_CORRECTION:'정보 수정 요청',OTHER:'기타'},inquiryStatus:{PENDING:'답변 대기',RESOLVED:'답변 완료'},inquiryDate:x=>x,appendInquiries:(a,b)=>[...a,...b],
   getMyInquiries:async(...x)=>{calls.push(['inquiries',...x]);return{items:[{id:1,type:'BUG',status:'PENDING',title:'문의하기',createdAt:'2026-10-09'}],nextCursor:null};},
   getInquiry:async(...x)=>{calls.push(['inquiry-detail',...x]);return{id:1,type:'BUG',status:'RESOLVED',title:'문의하기',content:'로그인',answer:'회원가입',createdAt:'2026-10-09',answeredAt:'2026-10-09'};},
   validInquiry:(t,c)=>!!(t.trim()&&c.trim()),createInquiry:async(...x)=>{calls.push(['inquiry',...x]);}},
  'src/lib/notices.ts':{noticeCategories:{GENERAL:'일반',UPDATE:'업데이트',EVENT:'이벤트',GUIDE:'이용 안내'},noticeDate:x=>x,appendNotices:(a,b)=>[...a,...b],
   getNotices:async(...x)=>{calls.push(['notices',...x]);return{items:[{id:1,category:'UPDATE',title:'회원가입',publishedAt:'2026-10-09'}],nextCursor:null};},
   getNotice:async(...x)=>{calls.push(['notice-detail',...x]);return{id:1,category:'UPDATE',title:'회원가입',content:'로그인',publishedAt:'2026-10-09'};}},
  'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_BOTTOM_GAP:12,FLOATING_TAB_BAR_HEIGHT:60},
  ...(!realLayouts?{'src/components/profile/InquiryLayout.tsx':{__esModule:true,default:'Layout',inquiryStyles:{}}}:{}),
 },{transform});
 const {languageStore}=ui.load('src/locales/languageStore.ts');let tags=['ja-JP'];
 await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>tags});
 const t=(k,p)=>ui.load('src/locales/index.ts').translate(languageStore.getSnapshot().resolvedLanguage,k,p);
 return{...ui,calls,alerts,routes,user,files,guard:()=>guard,t,text:k=>ui.load('src/locales/accountUi.ts').accountUiText(t,k),
  language:async pref=>{await languageStore.setLanguagePreference(pref);await flush();},system:async tag=>{tags=[tag];languageStore.refreshSystemLanguage();await flush();},settle:async()=>{await flush();await flush();}};
}
const inputs=root=>nodes(root.tree).filter(n=>n.type==='TextInput');
const button=(s,root,ko)=>nodes(root.tree).find(n=>n.type==='Pressable'&&(n.props.accessibilityLabel===s.text(ko)||texts(n)===s.text(ko)));
module.exports={app,files,inputs,button};
