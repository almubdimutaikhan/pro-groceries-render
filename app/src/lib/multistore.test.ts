import { describe, expect, it } from 'vitest';
import { matchAll, rememberStores } from './matching';
import { compare, lockKeyOf } from './engine';
import { parseList, SAMPLE_LIST } from './parser';
import { homeQuote, quoteStore } from './multistore';
import { DEMO_STORES } from '../demo/catalog';
import { usd } from './money';

describe('compare Kroger-family stores (engine only; the UI offers this with live prices)', () => {
  it('quotes the same basket at the other stores under the same rules', async () => {
    const home = DEMO_STORES[0];
    rememberStores(DEMO_STORES);
    const matched = await matchAll(parseList(SAMPLE_LIST), home.id);
    const tide = matched.find(m => m.line.brand === 'Tide')!;
    const locks = new Set([lockKeyOf(tide)]);
    const prefs = { brandLocks: [] };
    const c = compare(matched, locks, prefs, { id: 'c', storeId: home.id, storeName: home.name, fetchStartedAt: '', fetchEndedAt: '', source: 'demo' });
    const others = DEMO_STORES.slice(1);
    const quotes = [homeQuote(c, home), ...(await Promise.all(others.map(s => quoteStore(matched, s, locks, prefs))))];
    console.log(quotes.map(q => `${q.store.name}: ${usd(q.totalCents)} (${q.covered} items)`).join('\n'));

    for (const q of quotes.slice(1)) {
      expect(q.covered, `${q.store.name} prices every line the home store does`).toBe(quotes[0].covered);
      expect(q.totalCents, `${q.store.name} is pricier by the demo markup`).toBeGreaterThan(quotes[0].totalCents);
      const milk = q.lines.find(l => l.label.includes('Horizon'))!;
      expect(milk.pick!.product.brand).toBe('Simple Truth Organic');           // organic 2% stays organic 2%
      expect(milk.pick!.product.description).toMatch(/2%/);
      expect(q.lines.find(l => l.label.includes('Tide'))!.pick!.product.brand).toBe('Tide'); // the lock keeps the brand
    }
  });
});
