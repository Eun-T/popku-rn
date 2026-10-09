import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiText, accountLabelKeys } from '../../../locales/accountUi';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import InquiryLayout,{InquiryEmpty,inquiryStyles as styles} from '../../../components/profile/InquiryLayout';
import { useInquirySession } from '../../../hooks/useInquirySession';
import { appendInquiries,getMyInquiries,inquiryDate,inquiryStatus,inquiryTypes,type InquiryItem } from '../../../lib/inquiries';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export default function Inquiries() {
  const { t } = useTranslation();
  const router=useRouter(),session=useInquirySession();
  const insets=useSafeAreaInsets();
  const buttonBottom=insets.bottom+spacing.space16;
  const [items,setItems]=useState<InquiryItem[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [more,setMore]=useState(false),[retry,setRetry]=useState(0);
  const request=useRef<AbortController|null>(null),cursor=useRef<string|null>(null);
  const initialized=useRef(false),navigationLocked=useRef(false);
  const load=useCallback(async(add:boolean)=>{
    if(!session.ready||!session.authenticated||request.current||(add&&(!initialized.current||!cursor.current)))return;
    const after=add?cursor.current:null,controller=new AbortController();request.current=controller;
    setStatus(add?'ready':'loading');setMore(add);
    try{
      const page=await getMyInquiries(after,controller.signal);
      if(controller.signal.aborted)return;
      setItems(current=>appendInquiries(add?current:[],page.items));cursor.current=page.nextCursor===after?null:page.nextCursor;
      initialized.current=true;setStatus('ready');
    }catch{if(!controller.signal.aborted)setStatus('error');}
    finally{if(request.current===controller){request.current=null;setMore(false);}}
  },[session.ready,session.authenticated,session.generation]);
  useFocusEffect(useCallback(()=>{
    navigationLocked.current=false;request.current?.abort();request.current=null;cursor.current=null;initialized.current=false;
    setItems([]);setMore(false);setStatus('loading');void load(false);
    return()=>{request.current?.abort();request.current=null;};
  },[load,retry]));
  function open(path:'/profile/inquiries/write'|'/profile/inquiries/[id]',id?:number){
    if(navigationLocked.current)return;navigationLocked.current=true;
    try{if(id)router.push(`/profile/inquiries/${id}` as Href);else router.push('/profile/inquiries/write' as Href);}
    catch{navigationLocked.current=false;}
  }
  const footer=<View style={styles.item}>
    {more&&<ActivityIndicator accessibilityLabel={accountUiText(t, "문의 추가 로딩")} color={colors.primary}/>}
    {status==='error'&&<><Text style={styles.error}>{accountUiText(t, "문의 내역을 불러오지 못했어요.")}</Text><Pressable accessibilityRole="button" onPress={()=>{void load(initialized.current);}}><Text style={styles.description}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></>}
    {status==='ready'&&!more&&cursor.current&&<Pressable accessibilityRole="button" onPress={()=>{void load(true);}}><Text style={styles.description}>{accountUiText(t, "문의 더 보기")}</Text></Pressable>}
  </View>;
  return <InquiryLayout title="문의하기">
    {!session.ready?<ActivityIndicator accessibilityLabel={accountUiText(t, "로그인 상태 확인 중")} style={styles.empty} color={colors.primary}/>
      :session.error?<View style={styles.empty}><Text style={styles.error}>{accountUiText(t, "로그인 상태를 확인하지 못했어요.")}</Text><Pressable onPress={session.retry}><Text style={styles.link}>{accountUiText(t, "다시 시도하기")}</Text></Pressable></View>
      :!session.authenticated?<View style={styles.layout}><View style={[styles.layout,{justifyContent:'center'}]}><InquiryEmpty title="로그인이 필요합니다" description="문의 내역을 확인하려면 로그인해주세요."/></View></View>
      :<>
        <FlatList data={items} keyExtractor={item=>String(item.id)} style={styles.layout} contentContainerStyle={[styles.content,{paddingBottom:buttonBottom+48+spacing.space16}]}
          renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${t(accountLabelKeys.inquiryStatus[item.status])}`} onPress={()=>open('/profile/inquiries/[id]',item.id)} style={styles.item}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text><View style={styles.row}><Text style={styles.meta}>{t(accountLabelKeys.inquiryTypes[item.type])} · {inquiryDate(item.createdAt)}</Text><Text style={styles.meta}>{t(accountLabelKeys.inquiryStatus[item.status])}</Text></View>
          </Pressable>}
          ListEmptyComponent={status==='loading'?<ActivityIndicator accessibilityLabel={accountUiText(t, "문의 내역 불러오는 중")} style={styles.empty} color={colors.primary}/>:status==='ready'?<InquiryEmpty title="아직 문의 내역이 없어요" description="궁금한 점이 있다면 문의를 남겨주세요."/>:null}
          ListFooterComponent={footer} onEndReached={()=>{if(status==='ready')void load(true);}} onEndReachedThreshold={0.3}
          refreshing={false} onRefresh={()=>setRetry(value=>value+1)}/>
        <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "문의글")} onPress={()=>open('/profile/inquiries/write')}
          style={[localStyles.writeButton,{right:spacing.space16+insets.right,bottom:buttonBottom}]}>
          <Pencil size={18} color={colors.background}/><Text style={localStyles.writeText}>{accountUiText(t, "문의글")}</Text>
        </Pressable>
      </>}
  </InquiryLayout>;
}

const localStyles=StyleSheet.create({
  writeButton:{
    position:'absolute',height:48,paddingHorizontal:spacing.space16,
    flexDirection:'row',alignItems:'center',columnGap:spacing.space8,
    borderRadius:radius.full,backgroundColor:colors.text,
    shadowColor:'#000000',shadowOpacity:0.15,shadowRadius:12,
    shadowOffset:{width:0,height:4},elevation:6,
  },
  writeText:{...typography.label,fontWeight:'600',color:colors.background},
});
