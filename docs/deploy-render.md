# Deploy on Render

One Render **Web Service** runs everything: the built app and the Kroger proxy, on the same origin. There is no database and nothing to host besides this.

```
browser ──► https://<your-service>.onrender.com ─┬─► /            the app (app/dist)
                                                 └─► /__kroger/*  Node proxy ──► api.kroger.com
                                                       holds KROGER_CLIENT_ID / KROGER_CLIENT_SECRET
```

## 1. Get the Kroger keys

1. Register at <https://developer.kroger.com> and create an application in the **Production** environment with the **Products** API (scope `product.compact`).
2. Copy the **Client ID** and **Client Secret**.
3. Check Kroger's terms on commercial use and on caching prices before the public demo. We haven't.

Never paste the keys into chat, an issue, or any file in this repo. They go into Render (below) and, for local work, into the git-ignored `.env.local`.

## 2. Create the service

**Blueprint (recommended):** Render dashboard → **New → Blueprint** → pick this repository. Render reads [`render.yaml`](../render.yaml) and asks you for the values marked `sync: false`.

**Or by hand:** New → Web Service → this repo, then:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |

## 3. Environment variables

| Key | Value | Secret? |
|---|---|---|
| `KROGER_CLIENT_ID` | from Kroger | **yes** |
| `KROGER_CLIENT_SECRET` | from Kroger | **yes** |
| `KROGER_SCOPE` | `product.compact` | no |
| `MANGISOZ_API_KEY` | `ak_…` from MangiSoz (voice, photo, read aloud) | **yes** |
| `OPENROUTER_API_KEY` | `sk-or-…` (reads messy typed lists; optional) | **yes** |
| `VITE_AI_PROXY_BASE` | `/__ai` (already the default in production, optional) | no (build time) |
| `VITE_KROGER_PROXY_BASE` | `/__kroger` (already the default, optional) | no (build time) |
| `NODE_VERSION` | `22` | no |
| `VITE_STRIPE_PAYMENT_LINK` | yearly Payment Link (test mode) | public URL |
| `VITE_STRIPE_PAYMENT_LINK_MONTHLY` | monthly Payment Link (test mode) | public URL |

`VITE_*` values are baked into the build and visible to every visitor, so only public values belong there. After changing a `VITE_*` value, **redeploy** (Manual Deploy → Clear build cache & deploy).

Set each Stripe link's success URL to `https://<your-service>.onrender.com/#plan?checkout=success` (add `&period=month` on the monthly one).

## 4. Check it works

Open these after the first deploy (replace the host):

| URL | Expect |
|---|---|
| `/healthz` | `ok` |
| `/__kroger/status` | `{"configured":true}` once Kroger accepts the keys. `{"configured":false,"reason":"missing_credentials"}` means the variables aren't set; `"credentials_rejected"` means Kroger refused them (check you used the **Production** app and the right pair). |
| `/__ai/status` | `{"mangisoz":true,"parse":true}` once the voice/photo and list-reading keys are set |
| `/` | the landing page. With live keys there is no "Demo prices" label on the result screen. |

In the app: paste a list → pick a Cincinnati store → the store names are real Kroger branches, and each price line's **Price details** shows a store ID, product ID and fetch time.

## What the server does and does not do

- Forwards only `GET /v1/locations` and `GET /v1/products`, and only `filter.*` query parameters (limit capped at 50). Everything else answers 404.
- Gets a Kroger token from the client credentials, caches it, renews it a minute before expiry or once on an early 401.
- Shares one upstream call between identical simultaneous lookups, and rate-limits each visitor to 90 lookups a minute (`RATE_LIMIT_PER_MINUTE`).
- Never returns the secret or the token. Logs only whether the keys are present.
- Does not cache prices itself; the app caches each lookup for 15 minutes in the visitor's browser.

## Limits to know before demo day

- **Free instances sleep** after about 15 minutes idle; the next visit waits roughly a minute. Use the `starter` plan (or open the site beforehand) for the demo.
- **Payment is not verified** (no server-side Stripe check). The member flag is set from the success URL and lives in the visitor's browser.
- **Voice, photo and list reading** run through `/__ai` on the same server, so visitors never need a key. If `MANGISOZ_API_KEY` is missing the controls simply don't appear. Visitors are limited per minute and per day, and the whole site has a daily cap (`AI_DAILY_TOTAL`, default 3000) so a public link can't drain the balances.
- **Other chains** are not modelled; only Kroger-family stores get prices.
