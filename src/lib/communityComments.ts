import { API_BASE_URL } from '../constants/api';
import { CommunityApiError, publicCommunityRequest, type CommunityFeedItem } from './community';
import { readCommunityErrorBody } from './communityDiagnostics';
import { beginCommunityRead, mergeCommunityCommentCount, mergeCommunityCommentDeletions, type CommunityLikeType } from './communityFeedRefresh';

export const MAX_COMMENT_LENGTH = 10_000;
export type CommunityComment = {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: CommunityFeedItem['author'];
  parentCommentId: number | null;
  replyToUser: { id: number; nickname: string } | null;
  isOwner: boolean;
};
export type CommentTarget = { commentId: number; parentCommentId: number; replyToUserId: number; nickname: string };
type CommentPage = { items: CommunityComment[]; commentCount: number };
type CreatedComment = { item: CommunityComment; commentCount: number };

function validComment(value: unknown): value is CommunityComment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CommunityComment>;
  return Number.isSafeInteger(item.id) && (item.id ?? 0) > 0 && typeof item.content === 'string' && typeof item.isOwner === 'boolean'
    && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    && !!item.author && Number.isSafeInteger(item.author.id) && item.author.id > 0 && typeof item.author.nickname === 'string'
    && (item.author.avatarUrl === null || typeof item.author.avatarUrl === 'string')
    && (item.parentCommentId === null || (Number.isSafeInteger(item.parentCommentId) && (item.parentCommentId ?? 0) > 0))
    && (item.replyToUser === null || (!!item.replyToUser && Number.isSafeInteger(item.replyToUser.id)
      && item.replyToUser.id > 0 && typeof item.replyToUser.nickname === 'string'));
}
function validCount(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

export async function getCommunityComments(postId: number, signal: AbortSignal, type: CommunityLikeType = 'POST'): Promise<CommentPage> {
  const { version, finish } = beginCommunityRead(signal);
  try {
    const response = await publicCommunityRequest(`${type === 'REVIEW' ? 'reviews' : 'posts'}/${postId}/comments`, signal);
    if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response));
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)
      || !body.items.every(validComment) || !('commentCount' in body) || !validCount(body.commentCount)) {
      throw new Error('Invalid community comments response');
    }
    if (signal.aborted) throw new Error('Community read aborted');
    const merged = mergeCommunityCommentCount({ id: postId, type, commentCount: body.commentCount }, version);
    return { items: mergeCommunityCommentDeletions(postId, body.items, version, type), commentCount: merged.commentCount };
  } finally { finish(); }
}

export async function createCommunityComment(postId: number, content: string, target: CommentTarget | null, token: string,
  type: CommunityLikeType = 'POST', generation?: number): Promise<CreatedComment> {
  const response = await fetch(`${API_BASE_URL}/api/community/${type === 'REVIEW' ? 'reviews' : 'posts'}/${postId}/comments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, ...(target ? { parentCommentId: target.parentCommentId, replyToUserId: target.replyToUserId } : {}) }),
  });
  if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('item' in body) || !validComment(body.item)
    || !('commentCount' in body) || !validCount(body.commentCount)) throw new Error('Invalid community comment response');
  return { item: body.item, commentCount: body.commentCount };
}

export async function deleteCommunityComment(postId: number, commentId: number, token: string,
  type: CommunityLikeType = 'POST', generation?: number): Promise<{ commentCount: number }> {
  const response = await fetch(`${API_BASE_URL}/api/community/${type === 'REVIEW' ? 'reviews' : 'posts'}/${postId}/comments/${commentId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CommunityApiError(response.status, await readCommunityErrorBody(response), generation);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('commentCount' in body) || !validCount(body.commentCount))
    throw new Error('Invalid community comment deletion response');
  return { commentCount: body.commentCount };
}

export function insertCommunityComment(items: CommunityComment[], item: CommunityComment): CommunityComment[] {
  const sorted = [...items.filter((current) => current.id !== item.id), item]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
  return sorted.filter((comment) => comment.parentCommentId === null)
    .flatMap((root) => [root, ...sorted.filter((comment) => comment.parentCommentId === root.id)]);
}
