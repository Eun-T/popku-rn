// The existing Nuxt preview returns the web's exact KR+JP aggregate. Do not use
// the top-level totalCount (Seoul only), map markers, or a paginated RN list.
type Entry = { total: number | null; expiresAt: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<number | null>>();
const TTL_MS = 60_000;

function seoulDay(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseTotal(value: unknown, day: string): number {
  if (!value || typeof value !== 'object' || !('popupStats' in value)
    || !('asOf' in value) || value.asOf !== day
    || !value.popupStats || typeof value.popupStats !== 'object') throw new Error('Invalid popup stats');
  const stats = value.popupStats as Record<string, unknown>;
  const count = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid popup count');
    return value;
  };
  const total = count(stats.totalCount);
  if (count(stats.KR) + count(stats.JP) !== total) throw new Error('Invalid popup total');
  return total;
}

export function getHomeSeoulMapCount(): Promise<number | null> {
  const day = seoulDay();
  const key = `https://popchive.com:${day}`;
  const stored = cache.get(key);
  if (stored && stored.expiresAt > Date.now()) return Promise.resolve(stored.total);
  const existing = pending.get(key);
  if (existing) return existing;
  // Keep this tiny cache bounded across calendar days.
  for (const [oldKey, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(oldKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const request = Promise.resolve().then(() => fetch('https://theplave.co.kr/api/popups/map?preview=seoul', {
    signal: controller.signal, credentials: 'omit',
  })).then(async response => {
    if (!response.ok) throw new Error('Popup count unavailable');
    return parseTotal(await response.json(), day);
  }).catch(() => null).then(total => {
    cache.set(key, { total, expiresAt: Date.now() + TTL_MS });
    return total;
  }).finally(() => { clearTimeout(timeout); pending.delete(key); });
  pending.set(key, request);
  return request;
}
