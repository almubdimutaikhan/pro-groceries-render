# Pro Groceries — Setup and demo instructions

This package contains the frontend application, feature specification, system design, flow diagrams, brand assets, pitch materials and automated tests.

Start with [SYSTEM.md](SYSTEM.md) for the intended design, [pro-groceries-features.md](pro-groceries-features.md) for the feature rules, and [docs/not-implemented.md](docs/not-implemented.md) / [docs/ui-review.md](docs/ui-review.md) for the implementation review and known gaps.

## 1. Install and run

Use Node.js 22 or newer and npm. From the extracted `progroceries` directory:

```bash
cd app
npm ci
npm run dev
```

Open the localhost URL printed by Vite, normally `http://localhost:5173`. If that port is in use:

```bash
npm run dev -- --port 5176
```

No custom backend or cloud database is required. The app stores its basket and history in IndexedDB in the browser. Use the same browser and origin to retain that history. Clearing site data removes it; Settings includes export/import controls.

## 2. Try the demonstration

1. Open the app and select the example/sample basket, or paste your grocery list.
2. Keep the shopping market at **Cincinnati, Ohio, ZIP 45202**, then pick a store.
3. Confirm ambiguous product choices and build the cheaper basket.
4. Review the applied swaps. **Keep original** locks a product and updates the total.
5. Open the shopping list. Check purchases, then explicitly confirm **I shopped this** to record a shopping event.
6. Open the weekly report or return to your saved basket and reprice it.

Without a Kroger token, prices come from a **demonstration catalog**. They are illustrative, not live retailer prices. Other chains currently use demo data. Example report history is generated and must not be presented as measured savings.

The location button requests the device's real position with permission. Shopping prices still use the explicitly selected Cincinnati demo market. Permission denial does not prevent manual ZIP selection. Use localhost or HTTPS for browser location and microphone features.

## 3. Connect real services

Open **Settings** in the app. Enter credentials there for the current tab. This archive deliberately contains no local API keys or `.env.local` files.

| Service | What to provide | Purpose |
|---|---|---|
| Kroger | Short-lived access token with the API scopes granted to your application | Live locations and store-specific product prices |
| MangiSoz | Your own API key | Speech input, read aloud, receipt/list OCR |
| OpenRouter | Your own API key and an available supported model | Optional structured list parsing |

Generate a Kroger token outside the browser. Never put the Kroger client secret into the frontend. The repository includes [scripts/probe-kroger.mjs](scripts/probe-kroger.mjs) as operator preparation tooling; inspect its required environment variables before running it.

MangiSoz API base: `https://mangisoz.nu.edu.kz/backend`. See [MangiSoz integration notes](docs/mangisoz-api.md) and the [provider documentation](https://mangisoz.nu.edu.kz/backend/api-docs/en).

Service access, account quota and browser CORS must work from your chosen origin. Mocked browser tests do not establish actual service availability. On service failure, use the visible error and manual input rather than treating generated or historical prices as live.

Session keys are visible to the browser operator; this is a controlled hackathon prototype. Do not distribute shared credentials in source, frontend build variables or the ZIP. Development builds may support environment-prefilled keys; use the Settings panel for this handoff instead.

## 4. Optional Stripe test checkout

Create your own test-mode Stripe Payment Link. Inside `app/.env.local`, set only its public URL:

```dotenv
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/test_YOUR_LINK
```

Restart Vite after changing this file. No Stripe secret key belongs in the frontend. If no link is configured, the checkout button is disabled. The return page does not verify a subscription or unlock paid entitlements. Automatic weekly jobs and multiple saved baskets are not established working features of this prototype; see the audit before making those claims.

## 5. Run checks

From `app`:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The E2E suite runs Chromium at desktop and mobile sizes. It starts a separate dev server on port **5185**, uses isolated browser storage, clears development key defaults and intercepts provider network requests with dummy credentials and response fixtures. It covers complete UI flows plus provider request/response behavior, including failures. Microphone recording/playback and OCR provider responses are simulated in those tests.

**Some tests intentionally assert missing requirements from `SYSTEM.md` and currently fail.** They are in `app/e2e/requirements.spec.ts`; a red result represents a feature gap, not proof that the harness could not start. Other failing tests can identify actual implementation bugs. Read [the missing-features audit](docs/not-implemented.md) for observed results and limitations.

At handoff: **18 unit/state tests passed; production build passed; 62 E2E checks ran with 48 passed and 14 failed**. Browser failures represent five missing-capability checks and two bugs, each on desktop and mobile. Live provider availability was not tested by these mocked service checks.

Useful commands:

```bash
npm run test:e2e -- --project=desktop
npm run test:e2e -- --grep-invert SYSTEM
npm run test:e2e:ui
npx playwright show-report
```

Failure screenshots/traces and JSON results are generated in `app/test-results/`; the HTML report is generated in `app/playwright-report/`. These generated directories are excluded from this archive. The review documents remain included.

## 6. Build and host

```bash
cd app
npm run build
npm run preview
```

Upload `app/dist` to a static HTTPS host. OpenRouter and MangiSoz host their own service APIs; this project does not host them. A static host cannot resolve an upstream CORS restriction or hide a shared API secret. Recheck the core flow and service access on the deployed origin.

## Package exclusions

The ZIP excludes every `node_modules` directory, actual environment files and secrets, `.git`, build output, browser test output, temporary files and OS metadata. `.env.example` templates and dependency lockfiles remain included. Install dependencies with `npm ci`; supply credentials separately.
