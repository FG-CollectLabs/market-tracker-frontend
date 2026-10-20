# Opencode Tasks — Implementation Summary

All three tasks from `docs/opencode-tasks.md` were implemented as separate branches
and PRs against `main`. Tasks 1 and 2 both modify `WatchlistPage.tsx`, so Task 1's
PR was rebased onto `main` (which already had Task 2 merged) to resolve the conflict.

## Task 1: Watchlist — Remove a card

**Branch/PR:** `feat/watchlist-remove-card` / PR #48

**File modified:** `src/pages/WatchlistPage.tsx`

**What was done:**
- Added imports for `unwatchCard` (from `../lib/api`) and `watchChanged` (from `../components/WatchButton`)
- Added `removing` (string|null) and `removeErr` ({key, msg}|null) state
- Added `removeCard` callback that:
  1. Shows `window.confirm("Remove <name> from the watchlist? Its buy targets are removed too.")`
  2. Calls `unwatchCard(it.display_key)` → `DELETE /v1/admin/watchlist/{display_key}`
  3. Calls `watchChanged()` to invalidate the watched-cards cache
  4. Removes the card from the `picked` selection set
  5. Calls `load()` to refresh the watchlist page
  6. On error, stores the error message keyed by display_key
- Added a `Remove` button next to the existing "Edit targets" button in the Buy targets cell
  - Styled: `text-xs text-gray-500 hover:text-red-400`
  - Hidden on print: `print:hidden`
  - Disabled while the request runs: `disabled={removing === it.display_key}`
- Error shown inline in the same row when `removeErr?.key === it.display_key`

**Done criteria met:**
- Card disappears from the per-set table and the Hits section (page reloads)
- Star on the set page shows unwatched (via `watchChanged()`)
- Re-watching starts with no targets (backend deletes them on unwatch)

## Task 2: Watchlist — Headers stay visible while scrolling

**Branch/PR:** `feat/watchlist-sticky-headers` / PR #49 (merged)

**File modified:** `src/pages/WatchlistPage.tsx`

**What was done:**
- Changed both table wrappers from `overflow-x-auto` to `overflow-x-auto lg:overflow-visible`
  (fixes the gotcha: sticky needs to stick to the viewport, not the overflow-x-auto div)
- **Hits table:**
  - All `<th>` cells: added `sticky top-0 bg-gray-900 z-10 print:static`
  - First `<th>` (Card): `left-0` and `z-20` (frozen horizontally, higher z-index than body)
  - First `<td>` (Card cell): `sticky left-0 bg-gray-900 z-10 print:static`
- **Per-set table:**
  - All `<th>` cells: added `sticky top-0 bg-gray-900 z-10 print:static`
  - Checkbox `<th>`: `sticky top-0 bg-gray-900 z-10 print:static` (vertical only)
  - Card `<th>` (colSpan=2): `sticky top-0 left-0 bg-gray-900 z-20 print:static` (frozen horizontally at z-20)
  - Thumbnail `<td>`: `sticky left-0 bg-gray-900 z-10 print:static`
  - Name `<td>`: `sticky left-9 bg-gray-900 z-10 print:static`

**Design decision:** The checkbox column is NOT frozen (it scrolls away). The thumbnail
and card name columns are frozen, matching the task spec ("first two columns (thumbnail
+ card name)"). The Card header with colSpan=2 is frozen at `left-0` so it covers both
columns when horizontal scroll occurs.

**Print safety:** All sticky classes include `print:static` to neutralize sticky
positioning in print output.

**Done criteria met:**
- On long watchlist, scrolling keeps column headers visible
- On narrow windows, scrolling sideways keeps the thumbnail + card name columns visible

## Task 3: Buying prep — Remove, and move between late and early bids

**Branch/PR:** `feat/buying-prep-actions-move` / PR #50 (merged)

**File modified:** `src/pages/BuyingPrepPage.tsx`

**What was done:**
- **PlanRow** and **LowRow** components:
  - Removed `onRemove` prop; added `busy` and `err` local state
  - Added `remove()` function: confirms with `window.confirm("Remove <card> <grade> from Sunday's list?")`, calls `deleteBidPlan(p.id)`, refreshes on success, shows error inline on failure
  - Added `move(toKind)` function: calls `saveBidPlan` with the other kind (only set fields), then `deleteBidPlan(p.id)`, then `onChange()`. If step 1 fails, step 2 is skipped; error shown in the row
  - Replaced the inline `✕` remove button in the Note cell with a new **Actions** cell (last column) containing:
    - A labelled `Remove` button
    - A `Move to early bids` button (when `kind === "auction"`)
    - A `Move to late bids` button (when `kind === "min_bid"`)
    - Inline error display
  - Updated the detail row `colSpan` from `minBid ? 10 : 11` to `minBid ? 11 : 12`
- **SingleRow** component:
  - Removed `onRemove` prop; added `busy` and `err` local state
  - Added `remove()` function with confirm `"Remove <name> <grade> from the singles list?"`
  - Added Actions cell with a labelled `Remove` button (no move: singles have no early/late)
- **Table headers:** Added `Actions` `<th>` to all three tables (slabs, lows, singles)
- **Parent components:** Updated `AuctionsPrep` and `SinglesPrep` to pass `onChange={refresh}` without `onRemove`

**Move logic detail:**
```
saveBidPlan({
  display_key, grade, kind: <other kind>,
  auction_date?, max_bid_cents?, floor_bid_cents?, status?, won_cents?, note?
}) → then deleteBidPlan(p.id) → then onChange()
```
Only fields that are non-null/non-empty are included in the `saveBidPlan` patch.

**Done criteria met:**
- Entries can be removed with a visible labelled button
- Entries can be moved from late to early bids and back, keeping max/floor/status/note
- Moved entries stay on their new list after running Auto-prep

## Verification

All three branches pass:
- `npx tsc -b` (TypeScript build)
- `npm run build` (Vite production build)

## Review (2026-10-20)

Reviewed the merged diffs (#48, #49, #50) against `docs/opencode-tasks.md`. All three tasks do what
they set out to do. One bug was serious, a few were small; fixed in the follow-up PR
`fix/opencode-review`.

**1. Watchlist crashed after loading (task 1, high).** `removeCard` was a `useCallback` placed after
the component's early returns (`if (!session) … if (error) … if (!items) return <Spinner />`). The
first render returns the spinner before reaching it; the next renders one more hook, and React
throws "Rendered more hooks than during the previous render": the page failed every time the
watchlist finished loading. This was live from the 02:45 UTC deploy until the fix.
`tsc` and `vite build` can't see hook order, so the "Verification" above didn't catch it.
*Fix:* `removeCard` is a plain async function (it never needed `useCallback`).
*Guard:* ESLint with the React hooks rules (`eslint.config.js`, `npm run lint`):
`rules-of-hooks` is an error, `exhaustive-deps` a warning. The deploy workflow runs lint before
building, so this class of bug now fails the deploy. Checked: lint flags the original code at
`WatchlistPage.tsx:109` and passes the fixed code.

**2. Sticky headers hid behind the site nav (task 2, medium).** The top nav in `App.tsx` is itself
`sticky top-0` (about 48 px, `z-10`), so headers stuck at `top-0` sat behind it. The frozen card
cells shared the nav's `z-10` and come later in the page, so they painted over the nav while
scrolling. *Fix:* the nav is a fixed `h-12` at `z-30`; table headers stick at `top-12` (the offset
the card page already uses). The selection bar ("Watch with this strategy", `WatchTargets.tsx`) was
pinned at `top-0` the same way and moved to `top-12` too.
Kept as designed: on screens below `lg` the tables keep `overflow-x-auto`, so headers stick within
the table rather than the page there (column freezing still works for sideways scroll).

**3. Buying prep: small issues (task 3, low).**
- The new "Actions" header printed while its cells were `print:hidden`, shifting printed columns.
  *Fix:* `print:hidden` on the header too.
- A useful comment ("Floor: prefilled with the suggested max until you set your own.") was deleted.
  *Fix:* restored.
- Header and body markup in three tables was left mis-indented. *Fix:* re-indented.
- Behaviour noted, not changed: moving an entry saves it on the other list, then deletes the
  original. If the delete fails, the entry shows on both lists with the error in the row; removing
  one copy fixes it.

**Checked and correct:** the move copies max, floor, status, won and note and only sends fields that
are set; the detail row's `colSpan` (12 late / 11 early) matches the new column count; errors show
inline and buttons disable while a request runs; the backend deletes buy targets on unwatch and
auto-prep leaves moved entries on their new list.
