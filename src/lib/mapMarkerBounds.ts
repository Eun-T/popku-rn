import type { PopupMapMarker } from './popups';

export type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

// Per-side viewport padding: ~78px on a 390px map, covering the existing
// 80px-wide title and a small pan buffer. Initial policy, not a measured optimum.
export const MARKER_OVERSCAN_RATIO = 0.20;

export function hasValidCoordinates(popup: PopupMapMarker): boolean {
  return typeof popup.latitude === 'number' && Number.isFinite(popup.latitude)
    && popup.latitude >= -90 && popup.latitude <= 90
    && typeof popup.longitude === 'number' && Number.isFinite(popup.longitude)
    && popup.longitude >= -180 && popup.longitude <= 180;
}

function longitudeSpan(bounds: MapBounds): number {
  const span = bounds.maxLng - bounds.minLng;
  return span < 0 ? span + 360 : span;
}

function validBounds(bounds: MapBounds): boolean {
  return Number.isFinite(bounds.minLat) && Number.isFinite(bounds.maxLat)
    && Number.isFinite(bounds.minLng) && Number.isFinite(bounds.maxLng)
    && bounds.minLat <= bounds.maxLat
    && longitudeSpan(bounds) >= 0;
}

export function markerBoundsWithOverscan(bounds: MapBounds): MapBounds {
  const latPadding = (bounds.maxLat - bounds.minLat) * MARKER_OVERSCAN_RATIO;
  const lngSpan = longitudeSpan(bounds);
  const lngPadding = lngSpan * MARKER_OVERSCAN_RATIO;
  // Keep longitude unwrapped; membership handles both native crossing bounds
  // (west > east) and region-derived bounds extending beyond +/-180 degrees.
  return {
    minLat: Math.max(-90, bounds.minLat - latPadding),
    maxLat: Math.min(90, bounds.maxLat + latPadding),
    minLng: bounds.minLng - lngPadding,
    maxLng: bounds.minLng + lngSpan + lngPadding,
  };
}

export function isWithinMapBounds(popup: PopupMapMarker, bounds: MapBounds): boolean {
  if (!hasValidCoordinates(popup) || !validBounds(bounds)) return false;
  return containsCoordinate(popup, bounds);
}

function containsCoordinate(popup: PopupMapMarker, bounds: MapBounds): boolean {
  if (popup.latitude < bounds.minLat || popup.latitude > bounds.maxLat) return false;
  const span = longitudeSpan(bounds);
  const offset = ((popup.longitude - bounds.minLng) % 360 + 360) % 360;
  // Numerical tolerance only, to keep inclusive edges after modular arithmetic.
  return span >= 360 || offset <= span + 1e-10 || 360 - offset <= 1e-10;
}

// Input is already tag-filtered. Pin IDs only by finding their current valid
// records here; stale selection/search objects can never revive removed data.
export function expandedMarkerPopups(
  popups: PopupMapMarker[],
  bounds: MapBounds | null,
  selectedId?: string,
  pendingId?: string,
): PopupMapMarker[] {
  const padded = bounds && validBounds(bounds) ? markerBoundsWithOverscan(bounds) : null;
  // Before bounds are available, conservatively preserve valid markers. The
  // native screen normally supplies initialRegion bounds immediately.
  return popups.filter((popup) => hasValidCoordinates(popup)
    && (!padded || popup.id === selectedId || popup.id === pendingId
      || containsCoordinate(popup, padded)));
}
