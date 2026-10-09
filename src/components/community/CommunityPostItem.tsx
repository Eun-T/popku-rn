import { useTranslation } from '../../hooks/useTranslation';
import {
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Star,
} from "lucide-react-native";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import { getAuthUser, subscribeAuthUser } from "../../lib/auth";
import type { CommunityFeedItem } from "../../lib/community";
import { formatCommunityTime } from "../../lib/communityTime";
import { communityColors } from "../../theme/communityColors";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type Props = {
  post: CommunityFeedItem;
  now?: number;
  onPressPlace?: (placeId: string) => void;
  onPressPost?: () => void;
  onPressReview?: () => void;
  onPressLike?: () => void;
  reviewActions?: ReactNode;
};

export default function CommunityPostItem({
  post,
  now = Date.now(),
  onPressPlace,
  onPressPost,
  onPressReview,
  onPressLike,
  reviewActions,
}: Props) {
  const { t } = useTranslation();
  const user = useSyncExternalStore(
    subscribeAuthUser,
    getAuthUser,
    getAuthUser,
  );
  const cover = post.images[0];
  const isReview = post.type === "REVIEW";
  const reviewImages = isReview ? post.images.slice(0, 3) : [];
  const canOpenPost =
    post.type === "POST" &&
    (post.category === "QUESTION" || post.category === "FREE") &&
    !!onPressPost;
  const canOpenReview = isReview && !!onPressReview;
  const Container = canOpenPost || canOpenReview ? Pressable : View;
  const canLike =
    post.type === "REVIEW" ||
    (post.type === "POST" &&
      (post.category === "QUESTION" || post.category === "FREE"));
  const LikeContainer = canLike ? Pressable : View;

  if (
    post.type === "POST" &&
    (post.category === "QUESTION" || post.category === "FREE")
  ) {
    return (
      <Pressable
        style={styles.compactPost}
        accessibilityRole="button"
        disabled={!onPressPost}
        onPress={onPressPost}
      >
        <View style={styles.compactText}>
          <View style={styles.compactHeader}>
            <View style={styles.compactTag}>
              <Text style={styles.compactTagText}>
                {t(`community.category.${post.category.toLowerCase()}`)}
              </Text>
            </View>
            <Text style={styles.meta}>·</Text>
            <Text numberOfLines={1} style={styles.compactNickname}>
              {post.author.nickname}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={styles.compactContent}
          >
            {post.content}
          </Text>
          <View style={[styles.compactMeta, styles.compactMetaRow]}>
            <Text style={[styles.meta, styles.compactMetaSpacing]}>
              {formatCommunityTime(post.createdAt, now, t)}
            </Text>
            <Text style={[styles.meta, styles.compactMetaSpacing]}>·</Text>
            <MessageCircle size={14} color={colors.secondaryText} />
            <Text style={[styles.meta, styles.compactCommentText]}>
              {post.commentCount}
            </Text>
          </View>
        </View>
        {cover && (
          <Image
            source={{ uri: cover }}
            resizeMode="cover"
            style={styles.compactCover}
          />
        )}
      </Pressable>
    );
  }

  return (
    <Container
      style={styles.post}
      {...(canOpenPost || canOpenReview
        ? { onPress: canOpenReview ? onPressReview : onPressPost }
        : {})}
    >
      {isReview ? (
        <>
          <View style={styles.compactHeader}>
            <View style={[styles.compactTag, styles.reviewTag]}>
              <Text style={[styles.compactTagText, styles.reviewTagText]}>
                {t("community.reviewFilterLabel")}
              </Text>
            </View>
            <Text style={styles.meta}>·</Text>
            <Text numberOfLines={1} style={styles.compactNickname}>
              {post.author.nickname}
            </Text>
            {reviewActions ?? (user && (
              <View style={styles.reviewMenu} accessible={false}>
                <MoreHorizontal
                  size={20}
                  color={communityColors.secondaryText}
                />
              </View>
            ))}
          </View>
          {(post.rating !== null || post.popup) && (
            <View style={styles.reviewInfoRow}>
              {post.rating !== null && (
                <>
                  <Star
                    size={14}
                    color="#FACC15"
                    fill="#FACC15"
                    style={styles.reviewFixedItem}
                  />
                  <Text style={styles.reviewRating}>
                    {post.rating.toFixed(1)}
                  </Text>
                </>
              )}
              {post.rating !== null && post.popup && (
                <Text style={[styles.meta, styles.reviewFixedItem]}>·</Text>
              )}
              {post.popup && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={post.popup.title}
                  disabled={!onPressPlace}
                  onPress={(event) => {
                    event.stopPropagation();
                    onPressPlace?.(post.popup!.publicId);
                  }}
                  style={styles.reviewPopupLink}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.reviewPopupName}
                  >
                    {post.popup.title}
                  </Text>
                  <ChevronRight
                    size={14}
                    color={colors.text}
                    style={styles.reviewFixedItem}
                  />
                </Pressable>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.profileRow}>
          <View style={styles.profileText}>
            <Text style={styles.nickname} numberOfLines={1}>
              {post.author.nickname}
            </Text>
            {isReview ? (
              <View style={styles.reviewMeta}>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatCommunityTime(post.createdAt, now, t)}
                  {post.rating !== null ? " ·" : ""}
                </Text>
                {post.rating !== null && (
                  <>
                    <Star size={12} color="#FACC15" fill="#FACC15" />
                    <Text style={styles.reviewRating}>
                      {post.rating.toFixed(1)}
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.meta} numberOfLines={1}>
                {formatCommunityTime(post.createdAt, now, t)}
                {post.regionName ? ` · ${post.regionName}` : ""}
              </Text>
            )}
          </View>
          {isReview ? (
            user && (
              <View style={styles.reviewMenu} accessible={false}>
                <MoreHorizontal
                  size={20}
                  color={communityColors.secondaryText}
                />
              </View>
            )
          ) : (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>
                {t(`community.category.${post.category.toLowerCase()}`)}
              </Text>
            </View>
          )}
        </View>
      )}

      {!isReview && post.popup && (
        <View style={styles.placeRow}>
          {post.popup && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={post.popup.title}
              disabled={!onPressPlace}
              onPress={(event) => {
                event.stopPropagation();
                onPressPlace?.(post.popup!.publicId);
              }}
              style={styles.placeLink}
            >
              {/* <MapPin size={16} color={colors.primaryDark} /> */}
              <Text>📍</Text>
              <Text
                style={styles.placeName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {post.popup.title}
              </Text>
              <ChevronRight size={16} color={colors.primaryDark} />
            </Pressable>
          )}
        </View>
      )}

      {reviewImages.length > 0 && (
        <View style={styles.reviewCollage}>
          <Image
            source={{ uri: reviewImages[0] }}
            accessibilityLabel={t("place.detail.reviews.photo", { index: 1 })}
            resizeMode="cover"
            style={[
              styles.reviewPhoto,
              reviewImages.length > 2 && styles.reviewMainPhoto,
            ]}
          />
          {reviewImages.length === 2 && (
            <Image
              source={{ uri: reviewImages[1] }}
              accessibilityLabel={t("place.detail.reviews.photo", { index: 2 })}
              style={styles.reviewPhoto}
              resizeMode="cover"
            />
          )}
          {reviewImages.length > 2 && (
            <View style={styles.reviewSidePhotos}>
              {reviewImages.slice(1).map((uri, index) => (
                <View key={`${index}:${uri}`} style={styles.reviewPhotoCell}>
                  <Image
                    source={{ uri }}
                    accessibilityLabel={t("place.detail.reviews.photo", { index: index + 2 })}
                    style={styles.reviewCellImage}
                    resizeMode="cover"
                  />
                  {index === 1 && post.images.length > 3 && (
                    <View style={styles.reviewOverflow}>
                      <Text style={styles.reviewOverflowText}>
                        +{post.images.length - 3}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.bodyRow}>
        <Text style={[styles.body, isReview && styles.reviewContent]} numberOfLines={isReview ? 2 : 3} ellipsizeMode="tail">
          {post.content}
        </Text>
        {!isReview && cover && (
          <View style={styles.coverWrap}>
            <Image
              source={{ uri: cover }}
              style={styles.cover}
              resizeMode="cover"
            />
            {post.images.length > 1 && (
              <View style={styles.photoCount}>
                <Text style={styles.photoCountText}>{post.images.length}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View
        style={[styles.engagementRow, isReview && styles.reviewEngagementRow]}
      >
        {isReview && (
          <Text style={styles.meta}>
            {formatCommunityTime(post.createdAt, now, t)}
          </Text>
        )}
        {isReview && <Text style={styles.meta}>·</Text>}
        <View style={styles.engagementGroup}>
          <LikeContainer
            style={styles.engagementItem}
            {...(canLike
              ? {
                  disabled: !onPressLike,
                  hitSlop: 8,
                  accessibilityRole: "button" as const,
                  accessibilityLabel: t(post.liked ? "place.detail.reviews.unlike" : "place.detail.reviews.like"),
                  accessibilityState: { selected: !!post.liked },
                  onPress: (event: GestureResponderEvent) => {
                    event.stopPropagation();
                    onPressLike?.();
                  },
                }
              : {})}
          >
            <Heart
              size={16}
              color={
                post.liked
                  ? communityColors.charcoal
                  : communityColors.secondaryText
              }
              fill={post.liked ? communityColors.charcoal : "none"}
            />
            <Text style={styles.engagementText}>{post.likeCount}</Text>
          </LikeContainer>
          {!isReview && (
            <View style={styles.engagementItem}>
              <MessageCircle size={16} color={communityColors.secondaryText} />
              <Text style={styles.engagementText}>{post.commentCount}</Text>
            </View>
          )}
        </View>
        {!isReview && (
          <Text style={styles.engagementText}>
            {t("community.views", { count: post.viewCount })}
          </Text>
        )}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  reviewTag: { backgroundColor: colors.infoLight },
  reviewTagText: { color: colors.infoDark },
  reviewFixedItem: { flexShrink: 0 },
  reviewEngagementRow: {
    justifyContent: "flex-start",
    columnGap: spacing.space6,
  },
  reviewInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
    marginTop: spacing.space8,
  },
  reviewPopupLink: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  reviewPopupName: {
    flexShrink: 1,
    minWidth: 0,
    ...typography.label,
    fontWeight: "700",
    color: colors.text,
  },
  compactPost: {
    paddingVertical: spacing.space20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space12,
  },
  compactText: { flex: 1, minWidth: 0, rowGap: spacing.space12 },
  compactMeta: { marginTop: 0 },
  compactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  compactMetaSpacing: {
    marginRight: spacing.space4,
    color: colors.secondaryText,
  },
  compactCommentText: { color: colors.secondaryText },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
  },
  compactTag: {
    flexShrink: 0,
    alignItems: "center",
    borderRadius: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  compactTagText: {
    ...typography.caption,
    fontWeight: "600",
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 16,
    color: colors.primaryDark,
  },
  compactNickname: {
    flex: 1,
    minWidth: 0,
    ...typography.caption,
    fontSize: 13,
    color: colors.secondaryText,
  },
  compactContent: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: communityColors.text,
    fontWeight: 600,
  },
  compactCover: { width: 76, height: 76, borderRadius: radius.radius8 },
  post: { paddingVertical: spacing.space24 },
  profileRow: { flexDirection: "row", alignItems: "center" },
  profileText: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.space8,
  },
  nickname: {
    ...typography.label,
    fontWeight: "600",
    color: communityColors.text,
  },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  typeBadge: {
    height: 24,
    paddingHorizontal: spacing.space8,
    borderRadius: radius.full,
    backgroundColor: communityColors.mutedSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  typeText: { ...typography.caption, color: communityColors.charcoal },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.space12,
  },
  placeLink: {
    flex: 1,
    minWidth: 0,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
    paddingHorizontal: spacing.space12,
    borderRadius: radius.radius8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#f0fdf4",
  },
  placeName: {
    flex: 1,
    minWidth: 0,
    ...typography.label,
    color: colors.primaryDark,
  },
  reviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  reviewRating: {
    ...typography.caption,
    fontSize: 14,
    flexShrink: 0,
    fontWeight: "600",
    color: communityColors.text,
  },
  reviewMenu: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewCollage: {
    flexDirection: "row",
    height: 200,
    columnGap: spacing.space4,
    marginTop: spacing.space12,
    borderRadius: radius.radius8,
    overflow: "hidden",
    backgroundColor: communityColors.mutedSurface,
  },
  reviewPhoto: { flex: 1, height: "100%", minWidth: 0 },
  reviewMainPhoto: { flex: 2 },
  reviewSidePhotos: { flex: 1, minWidth: 0, rowGap: spacing.space4 },
  reviewPhotoCell: { flex: 1, overflow: "hidden" },
  reviewCellImage: { width: "100%", height: "100%" },
  reviewOverflow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewOverflowText: { ...typography.titleS, color: communityColors.white },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: spacing.space16,
    columnGap: spacing.space12,
  },
  body: { flex: 1, fontSize: 15, lineHeight: 23, color: communityColors.text },
  reviewContent: { fontSize: 16, fontWeight: "600" },
  coverWrap: { width: 84, height: 84 },
  cover: { width: 84, height: 84, borderRadius: radius.radius8 },
  photoCount: {
    position: "absolute",
    top: spacing.space4,
    right: spacing.space4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: communityColors.white,
  },
  engagementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.space16,
  },
  engagementGroup: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space16,
  },
  engagementItem: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  engagementText: {
    ...typography.caption,
    color: communityColors.secondaryText,
  },
});
