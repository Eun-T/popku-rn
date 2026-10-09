import { communityColors } from '../../theme/communityColors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, MessageSquare } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CommunityPostItem from '../../components/community/CommunityPostItem';
import { useCommunityNow } from '../../hooks/useCommunityNow';
import { clearTokens, getAuthUser, subscribeAuthSession } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { subscribeCommunityPostChanges, subscribeCommunityCommentCounts } from '../../lib/communityFeedRefresh';
import { appendMyPosts, getMyPosts, type MyPost } from '../../lib/myPosts';
import { colors, spacing, typography } from '../../theme/tokens';

import { useTranslation } from '../../hooks/useTranslation';

export default function MyPosts() {
  const { t } = useTranslation();
  const router = useRouter();
  const { now } = useCommunityNow();
  const [items, setItems] = useState<MyPost[]>([]);
  const [status, setStatus] = useState<'login' | 'loading' | 'ready' | 'error'>(getAuthUser() ? 'loading' : 'login');
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const cursor = useRef<string | null>(null);
  const initialized = useRef(false);
  const active = useRef(false);
  const opening = useRef(false);

  const load = useCallback(async (more: boolean) => {
    if (!active.current || !getAuthUser() || request.current || (more && (!initialized.current || cursor.current === null))) return;
    const after = more ? cursor.current : null;
    const controller = new AbortController();
    request.current = controller;
    setStatus(more ? 'ready' : 'loading');
    setLoadingMore(more);
    try {
      const page = await getMyPosts(after, controller.signal);
      if (controller.signal.aborted) return;
      setItems(current => appendMyPosts(more ? current : [], page.items));
      cursor.current = page.nextCursor === after ? null : page.nextCursor;
      initialized.current = true;
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      if (error instanceof CommunityApiError && error.status === 401) {
        try { await clearTokens(error.authGeneration); }
        catch { /* Preserve retry if local session cleanup fails. */ }
      }
    } finally {
      if (!controller.signal.aborted && request.current === controller) {
        request.current = null;
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => subscribeAuthSession(() => {
    request.current?.abort(); request.current = null;
    cursor.current = null; initialized.current = false;
    setItems([]); setLoadingMore(false);
    setStatus(getAuthUser() ? 'loading' : 'login');
    setRevision(value => value + 1);
  }), []);
  useFocusEffect(useCallback(() => {
    active.current = true; opening.current = false;
    setLoadingMore(false);
    if (!initialized.current) void load(false);
    return () => {
      active.current = false;
      request.current?.abort(); request.current = null;
    };
  }, [load, revision]));
  useEffect(() => subscribeCommunityPostChanges((id, patch, type) => {
    if (type !== 'POST') return;
    setItems(current => current.flatMap(item => item.id !== id ? [item] : patch ? [{ ...item, ...patch }] : []));
  }), []);
  useEffect(() => subscribeCommunityCommentCounts((id, count, type) => {
    if (type === 'POST') setItems(current => current.map(item => item.id === id ? { ...item, commentCount: count } : item));
  }), []);

  const footer = <View style={styles.footer}>
    {loadingMore && <ActivityIndicator accessibilityLabel={t('profile.posts.loadingMore')} color={colors.primary} />}
    {status === 'error' && <View style={items.length ? undefined : styles.empty}>
      <Text style={styles.emptyTitle}>{t('community.feed.loadFailed')}</Text>
      <Pressable accessibilityRole="button" onPress={() => { void load(initialized.current); }}>
        <Text style={styles.emptyDescription}>{t('profile.retry')}</Text>
      </Pressable>
    </View>}
    {status === 'ready' && !loadingMore && cursor.current !== null && <Pressable accessibilityRole="button" onPress={() => { void load(true); }}>
      <Text style={styles.emptyDescription}>{t('profile.posts.more')}</Text>
    </Pressable>}
  </View>;
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('language.back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.backButton}>
        <ChevronLeft size={24} color={colors.text} style={styles.backIcon} />
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{t('profile.posts.title')}</Text>
      <View pointerEvents="none" style={styles.backButton} />
    </View>
    <FlatList data={items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
      renderItem={({ item }) => <View style={styles.item}><CommunityPostItem post={item} now={now}
        onPressPost={() => {
          if (opening.current) return;
          opening.current = true;
          router.push({ pathname: '/community/[id]', params: { id: String(item.id) } });
        }} /></View>}
      ListEmptyComponent={status === 'loading' ? <ActivityIndicator accessibilityLabel={t('profile.posts.loading')} style={styles.empty} color={colors.primary} />
        : status === 'login' ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('profile.posts.loginTitle')}</Text>
          <Text style={styles.emptyDescription}>{t('profile.posts.loginDescription')}</Text>
        </View> : status === 'ready' ? <View style={styles.empty}>
          <MessageSquare size={36} color={colors.secondaryText} />
          <Text style={styles.emptyTitle}>{t('profile.posts.empty')}</Text>
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
