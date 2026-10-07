import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme/tokens';
import { getWeeklyPopups, type PublicPopup } from '../../lib/popups';
import PlaceWeeklyPopupList from './PlaceWeeklyPopupList';

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
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
// Three existing 112px cards, two 10px separators and the list's 16px top margin.
const INITIAL_CONTENT_HEIGHT = 3 * 112 + 2 * 10 + spacing.space16;
type WeekCacheEntry = { popups: PublicPopup[]; fetchedAt: number };
type WeekState = { key: string; status: 'loading' | 'ready' | 'error'; popups: PublicPopup[] };

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type PlaceWeeklySectionProps = {
  country: 'KR' | 'JP' | undefined;
  isActive?: boolean;
  onPressPopup: (popup: PublicPopup) => void;
  isFavorite: (publicId: string) => boolean;
  isFavoriteDisabled: (publicId: string) => boolean;
  onToggleFavorite: (popup: PublicPopup) => void;
};

export default function PlaceWeeklySection({ country, isActive = true, onPressPopup, isFavorite, isFavoriteDisabled, onToggleFavorite }: PlaceWeeklySectionProps) {
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date()));
  const weekEnd = new Date(selectedWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartString = dateString(selectedWeek);
  const weekEndString = dateString(weekEnd);
  const weekKey = `${country ?? 'ALL'}|${weekStartString}|${weekEndString}`;
  const cache = useRef(new Map<string, WeekCacheEntry>());
  const latestWeekKey = useRef(weekKey);
  latestWeekKey.current = weekKey;
  const contentHeight = useRef(INITIAL_CONTENT_HEIGHT);
  const [state, setState] = useState<WeekState>({ key: '', status: 'loading', popups: [] });
  const [pageState, setPageState] = useState({ key: '', index: 0 });
  const [retry, setRetry] = useState(0);
  const cached = cache.current.get(weekKey);
  const freshCached = cached && Date.now() - cached.fetchedAt < WEEK_CACHE_FRESH_MS ? cached : undefined;
  // A cached week can render immediately, before the effect runs.
  const status = state.key === weekKey ? state.status : freshCached ? 'ready' : 'loading';
  const popups = state.key === weekKey ? state.popups : freshCached?.popups ?? [];
  const pageCount = Math.ceil(popups.length / PAGE_SIZE);
  const pageIndex = pageState.key === weekKey ? Math.min(pageState.index, Math.max(0, pageCount - 1)) : 0;
  const pagePopups = popups.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!isActive) return;
    const entry = cache.current.get(weekKey);
    if (entry && Date.now() - entry.fetchedAt < WEEK_CACHE_FRESH_MS) {
      setState({ key: weekKey, status: 'ready', popups: entry.popups });
      setPageState(current => current.key === weekKey ? current : { key: weekKey, index: 0 });
      return;
    }
    const controller = new AbortController();
    // Start time is conservative: network latency does not extend URL freshness.
    const fetchedAt = Date.now();
    setState({ key: weekKey, status: 'loading', popups: [] });
    setPageState({ key: weekKey, index: 0 });
    getWeeklyPopups(country, weekStartString, weekEndString, controller.signal)
      .then(items => {
        if (controller.signal.aborted || latestWeekKey.current !== weekKey) return;
        const popups = items.slice(0, 9);
        cache.current.set(weekKey, { popups, fetchedAt });
        setState({ key: weekKey, status: 'ready', popups });
      })
      .catch(() => {
        if (!controller.signal.aborted && latestWeekKey.current === weekKey) {
          setState({ key: weekKey, status: 'error', popups: [] });
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

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      !moving.current && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      offset.setValue(Math.max(-weekWidth, Math.min(weekWidth, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const direction = gesture.dx < 0 ? 1 : -1;
      if (Math.abs(gesture.dx) >= weekWidth / 4 || Math.abs(gesture.vx) > 0.5) {
        moveWeek(direction);
      } else {
        Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    },
  }), [weekWidth]);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>이번 주 어디가지? </Text>
      <View style={styles.selector}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 주" onPress={() => moveWeek(-1)} style={styles.arrow}>
          <ChevronLeft size={18} color={colors.text} />
        </Pressable>
        <View
          style={styles.viewport}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {viewportWidth > 0 && (
            <Animated.View style={[styles.weeks, { width: weekWidth * 5, marginLeft: -weekWidth, transform: [{ translateX: offset }] }]}>
              {[-2, -1, 0, 1, 2].map((weekOffset) => (
                <Pressable
                  key={weekOffset}
                  accessibilityRole="button"
                  accessibilityLabel={weekLabel(selectedWeek, weekOffset)}
                  accessibilityState={{ selected: weekOffset === 0 }}
                  onPress={() => weekOffset !== 0 && moveWeek(weekOffset < 0 ? -1 : 1)}
                  style={[styles.week, { width: weekWidth }]}
                >
                  {weekOffset === 0 ? (
                    <View style={styles.selectedGroup}>
                      <Text numberOfLines={1} style={styles.selectedText}>
                        {weekLabel(selectedWeek, weekOffset)}
                      </Text>
                      <View style={styles.underline} />
                    </View>
                  ) : (
                    <Text numberOfLines={1} style={styles.adjacentText}>
                      {weekLabel(selectedWeek, weekOffset)}
                    </Text>
                  )}
                </Pressable>
              ))}
            </Animated.View>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 주" onPress={() => moveWeek(1)} style={styles.arrow}>
          <ChevronRight size={18} color={colors.text} />
        </Pressable>
      </View>
      <View
        style={status !== 'ready' ? { minHeight: contentHeight.current } : undefined}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          if (status === 'ready' && isActive && height > 0) contentHeight.current = height;
        }}
      >
        {status === 'loading' && <Text style={styles.adjacentText}>팝업을 불러오는 중이에요.</Text>}
        {status === 'error' && <Pressable onPress={() => setRetry(value => value + 1)}>
          <Text style={styles.adjacentText}>팝업을 불러오지 못했어요. 다시 시도</Text>
        </Pressable>}
        {status === 'ready' && <>
          <PlaceWeeklyPopupList popups={pagePopups} onPressPopup={onPressPopup}
            isFavorite={isFavorite} isFavoriteDisabled={isFavoriteDisabled} onToggleFavorite={onToggleFavorite} />
          {pageCount > 1 && <View style={styles.pagination}>
            {Array.from({ length: pageCount }, (_, index) => <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`주간 팝업 ${index + 1}페이지`}
              accessibilityState={{ selected: index === pageIndex }}
              onPress={() => setPageState({ key: weekKey, index })}
              style={styles.paginationTarget}
            >
              <View style={[styles.dot, index === pageIndex && styles.activeDot]} />
            </Pressable>)}
          </View>}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.space32 },
  heading: { ...typography.titleM, color: colors.text, marginBottom: 11 },
  selector: { height: 56, flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 40, height: 56, alignItems: 'center', justifyContent: 'center' },
  viewport: { flex: 1, height: 56, overflow: 'hidden' },
  weeks: { height: 56, flexDirection: 'row' },
  week: { height: 56, alignItems: 'center', justifyContent: 'center' },
  adjacentText: { fontSize: 14, fontWeight: '400', lineHeight: 20, color: colors.secondaryText },
  selectedGroup: { alignSelf: 'center' },
  selectedText: { fontSize: 16, fontWeight: '700', lineHeight: 20, color: colors.text },
  underline: { height: 3, marginTop: 9, backgroundColor: colors.primary },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.space12 },
  paginationTarget: { width: 32, height: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  activeDot: { width: 18, backgroundColor: colors.text },
});
