import { ChevronRight, Heart, MapPin, MessageCircle, Star, UserRound } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CommunityPost } from '../../constants/communityPostMocks';
import { t } from '../../locales';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type Props = {
  post: CommunityPost;
  onPressPlace?: (placeId: string) => void;
};

function formatTime(minutesAgo: number): string {
  if (minutesAgo < 60) return t('community.time.minutesAgo', { count: minutesAgo });
  if (minutesAgo < 1440) return t('community.time.hoursAgo', { count: Math.floor(minutesAgo / 60) });
  return t('community.time.daysAgo', { count: Math.floor(minutesAgo / 1440) });
}

export default function CommunityPostItem({ post, onPressPlace }: Props) {
  const cover = post.photos[0];

  return (
    <View style={styles.post}>
      <View style={styles.profileRow}>
        {post.avatar ? (
          <Image source={post.avatar} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={styles.avatarFallback}><UserRound size={22} color={communityColors.secondaryText} /></View>
        )}
        <View style={styles.profileText}>
          <Text style={styles.nickname} numberOfLines={1}>{post.nickname}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatTime(post.minutesAgo)} · {t(post.regionKey)}
          </Text>
        </View>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{t(`community.category.${post.category}`)}</Text>
        </View>
      </View>

      {post.place && (
        <View style={styles.placeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(post.place.nameKey)}
            disabled={!onPressPlace}
            onPress={() => onPressPlace?.(post.place!.id)}
            style={styles.placeLink}
          >
            <MapPin size={16} color={communityColors.placeLink} />
            <Text style={styles.placeName} numberOfLines={1}>{t(post.place.nameKey)}</Text>
            <ChevronRight size={16} color={communityColors.placeLink} />
          </Pressable>
          {post.category === 'review' && post.rating !== undefined && (
            <View style={styles.rating}>
              <Star size={16} color="#FACC15" fill="#FACC15" />
              <Text style={styles.ratingText}>{post.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.bodyRow}>
        <Text style={styles.body} numberOfLines={3} ellipsizeMode="tail">{t(post.bodyKey)}</Text>
        {cover && (
          <View style={styles.coverWrap}>
            <Image source={cover} style={styles.cover} resizeMode="cover" />
            {post.photos.length > 1 && (
              <View style={styles.photoCount}><Text style={styles.photoCountText}>{post.photos.length}</Text></View>
            )}
          </View>
        )}
      </View>

      <View style={styles.engagementRow}>
        <View style={styles.engagementGroup}>
          <View style={styles.engagementItem}>
            <Heart size={16} color={communityColors.secondaryText} />
            <Text style={styles.engagementText}>{post.likes}</Text>
          </View>
          <View style={styles.engagementItem}>
            <MessageCircle size={16} color={communityColors.secondaryText} />
            <Text style={styles.engagementText}>{post.comments}</Text>
          </View>
        </View>
        <Text style={styles.engagementText}>{t('community.views', { count: post.views })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { paddingVertical: spacing.space24 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: radius.full },
  avatarFallback: {
    width: 40, height: 40, borderRadius: radius.full, backgroundColor: communityColors.mutedSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  profileText: { flex: 1, minWidth: 0, marginLeft: spacing.space12, marginRight: spacing.space8 },
  nickname: { ...typography.label, fontWeight: '600', color: communityColors.text },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  typeBadge: {
    height: 24, paddingHorizontal: spacing.space8, borderRadius: radius.full,
    backgroundColor: communityColors.mutedSurface, alignItems: 'center', justifyContent: 'center',
  },
  typeText: { ...typography.caption, color: communityColors.charcoal },
  placeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.space12 },
  placeLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  placeName: { flexShrink: 1, ...typography.label, color: communityColors.placeLink },
  rating: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4, marginLeft: spacing.space8 },
  ratingText: { ...typography.label, fontWeight: '600', color: communityColors.text },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.space12, columnGap: spacing.space12 },
  body: { flex: 1, fontSize: 15, lineHeight: 23, color: communityColors.text },
  coverWrap: { width: 84, height: 84 },
  cover: { width: 84, height: 84, borderRadius: radius.radius8 },
  photoCount: {
    position: 'absolute', top: spacing.space4, right: spacing.space4, minWidth: 20, height: 20,
    paddingHorizontal: spacing.space4, borderRadius: radius.radius4, backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoCountText: { fontSize: 11, fontWeight: '600', color: communityColors.white },
  engagementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.space16,
  },
  engagementGroup: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space16 },
  engagementItem: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  engagementText: { ...typography.caption, color: communityColors.secondaryText },
});
