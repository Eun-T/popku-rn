import { authSessionGeneration, subscribeAuthSession } from './auth';
import { markCommunityFeedChanged } from './communityFeedRefresh';

let revision = 0;
const blocked = new Set<number>();
const listeners = new Set<() => void>();
const publish = () => {
  revision += 1;
  markCommunityFeedChanged();
  listeners.forEach(listener => listener());
};
subscribeAuthSession(() => { blocked.clear(); publish(); });

export const moderationRevision = () => revision;
export const subscribeModeration = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isLocallyBlocked = (userId: number) => blocked.has(userId);
export function publishBlockChange(userId: number, isBlocked: boolean, generation: number): void {
  if (generation !== authSessionGeneration()) return;
  if (isBlocked) blocked.add(userId); else blocked.delete(userId);
  publish();
}

// Check after parsing, too: abort alone cannot stop an already queued GET result.
export const captureModerationRead = () => ({ revision, generation: authSessionGeneration() });
export function assertModerationRead(read: ReturnType<typeof captureModerationRead>): void {
  if (read.revision !== revision || read.generation !== authSessionGeneration()) {
    throw new Error('Moderation read superseded');
  }
}
