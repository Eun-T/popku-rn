import { Check, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../hooks/useTranslation';
import { type ThemePreference } from '../../theme/themeStore';
import { radius, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

type ThemePreferenceSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export default function ThemePreferenceSheet({ visible, onClose }: ThemePreferenceSheetProps) {
  const { t } = useTranslation();
  const { themePreference, setThemePreference, themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  function select(preference: ThemePreference) {
    if (preference !== themePreference) void setThemePreference(preference);
    onClose();
  }

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
          onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, {
          backgroundColor: themeColors.bottomSheetBg,
          marginBottom: Math.max(insets.bottom, spacing.space16),
          marginLeft: Math.max(insets.left, spacing.space16),
          marginRight: Math.max(insets.right, spacing.space16),
        }]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: themeColors.textPrimary }]}>
              {t('account.settings.theme.title')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
              onPress={onClose} style={styles.close}>
              <X size={22} color={themeColors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView>
            {(['system', 'light', 'dark'] as const).map(preference => (
              <Pressable key={preference} accessibilityRole="radio"
                accessibilityLabel={t(`account.settings.theme.${preference}`)}
                accessibilityState={{ checked: themePreference === preference }}
                onPress={() => select(preference)}
                style={({ pressed }) => [styles.option, { borderTopColor: themeColors.border },
                  pressed && { backgroundColor: themeColors.surfaceSecondary }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>
                  {t(`account.settings.theme.${preference}`)}
                </Text>
                {themePreference === preference && <Check size={22} color={themeColors.accent} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { maxHeight: '80%', borderRadius: radius.radius24, paddingHorizontal: spacing.space20,
    paddingBottom: spacing.space8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.space8 },
  title: { ...typography.titleS, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  option: { minHeight: spacing.space56, paddingVertical: spacing.space16,
    flexDirection: 'row', alignItems: 'center', gap: spacing.space12, borderTopWidth: StyleSheet.hairlineWidth },
  label: { ...typography.body, flex: 1 },
});
