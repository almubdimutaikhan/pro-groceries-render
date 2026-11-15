/**
 * Deterministic swap engine (feature spec F04/F05). No AI touches anything in this file.
 * Money is integer cents. A swap is allowed only when ALL of these hold:
 *   1. same product type        2. same variant in every variant group
 *   3. covers the full requested quantity with whole packages
 *   4. lower checkout cost for that quantity   5. not locked
 * Unknown size, unknown price or unknown type ⇒ no swap.
 */
import type { Comparison, LineResult, MatchedLine, Pick, Prefs, Product, Qty, SwapType } from './types';
import { formatQty, sameDimension } from './units';
import { coreTokens, groupOf, isStoreBrand, variantsIn } from './vocab';

export function eligiblePrice(p: Product): { cents: number | null; usedPromo: boolean } {
  const r = p.regularCents;
  const pr = p.promoCents;
  if (pr != null && pr > 0 && (r == null || pr < r)) return { cents: pr, usedPromo: true };
  return { cents: r != null && r > 0 ? r : null, usedPromo: false };
}

export function packagesFor(requested: Qty, pack: Qty): number {
  return Math.max(1, Math.ceil(requested.amount / pack.amount - 1e-9));
}

/** The amount the shopper needs. Stated size × count wins; else the baseline pack × count. */
export function requestedQty(m: MatchedLine): Qty | null {
  const { line, baseline } = m;
  if (line.size && (!baseline?.pack || sameDimension(line.size, baseline.pack))) {
    return { amount: line.size.amount * line.count, unit: line.size.unit };
  }
  if (baseline?.pack) return { amount: baseline.pack.amount * line.count, unit: baseline.pack.unit };
  return null;
}

export function pickFor(product: Product, requested: Qty | null, fallbackCount: number): Pick | null {
  const { cents, usedPromo } = eligiblePrice(product);
  if (cents == null) return null;
  const packages = requested && product.pack && sameDimension(requested, product.pack)
    ? packagesFor(requested, product.pack)
    : fallbackCount;
  return { product, packages, cents: packages * cents, usedPromo };
}

function variantMap(text: string, extra: string[] = []): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of [...variantsIn(text), ...extra]) {
    const g = groupOf(v);
    if (g && !m.has(g)) m.set(g, v);
  }
  return m;
}

export function sameVariants(baseline: Product, candidate: Product, stated: string[] = []): boolean {
  const a = variantMap(baseline.description, stated);
  const b = variantMap(candidate.description);
  for (const g of new Set([...a.keys(), ...b.keys()])) if (a.get(g) !== b.get(g)) return false;
  return true;
}

export function sameType(m: MatchedLine, candidate: Product): boolean {
  const base = m.baseline!;
  let need = coreTokens(m.line.description);
  if (!need.length) need = coreTokens(base.description).filter(t => !base.brand.toLowerCase().includes(t));
  if (!need.length) return false;
  const have = new Set(coreTokens(candidate.description));
  if (!need.every(t => have.has(t))) return false;
  if (base.categories.length && candidate.categories.length) {
    if (!base.categories.some(c => candidate.categories.includes(c))) return false;
  }
  return true;
}

export interface Candidate { pick: Pick; type: SwapType; reason: string }

export function bestSwap(m: MatchedLine, original: Pick, requested: Qty | null): Candidate | null {
  const base = m.baseline!;
  if (!requested || !base.pack) return null;               // unknown amount ⇒ no swap
  let best: Candidate | null = null;
  for (const c of m.candidates) {
    if (c.productId === base.productId) continue;
    if (!c.pack || !sameDimension(c.pack, requested)) continue;
    if (!sameType(m, c)) continue;
    if (!sameVariants(base, c, m.line.variants)) continue;
    const pick = pickFor(c, requested, m.line.count);
    if (!pick || pick.cents >= original.cents) continue;
    // must cover the full requested amount (guaranteed by packagesFor, asserted here)
    if (pick.packages * c.pack.amount + 1e-9 < requested.amount) continue;
    const cand: Candidate = { pick, ...describe(base, original, pick) };
    if (!best || pick.cents < best.pick.cents ||
        (pick.cents === best.pick.cents && packDelta(base, c) < packDelta(base, best.pick.product))) best = cand;
  }
  return best;
}

function packDelta(a: Product, b: Product): number {
  return a.pack && b.pack ? Math.abs(a.pack.amount - b.pack.amount) / a.pack.amount : 9;
}

function describe(base: Product, original: Pick, pick: Pick): { type: SwapType; reason: string } {
  const c = pick.product;
  const samePack = packDelta(base, c) <= 0.1;
  if (isStoreBrand(c.brand) && !isStoreBrand(base.brand)) {
    return {
      type: 'store-brand',
      reason: samePack
        ? `Store brand, same ${formatQty(c.pack)} size and variant.`
        : `Store brand. ${pick.packages} × ${c.sizeLabel} covers what you need.`,
    };
  }
  if (pick.usedPromo && c.brand.toLowerCase() === base.brand.toLowerCase()) {
    return { type: 'promo', reason: `Same brand on sale this week${c.promoNeedsCard ? ' with the free Kroger card' : ''}.` };
  }
  if (!samePack) {
    return {
      type: 'better-pack',
      reason: `${pick.packages} × ${c.sizeLabel} instead of ${original.packages} × ${base.sizeLabel}, same amount or more.`,
    };
  }
  return { type: pick.usedPromo ? 'promo' : 'store-brand', reason: pick.usedPromo ? 'Equivalent product on sale this week.' : 'Equivalent product, lower price.' };
}

export function lockKeyOf(m: MatchedLine): string {
  return m.baseline ? `p:${m.baseline.productId}` : `d:${m.line.description.toLowerCase()}`;
}

export function labelOf(m: MatchedLine): string {
  if (m.baseline) return productName(m.baseline);
  return [m.line.brand, m.line.description].filter(Boolean).join(' ');
}

/** "Barilla Spaghetti Pasta", never "Cheerios Honey Nut Cheerios Cereal". */
export function productName(p: Product): string {
  const b = p.brand.trim();
  if (!b || p.description.toLowerCase().includes(b.toLowerCase())) return p.description;
  return `${b} ${p.description}`;
}

export function computeLine(m: MatchedLine, locks: Set<string>, prefs: Prefs): LineResult {
  const lockKey = lockKeyOf(m);
  const base: LineResult = {
    lineId: m.line.id, lockKey, label: labelOf(m), status: m.status,
    original: null, chosen: null, swap: null, locked: locks.has(lockKey), lockedSwap: null,
  };
  if (!m.baseline || m.status === 'ask' || m.status === 'notfound' || m.status === 'unsupported') return base;
  const requested = requestedQty(m);
  const original = pickFor(m.baseline, requested, m.line.count);
  if (!original) return base;                                // unpriced baseline
  base.original = original;
  base.chosen = original;
  if (m.status === 'keep') return base;                       // fresh/by-weight: never swapped
  const brandLocked = prefs.brandLocks.includes(m.baseline.brand.toLowerCase());
  const swap = bestSwap(m, original, requested);
  if (!swap) return base;
  const saving = original.cents - swap.pick.cents;
  if (base.locked || brandLocked) {
    base.locked = true;
    base.lockedSwap = { product: swap.pick.product, savingCents: saving };
    return base;
  }
  base.chosen = swap.pick;
  base.swap = { type: swap.type, savingCents: saving, reason: swap.reason };
  return base;
}

export function compare(
  matched: MatchedLine[],
  locks: Set<string>,
  prefs: Prefs,
  meta: { id: string; storeId: string; storeName: string; fetchStartedAt: string; fetchEndedAt: string; source: Comparison['source'] },
): Comparison {
  const lines = matched.map(m => computeLine(m, locks, prefs));
  const covered = lines.filter(l => l.original && l.chosen);
  const originalCents = covered.reduce((s, l) => s + l.original!.cents, 0);
  const chosenCents = covered.reduce((s, l) => s + l.chosen!.cents, 0);
  const order = (l: LineResult) => (l.swap ? 0 : l.lockedSwap ? 1 : l.status === 'confirmed' ? 2 : l.status === 'keep' ? 3 : 4);
  lines.sort((a, b) => order(a) - order(b) || (b.swap?.savingCents ?? b.lockedSwap?.savingCents ?? 0) - (a.swap?.savingCents ?? a.lockedSwap?.savingCents ?? 0));
  return {
    ...meta,
    lines,
    originalCents,
    chosenCents,
    savingCents: originalCents - chosenCents,
    pricedCount: covered.length,
    totalCount: matched.filter(m => m.status !== 'unsupported').length,
  };
}
