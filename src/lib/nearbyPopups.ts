import { API_BASE_URL } from '../constants/api';

export type NearbyPopup = {
  publicId: string;
  name: string;
  coverImageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  regionName: string | null;
  distanceMeters: number;
};

// Same public GET used by the web's Nuxt proxy. Selection and ordering belong
// to the server; do not recompute distances or apply a client radius.
const cache = new Map<string, NearbyPopup[]>();
const pending = new Map<string, Promise<NearbyPopup[]>>();

function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return value;
}

function parse(value: unknown, currentId: string): NearbyPopup[] {
  if (!value || typeof value !== 'object' || !('popups' in value) || !Array.isArray(value.popups)
    || value.popups.length > 7) throw new Error('Invalid nearby response');
  const seen = new Set([currentId]);
  const result: NearbyPopup[] = [];
  for (const item of value.popups as unknown[]) {
    if (!item || typeof item !== 'object') throw new Error('Invalid nearby popup');
    const row = item as Record<string, unknown>;
    if (typeof row.publicId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.publicId)
      || typeof row.name !== 'string' || !row.name.trim()
      || typeof row.distanceMeters !== 'number' || !Number.isFinite(row.distanceMeters) || row.distanceMeters < 0
      || (row.regionName !== null && typeof row.regionName !== 'string')
      || (row.coverImageUrl !== null && typeof row.coverImageUrl !== 'string')) throw new Error('Invalid nearby popup');
    if (row.coverImageUrl) {
      const image = new URL(row.coverImageUrl as string);
      if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password) throw new Error('Invalid image');
    }
    const startDate = date(row.startDate), endDate = date(row.endDate);
    if (startDate && endDate && startDate > endDate) throw new Error('Invalid date range');
    if (seen.has(row.publicId)) continue;
    seen.add(row.publicId);
    result.push({ publicId: row.publicId, name: row.name, distanceMeters: row.distanceMeters,
      coverImageUrl: row.coverImageUrl as string | null, regionName: row.regionName as string | null,
      startDate, endDate });
  }
  return result;
}

export function getNearbyPopups(publicId: string): Promise<NearbyPopup[]> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(publicId)) return Promise.resolve([]);
  const key = `${API_BASE_URL}:${publicId}:7:ko`;
  const stored = cache.get(key);
  if (stored) return Promise.resolve(stored);
  const existing = pending.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const request = Promise.resolve().then(() => fetch(
    `${API_BASE_URL}/api/popups/${encodeURIComponent(publicId)}/nearby?limit=7&languageCode=ko`,
    { signal: controller.signal, credentials: 'omit' },
  )).then(async response => {
    if (!response.ok) throw new Error('Nearby popups unavailable');
    return parse(await response.json(), publicId);
  }).catch(() => [] as NearbyPopup[]).then(items => {
    cache.set(key, items);
    return items;
  }).finally(() => { clearTimeout(timeout); pending.delete(key); });
  pending.set(key, request);
  return request;
}
