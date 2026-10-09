import { useTranslation } from '../../hooks/useTranslation';
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  MoreHorizontal,
  Star,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CommunityImageCarousel from "../../components/community/CommunityImageCarousel";
import CommunityPostMenu from "../../components/community/CommunityPostMenu";
import { useCommunityNow } from "../../hooks/useCommunityNow";
import { clearTokens, subscribeAuthSession } from "../../lib/auth";
import { CommunityApiError } from "../../lib/community";
import {
  subscribeCommunityCommentCounts,
  subscribeCommunityLikes,
  subscribeCommunityPostChanges,
} from "../../lib/communityFeedRefresh";
import { changeCommunityLike } from "../../lib/communityLikes";
import {
  applyReviewChange,
  deleteReview,
  getReviewDetail,
  reviewDeleted,
  type ReviewDetail,
} from "../../lib/reviews";
import { formatCommunityTime } from "../../lib/communityTime";
import { communityColors } from "../../theme/communityColors";
import { colors, spacing, typography } from "../../theme/tokens";

export default function ReviewDetailScreen() {
  const { t } = useTranslation();
  // An in-flight mutation may finish after a language switch.
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { now } = useCommunityNow();
  const insets = useSafeAreaInsets();
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"missing" | "failed" | null>(null);
  const [retry, setRetry] = useState(0);
  const navigationLocked = useRef(false);
  const menuLocked = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const deletedRef = useRef(false);
  const focusedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      navigationLocked.current = false;
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, []),
  );
  useEffect(
    () => subscribeAuthSession(() => setRetry((value) => value + 1)),
    [],
  );
  useEffect(
    () =>
      subscribeCommunityCommentCounts((id, count, type) => {
        setReview((current) =>
          type === "REVIEW" && current?.id === id
            ? { ...current, commentCount: count }
            : current,
        );
      }),
    [],
  );
  useEffect(
    () =>
      subscribeCommunityLikes((reviewId, state, type) => {
        setReview((current) =>
          current && (!state || (type === "REVIEW" && current.id === reviewId))
            ? { ...current, ...(state ?? { liked: false }) }
            : current,
        );
      }),
    [],
  );
  useEffect(
    () =>
      subscribeCommunityPostChanges((reviewId, patch, type) => {
        if (type !== "REVIEW" || String(reviewId) !== id) return;
        if (!patch) {
          deletedRef.current = true;
          setReview(null);
          setError("missing");
          setLoading(false);
        } else if (!deletedRef.current)
          setReview((current) =>
            current?.id === reviewId
              ? applyReviewChange(current, patch)
              : current,
          );
      }),
    [id],
  );
  useEffect(() => {
    const request = new AbortController();
    deletedRef.current = false;
    setReview(null);
    setLoading(true);
    setError(null);
    const reviewId =
      typeof id === "string" && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
    void getReviewDetail(reviewId, request.signal)
      .then((result) => {
        if (!request.signal.aborted && !deletedRef.current) setReview(result);
      })
      .catch((reason: unknown) => {
        if (!request.signal.aborted)
          setError(
            reason instanceof CommunityApiError && reason.status === 404
              ? "missing"
              : "failed",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [id, retry]);
  const padding = {
    paddingLeft: insets.left + spacing.space16,
    paddingRight: insets.right + spacing.space16,
  };
  function openPopup() {
    if (!review?.popup || navigationLocked.current || deletingRef.current)
      return;
    navigationLocked.current = true;
    try {
      const stack = navigation.getState();
      const previous = stack ? stack.routes[stack.index - 1] : undefined;
      // Return only to the popup that actually opened this review. Otherwise keep
      // the review in history so popup back returns here (including feed entry).
      if (
        previous?.name === "places/[id]" &&
        previous.params &&
        "id" in previous.params &&
        previous.params.id === review.popup.publicId
      )
        router.back();
      else
        router.push({
          pathname: "/places/[id]",
          params: { id: review.popup.publicId },
        });
    } catch {
      navigationLocked.current = false;
      Alert.alert(t("place.detail.reviews.openFailed"), t("place.detail.tryLater"));
    }
  }
  function login() {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try {
      router.push("/profile/login");
    } catch {
      navigationLocked.current = false;
      Alert.alert(t("place.detail.reviews.openFailed"), t("place.detail.tryLater"));
    }
  }
  async function removeReview() {
    if (!review?.isOwner || deletingRef.current || deletedRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deleteReview(review.id);
      reviewDeleted(review);
      if (focusedRef.current) router.back();
    } catch (reason) {
      if (reason instanceof CommunityApiError && reason.status === 401) {
        if (await clearTokens(reason.authGeneration).catch(() => false)) {
          if (focusedRef.current) login();
        }
      } else
        Alert.alert(translation.current("review.deleteFailed"), translation.current("place.detail.tryLater"));
    } finally {
      deletingRef.current = false;
      menuLocked.current = false;
      setDeleting(false);
    }
  }
  function confirmDelete() {
    if (deletingRef.current || deletedRef.current) return;
    menuLocked.current = true;
    Alert.alert(
      t("review.deleteTitle"),
      t("community.delete.message"),
      [
        {
          text: t("community.cancel"),
          style: "cancel",
          onPress: () => {
            menuLocked.current = false;
          },
        },
        {
          text: t("community.delete.confirm"),
          style: "destructive",
          onPress: () => {
            void removeReview();
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (!deletingRef.current) menuLocked.current = false;
        },
      },
    );
  }
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <View style={[styles.header, padding]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.writeBack")}
          style={styles.headerAction}
          disabled={deleting}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(tabs)/community")
          }
        >
          <ChevronLeft size={24} color={communityColors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.title}>{t("community.reviewFilterLabel")}</Text>
        {review?.isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("review.menu")}
            style={styles.headerAction}
            disabled={deleting}
            onPress={() => {
              if (
                !menuLocked.current &&
                !navigationLocked.current &&
                !deletingRef.current
              ) {
                menuLocked.current = true;
                setMenuOpen(true);
              }
            }}
          >
            <MoreHorizontal size={22} color={communityColors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerAction} />
        )}
      </View>
      {loading ? (
        <ActivityIndicator
          style={styles.status}
          color={communityColors.charcoal}
        />
      ) : error ? (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.statusText}>
            {error === "missing"
              ? t("review.missing")
              : t("review.loadFailed")}
          </Text>
          {error === "failed" && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetry((value) => value + 1)}
              style={styles.retry}
            >
              <Text style={styles.statusText}>
                {t("community.detail.retry")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : review ? (
        <ScrollView>
          <View style={[styles.content, padding]}>
            <View style={styles.authorRow}>
              <View style={styles.reviewTag}><Text style={styles.reviewTagText}>{t("community.reviewFilterLabel")}</Text></View>
              <Text style={styles.meta}>·</Text>
              <Text numberOfLines={1} style={styles.nickname}>{review.author.nickname}</Text>
            </View>
            <View style={styles.rating}>
              <Star size={14} color="#FACC15" fill="#FACC15" style={styles.fixedItem} />
              <Text style={styles.ratingText}>{review.rating.toFixed(1)}</Text>
            {review.popup && <>
              <Text style={[styles.meta, styles.fixedItem]}>·</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={review.popup.title}
                disabled={deleting}
                onPress={openPopup}
                style={styles.popup}
              >
                <Text
                  style={styles.popupTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {review.popup.title}
                </Text>
                <ChevronRight size={14} color={colors.text} style={styles.fixedItem} />
              </Pressable>
            </>}
            </View>
            <Text style={styles.body}>{review.content}</Text>
            <CommunityImageCarousel
              key={`${review.id}:${review.images.map((image) => image.id).join(",")}`}
              images={review.images.map((image) => image.url)}
            />
            <View style={styles.counts}>
              <Text style={styles.meta}>{formatCommunityTime(review.createdAt, now, t)}</Text>
              <Text style={styles.meta}>·</Text>
              <Pressable
                style={styles.count}
                hitSlop={8}
                accessibilityRole="button"
                disabled={deleting}
                accessibilityLabel={t(review.liked ? "place.detail.reviews.unlike" : "place.detail.reviews.like")}
                accessibilityState={{ selected: review.liked }}
                onPress={() => {
                  if (deletingRef.current || deletedRef.current) return;
                  void changeCommunityLike(review, login, () =>
                    Alert.alert(
                      translation.current("place.detail.reviews.likeFailed"),
                      translation.current("place.detail.tryLater"),
                    ),
                  );
                }}
              >
                <Heart
                  size={16}
                  color={
                    review.liked
                      ? communityColors.charcoal
                      : communityColors.secondaryText
                  }
                  fill={review.liked ? communityColors.charcoal : "none"}
                />
                <Text style={styles.meta}>{review.likeCount}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : null}
      {menuOpen && (
        <CommunityPostMenu
          edgeToEdge
          onSelect={(index) => {
            setMenuOpen(false);
            menuLocked.current = false;
            if (
              !review?.isOwner ||
              navigationLocked.current ||
              deletingRef.current ||
              deletedRef.current
            )
              return;
            if (index === 2) {
              confirmDelete();
              return;
            }
            if (index !== 1) return;
            navigationLocked.current = true;
            try {
              router.push({
                pathname: "/reviews/write",
                params: { editId: String(review.id) },
              });
            } catch {
              navigationLocked.current = false;
              Alert.alert(t("review.editOpenFailed"));
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: communityColors.background },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: communityColors.divider,
  },
  headerAction: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    alignSelf: "flex-start",
  },
  title: { ...typography.titleS, color: communityColors.text },
  content: {
    paddingTop: spacing.space24,
    paddingBottom: spacing.space40,
    rowGap: spacing.space16,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
  },
  ratingText: {
    ...typography.caption,
    fontSize: 14,
    flexShrink: 0,
    fontWeight: "600",
    color: communityColors.text,
  },
  popup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  popupTitle: {
    flexShrink: 1,
    minWidth: 0,
    ...typography.label,
    fontWeight: "700",
    color: colors.text,
  },
  body: { ...typography.body, color: communityColors.text },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  counts: { flexDirection: "row", alignItems: "center", columnGap: spacing.space6 },
  authorRow: { flexDirection: "row", alignItems: "center", columnGap: spacing.space6 },
  reviewTag: { flexShrink: 0, alignItems: "center", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.infoLight },
  reviewTagText: { ...typography.caption, fontSize: 13, lineHeight: 16, fontWeight: "600", flexShrink: 0, color: colors.infoDark },
  nickname: { flex: 1, minWidth: 0, ...typography.caption, fontSize: 13, color: colors.secondaryText },
  fixedItem: { flexShrink: 0 },
  count: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
  },
  status: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusText: { ...typography.label, color: communityColors.secondaryText },
  retry: { padding: spacing.space16 },
});
