import { API_BASE_URL } from '../constants/api';
import { authenticatedFetch, authSessionGeneration, clearTokens, getAuthSession } from './auth';
import { assertModerationRead, captureModerationRead, publishBlockChange } from './moderationState';

export type ModerationTarget = { targetType: 'POST' | 'COMMENT' | 'REVIEW'; targetId: number };
export const REPORT_REASONS = ['SPAM', 'ABUSE', 'SEXUAL', 'PRIVACY', 'OTHER'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export type BlockedUser = { blockedUserId: number; nickname: string; avatarUrl: string | null; createdAt: string };
export type BlockPage = { items: BlockedUser[]; nextCursor: string | null };
export class ModerationApiError extends Error {
  constructor(readonly status: number) { super(`Moderation request failed (${status})`); }
}
const pending = new Set<string>();

async function request(path: string, method: 'GET' | 'POST' | 'DELETE', generation: number, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const session = await getAuthSession();
  if (session.generation !== generation || generation !== authSessionGeneration() || signal?.aborted) {
    throw new Error('Moderation session superseded');
  }
  if (!session.accessToken) throw new ModerationApiError(401);
  const response = await authenticatedFetch(`${API_BASE_URL}/api/${path}`, {
    method, signal,
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, session);
  if (generation !== authSessionGeneration() || signal?.aborted) throw new Error('Moderation session superseded');
  if (!response.ok) {
    // Do not log request details, auth headers, or server response bodies.
    if (response.status === 401) await clearTokens(generation);
    throw new ModerationApiError(response.status);
  }
  return response;
}

async function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (pending.has(key)) throw new Error('Moderation request already pending');
  pending.add(key);
  try { return await run(); } finally { pending.delete(key); }
}

export async function reportContent(target: ModerationTarget, reason: ReportReason, detail: string, generation: number): Promise<void> {
  if (!REPORT_REASONS.includes(reason) || [...detail].length > 200) throw new ModerationApiError(400);
  return once(`report:${generation}:${target.targetType}:${target.targetId}`, async () => {
    const response = await request('reports', 'POST', generation, { ...target, reason, ...(detail.trim() ? { detail: detail.trim() } : {}) });
    if (response.status !== 201) throw new Error('Invalid report status');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('id' in body) || !Number.isSafeInteger(body.id) || Number(body.id) < 1
      || !('status' in body) || body.status !== 'PENDING') throw new Error('Invalid report receipt');
  });
}

export async function blockContentAuthor(target: ModerationTarget, authorId: number, generation: number,
  onAccepted?: (duplicate: boolean) => void): Promise<void> {
  return once(`block-change:${generation}:${authorId}`, async () => {
    try {
      const response = await request('users/me/blocks', 'POST', generation, target);
      if (response.status !== 201) throw new Error('Invalid block status');
    } catch (error) {
      // A duplicate still means this author's content must disappear locally.
      if (!(error instanceof ModerationApiError) || error.status !== 409) throw error;
      onAccepted?.(true);
      publishBlockChange(authorId, true, generation);
      throw error;
    }
    onAccepted?.(false);
    publishBlockChange(authorId, true, generation);
  });
}

export async function getBlockedUsers(cursor: string | null, signal: AbortSignal, generation: number): Promise<BlockPage> {
  const read = captureModerationRead();
  const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
  const response = await request(`users/me/blocks?${query}`, 'GET', generation, undefined, signal);
  if (response.status !== 200) throw new Error('Invalid block page status');
  const body: unknown = await response.json();
  assertModerationRead(read);
  if (signal.aborted || !body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)
    || !body.items.every(item => item && Number.isSafeInteger(item.blockedUserId) && item.blockedUserId > 0
      && typeof item.nickname === 'string' && (item.avatarUrl === null || typeof item.avatarUrl === 'string') && typeof item.createdAt === 'string')
    || !('nextCursor' in body) || (body.nextCursor !== null && typeof body.nextCursor !== 'string')) throw new Error('Invalid block page');
  return body as BlockPage;
}

export async function unblockUser(userId: number, generation: number, onAccepted?: () => void): Promise<void> {
  return once(`block-change:${generation}:${userId}`, async () => {
    const response = await request(`users/me/blocks/${userId}`, 'DELETE', generation);
    if (response.status !== 204) throw new Error('Invalid unblock status');
    onAccepted?.();
    publishBlockChange(userId, false, generation);
  });
}
