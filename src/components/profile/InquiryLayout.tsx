import { useTranslation } from '../../hooks/useTranslation';
import { accountUiText } from '../../locales/accountUi';
import { communityColors } from '../../theme/communityColors';
import type { ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ChevronLeft, MessageSquare } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export default function InquiryLayout({title,children,busy=false}:{title:string;children:ReactNode;busy?:boolean}) {
  const { t } = useTranslation();
  const router=useRouter();
  return <SafeAreaView style={inquiryStyles.container}>
    <View style={inquiryStyles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "뒤로가기")} disabled={busy} onPress={()=>router.canGoBack()?router.back():router.replace((title==='문의하기'?'/profile':'/profile/inquiries') as Href)} style={inquiryStyles.back}>
        <ChevronLeft size={24} color={colors.text} style={inquiryStyles.backIcon}/>
      </Pressable><Text numberOfLines={1} style={inquiryStyles.headerTitle}>{accountUiText(t, title)}</Text><View pointerEvents="none" style={inquiryStyles.back}/>
    </View>{children}
  </SafeAreaView>;
}
export function InquiryEmpty({title,description}:{title:string;description:string}) {
  const { t } = useTranslation();
  return <View style={inquiryStyles.empty}><MessageSquare size={36} color={colors.secondaryText}/><Text style={inquiryStyles.emptyTitle}>{accountUiText(t, title)}</Text><Text style={inquiryStyles.description}>{accountUiText(t, description)}</Text></View>;
}
export const inquiryStyles=StyleSheet.create({
  backIcon:{alignSelf:'flex-start'},
  container:{flex:1,backgroundColor:colors.background},layout:{flex:1},
  header:{height:56,flexDirection:'row',alignItems:'center',paddingHorizontal:spacing.space16, borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  back:{width:44,height:44,alignItems:'center',justifyContent:'center'},headerTitle:{...typography.titleS,color:colors.text,flex:1,minWidth:0,textAlign:'center'},
  content:{paddingHorizontal:spacing.space16,paddingBottom:spacing.space32,gap:spacing.space16},
  empty:{minHeight:280,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.space16},
  emptyTitle:{...typography.body,fontWeight:'600',color:colors.text,marginTop:spacing.space16,textAlign:'center'},
  description:{...typography.label,color:colors.secondaryText,marginTop:spacing.space8,textAlign:'center'},
  title:{...typography.titleS,color:colors.text},body:{...typography.body,color:colors.text},meta:{...typography.caption,color:colors.secondaryText},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.space8},
  item:{paddingVertical:spacing.space16,borderBottomWidth:1,borderBottomColor:colors.border,gap:spacing.space8},
  input:{...typography.body,color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:radius.radius8,padding:spacing.space12},
  multiline:{minHeight:180,textAlignVertical:'top'},
  button:{minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:radius.radius8,backgroundColor:colors.primary,padding:spacing.space12},
  buttonText:{...typography.label,color:colors.background,fontWeight:'600'},disabled:{opacity:0.4},
  link:{...typography.label,color:colors.primaryDark,paddingVertical:spacing.space12},
  error:{...typography.label,color:colors.secondaryText,textAlign:'center'},
  options:{flexDirection:'row',flexWrap:'wrap',gap:spacing.space8},
  option:{borderWidth:1,borderColor:colors.border,borderRadius:radius.radius8,paddingHorizontal:spacing.space12,paddingVertical:spacing.space12},
  selected:{backgroundColor:colors.text,borderColor:colors.text},selectedText:{color:colors.background},
  answer:{padding:spacing.space16,backgroundColor:colors.surface,borderRadius:radius.radius8,gap:spacing.space12},
});
