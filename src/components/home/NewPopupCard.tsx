import { Heart } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useTranslation } from '../../hooks/useTranslation';
import { useMemo } from 'react';
import { useTheme } from '../../theme/useTheme';

const favoriteIconSize = 26;

type NewPopupCardProps = {
  width: number;
  image: ImageSourcePropType;
  period: string;
  isUpcoming?: boolean;
  title: string;
  tags: readonly string[];
  isFavorite: boolean;
  isFavoriteDisabled: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
};

export default function NewPopupCard({
  width,
  image,
  period,
  isUpcoming = false,
  title,
  tags,
  isFavorite,
  isFavoriteDisabled,
  onToggleFavorite,
  onPress,
}: NewPopupCardProps) {
  const { t } = useTranslation();
  const { resolvedTheme, themeColors } = useTheme();
  const styles = useMemo(() => ({ ...baseStyles,
    card: { ...baseStyles.card, backgroundColor: themeColors.cardBackground },
    image: resolvedTheme === 'dark' ? { ...baseStyles.image, backgroundColor: themeColors.surface } : baseStyles.image,
    openingBadge: { ...baseStyles.openingBadge, backgroundColor: themeColors.ongoingBg },
    openingText: { ...baseStyles.openingText, color: themeColors.ongoingText },
    upcomingBadge: { ...baseStyles.upcomingBadge, backgroundColor: themeColors.upcomingBg },
    upcomingText: { ...baseStyles.upcomingText, color: themeColors.upcomingText },
    title: { ...baseStyles.title, color: themeColors.textPrimary },
    tag: { ...baseStyles.tag, backgroundColor: themeColors.tagBackground },
    tagText: { ...baseStyles.tagText, color: themeColors.tagText },
  }), [themeColors, resolvedTheme]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('place.explore.viewDetails', { title })} onPress={onPress} style={[styles.card, { width }]}>
      <View style={{ width, height: width }}>
        <Image source={image} style={[styles.image, { width, height: width }]} resizeMode="cover" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(isFavorite ? 'home.card.removeFavorite' : 'home.card.addFavorite', { title })}
          accessibilityState={{ selected: isFavorite, disabled: isFavoriteDisabled }}
          disabled={isFavoriteDisabled}
          onPress={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.favoriteButton}
        >
          <View
            pointerEvents="none"
            accessible={false}
            style={styles.favoriteIcon}
          >
            <Heart
              size={favoriteIconSize}
              color={isFavorite ? "#FF5A6E" : colors.text}
              strokeWidth={2}
              fill="none"
              style={styles.favoriteIconLayer}
            />
            <Heart
              size={favoriteIconSize}
              color={isFavorite ? "#FF5A6E" : colors.background}
              strokeWidth={2}
              fill={isFavorite ? "#FF5A6E" : colors.secondaryText}
              style={styles.favoriteIconLayer}
            />
          </View>
        </Pressable>
      </View>
      <View style={[styles.openingBadge, isUpcoming && styles.upcomingBadge]}>
        <Text style={[styles.openingText, isUpcoming && styles.upcomingText]}>{period}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
      <View style={styles.tags}>
        {tags.map((tag, index) => (
          <View key={`${tag}-${index}`} style={styles.tag}>
            <Text style={styles.tagText} numberOfLines={1}>
              {tag}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
  },
  image: {
    borderRadius: radius.radius4,
  },
  favoriteButton: {
    position: "absolute",
    right: spacing.space8,
    bottom: spacing.space8,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  favoriteIcon: {
    width: favoriteIconSize,
    height: favoriteIconSize,
  },
  favoriteIconLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  openingBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.space8,
    paddingHorizontal: spacing.space6,
    paddingVertical: spacing.space2,
    borderRadius: radius.radius4,
    backgroundColor: colors.primaryLight,
  },
  openingText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  upcomingBadge: {
    backgroundColor: colors.infoLight,
  },
  upcomingText: {
    color: colors.infoDark,
  },
  title: {
    marginTop: spacing.space6,
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space4,
    marginTop: spacing.space6,
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: spacing.space6,
    paddingVertical: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: '#F3F4F6',
  },
  tagText: {
    ...typography.caption,
    color: '#4B5563',
  },
});
