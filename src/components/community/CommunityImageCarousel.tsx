import { useTranslation } from '../../hooks/useTranslation';
import { useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';

import { communityColors } from '../../theme/communityColors';
import { colors, radius, spacing } from '../../theme/tokens';

type Props = { images: string[] };

export default function CommunityImageCarousel({ images }: Props) {
  const { t, resolvedLanguage } = useTranslation();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (!images.length) return null;
  return (
    <View>
      <View style={styles.viewport} onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== width) { setWidth(nextWidth); setPage(0); }
      }}>
        {width > 0 ? <FlatList
          key={width}
          data={images}
          extraData={resolvedLanguage}
          horizontal
          pagingEnabled
          bounces={false}
          scrollEnabled={images.length > 1}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, index) => String(index)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item, index }) => <Image source={{ uri: item }}
            accessibilityLabel={t('community.detail.image', { index: index + 1 })}
            style={{ width, height: width }} resizeMode="contain" />}
          scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => {
            setPage(Math.max(0, Math.min(images.length - 1, Math.round(nativeEvent.contentOffset.x / width))));
          }}
        /> : null}
      </View>
      {images.length > 1 ? <View style={styles.indicator}>
        {images.map((_, index) => <View key={index} accessibilityState={{ selected: index === page }}
          style={[styles.dot, index === page && styles.activeDot]} />)}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: '100%', aspectRatio: 1, borderRadius: radius.radius8, overflow: 'hidden', backgroundColor: communityColors.mutedSurface },
  indicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: spacing.space6, marginTop: spacing.space12 },
  dot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: communityColors.divider },
  activeDot: { width: 18, backgroundColor: colors.paginationActive },
});
