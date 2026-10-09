import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiText, accountLabelKeys } from '../../../locales/accountUi';
import { useCallback,useState } from 'react';
import { useFocusEffect,useLocalSearchParams } from 'expo-router';
import { ActivityIndicator,Pressable,ScrollView,Text,View } from 'react-native';
import NoticeLayout,{noticeStyles as styles} from '../../../components/profile/NoticeLayout';
import { getNotice,NoticeApiError,noticeCategories,noticeDate,type Notice } from '../../../lib/notices';
import { colors } from '../../../theme/tokens';

export default function NoticeDetail(){
  const { t } = useTranslation();
  const {id}=useLocalSearchParams<{id:string}>();const [notice,setNotice]=useState<Notice|null>(null),[status,setStatus]=useState<'loading'|'ready'|'error'|'missing'>('loading'),[retry,setRetry]=useState(0);
  useFocusEffect(useCallback(()=>{
    const controller=new AbortController();setNotice(null);setStatus('loading');
    void getNotice(Number(id),controller.signal).then(row=>{if(!controller.signal.aborted){setNotice(row);setStatus('ready');}}).catch(error=>{if(!controller.signal.aborted)setStatus(error instanceof NoticeApiError&&error.status===404?'missing':'error');});
    return()=>controller.abort();
  },[id,retry]));
  return <NoticeLayout detail><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    {status==='loading'?<ActivityIndicator accessibilityLabel={accountUiText(t, "공지사항 불러오는 중")} style={styles.empty} color={colors.primary}/>
      :status==='missing'?<View style={styles.empty}><Text style={styles.message}>{accountUiText(t, "공지사항을 찾을 수 없어요.")}</Text></View>
      :status==='error'?<View style={styles.empty}><Text style={styles.message}>{accountUiText(t, "공지사항을 불러오지 못했어요.")}</Text><Pressable accessibilityRole="button" onPress={()=>setRetry(value=>value+1)}><Text style={styles.link}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></View>
      :notice&&<View style={styles.section}><Text style={styles.meta}>{t(accountLabelKeys.noticeCategories[notice.category])}</Text><Text style={styles.title}>{notice.title}</Text><Text style={styles.meta}>{noticeDate(notice.publishedAt)}</Text><Text style={styles.body}>{notice.content}</Text></View>}
  </ScrollView></NoticeLayout>;
}
