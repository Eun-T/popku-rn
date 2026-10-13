import { useTranslation } from '../../hooks/useTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useIntroductionImage } from '../../hooks/useIntroductionImage';
import { introductionImageId, type IntroductionScope } from '../../lib/introductionImageRecovery';

import { colors, radius, spacing } from '../../theme/tokens';

type IntroductionImageCarouselProps = {
  images: readonly string[];
  width: number;
  popupId?: string;
  countryCode?: 'KR' | 'JP';
  fetchedAt?: number;
};

type ImageDimensions = { width: number; height: number };

const validSize = (width: number, height: number) => Number.isFinite(width) && Number.isFinite(height)
  && width > 0 && height > 0 && Number.isFinite(height / width);
const heightFor = (size: ImageDimensions | undefined, width: number) => {
  const height = size ? Math.min(size.width, width) * size.height / size.width : width * 3 / 4;
  return Number.isFinite(height) && height > 0 ? height : width * 3 / 4;
};

function IntroductionSlide({ uri, width, size, scope, fetchedAt, onSize }: {
  uri: string; width: number; size?: ImageDimensions; scope?: IntroductionScope; fetchedAt: number;
  onSize: (width: number, height: number) => void;
}) {
  const { t } = useTranslation();
  const cover = useIntroductionImage(uri, scope, fetchedAt);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const imageWidth = size ? Math.min(size.width, width) : width, imageHeight = heightFor(size, width);
  return <View style={[styles.slide, { width }]}>
    {cover.failed || !uri.trim() ? <View style={[styles.placeholder, { width, height: imageHeight }]}>
      <Text style={styles.errorText}>{t('place.detail.imageFailed')}</Text>
      {cover.canRetry && <Pressable testID="introduction-image-retry" accessibilityRole="button"
        accessibilityLabel={t('home.card.retry')} accessibilityState={{ disabled: cover.busy }} disabled={cover.busy}
        onPress={event => { event.stopPropagation(); cover.retry(); }} style={styles.retry}>
        <Text style={styles.errorText}>{t('home.card.retry')}</Text>
      </Pressable>}
    </View> : <>
      <Image key={cover.imageKey} source={{ uri: cover.uri, ...(cover.cacheKey ? { cacheKey: cover.cacheKey } : {}) }}
        contentFit="contain" cachePolicy="memory-disk" style={[styles.image, { width: imageWidth, height: imageHeight }]}
        onError={cover.onError} onLoad={event => {
          if (!cover.isCurrent()) return;
          cover.onLoad(); setLoadedKey(cover.imageKey);
          if (validSize(event.source.width, event.source.height)) onSize(event.source.width, event.source.height);
        }} />
      {!size && loadedKey !== cover.imageKey && <ActivityIndicator pointerEvents="none" style={styles.loading} />}
    </>}
  </View>;
}

export default function IntroductionImageCarousel({ images, width, popupId, countryCode, fetchedAt = 0 }: IntroductionImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { resolvedLanguage } = useTranslation();
  const scope = popupId && countryCode ? { popupId, countryCode, languageCode: resolvedLanguage } : undefined;
  const scopeId = JSON.stringify(scope);
  // Stable S3 object + occurrence, not the signature. Duplicate URLs still get unique slide keys.
  const keys = images.map((uri, index) => {
    const id = introductionImageId(uri);
    return id ? `${id}:${images.slice(0, index).filter(value => introductionImageId(value) === id).length}` : `unidentified:${index}`;
  });
  const dimensionKeys = keys.map((key, index) => introductionImageId(images[index]) ? key : JSON.stringify([key, images[index]]));
  const [dimensions, setDimensions] = useState<Record<string, ImageDimensions>>({});
  const latest = useRef({ scopeId, keys: dimensionKeys });
  useEffect(() => { latest.current = { scopeId, keys: dimensionKeys }; }, [scopeId, dimensionKeys]);
  const recordSize = useCallback((key: string, imageWidth: number, imageHeight: number) => {
    if (latest.current.scopeId !== scopeId || !latest.current.keys.includes(key) || !validSize(imageWidth, imageHeight)) return;
    setDimensions(current => current[key]?.width === imageWidth && current[key]?.height === imageHeight
      ? current : { ...current, [key]: { width: imageWidth, height: imageHeight } });
  }, [scopeId]);
  useEffect(() => {
    setActiveIndex(index => Math.max(0, Math.min(images.length - 1, index)));
  }, [images.length]);
  if (images.length === 0 || !Number.isFinite(width) || width <= 0) return null;
  const displayHeight = heightFor(dimensions[dimensionKeys[activeIndex]], width);

  return (
    <View style={[styles.viewport, { width, height: displayHeight }]}>
      <FlatList
        data={images}
        extraData={resolvedLanguage}
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
        keyExtractor={(_, index) => keys[index]}
        onScroll={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIndex(Math.max(0, Math.min(images.length - 1, index)));
        }}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          return <IntroductionSlide uri={item} width={width} size={dimensions[dimensionKeys[index]]} scope={scope} fetchedAt={fetchedAt}
            onSize={(imageWidth, imageHeight) => recordSize(dimensionKeys[index], imageWidth, imageHeight)} />;
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
  retry: { marginTop: spacing.space8, paddingHorizontal: spacing.space8, paddingVertical: spacing.space6, borderRadius: radius.radius4, backgroundColor: colors.background },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  pageBadge: { position: 'absolute', right: spacing.space12, bottom: spacing.space12, paddingHorizontal: spacing.space8, paddingVertical: spacing.space4, borderRadius: radius.full, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  pageText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: '#FFFFFF' },
});
