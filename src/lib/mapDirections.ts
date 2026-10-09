export type MapService = 'google' | 'naver' | 'apple';
export type MapDestination = {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  name?: string | null;
  countryCode?: string | null;
};
type MapLinks = { appUrl: string | null; webUrl: string; destination: string; naverWeb: boolean };

// Official contracts: Google Maps URLs / iOS URL Scheme, Apple unified Maps URLs,
// NAVER Cloud Maps URL Scheme. NAVER documents no destination-aware web contract.
export function buildMapLinks(service: MapService, place: MapDestination,
  platform: string, appIdentifier?: string): MapLinks | null {
  const { latitude: lat, longitude: lng } = place;
  const valid = typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const destination = valid ? `${lat},${lng}` : place.address?.trim();
  if (!destination) return null;
  const encoded = encodeURIComponent(destination);
  if (service === 'google') return {
    appUrl: platform === 'ios' ? `comgooglemaps://?daddr=${encoded}` : null,
    webUrl: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    destination, naverWeb: false,
  };
  if (service === 'apple') return {
    // This universal Map Link opens Apple Maps on iOS and the website elsewhere.
    appUrl: null, webUrl: `https://maps.apple.com/directions?destination=${encoded}`,
    destination, naverWeb: false,
  };
  let appUrl: string | null = null;
  if (platform !== 'web' && appIdentifier && place.countryCode === 'KR') {
    const appname = encodeURIComponent(appIdentifier);
    if (valid && lat >= 31.43 && lat <= 44.35 && lng >= 122.37 && lng <= 132) {
      appUrl = `nmap://route/public?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(place.name?.trim() || destination)}&appname=${appname}`;
    } else if (!valid && place.address?.trim()) {
      appUrl = `nmap://search?query=${encodeURIComponent(place.address.trim())}&appname=${appname}`;
    }
  }
  // Do not invent web routing parameters or send Japan coordinates outside coverage.
  return { appUrl, webUrl: 'https://map.naver.com/',
    destination: place.address?.trim() || destination, naverWeb: true };
}

type Linker = { canOpenURL: (url: string) => Promise<boolean>; openURL: (url: string) => Promise<unknown> };
export async function openMapLinks(links: MapLinks, linker: Linker,
  platform: string): Promise<'app' | 'web' | 'failed'> {
  if (platform !== 'web' && links.appUrl) {
    try {
      // NAVER: query restrictions can hide an installed app (e.g. Expo Go or an
      // older native build). Attempt launch directly; only launch failure falls back.
      if (links.appUrl.startsWith('nmap://') || await linker.canOpenURL(links.appUrl)) {
        await linker.openURL(links.appUrl);
        return 'app';
      }
    } catch { /* Launch failed, or another map's availability query failed: try the web. */ }
  }
  try { await linker.openURL(links.webUrl); return 'web'; }
  catch { return 'failed'; }
}
