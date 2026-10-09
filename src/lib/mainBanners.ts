import { API_BASE_URL } from '../constants/api';
import { getApiLocale, type Locale } from '../locales';
import type { PublicPopupDetail } from './popups';

export type MainBannerPopup = Pick<PublicPopupDetail,
  'publicId' | 'name' | 'countryCode' | 'regionId' | 'regionName' |
  'startDate' | 'endDate' | 'coverImageUrl' | 'coverImageCacheKey'> & {
  placeId: number;
  backgroundColors?: string[] | null;
  coverImageFetchedAt?: number;
};

export async function getMainBanners(signal: AbortSignal, languageCode: Locale = getApiLocale()): Promise<MainBannerPopup[]> {
  const fetchedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}/api/main-banners?languageCode=${encodeURIComponent(languageCode)}`, { signal });
  if (!response.ok) throw new Error('Main banner request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid main banner response');
  }
  if (body.popups.some(popup => !popup || typeof popup !== 'object'
    || !Number.isSafeInteger(popup.placeId) || popup.placeId <= 0
    || typeof popup.publicId !== 'string' || !popup.publicId
    || typeof popup.name !== 'string'
    || (popup.coverImageUrl !== null && typeof popup.coverImageUrl !== 'string')
    || (popup.coverImageCacheKey != null && typeof popup.coverImageCacheKey !== 'string'))) {
    throw new Error('Invalid main banner popup');
  }
  return (body.popups as MainBannerPopup[]).map(popup => ({ ...popup, coverImageFetchedAt: fetchedAt }));
}
