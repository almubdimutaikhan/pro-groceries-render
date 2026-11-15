import { describe, expect, it } from 'vitest';
import { compare, computeLine } from './engine';
import { parseLine, parseList } from './parser';
import type { MatchedLine, Product } from './types';
import { parseSize } from './units';
import { coreTokens, variantsIn } from './vocab';

const T = '2026-11-14T15:00:00Z';
function prod(id: string, brand: string, description: string, size: string, regular: number | null, promo: number | null = null): Product {
  return {
    productId: id, brand, description, categories: [], sizeLabel: size, pack: parseSize(size),
    regularCents: regular, promoCents: promo, promoNeedsCard: true, storeId: 's1', fetchedAt: T, source: 'demo',
  };
}
function matched(raw: string, baseline: Product | null, candidates: Product[], status: MatchedLine['status'] = 'confirmed'): MatchedLine {
  return { line: parseLine(raw), status, baseline, options: [], candidates: baseline ? [baseline, ...candidates] : candidates };
}
const prefs = { brandLocks: [] as string[] };
const meta = { id: 'c1', storeId: 's1', storeName: 'Test', fetchStartedAt: T, fetchEndedAt: T, source: 'demo' as const };

describe('units', () => {
  it('parses retailer size labels into base units', () => {
    expect(parseSize('16 oz')).toEqual({ amount: 16, unit: 'oz' });
    expect(parseSize('1 gal')).toEqual({ amount: 128, unit: 'floz' });
    expect(parseSize('1/2 gal')).toEqual({ amount: 64, unit: 'floz' });
    expect(parseSize('2 lb')).toEqual({ amount: 32, unit: 'oz' });
    expect(parseSize('12 ct / 12 fl oz')).toEqual({ amount: 144, unit: 'floz' });
    expect(parseSize('64 loads')).toEqual({ amount: 64, unit: 'load' });
    expect(parseSize('family size')).toBeNull();
  });
});

describe('parser (F01 acceptance)', () => {
  it('splits the acceptance list into four editable lines', () => {
    const lines = parseList('2 Barilla spaghetti 16oz, Tide 64 loads, milk, chicken breast 2 lb');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ brand: 'Barilla', count: 2, description: 'spaghetti', size: { amount: 16, unit: 'oz' } });
    expect(lines[1]).toMatchObject({ brand: 'Tide', size: { amount: 64, unit: 'load' } });
    expect(lines[2]).toMatchObject({ brand: null, description: 'milk', scope: 'swappable' });
    expect(lines[3]).toMatchObject({ scope: 'keep', size: { amount: 32, unit: 'oz' } });
  });
  it('reads variants and dozen', () => {
    const l = parseLine('organic 2% milk 1 gal');
    expect(l.variants.sort()).toEqual(['2%', 'organic']);
    expect(parseLine('eggs dozen').size).toEqual({ amount: 12, unit: 'ct' });
  });
  it('marks unsupported goods', () => {
    expect(parseLine('Advil 50 ct').scope).toBe('unsupported');
  });
});

describe('engine (F04 acceptance)', () => {
  it('swaps a national brand for an equivalent store brand', () => {
    const base = prod('b', 'Barilla', 'Barilla Spaghetti', '16 oz', 229);
    const kroger = prod('k', 'Kroger', 'Kroger Spaghetti', '16 oz', 125);
    const r = computeLine(matched('2 Barilla spaghetti 16 oz', base, [kroger]), new Set(), prefs);
    expect(r.original!.cents).toBe(458);
    expect(r.chosen!.product.productId).toBe('k');
    expect(r.chosen!.packages).toBe(2);
    expect(r.swap).toMatchObject({ type: 'store-brand', savingCents: 208 });
  });

  it('a smaller pack cannot win by supplying less', () => {
    const base = prod('b', 'Tide', 'Tide Original Liquid Laundry Detergent', '64 loads', 1999);
    const small = prod('s', 'Tide', 'Tide Original Liquid Laundry Detergent', '32 loads', 1099);
    const r = computeLine(matched('Tide liquid laundry detergent 64 loads', base, [small]), new Set(), prefs);
    // 2 × 32 loads = $21.98 > $19.99 ⇒ keep original
    expect(r.swap).toBeNull();
    expect(r.chosen!.product.productId).toBe('b');
  });

  it('a bigger pack wins only when the total for the requested amount is lower', () => {
    const base = prod('b', 'Tide', 'Tide Original Liquid Laundry Detergent', '32 loads', 1199);
    const big = prod('g', 'Tide', 'Tide Original Liquid Laundry Detergent', '64 loads', 1749);
    const r = computeLine(matched('2 Tide liquid laundry detergent 32 loads', base, [big]), new Set(), prefs);
    expect(r.original!.cents).toBe(2398);
    expect(r.chosen!.packages).toBe(1);
    expect(r.swap).toMatchObject({ type: 'better-pack', savingCents: 649 });

    const r1 = computeLine(matched('Tide liquid laundry detergent 32 loads', base, [big]), new Set(), prefs);
    expect(r1.swap).toBeNull(); // one small pack is cheaper at checkout than one big pack
  });

  it('unknown units produce no swap', () => {
    const base = prod('b', 'Heinz', 'Heinz Tomato Ketchup', '32 oz', 449);
    const odd = prod('o', 'Kroger', 'Kroger Tomato Ketchup', 'family size', 199);
    expect(computeLine(matched('Heinz ketchup 32 oz', base, [odd]), new Set(), prefs).swap).toBeNull();
  });

  it('never changes the variant (2% milk never becomes skim)', () => {
    const base = prod('b', 'Horizon', 'Horizon Organic 2% Reduced Fat Milk', '1 gal', 699);
    const skim = prod('s', 'Simple Truth Organic', 'Simple Truth Organic Skim Milk', '1 gal', 449);
    const nonOrg = prod('n', 'Kroger', 'Kroger 2% Reduced Fat Milk', '1 gal', 329);
    const ok = prod('k', 'Simple Truth Organic', 'Simple Truth Organic 2% Reduced Fat Milk', '1 gal', 499);
    const r = computeLine(matched('Horizon organic 2% milk 1 gal', base, [skim, nonOrg, ok]), new Set(), prefs);
    expect(r.chosen!.product.productId).toBe('k');
  });

  it('uses a promo price only as the eligible price, and labels it', () => {
    const base = prod('b', 'Folgers', 'Folgers Classic Roast Ground Coffee', '25.9 oz', 1299, 999);
    const r = computeLine(matched('Folgers classic roast ground coffee 25.9 oz', base, []), new Set(), prefs);
    expect(r.original).toMatchObject({ cents: 999, usedPromo: true });
  });

  it('keeps fresh goods as is and excludes unpriced lines from both totals', () => {
    const chicken = prod('c', 'Kroger', 'Boneless Skinless Chicken Breast', '1 lb', 399);
    const lines = [
      matched('chicken breast 2 lb', chicken, [], 'keep'),
      matched('Heinz ketchup 32 oz', prod('h', 'Heinz', 'Heinz Tomato Ketchup', '32 oz', null), []),
    ];
    const c = compare(lines, new Set(), prefs, meta);
    expect(c.originalCents).toBe(798);
    expect(c.chosenCents).toBe(798);
    expect(c.pricedCount).toBe(1);
    expect(c.totalCount).toBe(2);
  });
});

describe('flavor protection: a different flavor is a different product', () => {
  const swapTo = (raw: string, base: Product, candidate: Product) => computeLine(matched(raw, base, [candidate]), new Set(), prefs).swap;

  it('Heinz Tomato Ketchup is not replaced by Jalapeño Ketchup, but is by plain store-brand ketchup', () => {
    const base = prod('h', 'Heinz', 'Heinz Tomato Ketchup', '32 oz', 449);
    expect(swapTo('Heinz ketchup 32 oz', base, prod('j', 'Kroger', 'Kroger Jalapeño Ketchup', '32 oz', 199))).toBeNull();
    expect(swapTo('Heinz ketchup 32 oz', base, prod('j2', 'Kroger', 'Kroger Jalapeno Ketchup', '32 oz', 199))).toBeNull();
    expect(swapTo('Heinz ketchup 32 oz', base, prod('k', 'Kroger', 'Kroger Tomato Ketchup', '32 oz', 219))).toMatchObject({ type: 'store-brand' });
  });

  it('Honey Nut Cheerios are not replaced by a chocolate cereal, but are by Kroger Honey Nut', () => {
    const base = prod('c', 'Cheerios', 'Honey Nut Cheerios Cereal', '15.4 oz', 549);
    expect(swapTo('Honey Nut Cheerios 15.4 oz', base, prod('x', 'Kroger', 'Kroger Chocolate Toasted Oats Cereal', '15.4 oz', 279))).toBeNull();
    expect(swapTo('Honey Nut Cheerios 15.4 oz', base, prod('p', 'Kroger', 'Kroger Plain Toasted Oats Cereal', '15.4 oz', 279))).toBeNull();
    expect(swapTo('Honey Nut Cheerios 15.4 oz', base, prod('k', 'Kroger', 'Kroger Honey Nut Toasted Oats Cereal', '15.4 oz', 279))).toMatchObject({ type: 'store-brand' });
  });

  it('Ragu Traditional is not replaced by a Garlic sauce', () => {
    const base = prod('r', 'Ragu', 'Ragu Traditional Pasta Sauce', '24 oz', 299);
    expect(swapTo('Ragu traditional pasta sauce 24 oz', base, prod('g', 'Kroger', 'Kroger Roasted Garlic Pasta Sauce', '24 oz', 179))).toBeNull();
    expect(swapTo('Ragu traditional pasta sauce 24 oz', base, prod('k', 'Kroger', 'Kroger Traditional Pasta Sauce', '24 oz', 179))).toMatchObject({ type: 'store-brand' });
  });

  it('plain creamy peanut butter is not replaced by Honey Roasted', () => {
    const base = prod('s', 'Skippy', 'Skippy Creamy Peanut Butter', '16.3 oz', 349);
    expect(swapTo('Skippy creamy peanut butter 16.3 oz', base, prod('h', 'Kroger', 'Kroger Honey Roasted Creamy Peanut Butter', '16.3 oz', 199))).toBeNull();
    expect(swapTo('Skippy creamy peanut butter 16.3 oz', base, prod('k', 'Kroger', 'Kroger Creamy Peanut Butter', '16.3 oz', 199))).toMatchObject({ type: 'store-brand' });
  });

  it('a flavored original keeps its flavor, and "light" is a different product', () => {
    const spicy = prod('s', 'Heinz', 'Heinz Spicy Tomato Ketchup', '32 oz', 449);
    expect(swapTo('Heinz spicy ketchup 32 oz', spicy, prod('p', 'Kroger', 'Kroger Tomato Ketchup', '32 oz', 219))).toBeNull();
    const mayo = prod('m', "Hellmann's", "Hellmann's Real Mayonnaise", '30 oz', 649);
    expect(swapTo("Hellmann's mayonnaise 30 oz", mayo, prod('l', 'Kroger', 'Kroger Light Mayonnaise', '30 oz', 349))).toBeNull();
  });

  it('flavor words match whole words only ("hotdog" is not "hot")', () => {
    expect(coreTokens('Hotdog Buns')).toContain('hotdog');
    expect(variantsIn('Jalapeño Ketchup')).toEqual(['jalapeno']);
    expect(variantsIn('Honey Nut Cheerios')).toEqual(['honey']);
    expect(variantsIn('Kroger Pineapple Juice')).toEqual([]);
  });
});

describe('locks (F05 acceptance)', () => {
  const eggs = () => matched("Eggland's Best large eggs 12 ct", prod('e', "Eggland's Best", "Eggland's Best Large Eggs", '12 ct', 449), [prod('k', 'Kroger', 'Kroger Large Eggs', '12 ct', 329)]);
  const oats = () => matched('Quaker old fashioned oats 42 oz', prod('q', 'Quaker', 'Quaker Old Fashioned Oats', '42 oz', 549), [prod('ko', 'Kroger', 'Kroger Old Fashioned Oats', '42 oz', 399)]);

  it('locking a $1.20 swap lowers the headline saving by exactly $1.20', () => {
    const open = compare([eggs(), oats()], new Set(), prefs, meta);
    const locked = compare([eggs(), oats()], new Set(['p:e']), prefs, meta);
    expect(open.savingCents - locked.savingCents).toBe(120);
    const row = locked.lines.find(l => l.lockKey === 'p:e')!;
    expect(row.locked).toBe(true);
    expect(row.lockedSwap!.savingCents).toBe(120);
  });

  it('a basket with no valid swaps shows $0', () => {
    const c = compare([matched('Heinz ketchup 32 oz', prod('h', 'Heinz', 'Heinz Tomato Ketchup', '32 oz', 449), [])], new Set(), prefs, meta);
    expect(c.savingCents).toBe(0);
  });

  it('brand locks from preferences behave like a lock', () => {
    const c = compare([eggs()], new Set(), { brandLocks: ["eggland's best"] }, meta);
    expect(c.savingCents).toBe(0);
  });
});
