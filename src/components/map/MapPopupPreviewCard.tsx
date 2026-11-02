import { useTranslation } from '../../hooks/useTranslation';
import { getTagDisplayName } from '../../locales/filterLabels';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import Tag from '../common/Tag';
import { getPopupDetail, type PopupMapMarker } from '../../lib/popups';
import { popupOperatingStatus } from '../../lib/popupStatus';
import { colors, radius, spacing } from '../../theme/tokens';

// PlaceWeeklySection's width/stride formula, with a larger peek for the map cards.
const PREVIEW_PEEK_RATIO = 0.14;

type MapPopupPreviewCardProps = { bottomInset: number; address?: string | null } & ({
  popup: PopupMapMarker;
  popups?: never;
  onPress: () => void;
  fixedHeight?: number;
} | {
  popup?: never;
  popups: readonly PopupMapMarker[];
  onPress?: never;
  onPopupPress: (id: string) => void;
  maxHeight: number;
  width: number;
});

export function MapPopupPreviewPager({ popups, bottomInset, maxHeight, width, onPopupPress }: {
  popups: readonly PopupMapMarker[]; bottomInset: number; maxHeight: number; width: number; onPopupPress: (id: string) => void;
}) {
  const { resolvedLanguage } = useTranslation();
  const [page, setPage] = useState(0);
  const [locations, setLocations] = useState<{ language: string; addresses: Record<string, string | null> } | null>(null);
  const popupIds = JSON.stringify(popups.map(popup => popup.id));
  // Addresses are absent from map data. Prepare them on selection, never on page changes.
  useEffect(() => {
    const controller = new AbortController();
    const ids: string[] = JSON.parse(popupIds);
    let next = 0;
    setLocations(null);
    async function loadAddresses() {
      while (!controller.signal.aborted && next < ids.length) {
        const id = ids[next++];
        let address: string | null = null;
        try {
          const detail = await getPopupDetail(id, controller.signal, undefined, resolvedLanguage);
          address = detail.address?.trim() || null;
        } catch { /* Keep the existing missing-address fallback without retrying on swipe. */ }
        if (!controller.signal.aborted) setLocations(current => ({
          language: resolvedLanguage, addresses: { ...current?.addresses, [id]: address },
        }));
      }
    }
    void loadAddresses();
    if (ids.length > 1) void loadAddresses();
    return () => controller.abort();
  }, [popupIds, resolvedLanguage]);
  const hasMultiple = popups.length > 1;
  const gap = hasMultiple ? spacing.space12 : 0;
  const cardWidth = Math.max(1, (width - gap) / (1 + (hasMultiple ? PREVIEW_PEEK_RATIO : 0)));
  const stride = cardWidth + gap;
  const lastOffset = Math.max(0, (popups.length - 1) * stride);
  const gesture = useRef({ x: 0, y: 0, blocked: false, scrolling: false, page: 0, offset: 0 });
  // Use the original card's image-led height and padding, without speculative text or footer space.
  const height = Math.max(0, Math.min(maxHeight, styles.image.height
    + styles.card.paddingTop + styles.card.borderTopWidth + 8 + bottomInset));
  const updatePage = (offset: number) => {
    const boundedOffset = Math.max(0, Math.min(lastOffset, offset));
    gesture.current.offset = boundedOffset;
    const next = Math.min(popups.length - 1, Math.round(boundedOffset / stride));
    if (gesture.current.page !== next) {
      gesture.current.page = next;
      setPage(next);
    }
  };
  return (
    <View
      style={[styles.previewPager, { height, width }]}
      onTouchStart={event => {
        gesture.current.x = event.nativeEvent.pageX;
        gesture.current.y = event.nativeEvent.pageY;
        gesture.current.blocked = gesture.current.scrolling;
      }}
      onTouchMove={event => {
        if (Math.abs(event.nativeEvent.pageX - gesture.current.x) > 8
          || Math.abs(event.nativeEvent.pageY - gesture.current.y) > 8) gesture.current.blocked = true;
      }}
    >
      <FlatList
        testID="map-popup-preview-pager"
        style={{ flexGrow: 0, height }}
        data={popups}
        extraData={[resolvedLanguage, locations, page]}
        keyExtractor={popup => popup.id}
        horizontal
        pagingEnabled={false}
        snapToOffsets={popups.map((_, index) => index * stride)}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        initialNumToRender={hasMultiple ? 2 : 1}
        maxToRenderPerBatch={2}
        windowSize={3}
        scrollEnabled={popups.length > 1}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingRight: width - cardWidth }}
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        getItemLayout={(_, index) => ({ length: cardWidth, offset: stride * index, index })}
        bounces={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => updatePage(nativeEvent.contentOffset.x)}
        onScrollBeginDrag={() => { gesture.current.scrolling = true; gesture.current.blocked = true; }}
        onScrollEndDrag={({ nativeEvent }) => {
          gesture.current.scrolling = Math.abs(nativeEvent.velocity?.x ?? 0) > 0.01;
          updatePage(nativeEvent.contentOffset.x);
        }}
        onMomentumScrollBegin={() => { gesture.current.scrolling = true; gesture.current.blocked = true; }}
        onMomentumScrollEnd={({ nativeEvent }) => {
          gesture.current.scrolling = false;
          updatePage(nativeEvent.contentOffset.x);
        }}
        renderItem={({ item, index }) => (
          <View style={{ width: cardWidth, height }} accessibilityElementsHidden={index !== page}
            importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
            <MapPopupPreviewCard popup={item} bottomInset={bottomInset} fixedHeight={height}
              address={locations?.language === resolvedLanguage ? locations.addresses[item.id] ?? null : null} onPress={() => {
              const visible = index * stride < gesture.current.offset + width
                && index * stride + cardWidth > gesture.current.offset;
              if (!gesture.current.blocked && !gesture.current.scrolling && visible) onPopupPress(item.id);
            }} />
          </View>
        )}
      />
    </View>
  );
}

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function displayDate(value: string | null, includeYear: boolean): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  return includeYear ? `${year.slice(-2)}.${month}.${day}` : `${month}.${day}`;
}

export default function MapPopupPreviewCard(props: MapPopupPreviewCardProps) {
  const { popup, bottomInset } = props;
  const { t, resolvedLanguage } = useTranslation();
  const [location, setLocation] = useState<{
    id: string; language: string; address: string | null;
  } | null>(null);

  useEffect(() => {
    if (!popup || props.address !== undefined) return;
    const controller = new AbortController();
    getPopupDetail(popup.id, controller.signal, undefined, resolvedLanguage).then(detail => {
      if (!controller.signal.aborted) setLocation({
        id: popup.id, language: resolvedLanguage,
        address: detail.address?.trim() || null,
      });
    }).catch(() => {
      if (!controller.signal.aborted) setLocation(null);
    });
    return () => controller.abort();
  }, [popup?.id, props.address, resolvedLanguage]);

  if (props.popups) {
    const uniquePopups = [...new Map(props.popups.map(item => [item.id, item])).values()];
    if (uniquePopups.length === 0) return null;
    return <MapPopupPreviewPager key={JSON.stringify([props.width, uniquePopups.map(item => item.id)])} {...props} popups={uniquePopups} />;
  }
  if (!popup) return null;

  const currentLocation = location?.id === popup.id && location.language === resolvedLanguage ? location : null;
  const locationText = props.address !== undefined ? props.address : currentLocation?.address;
  const status = popupOperatingStatus(popup.startDate, popup.endDate);
  const differentYears = !!popup.startDate && !!popup.endDate
    && popup.startDate.slice(0, 4) !== popup.endDate.slice(0, 4);
  const period = [displayDate(popup.startDate, true), displayDate(popup.endDate, differentYears)]
    .filter(Boolean).join(' ~ ') || t('place.detail.schedulePending');
  const statusColor = status === '운영 중' ? colors.primaryDark
    : status === '오픈 예정' ? colors.infoDark
      : colors.secondaryText;
  const statusBackground = status === '운영 중' ? colors.primaryLight
    : status === '오픈 예정' ? colors.infoLight : colors.surface;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[styles.card, { paddingBottom: 8 + bottomInset }, props.fixedHeight !== undefined && { height: props.fixedHeight }]}
    >
      <Image
        source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage}
        resizeMode="cover"
        style={styles.image}
      />
      <View style={props.fixedHeight !== undefined ? [styles.content, {
        maxHeight: Math.max(0, props.fixedHeight - styles.card.paddingTop - styles.card.borderTopWidth - 8 - bottomInset),
      }] : styles.content}>
        <View style={styles.statusRow}>
          {status && (
            <View style={[styles.statusChip, { backgroundColor: statusBackground }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{t(status === '운영 중' ? 'place.all.card.ongoing' : status === '오픈 예정' ? 'place.all.card.upcoming' : 'place.all.card.ended')}</Text>
            </View>
          )}
          <View style={styles.tags}>
            {(popup.tags ?? []).slice(0, 2).map((tag) => (
              <Tag key={tag.id} label={getTagDisplayName(tag, resolvedLanguage)} />
            ))}
          </View>
        </View>
        <View style={props.fixedHeight !== undefined ? [styles.heading, styles.pagedShrink] : styles.heading}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
            {popup.name}
          </Text>
          <View style={props.fixedHeight !== undefined ? [styles.locationPeriod, styles.pagedShrink] : styles.locationPeriod}>
            {locationText ? <Text style={props.fixedHeight !== undefined ? [styles.location, styles.pagedShrink] : styles.location} numberOfLines={props.fixedHeight !== undefined ? 2 : undefined} ellipsizeMode={props.fixedHeight !== undefined ? 'tail' : undefined}>{locationText}</Text> : null}
            <Text numberOfLines={1} style={styles.period}>{period}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  previewPager: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  pagedShrink: { flexShrink: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: 96,
    height: 128,
    borderRadius: radius.radius8,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: colors.text,
  },
  location: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.secondaryText,
  },
  heading: {
    gap: 2,
  },
  locationPeriod: {
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusChip: {
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.radius4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  period: {
    flexShrink: 1,
    color: colors.secondaryText,
    fontSize: 12,
  },
  tags: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    overflow: 'hidden',
    height: 24,
  },
});
