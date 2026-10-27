# Watchlist cleanup: summary

## 1. Bulk actions on selected cards
- PR: #67 — https://github.com/FG-CollectLabs/market-tracker-frontend/pull/67
- Built: "Select all shown" checkbox (counts shown cards, clears when all selected); bulk "Remove N from watchlist" and "Clear strategies" buttons in the selection bar; progress/result lines; one-at-a-time requests (not parallel); buttons disabled during bulk action.
- Files changed: `src/pages/WatchlistPage.tsx`
- Different from spec: used `PresetBar`'s `extra` prop for the bulk buttons; checkbox placed right above the sticky bar; `bulkResult` shown as a green line below the bar.
- Checked: `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- Not sure / skipped: nothing significant; the drawer/modal tasks (2-4) are pending.

## 2-4. Cards with their listings, set aside with a reason, filters and photos

Built by Claude (not opencode) in one PR, `feat/watchlist-cards-reviews`, after opencode's #69-#71
followed the old version of this doc and #73 / #74 (the v2 redo) missed most of the spec (see the
review comments on #73 and #74). Those PRs are closed unmerged.

Files: `src/pages/WatchlistPage.tsx`, new `src/components/WatchHits.tsx` (filters, the listing row,
the photo overlay, the drawer, the shared clock).

- **Task 2:** the big Hits table is gone; "Best hits" shows the 8 listings most under their max
  (click: opens the card and scrolls to it). Clicking a card row expands its listings, one row per
  listing (a listing matching two strategies shows once, with both). Strategy chips per target,
  amber "paused" with the gate text; a listings badge on every card with targets. "Edit strategies"
  opens `TargetEditor` in a right-side drawer (Escape / backdrop / Cancel / Save). Open cards print
  their listings.
- **Task 3:** "Set aside ▾" is a menu of `HIT_REASONS` with an optional note; the row leaves at once
  with Undo for 5 s; a failed save puts it back with the error. Note / Edit note inline. "Show
  set-aside (N)": dimmed rows with the reason badge ("No back photo · auto" for the agent), Restore.
  Counts and Best hits never include set-aside listings.
- **Task 4:** Kind / Source / "Hide 1-photo raw listings" and the sort, remembered in
  `localStorage` (`watchlist.filters`). Auction rows: bid, bids, time left (`2d 4h`, `3h 12m`,
  `mm:ss`, red under 5 min) on one clock (30 s, 1 s while an auction shown ends within the hour).
  "1 photo" badge; clicking a photo opens it large with a link to the listing.

Checked: lint, `tsc -b`, build; the filter / de-dupe / sort / countdown logic run against sample
data (esbuild bundle). Not clicked through signed in.

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
