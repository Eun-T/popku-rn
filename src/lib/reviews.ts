import { assertModerationRead, captureModerationRead } from './moderationState';
import { API_BASE_URL } from '../constants/api';
import { authenticatedFetch, getAuthSession } from './auth';
import { CommunityApiError, publicCommunityRequest, type CommunityFeedItem, type CommunityFeedPage } from './community';
import { beginCommunityRead, markCommunityFeedChanged, mergeCommunityLike, mergeCommunityCommentCount, mergeCommunityPostChange, publishCommunityPostChange, type CommunityPostChange } from './communityFeedRefresh';
import { cancelUpload, uploadPostImages, commitImageEdit, ImageSelectionError, type PostImage } from './communityImages';
import { readCommunityErrorBody } from './communityDiagnostics';
import { RequestCancelledError, throwIfRequestAborted, UPLOAD_TIMEOUT_MS, withRequestTimeout } from './requestTimeout';
import { assertAttemptOwner, assertSubmissionOwner, captureSubmissionOwner, isSubmissionOwnerCurrent, type SubmissionOwner } from './submissionSession';

export const MAX_REVIEW_CONTENT_BYTES = 65_535;
export function reviewContentBytes(content: string): number {
  let bytes = 0;
  for (const character of content) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
type ReviewChangeKind = 'created' | 'updated' | 'deleted';
const listeners = new Set<(publicId: string, kind: ReviewChangeKind) => void>();
export function subscribeReviews(listener: (publicId: string, kind: ReviewChangeKind) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function reviewsCreated(publicId: string): void {
  markCommunityFeedChanged();
  listeners.forEach(listener => listener(publicId, 'created'));
}
const pathFor = (publicId: string) => `popups/${encodeURIComponent(publicId)}`;

export type ReviewDetail = {
  id: number;
  type: 'REVIEW';
  author: CommunityFeedItem['author'];
  popup: CommunityFeedItem['popup'];
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  images: { id: number; url: string }[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
  isOwner: boolean;
};
export function applyReviewChange(review: ReviewDetail, patch: CommunityPostChange): ReviewDetail {
  return { ...review, content: patch.content, rating: patch.rating ?? review.rating, updatedAt: patch.updatedAt,
    images: patch.images.map((url, index) => ({ id: patch.imageIds![index], url })) };
}
export function reviewUpdated(review: ReviewDetail): void {
  publishCommunityPostChange(review.id, { rating: review.rating, content: review.content, updatedAt: review.updatedAt,
    images: review.images.map(image => image.url), imageIds: review.images.map(image => image.id) }, 'REVIEW');
  const publicId = review.popup?.publicId;
  if (publicId) listeners.forEach(listener => listener(publicId, 'updated'));
}
export function reviewDeleted(review: Pick<ReviewDetail, 'id' | 'popup'>): void {
  publishCommunityPostChange(review.id, null, 'REVIEW');
  const publicId = review.popup?.publicId;
  if (publicId) listeners.forEach(listener => listener(publicId, 'deleted'));
}
export async function getReviewDetail(id: number, signal: AbortSignal, edit = false): Promise<ReviewDetail> {
  if (!Number.isSafeInteger(id) || id < 1) throw new CommunityApiError(404);
  const read = captureModerationRead();
  const { version, finish } = beginCommunityRead(signal);
  try {
    const response = edit ? await reviewRequest(`community/reviews/${id}/edit`, 'GET', undefined, signal)
      : await publicCommunityRequest(`reviews/${id}`, signal);
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response));
    const body: unknown = await response.json();
    assertModerationRead(read);
    if (signal.aborted) throw new Error('Review read aborted');
    if (!body || typeof body !== 'object') throw new Error('Invalid review detail');
    const review = body as Partial<ReviewDetail>;
    if (review.id !== id || review.type !== 'REVIEW' || typeof review.content !== 'string'
      || typeof review.rating !== 'number' || !Number.isFinite(review.rating)
      || typeof review.createdAt !== 'string' || typeof review.updatedAt !== 'string'
      || typeof review.liked !== 'boolean' || typeof review.isOwner !== 'boolean'
      || !review.author || typeof review.author.id !== 'number' || typeof review.author.nickname !== 'string'
      || (review.author.avatarUrl !== null && typeof review.author.avatarUrl !== 'string')
      || (review.popup !== null && (!review.popup || typeof review.popup.publicId !== 'string' || typeof review.popup.title !== 'string'))
      || !Array.isArray(review.images) || !review.images.every(image => image && Number.isSafeInteger(image.id) && image.id > 0 && typeof image.url === 'string')
      || ![review.likeCount, review.commentCount].every(count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) {
      throw new Error('Invalid review detail');
    }
    const result = review as ReviewDetail;
    const merged = mergeCommunityPostChange({ ...result, images: result.images.map(image => image.url), imageIds: result.images.map(image => image.id) }, version);
    if (!merged) throw new CommunityApiError(404);
    return mergeCommunityCommentCount(mergeCommunityLike(applyReviewChange(result, merged), version), version);
  } finally { finish(); }
}

export async function reviewRequest(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, signal?: AbortSignal,
  onHttpError?: (error: CommunityApiError) => void, beforeSend?: (generation: number) => void): Promise<Response> {
  const { accessToken, generation } = await getAuthSession();
  throwIfRequestAborted(signal);
  if (method !== 'GET' && !accessToken) throw new CommunityApiError(401, undefined, generation);
  beforeSend?.(generation);
  const response = await authenticatedFetch(`${API_BASE_URL}/api/${path}`, {
    method, signal,
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { accessToken, generation }, method === 'GET');
  throwIfRequestAborted(signal);
  if (!response.ok) {
    onHttpError?.(new CommunityApiError(response.status, undefined, generation));
    const responseBody = await readCommunityErrorBody(response);
    throwIfRequestAborted(signal);
    throw new CommunityApiError(response.status, responseBody, generation);
  }
  return response;
}
export async function getPopupReviews(publicId: string, cursor: string | null, signal: AbortSignal): Promise<CommunityFeedPage> {
  const read = captureModerationRead();
  const { version, finish } = beginCommunityRead(signal);
  try {
    const path = `${pathFor(publicId)}/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await reviewRequest(path, 'GET', undefined, signal);
    const page: unknown = await response.json();
    if (!page || typeof page !== 'object' || !('items' in page) || !Array.isArray(page.items)
      || !('nextCursor' in page) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) throw new Error('Invalid review page');
    assertModerationRead(read);
    if (signal.aborted) throw new Error('Review read aborted');
    const result = page as CommunityFeedPage;
    return { ...result, items: result.items.map(item => mergeCommunityPostChange(mergeCommunityCommentCount(mergeCommunityLike(item, version), version), version)!).filter(Boolean) };
  } finally { finish(); }
}
export async function createReview(publicId: string, rating: number, content: string, uploadToken?: string, beforeSend?: (generation: number) => void): Promise<{ id: number }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewContentBytes(content) > MAX_REVIEW_CONTENT_BYTES) throw new Error('Invalid review');
  return withRequestTimeout('commit', UPLOAD_TIMEOUT_MS.commit, async (signal, onHttpError) => {
    const response = await reviewRequest(`${pathFor(publicId)}/reviews`, 'POST', { rating, content, ...(uploadToken ? { uploadToken } : {}) }, signal, onHttpError, beforeSend);
    const result: unknown = await response.json();
    throwIfRequestAborted(signal);
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'number'
      || !Number.isSafeInteger(result.id) || result.id < 1) throw new Error('Invalid review response');
    return { id: result.id };
  });
}
export type ReviewAttempt = { publicId: string; rating: number; content: string; uploadToken: string; owner?: SubmissionOwner; outcomeUnknown?: boolean; authRequired?: boolean };
export async function deleteReview(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id < 1) throw new CommunityApiError(404);
  await reviewRequest(`community/reviews/${id}`, 'DELETE');
}
export type ReviewEditAttempt = ReviewAttempt & { id: number; retainedImageIds: number[] };
export async function updateReview(id: number, rating: number, content: string, retainedImageIds: number[], uploadToken?: string, beforeSend?: (generation: number) => void): Promise<ReviewDetail> {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5
    || reviewContentBytes(content) > MAX_REVIEW_CONTENT_BYTES || retainedImageIds.length > 5
    || new Set(retainedImageIds).size !== retainedImageIds.length || retainedImageIds.some(imageId => !Number.isSafeInteger(imageId) || imageId < 1)) throw new Error('Invalid review edit');
  return withRequestTimeout('commit', UPLOAD_TIMEOUT_MS.commit, async (signal, onHttpError) => {
    const response = await reviewRequest(`community/reviews/${id}`, 'PATCH', { rating, content, retainedImageIds, ...(uploadToken ? { uploadToken } : {}) }, signal, onHttpError, beforeSend);
    const result = await response.json() as ReviewDetail;
    throwIfRequestAborted(signal);
    if (result.id !== id || result.type !== 'REVIEW' || !Array.isArray(result.images)
      || result.images.length > 5 || !result.images.every(image => Number.isSafeInteger(image.id) && typeof image.url === 'string')
      || typeof result.content !== 'string' || !Number.isInteger(result.rating) || typeof result.updatedAt !== 'string') throw new Error('Invalid review edit response');
    return result;
  });
}
export function updateReviewWithImages(id: number, publicId: string, rating: number, content: string, retainedImageIds: number[], images: PostImage[], attempt: { current: ReviewEditAttempt | null }, signal?: AbortSignal, owner = captureSubmissionOwner()): Promise<ReviewDetail> {
  if (!attempt.current && retainedImageIds.length + images.length > 5) throw new ImageSelectionError('limit');
  return commitImageEdit(attempt,
    async () => ({ id, publicId, rating, content, owner, retainedImageIds: [...retainedImageIds], uploadToken: await uploadPostImages(images, reviewRequest, `${pathFor(publicId)}/review-image-uploads`, signal, owner) }),
    (pending, beforeSend) => updateReview(pending.id, pending.rating, pending.content, pending.retainedImageIds, pending.uploadToken, beforeSend),
    token => cancelUpload(token, reviewRequest, `${pathFor(publicId)}/review-image-uploads`, owner), signal, owner);
}
export async function publishReviewWithImages(publicId: string, rating: number, content: string, images: PostImage[], attempt: { current: ReviewAttempt | null }, signal?: AbortSignal, owner = captureSubmissionOwner()): Promise<{ id: number }> {
  throwIfRequestAborted(signal);
  assertSubmissionOwner(owner);
  if (!attempt.current) {
    const prepared = { publicId, rating, content, owner,
      uploadToken: await uploadPostImages(images, reviewRequest, `${pathFor(publicId)}/review-image-uploads`, signal, owner) };
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
    const result = await createReview(pending.publicId, pending.rating, pending.content, pending.uploadToken, beforeSend);
    if (isSubmissionOwnerCurrent(owner) && attempt.current === pending) attempt.current = null;
    return result;
  } catch (error) {
    if (!isSubmissionOwnerCurrent(owner)) {
      pending.authRequired = true;
      if (commitStarted && !(error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status))) pending.outcomeUnknown = true;
      throw error;
    }
    if (error instanceof RequestCancelledError && !commitStarted && !pending.outcomeUnknown) {
      attempt.current = null;
      await cancelUpload(pending.uploadToken, reviewRequest, `${pathFor(pending.publicId)}/review-image-uploads`, owner);
    } else if (error instanceof CommunityApiError && error.status === 401 && pending.outcomeUnknown) pending.authRequired = true;
    else if (error instanceof CommunityApiError && [400, 401, 403, 404, 409].includes(error.status)) {
      attempt.current = null;
      const cleanup = cancelUpload(pending.uploadToken, reviewRequest, `${pathFor(pending.publicId)}/review-image-uploads`, owner);
      if (error.status !== 401) await cleanup;
    } else pending.outcomeUnknown = true;
    throw error;
  }
}
