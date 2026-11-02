import { useFocusEffect, useRouter } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import HomeSeoulMapSurface from './HomeSeoulMapSurface';
import { getHomeSeoulMapCount } from './homeSeoulMapCount';

export type HomeSeoulMapHandle = { checkVisibility: () => void };

export default forwardRef<HomeSeoulMapHandle>(function HomeSeoulMapSection(_props, ref) {
  const { t } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const section = useRef<View>(null);
  const active = useRef(false);
  const activated = useRef(false);
  const [focused, setFocused] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const checkVisibility = useCallback(() => {
    if (!active.current || activated.current) return;
    section.current?.measureInWindow((_x, y, _width, sectionHeight) => {
      if (active.current && y < height + 200 && y + sectionHeight > -200) {
        activated.current = true;
        setNearby(true);
      }
    });
  }, [height]);
  useImperativeHandle(ref, () => ({ checkVisibility }), [checkVisibility]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    setFocused(true);
    checkVisibility();
    return () => { active.current = false; setFocused(false); };
  }, [checkVisibility]));
  const shouldMount = focused && nearby && Platform.OS !== 'web';
  useEffect(() => {
    if (!focused || !nearby) return;
    let current = true;
    setTotal(null);
    void getHomeSeoulMapCount().then(count => { if (current) setTotal(count); });
    return () => { current = false; };
  }, [focused, nearby]);
  useEffect(() => {
    setStatus('loading');
    if (!shouldMount) return;
    const timeout = setTimeout(() => setStatus(current => current === 'ready' ? current : 'error'), 15_000);
    return () => clearTimeout(timeout);
  }, [shouldMount]);
  const onLoaded = useCallback(() => { if (active.current) setStatus('ready'); }, []);
  return (
    <View ref={section} collapsable={false} onLayout={checkVisibility} style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
          style={styles.heading}>{t('home.seoulMap.title')}</Text>
        {total !== null && (
          <Text style={styles.total} accessibilityLiveRegion="polite">
            {t('home.seoulMap.totalPrefix')} <Text style={styles.totalNumber}>{total}</Text> {t('home.seoulMap.totalSuffix')}
          </Text>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('home.seoulMap.open')}
        onPress={() => router.navigate('/(tabs)/map')}
        style={[styles.frame, { height: Math.min(320, Math.max(240, width * 0.6)) }]}>
        {shouldMount && <HomeSeoulMapSurface onLoaded={onLoaded} />}
        {(status !== 'ready' || Platform.OS === 'web') && (
          <View pointerEvents="none" style={styles.state}>
            <Text style={styles.stateText}>{t(status === 'error' || Platform.OS === 'web' ? 'home.seoulMap.failed' : 'home.seoulMap.loading')}</Text>
            <Text style={styles.linkText}>{t('home.seoulMap.open')}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 52, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { flexShrink: 1, fontSize: 20, fontWeight: '700', lineHeight: 28, color: '#111827' },
  total: { flexShrink: 0, fontSize: 14, fontWeight: '400', lineHeight: 28, color: '#111827' },
  totalNumber: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  frame: { marginTop: 20, width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#F5F5F7' },
  state: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#F5F5F7' },
  stateText: { fontSize: 14, lineHeight: 20, color: '#6B7280', textAlign: 'center' },
  linkText: { marginTop: 12, fontSize: 14, fontWeight: '600', lineHeight: 20, color: '#7839EF' },
});
