/**
 * KV access — Upstash Redis (via Vercel Marketplace) with in-memory fallback.
 * Pattern lifted from ai-research-daily/lib/storage.js — accepts both
 * UPSTASH_REDIS_REST_* and KV_REST_API_* env var names.
 */

// Persist across Next.js dev hot-reloads (each /api/* recompile re-imports this
// module; without globalThis pin the in-memory fallback would reset).
const memStore: Map<string, any> =
  (globalThis as any).__SILICON_TRADER_KV__ ?? new Map();
(globalThis as any).__SILICON_TRADER_KV__ = memStore;

function creds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return { url, token };
  return null;
}

let _client: any = null;

async function client() {
  const c = creds();
  if (!c) return null;
  if (_client) return _client;
  const { Redis } = await import('@upstash/redis');
  _client = new Redis({ url: c.url, token: c.token });
  return _client;
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await client();
    if (r) return ((await r.get(key)) ?? null) as T | null;
  } catch (e) { console.error('[kv] get failed', key, e); }
  return (memStore.get(key) ?? null) as T | null;
}

export async function kvSet(key: string, value: any, ttlSec?: number): Promise<void> {
  try {
    const r = await client();
    if (r) {
      if (ttlSec) await r.set(key, value, { ex: ttlSec });
      else await r.set(key, value);
      return;
    }
  } catch (e) { console.error('[kv] set failed', key, e); }
  memStore.set(key, value);
}

export async function kvDel(key: string): Promise<void> {
  try {
    const r = await client();
    if (r) { await r.del(key); return; }
  } catch (e) { console.error('[kv] del failed', key, e); }
  memStore.delete(key);
}

export async function kvZAdd(key: string, score: number, member: string): Promise<void> {
  try {
    const r = await client();
    if (r) { await r.zadd(key, { score, member }); return; }
  } catch (e) { console.error('[kv] zadd failed', key, e); }
  const arr = memStore.get(key) ?? [];
  arr.push({ score, member });
  arr.sort((a: any, b: any) => a.score - b.score);
  memStore.set(key, arr);
}

export async function kvZRevRange(key: string, start: number, stop: number): Promise<string[]> {
  try {
    const r = await client();
    if (r) return await r.zrange(key, start, stop, { rev: true });
  } catch (e) { console.error('[kv] zrange failed', key, e); }
  const arr = memStore.get(key) ?? [];
  return [...arr].sort((a: any, b: any) => b.score - a.score)
    .slice(start, stop + 1)
    .map((x: any) => x.member);
}

export const KV_KEYS = {
  run: (id: string) => `run:${id}`,
  runInput: (id: string) => `run:${id}:input`,
  runStream: (id: string) => `run:${id}:stream`,   // rpush events for resume / late join
  runsIndex: 'runs:index',
  runsByTicker: (ticker: string) => `runs:by-ticker:${ticker.toUpperCase()}`,
  memory: (ticker: string) => `memory:${ticker.toUpperCase()}`,
  cachePrice: (ticker: string, date: string) => `cache:price:${ticker.toUpperCase()}:${date}`,
  cacheNews: (ticker: string, week: string) => `cache:news:${ticker.toUpperCase()}:${week}`,
};
