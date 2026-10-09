import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, typography } from '../../theme/tokens';
import type { ThemeColors } from '../../theme/themeColors';

type MoreButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'primary';
  themeColors?: ThemeColors;
};

export default function MoreButton({ label, onPress, variant = 'default', themeColors }: MoreButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, variant === 'primary' && styles.primaryButton,
        themeColors && { backgroundColor: variant === 'primary' ? themeColors.accent : themeColors.moreButtonBackground }, pressed && styles.pressed]}
    >
      <Text style={[styles.label, variant === 'primary' && styles.primaryLabel,
        themeColors && { color: variant === 'primary' ? themeColors.onAccent : themeColors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.radius12,
    backgroundColor: colors.moreButtonBackground,
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.label,
    color: colors.text,
    textAlign: 'center',
  },
  primaryLabel: {
    color: colors.background,
  },
});
