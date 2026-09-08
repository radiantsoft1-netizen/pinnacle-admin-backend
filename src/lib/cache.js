// Tiny in-memory TTL cache for public read endpoints that are fetched on
// every single page load (settings, menus) by every visitor. Vercel keeps a
// warm function instance alive between nearby requests, so this genuinely
// cuts DB round-trips for the common case of multiple visitors/page-loads
// hitting the same warm instance within the TTL window - it just doesn't
// help across cold starts, which is fine since a cold start pays a fresh
// DB connection cost anyway.
const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
