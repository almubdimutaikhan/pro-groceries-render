/** Orchestration: the "command controller" from SYSTEM.md §4. Every action is explicit and allow-listed. */
import type { Comparison, ListLine, MatchedLine, Product, Store } from '../lib/types';
import { compare, productName } from '../lib/engine';
import { findStores, matchAll, rememberStores } from '../lib/matching';
import { parseWithAI } from '../lib/openrouter';
import { parseLine, newId } from '../lib/parser';
import { weekKey, weekStart } from '../lib/week';
import * as db from '../lib/db';
import { withFreshPrices } from '../lib/kroger';
import { canReprice, FREE_REPRICES } from '../lib/entitlement';
import { getState, setEntitlement, setState, type ShoppingEvent } from './store';

export async function parseText(text: string): Promise<ListLine[]> {
  const { lines, usedAI } = await parseWithAI(text);
  setState({ listText: text, lines, usedAIParse: usedAI });
  return lines;
}

export async function loadStores(zip: string): Promise<Store[]> {
  const stores = await findStores(zip);
  rememberStores(stores);
  setState({ stores, zip });
  return stores;
}

/** Fetch products for every line at the chosen store. Earlier confirmed baselines are kept by product ID. */
export async function matchAtStore(store: Store, onProgress?: (d: number, t: number) => void): Promise<MatchedLine[]> {
  const { lines, matched: previous, stores } = getState();
  rememberStores([...stores, store]);
  const matched = await matchAll(lines, store.id, onProgress);
  // Re-apply earlier answers ("which milk do you usually buy?") when the same product is still offered.
  const prevByRaw = new Map(previous.filter(m => m.baseline).map(m => [m.line.raw.toLowerCase(), m.baseline!]));
  const merged = matched.map(m => {
    const prev = prevByRaw.get(m.line.raw.toLowerCase());
    if (m.status === 'ask' && prev) {
      const same = m.candidates.find(c => c.productId === prev.productId);
      if (same) return { ...m, status: 'confirmed' as const, baseline: same };
    }
    return m;
  });
  setState({ store, matched: merged });
  return merged;
}

export function answer(lineId: string, product: Product | null): void {
  setState(s => ({
    matched: s.matched.map(m => m.line.id !== lineId ? m
      : product ? { ...m, status: 'confirmed', baseline: product } : { ...m, status: 'notfound', baseline: null }),
  }));
}

export function pendingQuestions(): MatchedLine[] {
  return getState().matched.filter(m => m.status === 'ask');
}

/** Run the deterministic engine and record the comparison + every observed price. */
export async function runComparison(): Promise<Comparison> {
  const s = getState();
  const store = s.store!;
  const times = s.matched.flatMap(m => m.candidates.map(c => c.fetchedAt)).sort();
  const c = compare(s.matched, new Set(s.locks), s.prefs, {
    id: newId('c'),
    storeId: store.id,
    storeName: store.name,
    fetchStartedAt: times[0] ?? new Date().toISOString(),
    fetchEndedAt: times[times.length - 1] ?? new Date().toISOString(),
    source: store.source,
  });
  const version = s.basketVersion + 1;
  setState({ comparison: c, basketVersion: version, history: [...s.history, c], checked: [], quotes: [] });
  if (s.dbOk) {
    const obs = s.matched.flatMap(m => m.candidates).map(p => ({
      id: `${c.id}:${p.productId}`, comparisonId: c.id, storeId: p.storeId, productId: p.productId,
      name: productName(p), size: p.sizeLabel, regularCents: p.regularCents, promoCents: p.promoCents,
      promoNeedsCard: p.promoNeedsCard, fetchedAt: p.fetchedAt, source: p.source,
    }));
    Promise.all([
      db.put('comparisons', c),
      db.putMany('priceObservations', obs),
      db.put('basketVersions', {
        id: `${s.basketId}:v${version}`, basketId: s.basketId, version, storeId: store.id,
        lines: s.lines, locks: s.locks, comparisonId: c.id, createdAt: new Date().toISOString(),
      }),
    ]).catch(() => setState({ dbOk: false }));
  }
  return c;
}

/** Keep original / undo. Recomputes from the same price snapshot – no new fetch. */
export function toggleLock(lockKey: string): void {
  const s = getState();
  const locks = s.locks.includes(lockKey) ? s.locks.filter(k => k !== lockKey) : [...s.locks, lockKey];
  const prev = s.comparison!;
  const c = compare(s.matched, new Set(locks), s.prefs, {
    id: prev.id, storeId: prev.storeId, storeName: prev.storeName,
    fetchStartedAt: prev.fetchStartedAt, fetchEndedAt: prev.fetchEndedAt, source: prev.source,
  });
  setState({ locks, comparison: c, history: s.history.map(h => (h.id === c.id ? c : h)), quotes: [] });
  if (s.dbOk) db.put('comparisons', c).catch(() => undefined);
}

/** "Re-price my basket": same list, store and locks, fresh prices. */
export async function reprice(onProgress?: (d: number, t: number) => void): Promise<{ comparison: Comparison | null; questions: number }> {
  const s = getState();
  if (!s.store) throw new Error('Pick a store first.');
  // An explicit re-price always fetches live prices; it never answers from the 15-minute search cache.
  await withFreshPrices(() => matchAtStore(s.store!, onProgress));
  const q = pendingQuestions().length;
  if (q) return { comparison: null, questions: q };
  return { comparison: await runComparison(), questions: 0 };
}

/** One counted entry per basket per calendar week; repeat taps update it (never add a second one). */
export async function markShopped(lineIds: string[], source: ShoppingEvent['source'], paidCents: number | null = null): Promise<ShoppingEvent> {
  const s = getState();
  const c = s.comparison!;
  const bought = c.lines.filter(l => lineIds.includes(l.lineId));
  const now = new Date().toISOString();
  const key = weekKey(s.basketId);
  const ev: ShoppingEvent = {
    id: key, weekKey: key, basketId: s.basketId, comparisonId: c.id, occurredAt: now, recordedAt: now, source,
    purchasedLineIds: lineIds,
    savingCents: bought.reduce((sum, l) => sum + (l.swap && l.original && l.chosen ? l.swap.savingCents : 0), 0),
    plannedCents: bought.reduce((sum, l) => sum + (l.chosen?.cents ?? 0), 0),
    paidCents,
    demo: c.source === 'demo',
    categories: Object.entries(bought.reduce<Record<string, number>>((acc, l) => {
      if (l.swap && l.chosen) { const k = l.chosen.product.categories[0] ?? 'Other'; acc[k] = (acc[k] ?? 0) + l.swap.savingCents; }
      return acc;
    }, {})).map(([name, savingCents]) => ({ name, savingCents })),
  };
  setState({ events: [...s.events.filter(e => e.id !== key), ev] });
  if (s.dbOk) await db.put('shoppingEvents', ev).catch(() => setState({ dbOk: false }));
  return ev;
}

export function thisWeekEvent(): ShoppingEvent | undefined {
  const s = getState();
  return s.events.find(e => e.id === `${s.basketId}:${weekStart()}`);
}

export function counterCents(includeDemo = true): number {
  return getState().events.filter(e => includeDemo || !e.demo).reduce((sum, e) => sum + e.savingCents, 0);
}

/* ---------- voice / typed commands (allow-listed) ---------- */
export type Command =
  | { kind: 'keep'; lockKey: string; label: string }
  | { kind: 'unlock'; lockKey: string; label: string }
  | { kind: 'add'; text: string }
  | { kind: 'remove'; lineId: string; label: string }
  | { kind: 'check'; lineIds: string[]; labels: string[] }
  | { kind: 'unclear'; text: string };

function findRows(words: string) {
  const s = getState();
  const w = words.toLowerCase().replace(/\b(my|the|original|usual|a|an|please)\b/g, ' ').split(/\s+/).filter(x => x.length > 2);
  return (s.comparison?.lines ?? []).filter(l => {
    const hay = `${l.label} ${l.chosen ? productName(l.chosen.product) : ''}`.toLowerCase();
    return w.length && w.some(x => hay.includes(x.replace(/s$/, '')));
  });
}

/** Deterministic interpretation of short commands. Ambiguous ⇒ 'unclear' and the UI asks. */
export function interpret(text: string): Command {
  const t = text.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^(?:keep|lock|don'?t (?:swap|change))\s+(.+)$/.exec(t))) {
    const rows = findRows(m[1]);
    if (rows.length === 1) return { kind: 'keep', lockKey: rows[0].lockKey, label: rows[0].label };
  }
  if ((m = /^(?:swap|unlock|change)\s+(.+)$/.exec(t))) {
    const rows = findRows(m[1]);
    if (rows.length === 1) return { kind: 'unlock', lockKey: rows[0].lockKey, label: rows[0].label };
  }
  if ((m = /^(?:add)\s+(.+)$/.exec(t))) return { kind: 'add', text: m[1] };
  if ((m = /^(?:remove|delete|drop)\s+(.+)$/.exec(t))) {
    const rows = findRows(m[1]);
    if (rows.length === 1) return { kind: 'remove', lineId: rows[0].lineId, label: rows[0].label };
  }
  if ((m = /^(?:got|bought|i got|i bought|check|mark)\s+(.+)$/.exec(t))) {
    const parts = m[1].split(/,| and /).map(x => x.trim()).filter(Boolean);
    const rows = parts.flatMap(p => findRows(p).slice(0, 1));
    if (rows.length) return { kind: 'check', lineIds: [...new Set(rows.map(r => r.lineId))], labels: rows.map(r => r.label) };
  }
  return { kind: 'unclear', text };
}

export async function applyCommand(cmd: Command, source: 'voice' | 'text'): Promise<void> {
  const s = getState();
  if (cmd.kind === 'keep' || cmd.kind === 'unlock') {
    const locked = s.locks.includes(cmd.lockKey);
    if ((cmd.kind === 'keep') !== locked) toggleLock(cmd.lockKey);
  } else if (cmd.kind === 'check') {
    setState({ checked: [...new Set([...s.checked, ...cmd.lineIds])] });
  } else if (cmd.kind === 'add' || cmd.kind === 'remove') {
    const lines = cmd.kind === 'add' ? [...s.lines, parseLine(cmd.text)] : s.lines.filter(l => l.id !== cmd.lineId);
    setState({ lines, listText: lines.map(l => l.raw).join('\n') });
  }
  if (s.dbOk && cmd.kind !== 'unclear') {
    db.put('commands', { id: newId('cmd'), source, command: cmd, basketVersion: s.basketVersion, recordedAt: new Date().toISOString() }).catch(() => undefined);
  }
}

/* ---------- compare Kroger-family stores (live prices only) ---------- */
import { homeQuote, quoteStore } from '../lib/multistore';

/**
 * Price the confirmed basket at the other Kroger-family stores near the ZIP. Runs only when the
 * shopper asks for it (never on opening the result), and only with live prices.
 */
export async function quoteAllStores(): Promise<void> {
  const s = getState();
  if (!s.comparison || !s.store || s.store.source !== 'kroger' || s.quoting) return;
  setState({ quoting: true });
  try {
    const nearby = s.stores.filter(st => st.id !== s.store!.id && st.source === 'kroger').slice(0, 4);
    const quotes = [];
    for (const st of nearby) quotes.push(await quoteStore(s.matched, st, new Set(s.locks), s.prefs));
    const all = [homeQuote(s.comparison, s.store), ...quotes].sort((a, b) => Number(b.isHome) - Number(a.isHome) || a.totalCents - b.totalCents);
    setState({ quotes: all });
  } finally {
    setState({ quoting: false });
  }
}

/** Switch the home store to another store from the comparison (re-runs matching there). */
export async function switchStore(storeId: string): Promise<void> {
  const st = getState().stores.find(x => x.id === storeId);
  if (!st) return;
  await matchAtStore(st);
  if (pendingQuestions().length === 0) await runComparison();
  setState({ quotes: [] });
}

/* ---------- membership ---------- */
export { canReprice };
/** A free shopper's one re-pricing is used up by the first completed one. */
export function recordReprice(): void {
  const { entitlement } = getState();
  if (!entitlement.member && entitlement.freeRepricesUsed < FREE_REPRICES) setEntitlement({ freeRepricesUsed: entitlement.freeRepricesUsed + 1 });
}
/** Called when Stripe returns the shopper to `#plan?checkout=success`. Demo-grade: see README. */
export function grantMembership(period: 'year' | 'month'): void {
  setEntitlement({ member: true, period, since: new Date().toISOString() });
}
/* ---------- example history for weekly analytics (always labelled) ---------- */
function jitter(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return 1 + ((x - Math.floor(x)) - 0.5) * 0.12; // ±6%
}

export async function seedExampleHistory(weeks = 6): Promise<void> {
  const s = getState();
  const base = s.comparison;
  if (!base) return;
  const now = new Date();
  const comps: Comparison[] = [];
  const evs: ShoppingEvent[] = [];
  for (let w = weeks; w >= 1; w--) {
    const day = new Date(now.getTime() - w * 7 * 864e5);
    const ws = weekStart(day);
    const at = new Date(`${ws}T15:30:00Z`).getTime() + 5 * 864e5; // Saturday of that week
    const iso = new Date(at).toISOString();
    const lines = base.lines.map((l, i) => {
      const f = jitter(w * 31 + i);
      const scale = (p: typeof l.original) => p && { ...p, cents: Math.round(p.cents * f) };
      const original = scale(l.original);
      const chosen = scale(l.chosen);
      const saving = original && chosen ? original.cents - chosen.cents : 0;
      return { ...l, original, chosen, swap: l.swap && { ...l.swap, savingCents: saving } };
    });
    const covered = lines.filter(l => l.original && l.chosen);
    const o = covered.reduce((a, l) => a + l.original!.cents, 0);
    const c = covered.reduce((a, l) => a + l.chosen!.cents, 0);
    const comp: Comparison = { ...base, id: `demo-hist-${ws}`, lines, originalCents: o, chosenCents: c, savingCents: o - c, fetchStartedAt: iso, fetchEndedAt: iso, source: 'demo' };
    comps.push(comp);
    const bought = lines.filter((_, i) => (i + w) % 7 !== 0 && _.chosen);
    const cats = new Map<string, number>();
    for (const l of bought) if (l.swap) {
      const k = l.chosen!.product.categories[0] ?? 'Other';
      cats.set(k, (cats.get(k) ?? 0) + l.swap.savingCents);
    }
    const planned = bought.reduce((a, l) => a + l.chosen!.cents, 0);
    evs.push({
      id: `demo:${s.basketId}:${ws}`, weekKey: `demo:${ws}`, basketId: s.basketId, comparisonId: comp.id,
      occurredAt: iso, recordedAt: iso, source: 'tap', purchasedLineIds: bought.map(l => l.lineId),
      savingCents: bought.reduce((a, l) => a + (l.swap?.savingCents ?? 0), 0),
      plannedCents: planned, paidCents: Math.round(planned * jitter(w * 7)), demo: true,
      categories: [...cats].map(([name, savingCents]) => ({ name, savingCents })),
    });
  }
  setState(st => ({
    history: [...st.history.filter(h => !h.id.startsWith('demo-hist-')), ...comps].sort((a, b) => a.fetchEndedAt.localeCompare(b.fetchEndedAt)),
    events: [...st.events.filter(e => !e.id.startsWith('demo:')), ...evs],
  }));
  if (s.dbOk) await Promise.all([db.putMany('comparisons', comps), db.putMany('shoppingEvents', evs)]).catch(() => undefined);
}

export async function removeExampleHistory(): Promise<void> {
  const s = getState();
  const hc = s.history.filter(h => h.id.startsWith('demo-hist-'));
  const he = s.events.filter(e => e.id.startsWith('demo:'));
  setState({ history: s.history.filter(h => !h.id.startsWith('demo-hist-')), events: s.events.filter(e => !e.id.startsWith('demo:')) });
  if (s.dbOk) await Promise.all([...hc.map(h => db.del('comparisons', h.id)), ...he.map(e => db.del('shoppingEvents', e.id))]).catch(() => undefined);
}
