// Simple in-memory TTL cache for API responses
const cache = new Map<string, { data: unknown; expiry: number }>();

export function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiry > now) {
    return Promise.resolve(hit.data as T);
  }
  return fetcher().then((data) => {
    cache.set(key, { data, expiry: now + ttlMs });
    return data;
  });
}

export function invalidateCache(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// Auto-cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expiry <= now) cache.delete(key);
  }
}, 300_000);
