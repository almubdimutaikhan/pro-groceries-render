> **SUPERSEDED.** Kept for history only. This document describes an earlier design and no longer matches the app. The current sources of truth are [README.md](../../README.md), [SYSTEM.md](../../SYSTEM.md) and [pro-groceries-features.md](../../pro-groceries-features.md).

# Same Basket, Cheaper — Feature specification

**Status:** Proposed features; implementation and retailer access are not yet verified.  
**Prepared:** November 14, 2026.  
**Team:** Two people, 24-hour build window, existing Stripe account.  
**Track:** Money.  
**Related design:** [Numbered user flow](same-basket-userflow.html).

## Product promise

Help a US household rebuild its usual grocery basket for less at a supported store, while preserving quantities, essential product characteristics, and the shopper's choices.

**Customer-facing proposition:** “Keep your essentials. Spend less on your usual shop.”

Start with one supported Kroger location at a time. Broader retailer coverage is a roadmap hypothesis, not an MVP capability. Every price and claimed reduction must be traceable to a specific product, location, price context, and retrieval time.

## Review of the supplied notes

The strongest suggestions are personal basket reconstruction, trustworthy unit-price arithmetic, a small number of explainable swaps, shopper controls, and a practical shopping output. These form one coherent product rather than ten independent features.

The following claims and scope decisions need correction before implementation or pitching:

| Proposal in the notes | Specification decision |
|---|---|
| Receipt upload should be the hero | Preserve this direction, but ship paste-list/paste-receipt-text first. Photo OCR is a stretch feature with explicit user confirmation. Receipt abbreviations often cannot identify a SKU or pack size on their own. |
| “Same basket” | Define as confirmed quantities and shopper-approved equivalents. Do not promise identical nutrition, ingredients, dietary suitability, or taste without evidence. |
| Larger packs save money | Distinguish lower unit cost from lower checkout spend. Larger packs may require more cash or create surplus. |
| One-click Kroger cart handoff | Conditional on application access, supported scopes, customer authorization, and a successful end-to-end test. Copy/export remains the reliable core output. |
| Live prices and promotions | Confirm actual API fields, access, freshness, and conditions. A displayed promotional price is not proof that a particular shopper qualifies. |
| A cumulative “you saved” counter | Label estimated reductions separately from receipt-confirmed spending. Do not treat all proposals, repeated repricing, or unused lists as realized savings. |
| Weekly automatic repricing | Requires saved baskets, a scheduler, supported current prices, and notification consent. Manual recheck is the first implementation. |
| “No competitor owns this” | Treat differentiation as a hypothesis. Overlapping features exist; competitor feature lists do not prove missing capabilities, demand, or defensibility. |
| Subscription potential | A pricing hypothesis to test after delivering value. Do not imply that projected grocery savings establish willingness to pay. |

**Arithmetic correction:** Two 32-load packs at $11.99 cost $23.98. One 64-load pack at $17.49 is $6.49 cheaper for that quantity, not $6.25. Its checkout price is still $5.50 higher than buying one small pack. These are different comparisons.

## Priority definitions

- **P0 — Core:** Required for a truthful, useful end-to-end demo.
- **P1 — Conditional:** Add after the core works and the relevant dependency passes its access check.
- **P2 — Later:** Valuable expansion, outside the essential hackathon build.

## P0 core features

### F01 — Fast basket input

**User need:** Start from an existing list rather than enter products individually.

- Accept pasted or typed shopping lists, including messy formatting.
- Accept pasted receipt/order-confirmation text through the same confirmation workflow.
- Extract product description, quantity, requested amount, and explicit preferences.
- Preserve the original input so users can correct interpretation.
- Provide an example basket clearly labelled as sample data.
- Allow the first comparison without registration.

**Acceptance:** “Chicken breast 2 lb, 2 milks, our usual coffee” produces editable entries. The app asks about milk size and the unidentified coffee rather than inventing a product.

### F02 — Exact store and price context

**User need:** Compare prices that apply to the intended shopping trip.

- ZIP/location search followed by selection of a specific supported branch.
- Show retailer, branch, and shopping mode associated with the data.
- Retrieve structured product prices and record their retrieval time.
- Keep regular, promotional, and membership-dependent prices distinguishable when those fields are available.
- Show unsupported stores, unavailable prices, and stale data explicitly.
- Keep retailer credentials and application secrets on the server.

**Acceptance:** Changing location invalidates old totals and triggers repricing. A missing price is “unpriced,” never zero. A failed API request cannot silently substitute generated prices.

**Dependency:** Verify current Kroger developer access and a real location-specific product lookup before presenting this feature as live.

### F03 — Confirmed product matching

**User need:** Know the app is comparing the groceries they actually want.

- Match requested items to retailer products using identifiers and structured attributes where available.
- Show brand, variant, pack size, and package quantity.
- Distinguish exact matches, proposed substitutes, and unresolved entries.
- Ask only about ambiguity that could materially change the basket.
- Let the shopper replace or correct a match.
- Never infer that an OCR description establishes an exact historical SKU.

**Acceptance:** “Milk” cannot silently become skim milk. An unresolved entry remains visible, and the app does not describe a partial basket as a fully priced basket.

### F04 — Unit-price calculation and quantity preservation

**User need:** Compare real value without buying too little or more than intended.

- Normalize compatible quantities: mass, volume, or count.
- Compare specialized units such as loads only when both products provide comparable definitions.
- Calculate the integer number of packages needed to satisfy the requested amount.
- Show checkout cost, unit cost, and any surplus quantity separately.
- Default to the same requested quantity; require permission for larger-pack strategies.
- Use deterministic arithmetic and consistent monetary rounding.

**Acceptance:** A smaller package cannot win by failing to supply the requested amount. A bulk pack with a better unit price but a higher checkout cost is not labelled “spend less today.” Incompatible or unknown units require confirmation.

### F05 — Preference controls and protected items

**User need:** Save money without unwanted changes to household essentials.

- Lock an exact product or require the same brand.
- Offer exact-only matching and optional store-brand alternatives.
- Preserve explicit variant restrictions and household preferences.
- Keep sensitive items locked until the user explicitly permits alternatives.
- Allow undo and rejection for every suggestion.
- When an allergy, halal certification, or other requirement cannot be established from available data, label it unknown and exclude that substitute by default.

**Acceptance:** A locked coffee never changes. An uncertain dietary attribute cannot be described as safe or certified. Returning to a previous screen preserves decisions.

### F06 — Basket optimization and three useful swaps

**User need:** Get a few worthwhile decisions rather than a queue of 40 replacements.

- Evaluate a bounded set of compatible, priced candidates for each confirmed item.
- Minimize the supported basket's estimated checkout spend subject to quantity and preference rules.
- Rank proposed changes by absolute reduction, then show up to three initially.
- Display original/replacement product, quantity, price, unit price, and reason.
- Separate unconditional prices from offers with unresolved eligibility.
- Leave suggestions unapplied until approved; mark an approved state clearly.
- Recalculate immediately when the user approves, rejects, or locks an item.
- Keep the original if no acceptable, cheaper option exists.

**Acceptance:** Rejecting a $1.20 swap reduces the estimated saving by exactly $1.20. Zero useful swaps produces an honest unchanged basket.

**Scope:** Independent per-item choices are sufficient when prices are independent. Cross-item bundles, quantity thresholds, and coupon interactions need additional rules and are excluded from the P0 optimizer. Do not claim a global minimum across the entire retailer catalog.

### F07 — Explainable estimated result

**User need:** Understand both the dollar result and its limits.

- Price the original matched basket and the approved alternative using the same location, context, and price snapshot.
- Show both totals, the estimated reduction, and coverage of priced items.
- Show taxes, fees, and uncertain offers as excluded unless accurately supported.
- Explain the handful of changes that cause the difference.
- Include retrieval time and a reminder that checkout prices can change.
- Use AI for parsing and clear explanations; use structured evidence and deterministic calculations for all money figures.

**Acceptance:** Historical receipt prices cannot be compared with today's alternatives and presented as substitution savings. Mixed-date, mixed-store, or incomplete comparisons are clearly identified.

### F08 — Useful shopping handoff

**User need:** Act on the result immediately.

- Provide a mobile-friendly checklist with product identity, pack size, and package count.
- Copy/export the full optimized list and its price timestamp.
- Preserve locked items and approved choices.
- Keep access to the first completed list free under the proposed commercial model.
- Do not describe an export as a retailer cart or completed grocery purchase.

**Acceptance:** The exported list matches the approved basket, including unchanged items. Failure to copy offers a visible alternative.

### F09 — Saved basket and honest history

**User need:** Reuse a list and see how recommendations change over time.

- Save the confirmed basket, locks, and approved preferences locally for the first implementation.
- Provide “Recheck this basket” using current supported prices.
- Store a dated comparison snapshot for each distinct planning session.
- Label its reduction “estimated” and record whether the user actually accepted it.
- Explain that local saving is tied to the current browser/device.
- Provide a clear way to remove saved data.

**Acceptance:** Reopening a basket restores decisions. Rechecking it repeatedly does not inflate a lifetime savings counter. Changed store or quantities creates a new comparison context.

### F10 — Transparent subscription and payment flow

**User need:** Understand what payment adds after seeing useful value.

- Offer a configurable subscription after the first result; **$3.99/month is a test hypothesis**, not a validated price.
- Paid value must correspond to delivered features, such as multiple saved baskets and a dated comparison history. Advertise automated checks only when implemented.
- Show price, billing frequency, renewal terms, cancellation, and the free alternative.
- Use Stripe-hosted checkout for the app subscription.
- Grant paid access after server-confirmed payment, not merely a successful redirect.
- Make repeated payment events safe to process without duplicating access or charges.
- Support cancelled/failed checkout, retry, returning-customer access, and cancellation.
- Use a stable customer identity for paid access; request an email/account only when saving to an account or purchasing.
- Keep retailer authorization separate from the app subscription.

**Acceptance:** A failed payment preserves the shopping list. Reloading a success URL alone cannot unlock access. The user can return to their paid account and find a cancellation route. Clearly label test-mode transactions in the demo.

**Design alignment:** The visual flow's $3 price is illustrative. Update that mockup when a price is chosen; do not present both prices as active offers. Stripe purchases the app service, not the customer's groceries.

## P1 conditional features

| ID | Feature | Required behavior | Gate before inclusion |
|---|---|---|---|
| F11 | Receipt/photo reconstruction | Extract candidate items, flag uncertain matches, request missing pack sizes, and allow confirmation before pricing | Reliable image processing; test receipts; measured matching quality; deletion policy |
| F12 | Authenticated Kroger cart handoff | Explicit customer authorization; preview products and quantities; add approved items; report partial failures and prevent accidental duplicate additions | Actual application access, correct authorization scopes, verified endpoint behavior, successful live workflow test |
| F13 | Receipt reconciliation | Compare matched purchased items with the plan; explain price/quantity differences; record actual spending separately | Receipt parsing and reliable matching; comparable tax/fee treatment |
| F14 | Supported promotion rules | Apply only machine-readable, currently valid offers whose eligibility and quantity conditions are satisfied | Verified promotion semantics; coupon/loyalty access where required |

Adding items to a cart is not grocery checkout, inventory reservation, or proof that the final retailer total equals our estimate. Retailer digital coupons and personalized offers must not be assumed available through the public product interface.

## P2 later features

| ID | Feature | Customer value | Dependency or limitation |
|---|---|---|---|
| F15 | Automatic weekly repricing | Avoid rebuilding the same comparison | Account storage, scheduler, quota/cost controls, fresh retailer data |
| F16 | Consent-based savings reminders | Return when a supported basket has useful changes | Notification delivery, opt-in/unsubscribe, configurable threshold, valid current estimate |
| F17 | Family basket | Shared additions and protected household preferences | Shared identity, permissions, conflict handling |
| F18 | Multi-retailer comparison | Compare complete trips across supported chains | Authorized price access; equivalent fulfillment, taxes/fees, travel cost; no claim of universal coverage |
| F19 | Price history and promotion radar | Understand supported historical prices and current offers | Accumulated reliable snapshots and offer validity; no invented future promotions |
| F20 | Pantry and bulk-buy planning | Account for leftovers, storage, consumption, and cash budget | Household inputs and waste assumptions; separate unit-cost gains from immediate spend |

## Minimum data contract

For a priced basket line, retain:

- User's original description, requested quantity/unit, and confirmed interpretation.
- Retailer, branch/location identifier, product identifier, brand, variant, pack amount/unit, and package count.
- Available restrictions/attributes, their evidence, and any unknowns.
- Regular and eligible comparison price, promotion conditions, currency, fulfillment context, and retrieval time.
- Price source or source record, normalized unit price, and deterministic line total.
- Lock state, proposed alternative, shopper approval, and reason for the suggestion.

For a comparison, retain both basket versions, covered/unpriced items, estimated totals, exclusions, and a unique session/version identifier. Payment identity and subscription status are separate from grocery preferences and retailer tokens.

## Savings definitions

1. **Historical spend:** What the previous receipt records. This can seed a basket but is not today's price baseline.
2. **Estimated substitution reduction:** Original confirmed basket at today's supported prices minus the approved alternative basket at the same snapshot and context.
3. **Actual spend:** Matched purchases recorded on a receipt, with taxes/fees treated consistently.
4. **Receipt reconciliation:** Differences between a planned basket and purchased items. It does not establish the counterfactual cost of groceries the shopper never bought.

Never count unapproved alternatives, duplicate sessions, coupon assumptions, or reductions in quantity as realized savings. Goal trackers show proposed allocations unless a user explicitly records an actual transfer; the app does not move saved grocery money.

## Validation and demo acceptance

### First dependency checks

1. Confirm retailer developer registration/access and retrieve usable products and prices for one location.
2. Verify what fields are actually available for promotions, variants, quantities, availability, and cart operations.
3. Test Stripe checkout and returning-customer access in clearly labelled test mode.
4. If retailer access fails, pause the live-price promise. Historical or fixture data may demonstrate behavior only when visibly labelled; it does not satisfy a live-data claim.

### Evaluate ten real baskets

For each consenting user's basket, record the source, confirmed items/quantities, match coverage, price coverage, retrieval time, proposed and accepted swaps, estimated reduction, processing time, and user corrections.

Report how the baskets were selected and include failures, zero-saving results, and rejected swaps. Ten baskets are an initial feasibility check, not representative market validation. Track purchase intent separately from an actual paid subscription.

### Required checks for the core engine

- A locked item is unchanged and never silently dropped.
- A smaller package cannot satisfy a larger requested quantity.
- Incompatible or missing units do not generate a false comparison.
- Missing prices and stock uncertainty remain visible.
- Conditional offers are excluded when conditions cannot be established.
- Rejected swaps update totals and output correctly.
- A larger pack shows any increased checkout spend and surplus.
- Payment failure and duplicate events preserve correct access state.
- Changing store or repricing does not reuse a stale comparison as current.

### Five-minute demonstration

1. Paste a real list or confirmed receipt text.
2. Choose the supported location and resolve an ambiguous match.
3. Show original prices and three eligible alternatives.
4. Lock/reject one suggestion and show the arithmetic update.
5. Export the complete approved list; show cart handoff only if working.
6. Demonstrate the paid offer, test checkout, and confirmed access.
7. Reopen the saved basket and manually refresh prices.

Only show cumulative history from recorded sessions. Label all sample histories and future notification designs as examples.

## Competitive interpretation

The proposed differentiation is the combination of personal basket continuity, trustworthy quantity/price calculations, shopper controls, and a useful store-specific handoff. It remains a hypothesis to test, not an established moat.

- [Basket: Compare Store Prices](https://apps.apple.com/in/app/basket-compare-store-prices/id6800554313), by Christopher Weiss, describes unit-price comparison, receipt import, price history and shopping lists, with a free model. Its existence establishes feature overlap; the listing alone does not establish adoption or willingness to pay.
- [Flipp](https://flipp.com/en-us/home) describes weekly ads, coupons, shopping lists and sharing. This supports a comparison with deal discovery, but does not justify categorical claims about everything Flipp cannot do.
- Instacart and Kroger remain important transaction and first-party-data competitors. The supplied notes' detailed claims about their limitations require product verification before use in a pitch.
- Honey, Keepa and CamelCamelCamel are adjacent comparison references. They are not the main basis for proving originality in this grocery workflow.

## Source and verification notes

This specification synthesizes the user's original concept, attached flow critique, two subsequent feature/competitor notes, and the local visual flow. These are planning inputs rather than independently established market evidence.

Primary pages inspected on November 14, 2026:

- [Basket App Store listing](https://apps.apple.com/in/app/basket-compare-store-prices/id6800554313).
- [Flipp official product page](https://flipp.com/en-us/home).
- [Kroger Products tutorial](https://developer-ce.kroger.com/documentation/api-products/public/products/tutorial).
- [Kroger Cart overview](https://developer-ce.kroger.com/documentation/api-products/public/cart/overview).

The Kroger documentation returned a JavaScript-only shell through the available text reader. Endpoint details, access terms, authorization scopes, and the supplied notes' capability claims remain unverified in this review. A working authenticated integration is the acceptance gate.

The original grocery-stress statistics, five-year price-growth figure, and Kroger market-share estimate were not revalidated for this feature document and are deliberately not used as product requirements or pitch evidence here.
