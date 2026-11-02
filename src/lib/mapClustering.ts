import type { PopupMapMarker } from './popups';
import { hasValidCoordinates } from './mapMarkerBounds';

export type MapClusterRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type OverlapMarker =
  | { type: 'popup'; popup: PopupMapMarker }
  | { type: 'cluster'; id: string; count: number; latitude: number; longitude: number; popupIds: string[] };

export const MAP_MAX_CLUSTER_ZOOM = 21;
const EXTENT = 512;
const CLUSTER_SIZE = 44;
const JOIN_GAP = 4;
const KEEP_GAP = 12;

export function mapZoom(region: MapClusterRegion, width: number): number {
  return Math.log2(360 * width / (EXTENT * region.longitudeDelta));
}

export function clusterExpansion(popups: readonly PopupMapMarker[], region: MapClusterRegion, width: number): MapClusterRegion | null {
  if (popups.length < 2 || !popups.every(hasValidCoordinates)) return null;
  const first = popups[0];
  if (popups.every(p => p.latitude === first.latitude && p.longitude === first.longitude)) return null;
  const zoom = mapZoom(region, width);
  if (!(width > 0 && region.latitudeDelta > 0) || !Number.isFinite(zoom) || zoom >= MAP_MAX_CLUSTER_ZOOM - 0.05) return null;
  const longitudeDelta = 360 * width / (EXTENT * 2 ** Math.min(MAP_MAX_CLUSTER_ZOOM, zoom + 2));
  return { ...region, longitudeDelta, latitudeDelta: region.latitudeDelta * longitudeDelta / region.longitudeDelta };
}

function mercator(latitude: number): number {
  const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180);
  return Math.log((1 + sin) / (1 - sin)) / 2;
}

type Group = {
  key: number; x: number; y: number; popups: PopupMapMarker[];
  previous: Set<string>; cells: string[];
};

// Called only for completed viewport changes. A spatial hash stores rendered
// groups (not every member), so a dense/co-located group has one collision target.
export function overlappingMapMarkers(
  input: readonly PopupMapMarker[], region: MapClusterRegion,
  width: number, height: number, showLabels: boolean, fontScale = 1,
  previous: ReadonlyMap<string, string> = new Map(),
): OverlapMarker[] {
  if (![width, height, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta, fontScale].every(Number.isFinite)
    || !(width > 0 && height > 0 && region.longitudeDelta > 0 && region.latitudeDelta > 0)) return [];
  const unique = new Map(input.filter(hasValidCoordinates).map(p => [p.id, p]));
  const coordinates = new Map<string, PopupMapMarker[]>();
  for (const popup of [...unique.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    // Number serialization is exact; never round different coordinates together.
    const key = JSON.stringify([popup.latitude, popup.longitude]);
    const group = coordinates.get(key);
    if (group) group.push(popup); else coordinates.set(key, [popup]);
  }
  const centerY = mercator(region.latitude);
  const scaleX = width / region.longitudeDelta;
  const scaleY = height / Math.max(1e-12, mercator(region.latitude + region.latitudeDelta / 2) - mercator(region.latitude - region.latitudeDelta / 2));
  // Existing label maxWidth=80, graphic slot=52, anchor y=40; cover the selected
  // pin and at least a 44dp touch target. Symmetric height also covers its anchor.
  const popupWidth = showLabels ? 80 : 44;
  const popupHeight = Math.max(80, showLabels ? (52 + 3 + Math.ceil(16 * fontScale) - 40) * 2 : 80);
  const cellSize = Math.max(popupWidth, popupHeight) + KEEP_GAP;
  const grid = new Map<string, Set<Group>>();
  const groups = new Set<Group>();
  const size = (g: Group) => g.popups.length > 1 ? [CLUSTER_SIZE, CLUSTER_SIZE] : [popupWidth, popupHeight];
  const cellsFor = (g: Group) => {
    const [w, h] = size(g), cells: string[] = [];
    for (let x = Math.floor((g.x - w / 2 - KEEP_GAP) / cellSize); x <= Math.floor((g.x + w / 2 + KEEP_GAP) / cellSize); x++) {
      for (let y = Math.floor((g.y - h / 2 - KEEP_GAP) / cellSize); y <= Math.floor((g.y + h / 2 + KEEP_GAP) / cellSize); y++) cells.push(`${x}:${y}`);
    }
    return cells;
  };
  const detach = (g: Group) => {
    for (const cell of g.cells) {
      const bucket = grid.get(cell); bucket?.delete(g);
      if (bucket?.size === 0) grid.delete(cell);
    }
    groups.delete(g);
  };
  const intersects = (a: Group, b: Group) => {
    const [aw, ah] = size(a), [bw, bh] = size(b);
    const [smaller, larger] = a.previous.size < b.previous.size ? [a.previous, b.previous] : [b.previous, a.previous];
    const keep = [...smaller].some(id => larger.has(id));
    const gap = keep ? KEEP_GAP : JOIN_GAP;
    return Math.abs(a.x - b.x) < (aw + bw) / 2 + gap && Math.abs(a.y - b.y) < (ah + bh) / 2 + gap;
  };
  let key = 0;
  for (const popups of coordinates.values()) {
    const first = popups[0];
    const longitudeOffset = ((first.longitude - region.longitude + 540) % 360) - 180;
    const group: Group = { key: key++, x: longitudeOffset * scaleX, y: (centerY - mercator(first.latitude)) * scaleY,
      popups: [...popups], previous: new Set(popups.flatMap(p => previous.has(p.id) ? [previous.get(p.id)!] : [])), cells: [] };
    // Recheck after the center moves: a newly merged cluster must not overlap a
    // neighboring label/cluster which did not overlap either original center.
    for (;;) {
      const neighbors = new Set<Group>();
      for (const cell of cellsFor(group)) for (const candidate of grid.get(cell) ?? []) neighbors.add(candidate);
      const matches = [...neighbors].filter(candidate => intersects(group, candidate)).sort((a, b) => a.key - b.key);
      if (matches.length === 0) break;
      for (const other of matches) {
        detach(other);
        const count = group.popups.length + other.popups.length;
        group.x = (group.x * group.popups.length + other.x * other.popups.length) / count;
        group.y = (group.y * group.popups.length + other.y * other.popups.length) / count;
        group.key = Math.min(group.key, other.key);
        // Append to the larger member list to avoid quadratic copying in dense groups.
        if (group.popups.length < other.popups.length) {
          other.popups.push(...group.popups); group.popups = other.popups;
        } else group.popups.push(...other.popups);
        for (const id of other.previous) group.previous.add(id);
      }
    }
    group.cells = cellsFor(group);
    for (const cell of group.cells) {
      let bucket = grid.get(cell);
      if (!bucket) { bucket = new Set(); grid.set(cell, bucket); }
      bucket.add(group);
    }
    groups.add(group);
  }
  return [...groups].sort((a, b) => a.key - b.key).map(group => {
    if (group.popups.length === 1) return { type: 'popup', popup: group.popups[0] };
    const popupIds = group.popups.map(p => p.id).sort();
    return { type: 'cluster', id: JSON.stringify(popupIds), count: popupIds.length, popupIds,
      latitude: Math.atan(Math.sinh(centerY - group.y / scaleY)) * 180 / Math.PI,
      longitude: ((region.longitude + group.x / scaleX + 540) % 360) - 180 };
  });
}
