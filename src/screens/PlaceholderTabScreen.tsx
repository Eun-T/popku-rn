import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme/tokens';

type PlaceholderTabScreenProps = {
  title: string;
};

export default function PlaceholderTabScreen({ title }: PlaceholderTabScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.space16,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.titleL,
    color: colors.text,
  },
});
