/**
 * DEMO CATALOG: interface development and offline rehearsal only.
 * These prices are illustrative, NOT live Kroger prices. Every screen that uses them shows a
 * "Demo prices" label (driven by each comparison's own `source`), and they are never used once
 * live Kroger prices are connected. There is exactly one demo chain: Kroger. No other retailer's
 * prices are modelled or derived here.
 */
import type { Product, Store } from '../lib/types';
import { parseSize } from '../lib/units';
import { coreTokens, variantsIn } from '../lib/vocab';

export const DEMO_STORES: Store[] = [
  { id: 'demo-downtown', name: 'Kroger · Downtown (demo)', address: 'Cincinnati, OH 45202', city: 'Cincinnati', state: 'OH', chain: 'KROGER', source: 'demo' },
  { id: 'demo-corryville', name: 'Kroger · Corryville (demo)', address: 'Cincinnati, OH 45219', city: 'Cincinnati', state: 'OH', chain: 'KROGER', source: 'demo' },
  { id: 'demo-hyde-park', name: 'Kroger · Hyde Park (demo)', address: 'Cincinnati, OH 45208', city: 'Cincinnati', state: 'OH', chain: 'KROGER', source: 'demo' },
];

type Row = [id: string, brand: string, description: string, size: string, regular: number, promo: number | null, category: string];

const ROWS: Row[] = [
  // pasta
  ['d-bar-spag', 'Barilla', 'Barilla Spaghetti Pasta', '16 oz', 229, null, 'Pasta'],
  ['d-kr-spag', 'Kroger', 'Kroger Spaghetti Pasta', '16 oz', 125, null, 'Pasta'],
  ['d-pts-spag', 'Private Selection', 'Private Selection Bronze Cut Spaghetti Pasta', '16 oz', 279, null, 'Pasta'],
  ['d-bar-penne', 'Barilla', 'Barilla Penne Pasta', '16 oz', 229, null, 'Pasta'],
  // detergent
  ['d-tide-64', 'Tide', 'Tide Original Liquid Laundry Detergent', '64 loads', 1999, 1799, 'Laundry'],
  ['d-tide-32', 'Tide', 'Tide Original Liquid Laundry Detergent', '32 loads', 1199, null, 'Laundry'],
  ['d-kr-det-96', 'Kroger', 'Kroger Original Liquid Laundry Detergent', '96 loads', 1299, null, 'Laundry'],
  ['d-kr-det-64', 'Kroger', 'Kroger Original Liquid Laundry Detergent', '64 loads', 999, null, 'Laundry'],
  ['d-gain-64', 'Gain', 'Gain Original Liquid Laundry Detergent', '64 loads', 1599, null, 'Laundry'],
  // milk
  ['d-hor-2', 'Horizon', 'Horizon Organic 2% Reduced Fat Milk', '1 gal', 749, null, 'Dairy'],
  ['d-sto-2', 'Simple Truth Organic', 'Simple Truth Organic 2% Reduced Fat Milk', '1 gal', 549, null, 'Dairy'],
  ['d-sto-skim', 'Simple Truth Organic', 'Simple Truth Organic Skim Milk', '1 gal', 549, null, 'Dairy'],
  ['d-kr-2', 'Kroger', 'Kroger 2% Reduced Fat Milk', '1 gal', 299, null, 'Dairy'],
  ['d-kr-whole', 'Kroger', 'Kroger Whole Milk', '1 gal', 319, null, 'Dairy'],
  ['d-fair-2', 'Fairlife', 'Fairlife 2% Reduced Fat Ultra-Filtered Milk', '52 fl oz', 479, 429, 'Dairy'],
  // eggs
  ['d-eb-12', "Eggland's Best", "Eggland's Best Large Eggs", '12 ct', 449, null, 'Eggs'],
  ['d-kr-12', 'Kroger', 'Kroger Large Eggs', '12 ct', 329, null, 'Eggs'],
  ['d-kr-18', 'Kroger', 'Kroger Large Eggs', '18 ct', 469, null, 'Eggs'],
  ['d-hf-12', 'Heritage Farm', 'Heritage Farm Large Eggs', '12 ct', 299, null, 'Eggs'],
  // cereal
  ['d-hnc', 'Cheerios', 'Honey Nut Cheerios Cereal', '15.4 oz', 549, 449, 'Cereal'],
  ['d-kr-hno', 'Kroger', 'Kroger Honey Nut Toasted Oats Cereal', '15.4 oz', 279, null, 'Cereal'],
  // coffee
  ['d-folg', 'Folgers', 'Folgers Classic Roast Medium Roast Ground Coffee', '25.9 oz', 1399, null, 'Coffee'],
  ['d-kr-cof', 'Kroger', 'Kroger Classic Roast Medium Roast Ground Coffee', '30.5 oz', 949, null, 'Coffee'],
  ['d-folg-dec', 'Folgers', 'Folgers Classic Roast Decaf Medium Roast Ground Coffee', '22.6 oz', 1399, null, 'Coffee'],
  ['d-sbx-pike', 'Starbucks', 'Starbucks Pike Place Medium Roast Ground Coffee', '12 oz', 1099, null, 'Coffee'],
  // ketchup
  ['d-heinz-32', 'Heinz', 'Heinz Tomato Ketchup', '32 oz', 449, null, 'Condiments'],
  ['d-kr-ket-32', 'Kroger', 'Kroger Tomato Ketchup', '32 oz', 219, null, 'Condiments'],
  ['d-heinz-38', 'Heinz', 'Heinz Tomato Ketchup', '38 oz', 549, 449, 'Condiments'],
  // peanut butter
  ['d-skip', 'Skippy', 'Skippy Creamy Peanut Butter', '16.3 oz', 349, null, 'Spreads'],
  ['d-kr-pb', 'Kroger', 'Kroger Creamy Peanut Butter', '16.3 oz', 199, null, 'Spreads'],
  ['d-kr-pb-cr', 'Kroger', 'Kroger Crunchy Peanut Butter', '16.3 oz', 199, null, 'Spreads'],
  // paper towels
  ['d-bounty-6', 'Bounty', 'Bounty Select-A-Size Paper Towels', '6 rolls', 1599, null, 'Paper'],
  ['d-kr-pt-6', 'Kroger', 'Kroger Select-A-Size Paper Towels', '6 rolls', 999, null, 'Paper'],
  ['d-kr-pt-12', 'Kroger', 'Kroger Select-A-Size Paper Towels', '12 rolls', 1899, null, 'Paper'],
  // yogurt
  ['d-chob-32', 'Chobani', 'Chobani Plain Greek Yogurt', '32 oz', 649, 549, 'Dairy'],
  ['d-kr-gy-32', 'Kroger', 'Kroger Plain Greek Yogurt', '32 oz', 449, null, 'Dairy'],
  ['d-kr-gy-van', 'Kroger', 'Kroger Vanilla Greek Yogurt', '32 oz', 449, null, 'Dairy'],
  // oats
  ['d-quak-42', 'Quaker', 'Quaker Old Fashioned Oats', '42 oz', 649, null, 'Breakfast'],
  ['d-kr-oats-42', 'Kroger', 'Kroger Old Fashioned Oats', '42 oz', 449, null, 'Breakfast'],
  // pasta sauce
  ['d-ragu', 'Ragu', 'Ragu Traditional Pasta Sauce', '24 oz', 299, 250, 'Pasta Sauce'],
  ['d-kr-sauce', 'Kroger', 'Kroger Traditional Pasta Sauce', '24 oz', 179, null, 'Pasta Sauce'],
  ['d-raos', "Rao's", "Rao's Homemade Marinara Sauce", '24 oz', 899, null, 'Pasta Sauce'],
  // dish soap
  ['d-dawn', 'Dawn', 'Dawn Ultra Original Scent Dish Soap', '19.4 fl oz', 399, null, 'Cleaning'],
  ['d-kr-dish', 'Kroger', 'Kroger Ultra Original Scent Dish Soap', '24 fl oz', 249, null, 'Cleaning'],
  // fresh – kept as is
  ['d-chicken', 'Kroger', 'Kroger Boneless Skinless Chicken Breast', '1 lb', 399, null, 'Meat'],
  ['d-banana', 'Kroger', 'Banana', '1 lb', 59, null, 'Produce'],
  // common unbranded asks
  ['d-kr-bread', 'Kroger', 'Kroger Classic White Bread', '20 oz', 179, null, 'Bakery'],
  ['d-wonder', 'Wonder', 'Wonder Classic White Bread', '20 oz', 349, null, 'Bakery'],
  ['d-kr-butter', 'Kroger', 'Kroger Salted Butter Sticks', '16 oz', 449, null, 'Dairy'],
  ['d-lol-butter', 'Land O Lakes', 'Land O Lakes Salted Butter Sticks', '16 oz', 629, 549, 'Dairy'],
  ['d-kr-rice', 'Kroger', 'Kroger Long Grain White Rice', '5 lb', 449, null, 'Rice'],
  ['d-bens-rice', "Ben's Original", "Ben's Original Long Grain White Rice", '2 lb', 449, null, 'Rice'],
  ['d-kr-cheddar', 'Kroger', 'Kroger Mild Cheddar Shredded Cheese', '8 oz', 229, null, 'Dairy'],
  ['d-sarg-cheddar', 'Sargento', 'Sargento Mild Cheddar Shredded Cheese', '8 oz', 449, 399, 'Dairy'],
];

export const DEMO_PRICED_AT = '2026-11-14T14:30:00.000Z';

export function demoProducts(storeId: string): Product[] {
  // Small, deterministic price variation per Kroger demo store so changing store visibly reprices.
  const bump = storeId === 'demo-corryville' ? 1.04 : storeId === 'demo-hyde-park' ? 1.08 : 1;
  return ROWS.map(([id, brand, description, size, regular, promo, category]) => ({
    productId: id,
    brand,
    description,
    categories: [category],
    sizeLabel: size,
    pack: parseSize(size),
    regularCents: Math.round(regular * bump),
    promoCents: promo == null ? null : Math.round(promo * bump),
    promoNeedsCard: true, // Kroger sale prices usually need the free loyalty card
    storeId,
    fetchedAt: DEMO_PRICED_AT,
    source: 'demo' as const,
  }));
}

/** Same contract as the Kroger product search: a term in, matching products out. */
export async function demoSearch(term: string, storeId: string): Promise<Product[]> {
  await new Promise(r => setTimeout(r, 120 + Math.random() * 180));
  const want = coreTokens(term);
  const wantVariants = variantsIn(term);
  const all = demoProducts(storeId);
  const scored = all
    .map(p => {
      const have = new Set([...coreTokens(p.description), ...coreTokens(p.brand)]);
      const hits = want.filter(t => have.has(t)).length;
      const vHits = wantVariants.filter(v => variantsIn(p.description).includes(v)).length;
      return { p, score: hits * 2 + vHits };
    })
    .filter(x => x.score > 0 && want.some(t => coreTokens(x.p.description).includes(t)))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map(x => x.p);
}

export async function demoStores(): Promise<Store[]> {
  await new Promise(r => setTimeout(r, 250));
  return DEMO_STORES;
}
