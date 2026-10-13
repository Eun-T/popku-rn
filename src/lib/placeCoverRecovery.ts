import type { PublicPopup, PublicPopupDetail } from './popups';

export const COVER_URL_FRESH_MS = 4 * 60 * 1000;
export const COVER_RECOVERY_RETRY_MS = 30 * 1000;

export function isCoverUrlStale(item: PublicPopup, now = Date.now()): boolean {
  return item.coverImageFetchedAt !== undefined && now - item.coverImageFetchedAt >= COVER_URL_FRESH_MS;
}

export function mergeRecoveredCover(popups: PublicPopup[], original: PublicPopup,
  detail: PublicPopupDetail, fetchedAt: number): PublicPopup[] {
  return popups.map(item => item.publicId === original.publicId
    && item.coverImageUrl === original.coverImageUrl
    && item.coverImageCacheKey === original.coverImageCacheKey
    && item.coverImageFetchedAt === original.coverImageFetchedAt
    ? { ...item, coverImageUrl: detail.coverImageUrl,
        coverImageCacheKey: detail.coverImageCacheKey ?? null, coverImageFetchedAt: fetchedAt }
    : item);
}

/** Scoped to one Place list; attempts survive card virtualization and tab switches. */
export function createPlaceCoverRecovery(
  getDetail: (id: string, signal: AbortSignal) => Promise<PublicPopupDetail>,
  onRecovered: (original: PublicPopup, detail: PublicPopupDetail, fetchedAt: number) => void,
) {
  // Keep successful image records, but distinguish their renewed URL generations.
  const attempted = new Map<string, { fetchedAt: number; completedAt: number }>();
  // Retry only on a later entry/error after cooldown, never from a timer or render loop.
  const retryAfter = new Map<string, number>();
  const pending = new Map<string, { identity: string; generation: string; controller: AbortController; promise: Promise<PublicPopupDetail | null> }>();
  return {
    recover(item: PublicPopup): Promise<PublicPopupDetail | null> {
      if (!item.coverImageUrl || !isCoverUrlStale(item)) return Promise.resolve(null);
      const identity = JSON.stringify([item.publicId, item.coverImageCacheKey ?? item.coverImageUrl]);
      const generation = JSON.stringify([item.coverImageUrl, item.coverImageFetchedAt]);
      const existing = pending.get(item.publicId);
      // Do not deliver another image revision's response to a new card source.
      if (existing) return existing.identity === identity && existing.generation === generation
        ? existing.promise : Promise.resolve(null);
      const previous = attempted.get(identity);
      if (previous && ((item.coverImageFetchedAt ?? 0) < previous.fetchedAt
        || Date.now() - previous.completedAt < COVER_URL_FRESH_MS)) return Promise.resolve(null);
      if (Date.now() < (retryAfter.get(identity) ?? 0)) return Promise.resolve(null);
      retryAfter.delete(identity);
      const controller = new AbortController();
      const fetchedAt = Date.now();
      const promise = Promise.resolve().then(() => getDetail(item.publicId, controller.signal))
        .then(detail => {
          if (controller.signal.aborted) return null;
          if (detail.publicId !== item.publicId) throw new Error('Invalid recovered popup');
          onRecovered(item, detail, fetchedAt);
          const success = { fetchedAt, completedAt: Date.now() };
          attempted.set(identity, success);
          // A replacement is guarded too; neither image may loop on an immediate error.
          attempted.set(JSON.stringify([item.publicId, detail.coverImageCacheKey ?? detail.coverImageUrl]), success);
          return detail;
        }).catch(() => {
          if (!controller.signal.aborted) {
            retryAfter.set(identity, Date.now() + COVER_RECOVERY_RETRY_MS);
          }
          return null;
        }).finally(() => {
          if (pending.get(item.publicId)?.controller === controller) pending.delete(item.publicId);
        });
      pending.set(item.publicId, { identity, generation, controller, promise });
      return promise;
    },
    reset() {
      pending.forEach(request => request.controller.abort());
      pending.clear(); attempted.clear(); retryAfter.clear();
    },
  };
}
