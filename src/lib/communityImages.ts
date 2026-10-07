import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { CommunityApiError, communityRequest, createCommunityPost, updateCommunityPost, type CommunityPostCategory } from './community';
import { describeS3Put, logCommunityError, readCommunityErrorBody, readS3PutError } from './communityDiagnostics';

export const MAX_POST_IMAGES = 5;
export const MAX_IMAGE_EDGE = 1600;
export const WEBP_QUALITY = 0.8;
export type PostImage = { uri: string; width: number; height: number; mimeType: 'image/webp' };
type Upload = { uploadUrl: string; imageKey: string; contentType: string; sortOrder: number };
type UploadGrant = { uploadToken: string; images: Upload[] };
type CommitRecovery = { outcomeUnknown?: boolean; authRequired?: boolean };
export type ImagePostAttempt = CommitRecovery & { uploadToken: string; category: CommunityPostCategory; content: string };
export type ImagePostAttemptRef = { current: ImagePostAttempt | null };
export type ImageEditAttempt = CommitRecovery & { uploadToken: string; postId: number; content: string; retainedImageIds: number[] };

export class ImageSelectionError extends Error {
  constructor(public readonly reason: 'permission' | 'limit' | 'conversion') { super(reason); }
}

export function resizeForPost(width: number, height: number): { width: number } | { height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new ImageSelectionError('conversion');
  }
  if (Math.max(width, height) <= MAX_IMAGE_EDGE) return null;
  return width >= height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE };
}

export function appendPostImages(current: PostImage[], added: PostImage[]): PostImage[] {
  if (current.length + added.length > MAX_POST_IMAGES) throw new ImageSelectionError('limit');
  return [...current, ...added];
}

export async function convertPostImage(asset: ImagePicker.ImagePickerAsset): Promise<PostImage> {
  resizeForPost(asset.width, asset.height); // Reject invalid picker dimensions before decoding.
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    // Decode first: the native module normalizes EXIF orientation before exposing pixel dimensions.
    rendered = await context.renderAsync();
    const resize = resizeForPost(rendered.width, rendered.height);
    if (resize) {
      rendered.release();
      rendered = undefined;
      context.resize(resize);
      rendered = await context.renderAsync();
    }
    const result = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: WEBP_QUALITY });
    if (!result.uri.toLowerCase().endsWith('.webp') || resizeForPost(result.width, result.height)) {
      throw new ImageSelectionError('conversion');
    }
    return { uri: result.uri, width: result.width, height: result.height, mimeType: 'image/webp' };
  } finally {
    rendered?.release();
    context.release();
  }
}

type SelectionObserver = {
  onSelected: (assets: ImagePicker.ImagePickerAsset[]) => void;
  onConverted: (index: number, image: PostImage) => void;
  onFailed: (index: number) => void;
};

export async function selectPostImages(current: PostImage[], observer?: SelectionObserver, existingCount = current.length): Promise<PostImage[]> {
  const remaining = MAX_POST_IMAGES - existingCount;
  if (remaining <= 0) throw new ImageSelectionError('limit');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new ImageSelectionError('permission');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining,
    orderedSelection: true, allowsEditing: false, quality: 1,
  });
  if (result.canceled) return current;
  if (result.assets.length > remaining) throw new ImageSelectionError('limit');
  observer?.onSelected(result.assets);
  const converted: PostImage[] = [];
  let failed = false;
  // Process sequentially to bound native memory usage for full-resolution HEIC photos.
  for (let index = 0; index < result.assets.length; index++) {
    try {
      const image = await convertPostImage(result.assets[index]);
      converted.push(image);
      observer?.onConverted(index, image);
    } catch (error) {
      if (!observer) throw error;
      failed = true;
      observer.onFailed(index);
    }
  }
  if (failed) throw new ImageSelectionError('conversion');
  return appendPostImages(current, converted);
}

export async function cancelUpload(uploadToken: string, request: typeof communityRequest = communityRequest, path = 'post-image-uploads'): Promise<void> {
  try { await request(path, 'DELETE', { uploadToken }); }
  catch { /* Best effort only: app termination/network/S3 failure can leave unregistered objects. */ }
}

export async function uploadPostImages(images: PostImage[], request: typeof communityRequest = communityRequest, path = 'post-image-uploads'): Promise<string> {
    const apiPath = request === communityRequest ? `/api/community/${path}` : `/api/${path}`;
    if (images.length < 1 || images.length > MAX_POST_IMAGES) throw new ImageSelectionError('limit');
    const response = await request(path, 'POST', { count: images.length, contentType: 'image/webp' });
    let grant: UploadGrant;
    let responseBody: string | undefined;
    try {
      responseBody = await response.text();
      grant = JSON.parse(responseBody);
      if (!grant || typeof grant.uploadToken !== 'string' || !Array.isArray(grant.images)
        || grant.images.length !== images.length) throw new Error('Invalid upload grant');
    } catch (error) {
      logCommunityError('PRESIGN', { method: 'POST', path: apiPath, status: response.status, responseBody }, error);
      throw error;
    }
    try {
      for (let i = 0; i < images.length; i++) {
        const upload = grant.images[i];
        if (!upload || upload.contentType !== 'image/webp' || upload.sortOrder !== i
          || typeof upload.imageKey !== 'string' || !upload.imageKey.endsWith('.webp') || typeof upload.uploadUrl !== 'string') {
          const error = new Error('Invalid WebP upload');
          logCommunityError('PRESIGN', { method: 'POST', path: apiPath, imageIndex: i + 1, status: response.status }, error);
          throw error;
        }
        let bytes: ArrayBuffer;
        let file: Response | undefined;
        try {
          file = await fetch(images[i].uri);
          if (!file.ok) throw new Error('Image file unavailable');
          bytes = await file.arrayBuffer();
        } catch (error) {
          logCommunityError('LOCAL_FILE', { method: 'GET', path: 'local WebP cache', imageIndex: i + 1, status: file?.status,
            responseBody: file && !file.ok ? await readCommunityErrorBody(file) : undefined }, error);
          throw error;
        }
        let put: Response | undefined;
        try {
          put = await fetch(upload.uploadUrl, {
            // Expo SDK 57 overrides explicit Content-Type with Blob.type (empty for cache files).
            // ArrayBuffer preserves the signed header and avoids the RN Blob/base64 round trip.
            method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: bytes,
          });
          if (!put.ok) throw new Error('Image upload failed');
        } catch (error) {
          logCommunityError('S3_PUT', { method: 'PUT', path: 'S3 post image', imageIndex: i + 1, status: put?.status,
            ...describeS3Put(upload.uploadUrl, bytes),
            ...(put && !put.ok ? await readS3PutError(put) : {}),
            requestId: put?.headers.get('x-amz-request-id') ?? undefined }, error);
          throw error;
        }
      }
    } catch (error) {
      await cancelUpload(grant.uploadToken, request, path);
      throw error;
    }
    return grant.uploadToken;
}

export async function publishPostWithImages(
  category: CommunityPostCategory, content: string, images: PostImage[], attempt: ImagePostAttemptRef,
) {
  if (!attempt.current) attempt.current = { uploadToken: await uploadPostImages(images), category, content };
  const pending = attempt.current;
  pending.authRequired = false;
  try {
    const result = await createCommunityPost(pending.category, pending.content, pending.uploadToken);
    attempt.current = null;
    return result;
  } catch (error) {
    // Never delete images when the commit outcome is unknown (network failure/5xx).
    // Retain the signed grant and immutable request; retry returns the same post id after a lost response.
    if (error instanceof CommunityApiError && error.status === 401 && pending.outcomeUnknown) {
      // This rejection says nothing about an earlier lost response. Reauthenticate and retry the same token.
      pending.authRequired = true;
    } else if (error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status)) {
      attempt.current = null;
      // Authentication recovery must not wait for best-effort cleanup with an expired token.
      if (error.status === 401) void cancelUpload(pending.uploadToken);
      else await cancelUpload(pending.uploadToken);
    } else pending.outcomeUnknown = true;
    throw error;
  }
}

export async function updatePostWithImages(postId: number, content: string, retainedImageIds: number[],
  images: PostImage[], attempt: { current: ImageEditAttempt | null }) {
  return commitImageEdit(attempt,
    async () => ({ postId, content, retainedImageIds: [...retainedImageIds], uploadToken: await uploadPostImages(images) }),
    pending => updateCommunityPost(pending.postId, pending.content, pending.retainedImageIds, pending.uploadToken),
    token => cancelUpload(token));
}

export async function commitImageEdit<T extends CommitRecovery & { uploadToken: string }, R>(
  attempt: { current: T | null }, prepare: () => Promise<T>, commit: (pending: T) => Promise<R>, cleanup: (token: string) => Promise<void>): Promise<R> {
  if (!attempt.current) attempt.current = await prepare();
  const pending = attempt.current;
  pending.authRequired = false;
  try {
    const result = await commit(pending);
    attempt.current = null;
    return result;
  } catch (error) {
    // Keep the exact request for a lost commit response, just as image creation does.
    if (error instanceof CommunityApiError && error.status === 401 && pending.outcomeUnknown) {
      pending.authRequired = true;
    } else if (error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status)) {
      attempt.current = null;
      if (error.status === 401) void cleanup(pending.uploadToken);
      else await cleanup(pending.uploadToken);
    } else pending.outcomeUnknown = true;
    throw error;
  }
}
