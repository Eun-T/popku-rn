import { API_BASE_URL } from '../constants/api';
import { getAuthSession } from './auth';
import { CommunityApiError, type CommunityFeedItem } from './community';
import { readCommunityErrorBody } from './communityDiagnostics';
import { beginCommunityRead, mergeCommunityPostChange, mergeCommunityCommentCount } from './communityFeedRefresh';

export type MyPost = CommunityFeedItem & { type: 'POST'; category: 'QUESTION' | 'FREE' };
export type MyPostPage = { items: MyPost[]; nextCursor: string | null };

export async function getMyPosts(cursor: string | null, signal: AbortSignal): Promise<MyPostPage> {
  const { version, finish } = beginCommunityRead(signal);
  try {
    const { accessToken, generation } = await getAuthSession();
    if (signal.aborted) throw new Error('Post read aborted');
    if (!accessToken) throw new CommunityApiError(401, undefined, generation);
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/users/me/posts${query}`, {
      signal, headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
    const body = await response.json() as Partial<MyPostPage> | null;
    if (signal.aborted) throw new Error('Post read aborted');
    if (!body || !Array.isArray(body.items)
      || (body.nextCursor !== null && (typeof body.nextCursor !== 'string' || !/^[1-9]\d*$/.test(body.nextCursor)))
      || !body.items.every(item => item && item.type === 'POST' && ['QUESTION', 'FREE'].includes(item.category)
        && Number.isSafeInteger(item.id) && item.id > 0
        && item.author && Number.isSafeInteger(item.author.id) && item.author.id > 0 && typeof item.author.nickname === 'string'
        && (item.author.avatarUrl === null || typeof item.author.avatarUrl === 'string')
        && typeof item.content === 'string' && typeof item.createdAt === 'string'
        && item.popup === null && item.rating === null && item.regionName === null
        && Array.isArray(item.images) && item.images.every(url => typeof url === 'string')
        && typeof item.liked === 'boolean'
        && [item.likeCount, item.commentCount, item.viewCount].every(value => Number.isSafeInteger(value) && value >= 0))) {
      throw new Error('Invalid my posts response');
    }
    const page = body as MyPostPage;
    return { ...page, items: page.items.flatMap(item => {
      const merged = mergeCommunityPostChange(item, version);
      return merged ? [mergeCommunityCommentCount(merged, version)] : [];
    }) };
  } finally { finish(); }
}

export function appendMyPosts(current: MyPost[], incoming: MyPost[]): MyPost[] {
  const ids = new Set(current.map(item => item.id));
  return [...current, ...incoming.filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id); return true;
  })];
}
