import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { clearTokens, getAuthSession } from '../lib/auth';
import { FavoriteUnauthorizedError, favoritePopup, getFavoritePopups, unfavoritePopup } from '../lib/favorites';
import { favoriteSessionGeneration, getFavoriteIds, subscribeFavoriteCache } from '../lib/favoriteCache';
import type { PublicPopup } from '../lib/popups';

let loadingFavorites: { generation: number; promise: Promise<void> } | null = null;
const pendingIds = new Map<number, Set<string>>();

function loadFavorites(generation: number): Promise<void> {
  if (getFavoriteIds()) return Promise.resolve();
  if (!loadingFavorites || loadingFavorites.generation !== generation) {
    const request: { generation: number; promise: Promise<void> } = {
      generation,
      promise: getFavoritePopups().then(() => {}).finally(() => {
        if (loadingFavorites === request) loadingFavorites = null;
      }),
    };
    loadingFavorites = request;
  }
  return loadingFavorites.promise;
}

type FavoriteStatus = 'idle' | 'loading' | 'ready' | 'error';
type FavoriteSessionState = { generation: number; hasToken: boolean | null; status: FavoriteStatus };

export function usePopupFavorites() {
  const router = useRouter();
  const generation = useSyncExternalStore(subscribeFavoriteCache, favoriteSessionGeneration, favoriteSessionGeneration);
  const favoriteIds = useSyncExternalStore(subscribeFavoriteCache, getFavoriteIds, getFavoriteIds);
  const [sessionState, setSessionState] = useState<FavoriteSessionState>({ generation, hasToken: null, status: 'loading' });
  const [busy, setBusy] = useState<{ generation: number; ids: ReadonlySet<string> }>(() => ({ generation, ids: new Set() }));
  const focused = useRef(false);
  const hydration = useRef<{ generation: number; promise?: Promise<void> } | null>(null);
  const hasToken = sessionState.generation === generation ? sessionState.hasToken : null;

  const retryFavorites = useCallback((): Promise<void> => {
    if (!focused.current || generation !== favoriteSessionGeneration()) return Promise.resolve();
    if (hydration.current?.generation === generation) return hydration.current.promise ?? Promise.resolve();
    const request: { generation: number; promise?: Promise<void> } = { generation };
    hydration.current = request;
    const isCurrent = () => focused.current && hydration.current === request && generation === favoriteSessionGeneration();
    setSessionState(current => ({ generation, hasToken: current.generation === generation ? current.hasToken : null, status: 'loading' }));
    request.promise = (async () => {
      try {
        const { accessToken } = await getAuthSession();
        if (!isCurrent()) return;
        setSessionState({ generation, hasToken: Boolean(accessToken), status: accessToken ? 'loading' : 'idle' });
        if (!accessToken) return;
        if (!getFavoriteIds()) {
          await loadFavorites(generation);
          // A detail mutation can invalidate a list response before the IDs are known.
          if (isCurrent() && !getFavoriteIds()) await loadFavorites(generation);
        }
        if (isCurrent()) setSessionState({ generation, hasToken: true, status: getFavoriteIds() ? 'ready' : 'error' });
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof FavoriteUnauthorizedError) {
          const invalidated = await clearTokens(error.authGeneration).catch(() => true);
          if (invalidated !== false && isCurrent()) setSessionState({ generation, hasToken: false, status: 'idle' });
        } else {
          setSessionState(current => ({ ...current, generation, status: 'error' }));
        }
      } finally {
        if (hydration.current === request) hydration.current = null;
      }
    })();
    return request.promise;
  }, [generation]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void retryFavorites();
    return () => { focused.current = false; hydration.current = null; };
  }, [retryFavorites]));

  const toggleFavorite = async (popup: PublicPopup) => {
    if (generation !== favoriteSessionGeneration() || hasToken === null) return;
    if (!hasToken) {
      router.push('/profile/login');
      return;
    }
    const ids = getFavoriteIds();
    if (!ids) return;
    let pending = pendingIds.get(generation);
    if (!pending) { pending = new Set(); pendingIds.set(generation, pending); }
    if (pending.has(popup.publicId)) return;
    pending.add(popup.publicId);
    setBusy(current => ({ generation, ids: new Set(current.generation === generation ? current.ids : []).add(popup.publicId) }));
    try {
      if (ids.has(popup.publicId)) await unfavoritePopup(popup.publicId);
      else await favoritePopup(popup.publicId, popup);
    } catch (error) {
      if (generation !== favoriteSessionGeneration()) return;
      if (error instanceof FavoriteUnauthorizedError) {
        const invalidated = await clearTokens(error.authGeneration).catch(() => true);
        if (invalidated === false) return;
        const loggedOutGeneration = favoriteSessionGeneration();
        const session = await getAuthSession().catch(() => null);
        if (session && !session.accessToken && focused.current && loggedOutGeneration === favoriteSessionGeneration()) router.push('/profile/login');
      } else {
        Alert.alert('찜을 변경하지 못했어요', '잠시 후 다시 시도해 주세요.');
      }
    } finally {
      pending.delete(popup.publicId);
      if (pending.size === 0) pendingIds.delete(generation);
      if (generation === favoriteSessionGeneration()) setBusy(current => {
        if (current.generation !== generation) return current;
        const next = new Set(current.ids); next.delete(popup.publicId);
        return { generation, ids: next };
      });
    }
  };

  const favoritesStatus: FavoriteStatus = favoriteIds && hasToken ? 'ready'
    : sessionState.generation !== generation ? 'loading' : sessionState.status;

  return {
    favoritesStatus,
    retryFavorites,
    isFavorite: (publicId: string) => Boolean(hasToken && favoriteIds?.has(publicId)),
    isFavoriteDisabled: (publicId: string) => hasToken === null || Boolean(hasToken && !favoriteIds)
      || Boolean(pendingIds.get(generation)?.has(publicId)) || (busy.generation === generation && busy.ids.has(publicId)),
    toggleFavorite,
  };
}
