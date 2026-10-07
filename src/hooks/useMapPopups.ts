import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getPopupMap, type PopupMapMarker } from '../lib/popups';

export function useMapPopups() {
  const [popups, setPopups] = useState<PopupMapMarker[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const failed = useRef(false);
  const active = useRef(true);
  const request = useRef<{ controller: AbortController; promise: Promise<PopupMapMarker[]> } | null>(null);

  const refresh = useCallback((): Promise<PopupMapMarker[]> => {
    if (request.current) return request.current.promise;
    const controller = new AbortController();
    setStatus('loading');
    const promise = getPopupMap(controller.signal).then((items) => {
      if (!active.current || controller.signal.aborted) throw new Error('Map read aborted');
      if (active.current && !controller.signal.aborted) {
        failed.current = false;
        setPopups(items);
        setStatus('ready');
      }
      return items;
    }).catch((error: unknown) => {
      if (active.current && !controller.signal.aborted) {
        failed.current = true;
        setStatus('error');
      }
      throw error;
    }).finally(() => {
      if (request.current?.controller === controller) request.current = null;
    });
    request.current = { controller, promise };
    return promise;
  }, []);

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

  return { popups, status, refresh };
}
