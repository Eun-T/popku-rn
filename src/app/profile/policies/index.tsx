import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiText } from '../../../locales/accountUi';
import { communityColors } from '../../../theme/communityColors';
import { useRouter, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { policies } from '../../../content/policies';
import { colors, spacing, typography } from '../../../theme/tokens';

const items = [
  { policy: policies.terms, href: '/profile/policies/terms' },
  { policy: policies.privacy, href: '/profile/policies/privacy' },
  { policy: policies.location, href: '/profile/policies/location' },
] as const;

export default function Policies() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "뒤로가기")}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}
          style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{accountUiText(t, "약관/정책")}</Text>
        <View pointerEvents="none" style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {items.map(({ policy, href }, index) => (
          <Pressable key={href} accessibilityRole="button" accessibilityLabel={accountUiText(t, policy.title)}
            onPress={() => router.push(href as Href)} style={[styles.row, index > 0 && styles.divider]}>
            <Text style={styles.rowLabel}>{accountUiText(t, policy.title)}</Text>
            <ChevronRight size={20} color={colors.inactiveText} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backIcon: { alignSelf: 'flex-start' },
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: spacing.space56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16 , borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleS, color: colors.text, flex: 1, minWidth: 0, textAlign: 'center' },
  content: { paddingHorizontal: spacing.space16, paddingTop: spacing.space24, paddingBottom: spacing.space40 },
  row: { minHeight: spacing.space56, paddingVertical: spacing.space16, flexDirection: 'row', alignItems: 'center', gap: spacing.space12 },
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
