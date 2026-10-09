import { communityColors } from '../../theme/communityColors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CommunityPostItem from '../../components/community/CommunityPostItem';
import ReviewActions from '../../components/reviews/ReviewActions';
import { usePopupNavigation } from '../../hooks/usePopupNavigation';
import { useCommunityNow } from '../../hooks/useCommunityNow';
import { clearTokens, getAuthUser, subscribeAuthSession } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { subscribeCommunityPostChanges } from '../../lib/communityFeedRefresh';
import { appendMyReviews, getMyReviews, type MyReview } from '../../lib/myReviews';
import { subscribeReviews } from '../../lib/reviews';
import { colors, spacing, typography } from '../../theme/tokens';

import { useTranslation } from '../../hooks/useTranslation';

export default function MyReviews() {
  const { t } = useTranslation();
  const router = useRouter();
  const openPopup = usePopupNavigation();
  const { now } = useCommunityNow();
  const [items, setItems] = useState<MyReview[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const cursor = useRef<string | null>(null);
  const initialized = useRef(false);
  const failedMore = useRef(false);
  const navigationLocked = useRef(false);
  useFocusEffect(useCallback(() => { navigationLocked.current = false; }, []));
  function openReview(id: number) {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try { router.push({ pathname: '/reviews/[id]', params: { id: String(id) } }); }
    catch { navigationLocked.current = false; Alert.alert(t('place.detail.reviews.openFailed'), t('place.detail.tryLater')); }
  }

  const load = useCallback(async (more: boolean) => {
    if (request.current || (more && (!initialized.current || cursor.current === null))) return;
    const after = more ? cursor.current : null;
    const controller = new AbortController();
    request.current = controller;
    failedMore.current = more;
    setStatus(more ? 'ready' : 'loading');
    setLoadingMore(more);
    try {
      const page = await getMyReviews(after, controller.signal);
      if (controller.signal.aborted) return;
      setItems(current => appendMyReviews(more ? current : [], page.items));
      cursor.current = page.nextCursor === after ? null : page.nextCursor;
      initialized.current = true;
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      if (error instanceof CommunityApiError && error.status === 401) {
        try {
          const invalidated = await clearTokens(error.authGeneration);
          if (!controller.signal.aborted && invalidated) router.dismissTo('/profile/login');
        } catch { /* Keep the retry state if local session cleanup fails. */ }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoadingMore(false);
      }
    }
  }, [router]);

  useEffect(() => subscribeAuthSession(() => {
    request.current?.abort(); request.current = null;
    cursor.current = null; initialized.current = false;
    setItems([]);
    if (getAuthUser()) setRevision(value => value + 1);
    else router.dismissTo('/profile/login');
  }), [router]);
  useEffect(() => {
    void load(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [load, revision]);
  useEffect(() => subscribeCommunityPostChanges((id, patch, type) => {
    if (type !== 'REVIEW') return;
    setItems(current => current.flatMap(item => item.id !== id ? [item] : patch
      ? [{ ...item, ...patch, rating: patch.rating ?? item.rating }] : []));
  }), []);
  useEffect(() => subscribeReviews((_publicId, kind) => {
    if (kind !== 'created') return;
    request.current?.abort(); request.current = null;
    setRevision(value => value + 1);
  }), []);

  const footer = <View style={styles.footer}>
    {loadingMore && <ActivityIndicator accessibilityLabel={t('profile.reviews.loadingMore')} color={colors.primary} />}
    {status === 'error' && <View style={items.length ? undefined : styles.empty}>
      <Text style={styles.emptyTitle}>{t('place.detail.reviews.loadFailed')}</Text>
      <Pressable accessibilityRole="button" onPress={() => { void load(failedMore.current); }}>
        <Text style={styles.emptyDescription}>{t('profile.retry')}</Text>
      </Pressable>
    </View>}
    {status === 'ready' && !loadingMore && cursor.current !== null && <Pressable accessibilityRole="button" onPress={() => { void load(true); }}>
      <Text style={styles.emptyDescription}>{t('place.detail.reviews.more')}</Text>
    </Pressable>}
  </View>;
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('language.back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.backButton}>
        <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{t('profile.reviews.title')}</Text>
      <View pointerEvents="none" style={styles.backButton} />
    </View>
    <FlatList data={items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
      renderItem={({ item }) => <View style={styles.item}><CommunityPostItem post={item} now={now}
        onPressReview={() => openReview(item.id)} onPressPlace={openPopup}
        reviewActions={<ReviewActions review={item} />} /></View>}
      ListEmptyComponent={status === 'loading' ? <ActivityIndicator accessibilityLabel={t('profile.reviews.loading')} style={styles.empty} color={colors.primary} />
        : status === 'ready' ? <View style={styles.empty}>
          <Star size={36} color={colors.secondaryText} />
          <Text style={styles.emptyTitle}>{t('profile.reviews.empty')}</Text>
          <Text style={styles.emptyDescription}>{t('profile.reviews.emptyDescription')}</Text>
        </View> : null}
      ListFooterComponent={footer}
      onEndReached={() => { if (status === 'ready') void load(true); }} onEndReachedThreshold={0.3} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  backIcon: { alignSelf: 'flex-start' },
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16 , borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleS, color: colors.text, flex: 1, minWidth: 0, textAlign: 'center' },
  list: { paddingHorizontal: spacing.space16, paddingBottom: spacing.space32 },
  item: { borderBottomWidth: 1, borderBottomColor: colors.border },
  footer: { paddingVertical: spacing.space16 },
  empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.space16 },
  emptyTitle: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: spacing.space16, textAlign: 'center' },
  emptyDescription: { ...typography.label, color: colors.secondaryText, marginTop: spacing.space8, textAlign: 'center' },
});
