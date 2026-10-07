import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle, MoreHorizontal, Star } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CommunityAuthor from '../../components/community/CommunityAuthor';
import CommunityImageCarousel from '../../components/community/CommunityImageCarousel';
import CommunityComments from '../../components/community/CommunityComments';
import CommunityPostMenu from '../../components/community/CommunityPostMenu';
import { useCommunityNow } from '../../hooks/useCommunityNow';
import { clearTokens, subscribeAuthSession } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { getReviewDetail, applyReviewChange, deleteReview, type ReviewDetail } from '../../lib/reviews';
import { publishCommunityPostChange, subscribeCommunityLikes, subscribeCommunityCommentCounts, subscribeCommunityPostChanges } from '../../lib/communityFeedRefresh';
import { changeCommunityLike } from '../../lib/communityLikes';
import { t } from '../../locales';
import { communityColors } from '../../theme/communityColors';
import { spacing, typography } from '../../theme/tokens';

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter(); const navigation = useNavigation();
  const { now } = useCommunityNow(); const insets = useSafeAreaInsets();
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [retry, setRetry] = useState(0);
  const navigationLocked = useRef(false);
  const menuLocked = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const deletedRef = useRef(false);
  const focusedRef = useRef(true);
  useFocusEffect(useCallback(() => {
    navigationLocked.current = false; focusedRef.current = true;
    return () => { focusedRef.current = false; };
  }, []));
  useEffect(() => subscribeAuthSession(() => setRetry(value => value + 1)), []);
  useEffect(() => subscribeCommunityCommentCounts((id, count, type) => {
    setReview(current => type === 'REVIEW' && current?.id === id ? { ...current, commentCount: count } : current);
  }), []);
  useEffect(() => subscribeCommunityLikes((reviewId, state, type) => {
    setReview(current => current && (!state || (type === 'REVIEW' && current.id === reviewId))
      ? { ...current, ...(state ?? { liked: false }) } : current);
  }), []);
  useEffect(() => subscribeCommunityPostChanges((reviewId, patch, type) => {
    if (type !== 'REVIEW' || String(reviewId) !== id) return;
    if (!patch) { deletedRef.current = true; setReview(null); setError('missing'); setLoading(false); }
    else if (!deletedRef.current) setReview(current => current?.id === reviewId ? applyReviewChange(current, patch) : current);
  }), [id]);
  useEffect(() => {
    const request = new AbortController();
    deletedRef.current = false;
    setReview(null); setLoading(true); setError(null);
    const reviewId = typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
    void getReviewDetail(reviewId, request.signal).then(result => {
      if (!request.signal.aborted && !deletedRef.current) setReview(result);
    }).catch((reason: unknown) => {
      if (!request.signal.aborted) setError(reason instanceof CommunityApiError && reason.status === 404 ? 'missing' : 'failed');
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [id, retry]);
  const padding = { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 };
  function openPopup() {
    if (!review?.popup || navigationLocked.current || deletingRef.current) return;
    navigationLocked.current = true;
    try {
      const stack = navigation.getState();
      const previous = stack ? stack.routes[stack.index - 1] : undefined;
      // Return only to the popup that actually opened this review. Otherwise keep
      // the review in history so popup back returns here (including feed entry).
      if (previous?.name === 'places/[id]' && previous.params && 'id' in previous.params
        && previous.params.id === review.popup.publicId) router.back();
      else router.push({ pathname: '/places/[id]', params: { id: review.popup.publicId } });
    }
    catch { navigationLocked.current = false; Alert.alert('화면을 열지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  }
  function login() {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try { router.push('/profile/login'); }
    catch { navigationLocked.current = false; Alert.alert('화면을 열지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  }
  async function removeReview() {
    if (!review?.isOwner || deletingRef.current || deletedRef.current) return;
    deletingRef.current = true; setDeleting(true);
    try {
      await deleteReview(review.id);
      publishCommunityPostChange(review.id, null, 'REVIEW');
      if (focusedRef.current) router.back();
    } catch (reason) {
      if (reason instanceof CommunityApiError && reason.status === 401) {
        if (await clearTokens(reason.authGeneration).catch(() => false)) {
          if (focusedRef.current) login();
        }
      } else Alert.alert('리뷰를 삭제하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally { deletingRef.current = false; menuLocked.current = false; setDeleting(false); }
  }
  function confirmDelete() {
    if (deletingRef.current || deletedRef.current) return;
    menuLocked.current = true;
    Alert.alert('리뷰를 삭제할까요?', t('community.delete.message'), [
      { text: t('community.cancel'), style: 'cancel', onPress: () => { menuLocked.current = false; } },
      { text: t('community.delete.confirm'), style: 'destructive', onPress: () => { void removeReview(); } },
    ], { cancelable: true, onDismiss: () => { if (!deletingRef.current) menuLocked.current = false; } });
  }
  return <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
    <View style={[styles.header, padding]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('community.writeBack')} style={styles.headerAction}
        disabled={deleting}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/community')}>
        <ChevronLeft size={24} color={communityColors.text} />
      </Pressable>
      <Text style={styles.title}>방문 리뷰</Text>
      {review?.isOwner ? <Pressable accessibilityRole="button" accessibilityLabel="리뷰 메뉴" style={styles.headerAction}
        disabled={deleting}
        onPress={() => { if (!menuLocked.current && !navigationLocked.current && !deletingRef.current) { menuLocked.current = true; setMenuOpen(true); } }}>
        <MoreHorizontal size={22} color={communityColors.text} />
      </Pressable> : <View style={styles.headerAction} />}
    </View>
    {loading ? <ActivityIndicator style={styles.status} color={communityColors.charcoal} />
      : error ? <View style={styles.status}>
        <Text accessibilityRole="alert" style={styles.statusText}>{error === 'missing' ? '방문 리뷰를 찾을 수 없어요.' : '방문 리뷰를 불러오지 못했어요.'}</Text>
        {error === 'failed' && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}>
          <Text style={styles.statusText}>{t('community.detail.retry')}</Text>
        </Pressable>}
      </View> : review ? <CommunityComments key={review.id} targetType="REVIEW" targetId={review.id}
        commentCount={review.commentCount} now={now} padding={padding} onLogin={login} mutationDisabled={deleting}>
        <View style={[styles.content, padding]}>
        <CommunityAuthor author={review.author} createdAt={review.createdAt} now={now} />
        <View style={styles.rating}><Star size={16} color="#FACC15" fill="#FACC15" /><Text style={styles.ratingText}>{review.rating.toFixed(1)}</Text></View>
        {review.popup && <Pressable accessibilityRole="button" accessibilityLabel={review.popup.title} disabled={deleting} onPress={openPopup} style={styles.popup}>
          <MapPin size={16} color={communityColors.placeLink} />
          <Text style={styles.popupTitle} numberOfLines={1} ellipsizeMode="tail">{review.popup.title}</Text>
          <ChevronRight size={16} color={communityColors.placeLink} />
        </Pressable>}
        <Text style={styles.body}>{review.content}</Text>
        <CommunityImageCarousel key={`${review.id}:${review.images.map(image => image.id).join(',')}`} images={review.images.map(image => image.url)} />
        <View style={styles.counts}>
          <Pressable style={styles.count} hitSlop={8} accessibilityRole="button"
            disabled={deleting}
            accessibilityLabel={review.liked ? '좋아요 취소' : '좋아요'} accessibilityState={{ selected: review.liked }}
            onPress={() => { if (deletingRef.current || deletedRef.current) return; void changeCommunityLike(review, login,
              () => Alert.alert('좋아요를 변경하지 못했어요', '잠시 후 다시 시도해 주세요.')); }}>
            <Heart size={16} color={review.liked ? communityColors.charcoal : communityColors.secondaryText}
              fill={review.liked ? communityColors.charcoal : 'none'} /><Text style={styles.meta}>{review.likeCount}</Text>
          </Pressable>
          <View style={styles.count}><MessageCircle size={16} color={communityColors.secondaryText} /><Text style={styles.meta}>{review.commentCount}</Text></View>
        </View>
        </View>
      </CommunityComments> : null}
    {menuOpen && <CommunityPostMenu onSelect={index => {
      setMenuOpen(false); menuLocked.current = false;
      if (!review?.isOwner || navigationLocked.current || deletingRef.current || deletedRef.current) return;
      if (index === 2) { confirmDelete(); return; }
      if (index !== 1) return;
      navigationLocked.current = true;
      try { router.push({ pathname: '/reviews/write', params: { editId: String(review.id) } }); }
      catch { navigationLocked.current = false; Alert.alert('수정 화면을 열지 못했어요'); }
    }} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: communityColors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  headerAction: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleS, color: communityColors.text },
  content: { paddingTop: spacing.space24, paddingBottom: spacing.space40, rowGap: spacing.space16 },
  rating: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  ratingText: { ...typography.label, fontWeight: '600', color: communityColors.text },
  popup: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  popupTitle: { flexShrink: 1, ...typography.label, color: communityColors.placeLink },
  body: { ...typography.body, color: communityColors.text },
  meta: { ...typography.caption, color: communityColors.secondaryText },
  counts: { flexDirection: 'row', columnGap: spacing.space16 },
  count: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space4 },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { ...typography.label, color: communityColors.secondaryText },
  retry: { padding: spacing.space16 },
});
