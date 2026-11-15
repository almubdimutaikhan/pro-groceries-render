/**
 * Compare the same confirmed basket across the Kroger-family stores near the ZIP. Same rules as the
 * single-store engine: same type, same variant, full quantity, locked items keep their brand.
 * Deterministic, integer cents, no AI. Only meaningful with live prices: the demo catalog has no
 * per-store data worth comparing, so the UI never offers this in demo mode.
 */
import type { Comparison, MatchedLine, Pick, Prefs, Product, Store } from './types';
import { lockKeyOf, pickFor, requestedQty, sameType, sameVariants, productName } from './engine';
import { sameDimension } from './units';
import { coreTokens } from './vocab';
import { poolFor, searchAt } from './matching';

export interface QuoteLine { lineId: string; label: string; pick: Pick | null; sameBrand: boolean }
export interface StoreQuote {
  store: Store;
  lines: QuoteLine[];
  totalCents: number;      // over lines this store can price
  covered: number;         // lines priced here
  fetchedAt: string;
  isHome: boolean;
}

const sameBrandOf = (a: Product, b: Product) => a.brand.toLowerCase() === b.brand.toLowerCase();

/** Cheapest valid equivalent of the confirmed baseline among one store's products. */
export function bestAtStore(m: MatchedLine, pool: Product[], locked: boolean): { pick: Pick; sameBrand: boolean } | null {
  const base = m.baseline;
  if (!base) return null;
  const req = requestedQty(m);
  let best: { pick: Pick; sameBrand: boolean } | null = null;
  for (const c of pool) {
    if (locked && !sameBrandOf(c, base)) continue;
    if (m.status === 'keep') {
      // fresh goods: the same thing (e.g. bananas), any label
      const need = coreTokens(m.line.description);
      const have = new Set(coreTokens(c.description));
      if (!need.length || !need.every(t => have.has(t))) continue;
    } else {
      if (!req || !c.pack || !sameDimension(c.pack, req)) continue;
      if (!sameType(m, c) || !sameVariants(base, c, m.line.variants)) continue;
    }
    const pick = pickFor(c, req, m.line.count);
    if (!pick) continue;
    if (req && c.pack && pick.packages * c.pack.amount + 1e-9 < req.amount) continue;
    if (!best || pick.cents < best.pick.cents) best = { pick, sameBrand: sameBrandOf(c, base) };
  }
  return best;
}

export async function quoteStore(matched: MatchedLine[], store: Store, locks: Set<string>, prefs: Prefs): Promise<StoreQuote> {
  const lines: QuoteLine[] = [];
  let latest = '';
  const jobs = matched.filter(m => m.baseline && (m.status === 'confirmed' || m.status === 'keep'));
  const queue = [...jobs];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const base = m.baseline!;
      const pool = await poolFor({ ...m.line, brand: base.brand }, term => searchAt(term, store));
      for (const p of pool) if (p.fetchedAt > latest) latest = p.fetchedAt;
      const locked = locks.has(lockKeyOf(m)) || prefs.brandLocks.includes(base.brand.toLowerCase());
      const best = bestAtStore(m, pool, locked);
      lines.push({ lineId: m.line.id, label: productName(base), pick: best?.pick ?? null, sameBrand: best?.sameBrand ?? false });
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  const order = new Map(jobs.map((m, i) => [m.line.id, i]));
  lines.sort((a, b) => (order.get(a.lineId) ?? 0) - (order.get(b.lineId) ?? 0));
  const priced = lines.filter(l => l.pick);
  return {
    store, lines, isHome: false,
    totalCents: priced.reduce((s, l) => s + l.pick!.cents, 0),
    covered: priced.length,
    fetchedAt: latest || new Date().toISOString(),
  };
}

/** The home store's quote comes straight from the comparison, so the numbers match the result screen. */
export function homeQuote(c: Comparison, store: Store): StoreQuote {
  const lines = c.lines.filter(l => l.chosen).map(l => ({ lineId: l.lineId, label: l.label, pick: l.chosen, sameBrand: !l.swap }));
  return { store, lines, isHome: true, totalCents: c.chosenCents, covered: lines.length, fetchedAt: c.fetchEndedAt };
}
