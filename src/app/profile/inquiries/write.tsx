import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiKey, accountUiText, accountLabelKeys } from '../../../locales/accountUi';
import { useEffect, useRef, useState } from 'react';
import { useNavigation, useRouter, type Href } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import InquiryLayout,{inquiryStyles as styles} from '../../../components/profile/InquiryLayout';
import { useInquirySession } from '../../../hooks/useInquirySession';
import { createInquiry,inquiryTypes,validInquiry,type InquiryType } from '../../../lib/inquiries';
import { colors } from '../../../theme/tokens';

export default function WriteInquiry(){
  const { t } = useTranslation();
  const accountTranslation = useRef(t);
  useEffect(() => { accountTranslation.current = t; }, [t]);
  const router=useRouter(),navigation=useNavigation(),session=useInquirySession();
  const [type,setType]=useState<InquiryType>('GENERAL'),[title,setTitle]=useState(''),[content,setContent]=useState('');
  const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const busy=useRef(false),mounted=useRef(true),allowLeave=useRef(false);
  const confirmingLeave=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  usePreventRemove(!!(title.trim()||content.trim())||submitting,({data})=>{
    if(allowLeave.current){navigation.dispatch(data.action);return;}
    if(busy.current||confirmingLeave.current)return;
    confirmingLeave.current=true;
    Alert.alert(accountUiText(accountTranslation.current, "작성을 그만둘까요?"),accountUiText(accountTranslation.current, "저장하지 않은 내용은 사라져요."),[
      {text:accountUiText(accountTranslation.current, "계속 작성"),style:'cancel',onPress:()=>{confirmingLeave.current=false;}},
      {text:accountUiText(accountTranslation.current, "나가기"),style:'destructive',onPress:()=>{
        if(!confirmingLeave.current)return;
        confirmingLeave.current=false;
        if(mounted.current&&!busy.current)navigation.dispatch(data.action);
      }},
    ],{cancelable:false});
  });
  const valid=session.ready&&session.authenticated&&!session.error&&validInquiry(title,content)&&!submitting;
  async function submit(){
    if(!valid||busy.current)return;busy.current=true;setSubmitting(true);setError('');
    try{await createInquiry(type,title,content);allowLeave.current=true;confirmingLeave.current=false;
      if(mounted.current){if(router.canGoBack())router.back();else router.replace('/profile/inquiries' as Href);}
    }catch{if(mounted.current)setError(accountUiKey('문의를 등록하지 못했어요. 입력한 내용을 확인하고 다시 시도해주세요.'));}
    finally{busy.current=false;if(mounted.current)setSubmitting(false);}
  }
  return <InquiryLayout title="문의 작성" busy={submitting}><KeyboardAvoidingView style={styles.layout} behavior={Platform.OS==='ios'?'padding':'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {!session.ready&&<ActivityIndicator color={colors.primary}/>}
      {session.ready&&!session.authenticated&&<Text style={styles.error}>{accountUiText(t, "로그인이 필요합니다")}</Text>}
      {session.error&&<Pressable onPress={session.retry}><Text style={styles.link}>{accountUiText(t, "로그인 상태 확인 다시 시도")}</Text></Pressable>}
      <Text style={styles.title}>{accountUiText(t, "문의 유형")}</Text><View style={styles.options}>{(Object.keys(inquiryTypes) as InquiryType[]).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:type===value}} disabled={submitting} onPress={()=>setType(value)} style={[styles.option,type===value&&styles.selected]}><Text style={[styles.meta,type===value&&styles.selectedText]}>{t(accountLabelKeys.inquiryTypes[value])}</Text></Pressable>)}</View>
      <Text style={styles.title}>{accountUiText(t, "제목")}</Text><TextInput accessibilityLabel={accountUiText(t, "문의 제목")} placeholder={accountUiText(t, "제목을 입력해주세요")} placeholderTextColor={colors.secondaryText} maxLength={150} editable={!submitting} value={title} onChangeText={setTitle} style={styles.input}/>
      <Text style={styles.meta}>{title.length}/150</Text><Text style={styles.title}>{accountUiText(t, "내용")}</Text>
      <TextInput accessibilityLabel={accountUiText(t, "문의 내용")} multiline textAlignVertical="top" placeholder={accountUiText(t, "문의 내용을 입력해주세요")} placeholderTextColor={colors.secondaryText} editable={!submitting} value={content} onChangeText={setContent} style={[styles.input,styles.multiline]}/>
      {error&&<Text accessibilityRole="alert" style={styles.error}>{accountUiText(t, error)}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{disabled:!valid,busy:submitting}} disabled={!valid} onPress={()=>{void submit();}} style={[styles.button,!valid&&styles.disabled]}>
        {submitting?<ActivityIndicator color={colors.background}/>:<Text style={styles.buttonText}>{accountUiText(t, "문의 등록하기")}</Text>}
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView></InquiryLayout>;
}
