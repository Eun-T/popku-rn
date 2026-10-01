import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { regionFilters } from '../../constants/placeFilters';
import { placeRegionSectionTitleKey, type PlaceRegionCardItem, type PlaceRegionPage } from '../../constants/placeRegionMocks';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type PlaceRegionSectionProps = {
  pages: readonly PlaceRegionPage[];
  width: number;
  onPress: (item: PlaceRegionCardItem) => void;
};

const CARD_GAP = 6;
const PAGE_GAP = 16;
const DESCRIPTION_HEIGHT = 20;
const DESCRIPTION_BOTTOM_GAP = 16;
const regionLabelKeys = new Map(regionFilters.map((region) => [region.id, region.labelKey] as const));

export default function PlaceRegionSection({ pages, width, onPress }: PlaceRegionSectionProps) {
  const listRef = useRef<FlatList<PlaceRegionPage>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(width);
  const scrollOffsetRef = useRef(0);
  const dragStartIndexRef = useRef(0);
  const targetIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageStride = pageWidth + PAGE_GAP;
  // Preserve the existing card width while changing only the gaps.
  const cardWidth = (pageWidth - 10) / 2;
  const pageHeight = DESCRIPTION_HEIGHT + DESCRIPTION_BOTTOM_GAP + (cardWidth / 1.8) * 2 + CARD_GAP;

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  if (pages.length === 0 || cardWidth <= 0) return null;

  const clampIndex = (index: number) => Math.max(0, Math.min(pages.length - 1, index));

  const settlePage = () => {
    if (isDraggingRef.current) return;
    const startIndex = dragStartIndexRef.current;
    const distance = scrollOffsetRef.current - startIndex * pageStride;
    const direction = distance >= pageWidth / 2 ? 1 : distance <= -pageWidth / 2 ? -1 : 0;
    const index = clampIndex(targetIndexRef.current ?? startIndex + direction);
    const offset = index * pageStride;
    if (Math.abs(scrollOffsetRef.current - offset) > 1) {
      listRef.current?.scrollToOffset({ offset, animated: true });
    } else {
      targetIndexRef.current = null;
      dragStartIndexRef.current = index;
      setActiveIndex(index);
    }
  };

  const scheduleSettle = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(settlePage, 120);
  };

  const goToPage = (index: number) => {
    targetIndexRef.current = index;
    listRef.current?.scrollToOffset({ offset: index * pageStride, animated: true });
    scheduleSettle();
  };

  const beginDrag = () => {
    if (isDraggingRef.current) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    isDraggingRef.current = true;
    dragStartIndexRef.current = clampIndex(Math.round(scrollOffsetRef.current / pageStride));
    targetIndexRef.current = null;
  };

  const finishDrag = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const startIndex = dragStartIndexRef.current;
    const distance = scrollOffsetRef.current - startIndex * pageStride;
    const direction = distance >= pageWidth / 2 ? 1 : distance <= -pageWidth / 2 ? -1 : 0;
    goToPage(clampIndex(startIndex + direction));
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t(placeRegionSectionTitleKey)}</Text>
      <View
        style={styles.viewport}
        onLayout={(event) => {
          const measuredWidth = event.nativeEvent.layout.width;
          if (measuredWidth > 0 && measuredWidth !== pageWidth) {
            scrollOffsetRef.current = activeIndex * (measuredWidth + PAGE_GAP);
            dragStartIndexRef.current = activeIndex;
            targetIndexRef.current = null;
            setPageWidth(measuredWidth);
          }
        }}
      >
        <FlatList
          key={pageWidth}
          ref={listRef}
          data={pages}
          keyExtractor={(page) => page.id}
          horizontal
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          scrollEnabled={pages.length > 1}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={activeIndex}
          ItemSeparatorComponent={() => <View style={styles.pageGap} />}
          getItemLayout={(_, index) => ({ length: pageWidth, offset: pageStride * index, index })}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
            if (!isDraggingRef.current) scheduleSettle();
          }}
          onScrollBeginDrag={beginDrag}
          onScrollEndDrag={finishDrag}
          onTouchStart={Platform.OS === 'web' ? beginDrag : undefined}
          onTouchEnd={Platform.OS === 'web' ? finishDrag : undefined}
          onMomentumScrollEnd={settlePage}
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
                    <Image source={item.image} resizeMode="cover" style={styles.image} />
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
    marginBottom: spacing.space8,
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
    aspectRatio: 1.8,
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
