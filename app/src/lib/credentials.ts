/**
 * Session credentials (SYSTEM.md §6). Held in memory only: never in code, URLs, build variables,
 * localStorage or IndexedDB. A reload clears them and the UI shows a reconnect state.
 */
export interface Creds {
  mangisozKey: string;
  krogerToken: string;
  openrouterKey: string;
  openrouterModel: string;
}

// Local development convenience: `.env.local` (gitignored) may prefill the MangiSoz key.
// Guarded by import.meta.env.DEV, which Vite replaces with `false` in production builds, so the
// key is dropped from dist/ entirely (checked with a grep of the build output).
const DEV_MANGISOZ = import.meta.env.DEV ? String(import.meta.env.VITE_MANGISOZ_KEY ?? '') : '';
const DEV_OPENROUTER = import.meta.env.DEV ? String(import.meta.env.VITE_OPENROUTER_KEY ?? '') : '';

/**
 * Cheapest models that passed our list-parsing test on 2026-11-14 (strict JSON schema, all items, no invented data):
 *   z-ai/glm-5.3-flash               ~$0.00008 per list, 1.7 s   ← primary
 *   meta-llama/llama-3.1-8b-instruct ~$0.00007 per list, 2.5 s   ← automatic fallback
 * Free (:free) models were rate-limited (429) or timed out, so they are not used.
 */
export const OPENROUTER_MODELS = ['z-ai/glm-5.3-flash', 'meta-llama/llama-3.1-8b-instruct'];

let creds: Creds = { mangisozKey: DEV_MANGISOZ, krogerToken: '', openrouterKey: DEV_OPENROUTER, openrouterModel: OPENROUTER_MODELS[0] };
const listeners = new Set<() => void>();

export function getCreds(): Creds {
  return creds;
}

export function setCreds(patch: Partial<Creds>): void {
  creds = { ...creds, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v ?? '').trim()])) };
  listeners.forEach(fn => fn());
}

export function subscribeCreds(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * THE one place that says where the Kroger proxy lives. Kroger's API sends no CORS headers, so a
 * browser can't call it directly; a small server-side proxy holds the client ID and secret instead.
 *
 *  - `npm run dev`: the Vite dev server is that proxy, mounted at `/__kroger` (see vite.config.ts).
 *  - Production: set `VITE_KROGER_PROXY_BASE` (e.g. `https://example.com/api/kroger`) at build time.
 *
 * The proxy contract (any host, any language):
 *   GET {base}/status                  → 200 {"configured": true} once it holds working credentials
 *   GET {base}/v1/locations?...        → forwarded to https://api.kroger.com/v1/locations
 *   GET {base}/v1/products?...         → forwarded to https://api.kroger.com/v1/products
 * Nothing else may be forwarded, and the secret and access token must never reach the browser.
 * With no base configured, no request is made and the app runs on labelled demo prices.
 */
export const KROGER_PROXY_BASE: string = (
  (import.meta.env.VITE_KROGER_PROXY_BASE as string | undefined) ?? (import.meta.env.DEV ? '/__kroger' : '')
).replace(/\/+$/, '');

let proxyReady = false;
/** True when prices come through the proxy instead of a pasted operator token. */
export const krogerViaProxy = () => proxyReady && creds.krogerToken.length <= 10;

if (KROGER_PROXY_BASE && typeof window !== 'undefined') {
  fetch(`${KROGER_PROXY_BASE}/status`)
    .then(r => (r.ok ? r.json() : null))
    .then((s: { configured?: boolean } | null) => {
      if (!s?.configured) return;
      proxyReady = true;
      listeners.forEach(fn => fn());
    })
    .catch(() => undefined);
}

/**
 * Voice, photo and list reading through our own server (server/ai.mjs), so the MangiSoz and OpenRouter
 * keys never reach the browser. On Render VITE_AI_PROXY_BASE=/__ai. Empty = no proxy (operator keys only).
 */
export const AI_PROXY_BASE: string = ((import.meta.env.VITE_AI_PROXY_BASE as string | undefined) ?? '').replace(/\/+$/, '');
let aiProxy = { mangisoz: false, parse: false };
export const mangisozViaProxy = () => aiProxy.mangisoz && !creds.mangisozKey.startsWith('ak_');
export const parseViaProxy = () => aiProxy.parse && creds.openrouterKey.length <= 10;

if (AI_PROXY_BASE && typeof window !== 'undefined') {
  fetch(`${AI_PROXY_BASE}/status`)
    .then(r => (r.ok ? r.json() : null))
    .then((s: { mangisoz?: boolean; parse?: boolean } | null) => {
      if (!s) return;
      aiProxy = { mangisoz: Boolean(s.mangisoz), parse: Boolean(s.parse) };
      listeners.forEach(fn => fn());
    })
    .catch(() => undefined);
}

export const hasKroger = () => creds.krogerToken.length > 10 || proxyReady;
export const hasMangisoz = () => creds.mangisozKey.startsWith('ak_') || aiProxy.mangisoz;
export const hasOpenRouter = () => creds.openrouterKey.length > 10 || aiProxy.parse;

/** Stripe test-mode Payment Links (public checkout URLs): the yearly membership and the monthly option (see lib/pricing.ts). */
export const STRIPE_LINK: string = (import.meta.env.VITE_STRIPE_PAYMENT_LINK as string | undefined) ?? '';
export const STRIPE_LINK_MONTHLY: string = (import.meta.env.VITE_STRIPE_PAYMENT_LINK_MONTHLY as string | undefined) ?? '';
