import type { PublicPopup } from './popups';

let popups: PublicPopup[] | null = null;
let favoriteIds: ReadonlySet<string> | null = null;
let generation = 0;
let sessionGeneration = 0;
const listeners = new Set<() => void>();

export function getFavoriteCache(): PublicPopup[] | null {
  return popups;
}

export function getFavoriteIds(): ReadonlySet<string> | null {
  return favoriteIds;
}

export function subscribeFavoriteCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function favoriteCacheGeneration(): number {
  return generation;
}

export function favoriteSessionGeneration(): number {
  return sessionGeneration;
}

export function saveFavoriteCache(items: PublicPopup[], expectedGeneration: number): void {
  if (generation !== expectedGeneration) return;
  popups = items;
  favoriteIds = new Set(items.map((popup) => popup.publicId));
  listeners.forEach((listener) => listener());
}

export function updateFavoriteCache(publicId: string, isFavorited: boolean, popup?: PublicPopup): void {
  generation += 1;
  if (favoriteIds) {
    const next = new Set(favoriteIds);
    if (isFavorited) next.add(publicId);
    else next.delete(publicId);
    favoriteIds = next;
  }
  if (popups) {
    if (!isFavorited) popups = popups.filter((item) => item.publicId !== publicId);
    else if (popup && !popups.some((item) => item.publicId === publicId)) popups = [...popups, popup];
  }
  // Detail mutations have no list-shaped popup; the favorites page refreshes on focus.
  listeners.forEach((listener) => listener());
}

export function clearFavoriteCache(): void {
  generation += 1;
  sessionGeneration += 1;
  popups = null;
  favoriteIds = null;
  listeners.forEach((listener) => listener());
}
