import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getNewPopups, getNowHotPopups, getPopupPage, getPopupDetail, type PublicPopup, type PublicPopupDetail } from '../lib/popups';
import { COVER_RECOVERY_RETRY_MS, COVER_URL_FRESH_MS, mergeRecoveredCover } from '../lib/placeCoverRecovery';
import type { RecoverHomeCover } from './useHomeCoverImage';
import { useTranslation } from './useTranslation';
import type { Locale } from '../locales';
import { API_BASE_URL } from '../constants/api';

type Section = 'trending' | 'new' | 'latest' | 'japanNew';
type Country = 'KR' | 'JP';
type HomeCountry = Country | 'ALL';
type CacheKey = `${Section}:${HomeCountry}:${Locale}`;
type CacheEntry = ({ data: PublicPopup[]; fetchedAt: number } | { error: true }) & { retryAt?: number };

const TTL_MS = 10 * 60 * 1000;
const cache: Partial<Record<CacheKey, CacheEntry>> = {};
const requests: Partial<Record<CacheKey, Promise<void>>> = {};
const listeners: Partial<Record<CacheKey, Set<() => void>>> = {};
type CoverResult = { detail: PublicPopupDetail; fetchedAt: number };
type CoverRequest = { promise?: Promise<CoverResult | null>; retryAt: number; result?: CoverResult };
// Home-only allowance: keep it across virtualization, without changing Place's policy.
const covers = new Map<string, CoverRequest>();

function sameCover(a: PublicPopup, b: PublicPopup) {
  return a.publicId === b.publicId && a.coverImageUrl === b.coverImageUrl
    && a.coverImageCacheKey === b.coverImageCacheKey && a.coverImageFetchedAt === b.coverImageFetchedAt;
}

function recoverCover(country: Country, languageCode: Locale, item: PublicPopup, manual: boolean): Promise<CoverResult | null> {
  const keys: CacheKey[] = [`new:${country}:${languageCode}`, `trending:${country}:${languageCode}`, `latest:ALL:${languageCode}`, `japanNew:JP:${languageCode}`];
  if (!item.coverImageUrl || !keys.some(key => {
    const entry = cache[key];
    return entry && 'data' in entry && entry.data.some(popup => sameCover(popup, item));
  })) return Promise.resolve(null);
  const identity = JSON.stringify([country, languageCode, item.publicId, item.coverImageCacheKey ?? item.coverImageUrl]);
  // Bound records to the same lifetime as the home cache; never discard in-flight work.
  for (const [key, record] of covers) {
    if (!record.promise && Date.now() - record.retryAt > TTL_MS) covers.delete(key);
  }
  const record = covers.get(identity) ?? { retryAt: 0 };
  function patch(result: CoverResult) {
    for (const key of keys) {
      const entry = cache[key];
      if (!entry || !('data' in entry)) continue;
      const original = entry.data.find(popup => popup.publicId === item.publicId
        && popup.coverImageUrl === item.coverImageUrl && popup.coverImageCacheKey === item.coverImageCacheKey
        && (popup.coverImageFetchedAt === item.coverImageFetchedAt
          || (popup.coverImageFetchedAt ?? 0) <= result.fetchedAt));
      if (!original) continue;
      // Section requests may have different timestamps for the same failed source.
      const data = mergeRecoveredCover(entry.data, original, result.detail, result.fetchedAt);
      publish(key, { ...entry, data });
    }
  }
  if (record.promise) return record.promise.then(result => { if (result) patch(result); return result; });
  if (!manual && record.result && Date.now() - record.result.fetchedAt < COVER_URL_FRESH_MS) {
    // Reuse an already renewed URL, but do not loop when that URL itself fails.
    if (item.coverImageUrl === record.result.detail.coverImageUrl) return Promise.resolve(null);
    patch(record.result);
    return Promise.resolve(record.result);
  }
  if (Date.now() < record.retryAt) return Promise.resolve(null);
  const controller = new AbortController();
  const fetchedAt = Date.now();
  record.promise = Promise.resolve().then(() => getPopupDetail(item.publicId, controller.signal, undefined, languageCode))
    .then(detail => {
      if (detail.publicId !== item.publicId || detail.countryCode !== country) return null;
      const result = { detail, fetchedAt };
      record.result = result;
      // Only this failed source's cover fields change; titles/order/TTL stay intact.
      patch(result);
      // A replaced object must not trigger another automatic recovery immediately.
      const replacement = JSON.stringify([country, languageCode, item.publicId, detail.coverImageCacheKey ?? detail.coverImageUrl]);
      covers.set(replacement, record);
      return result;
    }).catch(() => null).finally(() => {
      record.promise = undefined;
      record.retryAt = Date.now() + COVER_RECOVERY_RETRY_MS;
    });
  covers.set(identity, record);
  return record.promise;
}

function publish(key: CacheKey, entry: CacheEntry) {
  cache[key] = entry;
  listeners[key]?.forEach((listener) => listener());
}

async function getJapanNewPopups(signal: AbortSignal, languageCode: Locale): Promise<PublicPopup[]> {
  // Match web japan-new-popups: unpaginated JP list, no status/homeNew/date
  // filters. The server owns created_at DESC, id DESC; createdAt is not a DTO field.
  const response = await fetch(`${API_BASE_URL}/api/popups?countryCode=JP&languageCode=${encodeURIComponent(languageCode)}`, { signal });
  if (!response.ok) throw new Error('Japan new popups unavailable');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)
    || 'nextCursor' in body || 'hasMore' in body || 'page' in body) throw new Error('Invalid Japan popup list');
  const seen = new Set<string>();
  for (const value of body.popups as unknown[]) {
    if (!value || typeof value !== 'object') throw new Error('Invalid Japan popup');
    const popup = value as Partial<PublicPopup>;
    if (popup.countryCode !== 'JP' || typeof popup.publicId !== 'string' || !popup.publicId
      || typeof popup.name !== 'string' || !popup.name || !Array.isArray(popup.tags)
      || seen.has(popup.publicId)) throw new Error('Invalid Japan popup');
    seen.add(popup.publicId);
  }
  return (body.popups as PublicPopup[]).slice(0, 10);
}

function revalidate(section: Section, country: HomeCountry, languageCode: Locale) {
  const key: CacheKey = `${section}:${country}:${languageCode}`;
  const entry = cache[key];
  if (entry?.retryAt && Date.now() < entry.retryAt) return;
  if (entry && 'data' in entry && Date.now() - entry.fetchedAt < TTL_MS) return;
  if (requests[key]) return;

  const controller = new AbortController();
  const fetchedAt = Date.now();
  // Pagination accepts only limit=10. Keep the first seven in the server's registration order.
  const request = section === 'latest'
    ? getPopupPage(undefined, controller.signal, {}, null, languageCode).then(page => page.popups.slice(0, 7))
    : section === 'japanNew' ? getJapanNewPopups(controller.signal, languageCode)
    : (section === 'trending' ? getNowHotPopups : getNewPopups)(country as Country, controller.signal, languageCode);
  requests[key] = request
    .then((data) => {
      const cached = cache[key];
      const previous = new Map(cached && 'data' in cached ? cached.data.map(item => [item.publicId, item]) : []);
      const merged = data.map(item => {
        const latest = previous.get(item.publicId);
        // A list GET started before recovery cannot overwrite a newer URL for the same image.
        return latest?.coverImageCacheKey && latest.coverImageCacheKey === item.coverImageCacheKey
          && (latest.coverImageFetchedAt ?? 0) >= fetchedAt
          ? { ...item, coverImageUrl: latest.coverImageUrl, coverImageCacheKey: latest.coverImageCacheKey,
              coverImageFetchedAt: latest.coverImageFetchedAt }
          : { ...item, coverImageFetchedAt: fetchedAt };
      });
      publish(key, { data: merged, fetchedAt: Date.now() });
    })
    .catch(() => {
      // A failed refresh must leave stale cards visible.
      const cached = cache[key];
      publish(key, { ...(cached ?? { error: true }), retryAt: Date.now() + TTL_MS });
    })
    .finally(() => { delete requests[key]; });
}

export function useHomePopups(section: Section, country: HomeCountry, enabled = true): {
  status: 'loading' | 'ready' | 'error';
  popups: PublicPopup[];
  recoverCover?: RecoverHomeCover;
} {
  const { resolvedLanguage: languageCode } = useTranslation();
  const key: CacheKey = `${section}:${country}:${languageCode}`;
  const subscribe = useCallback((listener: () => void) => {
    const keyListeners = listeners[key] ?? new Set<() => void>();
    listeners[key] = keyListeners;
    keyListeners.add(listener);
    return () => {
      keyListeners.delete(listener);
      if (keyListeners.size === 0) delete listeners[key];
    };
  }, [key]);
  const getSnapshot = useCallback(() => cache[key], [key]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const recover = useCallback<RecoverHomeCover>((item, manual = false) => {
    const coverCountry = country === 'ALL' ? item.countryCode : country;
    if (coverCountry !== 'KR' && coverCountry !== 'JP') return Promise.resolve(null);
    return recoverCover(coverCountry, languageCode, item, manual);
  }, [country, languageCode]);

  useEffect(() => { if (enabled) revalidate(section, country, languageCode); }, [section, country, languageCode, enabled]);
  useEffect(() => {
    if (!enabled || !entry) return;
    const next = entry.retryAt ?? ('data' in entry ? entry.fetchedAt + TTL_MS : Date.now());
    const timer = setTimeout(() => revalidate(section, country, languageCode), Math.max(1, next - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [entry, section, country, languageCode, enabled]);

  if (entry && 'data' in entry) return { status: 'ready', popups: entry.data, recoverCover: recover };
  if (entry && 'error' in entry) return { status: 'error', popups: [] };
  return { status: 'loading', popups: [] };
}
