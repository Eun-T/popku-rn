import { API_BASE_URL } from '../constants/api';
import { getAuthSession } from './auth';
import { favoriteCacheGeneration, favoriteSessionGeneration, saveFavoriteCache, updateFavoriteCache } from './favoriteCache';
import type { PublicPopup } from './popups';

export type PopupFavoriteResponse = {
  publicId: string;
  isFavorited: boolean;
  favoriteCount: number;
};

export class FavoriteUnauthorizedError extends Error {
  constructor(public readonly authGeneration?: number) { super('Favorite authentication required'); }
}

async function updateFavorite(publicId: string, method: 'POST' | 'DELETE', popup?: PublicPopup): Promise<PopupFavoriteResponse> {
  const sessionGeneration = favoriteSessionGeneration();
  const { accessToken: token, generation } = await getAuthSession();
  if (__DEV__) console.info('[FAVORITE] request', { method, publicId, tokenPresent: !!token });
  if (!token) throw new FavoriteUnauthorizedError(generation);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/popups/${encodeURIComponent(publicId)}/favorite`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (__DEV__) console.info('[FAVORITE] response', { method, publicId, status: response.status });
  if (response.status === 401) throw new FavoriteUnauthorizedError(generation);
  if (!response.ok) throw new Error('Favorite request failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('publicId' in body) || body.publicId !== publicId
    || !('isFavorited' in body) || typeof body.isFavorited !== 'boolean'
    || !('favoriteCount' in body) || typeof body.favoriteCount !== 'number') {
    throw new Error('Invalid favorite response');
  }
  const result = body as PopupFavoriteResponse;
  if (favoriteSessionGeneration() === sessionGeneration) {
    updateFavoriteCache(result.publicId, result.isFavorited, popup);
  }
  return result;
}

export function favoritePopup(publicId: string, popup?: PublicPopup): Promise<PopupFavoriteResponse> {
  return updateFavorite(publicId, 'POST', popup);
}

export function unfavoritePopup(publicId: string): Promise<PopupFavoriteResponse> {
  return updateFavorite(publicId, 'DELETE');
}

export async function getFavoritePopups(signal?: AbortSignal): Promise<PublicPopup[]> {
  const generation = favoriteCacheGeneration();
  const { accessToken: token, generation: authGeneration } = await getAuthSession();
  if (!token) throw new FavoriteUnauthorizedError(authGeneration);
  const response = await fetch(`${API_BASE_URL}/api/users/me/favorites`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (__DEV__) console.info('[FAVORITE] list response', { status: response.status });
  if (response.status === 401) throw new FavoriteUnauthorizedError(authGeneration);
  if (!response.ok) throw new Error('Favorite list request failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid favorite list response');
  }
  const popups = body.popups as PublicPopup[];
  saveFavoriteCache(popups, generation);
  return popups;
}
