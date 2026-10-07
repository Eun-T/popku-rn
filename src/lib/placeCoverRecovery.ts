import type { PublicPopup, PublicPopupDetail } from './popups';

export const COVER_URL_FRESH_MS = 4 * 60 * 1000;

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
  const attempted = new Set<string>();
  const pending = new Map<string, { identity: string; controller: AbortController; promise: Promise<PublicPopupDetail | null> }>();
  return {
    recover(item: PublicPopup): Promise<PublicPopupDetail | null> {
      if (!item.coverImageUrl || !isCoverUrlStale(item)) return Promise.resolve(null);
      const identity = JSON.stringify([item.publicId, item.coverImageCacheKey ?? item.coverImageUrl]);
      const existing = pending.get(item.publicId);
      // Do not deliver another image revision's response to a new card source.
      if (existing) return existing.identity === identity ? existing.promise : Promise.resolve(null);
      if (attempted.has(identity)) return Promise.resolve(null);
      attempted.add(identity);
      const controller = new AbortController();
      const fetchedAt = Date.now();
      const promise = Promise.resolve().then(() => getDetail(item.publicId, controller.signal))
        .then(detail => {
          if (controller.signal.aborted || detail.publicId !== item.publicId) return null;
          onRecovered(item, detail, fetchedAt);
          // An image replacement also consumes this item's recovery allowance.
          attempted.add(JSON.stringify([item.publicId, detail.coverImageCacheKey ?? detail.coverImageUrl]));
          return detail;
        }).catch(() => null).finally(() => {
          if (pending.get(item.publicId)?.controller === controller) pending.delete(item.publicId);
        });
      pending.set(item.publicId, { identity, controller, promise });
      return promise;
    },
    reset() {
      pending.forEach(request => request.controller.abort());
      pending.clear(); attempted.clear();
    },
  };
}
