import { useTranslation } from '../hooks/useTranslation';
import { useFocusEffect, useRouter, useScrollToTop } from "expo-router";
import { Pencil, Settings } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import CommunityPostItem from "../components/community/CommunityPostItem";
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from "../components/navigation/FloatingTabBar";
import { useCommunityNow } from "../hooks/useCommunityNow";
import { getAuthUser, subscribeAuthUser, subscribeAuthSession } from "../lib/auth";
import {
  getCommunityFeed,
  type CommunityCategory,
  type CommunityFeedItem,
  type CommunitySort,
} from "../lib/community";
import {
  communityFeedRevision,
  subscribeCommunityCommentCounts,
  subscribeCommunityLikes,
  subscribeCommunityPostChanges,
} from "../lib/communityFeedRefresh";
import { changeCommunityLike } from "../lib/communityLikes";
import { waitForCommunityRefresh } from "../lib/communityRefresh";
import { communityColors } from "../theme/communityColors";
import { colors, radius, spacing, typography } from "../theme/tokens";

const categories: readonly CommunityCategory[] = [
  "ALL",
  "REVIEW",
  "QUESTION",
  "FREE",
];

export default function CommunityScreen() {
  const { t } = useTranslation();
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);
  const router = useRouter();
  const authUser = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const listRef = useRef<FlatList<CommunityFeedItem>>(null);
  useScrollToTop(listRef);
  const navigationLocked = useRef(false);
  // This focus callback must stay independent of feed filters, requests and ticks.
  useFocusEffect(
    useCallback(() => {
      navigationLocked.current = false;
    }, []),
  );
  const pushOnce = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (navigationLocked.current) return;
      navigationLocked.current = true;
      try {
        router.push(href);
      } catch {
        navigationLocked.current = false;
        Alert.alert(t("place.detail.reviews.openFailed"), t("place.detail.tryLater"));
      }
    },
    [router, t],
  );
  const { now, updateNow } = useCommunityNow();
  const [category, setCategory] = useState<CommunityCategory>("ALL");
  const [sort] = useState<CommunitySort>("LATEST");
  const [posts, setPosts] = useState<CommunityFeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const loadedRequest = useRef<{
    category: CommunityCategory;
    sort: CommunitySort;
    retryKey: number;
    revision: number;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const horizontalPadding = {
    paddingLeft: spacing.space16 + insets.left,
    paddingRight: spacing.space16 + insets.right,
  };

  useEffect(
    () =>
      subscribeCommunityLikes((id, state, type = "POST") => {
        setPosts((items) =>
          items.map((item) =>
            !state || item.type === type
              ? state
                ? item.id === id
                  ? { ...item, ...state }
                  : item
                : { ...item, liked: false }
              : item,
          ),
        );
      }),
    [],
  );
  useEffect(
    () => subscribeAuthSession(() => setRetryKey((value) => value + 1)),
    [],
  );
  useEffect(
    () =>
      subscribeCommunityCommentCounts((id, count, type = "POST") => {
        setPosts((items) =>
          items.map((item) =>
            item.type === type && item.id === id
              ? { ...item, commentCount: count }
              : item,
          ),
        );
      }),
    [],
  );
  useEffect(
    () =>
      subscribeCommunityPostChanges((id, patch, type = "POST") => {
        setPosts((items) =>
          items.flatMap((item) =>
            item.type === type && item.id === id
              ? patch
                ? [{ ...item, ...patch }]
                : []
              : [item],
          ),
        );
      }),
    [],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
      generation.current += 1;
      inFlight.current = false;
      loadedRequest.current = null;
    },
    [],
  );

  const loadFirstPage = useCallback(
    (pullRefresh = false) => {
      const startedAt = Date.now();
      updateNow();
      const current = ++generation.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      inFlight.current = true;
      loadedRequest.current = {
        category,
        sort,
        retryKey,
        revision: communityFeedRevision(),
      };
      if (!pullRefresh) setPosts([]);
      setNextCursor(null);
      setLoading(!pullRefresh);
      setRefreshing(pullRefresh);
      setLoadingMore(false);
      setError(false);
      setLoadMoreError(false);
      void getCommunityFeed(category, sort, null, request.signal)
        .then((page) => {
          if (current !== generation.current) return;
          setPosts(page.items);
          setNextCursor(page.nextCursor);
          updateNow();
        })
        .catch(() => {
          if (current === generation.current && !request.signal.aborted)
            setError(true);
        })
        .finally(async () => {
          if (pullRefresh)
            await waitForCommunityRefresh(startedAt, request.signal);
          if (current === generation.current) {
            inFlight.current = false;
            setLoading(false);
            setRefreshing(false);
          }
        });
    },
    [category, sort, retryKey, updateNow],
  );

  useFocusEffect(
    useCallback(() => {
      updateNow();
      const previous = loadedRequest.current;
      if (
        !previous ||
        previous.category !== category ||
        previous.sort !== sort ||
        previous.retryKey !== retryKey ||
        previous.revision !== communityFeedRevision()
      ) {
        loadFirstPage();
      }
      // Keep the list and active requests on blur; only unmount/filter/refresh cancels them.
    }, [category, sort, retryKey, loadFirstPage, updateNow]),
  );

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    loadFirstPage(true);
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (
      !nextCursor ||
      inFlight.current ||
      loading ||
      refreshing ||
      loadMoreError
    )
      return;
    const current = generation.current;
    const cursor = nextCursor;
    const request = new AbortController();
    controller.current = request;
    inFlight.current = true;
    setLoadingMore(true);
    void getCommunityFeed(category, sort, cursor, request.signal)
      .then((page) => {
        if (current !== generation.current) return;
        setPosts((previous) => {
          const items = new Map(
            previous.map((item) => [`${item.type}:${item.id}`, item]),
          );
          // Keep row positions, but use the server's newest values for overlapping IDs.
          for (const item of page.items)
            items.set(`${item.type}:${item.id}`, item);
          return [...items.values()];
        });
        setNextCursor(page.nextCursor === cursor ? null : page.nextCursor);
      })
      .catch(() => {
        if (current === generation.current && !request.signal.aborted)
          setLoadMoreError(true);
      })
      .finally(() => {
        if (current === generation.current) {
          inFlight.current = false;
          setLoadingMore(false);
        }
      });
  }, [category, sort, nextCursor, loading, refreshing, loadMoreError]);

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={[styles.header, horizontalPadding]}>
        <Text style={styles.title}>{t("community.title")}</Text>
        <View
          accessibilityLabel={t("community.settings")}
          style={styles.headerIcon}
        >
          {/* <Settings size={24} color={communityColors.text} /> */}
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        refreshing={refreshing}
        onRefresh={refresh}
        data={posts}
        extraData={now}
        keyExtractor={(post) => `${post.type}:${post.id}`}
        renderItem={({ item }) => (
          <CommunityPostItem
            post={item}
            now={now}
            onPressLike={
              item.type === "REVIEW" ||
              (item.type === "POST" &&
                (item.category === "QUESTION" || item.category === "FREE"))
                ? () => {
                    void changeCommunityLike(
                      item,
                      () => pushOnce("/profile/login"),
                      () =>
                        Alert.alert(
                          translation.current("place.detail.reviews.likeFailed"),
                          translation.current("place.detail.tryLater"),
                        ),
                    );
                  }
                : undefined
            }
            onPressPost={
              item.type === "POST" &&
              (item.category === "QUESTION" || item.category === "FREE")
                ? () =>
                    pushOnce({
                      pathname: "/community/[id]",
                      params: { id: String(item.id) },
                    })
                : undefined
            }
            onPressReview={
              item.type === "REVIEW"
                ? () =>
                    pushOnce({
                      pathname: "/reviews/[id]",
                      params: { id: String(item.id) },
                    })
                : undefined
            }
            onPressPlace={(publicId) =>
              pushOnce({ pathname: "/places/[id]", params: { id: publicId } })
            }
          />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {error ? t("community.feed.loadFailed") : t("community.feed.empty")}
              </Text>
              {error && (
                <Pressable onPress={() => setRetryKey((value) => value + 1)}>
                  <Text style={styles.emptyText}>{t("community.detail.retry")}</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          loading || loadingMore ? (
            <ActivityIndicator
              style={styles.empty}
              color={communityColors.charcoal}
            />
          ) : loadMoreError ? (
            <Pressable
              onPress={() => setLoadMoreError(false)}
              style={styles.empty}
            >
              <Text style={styles.emptyText}>{t("community.detail.retry")}</Text>
            </Pressable>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={[
          styles.listContent,
          horizontalPadding,
          {
            paddingBottom:
              insets.bottom +
              FLOATING_TAB_BAR_BOTTOM_GAP +
              FLOATING_TAB_BAR_HEIGHT +
              spacing.space40,
          },
        ]}
        ListHeaderComponent={
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
              style={styles.categoryScroll}
            >
              {categories.map((item) => {
                const selected = category === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(item)}
                    style={[
                      styles.categoryChip,
                      selected && styles.selectedChip,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        selected && styles.selectedCategoryText,
                      ]}
                    >
                      {item === "REVIEW"
                        ? t("community.reviewFilterLabel")
                        : t(`community.category.${item.toLowerCase()}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
      />

      {authUser && <Pressable
        style={[
          styles.writeButton,
          {
            right: spacing.space16 + insets.right,
            bottom:
              insets.bottom +
              FLOATING_TAB_BAR_BOTTOM_GAP +
              FLOATING_TAB_BAR_HEIGHT +
              spacing.space16,
          },
        ]}
        accessibilityLabel={t("community.write")}
        accessibilityRole="button"
        onPress={() => pushOnce("/community/write")}
      >
        <Pencil size={18} color={communityColors.white} />
        <Text style={styles.writeText}>{t("community.write")}</Text>
      </Pressable>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.space8,
    backgroundColor: communityColors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.space12,
  },
  title: { ...typography.titleL, color: colors.text },
  headerIcon: {
    width: 24,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  categoryScroll: { marginTop: spacing.space12, marginBottom: spacing.space8 },
  categoryRow: { flexDirection: "row", columnGap: spacing.space8 },
  categoryChip: {
    height: 36,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedChip: { borderColor: colors.text, backgroundColor: colors.text },
  categoryText: { ...typography.label, color: colors.text },
  selectedCategoryText: { color: colors.background },
  separator: { height: 1, backgroundColor: communityColors.divider },
  empty: { paddingVertical: spacing.space40, alignItems: "center" },
  emptyText: { ...typography.label, color: communityColors.secondaryText },
  writeButton: {
    position: "absolute",
    height: 48,
    paddingHorizontal: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space8,
    borderRadius: radius.full,
    backgroundColor: colors.text,
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  writeText: {
    ...typography.label,
    fontWeight: "600",
    color: communityColors.white,
  },
});
