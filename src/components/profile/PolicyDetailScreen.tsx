import { useTranslation } from '../../hooks/useTranslation';
import { accountUiText } from '../../locales/accountUi';
import { communityColors } from '../../theme/communityColors';
import { useRouter, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLocalizedPolicy, type Policy } from '../../content/policies';
import { colors, spacing, typography } from '../../theme/tokens';

export default function PolicyDetailScreen({ policy }: { policy: Policy }) {
  const { t, resolvedLanguage } = useTranslation();
  const localizedPolicy = getLocalizedPolicy(policy, resolvedLanguage);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "뒤로가기")}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/profile/policies' as Href)}
          style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{accountUiText(t, localizedPolicy.title)}</Text>
        <View pointerEvents="none" style={styles.backButton} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.effectiveDate}>{localizedPolicy.effectiveDate}</Text>
        {localizedPolicy.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            {!!section.title && <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>}
            {section.blocks?.map((block, index) => block.kind === 'bullet' ? (
              <View key={index} style={styles.bulletRow}>
                <Text accessible={false} style={styles.bullet}>•</Text>
                <Text style={[styles.body, styles.bulletText]}>{block.text}</Text>
              </View>
            ) : (
              <Text key={index} accessibilityRole={block.kind === 'heading' ? 'header' : undefined}
                style={block.kind === 'heading' ? styles.sectionTitle : styles.body}>{block.text}</Text>
            ))}
            {section.paragraphs?.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>{paragraph}</Text>
            ))}
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text accessible={false} style={styles.bullet}>•</Text>
                <Text style={[styles.body, styles.bulletText]}>{bullet}</Text>
              </View>
            ))}
          </View>
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
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.space16, paddingTop: spacing.space24, paddingBottom: spacing.space40 },
  effectiveDate: { ...typography.label, color: colors.secondaryText },
  section: { marginTop: spacing.space24, gap: spacing.space8 },
  sectionTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  body: { ...typography.body, color: colors.text },
  bulletRow: { flexDirection: 'row', gap: spacing.space8 },
  bullet: { ...typography.body, color: colors.text },
  bulletText: { flex: 1 },
});
