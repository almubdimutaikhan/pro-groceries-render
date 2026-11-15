import type { ListLine } from './types';
import { findSize } from './units';
import { KEEP_AS_IS, NATIONAL_BRANDS, UNSUPPORTED, KROGER_BRANDS, variantsIn } from './vocab';

let seq = 0;
export const newId = (p = 'l') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Split pasted text into item strings: new lines, bullets, commas and semicolons. Keeps "1,000" intact. */
export function splitItems(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n|;|,(?!\d{3})|•|·/)
    .map(s => s.replace(/^\s*(?:[-*–]|\d+[.)])\s+/, '').replace(/^\s*\[\s?[x ]?\s?\]\s*/i, '').trim())
    .filter(s => s.length > 1 && /[a-z]/i.test(s));
}

function title(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic list parser. Used when no OpenRouter key is set, and as the validator/fallback when it is.
 * Never produces a price, product ID or total.
 */
export function parseLine(raw: string): ListLine {
  let text = ` ${raw.trim()} `;
  const lower = text.toLowerCase();

  // count: "2 Barilla…", "2x milk", "milk x2"
  let count = 1;
  const lead = /^\s*(\d{1,2})\s*(?:x\s+|×\s*)?(?=[a-z])/i.exec(text);
  const trail = /\s(?:x|×)\s?(\d{1,2})\s*$/i.exec(text);
  const size = findSize(text);
  if (lead && !(size && text.trim().toLowerCase().startsWith(size.match.toLowerCase()))) {
    count = Math.max(1, Number(lead[1]));
    text = text.replace(lead[0], ' ');
  } else if (trail) {
    count = Math.max(1, Number(trail[1]));
    text = text.replace(trail[0], ' ');
  }

  // size
  if (size) text = text.replace(new RegExp(size.match.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i'), ' ');

  // brand (national or Kroger family)
  let brand: string | null = null;
  for (const b of [...KROGER_BRANDS, ...NATIONAL_BRANDS]) {
    const re = new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\&']/g, '\\$&')}(?=[^a-z]|$)`, 'i');
    if (re.test(text)) {
      brand = b.replace(/\b\w/g, c => c.toUpperCase()).replace(/'S\b/, "'s");
      text = text.replace(re, ' ');
      break;
    }
  }

  const variants = variantsIn(lower);
  const description = title(text.replace(/\s{2,}/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '')) || title(raw);

  const scope = UNSUPPORTED.some(w => lower.includes(w))
    ? 'unsupported'
    : KEEP_AS_IS.some(w => lower.includes(w)) && !brand && !/juice|sauce|jam|jelly|chips|frozen|canned|dried|bread crumbs|broth|soup/.test(lower)
      ? 'keep'
      : 'swappable';

  return { id: newId(), raw: raw.trim(), description, brand, variants, count, size: size?.qty ?? null, scope };
}

export function parseList(text: string): ListLine[] {
  return splitItems(text).map(parseLine);
}

/** Realistic branded sample basket – names and sizes only, never prices (feature spec F01). */
export const SAMPLE_LIST = [
  '2 Barilla spaghetti 16 oz',
  'Tide liquid detergent 64 loads',
  'Horizon organic 2% milk 1 gal',
  "Eggland's Best large eggs 12 ct",
  'Honey Nut Cheerios cereal 15.4 oz',
  'Folgers classic roast ground coffee 25.9 oz',
  'Heinz ketchup 32 oz',
  'Skippy creamy peanut butter 16.3 oz',
  'Bounty paper towels 6 rolls',
  'Chobani plain greek yogurt 32 oz',
  'Quaker old fashioned oats 42 oz',
  'Ragu traditional pasta sauce 24 oz',
  'Dawn dish soap 19.4 fl oz',
  'chicken breast 2 lb',
  'bananas',
].join('\n');
