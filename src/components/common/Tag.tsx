import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../theme/tokens';

type TagVariant = 'neutral' | 'primary' | 'info';

type TagProps = {
  label: string;
  variant?: TagVariant;
};

export default function Tag({ label, variant = 'neutral' }: TagProps) {
  return (
    <View style={[styles.tag, styles[variant]]}>
      <Text style={[styles.label, styles[`${variant}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.radius8,
  },
  label: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  neutral: { backgroundColor: colors.surface },
  neutralText: { color: colors.text },
  primary: { backgroundColor: colors.primaryLight },
  primaryText: { color: colors.primaryDark },
  info: { backgroundColor: colors.infoLight },
  infoText: { color: colors.infoDark },
});
