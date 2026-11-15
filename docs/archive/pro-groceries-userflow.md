> **SUPERSEDED.** Kept for history only. This document describes an earlier design and no longer matches the app. The current sources of truth are [README.md](../../README.md), [SYSTEM.md](../../SYSTEM.md) and [pro-groceries-features.md](../../pro-groceries-features.md).

# Pro Groceries — MVP user flow

**Source of truth:** [pro-groceries-features.md](pro-groceries-features.md).  
**Visual board:** [same-basket-userflow.html](same-basket-userflow.html).  
**Technical plan:** [pro-groceries-architecture.md](pro-groceries-architecture.md).  
**Status:** Design and implementation plan; no working retailer integration is claimed.

## Core principle

The service chooses valid cheaper equivalents automatically. The shopper confirms the original products and locks exceptions. No account, paid subscription, scheduled agent, or report configuration is required for the six-feature MVP.

## Primary journey

| Step | Shopper sees or does | Application behavior | Feature |
|---|---|---|---|
| 1 | Opens the production URL | Restores a local basket if one exists; otherwise offers a text box and sample list | F01/F06 |
| 2 | Types/pastes a list or selects the sample | AI parses descriptions, brands, variants, counts and amounts into editable fields; never prices | F01 |
| 3 | Selects a branch near the prefilled ZIP 45202 | Server finds supported locations and retrieves catalog/price data for that branch | F02 |
| 4 | Confirms original products | Stated brands map to confirmable products; ambiguous/unbranded entries offer up to three choices | F03 |
| 5 | Corrects uncertain variants or leaves entries unresolved | Only confirmed, priced lines enter both sides of the comparison; coverage stays visible | F03 |
| 6 | Waits for comparison | Code checks compatible candidates, units, integer package counts and eligible prices | F04 |
| 7 | Sees “Same basket, $X less” | Valid cheaper replacements are already applied; original/new totals and all swaps are visible | F04/F05 |
| 8 | Selects “Keep original” where wanted | Reverses that swap, recomputes totals and remembers the lock | F05 |
| 9 | Copies/shares the final checklist | Produces the complete list, including unchanged items and all package counts | F06 |
| 10 | Shops independently, then optionally marks “I shopped this” | Adds that session's estimated reduction once for the saved basket/calendar week | F06 |
| 11 | Returns and selects “Re-price my basket” | Restores list/store/locks, checks prices again, revalidates matches and rebuilds the result | F02–F06 |

The service automatically saves supported local state after edits. Saving is not another compulsory form or sign-in step.

## Screens

### 1. List and store

A text area, editable sample-list action, ZIP and branch picker. Parsing can run before location lookup, but catalog prices require a selected branch. Preserve entered text through every error.

### 2. Confirm your usual products

Show item, quantity, variant and likely baseline product. Ask only for unresolved details. A high-priced baseline is not selected automatically to exaggerate savings. Product identity changes may require renewed confirmation on a later check.

### 3. Same basket, lower estimated total

Show original subtotal, optimized subtotal, estimated dollar/percentage difference, and priced coverage. List all automatic swaps sorted by impact with a Keep original control. Unchanged, unsupported and unpriced lines remain distinguishable. Include branch, retrieval time, taxes/fees exclusions and shelf-price caveat.

### 4. Shopping list and history

Checklist, copy/share, local basket save, manual recheck, estimated counter, I shopped this, and Clear my data. Actual purchases and receipts are not inferred automatically.

## Recovery paths

- **Unsupported store:** choose another branch; no invented coverage.
- **Parser failure:** retain input, retry once or permit manual entry.
- **Unknown baseline:** ask for product/size; otherwise leave unresolved.
- **Missing price:** mark unpriced and exclude the same line from both totals.
- **Unknown replacement attributes:** keep original; no AI guess establishes equivalence.
- **No cheaper eligible replacement:** keep original and show zero reduction for that line.
- **Conditional offer:** apply only when the relevant eligibility is established; otherwise show a separate conditional estimate.
- **Refresh failure:** preserve the old labelled snapshot and show the failure; do not pretend the last retrieval just occurred.
- **Local storage unavailable:** keep the in-session result, explain that persistence is unavailable, and offer copy/export.

## Counter behavior

Use a stable local basket ID and a recorded comparison version. Counting occurs only on I shopped this, not on parsing, optimization or repricing. Use one documented calendar-week convention and one entry per saved basket/week. For an MVP default, use Monday–Sunday in the browser's recorded time zone. Repeated clicks update/confirm the existing entry rather than adding it again. This remains a self-reported estimated reduction, not verified cash savings.

## Conditional P1 branches

- **Payment:** offer $5.99/month after the result. Checkout is optional and clearly test-mode in the demo. A server-verified entitlement is separate from the free core flow. Resolve the overlap between free repricing/history and the proposed paid offer before enabling a paywall.
- **Kroger cart:** explicit retailer authorization, then add approved items only after the scope and integration work. Copy/export remains available. Cart addition does not buy groceries.
- **Photo:** derive a draft list and return to confirmation; a photo does not establish a current price.

A static pricing panel is appropriate when payment is unimplemented. Never simulate a successful transaction.

## P2 boundaries

Automatic scheduled repricing, opt-in notifications, more chains, family sharing and receipt reconciliation stay outside the core flow. Periodic report agents are absent from the current approved feature specification; adding them requires a deliberate scope update rather than silently restoring the previous expanded design.

## Differences from the previous board

- Removed the mandatory account and agent-permission journey.
- Replaced per-swap approval with automatic valid swaps and Keep original.
- Removed dedicated scheduling, periodic-report and suggestion-agent lanes.
- Made local save, manual repricing and deduplicated estimated history explicit.
- Isolated payment as P1 and synchronized the proposed price to $5.99.
