import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import CommunityPostItem from '../community/CommunityPostItem';
import { useCommunityNow } from '../../hooks/useCommunityNow';
import { getAuthSession, subscribeAuthSession } from '../../lib/auth';
import { subscribeCommunityLikes, subscribeCommunityCommentCounts, subscribeCommunityPostChanges } from '../../lib/communityFeedRefresh';
import { changeCommunityLike } from '../../lib/communityLikes';
import type { CommunityFeedItem } from '../../lib/community';
import { getPopupReviews, subscribeReviews } from '../../lib/reviews';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type Props = { publicId: string; title: string };
export default function PopupReviews({ publicId, title }: Props) {
  const router = useRouter();
  const { now } = useCommunityNow();
  const [items, setItems] = useState<CommunityFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const navigationLocked = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useFocusEffect(useCallback(() => { navigationLocked.current = false; }, []));
  useEffect(() => subscribeReviews(changed => { if (changed === publicId) setRevision(value => value + 1); }), [publicId]);
  useEffect(() => subscribeAuthSession(() => setRevision(value => value + 1)), []);
  useEffect(() => subscribeCommunityCommentCounts((id, count, type) => {
    setItems(current => current.map(item => type === 'REVIEW' && item.type === type && item.id === id
      ? { ...item, commentCount: count } : item));
  }), []);
  useEffect(() => subscribeCommunityLikes((id, state, type) => {
    setItems(current => current.map(item => !state ? { ...item, liked: false }
      : type === 'REVIEW' && item.type === 'REVIEW' && item.id === id ? { ...item, ...state } : item));
  }), []);
  useEffect(() => subscribeCommunityPostChanges((id, patch, type) => {
    if (type !== 'REVIEW') return;
    setItems(current => current.flatMap(item => item.type === type && item.id === id ? patch ? [{ ...item, ...patch }] : [] : [item]));
  }), []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  useEffect(() => {
    request.current?.abort(); busy.current = false;
    setItems([]); setCursor(null);
    void load(null);
    return () => request.current?.abort();
  }, [publicId, revision]);

  async function load(after: string | null) {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(false);
    try {
      const page = await getPopupReviews(publicId, after, controller.signal);
      if (!controller.signal.aborted) {
        setItems(current => after ? [...current, ...page.items.filter(item => !current.some(row => row.id === item.id))] : page.items);
        setCursor(page.nextCursor);
      }
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) { busy.current = false; setLoading(false); } }
  }
  async function write() {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try {
      const session = await getAuthSession();
      if (!mounted.current) return;
      router.push(session.accessToken
        ? { pathname: '/reviews/write', params: { publicId, title } }
        : '/profile/login');
    } catch {
      navigationLocked.current = false;
      if (mounted.current) Alert.alert('화면을 열지 못했어요', '잠시 후 다시 시도해 주세요.');
    }
  }
  function openReview(reviewId: number) {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try { router.push({ pathname: '/reviews/[id]', params: { id: String(reviewId) } }); }
    catch { navigationLocked.current = false; Alert.alert('화면을 열지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  }
  function login() {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    try { router.push('/profile/login'); }
    catch { navigationLocked.current = false; Alert.alert('화면을 열지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  }
  const writeButton = <Pressable accessibilityRole="button" accessibilityLabel="방문 리뷰 작성" onPress={() => { void write(); }} style={styles.write}>
    <Text style={styles.writeText}>방문 리뷰 작성</Text>
  </Pressable>;
  return <View style={styles.container}>
    {items.length > 0 && writeButton}
    {!loading && !error && items.length === 0 && <View style={styles.empty}>
      <Text style={styles.title}>아직 방문 리뷰가 없어요</Text>
      <Text style={styles.description}>이 팝업에 다녀오셨나요?{'\n'}첫 번째 리뷰를 남겨보세요.</Text>
      {writeButton}
    </View>}
    {items.map(item => <View key={item.id} style={styles.item}><CommunityPostItem post={item} now={now}
      onPressLike={item.type === 'REVIEW' ? () => { void changeCommunityLike(item, login,
        () => Alert.alert('좋아요를 변경하지 못했어요', '잠시 후 다시 시도해 주세요.')); } : undefined}
      onPressReview={item.type === 'REVIEW' ? () => openReview(item.id) : undefined} /></View>)}
    {loading && <ActivityIndicator style={styles.status} color={communityColors.charcoal} />}
    {error && <View style={styles.status}>
      <Text style={styles.description}>방문 리뷰를 불러오지 못했어요</Text>
      <Pressable accessibilityRole="button" onPress={() => { void load(items.length ? cursor : null); }}><Text style={styles.retry}>다시 시도</Text></Pressable>
      {items.length === 0 && writeButton}
    </View>}
    {!loading && !error && cursor && <Pressable accessibilityRole="button" onPress={() => { void load(cursor); }} style={styles.more}>
      <Text style={styles.retry}>리뷰 더 보기</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.space16, paddingVertical: spacing.space24 },
  empty: { alignItems: 'center', paddingVertical: spacing.space40 },
  title: { ...typography.titleS, color: communityColors.text },
  description: { ...typography.label, color: communityColors.secondaryText, textAlign: 'center', marginVertical: spacing.space12 },
  write: { minHeight: 44, paddingHorizontal: spacing.space20, paddingVertical: spacing.space12, borderRadius: radius.radius8,
    backgroundColor: communityColors.charcoal, alignItems: 'center', justifyContent: 'center' },
  writeText: { ...typography.label, fontWeight: '600', color: communityColors.white },
  item: { borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  status: { paddingVertical: spacing.space24 },
  retry: { ...typography.label, color: communityColors.charcoal, textAlign: 'center' },
  more: { paddingVertical: spacing.space16, backgroundColor: communityColors.mutedSurface, borderRadius: radius.radius8 },
});
