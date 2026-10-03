import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { PublicPopup } from '../../lib/popups';
import SkeletonBlock from '../common/SkeletonBlock';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type TodayOpeningCarouselProps = {
  items: readonly PublicPopup[];
  width: number;
  today: string;
  loading: boolean;
  error: boolean;
  onPressPopup: (popup: PublicPopup) => void;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

const CARD_HEIGHT = 280;
const POSTER_HEIGHT = CARD_HEIGHT * 0.75;

function formatMonthDay(value: string): string {
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

export default function TodayOpeningCarousel({ items, width, today, loading, error, onPressPopup }: TodayOpeningCarouselProps) {
  const listRef = useRef<FlatList<PublicPopup>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const currentIndex = Math.min(activeIndex, items.length - 1);
  const posterWidth = Math.max(0, Math.min(POSTER_HEIGHT, width - 96));
  const goToIndex = (index: number) => {
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
    setActiveIndex(index);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>곧 끝나요</Text>
      {/* <Text style={styles.description}>놓치기 전에 다녀오세요!</Text> */}
      {items.length === 0 || width <= 0 ? loading ? (
        <View style={[styles.carousel, { width, backgroundColor: colors.surface }]}>
          <SkeletonBlock width="100%" height={CARD_HEIGHT} borderRadius={radius.radius16} />
        </View>
      ) : <Text style={styles.emptyText}>{error ? '팝업을 불러오지 못했어요.' : '5일 안에 종료되는 팝업이 없어요.'}</Text> : <View style={[styles.carousel, { width, backgroundColor: colors.surface }]}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.publicId}
          horizontal
          snapToInterval={width}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          scrollEnabled={items.length > 1}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setActiveIndex(Math.max(0, Math.min(items.length - 1, nextIndex)));
          }}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => onPressPopup(item)} style={[styles.card, { width, backgroundColor: colors.surface }]}>
              <Image source={item.coverImageUrl ? { uri: item.coverImageUrl } : placeholderImage} resizeMode="contain" style={[styles.poster, { width: posterWidth }]} />
              <View pointerEvents="none" style={styles.bottomGradient}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id="textShade" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                      <Stop offset="1" stopColor="#000000" stopOpacity="0.82" />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#textShade)" />
                </Svg>
              </View>
              <View pointerEvents="none" style={styles.caption}>
                <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.period}>
                  {Date.parse(`${item.endDate}T00:00:00Z`) === Date.parse(`${today}T00:00:00Z`)
                    ? 'D-DAY' : `D-${Math.round((Date.parse(`${item.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)}`}
                  {'  ·  '}{formatMonthDay(item.startDate)} ~ {formatMonthDay(item.endDate)}
                </Text>
              </View>
            </Pressable>
          )}
        />
        {currentIndex > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('place.explore.previous')}
            onPress={() => goToIndex(currentIndex - 1)}
            style={[styles.arrow, styles.previousArrow]}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        )}
        {currentIndex < items.length - 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('place.explore.next')}
            onPress={() => goToIndex(currentIndex + 1)}
            style={[styles.arrow, styles.nextArrow]}
          >
            <ChevronRight size={24} color={colors.text} />
          </Pressable>
        )}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.space24,
  },
  heading: {
    ...typography.titleM,
    color: colors.text,
    marginBottom: spacing.space8,
  },
  description: { ...typography.label, color: colors.secondaryText, marginBottom: spacing.space16 },
  emptyText: { ...typography.label, color: colors.secondaryText },
  carousel: {
    height: CARD_HEIGHT,
    borderRadius: radius.radius16,
    overflow: 'hidden',
  },
  card: {
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poster: {
    height: POSTER_HEIGHT,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 148,
  },
  caption: {
    position: 'absolute',
    left: spacing.space16,
    right: spacing.space16,
    bottom: spacing.space16,
    rowGap: spacing.space4,
  },
  title: {
    ...typography.titleS,
    fontWeight: '700',
    color: colors.background,
  },
  period: {
    ...typography.caption,
    color: '#F3F4F6',
  },
  arrow: {
    position: 'absolute',
    top: (CARD_HEIGHT - 40) / 2,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousArrow: {
    left: spacing.space4,
  },
  nextArrow: {
    right: spacing.space4,
  },
});
