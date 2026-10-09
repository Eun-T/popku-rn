import { useTranslation } from '../../hooks/useTranslation';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getWeeklyPopups, type PublicPopup } from "../../lib/popups";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import PlaceWeeklyPopupList from "./PlaceWeeklyPopupList";

function startOfWeek(date: Date): Date {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function weekLabel(start: Date, offset: number): string {
  const first = new Date(start);
  first.setDate(first.getDate() + offset * 7);
  const last = new Date(first);
  last.setDate(last.getDate() + 6);
  return `${first.getMonth() + 1}.${first.getDate()} - ${last.getMonth() + 1}.${last.getDate()}`;
}

const WEEK_CACHE_FRESH_MS = 4 * 60 * 1000;
const PAGE_SIZE = 3;
const PEEK_RATIO = 0.08;
const PAGE_GAP = spacing.space12;
// Initial estimate based on three 80px posters; subsequent loading uses measured content height.
const INITIAL_CONTENT_HEIGHT = 3 * 80 + 2 * 10 + spacing.space16;
type WeekCacheEntry = { popups: PublicPopup[]; fetchedAt: number };
type WeekState = {
  key: string;
  status: "loading" | "ready" | "error";
  popups: PublicPopup[];
};

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type PlaceWeeklySectionProps = {
  country: "KR" | "JP" | undefined;
  isActive?: boolean;
  onPressPopup: (popup: PublicPopup) => void;
  isFavorite: (publicId: string) => boolean;
  isFavoriteDisabled: (publicId: string) => boolean;
  onToggleFavorite: (popup: PublicPopup) => void;
};

export default function PlaceWeeklySection({
  country,
  isActive = true,
  onPressPopup,
  isFavorite,
  isFavoriteDisabled,
  onToggleFavorite,
}: PlaceWeeklySectionProps) {
  const { t, resolvedLanguage } = useTranslation();
  const [selectedWeek, setSelectedWeek] = useState(() =>
    startOfWeek(new Date()),
  );
  const weekEnd = new Date(selectedWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartString = dateString(selectedWeek);
  const weekEndString = dateString(weekEnd);
  const weekKey = `${country ?? "ALL"}|${weekStartString}|${weekEndString}`;
  const cache = useRef(new Map<string, WeekCacheEntry>());
  const latestWeekKey = useRef(weekKey);
  latestWeekKey.current = weekKey;
  const contentHeight = useRef(INITIAL_CONTENT_HEIGHT);
  const [state, setState] = useState<WeekState>({
    key: "",
    status: "loading",
    popups: [],
  });
  const [pageState, setPageState] = useState({ key: "", index: 0 });
  const [retry, setRetry] = useState(0);
  const cached = cache.current.get(weekKey);
  const freshCached =
    cached && Date.now() - cached.fetchedAt < WEEK_CACHE_FRESH_MS
      ? cached
      : undefined;
  // A cached week can render immediately, before the effect runs.
  const status =
    state.key === weekKey ? state.status : freshCached ? "ready" : "loading";
  const popups =
    state.key === weekKey ? state.popups : (freshCached?.popups ?? []);
  const pageCount = Math.ceil(popups.length / PAGE_SIZE);
  const pageIndex =
    pageState.key === weekKey
      ? Math.min(pageState.index, Math.max(0, pageCount - 1))
      : 0;
  const pages = Array.from({ length: pageCount }, (_, index) =>
    popups.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE),
  );
  const popupListRef = useRef<FlatList<PublicPopup[]>>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const pageWidth = (carouselWidth - PAGE_GAP) / (1 + PEEK_RATIO);
  const pageStride = pageWidth + PAGE_GAP;

  useEffect(() => {
    if (!isActive || carouselWidth <= 0) return;
    popupListRef.current?.scrollToOffset({
      offset: pageIndex * pageStride,
      animated: false,
    });
  }, [weekKey, isActive, carouselWidth, pageStride, status]);

  useEffect(() => {
    if (!isActive) return;
    const entry = cache.current.get(weekKey);
    if (entry && Date.now() - entry.fetchedAt < WEEK_CACHE_FRESH_MS) {
      setState({ key: weekKey, status: "ready", popups: entry.popups });
      setPageState((current) =>
        current.key === weekKey ? current : { key: weekKey, index: 0 },
      );
      return;
    }
    const controller = new AbortController();
    // Start time is conservative: network latency does not extend URL freshness.
    const fetchedAt = Date.now();
    setState({ key: weekKey, status: "loading", popups: [] });
    setPageState({ key: weekKey, index: 0 });
    getWeeklyPopups(country, weekStartString, weekEndString, controller.signal)
      .then((items) => {
        if (controller.signal.aborted || latestWeekKey.current !== weekKey)
          return;
        const popups = items.slice(0, 9);
        cache.current.set(weekKey, { popups, fetchedAt });
        setState({ key: weekKey, status: "ready", popups });
      })
      .catch(() => {
        if (!controller.signal.aborted && latestWeekKey.current === weekKey) {
          setState({ key: weekKey, status: "error", popups: [] });
        }
      });
    return () => controller.abort();
  }, [weekKey, isActive, retry]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const offset = useRef(new Animated.Value(0)).current;
  const moving = useRef(false);
  const weekWidth = viewportWidth / 3;

  const moveWeek = (direction: number) => {
    if (moving.current || weekWidth === 0) return;
    moving.current = true;
    Animated.timing(offset, {
      toValue: -direction * weekWidth,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSelectedWeek((current) => {
          const next = new Date(current);
          next.setDate(next.getDate() + direction * 7);
          return next;
        });
      }
      offset.setValue(0);
      moving.current = false;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !moving.current &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          offset.setValue(
            Math.max(-weekWidth, Math.min(weekWidth, gesture.dx)),
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const direction = gesture.dx < 0 ? 1 : -1;
          if (
            Math.abs(gesture.dx) >= weekWidth / 4 ||
            Math.abs(gesture.vx) > 0.5
          ) {
            moveWeek(direction);
          } else {
            Animated.timing(offset, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.timing(offset, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        },
      }),
    [weekWidth],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t("place.explore.weeklyTitle")}</Text>
      <View style={styles.selector}>
        <View
          style={styles.viewport}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {viewportWidth > 0 && (
            <Animated.View
              style={[
                styles.weeks,
                {
                  width: weekWidth * 5,
                  marginLeft: -weekWidth,
                  transform: [{ translateX: offset }],
                },
              ]}
            >
              {[-2, -1, 0, 1, 2].map((weekOffset) => (
                <Pressable
                  key={weekOffset}
                  accessibilityRole="button"
                  accessibilityLabel={weekLabel(selectedWeek, weekOffset)}
                  accessibilityState={{ selected: weekOffset === 0 }}
                  onPress={() =>
                    weekOffset !== 0 && moveWeek(weekOffset < 0 ? -1 : 1)
                  }
                  style={[styles.week, { width: weekWidth }]}
                >
                  <View
                    style={[
                      styles.weekCard,
                      weekOffset === 0 && styles.selectedCard,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[
                        styles.weekText,
                        weekOffset === 0 && styles.selectedText,
                      ]}
                    >
                      {weekLabel(selectedWeek, weekOffset)}
                    </Text>
                    <View
                      style={[
                        styles.weekDot,
                        weekOffset === 0 && styles.selectedDot,
                      ]}
                    />
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          )}
        </View>
      </View>
      <View
        style={
          status !== "ready" ? { minHeight: contentHeight.current } : undefined
        }
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          if (status === "ready" && isActive && height > 0)
            contentHeight.current = height;
        }}
      >
        {status === "loading" && (
          <Text style={styles.adjacentText}>{t("place.all.loading")}</Text>
        )}
        {status === "error" && (
          <Pressable onPress={() => setRetry((value) => value + 1)}>
            <Text style={styles.adjacentText}>
              {t("place.explore.loadFailedRetry")}
            </Text>
          </Pressable>
        )}
        {status === "ready" && (
          <>
            <View
              onLayout={({ nativeEvent }) => {
                if (isActive && nativeEvent.layout.width > 0)
                  setCarouselWidth(nativeEvent.layout.width);
              }}
            >
              {carouselWidth > 0 && (
                <FlatList
                  key={weekKey}
                  ref={popupListRef}
                  data={pages}
                  extraData={resolvedLanguage}
                  horizontal
                  keyExtractor={(items) => items[0].publicId}
                  snapToOffsets={pages.map((_, index) => index * pageStride)}
                  snapToAlignment="start"
                  disableIntervalMomentum
                  decelerationRate="fast"
                  bounces={false}
                  overScrollMode="never"
                  scrollEnabled={pageCount > 1}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={pageCount}
                  removeClippedSubviews={false}
                  contentContainerStyle={{ paddingRight: carouselWidth - pageWidth }}
                  ItemSeparatorComponent={() => (
                    <View style={{ width: PAGE_GAP }} />
                  )}
                  getItemLayout={(_, index) => ({
                    length: pageWidth,
                    offset: index * pageStride,
                    index,
                  })}
                  scrollEventThrottle={16}
                  onScroll={({ nativeEvent }) => {
                    if (!isActive) return;
                    const index = Math.max(
                      0,
                      Math.min(
                        pageCount - 1,
                        Math.round(nativeEvent.contentOffset.x / pageStride),
                      ),
                    );
                    setPageState((current) =>
                      current.key === weekKey && current.index === index
                        ? current
                        : { key: weekKey, index },
                    );
                  }}
                  renderItem={({ item }) => (
                    <View
                      style={{
                        width: pageWidth,
                      }}
                    >
                      <PlaceWeeklyPopupList
                        popups={item}
                        onPressPopup={onPressPopup}
                        isFavorite={isFavorite}
                        isFavoriteDisabled={isFavoriteDisabled}
                        onToggleFavorite={onToggleFavorite}
                      />
                    </View>
                  )}
                />
              )}
            </View>
              <View style={styles.pagination}>
                {Array.from({ length: pageCount }, (_, index) => (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={t("place.explore.weeklyPage", { index: index + 1 })}
                    accessibilityState={{ selected: index === pageIndex }}
                    onPress={() =>
                      popupListRef.current?.scrollToOffset({
                        offset: index * pageStride,
                        animated: true,
                      })
                    }
                    style={styles.paginationTarget}
                  >
                    <View
                      style={[
                        styles.dot,
                        index === pageIndex && styles.activeDot,
                      ]}
                    />
                  </Pressable>
                ))}
              </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.space32 },
  heading: { ...typography.titleM, color: colors.text, marginBottom: 11 },
  selector: { height: 48, flexDirection: "row", alignItems: "center" },
  viewport: {
    flex: 1,
    height: 48,
    marginHorizontal: -spacing.space4,
    overflow: "hidden",
  },
  weeks: { height: 48, flexDirection: "row" },
  week: { height: 48, paddingHorizontal: spacing.space4 },
  weekCard: {
    flex: 1,
    borderRadius: radius.radius12,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.space4,
  },
  selectedCard: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  weekText: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    color: colors.secondaryText,
  },
  adjacentText: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    color: colors.secondaryText,
  },
  selectedText: { fontWeight: "700", color: colors.primaryDark },
  weekDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    marginTop: spacing.space4,
    backgroundColor: "transparent",
  },
  selectedDot: { backgroundColor: colors.primary },
  pagination: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.space12,
  },
  paginationTarget: {
    width: 32,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.paginationInactive },
  activeDot: { width: 18, backgroundColor: colors.paginationActive },
});
