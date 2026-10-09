import { usePopupNavigation } from '../../hooks/usePopupNavigation';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, Heart } from 'lucide-react-native';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearTokens, getAuthSession } from '../../lib/auth';
import { FavoriteUnauthorizedError, getFavoritePopups } from '../../lib/favorites';
import { favoriteSessionGeneration, getFavoriteCache, subscribeFavoriteCache } from '../../lib/favoriteCache';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { communityColors } from '../../theme/communityColors';

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function formatDate(value: string): string {
  return value.replace(/-/g, '.');
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined, undetermined = '일정 미정'): string {
  if (!start) return end ? formatDate(end) : undetermined;
  if (!end) return formatDate(start);
  const endLabel = start.slice(0, 4) === end.slice(0, 4) ? formatDate(end).slice(5) : formatDate(end);
  return `${formatDate(start)} - ${endLabel}`;
}

import { useTranslation } from '../../hooks/useTranslation';
import { getTagDisplayName } from '../../locales/filterLabels';

export default function FavoritePopups() {
  const { t, resolvedLanguage } = useTranslation();
  const router = useRouter();
  const openPopup = usePopupNavigation();
  const cachedPopups = useSyncExternalStore(subscribeFavoriteCache, getFavoriteCache, getFavoriteCache);
  const generation = useSyncExternalStore(subscribeFavoriteCache, favoriteSessionGeneration, favoriteSessionGeneration);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(getFavoriteCache() ? 'ready' : 'loading');
  const [retryKey, setRetryKey] = useState(0);
  const [loadGeneration, setLoadGeneration] = useState(generation);
  const retrying = useRef(false);
  const redirecting = useRef(false);
  const visibleStatus = loadGeneration === generation ? status : 'loading';
  const openLogin = () => {
    if (redirecting.current) return;
    redirecting.current = true;
    router.dismissTo('/profile/login');
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    const isCurrent = () => active && generation === favoriteSessionGeneration();
    retrying.current = true;
    setLoadGeneration(generation);
    setStatus(getFavoriteCache() ? 'ready' : 'loading');
    void (async () => {
      const { accessToken } = await getAuthSession();
      if (!isCurrent()) return;
      if (!accessToken) { openLogin(); return; }
      redirecting.current = false;
      await getFavoritePopups(controller.signal);
      if (isCurrent() && !getFavoriteCache()) await getFavoritePopups(controller.signal);
      if (isCurrent()) {
        setStatus(getFavoriteCache() ? 'ready' : 'error');
      }
    })().catch((error: unknown) => {
      if (!isCurrent()) return;
      if (error instanceof FavoriteUnauthorizedError) {
        void clearTokens(error.authGeneration).catch(() => true).then(async (invalidated) => {
          if (invalidated === false || !active) return;
          const loggedOutGeneration = favoriteSessionGeneration();
          const session = await getAuthSession().catch(() => null);
          if (active && session && !session.accessToken && loggedOutGeneration === favoriteSessionGeneration()) openLogin();
        });
      } else {
        if (__DEV__) console.info('[FAVORITE] list failed', error instanceof Error ? error.message : 'unknown error');
        setStatus(getFavoriteCache() ? 'ready' : 'error');
      }
    }).finally(() => { if (isCurrent()) retrying.current = false; });
    return () => { active = false; controller.abort(); };
  }, [router, retryKey, generation]));

  const popups = cachedPopups ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('language.back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{t('profile.favorites.title')}</Text>
        <View pointerEvents="none" style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {!cachedPopups && visibleStatus === 'loading' ? (
          <ActivityIndicator style={styles.empty} color={colors.primary} />
        ) : !cachedPopups && visibleStatus === 'error' ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('profile.favorites.loadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={() => {
              if (retrying.current) return;
              retrying.current = true;
              setRetryKey((current) => current + 1);
            }}>
              <Text style={styles.emptyDescription}>{t('profile.retry')}</Text>
            </Pressable>
          </View>
        ) : popups.length === 0 ? (
          <View style={styles.empty}>
            <Heart size={36} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>{t('profile.favorites.empty')}</Text>
            <Text style={styles.emptyDescription}>{t('profile.favorites.emptyDescription')}</Text>
          </View>
        ) : popups.map((popup) => (
          <Pressable key={popup.publicId} accessibilityRole="button" accessibilityLabel={t('place.explore.viewDetails', { title: popup.name })} onPress={() => openPopup(popup.publicId)} style={styles.item}>
            <Image source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage} resizeMode="cover" style={styles.poster} />
            <View style={styles.itemContent}>
              <Text numberOfLines={2} style={styles.popupTitle}>{popup.name}</Text>
              <Text numberOfLines={1} style={styles.period}>{formatPeriod(popup.startDate, popup.endDate, t('place.detail.schedulePending'))}</Text>
              <View style={styles.tags}>
                {popup.tags.map((tag) => <View key={tag.id} style={styles.tag}><Text numberOfLines={1} style={styles.tagText}>{getTagDisplayName(tag, resolvedLanguage)}</Text></View>)}
              </View>
            </View>
            <View accessibilityLabel={t('profile.favorites.favorited')} style={styles.heart}>
              <Heart size={22} color={colors.primary} fill={colors.primary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backIcon: { alignSelf: 'flex-start' },
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16, borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleS, color: colors.text, flex: 1, minWidth: 0, textAlign: 'center' },
  list: { paddingHorizontal: spacing.space16, paddingBottom: spacing.space32 },
  item: {
    flexDirection: 'row', alignItems: 'center', minHeight: 132,
    paddingVertical: spacing.space12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  poster: { width: 88, height: 108, borderRadius: radius.radius8 },
  itemContent: { flex: 1, minWidth: 0, marginLeft: spacing.space12 },
  popupTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  period: { ...typography.caption, color: colors.secondaryText, marginTop: spacing.space8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.space4, marginTop: spacing.space8 },
  tag: { maxWidth: '100%', borderRadius: radius.radius4, backgroundColor: colors.surface, paddingHorizontal: spacing.space6, paddingVertical: spacing.space4 },
  tagText: { ...typography.caption, color: colors.secondaryText },
  heart: { width: 32, alignSelf: 'center', alignItems: 'flex-end' },
  empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.space16 },
  emptyTitle: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: spacing.space16, textAlign: 'center' },
  emptyDescription: { ...typography.label, color: colors.secondaryText, marginTop: spacing.space8, textAlign: 'center' },
});
