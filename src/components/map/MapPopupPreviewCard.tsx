import { useTranslation } from '../../hooks/useTranslation';
import { getTagDisplayName } from '../../locales/filterLabels';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import Tag from '../common/Tag';
import { getPopupDetail, type PopupMapMarker } from '../../lib/popups';
import { popupOperatingStatus } from '../../lib/popupStatus';
import { colors, radius } from '../../theme/tokens';

type MapPopupPreviewCardProps = {
  popup: PopupMapMarker;
  onPress: () => void;
  bottomInset: number;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function displayDate(value: string | null, includeYear: boolean): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  return includeYear ? `${year.slice(-2)}.${month}.${day}` : `${month}.${day}`;
}

export default function MapPopupPreviewCard({ popup, onPress, bottomInset }: MapPopupPreviewCardProps) {
  const { t, resolvedLanguage } = useTranslation();
  const [location, setLocation] = useState<{
    id: string; language: string; address: string | null;
  } | null>(null);

  useEffect(() => {
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
  }, [popup.id, resolvedLanguage]);

  const currentLocation = location?.id === popup.id && location.language === resolvedLanguage ? location : null;
  const locationText = currentLocation?.address;
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
      onPress={onPress}
      style={[styles.card, { paddingBottom: 8 + bottomInset }]}
    >
      <Image
        source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage}
        resizeMode="cover"
        style={styles.image}
      />
      <View style={styles.content}>
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
        <View style={styles.heading}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
            {popup.name}
          </Text>
          <View style={styles.locationPeriod}>
            {locationText ? <Text style={styles.location}>{locationText}</Text> : null}
            <Text numberOfLines={1} style={styles.period}>{period}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
