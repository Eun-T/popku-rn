import { API_BASE_URL } from '../constants/api';
import type { Locale } from '../locales';
import type { PublicPopup } from './popups';

export type PopupVenue = {
  venueId: string;
  popupCount: number;
  name: string;
  address?: string | null;
  countryCode: string;
  regionLabel: string | null;
  imageUrl: string | null;
  imageCacheKey: string | null;
};

export async function getPopupVenues(signal: AbortSignal, languageCode: Locale): Promise<PopupVenue[]> {
  const response = await fetch(`${API_BASE_URL}/api/popups/venues?languageCode=${languageCode}`, { signal });
  if (!response.ok) throw new Error('Popup venues request failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('venues' in body) || !Array.isArray(body.venues)) {
    throw new Error('Invalid popup venues response');
  }
  return (body.venues as PopupVenue[]).filter(venue => venue.popupCount >= 1);
}

export async function getVenuePopups(venueId: string, signal: AbortSignal, languageCode: Locale): Promise<PublicPopup[]> {
  const response = await fetch(`${API_BASE_URL}/api/popups/venues?venueId=${encodeURIComponent(venueId)}&languageCode=${languageCode}`, { signal });
  if (!response.ok) throw new Error('Venue popups request failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('venueId' in body) || body.venueId !== venueId
    || !('popups' in body) || !Array.isArray(body.popups)) {
    throw new Error('Invalid venue popups response');
  }
  // Eligibility and registration order belong to the server; this endpoint returns the entire list.
  return body.popups as PublicPopup[];
}
