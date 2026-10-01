import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme/tokens';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>지도는 Android와 iOS 앱에서 이용할 수 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  message: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
  },
});
