// A successful write invalidates the mounted feed; detail visits do not.
let revision = 0;

export function communityFeedRevision(): number { return revision; }
export function markCommunityFeedChanged(): void { revision += 1; }

export type CommunityLikeState = { liked: boolean; likeCount: number };
export type CommunityLikeType = 'POST' | 'REVIEW';
const likeKey = (id: number, type: CommunityLikeType) => `${type}:${id}`;
type LikeChange = CommunityLikeState & { version: number; pending: boolean; observed?: boolean };
let likeVersion = 0;
let likeSession = 0;
const likes = new Map<string, LikeChange>();
const busyPosts = new Set<string>();
const likeListeners = new Set<(id: number, state: CommunityLikeState | null, type: CommunityLikeType) => void>();
const commentCounts = new Map<string, { count: number; version: number; observed?: boolean }>();
const commentListeners = new Set<(id: number, count: number, type: CommunityLikeType) => void>();
const reads = new Set<{ version: number }>();
const commentDeletions = new Map<string, { target: string; id: number; root: boolean; version: number }>();
const MAX_RECENT_CHANGES = 256;

function oldestReadVersion(): number {
  let oldest = Infinity;
  for (const read of reads) oldest = Math.min(oldest, read.version);
  return oldest;
}

function collectChanges(): void {
  const oldest = oldestReadVersion();
  for (const [key, change] of commentDeletions) {
    if (oldest >= change.version) commentDeletions.delete(key);
  }
  // Pending mutations and records needed by an older GET are never evicted.
  const idleLikes: string[] = [];
  for (const [id, change] of likes) {
    if (change.pending || busyPosts.has(id) || oldest < change.version) continue;
    if (change.observed) likes.delete(id);
    else idleLikes.push(id);
  }
  const idleCounts: string[] = [];
  for (const [id, change] of commentCounts) {
    if (oldest < change.version) continue;
    if (change.observed) commentCounts.delete(id);
    else idleCounts.push(id);
  }
  // Keep a bounded recent tail for event/React render handoff without requiring another GET.
  for (const id of idleLikes.slice(0, Math.max(0, idleLikes.length - MAX_RECENT_CHANGES))) likes.delete(id);
  for (const id of idleCounts.slice(0, Math.max(0, idleCounts.length - MAX_RECENT_CHANGES))) commentCounts.delete(id);
}

export function beginCommunityRead(signal: AbortSignal): { version: number; finish: () => void } {
  const read = { version: likeVersion };
  const finish = () => {
    reads.delete(read);
    signal.removeEventListener('abort', finish);
    collectChanges();
  };
  if (!signal.aborted) {
    reads.add(read);
    signal.addEventListener('abort', finish, { once: true });
  }
  return { ...read, finish };
}

export type CommunityPostChange = { content: string; images: string[]; updatedAt: string; imageIds?: number[]; rating?: number };
const postChanges = new Map<string, { patch: CommunityPostChange | null; version: number }>();
const postListeners = new Set<(id: number, patch: CommunityPostChange | null, type: CommunityLikeType) => void>();
export function publishCommunityPostChange(id: number, patch: CommunityPostChange | null, type: CommunityLikeType = 'POST'): void {
  postChanges.set(likeKey(id, type), { patch, version: ++likeVersion });
  postListeners.forEach((listener) => listener(id, patch, type));
}
export function subscribeCommunityPostChanges(listener: (id: number, patch: CommunityPostChange | null, type: CommunityLikeType) => void): () => void {
  postListeners.add(listener);
  return () => { postListeners.delete(listener); };
}
export function mergeCommunityPostChange<T extends { id: number; type?: CommunityLikeType }>(item: T, requestVersion: number): T | null {
  const change = postChanges.get(likeKey(item.id, item.type ?? 'POST'));
  // A response already in flight must not restore a deleted item or overwrite a newer edit.
  if (change?.patch === null) return null;
  if (change && change.version > requestVersion) return { ...item, ...change.patch };
  // Later reads are authoritative; keep the version for older requests still in flight.
  return item;
}

export function publishCommunityCommentCount(id: number, count: number, type: CommunityLikeType = 'POST'): void {
  const key = likeKey(id, type);
  commentCounts.delete(key);
  commentCounts.set(key, { count, version: ++likeVersion });
  commentListeners.forEach((listener) => listener(id, count, type));
  collectChanges();
}
// Only outstanding older GETs need tombstones; later server reads are authoritative.
export function publishCommunityCommentDeletion(targetId: number, comment: { id: number; parentCommentId: number | null }, type: CommunityLikeType = 'POST'): void {
  const target = likeKey(targetId, type);
  commentDeletions.set(`${target}:${comment.id}`, { target, id: comment.id, root: comment.parentCommentId === null, version: ++likeVersion });
  collectChanges();
}
export function mergeCommunityCommentDeletions<T extends { id: number; parentCommentId: number | null }>(targetId: number, items: T[], requestVersion: number, type: CommunityLikeType = 'POST'): T[] {
  const target = likeKey(targetId, type);
  const changes = [...commentDeletions.values()].filter(change => change.target === target && change.version > requestVersion);
  return items.filter(item => !changes.some(change => item.id === change.id || (change.root && item.parentCommentId === change.id)));
}
export function subscribeCommunityCommentCounts(listener: (id: number, count: number, type: CommunityLikeType) => void): () => void {
  commentListeners.add(listener);
  return () => { commentListeners.delete(listener); };
}
export function mergeCommunityCommentCount<T extends { id: number; commentCount: number; type?: CommunityLikeType }>(item: T, requestVersion: number): T {
  const key = likeKey(item.id, item.type ?? 'POST');
  const change = commentCounts.get(key);
  if (change && change.version > requestVersion) return { ...item, commentCount: change.count };
  if (change) {
    // A newer read may carry newer server values, but must not consume an older GET's protection.
    commentCounts.set(key, { ...change, count: item.commentCount, observed: true });
    collectChanges();
  }
  return item;
}

export function communityLikeVersion(): number { return likeVersion; }
export function communityLikeSession(): number { return likeSession; }
export function beginCommunityLike(id: number, type: CommunityLikeType = 'POST'): boolean {
  const key = likeKey(id, type);
  if (busyPosts.has(key)) return false;
  busyPosts.add(key);
  return true;
}
export function endCommunityLike(id: number, type: CommunityLikeType = 'POST'): void { busyPosts.delete(likeKey(id, type)); collectChanges(); }
export function publishCommunityLike(id: number, state: CommunityLikeState, pending = false, type: CommunityLikeType = 'POST'): void {
  const key = likeKey(id, type);
  likes.delete(key);
  likes.set(key, { ...state, pending, version: ++likeVersion });
  likeListeners.forEach((listener) => listener(id, state, type));
  collectChanges();
}
export function mergeCommunityLike<T extends CommunityLikeState & { id: number; type?: CommunityLikeType }>(item: T, requestVersion: number): T {
  const key = likeKey(item.id, item.type ?? 'POST');
  const change = likes.get(key);
  if (change && (change.pending || change.version > requestVersion)) {
    return { ...item, liked: change.liked, likeCount: change.likeCount };
  }
  if (change) {
    likes.set(key, { ...change, liked: item.liked, likeCount: item.likeCount, observed: true });
    collectChanges();
  }
  return item;
}
export function subscribeCommunityLikes(listener: (id: number, state: CommunityLikeState | null, type: CommunityLikeType) => void): () => void {
  likeListeners.add(listener);
  return () => { likeListeners.delete(listener); };
}
export function clearCommunityLikes(): void {
  likeSession += 1;
  likes.clear();
  commentCounts.clear();
  postChanges.clear();
  commentDeletions.clear();
  likeListeners.forEach((listener) => listener(0, null, 'POST'));
}
