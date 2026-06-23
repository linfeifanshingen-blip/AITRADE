/**
 * KV-backed memoization wrapper.
 *
 * Wraps any async function so its result is cached by a deterministic key.
 * Useful for repeat fetches in dev / backtest, and for hard-rate-limited
 * external APIs (Yahoo, Tavily).
 */

import { kvGet, kvSet } from './kv';

export interface CacheOptions {
  ttlSec?: number;       // default 24h
  bypass?: boolean;      // skip cache entirely (debug)
  shouldCache?: (value: any) => boolean;
}

const DEFAULT_TTL = 86400; // 24h

export async function memo<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const { ttlSec = DEFAULT_TTL, bypass = false, shouldCache = () => true } = options;
  if (bypass) return fetcher();

  try {
    const cached = await kvGet<T>(key);
    if (cached != null) return cached;
  } catch (e) {
    // KV down? Just compute fresh.
    console.warn('[cache] read failed for', key, e);
  }

  const fresh = await fetcher();
  if (!shouldCache(fresh)) return fresh;
  try {
    await kvSet(key, fresh, ttlSec);
  } catch (e) {
    console.warn('[cache] write failed for', key, e);
  }
  return fresh;
}
