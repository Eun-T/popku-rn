import type { VisitPeriod } from '../constants/placeFilters';
import { API_BASE_URL } from '../constants/api';
import { getApiLocale, type Locale } from '../locales';

export type PopupHighlightType = 'SPECIAL' | 'GOODS' | 'PRODUCTS' | 'VIEW' | 'EXPERIENCE' | 'FOOD' | 'SPACE' | 'HIGHLIGHT';
export type PopupHighlight = { type: PopupHighlightType; text: string };

export type PublicPopup = {
  publicId: string;
  name: string;
  countryCode: string;
  regionId: number | null;
  regionName: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: string;
  endDate: string;
  coverImageUrl: string | null;
  coverImageCacheKey?: string | null;
  /** Client-only timestamp: start of the request that delivered this cover URL. */
  coverImageFetchedAt?: number;
  tags: { id: number; name: string }[];
};

export type PopupMapMarker = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  primaryTag: string | null;
  coverImageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: { id: number; name: string }[];
};

export type PopupSearchResult = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  regionName: string | null;
};

export type PublicPopupDetail = {
  publicId: string;
  favoriteCount: number;
  isFavorited: boolean;
  averageRating?: number | null;
  reviewCount?: number | null;
  name: string;
  countryCode: 'KR' | 'JP';
  regionId: number | null;
  regionName: string | null;
  address: string;
  locationDetail: string | null;
  latitude: number;
  longitude: number;
  startDate: string | null;
  endDate: string | null;
  operatingHours: string | null;
  reservationStartAt: string | null;
  reservationEndAt: string | null;
  reservationUrl: string | null;
  notice: string | null;
  benefits: string | null;
  summary: string | null;
  highlights: PopupHighlight[] | null;
  tags: { id: number; name: string }[];
  coverImageUrl: string | null;
  contentImageUrls: string[];
  coverImageCacheKey?: string | null;
  socialLinks: unknown | null;
};

export type PopupStatus = 'ONGOING' | 'UPCOMING' | 'ENDED';
export type PopupListFilters = {
  visitPeriod?: VisitPeriod;
  openingFrom?: string;
  openingTo?: string;
  regionIds?: readonly number[];
  tagIds?: readonly number[];
  status?: PopupStatus;
};
export type AppliedPopupFilters = {
  openingFrom?: string;
  openingTo?: string;
  regionIds: number[];
  tagIds: number[];
  status: PopupStatus | undefined;
};
export type PopupRegionOption = { id: number; name: string; countryCode: 'KR' | 'JP' };
export type PopupTagOption = { id: number; name: string };

export function emptyPopupFilters(): AppliedPopupFilters {
  return { regionIds: [], tagIds: [], status: undefined };
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentWeekRange(today = new Date()): { openingFrom: string; openingTo: string } {
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { openingFrom: localDateString(monday), openingTo: localDateString(sunday) };
}

async function requestPopupList(query: string, signal: AbortSignal): Promise<PublicPopup[]> {
  const response = await fetch(`${API_BASE_URL}/api/popups${query}`, { signal });
  if (!response.ok) throw new Error('Popup list request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid popup list response');
  }
  return body.popups as PublicPopup[];
}

export async function getPopupMap(signal: AbortSignal): Promise<PopupMapMarker[]> {
  const response = await fetch(`${API_BASE_URL}/api/popups/map`, { signal });
  if (!response.ok) throw new Error('Popup map request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid popup map response');
  }
  return body.popups as PopupMapMarker[];
}

export async function searchPopups(query: string, signal: AbortSignal): Promise<PopupSearchResult[]> {
  const response = await fetch(`${API_BASE_URL}/api/popups/search?q=${encodeURIComponent(query)}&limit=10`, { signal });
  if (!response.ok) throw new Error('Popup search request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid popup search response');
  }
  return body.popups as PopupSearchResult[];
}

export function getPopups(
  countryCode: 'KR' | 'JP' | undefined,
  signal: AbortSignal,
  filters: PopupListFilters = {},
): Promise<PublicPopup[]> {
  const parameters: string[] = [];
  if (countryCode) parameters.push(`countryCode=${countryCode}`);
  if (filters.regionIds?.length) parameters.push(`regionIds=${filters.regionIds.join(',')}`);
  if (filters.tagIds?.length) parameters.push(`tagIds=${filters.tagIds.join(',')}`);
  if (filters.status) parameters.push(`status=${filters.status}`);
  if (filters.visitPeriod && filters.visitPeriod !== 'all') parameters.push(`visitPeriod=${filters.visitPeriod}`);
  return requestPopupList(parameters.length ? `?${parameters.join('&')}` : '', signal);
}

export type PopupPage = { popups: PublicPopup[]; nextCursor: string | null };

export async function getPopupPage(countryCode: 'KR' | 'JP' | undefined, signal: AbortSignal,
  filters: PopupListFilters = {}, cursor: string | null = null): Promise<PopupPage> {
  const parameters = ['limit=10'];
  if (countryCode) parameters.push(`countryCode=${countryCode}`);
  if (filters.regionIds?.length) parameters.push(`regionIds=${filters.regionIds.join(',')}`);
  if (filters.tagIds?.length) parameters.push(`tagIds=${filters.tagIds.join(',')}`);
  if (filters.status) parameters.push(`status=${filters.status}`);
  if (filters.visitPeriod && filters.visitPeriod !== 'all') parameters.push(`visitPeriod=${filters.visitPeriod}`);
  if (filters.openingFrom) parameters.push(`openingFrom=${filters.openingFrom}`);
  if (filters.openingTo) parameters.push(`openingTo=${filters.openingTo}`);
  if (cursor) parameters.push(`cursor=${encodeURIComponent(cursor)}`);
  const response = await fetch(`${API_BASE_URL}/api/popups?${parameters.join('&')}`, { signal });
  if (!response.ok) throw new Error('Popup page request failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)
    || !('nextCursor' in body) || (body.nextCursor !== null && typeof body.nextCursor !== 'string')) {
    throw new Error('Invalid popup page response');
  }
  return body as PopupPage;
}

export function getWeeklyPopups(countryCode: 'KR' | 'JP' | undefined, weekStart: string,
  weekEnd: string, signal: AbortSignal): Promise<PublicPopup[]> {
  const country = countryCode ? `&countryCode=${countryCode}` : '';
  return requestPopupList(`?weekStart=${weekStart}&weekEnd=${weekEnd}${country}`, signal);
}

export function getEndingSoonPopups(countryCode: 'KR' | 'JP' | undefined, signal: AbortSignal): Promise<PublicPopup[]> {
  const country = countryCode ? `&countryCode=${countryCode}` : '';
  return requestPopupList(`?endingSoon=true${country}`, signal);
}

export async function getPopupDetail(publicId: string, signal: AbortSignal, accessToken?: string, languageCode: Locale = getApiLocale()): Promise<PublicPopupDetail> {
  const response = await fetch(`${API_BASE_URL}/api/popups/${encodeURIComponent(publicId)}?languageCode=${encodeURIComponent(languageCode)}`, {
    signal,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (response.status === 401) throw new PopupDetailUnauthorizedError();
  if (!response.ok) throw new Error('Popup detail request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('publicId' in body) || body.publicId !== publicId) {
    throw new Error('Invalid popup detail response');
  }
  return body as PublicPopupDetail;
}

export class PopupDetailUnauthorizedError extends Error {
  constructor() { super('Popup detail token expired'); }
}

export async function getNewPopups(countryCode: 'KR' | 'JP', signal: AbortSignal): Promise<PublicPopup[]> {
  const { openingFrom, openingTo } = currentWeekRange();
  return requestPopupList(`?countryCode=${countryCode}&openingFrom=${openingFrom}&openingTo=${openingTo}&homeNew=true&limit=8`, signal);
}

export async function getNowHotPopups(countryCode: 'KR' | 'JP', signal: AbortSignal): Promise<PublicPopup[]> {
  const response = await fetch(`${API_BASE_URL}/api/home-curations/NOW_HOT?countryCode=${countryCode}`, { signal });
  if (!response.ok) throw new Error('NOW_HOT request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid NOW_HOT response');
  }
  return body.popups as PublicPopup[];
}
