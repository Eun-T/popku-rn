import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
// Follow CommunityPostMenu's fade/slide and native Modal dismissal lifecycle.
export default function DirectionsSheet({ onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [presented, setPresented] = useState(true);
  const [translateY] = useState(() => new Animated.Value(320));
  const [opacity] = useState(() => new Animated.Value(0));
  const selection = useRef<MapService | 'cancel' | null>(null);
  const completed = useRef(false);
  const complete = useCallback(() => {
    if (completed.current || selection.current === null) return;
    completed.current = true;
    if (selection.current !== 'cancel' && Platform.OS !== 'web') onSelect(selection.current);
    onClose();
  }, [onClose, onSelect]);
  const dismiss = useCallback((service: MapService | 'cancel') => {
    if (selection.current !== null) return;
    selection.current = service;
    // Keep browser activation for opening a window; do not defer web links to animation end.
    if (Platform.OS === 'web' && service !== 'cancel') onSelect(service);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 320, duration: 160, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setPresented(false);
      if (Platform.OS !== 'ios') complete();
    });
  }, [complete, onSelect, opacity, translateY]);
  const [panHandlers, setPanHandlers] = useState<ReturnType<typeof PanResponder.create>['panHandlers']>({});
  useEffect(() => {
    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => selection.current === null &&
        gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 60 || gesture.vy > 0.75) dismiss('cancel');
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        if (selection.current === null) Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    });
    setPanHandlers(panResponder.panHandlers);
  }, [dismiss, translateY]);
  useEffect(() => () => { translateY.stopAnimation(); opacity.stopAnimation(); }, [opacity, translateY]);
  return (
    <Modal visible={presented} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => dismiss('cancel')} onDismiss={complete}
      onShow={() => Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()}>
      <View style={styles.modal}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('community.cancel')}
            onPress={() => dismiss('cancel')} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, {
          paddingBottom: insets.bottom + spacing.space8,
          paddingLeft: insets.left + spacing.space20, paddingRight: insets.right + spacing.space20,
          transform: [{ translateY }],
        }]}>
          <View style={styles.handleArea} {...panHandlers}><View style={styles.handle} /></View>
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
