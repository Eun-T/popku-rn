import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CommunityAuthor from '../../components/community/CommunityAuthor';
import CommunityImageCarousel from '../../components/community/CommunityImageCarousel';
import CommunityComments from '../../components/community/CommunityComments';
import CommunityPostMenu from '../../components/community/CommunityPostMenu';
import { CommunityApiError, deleteCommunityPost, getCommunityPost, type CommunityPostDetail } from '../../lib/community';
import { publishCommunityPostChange, subscribeCommunityPostChanges, subscribeCommunityLikes, subscribeCommunityCommentCounts } from '../../lib/communityFeedRefresh';
import { changeCommunityLike } from '../../lib/communityLikes';
import { clearTokens, subscribeAuthSession } from '../../lib/auth';
import { useCommunityNow } from '../../hooks/useCommunityNow';
import { t } from '../../locales';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

export default function CommunityPostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { now } = useCommunityNow();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [menuSelection, setMenuSelection] = useState<((index: number) => void) | null>(null);
  const deletingRef = useRef(false);
  const menuRef = useRef(false);
  const navigationRef = useRef(false);
  const focusedRef = useRef(true);
  useFocusEffect(useCallback(() => {
    navigationRef.current = false; focusedRef.current = true;
    return () => { focusedRef.current = false; };
  }, []));
  const padding = { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 };

  useEffect(() => subscribeCommunityLikes((postId, state, type = 'POST') => {
    setPost((current) => current && (!state || (type === 'POST' && current.id === postId))
      ? { ...current, ...(state ?? { liked: false }) } : current);
  }), []);
  useEffect(() => subscribeAuthSession(() => setRetry((value) => value + 1)), []);
  useEffect(() => subscribeCommunityCommentCounts((postId, count, type = 'POST') => {
    setPost((current) => type === 'POST' && current?.id === postId ? { ...current, commentCount: count } : current);
  }), []);
  useEffect(() => subscribeCommunityPostChanges((postId, patch, type = 'POST') => {
    if (type !== 'POST') return;
    if (patch) setPost((current) => current?.id === postId ? { ...current, ...patch } : current);
  }), []);

  function editPost() {
    if (!post?.isOwner || navigationRef.current || deletingRef.current) return;
    navigationRef.current = true;
    try { router.push({ pathname: '/community/write', params: { editId: String(post.id) } }); }
    catch { navigationRef.current = false; Alert.alert(t('community.edit.failed')); }
  }

  async function removePost() {
    if (!post?.isOwner || deletingRef.current) return;
    deletingRef.current = true; setDeleting(true);
    try {
      await deleteCommunityPost(post.id);
      publishCommunityPostChange(post.id, null);
      if (focusedRef.current) router.back();
    } catch (reason) {
      if (reason instanceof CommunityApiError && reason.status === 401) {
        const invalidated = await clearTokens(reason.authGeneration).catch(() => true);
        if (invalidated !== false && focusedRef.current) router.push('/profile/login');
      } else Alert.alert(t('community.delete.failed'));
    } finally { deletingRef.current = false; menuRef.current = false; setDeleting(false); }
  }

  function confirmDelete() {
    menuRef.current = true;
    Alert.alert(t('community.delete.title'), t('community.delete.message'), [
      { text: t('community.cancel'), style: 'cancel', onPress: () => { menuRef.current = false; } },
      { text: t('community.delete.confirm'), style: 'destructive', onPress: () => { void removePost(); } },
    ], { cancelable: true, onDismiss: () => { if (!deletingRef.current) menuRef.current = false; } });
  }

  function openMenu() {
    if (!post?.isOwner || menuRef.current || deletingRef.current || navigationRef.current) return;
    menuRef.current = true;
    const select = (index: number) => {
      setMenuSelection(null);
      menuRef.current = false;
      if (index === 1) editPost();
      else if (index === 2) confirmDelete();
    };
    setMenuSelection(() => select);
  }

  useEffect(() => {
    const request = new AbortController();
    setPost(null); setLoading(true); setError(null);
    const postId = typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
    void getCommunityPost(postId, request.signal).then((result) => {
      if (!request.signal.aborted) setPost(result);
    }).catch((reason: unknown) => {
      if (!request.signal.aborted) setError(reason instanceof CommunityApiError && reason.status === 404 ? 'missing' : 'failed');
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [id, retry]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={[styles.header, padding]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('community.writeBack')} style={styles.headerAction}
          disabled={deleting}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/community')}>
          <ChevronLeft size={24} color={communityColors.text} />
        </Pressable>
        <Text style={styles.title}>{t('community.detail.title')}</Text>
        {post?.isOwner ? <Pressable accessibilityRole="button" accessibilityLabel={t('community.postMenu')}
          disabled={deleting} onPress={openMenu} style={styles.headerAction}>
          {deleting ? <ActivityIndicator color={communityColors.charcoal} /> : <MoreHorizontal size={24} color={communityColors.text} />}
        </Pressable> : <View style={styles.headerAction}><MoreHorizontal size={24} color={communityColors.text} /></View>}
      </View>
      {loading ? <ActivityIndicator style={styles.status} color={communityColors.charcoal} />
        : error ? <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.statusText}>{t(`community.detail.${error}`)}</Text>
          {error === 'failed' ? <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.retry}>
            <Text style={styles.statusText}>{t('community.detail.retry')}</Text>
          </Pressable> : null}
        </View> : post ? <CommunityComments key={post.id} postId={post.id} commentCount={post.commentCount} now={now} padding={padding}
          onLogin={() => router.push('/profile/login')}>
          <View style={[styles.content, padding]}>
          <View style={styles.badge}><Text style={styles.badgeText}>{t(`community.category.${post.category.toLowerCase()}`)}</Text></View>
          <CommunityAuthor author={post.author} createdAt={post.createdAt} now={now} />
          <Text style={styles.body}>{post.content}</Text>
          <CommunityImageCarousel key={`${post.id}:${post.imageIds?.join(',') ?? post.images.join('|')}`} images={post.images} />
          <Text style={styles.meta}>{t('community.views', { count: post.viewCount })}</Text>
          <View style={styles.counts}>
            <Pressable style={styles.count} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={post.liked ? '좋아요 취소' : '좋아요'} accessibilityState={{ selected: post.liked }}
              onPress={() => { void changeCommunityLike(post, () => router.push('/profile/login'),
                () => Alert.alert('좋아요를 변경하지 못했어요', '잠시 후 다시 시도해 주세요.')); }}>
              <Heart size={16} color={post.liked ? communityColors.charcoal : communityColors.secondaryText}
                fill={post.liked ? communityColors.charcoal : 'none'} /><Text style={styles.meta}>{post.likeCount}</Text>
            </Pressable>
            <View style={styles.count}><MessageCircle size={16} color={communityColors.secondaryText} /><Text style={styles.meta}>{post.commentCount}</Text></View>
          </View>
          </View>
        </CommunityComments> : null}
      {menuSelection ? <CommunityPostMenu onSelect={menuSelection} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: communityColors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  headerAction: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleS, color: communityColors.text },
  content: { paddingTop: spacing.space24, paddingBottom: spacing.space40, rowGap: spacing.space16 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.space8, height: 24, borderRadius: radius.full, backgroundColor: communityColors.mutedSurface, justifyContent: 'center' },
  badgeText: { ...typography.caption, color: communityColors.charcoal },
  body: { ...typography.body, color: communityColors.text },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  counts: { flexDirection: 'row', columnGap: spacing.space16 },
  count: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { ...typography.label, color: communityColors.secondaryText },
  retry: { padding: spacing.space16 },
});
