import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ChevronLeft, ImagePlus, Star, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearTokens } from '../../lib/auth';
import { CommunityApiError } from '../../lib/community';
import { ImageSelectionError, MAX_POST_IMAGES, selectPostImages, type PostImage } from '../../lib/communityImages';
import { getPopupDetail } from '../../lib/popups';
import { getReviewDetail, reviewUpdated, updateReview, updateReviewWithImages, type ReviewEditAttempt, createReview, MAX_REVIEW_CONTENT_BYTES, publishReviewWithImages, reviewContentBytes, reviewsCreated, type ReviewAttempt } from '../../lib/reviews';
import { t } from '../../locales';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type DraftImage = ({ kind: 'existing'; id: number; uri: string }) | (PostImage & { kind: 'new' });

export default function ReviewWriteScreen() {
  const { publicId: routePublicId, editId } = useLocalSearchParams<{ publicId?: string; editId?: string }>();
  const editing = editId !== undefined;
  const reviewId = typeof editId === 'string' && /^[1-9]\d*$/.test(editId) ? Number(editId) : 0;
  const [publicId, setPublicId] = useState(routePublicId);
  const router = useRouter(); const navigation = useNavigation(); const insets = useSafeAreaInsets();
  const [title, setTitle] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false); const [retry, setRetry] = useState(0);
  const [rating, setRating] = useState(0); const [content, setContent] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [selecting, setSelecting] = useState(false); const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const attempt = useRef<ReviewAttempt | null>(null);
  const editAttempt = useRef<ReviewEditAttempt | null>(null);
  const busy = useRef(false); const selectingRef = useRef(false); const allowLeave = useRef(false); const mounted = useRef(true);
  const validPopup = typeof publicId === 'string' && publicId.length > 0;
  const locked = submitting || pending || !title || loadError;
  const contentValid = reviewContentBytes(content) <= MAX_REVIEW_CONTENT_BYTES;
  const canRegister = !!title && !loadError && Number.isInteger(rating) && rating >= 1 && rating <= 5 && contentValid && !submitting && !selecting;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setTitle(null); setLoadError(false);
    if (editing) {
      void getReviewDetail(reviewId, controller.signal, true).then(review => {
        if (controller.signal.aborted) return;
        setTitle(review.popup?.title ?? null); setPublicId(review.popup?.publicId);
        setRating(review.rating); setContent(review.content);
        setImages(review.images.map(image => ({ kind: 'existing', id: image.id, uri: image.url })));
      }).catch(async failure => {
        if (controller.signal.aborted) return;
        setLoadError(true);
        if (failure instanceof CommunityApiError && failure.status === 401) {
          if (await clearTokens(failure.authGeneration).catch(() => false)) {
            if (!controller.signal.aborted) router.push('/profile/login');
          }
        }
      });
    } else if (typeof routePublicId !== 'string' || !routePublicId) setLoadError(true);
    else void getPopupDetail(routePublicId, controller.signal).then(popup => {
      if (!controller.signal.aborted) setTitle(popup.name);
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [routePublicId, reviewId, editing, retry]);
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (!allowLeave.current && (busy.current || attempt.current || editAttempt.current)) event.preventDefault();
  }), [navigation]);
  async function selectImages() {
    if (locked || busy.current || selectingRef.current || images.length >= MAX_POST_IMAGES) return;
    selectingRef.current = true; setSelecting(true); setError(null);
    try {
      const added = await selectPostImages([], undefined, images.length);
      if (mounted.current) setImages(current => [...current, ...added.map(image => ({ ...image, kind: 'new' as const }))]);
    }
    catch (failure) { if (mounted.current) setError(failure instanceof ImageSelectionError ? t(`community.imageError.${failure.reason}`) : t('community.imageError.conversion')); }
    finally { selectingRef.current = false; if (mounted.current) setSelecting(false); }
  }
  async function register() {
    if (!validPopup || !canRegister || busy.current || selectingRef.current) return;
    busy.current = true; allowLeave.current = false; setSubmitting(true); setError(null);
    try {
      const newImages = images.filter((image): image is PostImage & { kind: 'new' } => image.kind === 'new');
      if (editing) {
        const retained = images.flatMap(image => image.kind === 'existing' ? [image.id] : []);
        const review = newImages.length || editAttempt.current
          ? await updateReviewWithImages(reviewId, publicId!, rating, content, retained, newImages, editAttempt)
          : await updateReview(reviewId, rating, content, retained);
        reviewUpdated(review);
      } else if (images.length || attempt.current) await publishReviewWithImages(publicId!, rating, content, newImages, attempt);
      else await createReview(publicId!, rating, content);
      if (!editing) reviewsCreated(publicId!); allowLeave.current = true;
      if (mounted.current) {
        if (router.canGoBack()) router.back();
        else if (editing) router.replace({ pathname: '/reviews/[id]', params: { id: String(reviewId) } });
        else router.replace({ pathname: '/places/[id]', params: { id: publicId!, tab: 'reviews' } });
      }
    } catch (failure) {
      if (!mounted.current) return;
      setPending(attempt.current !== null || editAttempt.current !== null);
      setError(!editing && failure instanceof CommunityApiError && failure.status === 409
        ? '이 팝업에 이미 방문 리뷰를 남겼어요.' : editing ? '리뷰를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.' : '리뷰를 등록하지 못했어요. 잠시 후 다시 시도해 주세요.');
      if (failure instanceof CommunityApiError && failure.status === 401) {
        allowLeave.current = true;
        const invalidated = await clearTokens(failure.authGeneration).catch(() => true);
        if (invalidated !== false && mounted.current) router.push('/profile/login');
      }
    } finally { busy.current = false; if (mounted.current) setSubmitting(false); }
  }
  return <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
    <KeyboardAvoidingView style={styles.layout} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" disabled={submitting || (pending && !(attempt.current?.authRequired || editAttempt.current?.authRequired))}
          onPress={() => router.canGoBack() ? router.back() : editing ? router.replace({ pathname: '/reviews/[id]', params: { id: String(reviewId) } }) : router.replace('/(tabs)/places')} style={styles.headerAction}>
          <ChevronLeft size={24} color={communityColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? '방문 리뷰 수정' : '방문 리뷰 작성'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={editing ? "수정 완료" : "등록"} accessibilityState={{ disabled: !canRegister, busy: submitting }}
          disabled={!canRegister} onPress={() => { void register(); }} style={styles.headerAction}>
          {submitting ? <ActivityIndicator color={communityColors.charcoal} /> : <Text style={[styles.register, !canRegister && styles.secondary]}>{editing ? '수정 완료' : '등록'}</Text>}
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}>
        {!title && !loadError && <ActivityIndicator color={communityColors.charcoal} />}
        {loadError && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={styles.error}>{editing ? '리뷰를 확인하지 못했어요. 다시 시도' : '팝업을 확인하지 못했어요. 다시 시도'}</Text></Pressable>}
        {title && <Text style={styles.popupTitle}>{title}</Text>}
        <Text style={styles.label}>이번 방문은 어떠셨나요?</Text>
        <View style={styles.stars}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button"
          accessibilityLabel={`별점 ${value}점`} accessibilityState={{ selected: rating === value }} disabled={locked}
          onPress={() => setRating(value)} style={styles.starButton}>
          <Star size={32} color={rating >= value ? '#FACC15' : communityColors.secondaryText} fill={rating >= value ? '#FACC15' : 'none'} />
        </Pressable>)}</View>
        <Text style={styles.label}>후기를 남겨주세요</Text>
        <TextInput accessibilityLabel="방문 후기 내용" multiline textAlignVertical="top" style={styles.input} editable={!locked}
          placeholder="방문 경험을 들려주세요" placeholderTextColor={communityColors.secondaryText} value={content} onChangeText={setContent} />
        {!contentValid && <Text accessibilityRole="alert" style={styles.error}>후기 내용이 저장 가능한 길이를 초과했어요.</Text>}
        <Text style={styles.label}>사진 <Text style={styles.secondary}>최대 5장</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.photos}>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 추가" disabled={locked || selecting || images.length >= MAX_POST_IMAGES}
            onPress={() => { void selectImages(); }} style={styles.addPhoto}>
            {selecting ? <ActivityIndicator color={communityColors.secondaryText} /> : <ImagePlus size={24} color={communityColors.secondaryText} />}
          </Pressable>
          {images.map((image, index) => <View key={image.kind === 'existing' ? `existing:${image.id}` : `new:${image.uri}`} style={styles.photo}>
            <Image source={{ uri: image.uri }} style={styles.photoImage} />
            <Pressable accessibilityRole="button" accessibilityLabel={`사진 ${index + 1} 삭제`} disabled={locked || selecting}
              onPress={() => setImages(current => current.filter((_, position) => position !== index))} style={styles.removePhoto}><X size={16} color={communityColors.white} /></Pressable>
          </View>)}
        </ScrollView>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {pending && <Text accessibilityRole="alert" style={styles.error}>{editing ? '수정 결과를 확인하지 못했어요. 같은 내용으로 수정 완료를 다시 눌러 주세요.' : '등록 결과를 확인하지 못했어요. 같은 내용으로 등록을 다시 눌러 주세요.'}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: communityColors.background }, layout: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: communityColors.divider },
  headerAction: { minWidth: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleS, color: communityColors.text },
  register: { ...typography.label, fontWeight: '600', color: communityColors.charcoal }, secondary: { color: communityColors.secondaryText },
  content: { paddingTop: spacing.space24, paddingBottom: spacing.space40 },
  popupTitle: { ...typography.titleS, color: communityColors.text },
  label: { ...typography.label, color: communityColors.text, marginTop: spacing.space24 },
  stars: { flexDirection: 'row', columnGap: spacing.space4, marginTop: spacing.space12 },
  starButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 220, marginTop: spacing.space12, padding: spacing.space16, borderWidth: 1,
    borderColor: communityColors.divider, borderRadius: radius.radius12, ...typography.body, color: communityColors.text },
  photos: { gap: spacing.space8, marginTop: spacing.space12 },
  photo: { width: 88, height: 88 }, photoImage: { width: '100%', height: '100%', borderRadius: radius.radius8 },
  addPhoto: { width: 88, height: 88, borderWidth: 1, borderColor: communityColors.divider, borderRadius: radius.radius8, alignItems: 'center', justifyContent: 'center' },
  removePhoto: { position: 'absolute', top: 0, right: 0, width: 28, height: 28, borderRadius: radius.full,
    backgroundColor: communityColors.charcoal, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.label, color: '#B91C1C', marginTop: spacing.space12 },
});
