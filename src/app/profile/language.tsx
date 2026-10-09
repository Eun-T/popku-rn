import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../hooks/useTranslation';
import { languageStore, type LanguagePreference } from '../../locales/languageStore';
import { communityColors } from '../../theme/communityColors';
import { colors, spacing, typography } from '../../theme/tokens';

export default function LanguageSettings() {
  const { t, languagePreference, storageError } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('language.back')}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/profile/settings')}
          style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('language.screenTitle')}</Text>
        <View pointerEvents="none" style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {(['system', 'ko', 'ja'] as const).map((preference: LanguagePreference) => (
          <Pressable key={preference} accessibilityRole="radio"
            accessibilityLabel={t(`language.${preference}`)}
            accessibilityState={{ checked: languagePreference === preference }}
            onPress={() => { void languageStore.setLanguagePreference(preference); }}
            style={[styles.row, styles.divider]}>
            <View style={styles.languageOption}>
              <Text style={styles.rowLabel}>{t(`language.${preference}`)}</Text>
            </View>
            <View accessible={false} style={[styles.radio, languagePreference === preference && styles.selectedRadio]}>
              {languagePreference === preference && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}
        {storageError && <Text accessibilityRole="alert" style={styles.languageDescription}>
          {t(storageError === 'write' ? 'language.saveError' : 'language.readError')}
        </Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backIcon: { alignSelf: "flex-start" },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: spacing.space56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.space16,
    borderBottomWidth: 1,
    borderBottomColor: communityColors.divider,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.titleS,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: spacing.space16,
    paddingTop: spacing.space24,
    paddingBottom: spacing.space60 + spacing.space40,
  },
  row: {
    minHeight: spacing.space56,
    paddingVertical: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space12,
  },
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  languageDescription: { ...typography.label, color: colors.secondaryText, marginBottom: spacing.space16 },
  languageOption: { flex: 1, minWidth: 0 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center' },
  selectedRadio: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
