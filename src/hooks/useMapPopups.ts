import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getPopupMap, type PopupMapMarker } from '../lib/popups';
import type { Locale } from '../locales';

type MapState = { languageCode: Locale; popups: PopupMapMarker[]; status: 'loading' | 'ready' | 'error' };

export function useMapPopups(languageCode: Locale) {
  const [state, setState] = useState<MapState>({ languageCode, popups: [], status: 'loading' });
  const failed = useRef(false);
  const active = useRef(true);
  const request = useRef<{ languageCode: Locale; controller: AbortController; promise: Promise<PopupMapMarker[]> } | null>(null);

  const refresh = useCallback((): Promise<PopupMapMarker[]> => {
    if (request.current && request.current.languageCode === languageCode) return request.current.promise;
    request.current?.controller.abort();
    const controller = new AbortController();
    setState(current => ({ ...current, status: 'loading' }));
    const promise = getPopupMap(controller.signal, languageCode).then((items) => {
      if (!active.current || controller.signal.aborted || request.current?.controller !== controller) {
        throw new Error('Map read aborted');
      }
      failed.current = false;
      setState({ languageCode, popups: items, status: 'ready' });
      return items;
    }).catch((error: unknown) => {
      if (active.current && !controller.signal.aborted) {
        failed.current = true;
        setState(current => ({ languageCode, popups: current.languageCode === languageCode ? current.popups : [], status: 'error' }));
      }
      throw error;
    }).finally(() => {
      if (request.current?.controller === controller) request.current = null;
    });
    request.current = { languageCode, controller, promise };
    return promise;
  }, [languageCode]);

  useEffect(() => {
    active.current = true;
    void refresh().catch(() => {});
    return () => {
      active.current = false;
      request.current?.controller.abort();
      request.current = null;
    };
  }, [refresh]);
  useFocusEffect(useCallback(() => {
    if (failed.current) void refresh().catch(() => {});
  }, [refresh]));

  // Hide the previous language synchronously, before the replacement effect runs.
  const current = state.languageCode === languageCode;
  return { popups: current ? state.popups : [], status: current ? state.status : 'loading', refresh };
}
