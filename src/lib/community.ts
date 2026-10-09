import { API_BASE_URL } from '../constants/api';
import { clearTokens, getAuthSession } from './auth';
import { logCommunityError, readCommunityErrorBody } from './communityDiagnostics';
import { beginCommunityRead, mergeCommunityLike, mergeCommunityCommentCount, mergeCommunityPostChange, type CommunityLikeState } from './communityFeedRefresh';

export type CommunityCategory = 'ALL' | 'REVIEW' | 'QUESTION' | 'FREE';
export type CommunitySort = 'LATEST' | 'POPULAR';
export type CommunityPostCategory = 'QUESTION' | 'FREE';
export type CreatedCommunityPost = { id: number };

export class CommunityApiError extends Error {
  constructor(public readonly status: number, public readonly responseBody?: string,
    public readonly authGeneration?: number) { super(`Community request failed (${status})`); }
}

export async function communityRequest(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, signal?: AbortSignal): Promise<Response> {
  const stage = path.startsWith('posts/') ? 'POST_CHANGE' : path === 'posts' ? 'POST_CREATE' : method === 'DELETE' ? 'CLEANUP' : 'PRESIGN';
  const apiPath = `/api/community/${path}`;
  try {
    const { accessToken: token, generation } = await getAuthSession();
    if (!token) throw new CommunityApiError(401, undefined, generation);
    const response = await fetch(`${API_BASE_URL}${apiPath}`, {
      method,
      ...(signal ? { signal } : {}),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
    return response;
  } catch (error) {
    logCommunityError(stage, { method, path: apiPath,
      ...(error instanceof CommunityApiError ? { status: error.status, responseBody: error.responseBody } : {}),
    }, error);
    throw error;
  }
}

export type CommunityFeedItem = {
  type: 'REVIEW' | 'POST';
  id: number;
  category: Exclude<CommunityCategory, 'ALL'>;
  author: { id: number; nickname: string; avatarUrl: string | null };
  content: string;
  createdAt: string;
  regionName: string | null;
  popup: { publicId: string; title: string } | null;
  rating: number | null;
  images: string[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
  viewCount: number;
};

export type CommunityFeedPage = { items: CommunityFeedItem[]; nextCursor: string | null };

export type CommunityPostDetail = {
  id: number;
  category: CommunityPostCategory;
  author: CommunityFeedItem['author'];
  content: string;
  createdAt: string;
  updatedAt: string;
  images: string[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
  viewCount: number;
  isOwner?: boolean;
  imageIds?: number[];
};

export async function getCommunityPost(id: number, signal: AbortSignal): Promise<CommunityPostDetail> {
  if (!Number.isSafeInteger(id) || id < 1) throw new CommunityApiError(404);
  const { version, finish } = beginCommunityRead(signal);
  try {
    const response = await publicCommunityRequest(`posts/${id}`, signal);
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response));
    const post = parseCommunityPost(await response.json(), id);
    if (signal.aborted) throw new Error('Community read aborted');
    const merged = mergeCommunityPostChange(mergeCommunityCommentCount(mergeCommunityLike(post, version), version), version);
    if (!merged) throw new CommunityApiError(404);
    return merged;
  } finally { finish(); }
}

function parseCommunityPost(body: unknown, id: number): CommunityPostDetail {
  if (!body || typeof body !== 'object') throw new Error('Invalid community detail response');
  const post = body as Partial<CommunityPostDetail>;
  if (post.id !== id || !['QUESTION', 'FREE'].includes(post.category ?? '')
    || typeof post.liked !== 'boolean' || typeof post.content !== 'string' || typeof post.createdAt !== 'string' || typeof post.updatedAt !== 'string'
    || !post.author || typeof post.author.id !== 'number' || typeof post.author.nickname !== 'string'
    || (post.author.avatarUrl !== null && typeof post.author.avatarUrl !== 'string')
    || !Array.isArray(post.images) || !post.images.every((url) => typeof url === 'string')
    || ![post.likeCount, post.commentCount, post.viewCount].every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) {
    throw new Error('Invalid community detail response');
  }
  if (post.isOwner !== undefined && typeof post.isOwner !== 'boolean') throw new Error('Invalid post owner');
  if (post.imageIds !== undefined && (!Array.isArray(post.imageIds) || post.imageIds.length !== post.images.length
    || !post.imageIds.every((value) => Number.isSafeInteger(value) && value > 0))) throw new Error('Invalid image IDs');
  return post as CommunityPostDetail;
}

export async function getCommunityPostForEdit(id: number, signal: AbortSignal): Promise<CommunityPostDetail> {
  if (!Number.isSafeInteger(id) || id < 1) throw new CommunityApiError(404);
  const response = await communityRequest(`posts/${id}/edit`, 'GET', undefined, signal);
  const post = parseCommunityPost(await response.json(), id);
  if (!post.isOwner || !post.imageIds) throw new CommunityApiError(403);
  return post;
}

export async function updateCommunityPost(id: number, content: string, retainedImageIds: number[], uploadToken?: string): Promise<CommunityPostDetail> {
  const response = await communityRequest(`posts/${id}`, 'PATCH', { content, retainedImageIds, ...(uploadToken ? { uploadToken } : {}) });
  return parseCommunityPost(await response.json(), id);
}

export async function deleteCommunityPost(id: number): Promise<void> {
  await communityRequest(`posts/${id}`, 'DELETE');
}

export async function publicCommunityRequest(path: string, signal: AbortSignal): Promise<Response> {
  const { accessToken: token, generation } = await getAuthSession();
  const response = await fetch(`${API_BASE_URL}/api/community/${path}`, {
    signal, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  if (token && response.status === 401 && !signal.aborted) {
    await clearTokens(generation);
    // Another login may have won while the expired request was in flight.
    const current = await getAuthSession();
    return fetch(`${API_BASE_URL}/api/community/${path}`, {
      signal, ...(current.accessToken ? { headers: { Authorization: `Bearer ${current.accessToken}` } } : {}),
    });
  }
  return response;
}

export async function toggleCommunityPostLike(id: number, token: string): Promise<CommunityLikeState> {
  return toggleItemLike('posts', id, token);
}
export async function toggleCommunityReviewLike(id: number, token: string, generation?: number): Promise<CommunityLikeState> {
  return toggleItemLike('reviews', id, token, generation);
}
async function toggleItemLike(domain: 'posts' | 'reviews', id: number, token: string, generation?: number): Promise<CommunityLikeState> {
  const response = await fetch(`${API_BASE_URL}/api/community/${domain}/${id}/like`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('liked' in body) || typeof body.liked !== 'boolean'
    || !('likeCount' in body) || typeof body.likeCount !== 'number' || !Number.isSafeInteger(body.likeCount) || body.likeCount < 0) {
    throw new Error('Invalid community like response');
  }
  return { liked: body.liked, likeCount: body.likeCount };
}

export async function createCommunityPost(
  category: CommunityPostCategory,
  content: string,
  uploadToken?: string,
): Promise<CreatedCommunityPost> {
  const response = await communityRequest('posts', 'POST', { category, content, ...(uploadToken ? { uploadToken } : {}) });

  let responseBody: string | undefined;
  try {
    responseBody = await response.text();
    const body: unknown = JSON.parse(responseBody);
    if (!body || typeof body !== 'object' || !('id' in body)
      || typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id < 1) {
      throw new Error('Invalid community post response');
    }
    return { id: body.id };
  } catch (error) {
    logCommunityError('POST_CREATE', { method: 'POST', path: '/api/community/posts', status: response.status, responseBody }, error);
    throw error;
  }
}

export async function getCommunityFeed(
  category: CommunityCategory,
  sort: CommunitySort,
  cursor: string | null,
  signal: AbortSignal,
): Promise<CommunityFeedPage> {
  const query = new URLSearchParams({ category, sort, limit: '14' });
  if (cursor) query.set('cursor', cursor);
  const { version, finish } = beginCommunityRead(signal);
  try {
    const response = await publicCommunityRequest(`feed?${query.toString()}`, signal);
    if (!response.ok) throw new Error('Community feed request failed');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)
      || !('nextCursor' in body) || (body.nextCursor !== null && typeof body.nextCursor !== 'string')) {
      throw new Error('Invalid community feed response');
    }
    if (signal.aborted) throw new Error('Community read aborted');
    const page = body as CommunityFeedPage;
    return { ...page, items: page.items.flatMap((item) => {
        const likedItem = mergeCommunityCommentCount(mergeCommunityLike(item, version), version);
        const merged = mergeCommunityPostChange(likedItem, version);
      return merged ? [merged] : [];
    }) };
  } finally { finish(); }
}
