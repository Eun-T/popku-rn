import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { colors, radius } from '../../theme/tokens';

type StaticMapImageProps = {
  latitude: number;
  longitude: number;
  apiKey?: string;
};

export default function StaticMapImage({ latitude, longitude, apiKey }: StaticMapImageProps) {
  const [width, setWidth] = useState(0);
  const coordinate = `${latitude},${longitude}`;
  const imageWidth = Math.min(640, width);
  const source = apiKey && imageWidth > 0
    ? {
        uri: `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(coordinate)}&zoom=17&size=${imageWidth}x200&scale=2&maptype=roadmap&markers=${encodeURIComponent(coordinate)}&key=${encodeURIComponent(apiKey)}`,
      }
    : null;

  return (
    <View
      pointerEvents="none"
      style={styles.container}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {source && <Image source={source} resizeMode="cover" style={styles.image} accessibilityLabel="위치 지도 미리보기" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 200, borderRadius: radius.radius12, overflow: 'hidden', backgroundColor: colors.surface },
  image: { width: '100%', height: '100%' },
});
