# Pro Groceries

**Same basket. Lower price.**

Paste your usual grocery list, pick your Kroger. Pro Groceries rebuilds the *same* basket at that store's real shelf prices, swapping in cheaper equivalents with the same product type, the same size or more, and the same variant. You lock anything you won't change, and leave with a list to shop from.

Built in 24 hours by a team of two for the **Money** track. B2C, web, US adults 25 to 45.

| | |
|---|---|
| **Live prices** | Kroger's own API, per store, with the time each price was fetched |
| **Swaps** | Deterministic code in integer cents. No AI touches a price, a total or a swap decision |
| **Voice, receipt photo, read aloud** | MangiSoz speech, OCR and emotional TTS (first female voice, neutral), through our server so no key reaches the browser |
| **No account** | The basket lives in the browser (IndexedDB); one tap clears it |
| **Tests** | 49 app tests (engine, flavor rules, matching, spoken lists, cache, shopper flow) and 23 server tests (Kroger proxy, voice/photo proxy, abuse limits) |

## For reviewers: where to look

| If you want to check | Open |
|---|---|
| The rule that decides every swap | [`app/src/lib/engine.ts`](app/src/lib/engine.ts) and its tests, [`engine.test.ts`](app/src/lib/engine.test.ts) |
| That AI never sets a price | [`app/src/lib/openrouter.ts`](app/src/lib/openrouter.ts) (it only splits a messy list into items) and [`server/ai.mjs`](server/ai.mjs) (the server owns the prompt, schema and models) |
| How Kroger is reached and the secret protected | [`server/app.mjs`](server/app.mjs), [`server/server.test.mjs`](server/server.test.mjs) |
| What is real, what is demo, and what is not built | [Known limitations](#known-limitations) and [`docs/not-implemented.md`](docs/not-implemented.md) |
| Design and feature spec | [`SYSTEM.md`](SYSTEM.md), [`pro-groceries-features.md`](pro-groceries-features.md) |

Verified live on 15 Nov 2026 through the production server: Kroger returned real Cincinnati stores and Barilla spaghetti prices ($1.99 / 16 oz) for a real store ID; MangiSoz returned a speech transcript, a spoken WAV and receipt text; OpenRouter split a messy spoken list into items.

## How it works

```
                        ┌──────────────── one Render web service ────────────────┐
 browser                │  /            the React app (static, app/dist)          │
 (React + Vite + TS) ───┤  /__kroger/*  Kroger proxy ───────► api.kroger.com      │
 IndexedDB: basket,     │  /__ai/*      voice/photo/list ───► MangiSoz, OpenRouter│
 locks, history         └──── holds every secret; nothing secret reaches the browser
```

1. **Bring a list.** Type, paste, say it, or photograph a receipt. A deterministic parser reads quantities, sizes and variants; OpenRouter can help split a messy list but never decides anything.
2. **Pick a store.** Real Kroger-family branches near a ZIP.
3. **Confirm what you usually buy.** A line like "milk" gets one question with up to three real products, so the baseline is what you actually buy and the saving is not inflated.
4. **See the same basket for less.** Every swap shows both prices, the unit price and the reason. **Keep original** locks an item and the total updates instantly.
5. **Shop.** A checklist with package counts, copy and share. "I shopped this" feeds a weekly report (once per basket per week, so re-pricing never inflates it).

### What "same basket" means

A swap is offered only if all of these hold. If anything is unknown, there is no swap.

1. Same product type (pasta stays pasta).
2. Same variant in every group: organic, fat level, flavor, scent, decaf, "light". *No* flavor counts as a value too, so plain never becomes vanilla.
3. At least the requested quantity, counted in whole packages.
4. Lower checkout cost for that quantity, not just a lower unit price.
5. Not locked by you. Fresh produce and meat are priced but never swapped.

### What the AI does, and what it does not

- **AI (optional):** reading a messy list into items (OpenRouter, strict JSON schema, cheapest tested models, checked by our own parser) and speech/OCR/read-aloud (MangiSoz).
- **Plain code:** every price, total, unit price and swap. Money is integer cents.

## Run it

```bash
cd app && npm install && npm run dev      # http://localhost:5173
```

With no keys it runs on a clearly labelled **demo catalog** ("Demo prices"). For live data, copy [`.env.example`](.env.example) to `.env.local` at the repository root and fill in your own keys (never commit them):

| Key | Gives you |
|---|---|
| `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` | live Kroger prices (the Vite dev server is the proxy locally) |
| `VITE_MANGISOZ_KEY`, `VITE_OPENROUTER_KEY` in `app/.env.local` | voice, photo and list reading in development only; removed from production builds |

To run exactly what is deployed (the production server, with all keys in `.env.local`):

```bash
npm run build
node --env-file=.env.local server/index.mjs     # http://localhost:3000
```

## Deploy on Render

One web service serves the app and both proxies. It is described in [`render.yaml`](render.yaml); the steps, the environment variables and how to check it are in [`docs/deploy-render.md`](docs/deploy-render.md). Secrets (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `MANGISOZ_API_KEY`, `OPENROUTER_API_KEY`) are entered in the Render dashboard and are never stored in git.

The server is small and strict on purpose:

- Forwards only `GET /v1/locations` and `GET /v1/products` to Kroger, with only `filter.*` parameters, and enforces Kroger's search rule (3+ characters, at most 8 words).
- Voice and photo endpoints accept only the five known routes. The **server** owns the OpenRouter prompt, schema and models; a visitor can only supply text. Uploads are size-capped; each visitor is limited per minute and per day; the whole site has a daily cap and a concurrency cap, so a public link cannot drain the team's balances.
- Upstream errors are never passed to the browser, and nothing from a request is logged.

## Tests

```bash
npm run test:server       # Kroger proxy, voice/photo/list proxy, limits, static serving (fake upstreams)
cd app && npm run typecheck && npm test
cd app && npm run test:e2e    # Playwright with mocked providers; needs a Chromium
```

## Known limitations

Honest list, so nothing here is a surprise:

- **One chain.** Only Kroger-family stores get prices. Other retailers were removed rather than faked; they are roadmap only.
- **Membership is a demo unlock.** Tapping "See membership" opens every member feature on that device with no payment, so reviewers can see the full product (set `VITE_DEMO_UNLOCK=0` at build time to turn the shortcut off). **Payment is a demo.** There is no server-side Stripe check, so the membership flag lives in the browser and is set from the success URL. It gates demo features; it is not a paywall you could ship. The money-back wording on the plan page is demo copy, not an offer.
- **Estimates, not receipts.** Totals are shelf prices before tax at fetch time. Coupons and multi-buy deals are not included. "Estimated saved" counts only shops the user marks.
- **Kroger terms.** Commercial-use and price-caching terms have not been reviewed. The public Products API is limited to about 10,000 calls a day; the app caches each lookup for 15 minutes in the browser.
- **Free hosting sleeps.** A Render free instance takes about a minute to wake after idle time.
- Medicine, alcohol and tobacco are not supported. Everything is local to one browser.

## Repository map

| Path | What |
|---|---|
| `app/` | The application: React + Vite + TypeScript |
| `server/` | Production server for Render: static app, Kroger proxy, voice/photo/list proxy |
| `render.yaml` | Render Blueprint: build, start, health check, environment variables |
| `docs/deploy-render.md` | Step-by-step deployment and checks |
| `docs/not-implemented.md` | What is deliberately not built |
| `SYSTEM.md`, `pro-groceries-features.md` | Current design and feature spec |
| `docs/archive/` | Superseded earlier designs, kept for history |
| `brand/` | Brand book and design tokens |
| `scripts/probe-kroger.mjs` | One-off check of Kroger credentials from a terminal |
