import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme/tokens';
import type { PublicPopup } from '../../lib/popups';
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

export default function PlaceWeeklySection({ popups, onPressPopup }: { popups: readonly PublicPopup[]; onPressPopup: (popup: PublicPopup) => void }) {
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date()));
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
      <PlaceWeeklyPopupList selectedWeek={selectedWeek} popups={popups} onPressPopup={onPressPopup} />
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
});
