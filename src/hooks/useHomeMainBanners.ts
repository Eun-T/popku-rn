import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getMainBanners, type MainBannerPopup } from '../lib/mainBanners';
import { COVER_URL_FRESH_MS } from '../lib/placeCoverRecovery';
import { getApiLocale, type Locale } from '../locales';

type CacheEntry = ({ data: MainBannerPopup[]; fetchedAt: number } | { error: true }) & { retryAt?: number };
const cache: Partial<Record<Locale, CacheEntry>> = {};
const requests: Partial<Record<Locale, Promise<void>>> = {};
const listeners: Partial<Record<Locale, Set<() => void>>> = {};

function publish(languageCode: Locale, entry: CacheEntry) {
  cache[languageCode] = entry;
  listeners[languageCode]?.forEach(listener => listener());
}

function revalidate(languageCode: Locale) {
  const entry = cache[languageCode];
  if (entry?.retryAt && Date.now() < entry.retryAt) return;
  if (entry && 'data' in entry && Date.now() - entry.fetchedAt < COVER_URL_FRESH_MS) return;
  if (requests[languageCode]) return;

  const fetchedAt = Date.now();
  requests[languageCode] = getMainBanners(new AbortController().signal, languageCode)
    .then(data => publish(languageCode, { data, fetchedAt }))
    .catch(() => {
      // Keep previously loaded banners on refresh failure, independently of other home sections.
      publish(languageCode, { ...(cache[languageCode] ?? { error: true }), retryAt: Date.now() + COVER_URL_FRESH_MS });
    })
    .finally(() => { delete requests[languageCode]; });
}

export function useHomeMainBanners(): {
  status: 'loading' | 'ready' | 'error';
  popups: MainBannerPopup[];
} {
  const languageCode = getApiLocale();
  const subscribe = useCallback((listener: () => void) => {
    const current = listeners[languageCode] ?? new Set<() => void>();
    listeners[languageCode] = current;
    current.add(listener);
    return () => {
      current.delete(listener);
      if (current.size === 0) delete listeners[languageCode];
    };
  }, [languageCode]);
  const getSnapshot = useCallback(() => cache[languageCode], [languageCode]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => { revalidate(languageCode); }, [languageCode]);
  useEffect(() => {
    if (!entry) return;
    const next = entry.retryAt ?? ('data' in entry ? entry.fetchedAt + COVER_URL_FRESH_MS : Date.now());
    const timer = setTimeout(() => revalidate(languageCode), Math.max(1, next - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [entry, languageCode]);

  if (entry && 'data' in entry) return { status: 'ready', popups: entry.data };
  if (entry && 'error' in entry) return { status: 'error', popups: [] };
  return { status: 'loading', popups: [] };
}
