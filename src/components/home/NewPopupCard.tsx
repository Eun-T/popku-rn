import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme/tokens';

type NewPopupCardProps = {
  width: number;
  image: ImageSourcePropType;
  period: string;
  title: string;
  tags: readonly string[];
  onPress: () => void;
};

export default function NewPopupCard({
  width,
  image,
  period,
  title,
  tags,
  onPress,
}: NewPopupCardProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} 상세 보기`} onPress={onPress} style={[styles.card, { width }]}>
      <Image source={image} style={[styles.image, { width, height: width }]} resizeMode="cover" />
      <View style={styles.openingBadge}>
        <Text style={styles.openingText}>{period}</Text>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
  },
  image: {
    borderRadius: radius.radius4,
  },
  openingBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.space8,
    paddingHorizontal: spacing.space8,
    paddingVertical: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: colors.primaryLight,
  },
  openingText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  title: {
    marginTop: spacing.space8,
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space4,
    marginTop: spacing.space8,
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: spacing.space6,
    paddingVertical: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: colors.surface,
  },
  tagText: {
    ...typography.caption,
    color: colors.secondaryText,
  },
});
