import type { ResolvedPlace } from './placeSearch';

export type SearchRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

// Match the existing coordinate fallback so small Google viewports show nearby popups.
const MIN_PLACE_DELTA = 0.020;  

export function placeCameraRegion(place: ResolvedPlace): SearchRegion | null {
  const { latitude, longitude, viewport } = place;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (viewport && Object.values(viewport).every(Number.isFinite)
    && viewport.south >= -90 && viewport.north <= 90
    && viewport.west >= -180 && viewport.east <= 180
    && viewport.south < viewport.north && viewport.west < viewport.east) {
    return {
      latitude: (viewport.south + viewport.north) / 2,
      longitude: (viewport.west + viewport.east) / 2,
      latitudeDelta: Math.min(170, Math.max(MIN_PLACE_DELTA, (viewport.north - viewport.south) * 1.1)),
      longitudeDelta: Math.min(350, Math.max(MIN_PLACE_DELTA, (viewport.east - viewport.west) * 1.1)),
    };
  }
  return { latitude, longitude, latitudeDelta: MIN_PLACE_DELTA, longitudeDelta: MIN_PLACE_DELTA };
}

// Google fits the requested bounds to the map's aspect ratio, expanding one axis.
export function isPlaceCameraComplete(actual: SearchRegion, target: SearchRegion): boolean {
  const latRatio = actual.latitudeDelta / target.latitudeDelta;
  const lngRatio = actual.longitudeDelta / target.longitudeDelta;
  return Math.abs(actual.latitude - target.latitude) <= Math.max(0.0001, target.latitudeDelta * 0.05)
    && Math.abs(actual.longitude - target.longitude) <= Math.max(0.0001, target.longitudeDelta * 0.05)
    && latRatio >= 0.9 && lngRatio >= 0.9 && Math.min(latRatio, lngRatio) <= 1.15;
}
