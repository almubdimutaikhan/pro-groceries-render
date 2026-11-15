/** Normalised base units. Mass → oz, volume → fl oz, everything else counted. */
export type BaseUnit = 'oz' | 'floz' | 'ct' | 'load' | 'roll' | 'sqft';

export interface Qty {
  amount: number;
  unit: BaseUnit;
}

export type LineScope = 'swappable' | 'keep' | 'unsupported';

/** One parsed line of the shopper's list. Never contains a price. */
export interface ListLine {
  id: string;
  raw: string;
  description: string;      // product words without brand/size, e.g. "spaghetti"
  brand: string | null;     // only when the shopper stated one
  variants: string[];       // e.g. ["2%"], ["organic","decaf"]
  count: number;            // packages asked for ("2 Barilla…") – default 1
  size: Qty | null;         // size stated on the line ("16 oz", "2 lb", "dozen")
  scope: LineScope;
}

export type PriceSource = 'kroger' | 'demo';

export interface Product {
  productId: string;
  upc?: string;
  brand: string;
  description: string;
  categories: string[];
  sizeLabel: string;              // as returned, e.g. "16 oz"
  pack: Qty | null;               // parsed from sizeLabel; null = unknown
  regularCents: number | null;    // null = unpriced
  promoCents: number | null;
  promoNeedsCard: boolean;        // Kroger promos usually need the free loyalty card
  storeId: string;
  fetchedAt: string;              // ISO time this price was observed
  image?: string;
  source: PriceSource;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;          // two-letter US state code
  chain: string;
  source: PriceSource;
}

export type MatchStatus = 'confirmed' | 'ask' | 'notfound' | 'keep' | 'unsupported';

/** A list line after product lookup at the chosen store. */
export interface MatchedLine {
  line: ListLine;
  status: MatchStatus;
  baseline: Product | null;   // the product the shopper usually buys
  options: Product[];         // up to 3 choices when status = ask
  candidates: Product[];      // everything fetched for this line (swap pool)
}

export type SwapType = 'store-brand' | 'better-pack' | 'promo';

export interface Pick {
  product: Product;   // carries storeId, fetchedAt and source: the "Price details" shown to the shopper
  packages: number;
  cents: number;
  usedPromo: boolean;
}

export interface LineResult {
  lineId: string;
  lockKey: string;
  label: string;
  status: MatchStatus;
  original: Pick | null;
  chosen: Pick | null;
  swap: { type: SwapType; savingCents: number; reason: string } | null;
  locked: boolean;
  /** The swap that would apply if the line were unlocked (so "Keep original" can be undone). */
  lockedSwap: { product: Product; savingCents: number } | null;
}

export interface Comparison {
  id: string;
  storeId: string;
  storeName: string;
  fetchStartedAt: string;
  fetchEndedAt: string;
  lines: LineResult[];
  originalCents: number;
  chosenCents: number;
  savingCents: number;
  pricedCount: number;
  totalCount: number;
  source: PriceSource;
}

export interface Prefs {
  brandLocks: string[];   // brands never swapped, lower-case
}
