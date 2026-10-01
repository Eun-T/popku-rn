import { API_BASE_URL } from '../constants/api';

export type PublicPopup = {
  publicId: string;
  name: string;
  countryCode: string;
  regionId: number | null;
  regionName: string | null;
  startDate: string;
  endDate: string;
  coverImageUrl: string | null;
  tags: { id: number; name: string }[];
};

export type PublicPopupDetail = {
  publicId: string;
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
  introduction: string | null;
  tags: { id: number; name: string }[];
  coverImageUrl: string | null;
  contentImageUrls: string[];
  socialLinks: unknown | null;
};

export type PopupStatus = 'ONGOING' | 'UPCOMING' | 'ENDED';
export type PopupListFilters = {
  regionIds?: readonly number[];
  tagIds?: readonly number[];
  status?: PopupStatus;
};
export type AppliedPopupFilters = {
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
  return requestPopupList(parameters.length ? `?${parameters.join('&')}` : '', signal);
}

export function getEndingSoonPopups(countryCode: 'KR' | 'JP' | undefined, signal: AbortSignal): Promise<PublicPopup[]> {
  const country = countryCode ? `&countryCode=${countryCode}` : '';
  return requestPopupList(`?endingSoon=true${country}`, signal);
}

export async function getPopupDetail(publicId: string, signal: AbortSignal): Promise<PublicPopupDetail> {
  const response = await fetch(`${API_BASE_URL}/api/popups/${encodeURIComponent(publicId)}`, { signal });
  if (!response.ok) throw new Error('Popup detail request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('publicId' in body) || body.publicId !== publicId) {
    throw new Error('Invalid popup detail response');
  }
  return body as PublicPopupDetail;
}

export async function getNewPopups(countryCode: 'KR' | 'JP', signal: AbortSignal): Promise<PublicPopup[]> {
  const { openingFrom, openingTo } = currentWeekRange();
  return requestPopupList(`?countryCode=${countryCode}&openingFrom=${openingFrom}&openingTo=${openingTo}`, signal);
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
