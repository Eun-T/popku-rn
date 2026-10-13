import type { Locale } from '../locales';
import type { RecoverHomeCover } from '../hooks/useHomeCoverImage';
import { COVER_RECOVERY_RETRY_MS, COVER_URL_FRESH_MS } from './placeCoverRecovery';
import { getPopupDetail, type PublicPopup } from './popups';

type Result = NonNullable<Awaited<ReturnType<RecoverHomeCover>>>;
type Recovery = { pending?: Promise<Result | null>; retryAt: number; result?: Result; completedAt?: number };
// Independent of card lifetime: scrolling and week changes cannot bypass the guard.
const recoveries = new Map<string, Recovery>();
const key = (item: PublicPopup, country: 'KR' | 'JP' | undefined, language: Locale) =>
  JSON.stringify([country, language, item.publicId, item.coverImageCacheKey ?? item.coverImageUrl]);

/** Error-driven recovery shared by weekly and ending-soon posters, never a list request. */
export function recoverExploreCover(item: PublicPopup, country: 'KR' | 'JP' | undefined,
  language: Locale, manual = false): Promise<Result | null> {
  if (!item.coverImageUrl) return Promise.resolve(null);
  const now = Date.now();
  for (const [id, entry] of recoveries) {
    if (!entry.pending && now >= entry.retryAt + COVER_URL_FRESH_MS) recoveries.delete(id);
  }
  const id = key(item, country, language);
  const previous = recoveries.get(id);
  if (previous?.pending) return previous.pending;
  if (!manual && previous?.result && now - (previous.completedAt ?? 0) < COVER_URL_FRESH_MS) {
    if (item.coverImageUrl === previous.result.detail.coverImageUrl) return Promise.resolve(null);
    if ((item.coverImageFetchedAt ?? 0) <= previous.result.fetchedAt) return Promise.resolve(previous.result);
  }
  if (previous && now < previous.retryAt) return Promise.resolve(null);
  const entry: Recovery = previous ?? { retryAt: 0 };
  const fetchedAt = now;
  const controller = new AbortController();
  entry.pending = Promise.resolve().then(() => getPopupDetail(item.publicId, controller.signal, undefined, language))
    .then(detail => {
      if (detail.publicId !== item.publicId || detail.countryCode !== item.countryCode) throw new Error('Cover identity mismatch');
      const result = { detail, fetchedAt };
      entry.result = result;
      entry.completedAt = Date.now();
      // A newly assigned server cache key must inherit the same loop/cooldown guard.
      recoveries.set(key({ ...item, coverImageUrl: detail.coverImageUrl,
        coverImageCacheKey: detail.coverImageCacheKey }, country, language), entry);
      return result;
    }).catch(() => null).finally(() => {
      entry.pending = undefined;
      entry.retryAt = Date.now() + COVER_RECOVERY_RETRY_MS;
    });
  recoveries.set(id, entry);
  return entry.pending;
}

/** Merge image fields only. A GET begun before recovery must not restore its old URL. */
export function mergeExploreCovers(rows: PublicPopup[], country: 'KR' | 'JP' | undefined,
  language: Locale, fetchedAt: number): PublicPopup[] {
  return rows.map(item => {
    const entry = recoveries.get(key(item, country, language));
    const result = entry?.result;
    // Completion orders responses; the request start remains the conservative URL age.
    if (!result || (entry.completedAt ?? 0) < fetchedAt) return { ...item, coverImageFetchedAt: fetchedAt };
    return { ...item, coverImageUrl: result.detail.coverImageUrl,
      coverImageCacheKey: result.detail.coverImageCacheKey ?? null, coverImageFetchedAt: result.fetchedAt };
  });
}
