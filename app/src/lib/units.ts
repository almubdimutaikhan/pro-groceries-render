import type { BaseUnit, Qty } from './types';

const UNIT_TABLE: Array<[RegExp, BaseUnit, number]> = [
  [/^(fl\.?\s?oz|fluid\s?ounces?)$/, 'floz', 1],
  [/^(oz|ounces?)$/, 'oz', 1],
  [/^(lbs?|pounds?)$/, 'oz', 16],
  [/^(kg|kilograms?)$/, 'oz', 35.274],
  [/^(g|grams?)$/, 'oz', 0.035274],
  [/^(gal|gallons?)$/, 'floz', 128],
  [/^(qt|quarts?)$/, 'floz', 32],
  [/^(pt|pints?)$/, 'floz', 16],
  [/^(l|liters?|litres?|ltr)$/, 'floz', 33.814],
  [/^(ml|milliliters?|millilitres?)$/, 'floz', 0.033814],
  [/^(ct|count|pk|pack|packs|pcs?|pieces?|each|ea|eggs?|bags?|bars?|cans?|bottles?|pods?|k-?cups?)$/, 'ct', 1],
  [/^(loads?)$/, 'load', 1],
  [/^(rolls?|mega\s?rolls?|double\s?rolls?)$/, 'roll', 1],
  [/^(sq\.?\s?ft)$/, 'sqft', 1],
];

export function unitOf(token: string): [BaseUnit, number] | null {
  const t = token.toLowerCase().replace(/\.$/, '').trim();
  for (const [re, unit, factor] of UNIT_TABLE) if (re.test(t)) return [unit, factor];
  return null;
}

function num(s: string): number {
  s = s.trim();
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : NaN;
  }
  return Number(s);
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)`;
const UNIT = String.raw`(fl\.?\s?oz|fluid\s?ounces?|oz|ounces?|lbs?|pounds?|kg|kilograms?|g|grams?|gal|gallons?|qt|quarts?|pt|pints?|l|liters?|litres?|ml|ct|count|pk|pack|loads?|rolls?|mega\s?rolls?|double\s?rolls?|sq\.?\s?ft|eggs?|pods?|k-?cups?|cans?|bottles?|bars?|bags?)`;

/**
 * Parse a retailer size label into a base quantity.
 * "16 oz" → 16 oz · "1/2 gal" → 64 floz · "12 ct / 12 fl oz" → 144 floz · "6 pk / 16.9 fl oz" → 101.4 floz
 * Returns null when the size cannot be understood – the engine then refuses to swap.
 */
export function parseSize(label: string | null | undefined): Qty | null {
  if (!label) return null;
  const s = label.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^dozen$|^1 dozen$/.test(s)) return { amount: 12, unit: 'ct' };

  // multipack: "12 ct / 12 fl oz", "6 pk 16.9 fl oz", "12 x 12 fl oz"
  const multi = new RegExp(String.raw`^${NUM}\s*(?:ct|pk|pack|count|x)\s*(?:\/|x|of)?\s*${NUM}\s*${UNIT}\b`).exec(s);
  if (multi) {
    const n = num(multi[1]);
    const u = unitOf(multi[3]);
    if (u && u[0] !== 'ct') return { amount: round(n * num(multi[2]) * u[1]), unit: u[0] };
  }
  const single = new RegExp(String.raw`${NUM}\s*${UNIT}\b`).exec(s);
  if (single) {
    const u = unitOf(single[2]);
    const n = num(single[1]);
    if (u && Number.isFinite(n) && n > 0) return { amount: round(n * u[1]), unit: u[0] };
  }
  return null;
}

/** Find a size inside free text (a list line). Returns the match so it can be cut out of the description. */
export function findSize(text: string): { qty: Qty; match: string } | null {
  const s = text.toLowerCase();
  const dz = /\b(\d+\s*)?dozen\b/.exec(s);
  if (dz) return { qty: { amount: 12 * (dz[1] ? Number(dz[1]) : 1), unit: 'ct' }, match: dz[0] };
  const re = new RegExp(String.raw`${NUM}\s*${UNIT}\b`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const q = parseSize(m[0]);
  return q ? { qty: q, match: m[0] } : null;
}

export function sameDimension(a: Qty | null, b: Qty | null): boolean {
  return !!a && !!b && a.unit === b.unit;
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const LABEL: Record<BaseUnit, string> = { oz: 'oz', floz: 'fl oz', ct: 'ct', load: 'loads', roll: 'rolls', sqft: 'sq ft' };

export function formatQty(q: Qty | null): string {
  if (!q) return '';
  if (q.unit === 'oz' && q.amount >= 32 && q.amount % 16 === 0) return `${q.amount / 16} lb`;
  if (q.unit === 'floz' && q.amount >= 128 && q.amount % 128 === 0) return `${q.amount / 128} gal`;
  return `${+q.amount.toFixed(2)} ${LABEL[q.unit]}`;
}

/** Price per unit, e.g. "13.1¢/oz". */
export function unitPriceLabel(cents: number, pack: Qty | null): string {
  if (!pack || pack.amount <= 0) return '';
  const per = cents / pack.amount;
  const unit = LABEL[pack.unit].replace('loads', 'load').replace('rolls', 'roll');
  return per >= 100 ? `$${(per / 100).toFixed(2)}/${unit}` : `${per.toFixed(1)}¢/${unit}`;
}
