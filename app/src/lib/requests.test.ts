import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSearchCache, SEARCH_CACHE_MS, searchProducts, withFreshPrices } from './kroger';
import { poolFor } from './matching';
import { setCreds } from './credentials';
import { parseLine } from './parser';
import type { Product } from './types';

const kroger = (id: string, brand: string, description: string): object => ({
  productId: id, brand, description, categories: ['Pasta'], items: [{ itemId: `i-${id}`, size: '16 oz', price: { regular: 2.29 } }],
});

describe('Kroger search cache (15 minutes, bypassed by an explicit re-price)', () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    clearSearchCache();
    setCreds({ krogerToken: 'test-token-not-a-real-one' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: [kroger('p1', 'Barilla', 'Barilla Spaghetti Pasta')] }), { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setCreds({ krogerToken: '' }); });

  it('answers a repeat search from the cache and keeps the original fetch time', async () => {
    const a = await searchProducts('cache spaghetti', 'store-1');
    const b = await searchProducts('cache spaghetti', 'store-1');
    expect(calls).toHaveLength(1);
    expect(b[0].fetchedAt).toBe(a[0].fetchedAt);
    await searchProducts('cache spaghetti', 'store-2');       // another store is another price list
    expect(calls).toHaveLength(2);
  });

  it('an explicit re-price fetches again, and the cache then holds the fresh answer', async () => {
    await searchProducts('fresh spaghetti', 'store-1');
    await withFreshPrices(() => searchProducts('fresh spaghetti', 'store-1'));
    expect(calls).toHaveLength(2);
    await searchProducts('fresh spaghetti', 'store-1');
    expect(calls).toHaveLength(2);
  });

  it('expires after 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await searchProducts('expiry spaghetti', 'store-1');
    vi.setSystemTime(Date.now() + SEARCH_CACHE_MS - 1000);
    await searchProducts('expiry spaghetti', 'store-1');
    expect(calls).toHaveLength(1);
    vi.setSystemTime(Date.now() + 2000);
    await searchProducts('expiry spaghetti', 'store-1');
    expect(calls).toHaveLength(2);
  });
});

describe('one search is enough when it already holds a store-brand equivalent', () => {
  const p = (id: string, brand: string): Product => ({
    productId: id, brand, description: `${brand} Spaghetti Pasta`, categories: [], sizeLabel: '16 oz', pack: { amount: 16, unit: 'oz' },
    regularCents: 229, promoCents: null, promoNeedsCard: true, storeId: 's', fetchedAt: '2026-11-14T15:00:00Z', source: 'demo',
  });

  it('skips the plain product search', async () => {
    const terms: string[] = [];
    const pool = await poolFor(parseLine('Barilla spaghetti 16 oz'), async t => { terms.push(t); return [p('b', 'Barilla'), p('k', 'Kroger')]; });
    expect(terms).toEqual(['Barilla spaghetti']);
    expect(pool.map(x => x.productId)).toEqual(['b', 'k']);
  });

  it('runs the plain search only when the branded one has no store-brand product', async () => {
    const terms: string[] = [];
    const pool = await poolFor(parseLine('Barilla spaghetti 16 oz'), async t => { terms.push(t); return t.startsWith('Barilla') ? [p('b', 'Barilla')] : [p('b', 'Barilla'), p('k', 'Kroger')]; });
    expect(terms).toEqual(['Barilla spaghetti', 'spaghetti']);
    expect(pool.map(x => x.productId)).toEqual(['b', 'k']);
  });

  it('an unbranded line searches once', async () => {
    const terms: string[] = [];
    await poolFor(parseLine('milk'), async t => { terms.push(t); return []; });
    expect(terms).toEqual(['milk']);
  });
});
