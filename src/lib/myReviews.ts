import { API_BASE_URL } from '../constants/api';
import { getAuthSession } from './auth';
import { CommunityApiError, type CommunityFeedItem } from './community';
import { readCommunityErrorBody } from './communityDiagnostics';
import { beginCommunityRead, mergeCommunityPostChange } from './communityFeedRefresh';

export type MyReview = CommunityFeedItem & {
  type: 'REVIEW'; category: 'REVIEW'; rating: number;
  popup: { publicId: string; title: string };
};
export type MyReviewPage = { items: MyReview[]; nextCursor: string | null };

export async function getMyReviews(cursor: string | null, signal: AbortSignal): Promise<MyReviewPage> {
  const { version, finish } = beginCommunityRead(signal);
  try {
    const { accessToken, generation } = await getAuthSession();
    if (!accessToken) throw new CommunityApiError(401, undefined, generation);
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/users/me/reviews${query}`, {
      signal, headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
    const body = await response.json() as Partial<MyReviewPage> | null;
    if (signal.aborted) throw new Error('Review read aborted');
    if (!body || !Array.isArray(body.items)
      || (body.nextCursor !== null && (typeof body.nextCursor !== 'string' || !/^[1-9]\d*$/.test(body.nextCursor)))
      || !body.items.every(item => item && item.type === 'REVIEW' && item.category === 'REVIEW'
        && Number.isSafeInteger(item.id) && item.id > 0
        && item.author && Number.isSafeInteger(item.author.id) && typeof item.author.nickname === 'string'
        && (item.author.avatarUrl === null || typeof item.author.avatarUrl === 'string')
        && item.popup && typeof item.popup.publicId === 'string' && item.popup.publicId.length > 0 && typeof item.popup.title === 'string'
        && typeof item.content === 'string' && typeof item.createdAt === 'string'
        && typeof item.rating === 'number' && Number.isFinite(item.rating)
        && Array.isArray(item.images) && item.images.every(url => typeof url === 'string')
        && (item.regionName === null || typeof item.regionName === 'string') && typeof item.liked === 'boolean'
        && [item.likeCount, item.commentCount, item.viewCount].every(value => Number.isSafeInteger(value) && value >= 0))) {
      throw new Error('Invalid my reviews response');
    }
    const page = body as MyReviewPage;
    return { ...page, items: page.items.flatMap(item => {
      const merged = mergeCommunityPostChange(item, version);
      return merged ? [merged] : [];
    }) };
  } finally { finish(); }
}

export function appendMyReviews(current: MyReview[], incoming: MyReview[]): MyReview[] {
  const ids = new Set(current.map(item => item.id));
  return [...current, ...incoming.filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id); return true;
  })];
}
