/** Word lists the deterministic parser and engine share. Lower-case. */

export const KROGER_BRANDS = [
  'kroger', 'private selection', 'simple truth organic', 'simple truth', 'heritage farm',
  'smart way', 'big k', 'comforts', 'abound', 'luvsome', 'pet pride', 'home sense', 'psst',
];

export function isStoreBrand(brand: string): boolean {
  const b = brand.toLowerCase().trim();
  return KROGER_BRANDS.some(k => b === k || b.startsWith(k + ' '));
}

export const NATIONAL_BRANDS = [
  'barilla', 'tide', 'gain', 'cheerios', 'folgers', 'starbucks', 'maxwell house', 'dunkin',
  'heinz', 'kraft', 'skippy', 'jif', 'charmin', 'bounty', 'dawn', 'cascade', 'quaker', "kellogg's", 'kelloggs',
  'chobani', 'yoplait', 'dannon', 'horizon', 'fairlife', 'philadelphia', 'oreo', 'ritz', 'goldfish', 'pringles',
  "lay's", 'lays', 'tostitos', 'coca-cola', 'coke', 'pepsi', 'tropicana', 'simply', 'minute maid', "hellmann's",
  'hellmanns', "campbell's", 'campbells', 'ragu', 'prego', "ben's original", 'uncle bens', 'land o lakes',
  "eggland's best", 'egglands best', 'nature valley', 'kind', 'clif', 'gatorade', "bush's", 'bushs', 'del monte',
  "hunt's", 'hunts', 'lipton', 'glad', 'hefty', 'ziploc', 'scott', 'kleenex', 'clorox', 'lysol',
  'seventh generation', 'purina', 'nutella', 'cheez-it', 'general mills', 'post', 'tillamook', 'sargento',
  'kerrygold', 'blue diamond', 'silk', 'oatly', 'annie\'s', 'annies', 'kraft heinz', 'french\'s', 'frenchs',
  'mccormick', 'domino', 'gold medal', 'king arthur', 'crisco', 'pam', 'bertolli', 'colavita', 'mueller\'s',
  'muellers', 'ronzoni', 'de cecco', 'rao\'s', 'raos', 'classico', 'progresso', 'swanson', 'stouffer\'s',
  'stouffers', 'digiorno', 'eggo', 'pop-tarts', 'nabisco', 'triscuit', 'wheat thins', 'kix', 'life',
  'cinnamon toast crunch', 'frosted flakes', 'raisin bran', 'special k', 'all', 'arm & hammer', 'downy', 'bounce',
  'cottonelle', 'angel soft', 'viva', 'reynolds', 'clorox', 'palmolive', 'colgate', 'crest',
].sort((a, b) => b.length - a.length);

/** Variant groups. A swap must keep the same value in every group (absence counts as a value). */
export const VARIANT_GROUPS: Record<string, string[]> = {
  fat: ['whole', '2%', '1%', 'skim', 'fat free', 'nonfat'],
  organic: ['organic'],
  gluten: ['gluten free', 'gluten-free'],
  caffeine: ['decaf', 'decaffeinated'],
  lactose: ['lactose free', 'lactose-free'],
  sodium: ['low sodium', 'no salt added', 'unsalted', 'reduced sodium'],
  sugar: ['sugar free', 'no sugar added', 'zero sugar', 'diet', 'unsweetened'],
  scent: ['free & clear', 'free and clear', 'unscented', 'original scent', 'lavender', 'spring', 'fresh scent', 'lemon'],
  roast: ['dark roast', 'medium roast', 'light roast', 'breakfast blend'],
  form: ['ground', 'whole bean', 'k-cup', 'pods'],
  texture: ['creamy', 'crunchy', 'chunky', 'smooth'],
  grain: ['whole wheat', 'whole grain', 'white', 'brown', 'jasmine', 'basmati'],
  egg: ['large', 'extra large', 'jumbo', 'medium', 'cage free', 'free range', 'brown eggs'],
  style: ['thin', 'angel hair', 'penne', 'rotini', 'elbows', 'fettuccine', 'linguine', 'spaghetti'],
  // A different flavor is a different product. "Ketchup" never becomes jalapeño ketchup, and
  // honey nut cereal never becomes chocolate cereal. No flavor at all counts as a value too.
  // Deliberately not listed: "peanut butter", "garlic bread" style product names. As a flavor word,
  // "peanut butter" would be stripped from the product type of every peanut butter line.
  flavor: [
    'jalapeño', 'jalapeno', 'spicy', 'hot', 'sriracha', 'chipotle', 'honey', 'cinnamon', 'chocolate', 'vanilla',
    'strawberry', 'blueberry', 'raspberry', 'cherry', 'apple', 'orange', 'maple', 'garlic', 'bbq', 'ranch',
    'buffalo', 'zesty', 'sweet', 'salted caramel', 'caramel', 'pumpkin spice', 'mint',
  ],
  // "Light" and "lite" products are reformulated. Reduced-fat milk is handled by the fat group above.
  lite: ['light', 'lite'],
};

const NORMALISE: Record<string, string> = {
  'gluten-free': 'gluten free', 'lactose-free': 'lactose free', decaffeinated: 'decaf', nonfat: 'skim',
  'fat free': 'skim', 'free and clear': 'free & clear', 'jalapeño': 'jalapeno', lite: 'light',
};

export function normaliseVariant(v: string): string {
  return NORMALISE[v] ?? v;
}

/** Every variant term, longest first so "whole wheat" beats "whole", with a whole-word pattern each. */
const VARIANT_PATTERNS = Object.values(VARIANT_GROUPS).flat()
  .sort((a, b) => b.length - a.length)
  .map(v => ({ v, re: new RegExp(`(^|[^a-z0-9])${v.replace(/[.*+?^${}()|[\]\\%&]/g, '\\$&')}(?=[^a-z0-9]|$)`, 'g') }));

/** Find every variant term in a text. Longest terms first so "whole wheat" beats "whole". */
export function variantsIn(text: string): string[] {
  let rest = ` ${text.normalize('NFC').toLowerCase().replace(/[(),]/g, ' ')} `;
  const found: string[] = [];
  for (const { v, re } of VARIANT_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(rest)) {
      found.push(normaliseVariant(v));
      re.lastIndex = 0;
      rest = rest.replace(re, ' ');
    }
  }
  return [...new Set(found)];
}

export function groupOf(variant: string): string | null {
  const v = normaliseVariant(variant);
  for (const [g, list] of Object.entries(VARIANT_GROUPS)) if (list.map(normaliseVariant).includes(v)) return g;
  return null;
}

/** Fresh goods sold by weight: priced if possible, never swapped. */
export const KEEP_AS_IS = [
  'banana', 'apple', 'avocado', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'broccoli', 'spinach',
  'berries', 'strawberries', 'blueberries', 'lemon', 'lime', 'grapes', 'cucumber', 'bell pepper', 'zucchini',
  'garlic', 'celery', 'mushroom', 'peach', 'pear', 'kale', 'cilantro', 'parsley',
  'chicken breast', 'chicken thigh', 'ground beef', 'ground turkey', 'steak', 'pork chop', 'salmon', 'tilapia',
  'shrimp', 'deli', 'rotisserie', 'bakery', 'fresh bread', 'baguette',
];

export const UNSUPPORTED = [
  'ibuprofen', 'tylenol', 'advil', 'acetaminophen', 'aspirin', 'medicine', 'vitamin', 'beer', 'wine', 'vodka',
  'whiskey', 'tequila', 'rum', 'seltzer hard', 'cigarette', 'tobacco', 'vape', 'gift card', 'lottery',
];

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'with', 'for', 'our', 'my', 'usual', 'some', 'pack', 'box', 'bag', 'bottle',
  'jar', 'can', 'cans', 'family', 'size', 'value', 'brand', 'original', 'classic', 'regular', 'fresh', 'premium',
  'x', 'pk', 'ct', 'count', 'oz', 'lb', 'lbs', 'gal', 'gallon', 'fl', 'each', 'container', 'carton', 'tub',
]);

/** Core noun tokens of a description: lower-case words minus stop words, variants and numbers. Plurals folded. */
const PASTA_SHAPES = new Set(['spaghetti', 'penne', 'rotini', 'linguine', 'fettuccine', 'elbows']);

export function coreTokens(text: string): string[] {
  let t = ` ${text.normalize('NFC').toLowerCase()} `;
  for (const { v, re } of VARIANT_PATTERNS) {
    if (PASTA_SHAPES.has(v)) continue;
    re.lastIndex = 0;
    t = t.replace(re, ' ');
  }
  return [...new Set(
    t.replace(/[^a-z\s'-]/g, ' ').split(/\s+/)
      .map(w => w.replace(/'s$/, '').replace(/(?<=[a-z]{3})(es|s)$/, ''))
      .filter(w => w.length > 1 && !STOPWORDS.has(w)),
  )];
}
