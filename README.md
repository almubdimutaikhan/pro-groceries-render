# Pro Groceries

**Same basket. Lower price.** Give it your usual grocery list and pick a Kroger-family store. It rebuilds the *same* basket, with the same product types, variants and quantities, from cheaper equivalents at that store's real shelf prices. You lock anything you refuse to change and leave with a list to shop from. No account needed.

The app is a browser-only React + Vite + TypeScript app in [`app/`](app/). There is no application backend; the design is in [SYSTEM.md](SYSTEM.md) and the feature spec in [pro-groceries-features.md](pro-groceries-features.md).

## Run it

```bash
cd app
npm install
npm run dev          # http://localhost:5173
```

Out of the box it runs on a clearly labelled **demo catalog** ("Demo prices" appears wherever a demo price is shown). To see live Kroger prices locally, put your Kroger developer credentials in `.env.local` at the repository root (see [Where prices come from](#where-prices-come-from)).

```bash
npm run build        # static files in app/dist/ for any HTTPS host
npm run preview      # serve that build locally
```

## Where prices come from

| Source | When | Label on screen |
|---|---|---|
| **Kroger API** (`/locations`, `/products`) | Live prices are connected | none; every price line has a **Price details** panel with store ID, product ID, regular / sale price, fetch time and source |
| **Demo catalog** ([`app/src/demo/catalog.ts`](app/src/demo/catalog.ts)) | Live prices are not connected | "Demo prices", driven by each comparison's own `source`, so an old demo result stays labelled demo |

There is one chain, Kroger and its family brands. No other retailer's prices are modelled or derived anywhere; other chains are roadmap only.

Kroger's API sends no CORS headers, so a browser cannot call it directly. It goes through a small **proxy** that holds the client ID and secret:

- **Local development:** the Vite dev server is the proxy ([`app/vite.config.ts`](app/vite.config.ts), mounted at `/__kroger`). Put `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` in the root `.env.local`; it exchanges them for a token, renews it, and forwards only `GET /v1/locations` and `GET /v1/products`.
- **Production (Render):** [`server/`](server/) is the same proxy as a tiny Node server that also serves the built app, so everything is one origin. It holds `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` as Render environment variables, renews the token, forwards only `GET /v1/locations` and `GET /v1/products` with `filter.*` parameters, rate-limits each visitor, and is covered by `npm run test:server`. Setup is in [docs/deploy-render.md](docs/deploy-render.md). On any other host, build with `VITE_KROGER_PROXY_BASE=https://your-host/path` and provide the contract in [`app/src/lib/credentials.ts`](app/src/lib/credentials.ts). Without a proxy the build makes no Kroger request and stays in demo mode.

Lookups are cached for 15 minutes per store and search term; the cached answer keeps the time it was really fetched. The explicit **Re-price** action always fetches fresh prices.

## What the AI does, and what it does not

- **AI (optional, off without a key):** reading a messy typed list into items ([OpenRouter](https://openrouter.ai), strict JSON schema, checked by our own parser, cannot add prices), and reading the result aloud / turning speech and receipt photos into text ([MangiSoz](https://mangisoz.nu.edu.kz)).
- **Deterministic code, no AI:** every price, every total, every swap decision. Money is integer cents. A swap needs the same product type, the same variant in every group (organic, fat level, flavor, scent, "light", decaf, and so on, where *no* flavor counts as a value too), at least the requested quantity, a lower checkout cost for that quantity, and no lock. If anything is unknown, no swap is offered. See [`app/src/lib/engine.ts`](app/src/lib/engine.ts).

## Membership

| | Free | Member |
|---|---|---|
| Build the cheaper basket, keep originals, shopping list | yes | yes |
| Re-price | once | every week, in one tap |
| Savings counter, Weekly report with Price watch | locked preview | yes |
| Guarantee | | "Save 5× your membership or get your money back" |

Price: **$49/year** (the offer) or **$5.99/month**. Each is a Stripe test-mode Payment Link: set `VITE_STRIPE_PAYMENT_LINK` and `VITE_STRIPE_PAYMENT_LINK_MONTHLY`, and set each link's success URL to `<site>/#plan?checkout=success` (add `&period=month` for the monthly one). Without the links the button reads "Checkout opens in the live demo" and does nothing.

**Limitation of this demo, stated plainly:** there is no server, so payment cannot be verified. The member flag lives in this browser's IndexedDB and is set when the shopper lands on `#plan?checkout=success`. Anyone can type that address. It gates the demo features; it is not a paywall you could ship. A real launch verifies the Stripe payment server-side. "Weekly" re-pricing is on-demand; there is no background job.

## Keys and operator mode

Shoppers are never asked for an API key. Keys live in **Operator setup** in Settings, shown only with `?operator=1` in the address or in `npm run dev` (`?operator=0` hides it in dev). Keys stay in memory for the tab and are never saved. Voice and photo controls appear only when a MangiSoz key is present; otherwise they are not shown and everything works by typing. In dev, `VITE_MANGISOZ_KEY` in `app/.env.local` prefills the key (it is removed from production builds).

## Tests

```bash
npm run test:server   # production server and Kroger proxy, against a fake Kroger (repository root)
cd app
npm run typecheck
npm test              # unit and flow tests (engine, flavor rules, matching, cache, shopper flow)
npm run test:e2e      # Playwright, mocked providers: never uses real keys
```

The e2e suite needs a Chromium: `npx playwright install chromium`, or point `PW_CHROMIUM_EXECUTABLE` at an installed Chrome or Edge. `e2e/requirements.spec.ts` lists SYSTEM.md requirements the MVP does not build as `test.fixme` with the reason.

## Known limitations

- **Live Kroger prices need the Kroger keys on the server.** Without `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` set in Render, the site shows demo prices and says so. Kroger's terms on commercial use and caching have not been checked yet.
- Payment is not verified (see Membership).
- One chain, one store at a time; store comparison needs live prices and only compares Kroger-family stores.
- Fresh produce and meat are priced but never swapped; medicine, alcohol and tobacco are not supported.
- Everything is local to one browser; clearing site data clears the basket. Export and import in Settings move history between browsers.

## Repository map

| Path | What |
|---|---|
| `app/` | The application (React + Vite + TypeScript) |
| `server/` | Production server for Render: serves `app/dist` and the Kroger proxy |
| `render.yaml` | Render Blueprint: build, start, health check and environment variables |
| `docs/deploy-render.md` | Step-by-step Render deployment |
| `SYSTEM.md`, `pro-groceries-features.md` | Current design and feature spec |
| `docs/archive/` | Superseded earlier designs, kept for history |
| `docs/ui-review.md` | Independent UI review of an earlier build |
| `brand/` | Brand book and design tokens |
| `scripts/probe-kroger.mjs` | One-off check of Kroger credentials from a terminal |
