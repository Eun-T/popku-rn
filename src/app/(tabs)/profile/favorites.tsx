import { usePopupNavigation } from '../../../hooks/usePopupNavigation';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, Heart } from 'lucide-react-native';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearTokens } from '../../../lib/auth';
import { FavoriteUnauthorizedError, getFavoritePopups } from '../../../lib/favorites';
import { getFavoriteCache, subscribeFavoriteCache } from '../../../lib/favoriteCache';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const placeholderImage = require('../../../../assets/images/ranking-placeholder.png');

function formatDate(value: string): string {
  return value.replace(/-/g, '.');
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return end ? formatDate(end) : '일정 미정';
  if (!end) return formatDate(start);
  const endLabel = start.slice(0, 4) === end.slice(0, 4) ? formatDate(end).slice(5) : formatDate(end);
  return `${formatDate(start)} - ${endLabel}`;
}

export default function FavoritePopups() {
  const router = useRouter();
  const openPopup = usePopupNavigation();
  const cachedPopups = useSyncExternalStore(subscribeFavoriteCache, getFavoriteCache, getFavoriteCache);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(getFavoriteCache() ? 'ready' : 'loading');
  const [retryKey, setRetryKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setStatus(getFavoriteCache() ? 'ready' : 'loading');
    void getFavoritePopups(controller.signal).then(() => {
      if (active) {
        setStatus(getFavoriteCache() ? 'ready' : 'loading');
      }
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof FavoriteUnauthorizedError) {
        void clearTokens(error.authGeneration).catch(() => true).then((invalidated) => {
          if (invalidated !== false && active) router.replace('/profile/login');
        });
      } else {
        if (__DEV__) console.info('[FAVORITE] list failed', error instanceof Error ? error.message : 'unknown error');
        setStatus(getFavoriteCache() ? 'ready' : 'error');
      }
    });
    return () => { active = false; controller.abort(); };
  }, [router, retryKey]));

  const popups = cachedPopups ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>찜한 팝업</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {!cachedPopups && status === 'loading' ? (
          <ActivityIndicator style={styles.empty} color={colors.primary} />
        ) : !cachedPopups && status === 'error' ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>찜한 팝업을 불러오지 못했어요</Text>
            <Pressable accessibilityRole="button" onPress={() => setRetryKey((current) => current + 1)}>
              <Text style={styles.emptyDescription}>다시 시도하기</Text>
            </Pressable>
          </View>
        ) : popups.length === 0 ? (
          <View style={styles.empty}>
            <Heart size={36} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>아직 찜한 팝업이 없어요</Text>
            <Text style={styles.emptyDescription}>관심 있는 팝업을 찜해보세요</Text>
          </View>
        ) : popups.map((popup) => (
          <Pressable key={popup.publicId} accessibilityRole="button" accessibilityLabel={`${popup.name} 상세 보기`} onPress={() => openPopup(popup.publicId)} style={styles.item}>
            <Image source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage} resizeMode="cover" style={styles.poster} />
            <View style={styles.itemContent}>
              <Text numberOfLines={2} style={styles.popupTitle}>{popup.name}</Text>
              <Text numberOfLines={1} style={styles.period}>{formatPeriod(popup.startDate, popup.endDate)}</Text>
              <View style={styles.tags}>
                {popup.tags.map((tag) => <View key={tag.id} style={styles.tag}><Text numberOfLines={1} style={styles.tagText}>{tag.name}</Text></View>)}
              </View>
            </View>
            <View accessibilityLabel="찜됨" style={styles.heart}>
              <Heart size={22} color={colors.primary} fill={colors.primary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleM, color: colors.text, marginLeft: spacing.space8 },
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
