import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { clearTokens, getAuthUser, getSavedAccessToken, subscribeAuthUser } from '../lib/auth';
import { FavoriteUnauthorizedError, favoritePopup, getFavoritePopups, unfavoritePopup } from '../lib/favorites';
import { getFavoriteIds, subscribeFavoriteCache } from '../lib/favoriteCache';
import type { PublicPopup } from '../lib/popups';

let loadingFavorites: Promise<void> | null = null;
const pendingIds = new Set<string>();

function loadFavorites(): Promise<void> {
  if (getFavoriteIds()) return Promise.resolve();
  if (!loadingFavorites) {
    loadingFavorites = getFavoritePopups().then(() => {}).finally(() => { loadingFavorites = null; });
  }
  return loadingFavorites;
}

export function usePopupFavorites() {
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const favoriteIds = useSyncExternalStore(subscribeFavoriteCache, getFavoriteIds, getFavoriteIds);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  useFocusEffect(useCallback(() => {
    let active = true;
    void getSavedAccessToken().then(async (token) => {
      if (!active) return;
      setHasToken(Boolean(token));
      if (token && !getFavoriteIds()) {
        try {
          await loadFavorites();
          // A favorite mutation can invalidate an in-flight list response.
          if (active && !getFavoriteIds()) await loadFavorites();
        } catch (error) {
          if (active && error instanceof FavoriteUnauthorizedError) {
            const invalidated = await clearTokens(error.authGeneration).catch(() => true);
            if (invalidated === false) return;
            if (active) setHasToken(false);
          }
        }
      }
    }).catch(() => { if (active) setHasToken(false); });
    return () => { active = false; };
  }, [user]));

  const toggleFavorite = async (popup: PublicPopup) => {
    if (pendingIds.has(popup.publicId) || hasToken === null) return;
    if (!hasToken) {
      router.push('/profile/login');
      return;
    }
    const ids = getFavoriteIds();
    if (!ids) return;
    pendingIds.add(popup.publicId);
    setBusyIds((current) => new Set(current).add(popup.publicId));
    try {
      if (ids.has(popup.publicId)) await unfavoritePopup(popup.publicId);
      else await favoritePopup(popup.publicId, popup);
    } catch (error) {
      if (error instanceof FavoriteUnauthorizedError) {
        const invalidated = await clearTokens(error.authGeneration).catch(() => true);
        if (invalidated === false) return;
        setHasToken(false);
        router.push('/profile/login');
      } else {
        Alert.alert('찜을 변경하지 못했어요', '잠시 후 다시 시도해 주세요.');
      }
    } finally {
      pendingIds.delete(popup.publicId);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(popup.publicId);
        return next;
      });
    }
  };

  return {
    isFavorite: (publicId: string) => Boolean(hasToken && favoriteIds?.has(publicId)),
    isFavoriteDisabled: (publicId: string) => hasToken === null || Boolean(hasToken && !favoriteIds) || busyIds.has(publicId),
    toggleFavorite,
  };
}
