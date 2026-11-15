# Pro Groceries — Features not yet implemented

**Reviewed:** November 14, 2026.
**Compared against:** [SYSTEM.md](../SYSTEM.md) and [feature specification](../pro-groceries-features.md).
**Verdict:** The frontend implements the main basket → store → confirmation → swaps → shopping flow, but it does **not** implement every agreed feature. Some advertised capabilities remain previews. A working demo flow is not evidence that live service access or commercial features are complete.

This review describes the inspected source and browser behavior. The frontend was being edited concurrently; later changes should be checked against this list and the E2E suite.

## Missing from the agreed user flow

| Priority | Feature | Current implementation | What remains |
|---|---|---|---|
| P0 | **Household/profile onboarding — block 01** | Real device geolocation and a separate Cincinnati shopping ZIP are available. Preferences support brand locks. | Add optional age range, household size/adults/children, lifestyle/cooking frequency, budget, shopping frequency and explicit dietary preferences. Explain how each affects the basket. |
| P0 | **Profile history** | IndexedDB has a `profileVersions` object store, but no profile-writing flow uses it. | Save profile versions and associate each basket/comparison with the preferences used. Persist permission status and user-confirmed location without retaining precise device coordinates unnecessarily. |
| P0 | **Optional initial prices — block 05** | Receipt OCR produces product-list text and strips price values. Current retailer prices power comparisons. | Add an optional entry/import action for previous prices, confirm values/dates and store them as historical references. Skip this step when none are supplied; keep historical values out of the current-price saving calculation. |
| P0 | **Voice support throughout the flow** | List input, result locks and shopping marking have speech input; results/reports have read aloud. | Add voice input and appropriate read aloud to onboarding, store choice, product confirmation, basket/home editing and report questions. Settings/payment-provider pages can retain their native controls; do not claim universal voice control today. |
| P0 | **Complete basket-edit agent — block 16** | The saved list can be edited manually and repriced. Some short spoken commands work on results. | Expose an editable command/transcript interface; support quantity changes and multi-item edits, preview the interpreted change and reprice/recompare after confirmed basket mutations. Current `add`/`remove` command handling updates list state without completing that full orchestration. |
| P0 | **Clarification for ambiguous shopping commands** | Result lock commands reject unclear matches. Shopping commands search for a matching row. | Ask which item the shopper means when several rows match. Do not take the first matching row silently. Preserve confirmation before logging a purchase. |
| P1 | **Conversational report agent** | Weekly charts, category/store breakdowns, top swaps, price watch and read aloud exist. | Add text/voice questions, evidence-grounded explanations of computed facts, and suggestions that become reviewable basket edits. There is no report-agent conversation or suggestion-to-basket flow. |
| P1 | **Custom reporting periods** | The report shows an eight-week chart and lets the shopper select a week. | Add month/date-range selection and make all figures respect the selected range. The cumulative counter and top swaps currently span stored events rather than an explicit report range. |
| P1 | **Receipt-recorded actual spending** | OCR can match purchased products and request confirmation. Events have a nullable `paidCents` field. | Extract/confirm amounts actually paid and persist them. The current receipt UI does not populate actual spending. Keep planned spend, recorded actual spend and estimated savings visibly separate. |
| P1 | **Shopper-visible price provenance** | Store/product IDs and timestamps are available internally; the result displays store and time. | Add an expandable source/details view or real source link per price. Current copy claims that every price links to evidence, but no corresponding shopper-facing control exists. |
| P1 | **Current price-list command** | Repricing and copying/sharing a shopping list work manually. | Add the planned voice/text “price my usual basket now” action that refreshes prices and returns a dated price list. There is no autonomous scheduled price-list generation. |

The product **already chooses cheaper valid alternatives automatically** using deterministic rules. A new multi-agent system is not required to make that existing feature real. The missing agent behavior is conversational control, clarification, report analysis and complete orchestration of edits.

## Advertised or optional features that are not finished

| Feature | Status and scope |
|---|---|
| Automatic weekly repricing and alerts | Not implemented. The current frontend acts while open and the shopper requests repricing. A subscription screen mentioning automatic service does not create a scheduler. Keep this a roadmap claim under the no-backend demo constraint. |
| Multiple saved baskets | Not implemented as a user feature. One current basket is persisted with versions/history; there is no create/select/manage multiple-basket interface. |
| Subscription checkout | A configured Stripe test Payment Link can open a hosted checkout. The current unconfigured test build disables checkout. No backend-verified entitlement, billing state, cancellation sync or paid access enforcement exists. |
| Add to Kroger cart | Not implemented. No shopper authorization/cart-write flow is wired into the frontend. This was optional P1 in the feature spec. |
| Live prices for Walmart, Aldi and Target | Not implemented. Their prices/stores are demo catalog data. Comparison and split-list UI exists, but it is not a live multi-retailer integration. This expands beyond the original one-Kroger-store scope. |
| General fridge-photo understanding | Not implemented. MangiSoz OCR reads text on receipts/written lists; it is not object recognition for arbitrary fridge contents. |
| Shared family basket, cloud sync, background operation | Roadmap or deliberately excluded from the browser-only demo. Browser IndexedDB is local storage, not a shared/cloud account database. |

## Implemented integrations that still need live verification

The frontend has adapters for Kroger, OpenRouter and MangiSoz. Automated tests intercept those network boundaries and verify UI behavior and request/response handling with fixtures and dummy credentials. They do **not** prove:

- Current real Kroger account access, scope/quota, sufficient store-specific product attributes or real-basket savings.
- Browser CORS and service availability from the eventual deployed HTTPS origin.
- Speech recognition accuracy on target shoppers' accents, brand names and supported microphone formats.
- OCR reliability on five representative real receipts/photos.
- Successful configured Stripe test checkout or verified subscription status.

Comments in source mention earlier MangiSoz checks; this audit did not independently rerun paid/live service calls. Keep those claims separate from the mocked E2E results.

## Implemented but broken or misleading

| Issue | Evidence / next change |
|---|---|
| **Removing an item from a comma-separated list does nothing** | `ListInput.removeLine` filters whole newline-delimited strings, but the preview supports commas. Browser reproduction: paste five comma-separated items, select “Remove aspirin”; five remain. Remove the parsed fragment using the same delimiters as the parser. |
| **Immediate export/import can fail to restore the active basket** | Browser export → clear → import reproduction restores shopping events but returns to the landing screen instead of restoring the active basket. Investigate the 250ms debounced app snapshot and uncancelled persistence timer around export/clear/import. The exact race needs a code fix and rerun. |
| **Live/demo badges reflect key presence** | A pasted token changes `hasKroger`/`useLive` status before a successful fetch. Displayed historical/demo comparisons can disagree with the badge. Derive price provenance from each comparison and use “key entered” until verified. |
| **Partial-store totals look like full-basket savings** | Store comparison labels the lowest total cheapest even if it covers fewer items. Coverage is visible, but a missing item can still produce an apparently cheaper basket. Compare a common covered set or show incomplete totals without a full-basket saving claim. |
| **Mixed actual/estimated “Spent”** | Report aggregation uses `paidCents ?? plannedCents` under “Spent”. Separate actual recorded spending from basket estimates and show receipt coverage. |
| **Shopping modal keyboard behavior** | Shared dialog has modal semantics/Escape handling but no focus entry, containment or restoration. See the [independent UI review](ui-review.md). |

## Verification and feature coverage

Latest completed run: **62 browser checks — 48 passed, 14 failed**, across Chromium desktop and mobile emulation. The 14 failures comprise five missing-capability checks plus the two reproducible bugs above, each failing on both viewports. No tests were skipped. The existing **18 unit/state tests passed**, and the production build passed.

The five failing capability checks cover household/diet onboarding, optional initial-price entry, voice/read-aloud on store selection, report questions/custom dates/suggestions, and shopper-visible price-source controls. The two bug checks cover comma-separated removal and export/clear/import restoration. The wider source review identifies additional gaps listed above; it is not limited to these five checks.

The browser suite lives in [`app/e2e`](../app/e2e). It covers list input/sample baskets, ambiguous products, missing/unsupported lines, automatic swaps, exact lock arithmetic, shopping confirmation/deduplication, saved edits/repricing, weekly reports, data controls, geolocation, provider contracts/errors, voice/OCR/read aloud and unconfigured checkout. Separate requirements tests assert missing onboarding, initial-price, universal-voice, report-agent and price-source controls.

Commands from `app`:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Missing-requirement tests intentionally stay red until those capabilities exist. Do not skip them and describe the app as feature-complete. Provider fixtures, simulated media and generated example history must not be presented as live integration or customer validation.

## Suggested next order

1. Fix list removal and saved-state export/import reliability.
2. Correct pricing provenance, incomplete-basket comparisons and spending labels.
3. Complete household preferences, optional initial prices and the basket-edit/clarification flow.
4. Extend shared voice controls and add report questions/suggestions.
5. Verify live Kroger/MangiSoz/OpenRouter behavior on the demo origin and measure real baskets.
6. Keep scheduling, multiple baskets, cart and secure billing on the roadmap unless actually implemented and demonstrated.
