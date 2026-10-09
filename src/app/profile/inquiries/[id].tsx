import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiText, accountLabelKeys } from '../../../locales/accountUi';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import InquiryLayout,{InquiryEmpty,inquiryStyles as styles} from '../../../components/profile/InquiryLayout';
import { useInquirySession } from '../../../hooks/useInquirySession';
import { getInquiry,InquiryApiError,inquiryTypes,inquiryStatus,inquiryDate,type InquiryDetail } from '../../../lib/inquiries';
import { colors } from '../../../theme/tokens';

export default function InquiryDetailScreen(){
  const { t } = useTranslation();
  const {id}=useLocalSearchParams<{id:string}>(),session=useInquirySession();
  const [inquiry,setInquiry]=useState<InquiryDetail|null>(null),[status,setStatus]=useState<'loading'|'ready'|'error'|'missing'>('loading'),[retry,setRetry]=useState(0);
  useFocusEffect(useCallback(()=>{
    const controller=new AbortController();setInquiry(null);setStatus('loading');
    if(session.ready&&session.authenticated)void getInquiry(Number(id),controller.signal).then(row=>{if(!controller.signal.aborted){setInquiry(row);setStatus('ready');}}).catch(error=>{if(!controller.signal.aborted)setStatus(error instanceof InquiryApiError&&error.status===404?'missing':'error');});
    return()=>controller.abort();
  },[id,session.ready,session.authenticated,session.generation,retry]));
  return <InquiryLayout title="문의 상세"><ScrollView contentContainerStyle={styles.content}>
    {!session.ready?<ActivityIndicator accessibilityLabel={accountUiText(t, "로그인 상태 확인 중")} style={styles.empty} color={colors.primary}/>
      :session.error?<View style={styles.empty}><Text style={styles.error}>{accountUiText(t, "로그인 상태를 확인하지 못했어요.")}</Text><Pressable onPress={session.retry}><Text style={styles.link}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></View>
      :!session.authenticated?<InquiryEmpty title="로그인이 필요합니다" description="문의 내역을 확인하려면 로그인해주세요."/>
      :status==='loading'?<ActivityIndicator accessibilityLabel={accountUiText(t, "문의 상세 불러오는 중")} style={styles.empty} color={colors.primary}/>
      :status==='missing'?<InquiryEmpty title="문의를 찾을 수 없어요" description="문의 내역에서 다시 확인해주세요."/>
      :status==='error'?<View style={styles.empty}><Text style={styles.error}>{accountUiText(t, "문의를 불러오지 못했어요.")}</Text><Pressable onPress={()=>setRetry(value=>value+1)}><Text style={styles.link}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></View>
      :inquiry&&<><Text style={styles.meta}>{t(accountLabelKeys.inquiryTypes[inquiry.type])} · {inquiryDate(inquiry.createdAt)}</Text><Text style={styles.meta}>{t(accountLabelKeys.inquiryStatus[inquiry.status])}</Text>
        <Text style={styles.title}>{inquiry.title}</Text><Text style={styles.body}>{inquiry.content}</Text>
        {inquiry.status==='PENDING'?<Text style={styles.description}>{accountUiText(t, "답변을 기다리고 있어요.")}</Text>:<View style={styles.answer}><Text style={styles.title}>{accountUiText(t, "운영자 답변")}</Text><Text style={styles.body}>{inquiry.answer}</Text><Text style={styles.meta}>{inquiryDate(inquiry.answeredAt!)}</Text></View>}
      </>}
  </ScrollView></InquiryLayout>;
}
