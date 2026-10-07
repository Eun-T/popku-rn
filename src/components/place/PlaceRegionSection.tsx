import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { regionFilters } from '../../constants/placeFilters';
import { placeRegionSectionTitleKey, type PlaceRegionCardItem, type PlaceRegionPage } from '../../constants/placeRegionMocks';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type PlaceRegionSectionProps = {
  pages: readonly PlaceRegionPage[];
  width: number;
  onPress: (item: PlaceRegionCardItem) => void;
  isActive?: boolean;
};

const CARD_GAP = 6;
const CARD_ASPECT_RATIO = 1.6;
const PAGE_GAP = 16;
const DESCRIPTION_HEIGHT = 20;
const DESCRIPTION_BOTTOM_GAP = 16;
const regionLabelKeys = new Map(regionFilters.map((region) => [region.id, region.labelKey] as const));

export default function PlaceRegionSection({ pages, width, onPress, isActive = true }: PlaceRegionSectionProps) {
  const listRef = useRef<FlatList<PlaceRegionPage>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const buttonTargetRef = useRef<number | null>(null);
  const [pageWidth, setPageWidth] = useState(width);
  const pageStride = pageWidth + PAGE_GAP;
  // Preserve the existing card width while changing only the gaps.
  const cardWidth = (pageWidth - 10) / 2;
  const pageHeight = DESCRIPTION_HEIGHT + DESCRIPTION_BOTTOM_GAP + (cardWidth / CARD_ASPECT_RATIO) * 2 + CARD_GAP;

  useEffect(() => {
    if (!isActive) return;
    // Restore the offset after hiding or resizing, without replacing the list.
    buttonTargetRef.current = activeIndexRef.current;
    listRef.current?.scrollToOffset({ offset: activeIndexRef.current * pageStride, animated: false });
  }, [isActive, pageStride]);

  if (pages.length === 0 || cardWidth <= 0) return null;

  const clampIndex = (index: number) => Math.max(0, Math.min(pages.length - 1, index));
  const updateActiveIndex = (index: number) => {
    if (activeIndexRef.current === index) return;
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  const goToPage = (index: number) => {
    buttonTargetRef.current = index;
    listRef.current?.scrollToOffset({ offset: index * pageStride, animated: true });
    updateActiveIndex(index);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t(placeRegionSectionTitleKey)}</Text>
      <View
        style={styles.viewport}
        onLayout={(event) => {
          const measuredWidth = event.nativeEvent.layout.width;
          if (!isActive || measuredWidth <= 0) return;
          if (measuredWidth !== pageWidth) {
            setPageWidth(measuredWidth);
          } else {
            buttonTargetRef.current = activeIndexRef.current;
            listRef.current?.scrollToOffset({ offset: activeIndexRef.current * pageStride, animated: false });
          }
        }}
      >
        <FlatList
          ref={listRef}
          data={pages}
          keyExtractor={(page) => page.id}
          horizontal
          snapToOffsets={[0, pageStride]}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          scrollEnabled={pages.length > 1}
          showsHorizontalScrollIndicator={false}
          // Keep both local-asset pages rendered when Explore has zero layout size.
          initialNumToRender={pages.length}
          removeClippedSubviews={false}
          ItemSeparatorComponent={() => <View style={styles.pageGap} />}
          getItemLayout={(_, index) => ({ length: pageWidth, offset: pageStride * index, index })}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => { if (isActive) buttonTargetRef.current = null; }}
          onScroll={(event) => {
            if (!isActive) return;
            const offset = event.nativeEvent.contentOffset.x;
            if (buttonTargetRef.current !== null) {
              if (Math.abs(offset - buttonTargetRef.current * pageStride) < 1) buttonTargetRef.current = null;
              return;
            }
            updateActiveIndex(clampIndex(Math.round(offset / pageStride)));
          }}
          onMomentumScrollEnd={(event) => {
            if (!isActive) return;
            const offset = event.nativeEvent.contentOffset.x;
            if (buttonTargetRef.current !== null && Math.abs(offset - buttonTargetRef.current * pageStride) >= 1) return;
            buttonTargetRef.current = null;
            updateActiveIndex(clampIndex(Math.round(offset / pageStride)));
          }}
          style={{ width: pageWidth, height: pageHeight }}
          renderItem={({ item: page }) => (
            <View style={{ width: pageWidth, height: pageHeight }}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.description}>
                {t(page.descriptionKey)}
              </Text>
              <View style={styles.grid}>
                {page.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(regionLabelKeys.get(item.id) ?? item.id)}
                    onPress={() => onPress(item)}
                    style={[styles.card, { width: cardWidth }]}
                  >
                    <Image source={item.image} contentFit="cover" cachePolicy="memory-disk" style={styles.image} />
                    <View pointerEvents="none" style={styles.overlay} />
                    <Text numberOfLines={1} style={styles.label}>
                      {t(regionLabelKeys.get(item.id) ?? item.id)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      </View>
      <View style={styles.pagination}>
        {pages.map((page, index) => (
          <Pressable
            key={page.id}
            accessibilityRole="button"
            accessibilityLabel={t(page.descriptionKey)}
            accessibilityState={{ selected: index === activeIndex }}
            onPress={() => goToPage(index)}
            style={styles.paginationTarget}
          >
            <View style={[styles.dot, index === activeIndex && styles.activeDot]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.space32,
  },
  heading: {
    ...typography.titleM,
    color: colors.text,
    marginBottom: spacing.space4 * 0.5,
  },
  viewport: {
    width: '100%',
    overflow: 'hidden',
  },
  pageGap: {
    width: PAGE_GAP,
  },
  description: {
    ...typography.label,
    color: colors.secondaryText,
    height: DESCRIPTION_HEIGHT,
    marginBottom: DESCRIPTION_BOTTOM_GAP,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: CARD_GAP,
    rowGap: CARD_GAP,
  },
  card: {
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.radius8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  label: {
    ...typography.titleS,
    fontWeight: '700',
    color: colors.background,
    marginLeft: spacing.space12,
    marginRight: spacing.space12,
    marginBottom: spacing.space12,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.space12,
  },
  paginationTarget: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  activeDot: {
    width: 18,
    backgroundColor: colors.text,
  },
});
