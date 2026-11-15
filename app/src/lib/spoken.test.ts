import { describe, expect, it } from 'vitest';
import { parseLine, parseList, PLACEHOLDER_LIST, splitItems } from './parser';
import { parseSize } from './units';

describe('lists that were spoken, not typed', () => {
  it('reads "16-ounce" and "100-count" as sizes', () => {
    expect(parseSize('16-ounce')).toEqual({ amount: 16, unit: 'oz' });
    expect(parseSize('100-count')).toEqual({ amount: 100, unit: 'ct' });
    expect(parseLine('Heinz Ketchup 32-ounce')).toMatchObject({ brand: 'Heinz', description: 'Ketchup', size: { amount: 32, unit: 'oz' } });
  });
  it('keeps a size with the item before it', () => {
    expect(splitItems('Barilla spaghetti, 16-ounce, Heinz ketchup, 32-ounce, Eggland\'s Best large eggs, a dozen')).toEqual([
      'Barilla spaghetti 16-ounce', 'Heinz ketchup 32-ounce', "Eggland's Best large eggs a dozen",
    ]);
    // typed lists that put the size first are left alone
    expect(splitItems('milk, 12 oz pasta, 2 lb chicken breast')).toEqual(['milk', '12 oz pasta', '2 lb chicken breast']);
  });
  it('fixes common mishearings of brands', () => {
    expect(parseLine('Jiff creamy peanut butter 16 oz').brand).toBe('Jif');
    expect(parseLine("Land O'Lakes butter 16-ounce")).toMatchObject({ brand: 'Land O Lakes', size: { amount: 16, unit: 'oz' } });
    expect(parseLine("Eglin's Best Large Eggs a dozen").brand).toBe("Eggland's Best");
    expect(parseList('2 Barilla spaghetti 16 oz, Tide 64 loads')).toHaveLength(2);
  });
});

describe('brand mishearings seen from real speech-to-text', () => {
  it.each([
    ['2 Borilla Spaghetti 16-ounce', 'Barilla'], ['Borillith spaghetti', 'Barilla'], ['Borilus spaghetti', 'Barilla'],
    ['Eglinz Best Large Eggs', "Eggland's Best"], ['Jeff creamy peanut butter 16 oz', 'Jif'], ['Jiff creamy peanut butter', 'Jif'],
  ])('%s -> %s', (text, brand) => { expect(parseLine(text).brand).toBe(brand); });
  it('does not turn a plain first name into Jif', () => { expect(parseLine('Jeff special blend coffee').brand).not.toBe('Jif'); });
});

describe('the demo list', () => {
  it('has 8 branded items, each with a size, so the demo never stops to ask a question', () => {
    const lines = parseList(PLACEHOLDER_LIST);
    expect(lines).toHaveLength(8);
    for (const l of lines) { expect(l.brand, l.raw).toBeTruthy(); expect(l.size, l.raw).toBeTruthy(); expect(l.scope).toBe('swappable'); }
  });
  it('a comma inside one spoken item is ignored', () => {
    expect(parseLine("Eglin's Best Large, eggs a dozen")).toMatchObject({ brand: "Eggland's Best", size: { amount: 12, unit: 'ct' } });
  });
});

describe('"a dozen"', () => {
  it('is one size phrase, leaving no stray "a" in the product name', () => {
    const l = parseLine("Eggland's Best large eggs a dozen");
    expect(l.size).toEqual({ amount: 12, unit: 'ct' });
    expect(l.description).toBe('large eggs');
    expect(parseLine('2 dozen eggs').size).toEqual({ amount: 24, unit: 'ct' });
  });
});
