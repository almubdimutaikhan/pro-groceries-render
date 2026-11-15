/**
 * Optional structured parsing via OpenRouter (SYSTEM.md §5). Output is validated locally and
 * re-run through the deterministic parser for sizes/scope; it can never supply a price.
 * Falls back to the local parser on any failure.
 */
import type { ListLine } from './types';
import { getCreds, hasOpenRouter, OPENROUTER_MODELS } from './credentials';
import { parseLine, parseList } from './parser';

const SCHEMA = {
  name: 'grocery_list',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['text', 'brand', 'product', 'variants', 'count', 'size'],
          properties: {
            text: { type: 'string', description: 'the original fragment for this item' },
            brand: { type: ['string', 'null'] },
            product: { type: 'string', description: 'product type words only, e.g. "spaghetti"' },
            variants: { type: 'array', items: { type: 'string' } },
            count: { type: 'integer', minimum: 1, maximum: 50 },
            size: { type: ['string', 'null'], description: 'size exactly as written, e.g. "16 oz", or null' },
          },
        },
      },
    },
  },
};

export async function parseWithAI(text: string): Promise<{ lines: ListLine[]; usedAI: boolean }> {
  if (!hasOpenRouter()) return { lines: parseList(text), usedAI: false };
  try {
    const { openrouterKey, openrouterModel } = getCreds();
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json', 'X-Title': 'Pro Groceries' },
      body: JSON.stringify({
        // Cheapest tested models; OpenRouter falls through the list if one is down.
        model: openrouterModel,
        models: [...new Set([openrouterModel, ...OPENROUTER_MODELS])],
        provider: { require_parameters: true, sort: 'price' },
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        messages: [
          { role: 'system', content: 'Split a US grocery list into items. Keep brands only if written. Never invent sizes, brands or prices. Do not merge or drop items.' },
          { role: 'user', content: text.slice(0, 4000) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
    if (!Array.isArray(parsed.items) || !parsed.items.length) throw new Error('empty');
    // The model only SPLITS messy text into items and names the product type. Counts, sizes, variants,
    // brands and scope come from the deterministic parser on the shopper's own words (tested: the model
    // returned count=12 for "a dozen eggs", which would double-count with the size).
    const lines = parsed.items.slice(0, 60).map((it: { text: string; product: string }) => {
      const own = String(it.text || '').replace(/^(and|plus|also|uh|um)\s+/i, '').trim();
      const l = parseLine(own || it.product);
      const product = String(it.product || '').trim();
      const fillerOnly = /\b(our|usual|my|some|the)\b/i.test(l.description) || l.description.split(' ').length > 4;
      return product && fillerOnly && own.toLowerCase().includes(product.toLowerCase()) ? { ...l, description: product } : l;
    });
    return { lines, usedAI: true };
  } catch {
    return { lines: parseList(text), usedAI: false };
  }
}
