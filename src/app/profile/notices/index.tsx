import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiText, accountLabelKeys } from '../../../locales/accountUi';
import { useCallback,useRef,useState } from 'react';
import { useFocusEffect,useRouter,type Href } from 'expo-router';
import { ActivityIndicator,FlatList,Pressable,Text,View } from 'react-native';
import NoticeLayout,{noticeStyles as styles} from '../../../components/profile/NoticeLayout';
import { appendNotices,getNotices,noticeCategories,noticeDate,type Notice } from '../../../lib/notices';
import { colors } from '../../../theme/tokens';

export default function Notices(){
  const { t } = useTranslation();
  const router=useRouter();const [items,setItems]=useState<Notice[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[more,setMore]=useState(false);
  const request=useRef<AbortController|null>(null),cursor=useRef<string|null>(null),initialized=useRef(false),locked=useRef(false);
  const load=useCallback(async(add:boolean)=>{
    if(request.current||(add&&(!initialized.current||!cursor.current)))return;
    const after=add?cursor.current:null,controller=new AbortController();request.current=controller;setStatus(add?'ready':'loading');setMore(add);
    try{const page=await getNotices(after,controller.signal);if(controller.signal.aborted)return;
      setItems(current=>appendNotices(add?current:[],page.items));cursor.current=page.nextCursor===after?null:page.nextCursor;initialized.current=true;setStatus('ready');
    }catch{if(!controller.signal.aborted)setStatus('error');}
    finally{if(request.current===controller){request.current=null;setMore(false);}}
  },[]);
  useFocusEffect(useCallback(()=>{locked.current=false;setItems([]);cursor.current=null;initialized.current=false;setMore(false);void load(false);return()=>{request.current?.abort();request.current=null;};},[load]));
  function open(id:number){if(locked.current)return;locked.current=true;try{router.push(`/profile/notices/${id}` as Href);}catch{locked.current=false;}}
  return <NoticeLayout><FlatList data={items} keyExtractor={item=>String(item.id)} contentContainerStyle={styles.content}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>open(item.id)} style={styles.row}>
      <Text style={styles.meta}>{t(accountLabelKeys.noticeCategories[item.category])}</Text><Text style={styles.title} numberOfLines={2}>{item.title}</Text><Text style={styles.meta}>{noticeDate(item.publishedAt)}</Text>
    </Pressable>}
    ListEmptyComponent={status==='loading'?<ActivityIndicator accessibilityLabel={accountUiText(t, "공지사항 불러오는 중")} style={styles.empty} color={colors.primary}/>:status==='ready'?<View style={styles.empty}><Text style={styles.message}>{accountUiText(t, "등록된 공지사항이 없어요")}</Text></View>:null}
    ListFooterComponent={<View style={styles.status}>
      {more&&<ActivityIndicator accessibilityLabel={accountUiText(t, "공지사항 추가 로딩")} color={colors.primary}/>}
      {status==='error'&&<><Text style={styles.message}>{accountUiText(t, "공지사항을 불러오지 못했어요.")}</Text><Pressable accessibilityRole="button" onPress={()=>{void load(initialized.current);}}><Text style={styles.link}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></>}
      {status==='ready'&&!more&&cursor.current&&<Pressable accessibilityRole="button" onPress={()=>{void load(true);}}><Text style={styles.link}>{accountUiText(t, "더 보기")}</Text></Pressable>}
    </View>} onEndReached={()=>{if(status==='ready')void load(true);}} onEndReachedThreshold={0.3}/></NoticeLayout>;
}
