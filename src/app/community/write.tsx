import { useTranslation } from '../../hooks/useTranslation';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ChevronLeft, ImagePlus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityApiError, createCommunityPost, getCommunityPostForEdit, updateCommunityPost } from '../../lib/community';
import { markCommunityFeedChanged, publishCommunityPostChange } from '../../lib/communityFeedRefresh';
import { clearTokens } from '../../lib/auth';
import { draftLoginHref } from '../../lib/loginReturn';
import { logCommunityError } from '../../lib/communityDiagnostics';
import { ImageSelectionError, MAX_POST_IMAGES, publishPostWithImages, updatePostWithImages, selectPostImages, type ImageEditAttempt, type ImagePostAttempt, type PostImage } from '../../lib/communityImages';
import { communityColors } from '../../theme/communityColors';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type WriteCategory = 'QUESTION' | 'FREE';
const categories: readonly WriteCategory[] = ['QUESTION', 'FREE'];
type DraftImage = { id: string; uri: string; processing: boolean; image?: PostImage; retainedId?: number };

export default function CommunityWriteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editing = editId !== undefined;
  const postId = typeof editId === 'string' && /^[1-9]\d*$/.test(editId) ? Number(editId) : NaN;
  const [loadingEdit, setLoadingEdit] = useState(editing);
  const [editLoadError, setEditLoadError] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<WriteCategory>('QUESTION');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const submittingRef = useRef(false);
  const [images, setImages] = useState<DraftImage[]>([]);
  const [selectingImages, setSelectingImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const selectingRef = useRef(false);
  const imageAttemptRef = useRef<ImagePostAttempt | null>(null);
  const editAttemptRef = useRef<ImageEditAttempt | null>(null);
  const allowLeaveRef = useRef(false);
  const imageSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const originalDraft = useRef<{ content: string; imageIds: number[] } | null>(null);
  const confirmingLeave = useRef(false);
  const authenticationRequired = imageAttemptRef.current?.authRequired || editAttemptRef.current?.authRequired;
  const locked = submitting || pendingConfirmation || loadingEdit || editLoadError;
  const imagesReady = images.every((image) => !image.processing && (image.image || image.retainedId));
  const canRegister = content.trim().length > 0 && !submitting && !loadingEdit && !editLoadError && !selectingImages && imagesReady;
  const hasChanges = editing
    ? originalDraft.current !== null && (content !== originalDraft.current.content
      || images.length !== originalDraft.current.imageIds.length
      || images.some((image, index) => image.retainedId !== originalDraft.current!.imageIds[index]))
    : content.trim().length > 0 || images.length > 0;
  const removalLocked = () => submittingRef.current || selectingRef.current
    || !!(imageAttemptRef.current && !imageAttemptRef.current.authRequired)
    || !!(editAttemptRef.current && !editAttemptRef.current.authRequired);

  useEffect(() => {
    if (!editing) return;
    const request = new AbortController();
    setLoadingEdit(true); setEditLoadError(false);
    void getCommunityPostForEdit(postId, request.signal).then((post) => {
      if (request.signal.aborted) return;
      originalDraft.current = { content: post.content, imageIds: [...post.imageIds!] };
      setCategory(post.category); setContent(post.content);
      setImages(post.images.map((uri, index) => ({ id: `retained-${post.imageIds![index]}`, uri,
        retainedId: post.imageIds![index], processing: false })));
    }).catch(async (error: unknown) => {
      if (request.signal.aborted) return;
      setEditLoadError(true);
      if (error instanceof CommunityApiError && error.status === 401) {
        const invalidated = await clearTokens(error.authGeneration).catch(() => true);
        if (invalidated !== false && !request.signal.aborted) router.push(draftLoginHref(navigation));
      }
    }).finally(() => { if (!request.signal.aborted) setLoadingEdit(false); });
    return () => request.abort();
  }, [editing, postId, loadRetry]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  usePreventRemove(hasChanges || submitting || selectingImages || (pendingConfirmation && !authenticationRequired), ({ data }) => {
    if (allowLeaveRef.current) { navigation.dispatch(data.action); return; }
    if (removalLocked() || confirmingLeave.current) return;
    confirmingLeave.current = true;
    Alert.alert(t('review.write.leaveTitle'), t('review.write.leaveMessage'), [
      { text: t('review.write.continue'), style: 'cancel', onPress: () => { confirmingLeave.current = false; } },
      { text: t('review.write.leave'), style: 'destructive', onPress: () => {
        if (!confirmingLeave.current) return;
        confirmingLeave.current = false;
        if (mountedRef.current && !removalLocked()) navigation.dispatch(data.action);
      } },
    ], { cancelable: false });
  });

  async function handleSelectImages() {
    if (locked || submittingRef.current || selectingRef.current || imageAttemptRef.current || editAttemptRef.current || images.length >= MAX_POST_IMAGES) return;
    selectingRef.current = true;
    setSelectingImages(true);
    setImageError(null);
    const ids: string[] = [];
    try {
      await selectPostImages(images.flatMap((item) => item.image ? [item.image] : []), {
        onSelected(assets) {
          if (!mountedRef.current) return;
          const selected = assets.map((asset) => {
            const id = `image-${++imageSequenceRef.current}`;
            ids.push(id);
            return { id, uri: asset.uri, processing: true };
          });
          setImages((current) => [...current, ...selected]);
        },
        onConverted(index, image) {
          if (!mountedRef.current) return;
          setImages((current) => current.map((item) => item.id === ids[index]
            ? { ...item, uri: image.uri, processing: false, image } : item));
        },
        onFailed(index) {
          if (!mountedRef.current) return;
          setImages((current) => current.filter((item) => item.id !== ids[index]));
          setImageError('community.imageError.conversion');
        },
      }, images.length);
    }
    catch (error) {
      if (!mountedRef.current) return;
      setImageError(error instanceof ImageSelectionError
        ? `community.imageError.${error.reason}` : 'community.imageError.conversion');
    } finally { selectingRef.current = false; if (mountedRef.current) setSelectingImages(false); }
  }

  async function handleRegister() {
    if (!content.trim() || loadingEdit || editLoadError || submittingRef.current || selectingRef.current || !imagesReady) return;
    submittingRef.current = true;
    allowLeaveRef.current = false;
    setSubmitting(true);
    setSubmitError(false);
    try {
      if (editing) {
        const retained = images.flatMap((item) => item.retainedId ? [item.retainedId] : []);
        const added = images.flatMap((item) => item.image ? [item.image] : []);
        const post = added.length || editAttemptRef.current
          ? await updatePostWithImages(postId, content, retained, added, editAttemptRef)
          : await updateCommunityPost(postId, content, retained);
        publishCommunityPostChange(post.id, { content: post.content, images: post.images,
          updatedAt: post.updatedAt, imageIds: post.imageIds });
      } else {
        if (images.length || imageAttemptRef.current) await publishPostWithImages(category, content,
          images.flatMap((item) => item.image ? [item.image] : []), imageAttemptRef);
        else await createCommunityPost(category, content);
        markCommunityFeedChanged();
      }
      allowLeaveRef.current = true;
      confirmingLeave.current = false;
      if (mountedRef.current) {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/community');
      }
    } catch (error) {
      logCommunityError('REGISTER', {
        ...(error instanceof CommunityApiError ? { status: error.status, responseBody: error.responseBody } : {}),
      }, error);
      setSubmitError(true);
      setPendingConfirmation(imageAttemptRef.current !== null || editAttemptRef.current !== null);
      if (error instanceof CommunityApiError && error.status === 401) {
        // Keep the mounted draft. A prior unknown commit retains its immutable token, but authentication must not trap navigation.
        const invalidated = await clearTokens(error.authGeneration).catch(() => true);
        if (invalidated !== false && mountedRef.current) router.push(draftLoginHref(navigation));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView style={styles.layout} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.writeBack')}
            disabled={submitting || (pendingConfirmation && !authenticationRequired)}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/community')}
            style={styles.headerAction}
          >
            <ChevronLeft size={24} color={communityColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t(editing ? 'community.edit.title' : 'community.write')}</Text>
          <View style={styles.headerAction} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingLeft: insets.left + spacing.space16, paddingRight: insets.right + spacing.space16 }]}
          keyboardShouldPersistTaps="handled"
        >
          {loadingEdit ? <ActivityIndicator color={communityColors.charcoal} /> : null}
          {editLoadError ? <Pressable accessibilityRole="button" onPress={() => setLoadRetry((value) => value + 1)}>
            <Text accessibilityRole="alert" style={styles.submitError}>{t('community.edit.loadFailed')}</Text>
          </Pressable> : null}
          <View style={styles.categoryRow}>
            {categories.map((item) => {
              const selected = category === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={locked || editing}
                  onPress={() => { if (!editing) setCategory(item); }}
                  style={[styles.categoryChip, selected && styles.selectedChip]}
                >
                  <Text style={[styles.categoryText, selected && styles.selectedCategoryText]}>
                    {t(`community.category.${item.toLowerCase()}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            accessibilityLabel={t('community.writeContent')}
            style={styles.contentInput}
            multiline
            textAlignVertical="top"
            placeholder={t('community.writePlaceholder')}
            placeholderTextColor={communityColors.secondaryText}
            value={content}
            editable={!locked}
            onChangeText={setContent}
          />
          {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{t(editing ? 'community.edit.failed' : 'community.writeFailed')}</Text> : null}
          {pendingConfirmation ? <Text accessibilityRole="alert" style={styles.submitError}>{t(editing ? 'community.edit.confirmRetry' : 'community.imageConfirmRetry')}</Text> : null}
          {imageError ? <Text accessibilityRole="alert" style={styles.submitError}>{t(imageError)}</Text> : null}

          {images.length > 0 ? <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.imageScroll}
            contentContainerStyle={styles.imagePreviews}
          >
            {images.map((image, index) => <View key={image.id} style={styles.imagePreview}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              {image.processing ? <View pointerEvents="none" style={styles.imageProcessing}>
                <ActivityIndicator size="small" color={communityColors.charcoal} />
              </View> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={t('community.removeImage', { index: index + 1 })}
                disabled={locked} onPress={() => setImages((current) => current.filter((item) => item.id !== image.id))} style={styles.removeImage}>
                <X size={16} color={communityColors.white} />
              </Pressable>
            </View>)}
          </ScrollView> : null}

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('community.attachImage')}
              accessibilityState={{ disabled: locked || selectingImages || images.length >= MAX_POST_IMAGES, busy: selectingImages }}
              disabled={locked || selectingImages || images.length >= MAX_POST_IMAGES}
              onPress={() => { void handleSelectImages(); }}
              style={styles.imageButton}
            >
              {selectingImages ? <ActivityIndicator size="small" color={communityColors.secondaryText} /> : <ImagePlus size={20} color={communityColors.secondaryText} />}
              <Text style={styles.imageButtonText}>{t('community.attachImage')} {images.length}/{MAX_POST_IMAGES}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(editing ? 'community.edit.save' : submitting ? 'community.registering' : 'community.register')}
              accessibilityState={{ disabled: !canRegister, busy: submitting }}
              disabled={!canRegister}
              onPress={() => { void handleRegister(); }}
              style={[styles.registerButton, !canRegister && styles.registerButtonDisabled]}
            >
              {submitting
                ? <ActivityIndicator size="small" color={communityColors.secondaryText} />
                : <Text style={[styles.registerText, !canRegister && styles.registerDisabled]}>{t(editing ? 'community.edit.save' : 'community.register')}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: communityColors.background },
  layout: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: communityColors.divider,
  },
  headerAction: { minWidth: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleS, color: communityColors.text },
  registerButton: {
    minWidth: 88,
    height: 44,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.radius8,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerButtonDisabled: { backgroundColor: communityColors.mutedSurface },
  registerText: { ...typography.label, fontWeight: '600', color: communityColors.white },
  registerDisabled: { color: communityColors.secondaryText },
  scroll: { flex: 1 },
  content: { paddingTop: spacing.space24, paddingBottom: spacing.space40 },
  categoryRow: { flexDirection: 'row', columnGap: spacing.space8 },
  categoryChip: {
    height: 36,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedChip: { borderColor: colors.text, backgroundColor: colors.text },
  categoryText: { ...typography.label, color: colors.text },
  selectedCategoryText: { color: colors.background },
  contentInput: {
    minHeight: 220,
    marginTop: spacing.space24,
    padding: spacing.space16,
    borderWidth: 1,
    borderColor: communityColors.divider,
    borderRadius: radius.radius12,
    ...typography.body,
    color: communityColors.text,
  },
  submitError: { ...typography.label, marginTop: spacing.space12, color: '#B91C1C' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.space8,
    marginTop: spacing.space16,
  },
  imageButton: {
    height: 44,
    paddingHorizontal: spacing.space12,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space8,
    borderWidth: 1,
    borderColor: communityColors.divider,
    borderRadius: radius.radius8,
  },
  imageButtonText: { ...typography.label, color: communityColors.secondaryText },
  imageScroll: { height: 88, flexGrow: 0, marginTop: spacing.space16 },
  imagePreviews: { flexDirection: 'row', flexWrap: 'nowrap', gap: spacing.space8 },
  imagePreview: { width: 88, height: 88, flexShrink: 0 },
  previewImage: { width: '100%', height: '100%', borderRadius: radius.radius8 },
  imageProcessing: { position: 'absolute', left: spacing.space8, bottom: spacing.space8, padding: spacing.space4, borderRadius: radius.full, backgroundColor: communityColors.white },
  removeImage: { position: 'absolute', top: 0, right: 0, width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
