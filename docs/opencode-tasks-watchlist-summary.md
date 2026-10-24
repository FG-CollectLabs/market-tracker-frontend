# Watchlist cleanup: summary

## 1. Bulk actions on selected cards
- PR: #67 — https://github.com/FG-CollectLabs/market-tracker-frontend/pull/67
- Built: "Select all shown" checkbox (counts shown cards, clears when all selected); bulk "Remove N from watchlist" and "Clear strategies" buttons in the selection bar; progress/result lines; one-at-a-time requests (not parallel); buttons disabled during bulk action.
- Files changed: `src/pages/WatchlistPage.tsx`
- Different from spec: used `PresetBar`'s `extra` prop for the bulk buttons; checkbox placed right above the sticky bar; `bulkResult` shown as a green line below the bar.
- Checked: `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- Not sure / skipped: nothing significant; the drawer/modal tasks (2-4) are pending.

## 2. Edit strategies in a side drawer
- Pending.

## 3. Pass and notes on hits
- Pending.

## 4. Hits: auctions and filters
- Pending.

## Review
