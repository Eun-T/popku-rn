import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getPopupMap, type PopupMapMarker } from '../lib/popups';
import type { Locale } from '../locales';
import { filterOngoingMapPopups, mapPopupDays, nextMapDayDelay } from '../lib/mapPopupDates';

type MapState = { languageCode: Locale; popups: PopupMapMarker[]; status: 'loading' | 'ready' | 'error' };

export function useMapPopups(languageCode: Locale) {
  const [state, setState] = useState<MapState>({ languageCode, popups: [], status: 'loading' });
  const [days, setDays] = useState(() => mapPopupDays());
  const failed = useRef(false);
  const active = useRef(true);
  const request = useRef<{ languageCode: Locale; controller: AbortController; promise: Promise<PopupMapMarker[]> } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const updateDay = () => {
      const now = Date.now(), next = mapPopupDays(now);
      setDays(current => current.KR === next.KR && current.JP === next.JP ? current : next);
      clearTimeout(timer);
      timer = setTimeout(updateDay, nextMapDayDelay(now));
    };
    updateDay();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') updateDay();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

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
      return filterOngoingMapPopups(items);
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
  const popups = useMemo(() => current ? filterOngoingMapPopups(state.popups, days) : [], [current, state.popups, days]);
  return { popups, status: current ? state.status : 'loading', refresh };
}
