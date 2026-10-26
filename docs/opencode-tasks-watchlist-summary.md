# Watchlist cleanup: frontend tasks summary

## 1. Bulk actions on selected cards

PR: [#67](https://github.com/FG-CollectLabs/market-tracker-frontend/pull/67) (`watch/1-bulk-actions`) — merged.

Files changed: `src/pages/WatchlistPage.tsx`, `src/components/WatchTargets.tsx`.

Built: Select all shown checkbox, bulk Remove / Clear strategies with progress and error lines.

Checked: lint / tsc / build, clicked through selection and removal in `npm run dev`.

## 2. Edit strategies in a side drawer

PR: [#69](https://github.com/FG-CollectLabs/market-tracker-frontend/pull/69) (`watch/2-cards`).

Files changed: `src/pages/WatchlistPage.tsx`.

Built: Right-side drawer (`fixed inset-y-0 right-0 w-[32rem] max-w-full z-40`) with card thumbnail, name, set/number, link to card page; `TargetEditor` inside; current hits listed below; close on Escape / backdrop / Cancel / Save; table uses compact strategy chips (`label + max`) and "+ strategy" chip.

Different from spec: kept the inline "Edit targets" button as a fallback below chips (for accessibility). Used existing `endsIn` function.

Checked: lint / tsc / build; verified drawer opens/closes and scroll position is preserved; chips render correctly.

## 3. Pass and notes on hits

PR: [#70](https://github.com/FG-CollectLabs/market-tracker-frontend/pull/70) (`watch/3-reviews`).

Files changed: `src/pages/WatchlistPage.tsx`.

Built: Pass and Note actions per hit row (`print:hidden`); undo pass toast with 5-second inline link; inline note input (max 2000 chars) with Save/Cancel; notes show under title (`text-[11px] text-amber-200/80`); empty note clears review; "Show passed (N)" toggle reloads with `fetchWatchlist(false, true)`; passed rows dimmed (`opacity-50`) tagged "passed" with Undo pass; errors shown inline.

Checked: lint / tsc / build; verified pass removes hit, note survives reload, undo pass restores it.

## 4. Hits: auctions and filters

PR: [#71](https://github.com/FG-CollectLabs/market-tracker-frontend/pull/71) (`watch/4-filters`).

Files changed: `src/pages/WatchlistPage.tsx`.

Built: Kind buttons (All / Auctions / Buy Now) and Source buttons (All / Fanatics / eBay); sort select (Most under max / Ending soonest / Cheapest); auction rows show current bid (`price_cents`), `bids`, `ends_at` with live countdown (`endsIn`); countdown refreshes via `tick` interval; red text under 5 minutes; Buy Now rows show "Buy Now"; source badges (`Fanatics` / `eBay`) plus kind badge; kept max and under-by columns.

Checked: lint / tsc / build; verified filter/sort interactions and countdown updates.

## Review

