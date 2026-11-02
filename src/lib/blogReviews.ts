export type BlogReview = {
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
};

// Separate from Spring API configuration. Like the web client, cache completed
// results (including empty/error results) for this app session.
const cache = new Map<string, BlogReview[]>();
const pending = new Map<string, Promise<BlogReview[]>>();

export function isBlogPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'blog.naver.com'
      && !url.username && !url.password && !url.port && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_-]+\/\d+$/.test(url.pathname);
  } catch { return false; }
}

function thumbnailUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password ? value : null;
  } catch { return null; }
}

function parseReviews(value: unknown): BlogReview[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return [];
  const items: BlogReview[] = [];
  const seen = new Set<string>();
  for (const row of value.items as unknown[]) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    if (typeof item.title !== 'string' || !item.title.trim() || typeof item.description !== 'string'
      || typeof item.url !== 'string' || !isBlogPostUrl(item.url) || seen.has(item.url)
      || typeof item.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)) continue;
    const date = Date.parse(item.publishedAt + 'T00:00:00Z');
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== item.publishedAt) continue;
    seen.add(item.url);
    items.push({ title: item.title, description: item.description, publishedAt: item.publishedAt,
      url: item.url, thumbnailUrl: thumbnailUrl(item.thumbnailUrl) });
    if (items.length === 3) break;
  }
  return items;
}

export function getBlogReviews(publicId: string): Promise<BlogReview[]> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(publicId)) return Promise.resolve([]);
  const cached = cache.get(publicId);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(publicId);
  if (existing) return existing;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  const request = Promise.resolve().then(() => fetch(
    `https://theplave.co.kr/api/blog-reviews?publicId=${encodeURIComponent(publicId)}`,
    { signal: controller.signal, credentials: 'omit' },
  )).then(async response => {
    if (!response.ok) throw new Error('Blog reviews unavailable');
    return parseReviews(await response.json());
  }).catch(() => [] as BlogReview[]).then(items => {
    cache.set(publicId, items);
    return items;
  }).finally(() => { clearTimeout(timeout); pending.delete(publicId); });
  pending.set(publicId, request);
  return request;
}
