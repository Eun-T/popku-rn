import { Heart, MapPin } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicPopup } from '../../lib/popups';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type PopupGridCardProps = {
  item: PublicPopup;
  width: number;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onPress?: (item: PublicPopup) => void;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function toLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatMonthDay(value: string): string {
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

export default function PopupGridCard({
  item,
  width,
  isFavorite,
  onToggleFavorite,
  onPress,
}: PopupGridCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isUpcoming = today < toLocalDate(item.startDate);
  const isEnded = today > toLocalDate(item.endDate);
  const badgeText = isUpcoming
    ? t('place.all.opensOn', { date: formatMonthDay(item.startDate) })
    : isEnded
      ? t('place.all.ended')
      : t('place.all.endsOn', { date: formatMonthDay(item.endDate) });

  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.card, { width }]}
    >
      <View style={styles.posterArea}>
        <Image source={item.coverImageUrl ? { uri: item.coverImageUrl } : placeholderImage} resizeMode="cover" style={styles.poster} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? t('place.all.removeFavorite') : t('place.all.addFavorite')}
          accessibilityState={{ selected: isFavorite }}
          onPress={(event) => {
            event.stopPropagation();
            onToggleFavorite(item.publicId);
          }}
          style={styles.favoriteButton}
        >
          <Heart
            size={22}
            color={isFavorite ? colors.primary : colors.text}
            fill={isFavorite ? colors.primary : 'none'}
          />
        </Pressable>
      </View>

      <View style={[styles.badge, isUpcoming ? styles.upcomingBadge : isEnded ? styles.endedBadge : styles.openBadge]}>
        <Text style={[styles.badgeText, isUpcoming ? styles.upcomingText : isEnded ? styles.endedText : styles.openText]}>
          {badgeText}
        </Text>
      </View>

      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>{item.name}</Text>

      <View style={styles.locationAndTag}>
        <View style={styles.location}>
          <MapPin size={14} color={colors.secondaryText} />
          <Text numberOfLines={1} style={styles.locationText}>{item.regionName}</Text>
        </View>
        {item.tags[0] && <View style={styles.tag}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.tagText}>
            {item.tags.map((tag) => tag.name).join(', ')}
          </Text>
        </View>}
      </View>

      <Text numberOfLines={1} style={styles.period}>
        {formatMonthDay(item.startDate)} ~ {formatMonthDay(item.endDate)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
  },
  posterArea: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: radius.radius8,
  },
  favoriteButton: {
    position: 'absolute',
    right: spacing.space8,
    bottom: spacing.space8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.space8,
    paddingHorizontal: spacing.space6,
    paddingVertical: spacing.space4,
    borderRadius: radius.radius4,
  },
  upcomingBadge: {
    backgroundColor: colors.primaryLight,
  },
  openBadge: {
    backgroundColor: colors.infoLight,
  },
  endedBadge: {
    backgroundColor: colors.surface,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  upcomingText: {
    color: colors.primaryDark,
  },
  openText: {
    color: colors.infoDark,
  },
  endedText: {
    color: colors.secondaryText,
  },
  title: {
    marginTop: spacing.space6,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.text,
  },
  locationAndTag: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space4,
    marginTop: spacing.space8,
    overflow: 'hidden',
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space4,
  },
  locationText: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  tag: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: colors.surface,
  },
  tagText: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  period: {
    marginTop: spacing.space6,
    ...typography.caption,
    color: colors.secondaryText,
  },
});
