import { useSyncExternalStore } from 'react';
import { moderationRevision, subscribeModeration } from '../lib/moderationState';

export function useModerationRevision(): number {
  return useSyncExternalStore(subscribeModeration, moderationRevision, moderationRevision);
}
