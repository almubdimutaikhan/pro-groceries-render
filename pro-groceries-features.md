# Pro Groceries — Feature specification

**Motto:** Same basket for a lower price.
**Status:** Build specification for the hackathon MVP. Kroger API access is not yet verified (see "First two hours").
**Prepared:** November 14, 2026.
**Team:** Two people, 24-hour build window, existing Stripe account.
**Track:** Money. B2C, web only, US adults 25–45.
**Related design:** the earlier [flow board](docs/archive/same-basket-userflow.html) and [user-flow specification](docs/archive/pro-groceries-userflow.md) are archived and superseded; [SYSTEM.md](SYSTEM.md) describes the shipped design.
**Current technical plan:** [Hackathon system design — frontend, live APIs and browser database](SYSTEM.md). This later design overrides the backend, price-cache and storage choices below; the feature rules remain applicable.

## What the product is

The shopper gives us a grocery list. We price it at their Kroger store with real prices and return **the same basket for a lower total**: same product types, same variants, same quantities, with cheaper equivalents swapped in. The shopper locks anything they refuse to change and leaves with a list they can shop from.

**One sentence for the UI:** "Same basket. Lower price."

### What "same basket" means (the rule the engine enforces)

A replacement is allowed only if all of the following hold:

1. **Same product type** (pasta stays pasta, not rice).
2. **Same variant** where the shopper stated one or the original product has one: fat level, flavor, organic, gluten-free, decaf, scent, and similar.
3. **Same quantity:** the replacement supplies at least the requested amount. Pack size within ±10% of the original counts as the same pack; anything else is a "different pack" swap and is recomputed by package count.
4. **Lower checkout cost for that quantity**, not only a lower unit price.
5. **Not locked** by the shopper.

If any attribute is unknown, the swap is not offered. The product never changes what the family eats, never reduces quantity, and never suggests recipes, menus, or different foods.

### The three ways we lower the price

| # | Swap type | Example | In MVP |
|---|---|---|---|
| 1 | **Store brand for national brand**, same type and size | Barilla spaghetti 16 oz → Kroger spaghetti 16 oz | Yes, primary mechanism |
| 2 | **Better pack** of the same product at lower cost for the requested quantity | 2 × 32-load detergent → 1 × 64-load | Yes |
| 3 | **Current promo price** on an equivalent product | Equivalent item on sale this week | Yes, if the API returns a promo price |

Kroger-owned brands to recognize (verify the exact `brand` strings returned by the API): Kroger, Private Selection, Simple Truth, Simple Truth Organic, Heritage Farm, Smart Way, Big K, Comforts, Abound, Luvsome, Pet Pride.

### Scope of goods

- **In scope (swappable):** packaged food and drinks with a barcode and a fixed size; household consumables (detergent, paper goods, trash bags, dish soap).
- **Kept as is (priced if possible, never swapped):** fresh produce, meat, deli and bakery sold by weight.
- **Out of scope (shown as "not supported", excluded from totals):** medicines, alcohol, tobacco, gift cards, durable goods.

### Hard constraints from the hackathon

- The production URL must deliver the full core flow **without sign-up or login**.
- Core value must be real: **no hardcoded or generated prices**. Judges read the repository.
- One chain (Kroger family), one store at a time. Pilot default: Cincinnati, ZIP 45202.

## Priorities

- **P0 — Core:** must work in production for the demo. Six features.
- **P1 — If time remains:** add only after every P0 acceptance check passes.
- **P2 — Roadmap:** not built; appears only on the roadmap slide.

## P0 core features

### F01 — List input

- One text box: type or paste a list, any formatting.
- AI parses each line into: product description, brand (if stated), variant, quantity, unit.
- Every parsed line is editable; the original text is kept.
- "Try a sample basket" button fills a realistic 12–15 item list of branded packaged goods. Label it as a sample list; its prices are still real.

**Acceptance:** "2 Barilla spaghetti 16oz, Tide 64 loads, milk, chicken breast 2 lb" yields four editable lines. "Milk" triggers one question (which milk). Chicken is marked "kept as is".

### F02 — Store selection and real prices

- ZIP → list of Kroger-family stores → shopper picks one. Default ZIP 45202 prefilled.
- Server-side OAuth (client credentials); secrets never reach the browser.
- Product search with the store's location ID so prices are store-specific.
- Keep regular price and promo price as separate fields.
- **Price cache:** store every API response with store ID and retrieval time. Serve from cache when fresh (under 24 hours); show "prices as of <time>" on the result. The cache-filling script lives in the repo.
- Missing price = "unpriced", never zero. API failure = visible error, never invented numbers.

**Acceptance:** changing the store reprices everything. Every price on screen can be traced to a product ID, store ID, and timestamp.

### F03 — Baseline matching

The saving is only honest if the baseline is what the shopper would have bought.

- **Brand stated** ("Barilla spaghetti 16 oz") → match to that product; show brand, size, price for confirmation.
- **No brand stated** ("pasta") → show the top three matching products and ask "Which one do you usually buy?" One tap. No saving is counted for a line until its baseline is confirmed.
- Unmatched lines stay visible as "not found" and are excluded from both totals.

**Acceptance:** "milk" never silently becomes skim milk. A partially matched basket shows coverage ("11 of 14 items priced").

### F04 — Swap engine

Deterministic code, no AI in the money path.

- For each confirmed in-scope line, fetch candidates of the same product type at the same store.
- Filter by the "same basket" rule above.
- Normalize units (oz/lb/g, fl oz/gal/L, count; "loads" only against "loads").
- Compute integer package count to cover the requested quantity, then checkout cost.
- Pick the cheapest valid candidate; if none is cheaper, keep the original.
- Each swap records its type (store brand / better pack / promo) and the dollar difference.
- Promo prices that require the free loyalty card are labelled "with card".

**Acceptance:** a smaller pack cannot win by supplying less. A bigger pack wins only if total cost for the requested quantity is lower. Unknown units produce no swap. Unit tests cover each of these cases.

**Scope limit:** per-item optimization only. No coupons, no "buy 5 save $5" bundles, no claim of a global minimum.

### F05 — Result screen with locks

This is the screen the whole product exists for.

- Headline: **"Same basket, $X less"** with original total, new total, and percent.
- All valid swaps are **applied by default** and listed, largest saving first. Each row: original → replacement, sizes, both prices, saving, swap type.
- Each row has **Keep original** (lock). Locking recalculates the totals immediately. Locks are remembered for next time.
- Items kept as is and unpriced items are listed below, clearly separated.
- Footer: store, "prices as of <time>", "estimate before tax; shelf prices can change".
- AI may write the one-line reason per swap; it never produces a number.

**Acceptance:** locking a $1.20 swap lowers the headline saving by exactly $1.20. A basket with no valid swaps says so plainly and shows $0.

### F06 — Shopping list, saved basket, savings counter

- **Shopping list:** mobile-friendly checklist of the final basket (product, brand, size, package count, price). Copy and share buttons.
- **Saved basket:** list, store, and locks stored in the browser (localStorage). No account.
- **"Re-price my basket":** one tap reruns the saved list at current prices. This is the reason to come back each week.
- **Savings counter:** running total of estimated savings from baskets the shopper marked "I shopped this". At most one entry per basket per calendar week, so re-pricing cannot inflate it. Label: "estimated".
- "Clear my data" button.

**Acceptance:** closing and reopening the site restores the basket and locks. Re-pricing five times in a row does not change the counter.

## P1 — if time remains

| ID | Feature | Behavior | Gate |
|---|---|---|---|
| F07 | Membership checkout | After the first result: "$49/year (or $5.99/month) — weekly re-pricing, savings counter and the Weekly report", with the guarantee "Save 5× your membership or get your money back". Stripe-hosted checkout in test mode, clearly labelled. Free: the cheaper basket, shopping list, locks and one re-pricing. In the shipped demo the member flag is set from the Stripe return URL and is not payment verification; a real launch verifies server-side. | All P0 checks pass |
| F08 | Add to Kroger cart | Shopper signs in to Kroger, reviews the list, items are added to their cart. Report partial failures. | Cart scope granted and one successful live test |
| F09 | Photo input | Fridge or receipt photo becomes a **draft list** that goes through F01 confirmation. Never priced without confirmation. | Reliable extraction on five test photos |

If F07 is not built, the result screen still shows the price and what it buys as a static panel. Do not show a fake payment flow.

The price is $49/year, with $5.99/month as the option, to match the pitch deck. It is a hypothesis; show the same two prices everywhere.

## P2 — roadmap only

- Automatic weekly re-pricing with opt-in alerts.
- More categories: fresh items by weight, then pharmacy and general merchandise.
- Other chains (Walmart first), then cross-store comparison.
- Shared family basket.
- Receipt check: planned versus actually paid.

## First two hours (before any UI work)

1. Register on the Kroger developer portal and obtain credentials. Confirm that registration works from Kazakhstan and read the terms on commercial use.
2. Get a token, find a Cincinnati store, and fetch one product with a store-specific price. Record which fields actually come back: regular price, promo price, size, brand, categories, UPC.
3. Run five branded items by hand and check that a store-brand equivalent with a price is returned for each.
4. Check the daily call quota and size the cache accordingly.

**If access fails:** stop and tell the team. A labelled historical snapshot can demonstrate the interface, but it does not satisfy "real prices" and must not be presented as live.

## Data kept for every basket line

- Original text, parsed quantity and unit, confirmed baseline product.
- Store ID, product ID/UPC, brand, variant, pack size and unit, package count.
- Regular price, promo price and its condition, retrieval time.
- Normalized unit price, line total.
- Chosen replacement, swap type, saving, lock state.

For every comparison: both basket versions, coverage, both totals, timestamp.

## Savings definitions

- **Estimated saving:** confirmed baseline basket minus final basket, same store, same price snapshot, before tax.
- **Counter:** sum of estimated savings for baskets marked "I shopped this".
- Never counted: locked or rejected swaps, unpriced lines, repeated re-pricing, reduced quantities.

## Repository requirements

- README: what it does, how to run, where prices come from, what is AI and what is deterministic.
- Swap engine in its own module with unit tests for every acceptance case in F04 and F05.
- `.env.example`; no secrets in the repo.
- Cache-filling script committed; no fixture prices in production code paths.
- Sample basket contains product names only, never prices.

## Measure ten real baskets

Run ten real lists through the working product. For each record: items, coverage, number of swaps offered and kept, estimated saving in dollars and percent, processing time. Report all ten, including zero-saving results. The measured average replaces the model estimate in the pitch deck.

## Demo, five minutes

1. Open the production URL. No login.
2. Tap "Try a sample basket" or paste a real list; answer one question about an ambiguous item.
3. Confirm the Cincinnati store.
4. Result: "Same basket, $X less". Open two swaps and show the prices.
5. Lock one item; the total updates.
6. Open the shopping list; copy it.
7. Reload the page; the basket is still there. Tap "Re-price my basket". Show the counter.
8. If built: subscription checkout in test mode.
