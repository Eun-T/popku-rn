import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTranslation } from '../../hooks/useTranslation';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing } from '../../theme/tokens';
import type CommunityPostMenu from '../community/CommunityPostMenu';

type Props = ComponentProps<typeof CommunityPostMenu>;
// Match RN Animated.timing's default easing, rather than Reanimated's default quad.
const easing = Easing.inOut(Easing.ease);

export default function PopupGuidanceSheet({ onSelect, content }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [presented, setPresented] = useState(true);
  const transitionY = useSharedValue(220);
  const opacity = useSharedValue(0);
  const finishedParts = useSharedValue(0);
  const selection = useRef<number | null>(null);
  const completed = useRef(false);
  const active = useRef(true);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const transitionStyle = useAnimatedStyle(() => ({ transform: [{ translateY: transitionY.get() }] }));

  const complete = useCallback(() => {
    if (!active.current || completed.current || selection.current === null) return;
    completed.current = true;
    onSelect(selection.current);
  }, [onSelect]);
  const finishDismiss = useCallback(() => {
    if (!active.current) return;
    setPresented(false);
    // iOS waits for native Modal dismissal; Android/Web complete immediately.
    if (Platform.OS !== 'ios') complete();
  }, [complete]);
  const dismiss = useCallback((index: number) => {
    if (selection.current !== null) return;
    selection.current = index;
    if (!active.current) return;
    finishedParts.set(0);
    const onFinished = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      finishedParts.set(finishedParts.get() + 1);
      if (finishedParts.get() === 2) scheduleOnRN(finishDismiss);
    };
    const config = { duration: 160, easing, reduceMotion: ReduceMotion.Never };
    opacity.set(withTiming(0, config, onFinished));
    transitionY.set(withTiming(220, config, onFinished));
  }, [finishDismiss, finishedParts, opacity, transitionY]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancelAnimation(transitionY);
      cancelAnimation(opacity);
    };
  }, [opacity, transitionY]);

  return (
    <Modal visible={presented} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => dismiss(0)} onDismiss={complete}
      onShow={() => {
        if (!active.current || selection.current !== null) return;
        const config = { duration: 200, easing, reduceMotion: ReduceMotion.Never };
        transitionY.set(withTiming(0, config));
        opacity.set(withTiming(1, config));
      }}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Reanimated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
            onPress={() => dismiss(0)} style={StyleSheet.absoluteFill} />
        </Reanimated.View>
        <Reanimated.View pointerEvents="box-none" style={[styles.positioner, transitionStyle]}>
          <View accessibilityViewIsModal style={[styles.sheet, {
            paddingBottom: insets.bottom + spacing.space8,
            paddingLeft: insets.left + spacing.space20, paddingRight: insets.right + spacing.space20,
          }]}>
            <View style={styles.handleArea}><View style={styles.handle} /></View>
            {content?.(dismiss)}
          </View>
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  positioner: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  sheet: { marginHorizontal: 0, marginBottom: 0, paddingHorizontal: spacing.space20,
    paddingBottom: spacing.space8, borderRadius: 0, borderTopLeftRadius: radius.radius24,
    borderTopRightRadius: radius.radius24, backgroundColor: communityColors.background,
    overflow: 'hidden', maxHeight: '90%' },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: communityColors.secondaryText, opacity: 0.4 },
});
