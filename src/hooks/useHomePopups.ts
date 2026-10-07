import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getNewPopups, getNowHotPopups, type PublicPopup } from '../lib/popups';

type Section = 'trending' | 'new';
type Country = 'KR' | 'JP';
type CacheKey = `${Section}:${Country}`;
type CacheEntry = ({ data: PublicPopup[]; fetchedAt: number } | { error: true }) & { retryAt?: number };

const TTL_MS = 10 * 60 * 1000;
const cache: Partial<Record<CacheKey, CacheEntry>> = {};
const requests: Partial<Record<CacheKey, Promise<void>>> = {};
const listeners: Partial<Record<CacheKey, Set<() => void>>> = {};

function publish(key: CacheKey, entry: CacheEntry) {
  cache[key] = entry;
  listeners[key]?.forEach((listener) => listener());
}

function revalidate(section: Section, country: Country) {
  const key: CacheKey = `${section}:${country}`;
  const entry = cache[key];
  if (entry?.retryAt && Date.now() < entry.retryAt) return;
  if (entry && 'data' in entry && Date.now() - entry.fetchedAt < TTL_MS) return;
  if (requests[key]) return;

  const controller = new AbortController();
  const fetchPopups = section === 'trending' ? getNowHotPopups : getNewPopups;
  requests[key] = fetchPopups(country, controller.signal)
    .then((data) => publish(key, { data, fetchedAt: Date.now() }))
    .catch(() => {
      // A failed refresh must leave stale cards visible.
      const cached = cache[key];
      publish(key, { ...(cached ?? { error: true }), retryAt: Date.now() + TTL_MS });
    })
    .finally(() => { delete requests[key]; });
}

export function useHomePopups(section: Section, country: Country): {
  status: 'loading' | 'ready' | 'error';
  popups: PublicPopup[];
} {
  const key: CacheKey = `${section}:${country}`;
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

  useEffect(() => { revalidate(section, country); }, [section, country]);
  useEffect(() => {
    if (!entry) return;
    const next = entry.retryAt ?? ('data' in entry ? entry.fetchedAt + TTL_MS : Date.now());
    const timer = setTimeout(() => revalidate(section, country), Math.max(1, next - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [entry, section, country]);

  if (entry && 'data' in entry) return { status: 'ready', popups: entry.data };
  if (entry && 'error' in entry) return { status: 'error', popups: [] };
  return { status: 'loading', popups: [] };
}
