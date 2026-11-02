import { useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useHomePopups } from '../../hooks/useHomePopups';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import SkeletonBlock from '../common/SkeletonBlock';
import { formatLatestPopupPeriod } from './HomeLatestPopupSection';
import JapanNewPopupCard from './JapanNewPopupCard';



export type JapanNewSectionHandle = { checkVisibility: () => void };
export default forwardRef<JapanNewSectionHandle, { onPressPopup: (id: string) => void }>(function HomeJapanNewPopupSection({ onPressPopup }, ref) {
  const section = useRef<View>(null);
  const active = useRef(false);
  const activated = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const { t, resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const { width, height } = useWindowDimensions();
  const cardWidth = (width - spacing.space16 * 2 - spacing.space12) / 2;
  const { status, popups, recoverCover } = useHomePopups('japanNew', 'JP', enabled);
  const checkVisibility = useCallback(() => {
    if (!active.current || activated.current) return;
    section.current?.measureInWindow((_x, y, _width, sectionHeight) => {
      if (active.current && y < height + 300 && y + sectionHeight > -300) {
        activated.current = true;
        setEnabled(true);
      }
    });
  }, [height]);
  useImperativeHandle(ref, () => ({ checkVisibility }), [checkVisibility]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    checkVisibility();
    return () => { active.current = false; };
  }, [checkVisibility]));
  return (
    <View ref={section} collapsable={false} onLayout={checkVisibility}>
      <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('home.japanNew.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.viewport} contentContainerStyle={styles.track}>
        {status === 'loading' && [0, 1].map(index => (
          <View key={index} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SkeletonBlock width={cardWidth} height={cardWidth * 4 / 3} borderRadius={5} backgroundColor={themeColors.skeletonBackground} />
          </View>
        ))}
        {status === 'error' && <Text style={{ color: themeColors.textSecondary }}>{t('home.loadFailed')}</Text>}
        {status === 'ready' && popups.length === 0 && <Text style={{ color: themeColors.textSecondary }}>{t('home.japanNew.empty')}</Text>}
        {popups.map(popup => (
          <JapanNewPopupCard key={popup.publicId} width={cardWidth} popup={popup}
            coverScope={`JP:${resolvedLanguage}`} onRecoverCover={recoverCover}
            period={formatLatestPopupPeriod(popup.startDate, popup.endDate)}
            onPress={() => onPressPopup(popup.publicId)} />
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  title: { ...typography.titleM, marginHorizontal: spacing.space16 },
  viewport: { marginTop: spacing.space12 },
  track: { paddingHorizontal: spacing.space16, gap: spacing.space12 },
});
