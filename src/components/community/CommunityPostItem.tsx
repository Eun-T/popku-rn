import { ChevronRight, Heart, MapPin, MessageCircle, MoreHorizontal, Star, UserRound } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import type { CommunityFeedItem } from '../../lib/community';
import { formatCommunityTime } from '../../lib/communityTime';
import { t } from '../../locales';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type Props = {
  post: CommunityFeedItem;
  now?: number;
  onPressPlace?: (placeId: string) => void;
  onPressPost?: () => void;
  onPressReview?: () => void;
  onPressLike?: () => void;
};

export default function CommunityPostItem({ post, now = Date.now(), onPressPlace, onPressPost, onPressReview, onPressLike }: Props) {
  const cover = post.images[0];
  const isReview = post.type === 'REVIEW';
  const reviewImages = isReview ? post.images.slice(0, 3) : [];
  const canOpenPost = post.type === 'POST' && (post.category === 'QUESTION' || post.category === 'FREE') && !!onPressPost;
  const canOpenReview = isReview && !!onPressReview;
  const Container = canOpenPost || canOpenReview ? Pressable : View;
  const canLike = post.type === 'REVIEW' || (post.type === 'POST' && (post.category === 'QUESTION' || post.category === 'FREE'));
  const LikeContainer = canLike ? Pressable : View;

  return (
    <Container style={styles.post} {...(canOpenPost || canOpenReview ? { onPress: canOpenReview ? onPressReview : onPressPost } : {})}>
      <View style={styles.profileRow}>
        {post.author.avatarUrl ? (
          <Image source={{ uri: post.author.avatarUrl }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={styles.avatarFallback}><UserRound size={22} color={communityColors.secondaryText} /></View>
        )}
        <View style={styles.profileText}>
          <Text style={styles.nickname} numberOfLines={1}>{post.author.nickname}</Text>
          {isReview ? <View style={styles.reviewMeta}>
            <Text style={styles.meta} numberOfLines={1}>
              {formatCommunityTime(post.createdAt, now)}{post.rating !== null ? ' ·' : ''}
            </Text>
            {post.rating !== null && <>
              <Star size={12} color="#FACC15" fill="#FACC15" />
              <Text style={styles.reviewRating}>{post.rating.toFixed(1)}</Text>
            </>}
          </View> : <Text style={styles.meta} numberOfLines={1}>
            {formatCommunityTime(post.createdAt, now)}{post.regionName ? ` · ${post.regionName}` : ''}
          </Text>}
        </View>
        {isReview ? <View style={styles.reviewMenu} accessible={false}>
          <MoreHorizontal size={20} color={communityColors.secondaryText} />
        </View> : <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{t(`community.category.${post.category.toLowerCase()}`)}</Text>
        </View>}
      </View>

      {post.popup && (
        <View style={styles.placeRow}>
          {post.popup && <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.popup.title}
            disabled={!onPressPlace}
            onPress={(event) => { event.stopPropagation(); onPressPlace?.(post.popup!.publicId); }}
            style={styles.placeLink}
          >
            <MapPin size={16} color={communityColors.placeLink} />
            <Text style={styles.placeName} numberOfLines={1} ellipsizeMode="tail">{post.popup.title}</Text>
            <ChevronRight size={16} color={communityColors.placeLink} />
          </Pressable>}
        </View>
      )}

      {reviewImages.length > 0 && <View style={styles.reviewCollage}>
        <Image source={{ uri: reviewImages[0] }}
          accessibilityLabel="후기 사진 1" resizeMode="cover"
          style={[styles.reviewPhoto, reviewImages.length > 2 && styles.reviewMainPhoto]} />
        {reviewImages.length === 2 && <Image source={{ uri: reviewImages[1] }}
          accessibilityLabel="후기 사진 2" style={styles.reviewPhoto} resizeMode="cover" />}
        {reviewImages.length > 2 && <View style={styles.reviewSidePhotos}>
          {reviewImages.slice(1).map((uri, index) => <View key={`${index}:${uri}`} style={styles.reviewPhotoCell}>
            <Image source={{ uri }} accessibilityLabel={`후기 사진 ${index + 2}`}
              style={styles.reviewCellImage} resizeMode="cover" />
            {index === 1 && post.images.length > 3 && <View style={styles.reviewOverflow}>
              <Text style={styles.reviewOverflowText}>+{post.images.length - 3}</Text>
            </View>}
          </View>)}
        </View>}
      </View>}

      <View style={styles.bodyRow}>
        <Text style={styles.body} numberOfLines={3} ellipsizeMode="tail">{post.content}</Text>
        {!isReview && cover && (
          <View style={styles.coverWrap}>
            <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
            {post.images.length > 1 && (
              <View style={styles.photoCount}><Text style={styles.photoCountText}>{post.images.length}</Text></View>
            )}
          </View>
        )}
      </View>

      <View style={styles.engagementRow}>
        <View style={styles.engagementGroup}>
          <LikeContainer style={styles.engagementItem} {...(canLike ? {
            disabled: !onPressLike, hitSlop: 8, accessibilityRole: 'button' as const,
            accessibilityLabel: post.liked ? '좋아요 취소' : '좋아요',
            accessibilityState: { selected: !!post.liked },
            onPress: (event: GestureResponderEvent) => { event.stopPropagation(); onPressLike?.(); },
          } : {})}>
            <Heart size={16} color={post.liked ? communityColors.charcoal : communityColors.secondaryText}
              fill={post.liked ? communityColors.charcoal : 'none'} />
            <Text style={styles.engagementText}>{post.likeCount}</Text>
          </LikeContainer>
          <View style={styles.engagementItem}>
            <MessageCircle size={16} color={communityColors.secondaryText} />
            <Text style={styles.engagementText}>{post.commentCount}</Text>
          </View>
        </View>
        {!isReview && <Text style={styles.engagementText}>{t('community.views', { count: post.viewCount })}</Text>}
      </View>
    </Container>
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
  reviewMeta: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  reviewRating: { ...typography.caption, fontWeight: '600', color: communityColors.text },
  reviewMenu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  reviewCollage: {
    flexDirection: 'row', height: 200, columnGap: spacing.space4, marginTop: spacing.space12,
    borderRadius: radius.radius8, overflow: 'hidden', backgroundColor: communityColors.mutedSurface,
  },
  reviewPhoto: { flex: 1, height: '100%', minWidth: 0 },
  reviewMainPhoto: { flex: 2 },
  reviewSidePhotos: { flex: 1, minWidth: 0, rowGap: spacing.space4 },
  reviewPhotoCell: { flex: 1, overflow: 'hidden' },
  reviewCellImage: { width: '100%', height: '100%' },
  reviewOverflow: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  reviewOverflowText: { ...typography.titleS, color: communityColors.white },
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
