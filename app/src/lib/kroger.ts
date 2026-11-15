/**
 * Kroger public API. Kroger sends no CORS headers, so the browser reaches it one of two ways:
 *  - through the proxy at KROGER_PROXY_BASE (see lib/credentials.ts), which holds the client secret, or
 *  - directly, with a short-lived operator token pasted into Operator setup (only works where
 *    Kroger permits the origin).
 * The client secret never reaches the browser.
 */
import type { Product, Store } from './types';
import { toCents } from './money';
import { parseSize } from './units';
import { getCreds, krogerViaProxy, KROGER_PROXY_BASE } from './credentials';
import * as db from './db';

const BASE = 'https://api.kroger.com/v1';

export class ProviderError extends Error {
  constructor(message: string, public kind: 'auth' | 'cors' | 'http' | 'empty') {
    super(message);
  }
}

/** Through the proxy: it holds the Kroger credentials and makes the call. */
async function getViaProxy<T>(path: string, params: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${KROGER_PROXY_BASE}/v1${path}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
  } catch {
    throw new ProviderError('The price service did not answer. Try again in a moment.', 'cors');
  }
  if (res.ok) return res.json() as Promise<T>;
  const detail = await res.json().then((j: { error?: string }) => j.error, () => undefined);
  if (res.status === 401 || res.status === 403 || res.status === 502) {
    throw new ProviderError(detail ?? 'Kroger rejected the price service credentials.', 'auth');
  }
  throw new ProviderError(`Kroger returned HTTP ${res.status}.`, 'http');
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  if (krogerViaProxy()) return getViaProxy<T>(path, params);
  const token = getCreds().krogerToken;
  if (!token) throw new ProviderError('Live Kroger prices are not connected.', 'auth');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ProviderError('Kroger did not answer the browser request. It may block this origin (CORS) or the network is down.', 'cors');
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('The Kroger token expired or lacks the product scope. Paste a fresh token in Operator setup.', 'auth');
  if (!res.ok) throw new ProviderError(`Kroger returned HTTP ${res.status}.`, 'http');
  return res.json() as Promise<T>;
}

interface KLocation {
  locationId: string; chain?: string; name?: string;
  address?: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
}

export async function findStores(zip: string): Promise<Store[]> {
  const r = await get<{ data?: KLocation[] }>('/locations', { 'filter.zipCode.near': zip, 'filter.limit': '8' });
  const stores = (r.data ?? []).filter(l => l.locationId).map(l => ({
    id: l.locationId,
    name: l.name ?? `${l.chain ?? 'Kroger'} ${l.locationId}`,
    chain: l.chain ?? 'KROGER',
    address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
    city: l.address?.city,
    state: l.address?.state,
    source: 'kroger' as const,
  }));
  if (!stores.length) throw new ProviderError(`No Kroger-family stores came back near ${zip}.`, 'empty');
  return stores;
}

interface KProduct {
  productId: string; upc?: string; brand?: string; description?: string; categories?: string[];
  images?: Array<{ perspective?: string; sizes?: Array<{ size?: string; url?: string }> }>;
  items?: Array<{ itemId?: string; size?: string; price?: { regular?: number; promo?: number } }>;
}

export function normaliseProduct(p: KProduct, storeId: string, fetchedAt: string): Product {
  const item = p.items?.[0];
  const regular = toCents(item?.price?.regular);
  const promoRaw = toCents(item?.price?.promo);
  const front = p.images?.find(i => i.perspective === 'front') ?? p.images?.[0];
  const img = front?.sizes?.find(s => s.size === 'thumbnail') ?? front?.sizes?.find(s => s.size === 'small') ?? front?.sizes?.[0];
  return {
    productId: p.productId,
    upc: p.upc,
    brand: p.brand ?? '',
    description: p.description ?? '',
    categories: p.categories ?? [],
    sizeLabel: item?.size ?? '',
    pack: parseSize(item?.size),
    regularCents: regular,
    promoCents: promoRaw && regular && promoRaw < regular ? promoRaw : null,
    promoNeedsCard: true,
    storeId,
    fetchedAt,
    image: img?.url,
    source: 'kroger',
  };
}

/* ---------- search cache: fewer requests, honest timestamps ---------- */
/** A cached search keeps the `fetchedAt` of the request that produced it, so the UI never shows a price as newer than it is. */
export const SEARCH_CACHE_MS = 15 * 60 * 1000;
const memory = new Map<string, { at: number; products: Product[] }>();
let freshDepth = 0;

/** While `fn` runs, searches skip the cache and fetch live prices (they still refresh the cache). The explicit "Re-price" action uses this. */
export async function withFreshPrices<T>(fn: () => Promise<T>): Promise<T> {
  freshDepth++;
  try { return await fn(); } finally { freshDepth--; }
}

export function clearSearchCache(): void { memory.clear(); }

async function cached(key: string): Promise<Product[] | null> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.at < SEARCH_CACHE_MS) return hit.products;
  try {
    const row = await db.get<{ id: string; at: number; products: Product[] }>('searchCache', key);
    if (row && now - row.at < SEARCH_CACHE_MS) { memory.set(key, { at: row.at, products: row.products }); return row.products; }
  } catch { /* IndexedDB unavailable: the memory cache still works */ }
  return null;
}

function remember(key: string, products: Product[]): void {
  const at = Date.now();
  memory.set(key, { at, products });
  db.put('searchCache', { id: key, at, products }).catch(() => undefined);
}

const inflight = new Map<string, Promise<Product[]>>();

/** Search one term at one store. Identical in-flight requests are shared; results are cached for 15 minutes. */
export function searchProducts(term: string, storeId: string): Promise<Product[]> {
  const key = `${storeId}|${term.toLowerCase()}`;
  const fresh = freshDepth > 0;
  // A fresh request never joins a cache-eligible one that is already in flight, and the entry is
  // dropped the moment its request settles, so a later call sees the cache or fetches again.
  const flightKey = `${fresh ? 'fresh' : 'cache'}|${key}`;
  const existing = inflight.get(flightKey);
  if (existing) return existing;
  const p = (async () => {
    if (!fresh) {
      const hit = await cached(key);
      if (hit) return hit;
    }
    const r = await get<{ data?: KProduct[] }>('/products', { 'filter.term': term.slice(0, 80), 'filter.locationId': storeId, 'filter.limit': '20' });
    const at = new Date().toISOString();
    const products = (r.data ?? []).map(d => normaliseProduct(d, storeId, at));
    remember(key, products);
    return products;
  })().finally(() => { inflight.delete(flightKey); });
  inflight.set(flightKey, p);
  return p;
}
