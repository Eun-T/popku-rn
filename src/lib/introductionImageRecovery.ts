import type { Locale } from '../locales';
import { getPopupDetail, type PublicPopupDetail } from './popups';
import { COVER_RECOVERY_RETRY_MS, COVER_URL_FRESH_MS } from './placeCoverRecovery';

export type IntroductionScope = { popupId: string; countryCode: 'KR' | 'JP'; languageCode: Locale };
type Result = { uri: string; fetchedAt: number };
type Recovery = { pending?: Promise<Result | null>; result?: Result; completedAt?: number; retryAt: number };
const recoveries = new Map<string, Recovery>();
const requests = new Map<string, Promise<PublicPopupDetail>>();
// The same object cannot bypass a failed request cooldown by changing the UI language.
type Guard = { pending: boolean; retryAt: number; uri?: string; completedAt?: number };
const guards = new Map<string, Guard>();

/** The API currently exposes URLs only. Match S3 bucket/object paths, never array positions.
 * Keep non-signature parameters (including versionId), so different objects/versions cannot collide.
 * Unknown URL formats are deliberately not eligible for renewal or a stable cache key. */
export function introductionImageId(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'https:' || !/(^|\.)s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?$/.test(url.hostname)) return null;
    const parameters = [...url.searchParams.entries()].filter(([name]) => !/^x-amz-/i.test(name));
    parameters.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
    return JSON.stringify([url.origin, url.pathname, parameters]);
  } catch { return null; }
}

const scopeKey = (scope: IntroductionScope) => JSON.stringify([scope.popupId, scope.countryCode, scope.languageCode]);
const imageKey = (scope: IntroductionScope, identity: string) => JSON.stringify([scopeKey(scope), identity]);

/** A late normal GET may carry an older signed URL. Read cached image fields only. */
export function currentIntroductionUrl(scope: IntroductionScope, uri: string, fetchedAt: number): string {
  const identity = introductionImageId(uri);
  const entry = identity && recoveries.get(imageKey(scope, identity));
  return entry && entry.result && entry.result.fetchedAt >= fetchedAt ? entry.result.uri : uri;
}

export function recoverIntroductionImage(scope: IntroductionScope, uri: string, fetchedAt: number,
  manual = false): Promise<Result | null> {
  const identity = introductionImageId(uri);
  if (!identity) return Promise.resolve(null);
  const now = Date.now();
  for (const [key, entry] of recoveries) {
    if (!entry.pending && now >= entry.retryAt + COVER_URL_FRESH_MS) recoveries.delete(key);
  }
  for (const [key, guard] of guards) {
    if (!guard.pending && now >= guard.retryAt + COVER_URL_FRESH_MS) guards.delete(key);
  }
  const key = imageKey(scope, identity), previous = recoveries.get(key);
  if (previous?.pending) return previous.pending;
  if (!manual && previous?.result && now - (previous.completedAt ?? 0) < COVER_URL_FRESH_MS) {
    if (uri === previous.result.uri) return Promise.resolve(null);
    if (fetchedAt <= previous.result.fetchedAt) return Promise.resolve(previous.result);
  }
  const guardKey = JSON.stringify([scope.popupId, scope.countryCode, identity]);
  const guard = guards.get(guardKey);
  if (!manual && guard?.uri === uri && now - (guard.completedAt ?? 0) < COVER_URL_FRESH_MS) return Promise.resolve(null);
  if ((previous && now < previous.retryAt) || guard?.pending || (guard && now < guard.retryAt)) return Promise.resolve(null);
  const requestGuard: Guard = { pending: true, retryAt: 0 };
  guards.set(guardKey, requestGuard);
  const entry: Recovery = previous ?? { retryAt: 0 };
  const startedAt = now, requestKey = scopeKey(scope);
  let request = requests.get(requestKey);
  if (!request) {
    const controller = new AbortController();
    request = Promise.resolve().then(() => getPopupDetail(scope.popupId, controller.signal, undefined, scope.languageCode))
      .finally(() => { if (requests.get(requestKey) === request) requests.delete(requestKey); });
    requests.set(requestKey, request);
  }
  entry.pending = request.then(detail => {
    if (detail.publicId !== scope.popupId || detail.countryCode !== scope.countryCode
      || !Array.isArray(detail.contentImageUrls)) throw new Error('Introduction image scope mismatch');
    const renewed = detail.contentImageUrls.find(value => typeof value === 'string' && introductionImageId(value) === identity);
    if (!renewed) throw new Error('Introduction image no longer exists');
    const result = { uri: renewed, fetchedAt: startedAt };
    entry.result = result;
    entry.completedAt = Date.now();
    requestGuard.uri = renewed;
    requestGuard.completedAt = entry.completedAt;
    return result;
  }).catch(() => null).finally(() => {
    entry.pending = undefined;
    entry.retryAt = Date.now() + COVER_RECOVERY_RETRY_MS;
    requestGuard.pending = false;
    requestGuard.retryAt = entry.retryAt;
  });
  recoveries.set(key, entry);
  return entry.pending;
}
