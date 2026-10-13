import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { CommunityApiError, communityRequest, createCommunityPost, updateCommunityPost, type CommunityPostCategory } from './community';
import { describeS3Put, logCommunityError, readCommunityErrorBody, readS3PutError } from './communityDiagnostics';
import { RequestCancelledError, throwIfRequestAborted, UPLOAD_TIMEOUT_MS, withRequestTimeout } from './requestTimeout';
import { assertAttemptOwner, assertSubmissionOwner, captureSubmissionOwner, isSubmissionOwnerCurrent, type SubmissionOwner } from './submissionSession';

export const MAX_POST_IMAGES = 5;
export const MAX_IMAGE_EDGE = 1600;
export const WEBP_QUALITY = 0.8;
export const MAX_IMAGE_SIZE_BYTES = 5_242_880;
export type PostImage = { uri: string; width: number; height: number; mimeType: 'image/webp' };
type Upload = { uploadUrl: string; imageKey: string; contentType: string; sortOrder: number };
type UploadGrant = { uploadToken: string; images: Upload[] };
type CommitRecovery = { owner?: SubmissionOwner; outcomeUnknown?: boolean; authRequired?: boolean };
export type ImagePostAttempt = CommitRecovery & { uploadToken: string; category: CommunityPostCategory; content: string };
export type ImagePostAttemptRef = { current: ImagePostAttempt | null };
export type ImageEditAttempt = CommitRecovery & { uploadToken: string; postId: number; content: string; retainedImageIds: number[] };

export class ImageSelectionError extends Error {
  constructor(public readonly reason: 'permission' | 'limit' | 'conversion' | 'size') { super(reason); }
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

export async function cancelUpload(uploadToken: string, request: typeof communityRequest = communityRequest, path = 'post-image-uploads', owner?: SubmissionOwner): Promise<void> {
  try {
    await withRequestTimeout('cleanup', UPLOAD_TIMEOUT_MS.cleanup, (signal, onHttpError) =>
      request(path, 'DELETE', { uploadToken }, signal, onHttpError, owner ? generation => assertSubmissionOwner(owner, generation) : undefined));
  } catch (error) {
    // Best effort: a lost/timed-out response does not establish whether deletion completed.
    // Keep cleanup errors separate so callers can rethrow the original submission error.
    logCommunityError('CLEANUP', { method: 'DELETE',
      path: request === communityRequest ? `/api/community/${path}` : `/api/${path}`,
      ...(error instanceof CommunityApiError ? { status: error.status, responseBody: error.responseBody } : {}),
    }, error);
  }
}

export async function uploadPostImages(images: PostImage[], request: typeof communityRequest = communityRequest, path = 'post-image-uploads', signal?: AbortSignal, owner?: SubmissionOwner): Promise<string> {
    const assertOwner = (generation?: number) => { if (owner) assertSubmissionOwner(owner, generation); };
    assertOwner();
    const apiPath = request === communityRequest ? `/api/community/${path}` : `/api/${path}`;
    if (images.length < 1 || images.length > MAX_POST_IMAGES) throw new ImageSelectionError('limit');
    // Read each final WebP once, before presigning. Keep the exact buffers for PUT.
    const fileBytes: (ArrayBuffer | undefined)[] = [];
    const sizeBytes: number[] = [];
    for (let i = 0; i < images.length; i++) {
      let file: Response | undefined;
      let fileErrorBody: string | undefined;
      try {
        const bytes = await withRequestTimeout('local', UPLOAD_TIMEOUT_MS.local, async requestSignal => {
          assertOwner();
          file = await fetch(images[i].uri, { signal: requestSignal });
          throwIfRequestAborted(requestSignal);
          if (!file.ok) {
            fileErrorBody = await readCommunityErrorBody(file);
            throw new Error('Image file unavailable');
          }
          return file.arrayBuffer();
        }, signal);
        if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_SIZE_BYTES) throw new ImageSelectionError('size');
        fileBytes.push(bytes);
        sizeBytes.push(bytes.byteLength);
      } catch (error) {
        logCommunityError('LOCAL_FILE', { method: 'GET', path: 'local WebP cache', imageIndex: i + 1, status: file?.status,
          responseBody: fileErrorBody }, error);
        throw error;
      }
    }
    let response: Response | undefined;
    let grant: UploadGrant;
    let responseBody: string | undefined;
    try {
      grant = await withRequestTimeout('presign', UPLOAD_TIMEOUT_MS.presign, async (requestSignal, onHttpError) => {
        assertOwner();
        response = await request(path, 'POST', { version: 2, count: images.length, contentType: 'image/webp', sizeBytes }, requestSignal, onHttpError, assertOwner);
        throwIfRequestAborted(requestSignal);
        responseBody = await response.text();
        throwIfRequestAborted(requestSignal);
        const parsed: UploadGrant = JSON.parse(responseBody);
        if (!parsed || typeof parsed.uploadToken !== 'string' || !Array.isArray(parsed.images)
          || parsed.images.length !== images.length) throw new Error('Invalid upload grant');
        return parsed;
      }, signal);
    } catch (error) {
      if (response) logCommunityError('PRESIGN', { method: 'POST', path: apiPath, status: response.status, responseBody }, error);
      throw error;
    }
    try {
      assertOwner();
      for (let i = 0; i < images.length; i++) {
        const upload = grant.images[i];
        if (!upload || upload.contentType !== 'image/webp' || upload.sortOrder !== i
          || typeof upload.imageKey !== 'string' || !upload.imageKey.endsWith('.webp') || typeof upload.uploadUrl !== 'string') {
          const error = new Error('Invalid WebP upload');
          logCommunityError('PRESIGN', { method: 'POST', path: apiPath, imageIndex: i + 1, status: response?.status }, error);
          throw error;
        }
        const bytes = fileBytes[i]!;
        let put: Response | undefined;
        let putErrorDetails: Awaited<ReturnType<typeof readS3PutError>> | undefined;
        try {
          await withRequestTimeout('put', UPLOAD_TIMEOUT_MS.put, async requestSignal => {
            assertOwner();
            put = await fetch(upload.uploadUrl, {
              // Expo SDK 57 overrides explicit Content-Type with Blob.type (empty for cache files).
              // ArrayBuffer preserves the signed header and avoids the RN Blob/base64 round trip.
              method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: bytes, signal: requestSignal,
            });
            throwIfRequestAborted(requestSignal);
            assertOwner();
            if (!put.ok) {
              putErrorDetails = await readS3PutError(put);
              throw new Error('Image upload failed');
            }
          }, signal);
        } catch (error) {
          logCommunityError('S3_PUT', { method: 'PUT', path: 'S3 post image', imageIndex: i + 1, status: put?.status,
            ...describeS3Put(upload.uploadUrl, bytes),
            ...putErrorDetails,
            requestId: put?.headers.get('x-amz-request-id') ?? undefined }, error);
          throw error;
        } finally {
          // Release uploaded buffers while the remaining PUTs are still in flight.
          fileBytes[i] = undefined;
        }
      }
      throwIfRequestAborted(signal);
      assertOwner();
    } catch (error) {
      fileBytes.length = 0;
      await cancelUpload(grant.uploadToken, request, path, owner);
      throw error;
    }
    return grant.uploadToken;
}

export async function publishPostWithImages(
  category: CommunityPostCategory, content: string, images: PostImage[], attempt: ImagePostAttemptRef, signal?: AbortSignal, owner = captureSubmissionOwner(),
) {
  throwIfRequestAborted(signal);
  assertSubmissionOwner(owner);
  if (!attempt.current) {
    const prepared = { uploadToken: await uploadPostImages(images, communityRequest, 'post-image-uploads', signal, owner), category, content, owner };
    assertSubmissionOwner(owner);
    attempt.current = prepared;
  }
  assertAttemptOwner(attempt.current, owner);
  const pending = { ...attempt.current, owner };
  attempt.current = pending;
  pending.authRequired = false;
  let commitStarted = false;
  const beforeSend = (generation?: number) => { assertSubmissionOwner(owner, generation); throwIfRequestAborted(signal); commitStarted = true; };
  try {
    throwIfRequestAborted(signal);
    // Check again after the API client's asynchronous auth read, immediately before fetch.
    // The screen signal never aborts a commit that may already have saved on the server.
    const result = await createCommunityPost(pending.category, pending.content, pending.uploadToken, beforeSend);
    if (isSubmissionOwnerCurrent(owner) && attempt.current === pending) attempt.current = null;
    return result;
  } catch (error) {
    if (!isSubmissionOwnerCurrent(owner)) {
      pending.authRequired = true;
      if (commitStarted && !(error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status))) pending.outcomeUnknown = true;
      throw error;
    }
    // Never delete images when the commit outcome is unknown (network failure/5xx).
    // Retain the signed grant and immutable request; retry returns the same post id after a lost response.
    if (error instanceof RequestCancelledError && !commitStarted && !pending.outcomeUnknown) {
      attempt.current = null;
      await cancelUpload(pending.uploadToken, communityRequest, 'post-image-uploads', owner);
    } else if (error instanceof CommunityApiError && error.status === 401 && pending.outcomeUnknown) {
      // This rejection says nothing about an earlier lost response. Reauthenticate and retry the same token.
      pending.authRequired = true;
    } else if (error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status)) {
      attempt.current = null;
      // Authentication recovery must not wait for best-effort cleanup with an expired token.
      if (error.status === 401) void cancelUpload(pending.uploadToken, communityRequest, 'post-image-uploads', owner);
      else await cancelUpload(pending.uploadToken, communityRequest, 'post-image-uploads', owner);
    } else pending.outcomeUnknown = true;
    throw error;
  }
}

export async function updatePostWithImages(postId: number, content: string, retainedImageIds: number[],
  images: PostImage[], attempt: { current: ImageEditAttempt | null }, signal?: AbortSignal, owner = captureSubmissionOwner()) {
  return commitImageEdit(attempt,
    async () => ({ postId, content, owner, retainedImageIds: [...retainedImageIds], uploadToken: await uploadPostImages(images, communityRequest, 'post-image-uploads', signal, owner) }),
    (pending, beforeSend) => updateCommunityPost(pending.postId, pending.content, pending.retainedImageIds, pending.uploadToken, beforeSend),
    token => cancelUpload(token, communityRequest, 'post-image-uploads', owner), signal, owner);
}

export async function commitImageEdit<T extends CommitRecovery & { uploadToken: string }, R>(
  attempt: { current: T | null }, prepare: () => Promise<T>, commit: (pending: T, beforeSend: (generation?: number) => void) => Promise<R>, cleanup: (token: string) => Promise<void>, signal?: AbortSignal, owner = captureSubmissionOwner()): Promise<R> {
  throwIfRequestAborted(signal);
  assertSubmissionOwner(owner);
  if (!attempt.current) {
    const prepared = await prepare();
    assertSubmissionOwner(owner);
    attempt.current = prepared;
  }
  assertAttemptOwner(attempt.current, owner);
  const pending = { ...attempt.current, owner };
  attempt.current = pending;
  pending.authRequired = false;
  let commitStarted = false;
  const beforeSend = (generation?: number) => { assertSubmissionOwner(owner, generation); throwIfRequestAborted(signal); commitStarted = true; };
  try {
    throwIfRequestAborted(signal);
    const result = await commit(pending, beforeSend);
    if (isSubmissionOwnerCurrent(owner) && attempt.current === pending) attempt.current = null;
    return result;
  } catch (error) {
    if (!isSubmissionOwnerCurrent(owner)) {
      pending.authRequired = true;
      if (commitStarted && !(error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status))) pending.outcomeUnknown = true;
      throw error;
    }
    // Keep the exact request for a lost commit response, just as image creation does.
    if (error instanceof RequestCancelledError && !commitStarted && !pending.outcomeUnknown) {
      attempt.current = null;
      await cleanup(pending.uploadToken);
    } else if (error instanceof CommunityApiError && error.status === 401 && pending.outcomeUnknown) {
      pending.authRequired = true;
    } else if (error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status)) {
      attempt.current = null;
      if (error.status === 401) void cleanup(pending.uploadToken);
      else await cleanup(pending.uploadToken);
    } else pending.outcomeUnknown = true;
    throw error;
  }
}
