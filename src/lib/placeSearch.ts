import { API_BASE_URL } from '../constants/api';

export type PlaceLanguageCode = 'ko' | 'ja';
export type PlaceViewport = { south: number; west: number; north: number; east: number };
export type PlaceSuggestion = {
  placeId: string;
  title: string;
  subtitle: string;
  types: string[];
};
export type PlaceAttribution = { provider: string; providerUri: string };
export type ResolvedPlace = {
  placeId: string;
  latitude: number;
  longitude: number;
  viewport: PlaceViewport | null;
  types: string[];
  attributions: PlaceAttribution[];
};
export type AutocompletePlacesInput = {
  query: string;
  languageCode: PlaceLanguageCode;
  sessionToken: string;
  bias?: PlaceViewport;
};
export type ResolvePlaceInput = { placeId: string; sessionToken: string };

async function postPlaceSearch<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/place-search/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error ?? `Place search failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function autocompletePlaces(input: AutocompletePlacesInput, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const response = await postPlaceSearch<{ suggestions: PlaceSuggestion[] }>('autocomplete', input, signal);
  return response.suggestions;
}

export function resolvePlace(input: ResolvePlaceInput, signal?: AbortSignal): Promise<ResolvedPlace> {
  return postPlaceSearch<ResolvedPlace>('resolve', input, signal);
}
