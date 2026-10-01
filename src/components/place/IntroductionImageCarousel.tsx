import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';

type IntroductionImageCarouselProps = {
  images: readonly string[];
  width: number;
};

type ImageDimensions = { width: number; height: number };

export default function IntroductionImageCarousel({ images, width }: IntroductionImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dimensions, setDimensions] = useState<(ImageDimensions | null | undefined)[]>([]);

  useEffect(() => {
    let cancelled = false;
    setDimensions(images.map(() => undefined));
    images.forEach((uri, index) => {
      Image.getSize(
        uri,
        (imageWidth, imageHeight) => {
          if (cancelled) return;
          const size = imageWidth > 0 && imageHeight > 0 ? { width: imageWidth, height: imageHeight } : null;
          setDimensions((current) => current.map((item, itemIndex) => itemIndex === index ? size : item));
        },
        () => {
          if (!cancelled) setDimensions((current) => current.map((item, itemIndex) => itemIndex === index ? null : item));
        },
      );
    });
    return () => { cancelled = true; };
  }, [images]);

  if (images.length === 0 || width <= 0) return null;

  const activeDimensions = dimensions[activeIndex];
  const displayHeight = activeDimensions
    ? Math.min(activeDimensions.width, width) * activeDimensions.height / activeDimensions.width
    : width * 3 / 4;

  return (
    <View style={[styles.viewport, { width, height: displayHeight }]}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        snapToInterval={width}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        scrollEnabled={images.length > 1}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        keyExtractor={(image, index) => `${index}-${image}`}
        onScroll={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIndex(Math.max(0, Math.min(images.length - 1, index)));
        }}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const size = dimensions[index];
          const imageWidth = size ? Math.min(size.width, width) : width;
          const imageHeight = size ? imageWidth * size.height / size.width : width * 3 / 4;
          return (
            <View style={[styles.slide, { width }]}>
              {size ? (
                <Image
                  source={{ uri: item }}
                  resizeMode="contain"
                  style={[styles.image, { width: imageWidth, height: imageHeight }]}
                  onError={() => setDimensions((current) => current.map((entry, itemIndex) => itemIndex === index ? null : entry))}
                />
              ) : (
                <View style={[styles.placeholder, { width, height: imageHeight }]}>
                  {size === null ? <Text style={styles.errorText}>이미지를 불러올 수 없습니다</Text> : <ActivityIndicator />}
                </View>
              )}
            </View>
          );
        }}
      />
      {images.length > 1 && (
        <View pointerEvents="none" style={styles.pageBadge}>
          <Text style={styles.pageText}>{activeIndex + 1} / {images.length}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { borderRadius: radius.radius12, overflow: 'hidden' },
  slide: { alignItems: 'center' },
  image: { borderRadius: radius.radius12 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: colors.secondaryText },
  pageBadge: { position: 'absolute', right: spacing.space12, bottom: spacing.space12, paddingHorizontal: spacing.space8, paddingVertical: spacing.space4, borderRadius: radius.full, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  pageText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: '#FFFFFF' },
});
