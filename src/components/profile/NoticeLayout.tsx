import { useTranslation } from '../../hooks/useTranslation';
import { accountUiText } from '../../locales/accountUi';
import { communityColors } from '../../theme/communityColors';
import type { ReactNode } from 'react';
import { useRouter,type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors,spacing,typography } from '../../theme/tokens';

export default function NoticeLayout({children,detail=false}:{children:ReactNode;detail?:boolean}){
  const { t } = useTranslation();
  const router=useRouter();
  return <SafeAreaView style={noticeStyles.container}><View style={noticeStyles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "뒤로가기")} onPress={()=>router.canGoBack()?router.back():router.replace((detail?'/profile/notices':'/profile') as Href)} style={noticeStyles.back}><ChevronLeft size={24} color={colors.text} style={noticeStyles.backIcon}/></Pressable>
    <Text numberOfLines={1} style={noticeStyles.headerTitle}>{accountUiText(t, "공지사항")}</Text><View pointerEvents="none" style={noticeStyles.back}/></View>{children}</SafeAreaView>;
}
export const noticeStyles=StyleSheet.create({
  backIcon:{alignSelf:'flex-start'},
  container:{flex:1,backgroundColor:colors.background},header:{minHeight:spacing.space56,flexDirection:'row',alignItems:'center',paddingHorizontal:spacing.space16, borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  back:{width:44,height:44,alignItems:'center',justifyContent:'center'},headerTitle:{...typography.titleS,color:colors.text,flex:1,minWidth:0,textAlign:'center'},
  content:{paddingHorizontal:spacing.space16,paddingTop:spacing.space24,paddingBottom:spacing.space40},
  row:{paddingVertical:spacing.space16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border,gap:spacing.space8},
  title:{...typography.titleS,color:colors.text},meta:{...typography.caption,color:colors.secondaryText},body:{...typography.body,color:colors.text,lineHeight:26},
  empty:{minHeight:280,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.space16},status:{paddingVertical:spacing.space24,alignItems:'center',gap:spacing.space12},
  message:{...typography.body,color:colors.secondaryText,textAlign:'center'},link:{...typography.label,color:colors.primaryDark,padding:spacing.space12},section:{gap:spacing.space16},scroll:{flex:1},
});
