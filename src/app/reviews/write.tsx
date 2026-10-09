import { useTranslation } from '../../hooks/useTranslation';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ChevronLeft, ImagePlus, Star, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearTokens } from '../../lib/auth';
import { draftLoginHref } from '../../lib/loginReturn';
import { CommunityApiError } from '../../lib/community';
import { ImageSelectionError, MAX_POST_IMAGES, selectPostImages, type PostImage } from '../../lib/communityImages';
import { getPopupDetail } from '../../lib/popups';
import { getReviewDetail, reviewUpdated, updateReview, updateReviewWithImages, type ReviewEditAttempt, createReview, MAX_REVIEW_CONTENT_BYTES, publishReviewWithImages, reviewContentBytes, reviewsCreated, type ReviewAttempt } from '../../lib/reviews';
import { communityColors } from '../../theme/communityColors';
import { radius, spacing, typography } from '../../theme/tokens';

type DraftImage = ({ kind: 'existing'; id: number; uri: string }) | (PostImage & { kind: 'new' });

export default function ReviewWriteScreen() {
  const { t } = useTranslation();
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
  const originalDraft = useRef<{ rating: number; content: string; imageIds: number[] } | null>(null);
  const confirmingLeave = useRef(false);
  const validPopup = typeof publicId === 'string' && publicId.length > 0;
  const locked = submitting || pending || !title || loadError;
  const contentValid = reviewContentBytes(content) <= MAX_REVIEW_CONTENT_BYTES;
  const canRegister = !!title && !loadError && Number.isInteger(rating) && rating >= 1 && rating <= 5 && contentValid && !submitting && !selecting;
  const hasChanges = editing
    ? originalDraft.current !== null && (rating !== originalDraft.current.rating || content !== originalDraft.current.content
      || images.length !== originalDraft.current.imageIds.length
      || images.some((image, index) => image.kind !== 'existing' || image.id !== originalDraft.current!.imageIds[index]))
    : rating > 0 || content.trim().length > 0 || images.length > 0;
  const authenticationRequired = attempt.current?.authRequired || editAttempt.current?.authRequired;
  const removalLocked = () => busy.current || selectingRef.current
    || !!(attempt.current && !attempt.current.authRequired) || !!(editAttempt.current && !editAttempt.current.authRequired);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setTitle(null); setLoadError(false);
    if (editing) {
      void getReviewDetail(reviewId, controller.signal, true).then(review => {
        if (controller.signal.aborted) return;
        originalDraft.current = { rating: review.rating, content: review.content, imageIds: review.images.map(image => image.id) };
        setTitle(review.popup?.title ?? null); setPublicId(review.popup?.publicId);
        setRating(review.rating); setContent(review.content);
        setImages(review.images.map(image => ({ kind: 'existing', id: image.id, uri: image.url })));
      }).catch(async failure => {
        if (controller.signal.aborted) return;
        setLoadError(true);
        if (failure instanceof CommunityApiError && failure.status === 401) {
          if (await clearTokens(failure.authGeneration).catch(() => false)) {
            if (!controller.signal.aborted) router.push(draftLoginHref(navigation));
          }
        }
      });
    } else if (typeof routePublicId !== 'string' || !routePublicId) setLoadError(true);
    else void getPopupDetail(routePublicId, controller.signal).then(popup => {
      if (!controller.signal.aborted) setTitle(popup.name);
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [routePublicId, reviewId, editing, retry]);
  usePreventRemove(hasChanges || submitting || selecting || (pending && !authenticationRequired), ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (removalLocked() || confirmingLeave.current) return;
    confirmingLeave.current = true;
    Alert.alert(t('review.write.leaveTitle'), t('review.write.leaveMessage'), [
      { text: t('review.write.continue'), style: 'cancel', onPress: () => { confirmingLeave.current = false; } },
      { text: t('review.write.leave'), style: 'destructive', onPress: () => {
        if (!confirmingLeave.current) return;
        confirmingLeave.current = false;
        if (mounted.current && !removalLocked()) navigation.dispatch(data.action);
      } },
    ], { cancelable: false });
  });
  async function selectImages() {
    if (locked || busy.current || selectingRef.current || images.length >= MAX_POST_IMAGES) return;
    selectingRef.current = true; setSelecting(true); setError(null);
    try {
      const added = await selectPostImages([], undefined, images.length);
      if (mounted.current) setImages(current => [...current, ...added.map(image => ({ ...image, kind: 'new' as const }))]);
    }
    catch (failure) { if (mounted.current) setError(failure instanceof ImageSelectionError ? `community.imageError.${failure.reason}` : 'community.imageError.conversion'); }
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
      confirmingLeave.current = false;
      if (mounted.current) {
        if (router.canGoBack()) router.back();
        else if (editing) router.replace({ pathname: '/reviews/[id]', params: { id: String(reviewId) } });
        else router.replace({ pathname: '/places/[id]', params: { id: publicId!, tab: 'reviews' } });
      }
    } catch (failure) {
      if (!mounted.current) return;
      setPending(attempt.current !== null || editAttempt.current !== null);
      setError(!editing && failure instanceof CommunityApiError && failure.status === 409
        ? 'review.write.duplicate' : editing ? 'review.write.editFailed' : 'review.write.createFailed');
      if (failure instanceof CommunityApiError && failure.status === 401) {
        const invalidated = await clearTokens(failure.authGeneration).catch(() => true);
        if (invalidated !== false && mounted.current) router.push(draftLoginHref(navigation));
      }
    } finally { busy.current = false; if (mounted.current) setSubmitting(false); }
  }
  return <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
    <KeyboardAvoidingView style={styles.layout} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('place.explore.back')} disabled={submitting || (pending && !(attempt.current?.authRequired || editAttempt.current?.authRequired))}
          onPress={() => router.canGoBack() ? router.back() : editing ? router.replace({ pathname: '/reviews/[id]', params: { id: String(reviewId) } }) : router.replace('/(tabs)/places')} style={styles.headerAction}>
          <ChevronLeft size={24} color={communityColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? t('review.write.editTitle') : t('place.detail.reviews.write')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={editing ? t('review.write.save') : t('review.write.register')} accessibilityState={{ disabled: !canRegister, busy: submitting }}
          disabled={!canRegister} onPress={() => { void register(); }} style={styles.headerAction}>
          {submitting ? <ActivityIndicator color={communityColors.charcoal} /> : <Text style={[styles.register, !canRegister && styles.secondary]}>{editing ? t('review.write.save') : t('review.write.register')}</Text>}
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}>
        {!title && !loadError && <ActivityIndicator color={communityColors.charcoal} />}
        {loadError && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={styles.error}>{editing ? t('review.write.reviewLoadFailed') : t('review.write.popupLoadFailed')}</Text></Pressable>}
        {title && <Text style={styles.popupTitle}>{title}</Text>}
        <Text style={styles.label}>{t('review.write.ratingPrompt')}</Text>
        <View style={styles.stars}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button"
          accessibilityLabel={t('review.write.rating', { value })} accessibilityState={{ selected: rating === value }} disabled={locked}
          onPress={() => setRating(value)} style={styles.starButton}>
          <Star size={32} color={rating >= value ? '#FACC15' : communityColors.secondaryText} fill={rating >= value ? '#FACC15' : 'none'} />
        </Pressable>)}</View>
        <Text style={styles.label}>{t('review.write.contentPrompt')}</Text>
        <TextInput accessibilityLabel={t('review.write.content')} multiline textAlignVertical="top" style={styles.input} editable={!locked}
          placeholder={t('review.write.placeholder')} placeholderTextColor={communityColors.secondaryText} value={content} onChangeText={setContent} />
        {!contentValid && <Text accessibilityRole="alert" style={styles.error}>{t('review.write.contentTooLong')}</Text>}
        <Text style={styles.label}>{t('review.write.photos')} <Text style={styles.secondary}>{t('review.write.maxPhotos')}</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.photos}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('review.write.addPhoto')} disabled={locked || selecting || images.length >= MAX_POST_IMAGES}
            onPress={() => { void selectImages(); }} style={styles.addPhoto}>
            {selecting ? <ActivityIndicator color={communityColors.secondaryText} /> : <ImagePlus size={24} color={communityColors.secondaryText} />}
          </Pressable>
          {images.map((image, index) => <View key={image.kind === 'existing' ? `existing:${image.id}` : `new:${image.uri}`} style={styles.photo}>
            <Image source={{ uri: image.uri }} style={styles.photoImage} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('review.write.removePhoto', { index: index + 1 })} disabled={locked || selecting}
              onPress={() => setImages(current => current.filter((_, position) => position !== index))} style={styles.removePhoto}><X size={16} color={communityColors.white} /></Pressable>
          </View>)}
        </ScrollView>
        {error && <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
        {pending && <Text accessibilityRole="alert" style={styles.error}>{editing ? t('review.write.editPending') : t('review.write.createPending')}</Text>}
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
