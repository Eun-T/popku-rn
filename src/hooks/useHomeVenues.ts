import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getPopupVenues, type PopupVenue } from '../lib/popupVenues';
import { COVER_URL_FRESH_MS } from '../lib/placeCoverRecovery';
import type { Locale } from '../locales';
import { useTranslation } from './useTranslation';

type Entry = { venues: PopupVenue[]; retryAt: number };
const cache: Partial<Record<Locale, Entry>> = {};
const requests: Partial<Record<Locale, Promise<void>>> = {};
const listeners = new Set<() => void>();
const emptyVenues: PopupVenue[] = [];
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function revalidate(languageCode: Locale) {
  if (requests[languageCode] || Date.now() < (cache[languageCode]?.retryAt ?? 0)) return;
  const controller = new AbortController();
  requests[languageCode] = getPopupVenues(controller.signal, languageCode)
    .then(venues => { cache[languageCode] = { venues, retryAt: Date.now() + COVER_URL_FRESH_MS }; })
    .catch(() => {
      cache[languageCode] = { venues: cache[languageCode]?.venues ?? emptyVenues, retryAt: Date.now() + COVER_URL_FRESH_MS };
    })
    .finally(() => {
      delete requests[languageCode];
      listeners.forEach(listener => listener());
    });
}

export function useHomeVenues(isActive = true): PopupVenue[] {
  const { resolvedLanguage } = useTranslation();
  const snapshot = useCallback(() => cache[resolvedLanguage], [resolvedLanguage]);
  const entry = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (isActive) revalidate(resolvedLanguage); }, [isActive, resolvedLanguage]);
  return entry?.venues ?? emptyVenues;
}
