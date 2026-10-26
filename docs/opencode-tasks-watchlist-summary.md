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

### Task 1 (#67): reviewed, fixed in review, ready to merge
Lint, tsc and build pass. Requests run one at a time, a failure doesn't stop the rest, buttons are
disabled while a bulk action runs, and the selection, watch cache and list all refresh afterwards.
Fixes made in review:
- **Hidden selections:** cards ticked before a filter changed stayed selected, and "Remove N" removed
  them without saying so. The confirm now says how many of the N aren't shown by the current filters.
- **Partial failures** ("Removed 10; 2 failed: …") showed in green. Amber now.
- The Remove and Clear loops were the same code twice: folded into one `runBulk` helper.
- The summary file was created on this branch rather than the last task's. Fine once #67 is merged
  first: tasks 2-4 branch from `main` after it, and each adds its own section here.
