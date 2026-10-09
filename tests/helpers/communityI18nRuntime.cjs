const {runtime,nodes,texts,flush}=require('./i18nRuntime.cjs');
const post=Object.freeze({id:10,type:'POST',category:'QUESTION',content:'게시글 사용자 원문',
  author:Object.freeze({id:1,nickname:'원문 작성자',avatarUrl:null}),images:Object.freeze(['original1.webp','original2.webp']),
  imageIds:Object.freeze([7,8]),createdAt:'2026-10-09T02:55:00Z',isOwner:true,commentCount:2,liked:false,likeCount:0,viewCount:0});
const rootComment=Object.freeze({id:1,content:'댓글 사용자 원문',parentCommentId:null,replyToUser:null,isOwner:true,author:post.author,createdAt:post.createdAt});
const replyComment=Object.freeze({...rootComment,id:2,content:'답글 사용자 원문',parentCommentId:1,replyToUser:post.author,author:Object.freeze({id:2,nickname:'원문 답글자'}),isOwner:false});
const image=Object.freeze({uri:'file://converted.webp',width:100,height:100,mimeType:'image/webp'});
async function app({editing=false,guest=false,transform,failRead=false}={}) {
 const calls=[],routes=[],alerts=[],changes=[],focus=new Map();let writingFailure=null,commentFailure=null,deletingFailure=null,authFailure=false,removal,systemTags=['ja-JP'];
 class ApiError extends Error {constructor(status){super('server 자유 텍스트');this.status=status;}}
 class ImageSelectionError extends Error {constructor(reason){super(reason);this.reason=reason;}}
 const user=guest?null:post.author,router={push:r=>routes.push(r),replace:r=>routes.push(r),canGoBack:()=>true,back:()=>routes.push('back')};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','FlatList','Image','Modal','ActivityIndicator','KeyboardAvoidingView'].map(n=>[n,n]));
 const animate=()=>({start:cb=>cb?.({finished:true}),stop(){}});
 Object.assign(native,{Platform:{OS:'ios'},StyleSheet:{create:s=>s,absoluteFill:{position:'absolute'}},Alert:{alert:(...args)=>alerts.push(args)},
  Animated:{Value:class{setValue(){} stopAnimation(){}},View:'AnimatedView',timing:animate,spring:animate,parallel:animate},PanResponder:{create:config=>({panHandlers:config})}});
 const request=async(kind,...args)=>{calls.push([kind,...args]);if(writingFailure)throw writingFailure;return post;};
 const updateNow=()=>{};
 const ui=runtime({
  'react-native':native,'lucide-react-native':Object.fromEntries(['Pencil','Settings','ChevronLeft','ChevronRight','Heart','MessageCircle','MoreHorizontal','Star','UserRound','ImagePlus','X','Trash2'].map(n=>[n,n])),
  'expo-router':{useRouter:()=>router,useLocalSearchParams:()=>editing?{editId:'10',id:'10'}:{id:'10'},
   useNavigation:()=>({dispatch:a=>routes.push(a)}),useScrollToTop(){},useFocusEffect:fn=>ui.react.useEffect(fn,[fn])},
  'expo-router/react-navigation':{usePreventRemove:(enabled,fn)=>{removal={enabled,fn};}},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:40,bottom:20,left:0,right:0})},
  'src/components/navigation/FloatingTabBar.tsx':{FLOATING_TAB_BAR_HEIGHT:60,FLOATING_TAB_BAR_BOTTOM_GAP:12},
  'src/hooks/useCommunityNow.ts':{useCommunityNow:()=>({now:Date.parse('2026-10-09T03:00:00Z'),updateNow})},
  'src/lib/auth.ts':{getAuthUser:()=>user,subscribeAuthUser:()=>()=>{},subscribeAuthSession:()=>()=>{},getSavedAccessToken:async()=>{
    if(authFailure)throw new Error('authentication read failed');return guest?null:'token-original';},clearTokens:async()=>false},
  'src/lib/community.ts':{CommunityApiError:ApiError,
   getCommunityFeed:async(...args)=>{calls.push(['feed',...args]);if(failRead)throw new Error('read');return {items:[post],nextCursor:args[2]?null:'next-original'};},
   getCommunityPost:async(...args)=>{calls.push(['detail',...args]);if(failRead)throw new ApiError(500);return post;},
   getCommunityPostForEdit:async(...args)=>{calls.push(['edit',...args]);if(failRead)throw new Error('read');return post;},
   createCommunityPost:(...args)=>request('create',...args),updateCommunityPost:(...args)=>request('update',...args),
   deleteCommunityPost:async(...args)=>{calls.push(['delete',...args]);if(deletingFailure)throw deletingFailure;}},
  'src/lib/communityImages.ts':{MAX_POST_IMAGES:5,ImageSelectionError,
   selectPostImages:async(_current,observer)=>{calls.push(['images']);observer.onSelected([image]);observer.onConverted(0,image);return [image];},
   publishPostWithImages:(...args)=>request('createImages',...args),updatePostWithImages:(...args)=>request('updateImages',...args)},
  'src/lib/communityComments.ts':{MAX_COMMENT_LENGTH:2000,
   getCommunityComments:async(...args)=>{calls.push(['comments',...args]);if(failRead)throw new Error('read');return {items:[rootComment,replyComment],commentCount:2};},
   createCommunityComment:async(...args)=>{calls.push(['commentCreate',...args]);if(commentFailure)throw commentFailure;return {item:{...rootComment,id:3,content:args[1],parentCommentId:args[2]?.parentCommentId??null},commentCount:3};},
   deleteCommunityComment:async(...args)=>{calls.push(['commentDelete',...args]);if(deletingFailure)throw deletingFailure;return {commentCount:0};},
   insertCommunityComment:(items,item)=>[...items,item]},
  'src/lib/communityFeedRefresh.ts':{communityFeedRevision:()=>0,communityLikeSession:()=>0,
   ...Object.fromEntries(['subscribeCommunityCommentCounts','subscribeCommunityLikes','subscribeCommunityPostChanges'].map(n=>[n,()=>()=>{}])),
   ...Object.fromEntries(['publishCommunityPostChange','markCommunityFeedChanged','publishCommunityCommentCount','publishCommunityCommentDeletion'].map(n=>[n,(...args)=>changes.push([n,...args])]))},
  'src/lib/communityLikes.ts':{changeCommunityLike:async()=>{throw new Error('POST likes must stay hidden');}},
  'src/lib/communityRefresh.ts':{waitForCommunityRefresh:async()=>{}},'src/lib/communityDiagnostics.ts':{logCommunityError(){}},
 },{transform});
 const {languageStore}=ui.load('src/locales/languageStore.ts');await languageStore.initialize({read:async()=> 'ko',write:async()=>{},getLanguageTags:()=>systemTags});
 const locale=ui.load('src/locales/index.ts');
 return {...ui,calls,routes,alerts,changes,ApiError,post,rootComment,replyComment,image,
  t:(key,params)=>locale.translate(languageStore.getSnapshot().resolvedLanguage,key,params),
  async language(value){await languageStore.setLanguagePreference(value);await flush();},
  async systemLanguage(tag){systemTags=[tag];languageStore.refreshSystemLanguage();await flush();},
  async settle(){await flush();await flush();},removal:()=>removal,
  failWrite(error){writingFailure=error;},failComment(error){commentFailure=error;},failDelete(error){deletingFailure=error;},failAuth(){authFailure=true;},
 };
}
const button=(s,root,key,params)=>nodes(root.tree).find(n=>n.type==='Pressable'&&(n.props.accessibilityLabel===s.t(key,params)||texts(n)===s.t(key,params)));
const child=(tree,name)=>nodes(tree).find(n=>n.type?.name===name);
const input=root=>nodes(root.tree).find(n=>n.type==='TextInput');
module.exports={app,post,rootComment,replyComment,button,child,input};
