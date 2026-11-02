import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../hooks/useTranslation';
import { type MapService } from '../../lib/mapDirections';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = { onClose: () => void; onSelect: (service: MapService) => void };
const mapIcons = {
  google: require('../../../assets/images/map-apps/google-maps.png'),
  naver: require('../../../assets/images/map-apps/naver-map.png'),
  apple: require('../../../assets/images/map-apps/apple-maps.png'),
};
const easing = Easing.inOut(Easing.ease);
// Reanimated transitions; preserve native Modal dismissal and browser activation.
export default function DirectionsSheet({ onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [presented, setPresented] = useState(true);
  const translateY = useSharedValue(320);
  const opacity = useSharedValue(0);
  const finishedParts = useSharedValue(0);
  const active = useRef(true);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const selection = useRef<MapService | 'cancel' | null>(null);
  const completed = useRef(false);
  const complete = useCallback(() => {
    if (!active.current || completed.current || selection.current === null) return;
    completed.current = true;
    if (selection.current !== 'cancel' && Platform.OS !== 'web') onSelect(selection.current);
    onClose();
  }, [onClose, onSelect]);
  const finishDismiss = useCallback(() => {
    if (!active.current) return;
    setPresented(false);
    if (Platform.OS !== 'ios') complete();
  }, [complete]);
  const dismiss = useCallback((service: MapService | 'cancel') => {
    if (!active.current || selection.current !== null) return;
    selection.current = service;
    // Keep browser activation for opening a window; do not defer web links to animation end.
    if (Platform.OS === 'web' && service !== 'cancel') onSelect(service);
    finishedParts.set(0);
    const onFinished = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      finishedParts.set(finishedParts.get() + 1);
      if (finishedParts.get() === 2) scheduleOnRN(finishDismiss);
    };
    const config = { duration: 160, easing, reduceMotion: ReduceMotion.Never };
    translateY.set(withTiming(320, config, onFinished));
    opacity.set(withTiming(0, config, onFinished));
  }, [finishDismiss, finishedParts, onSelect, opacity, translateY]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancelAnimation(translateY);
      cancelAnimation(opacity);
    };
  }, [opacity, translateY]);
  return (
    <Modal visible={presented} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => dismiss('cancel')} onDismiss={complete}
      onShow={() => {
        if (!active.current || selection.current !== null) return;
        const config = { duration: 200, easing, reduceMotion: ReduceMotion.Never };
        translateY.set(withTiming(0, config));
        opacity.set(withTiming(1, config));
      }}>
      <View style={styles.modal}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
            onPress={() => dismiss('cancel')} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, {
          paddingBottom: insets.bottom + spacing.space8,
          paddingLeft: insets.left + spacing.space20, paddingRight: insets.right + spacing.space20,
        }, sheetStyle]}>
          <View style={styles.handleArea}><View style={styles.handle} /></View>
          <Text accessibilityRole="header" style={styles.title}>{t('place.detail.directions')}</Text>
          {(['google', 'naver', 'apple'] as const).map(service => (
            <Pressable key={service} accessibilityRole="button" onPress={() => dismiss(service)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <Image source={mapIcons[service]} style={styles.icon} resizeMode="contain"
                accessible={false} />
              <Text style={styles.label}>{t(`place.detail.directionMaps.${service}`)}</Text>
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { marginHorizontal: 0, marginBottom: 0, borderTopLeftRadius: radius.radius24,
    borderTopRightRadius: radius.radius24, backgroundColor: colors.background, overflow: 'hidden' },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.secondaryText, opacity: 0.4 },
  title: { ...typography.titleS, color: colors.text, paddingVertical: spacing.space8 },
  row: { minHeight: spacing.space56, paddingVertical: spacing.space12, flexDirection: 'row',
    alignItems: 'center', gap: spacing.space12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surface },
  icon: { width: 32, height: 32 },
  label: { ...typography.body, color: colors.text },
});
