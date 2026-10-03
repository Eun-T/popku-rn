import { Heart } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme/tokens';

type PopupRankingCardProps = {
  rank: number;
  image: ImageSourcePropType;
  title: string;
  period: string;
  tags: readonly string[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
};

export default function PopupRankingCard({
  rank,
  image,
  title,
  period,
  tags,
  isFavorite,
  onToggleFavorite,
  onPress,
}: PopupRankingCardProps) {
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} 상세 보기`} onPress={onPress} style={styles.detailButton}>
        <View style={styles.imageFrame}>
          <Image source={image} style={styles.image} resizeMode="cover" />
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          <Text style={styles.period}>{period}</Text>
          <View style={styles.tags}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? `${title} 찜 취소` : `${title} 찜하기`}
        accessibilityState={{ selected: isFavorite }}
        onPress={onToggleFavorite}
        style={styles.favoriteButton}
      >
        <Heart
          size={22}
          color={isFavorite ? colors.primary : colors.text}
          fill={isFavorite ? colors.primary : 'none'}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  detailButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.space12,
  },
  imageFrame: {
    width: 88,
    height: 108,
    borderRadius: radius.radius8,
    overflow: 'hidden',
  },
  image: {
    width: 88,
    height: 108,
  },
  rankBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: radius.radius8,
    backgroundColor: colors.primaryDark,
  },
  rankText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.background,
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.space20,
  },
  title: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  period: {
    marginTop: spacing.space8,
    ...typography.caption,
    color: colors.secondaryText,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space4,
    marginTop: spacing.space8,
  },
  tag: {
    maxWidth: '100%',
    borderRadius: radius.radius4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.space6,
    paddingVertical: spacing.space4,
  },
  tagText: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  favoriteButton: {
    width: 44,
    height: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
