/**
 * Turns parsed list lines into store products (feature spec F02/F03).
 * Branded lines auto-match to that brand; unbranded swappable lines ask the shopper
 * "Which one do you usually buy?" with up to three real options. Nothing is guessed.
 */
import type { ListLine, MatchedLine, Product, Store } from './types';
import { coreTokens, variantsIn, isStoreBrand } from './vocab';
import { hasKroger } from './credentials';
import { findStores as krogerStores, searchProducts as krogerSearch } from './kroger';
import { demoSearch, demoStores } from '../demo/catalog';

export type Mode = 'live' | 'demo';
export const currentMode = (): Mode => (hasKroger() ? 'live' : 'demo');

/** Kroger-family stores near the ZIP: live when Kroger prices are connected, otherwise the labelled demo stores. */
export async function findStores(zip: string): Promise<Store[]> {
  return currentMode() === 'live' ? krogerStores(zip) : demoStores();
}

/** Search one store, routed by where that store's prices come from. */
export function searchAt(term: string, store: Store): Promise<Product[]> {
  return store.source === 'kroger' ? krogerSearch(term, store.id) : demoSearch(term, store.id);
}

let storeIndex = new Map<string, Store>();
export function rememberStores(stores: Store[]) { storeIndex = new Map(stores.map(s => [s.id, s])); }

function search(term: string, storeId: string): Promise<Product[]> {
  const store = storeIndex.get(storeId);
  if (store) return searchAt(term, store);
  return currentMode() === 'live' ? krogerSearch(term, storeId) : demoSearch(term, storeId);
}

function relevant(line: ListLine, p: Product): boolean {
  const need = coreTokens(line.description);
  const have = new Set([...coreTokens(p.description), ...coreTokens(p.brand)]);
  if (need.length && !need.every(t => have.has(t))) return false;
  const pv = variantsIn(p.description);
  return line.variants.every(v => pv.includes(v));
}

/**
 * The products to consider for one line, with as few requests as possible. A branded line searches
 * "brand + product" first; the plain product search (the one that surfaces store-brand equivalents)
 * only runs when that answer has no same-type store-brand product in it. Unbranded lines search once.
 */
export async function poolFor(line: ListLine, run: (term: string) => Promise<Product[]>): Promise<Product[]> {
  if (!line.brand) return run(line.description);
  const first = await run(`${line.brand} ${line.description}`);
  if (first.some(p => isStoreBrand(p.brand) && relevant(line, p))) return first;
  return dedupe([...first, ...(await run(line.description))]);
}

function brandMatches(line: ListLine, p: Product): boolean {
  if (!line.brand) return false;
  const b = line.brand.toLowerCase().replace(/[’']/g, '');
  return p.brand.toLowerCase().replace(/[’']/g, '').includes(b) || p.description.toLowerCase().replace(/[’']/g, '').includes(b);
}

function closestPack(line: ListLine, list: Product[]): Product {
  if (!line.size) return list[0];
  return [...list].sort((a, b) => dist(a) - dist(b))[0];
  function dist(p: Product) {
    if (!p.pack || p.pack.unit !== line.size!.unit) return 1e9;
    return Math.abs(p.pack.amount - line.size!.amount);
  }
}

export async function matchLine(line: ListLine, storeId: string): Promise<MatchedLine> {
  if (line.scope === 'unsupported') return { line, status: 'unsupported', baseline: null, options: [], candidates: [] };

  const pool = await poolFor(line, term => search(term, storeId));
  const rel = pool.filter(p => relevant(line, p));

  if (line.scope === 'keep') {
    const base = rel[0] ?? null;
    return { line, status: base ? 'keep' : 'notfound', baseline: base, options: [], candidates: [] };
  }

  if (line.brand) {
    const own = rel.filter(p => brandMatches(line, p));
    if (own.length) return { line, status: 'confirmed', baseline: closestPack(line, own), options: own.slice(0, 3), candidates: rel };
  }
  if (!rel.length) return { line, status: 'notfound', baseline: null, options: [], candidates: [] };

  // Unbranded (or brand not found): offer up to three real choices, national brands first so the
  // baseline reflects what people usually buy, never auto-picking the priciest one.
  const options = [...rel]
    .sort((a, b) => Number(isStoreBrand(a.brand)) - Number(isStoreBrand(b.brand)))
    .filter((p, i, arr) => arr.findIndex(q => q.brand === p.brand && q.sizeLabel === p.sizeLabel) === i)
    .slice(0, 3);
  return { line, status: 'ask', baseline: null, options, candidates: rel };
}

export async function matchAll(
  lines: ListLine[], storeId: string, onProgress?: (done: number, total: number) => void,
): Promise<MatchedLine[]> {
  let done = 0;
  const out: MatchedLine[] = new Array(lines.length);
  const queue = lines.map((l, i) => ({ l, i }));
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      out[job.i] = await matchLine(job.l, storeId);
      onProgress?.(++done, lines.length);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker)); // cap concurrency at 3
  return out;
}

function dedupe(ps: Product[]): Product[] {
  const seen = new Set<string>();
  return ps.filter(p => (seen.has(p.productId) ? false : (seen.add(p.productId), true)));
}
