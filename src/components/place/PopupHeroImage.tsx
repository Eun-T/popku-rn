import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../theme/tokens';

type Props = { uri: string | null; accessibilityLabel: string; topInset: number };

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

/** The parent owns the stable viewport; intrinsic poster dimensions never resize it. */
export default function PopupHeroImage({ uri, accessibilityLabel, topInset }: Props) {
  const [failed, setFailed] = useState(false);
  const source = uri && !failed ? { uri } : placeholderImage;

  return (
    <View pointerEvents="none" style={styles.layers}>
      {uri && !failed && (
        <Image
          source={source}
          resizeMode="cover"
          blurRadius={20}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.background}
        />
      )}
      <Image
        source={source}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
        onError={() => { if (uri) setFailed(true); }}
        style={[styles.poster, { top: topInset + spacing.space16 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layers: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: colors.background },
  background: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.4, transform: [{ scale: 1.12 }] },
  poster: { position: 'absolute', top: spacing.space16, bottom: spacing.space16, left: spacing.space16, right: spacing.space16 },
});
