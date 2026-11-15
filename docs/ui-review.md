# Pro Groceries — Independent UI review

**Audience:** US grocery shoppers aged 25–45.  
**Date:** November 14, 2026.  
**Scope:** Visual hierarchy, intuitive interaction, trust and accessibility. Recommendations only; no frontend source changed by this reviewer.

> **Status (polish pass):** this review describes the app *before* the judge-ready polish. Since then: other chains and the split basket were removed, the demo label follows each comparison's own `source`, keys moved to Operator setup, membership gates only real features, swap cards show Your usual / Recommended with Price details, and the Sheet traps focus. The screenshots in `ui-review-assets/` are from the earlier build.

## Verdict

The strongest direction is a useful grocery tool: recognizable products, an immediately understandable dollar saving, and an obvious way to keep a favorite brand. Keep the short “Same groceries. Smaller bill.” promise, receipt metaphor, green savings, large primary action and explicit confirmation of ambiguous products. The design already has those ingredients.

Prioritize honest states and a scannable comparison over adding more effects. The proposed audience is broad: there is no evidence that all Americans aged 25–45 prefer a particular palette, font or visual style. The recommendations below are usability hypotheses grounded in the current implementation, not demographic research findings. Validate them with target shoppers.

## Review evidence and limitations

- Inspected the React screens, shared components, styles, feature specification and `SYSTEM.md`.
- The working tree changed during review. In particular, shared layout/navigation components were being expanded while screens and styles still reflected the earlier layout. Source references name the relevant components rather than assuming a stable line number.
- Inspected the running desktop landing in native Safari through CUA, then captured and inspected Chromium screenshots at 1440×1000 and 390×844 from the sanitized local test server. External network routes were blocked for the Chromium capture, so remote fonts/images were unavailable; the missing local layout rules described below are independent of remote fonts.
- No live provider credentials were read or used. API connectivity, real customer behavior and conversion were not established by this UI review.

## Rendered findings: fix the incomplete layout first

Screenshots inspected: [desktop landing](../app/test-results/ui-review-independent/desktop-welcome.png) and [mobile landing](../app/test-results/ui-review-independent/mobile-welcome.png). These are a point-in-time capture during concurrent changes, not a claim about a later completed redesign. No horizontal overflow was measured at these viewport widths; lack of overflow does **not** establish a good layout.

**P0: the current landing is visibly unfinished.** At capture time, new classes such as `app-header`, `desk`, `flow`, `live-ex`, `lx-row`, `marquee` and `marquee-track` had no corresponding rules in the loaded `app.css`. Desktop navigation was squeezed into a narrow left strip, the primary button stretched across almost the entire viewport, receipt labels/prices ran together, and duplicated swap-ticker text formed a dense block. On mobile the page had almost no outer gutter/section separation. The bottom white heading sat on a pale background with very low visibility.

Finish or reconcile the shared layout/landing stylesheet before aesthetic polish or a jury demo. Use one header row, a constrained content container, deliberate hero columns on desktop, a padded single-column stack on phones, spaced receipt rows with separate price columns, and a clipped ticker or remove it. Give the closing CTA its intended contrasting panel. Check the actual imported stylesheet in `src/main.tsx`; matching JSX class names without loaded styles is insufficient. Re-capture after the ongoing edits settle.

**P1: align landing claims with data provenance.** The rendered landing advertises Kroger/Walmart/Aldi/Target and says it checks shelf prices at the exact store. A footer eventually says non-Kroger prices are demo data. Put that limitation beside the hero and every store-comparison claim; do not require scrolling through the whole landing to discover it. `SYSTEM.md` currently describes one live Kroger store.

**P1: reduce the long pre-task presentation.** The full mobile landing is roughly four screens tall even before the shopper starts. Keep benefit + one clear worked example + primary action first. The five-step explanation, feature inventory, rules and FAQ can be shorter or collapsed. Repeated `F01` codes are internal spec language; replace them with descriptive labels. Remove duplicate step markers such as “1. 1”. In US-facing copy, prefer “checkout” to “till”.

## Change first: clarity and trust

| Priority | Part to change | Current evidence | Why it matters / recommended change |
|---|---|---|---|
| P0 | Subscription screen and upsell | [`Plan`](../app/src/screens/Plan.tsx) advertises weekly repricing “for you” and multiple saved baskets; [`Result`](../app/src/screens/Result.tsx) repeats the weekly offer. `SYSTEM.md` specifies on-demand browser activity and no background worker. | The paid promise must match what works. Until scheduling/multiple baskets exist, show a clearly labelled preview or offer only working benefits. Explain what remains free and what the membership ($49/year, or $5.99/month) buys. Keep “test checkout” adjacent to the checkout button, not only in fine print. |
| P0 | Live/demo/connection status | [`Settings`](../app/src/screens/Settings.tsx) labels a service connected from key presence. [`DemoNote` / `useLive`](../app/src/components/ui.tsx) use current credentials rather than the displayed comparison's origin. | A shopper could mistake saved demo data for verified live data after adding a token. Derive price badges from each result's `source` and fetch timestamp. Use “key entered” before validation, “live prices fetched” after success, and “saved estimate” after a failed refresh. Preserve the demo label on historical demo records. |
| P0 | Savings evidence in result cards | [`SwapRow`](../app/src/screens/Result.tsx) shows replacement first, then original in smaller text; the footer says every price links to source IDs, but cards expose no such link. | Show a compact **Your usual → Recommended** comparison with both pack sizes, package counts and line totals. Keep per-swap saving and **Keep original** visible. Add an expandable “Price details” with branch, source, timestamp and product IDs; change the claim if no source view exists. Shoppers should see what changed without reverse-engineering it. |
| P0 | Purchase confirmation dialog | [`Sheet`](../app/src/components/ui.tsx) marks the overlay `aria-modal` and handles Escape but does not move, contain or restore keyboard focus. | Implement focus entry, Tab/Shift-Tab containment, inert background and focus restoration. This is a purchase-log and product-selection control, not merely decoration. WAI's modal pattern describes these behaviors. [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). |
| P1 | Store/location labels | [`StorePick`](../app/src/screens/StorePick.tsx) permits editing ZIP while the market label hardcodes Cincinnati, Ohio. Device location does not choose a store. | Before requesting geolocation, explain: “We'll read your location; this demo shops Cincinnati.” Distinguish actual device location from shopping market. If ZIP becomes editable outside 45202, display the returned branch's actual city/state instead of retaining Cincinnati. Keep store address visible in comparison/results. |
| P1 | Voice and photo availability | [`VoiceButton` / `PhotoButton`](../app/src/components/voice.tsx) send users to service-key settings when unavailable. | An ordinary shopper should not need to understand MangiSoz or API keys. Keep operator setup separate from shopper settings. When unavailable, explain inline “Voice is unavailable in this demo; type instead” and retain the current task. For successful voice commands, show “Heard…” and the interpreted change with an Undo action; require confirmation when unclear. |

## Change next: visual hierarchy and grocery familiarity

| Priority | Part to change | Concrete recommendation | Acceptance check |
|---|---|---|---|
| P1 | Result screen density | Keep the top block to: **Save $X on this basket**, **$A → $B**, store/time, coverage. Group secondary controls under one “More ways to edit” area and collapse unchanged products. Replace “Rebuilt” with “With recommended swaps” or another shopper-tested term. Keep the shopping-list action visible. | A new user can point to the new total, saving, store and how to reject a swap within five seconds. |
| P1 | Product identification | Use actual returned product photos where available. If not, use a consistent category icon plus readable brand/product name rather than only brand initials. Display key variants and pack counts beside the product, not hidden in explanatory prose. | A shopper can distinguish whole vs skim milk and one vs two packs at a glance; unknown imagery never becomes a fabricated product photo. |
| P1 | Shopping list in a store | Give checklist rows the clearest type and largest practical tap areas. Make quantity/size prominent; keep prices aligned. Separate **checked while shopping** from **confirmed purchased** with a brief explicit label. Add clear access to saved basket/report in the stable navigation. | At 390px width, a long product name wraps without pushing quantity or price off-screen. Checking an item does not unexpectedly log savings. |
| P1 | Mobile microcopy and labels | Promote key restrictions and pack-size information to roughly 14–16px; reserve 12px for genuine secondary/legal details. Increase frequent compact controls toward 44px touch height when space permits. Keep green reserved for positive savings and violet for actions. | Test at 320/390px and 200% text zoom with no clipped totals or hidden actions. A 36/40px control is not automatically a WCAG failure: AA minimum is 24px or qualifying spacing; 44px is the enhanced target. [WAI target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). |
| P1 | Reports | Put a dollar value beside/above each bar and expose a text/table equivalent for screen readers. A zero saving should appear as zero, not a positive minimum-height bar. Separate **estimated saving**, **planned spend**, and **receipt-recorded spend** when available. Explain repeated price checks separately from unique shopping events. | A user can tell whether a taller bar means money saved, money spent or number of swaps; repeated repricing cannot look like repeated shopping. |
| P2 | Welcome page | Retain the receipt and concrete benefit. Tighten the explanation to one sentence about equivalent brands/packs and one short statement about control. Label the receipt's savings stamp as illustrative in the same visual group. Replace unmeasured “About a minute” with neutral copy until measured. | A shopper can explain what the app does and that the example is not their personal saving before tapping. |
| P2 | Visual identity | Keep a coherent type/spacing system and one primary accent. Build grocery recognition through receipt rules, unit labels, checklist controls and authentic pack images. Do not redesign around an assumption that the audience needs a different color or glossy AI aesthetic. | All screens feel like the same grocery tool, and no decorative element competes with the new total or next action. |

## Accessibility follow-through

Beyond the modal issue, give progress indicators an accessible name, support the expected keyboard behavior for custom radio groups/tabs, and move focus to a meaningful heading after route changes. Ensure screen-reader announcements report the final saving after an update, rather than every animation frame. Keep reduced-motion support already present in the stylesheet.

Verify rendered contrast, especially smaller error/action text, rather than relying on token comments. WAI specifies at least 4.5:1 for ordinary text and 3:1 for qualifying large text; disabled controls have exceptions. [WAI contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Proposed screen hierarchy

```text
WELCOME
  Benefit → illustrative receipt → Check my basket → Try sample

BASKET INPUT
  List → parsed editable items → optional voice/photo → Continue

STORE + CONFIRM
  Explicit demo market → actual branch → clarify only uncertain products

RESULT
  Save $X · $A → $B → store/time/coverage
  Recommended swaps with Keep original → Get shopping list
  Unchanged/unpriced items and price evidence in expandable sections

SHOP
  Store + total + remaining items → checklist → Confirm what I bought

SAVED BASKET / REPORT
  Reprice now → last check + source → estimated savings history
  Period report → explain observations → suggested changes requiring review
```

## Lightweight validation with target shoppers

Recruit five people in the intended age range with different grocery habits; this is a directional usability check, not a representative US-market study. Ask them to complete a basket, identify the savings and demo status, keep a favorite brand, shop only part of the list, and find the history after returning. Record hesitation, incorrect interpretation and task completion; do not ask only whether they like the design. Use the first repeated misunderstanding to choose the next change.
