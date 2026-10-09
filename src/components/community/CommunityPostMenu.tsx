import { useTranslation } from '../../hooks/useTranslation';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { communityColors } from '../../theme/communityColors';
import { radius, spacing } from '../../theme/tokens';

type Props = { onSelect: (index: number) => void; showEdit?: boolean; showDelete?: boolean; edgeToEdge?: boolean };
const DESTRUCTIVE_RED = '#DC2626';

export default function CommunityPostMenu({ onSelect, showEdit = true, showDelete = true, edgeToEdge = false }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [presented, setPresented] = useState(true);
  const translateY = useRef(new Animated.Value(220)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const selection = useRef<number | null>(null);
  const completed = useRef(false);
  const complete = useCallback(() => {
    if (completed.current || selection.current === null) return;
    completed.current = true;
    onSelect(selection.current);
  }, [onSelect]);
  const dismiss = useCallback((index: number) => {
    if (selection.current !== null) return;
    selection.current = index;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 220, duration: 160, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setPresented(false);
      // iOS alerts must wait for the native modal to finish dismissing.
      if (Platform.OS !== 'ios') complete();
    });
  }, [complete, opacity, translateY]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      selection.current === null && gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 60 || gesture.vy > 0.75) dismiss(0);
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => {
      if (selection.current === null) Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [dismiss, translateY]);
  useEffect(() => () => { translateY.stopAnimation(); opacity.stopAnimation(); }, [opacity, translateY]);

  return (
    <Modal visible={presented} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => dismiss(0)} onDismiss={complete}
      onShow={() => Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()}>
      <View style={styles.modal}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
            onPress={() => dismiss(0)} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, edgeToEdge && styles.edgeSheet,
          edgeToEdge ? { paddingBottom: insets.bottom + spacing.space8,
            paddingLeft: insets.left + spacing.space20, paddingRight: insets.right + spacing.space20 }
            : { marginBottom: Math.max(insets.bottom, spacing.space16) },
          { transform: [{ translateY }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}><View style={styles.handle} /></View>
          {showEdit && <><Pressable accessibilityRole="button" onPress={() => dismiss(1)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Pencil size={22} color={communityColors.text} />
            <Text style={styles.label}>{t('community.edit.action')}</Text>
          </Pressable>
            {showDelete && <View style={styles.divider} />}</>}
          {showDelete && <Pressable accessibilityRole="button" onPress={() => dismiss(2)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Trash2 size={22} color={DESTRUCTIVE_RED} />
            <Text style={[styles.label, styles.destructive]}>{t('community.delete.action')}</Text>
          </Pressable>}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { marginHorizontal: spacing.space16, paddingHorizontal: spacing.space20, paddingBottom: spacing.space8,
    borderRadius: radius.radius24, backgroundColor: communityColors.background, overflow: 'hidden' },
  edgeSheet: { marginHorizontal: 0, marginBottom: 0, borderRadius: 0,
    borderTopLeftRadius: radius.radius24, borderTopRightRadius: radius.radius24 },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: communityColors.secondaryText, opacity: 0.4 },
  row: { height: 56, flexDirection: 'row', alignItems: 'center', columnGap: spacing.space12 },
  rowPressed: { backgroundColor: communityColors.mutedSurface },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: communityColors.text },
  destructive: { color: DESTRUCTIVE_RED },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: communityColors.divider },
});
