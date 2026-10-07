import { clearTokens, getAuthSession, getSavedAccessToken } from './auth';
import { CommunityApiError, toggleCommunityPostLike, toggleCommunityReviewLike } from './community';
import {
  beginCommunityLike, endCommunityLike, communityLikeSession,
  mergeCommunityLike, publishCommunityLike, type CommunityLikeState, type CommunityLikeType,
} from './communityFeedRefresh';

// The lock is shared by feed and detail, and acquired before the first await.
export async function changeCommunityLike(
  post: CommunityLikeState & { id: number; type?: CommunityLikeType },
  login: () => void,
  failed: () => void,
): Promise<void> {
  const type = post.type ?? 'POST';
  if (!beginCommunityLike(post.id, type)) return;
  const session = communityLikeSession();
  let previous: CommunityLikeState | undefined;
  let authGeneration: number | undefined;
  try {
    const auth = type === 'REVIEW' ? await getAuthSession() : undefined;
    authGeneration = auth?.generation;
    const token = auth ? auth.accessToken : await getSavedAccessToken();
    if (session !== communityLikeSession()) return;
    if (!token) { login(); return; }
    const current = mergeCommunityLike(post, -1);
    previous = { liked: current.liked, likeCount: current.likeCount };
    publishCommunityLike(post.id, {
      liked: !previous.liked,
      likeCount: Math.max(0, previous.likeCount + (previous.liked ? -1 : 1)),
    }, true, type);
    const result = type === 'REVIEW' ? await toggleCommunityReviewLike(post.id, token, authGeneration)
      : await toggleCommunityPostLike(post.id, token);
    if (session === communityLikeSession()) publishCommunityLike(post.id, result, false, type);
  } catch (error) {
    if (session !== communityLikeSession()) return;
    if (previous) publishCommunityLike(post.id, previous, false, type);
    if (error instanceof CommunityApiError && error.status === 401) {
      if (type === 'REVIEW') {
        if (await clearTokens(authGeneration).catch(() => false)) login();
      } else {
        await clearTokens().catch(() => {});
        login();
      }
    } else failed();
  } finally { endCommunityLike(post.id, type); }
}
