# Small frontend tasks

Three self-contained UI tasks for the market tracker frontend (React + TypeScript + Tailwind, Vite).
No backend work is needed: the endpoints below exist and are deployed.

Before you finish, run `npx tsc -b` and `npm run build`; both must pass. Match the existing code style:
Tailwind utility classes, the dark gray palette, small text (`text-xs` / `text-sm`), no new dependencies.
Open one PR per task against `main`.

---

## 1. Watchlist: remove a card

**Where:** `src/pages/WatchlistPage.tsx`, the per-set tables (one `<tr>` per `WatchItem`).

**Today:** there is no way to take a card off the watchlist from this page.

**Do:**
- Add a **Remove** button to each card row, next to the existing "Edit targets" button in the
  "Buy targets" cell. Style it like a quiet secondary action (`text-gray-500 hover:text-red-400`),
  and hide it when printing (`print:hidden`).
- On click, ask for confirmation (`window.confirm("Remove <card name> from the watchlist? Its buy
  targets are removed too.")`).
- Call `unwatchCard(it.display_key)` from `src/lib/api.ts` (`DELETE /v1/admin/watchlist/{display_key}`;
  it also deletes the card's buy targets), then call `watchChanged()` from
  `src/components/WatchButton.tsx` and the page's `load()` to refresh.
- While the request runs, disable the button. On error, show the message inline in that row.
- Also deselect the card if it's in the `picked` selection set.

**Done when:** removing a card makes it disappear from the table and from the Hits section, the star
on the set page shows it unwatched, and re-watching it starts with no targets.

---

## 2. Watchlist: headers stay visible while scrolling

**Where:** `src/pages/WatchlistPage.tsx`: the Hits table and each per-set table (`<thead>` at about
lines 159 and 202).

**Today:** headers scroll out of view on long tables.

**Do:**
- Make each table's header row sticky: `position: sticky; top: 0` on the `<th>` cells, with an opaque
  background (`bg-gray-900`, matching the section) and `z-10` so rows scroll under it.
- **Gotcha:** each table sits in a `<div className="overflow-x-auto">`. An overflow ancestor makes
  `sticky` stick to that div instead of the page, so the header won't stick while you scroll the page.
  Fix it one of two ways (pick one and apply it consistently):
  - give the wrapper a max height so it scrolls on its own:
    `className="overflow-auto max-h-[75vh]"` (the header then sticks inside it), or
  - drop `overflow-x-auto` on wide screens (`lg:overflow-visible`) and keep it only on narrow ones.
- Freeze the first two columns (thumbnail + card name) as well when the table scrolls sideways:
  `sticky left-0` (and `left-9` for the name column) with the same opaque background. Give the
  frozen header cells a higher `z-20` than the body cells.
- Keep print output unchanged: no sticky or max-height when printing (`print:static`, `print:max-h-none`).

**Done when:** on a long watchlist, scrolling keeps the column headers visible, and on a narrow window
scrolling sideways keeps the card column visible.

---

## 3. Buying prep: remove, and move between late and early bids

**Where:** `src/pages/BuyingPrepPage.tsx`: `PlanRow` (late bids, slabs), `LowRow` (low grades) and
`SingleRow` (singles). The lists come from `fetchBidPlans(date, kind)` with kind `auction`
(late bids) or `min_bid` (early bids).

**Today:** each row has a small ✕ (remove) at the far right after the note box. On a wide table
it's off-screen and hard to find. There is no way to move an entry between the late-bid and
early-bid lists.

**Do:**
- Add an **Actions** cell as the last column of `PlanRow` and `LowRow` (and a header cell for it in both
  tables), and move the remove button into it. Show it as a labelled button ("Remove"), not just ✕,
  with a confirm ("Remove <card> <grade> from Sunday's list?"). Keep `deleteBidPlan(p.id)` + refresh.
- Add a **Move to early bids** button on late-bid rows (`kind === "auction"`), and **Move to late bids**
  on early-bid rows (`kind === "min_bid"`). Moving is two calls:
  1. `saveBidPlan({ display_key, grade, auction_date, kind: <other kind>, max_bid_cents, floor_bid_cents,
     status, won_cents, note })`, copying the row's current values (only send fields that are set).
     `PUT /v1/admin/bid-plans` upserts on (card, grade, date, kind), so if the card is already on the
     other list the values merge into that row.
  2. `deleteBidPlan(p.id)` to remove the original row, then refresh.
  If step 1 fails, don't run step 2; show the error in the row.
  The backend's auto-prep leaves a card on whichever list you moved it to (it won't re-add it to the
  original list on its next run).
- Optional: a checkbox per row and a small bar above the table with "Remove selected" and "Move selected
  to early/late bids" that run the same calls for each selected row, one after another.
- `SingleRow`: same labelled Remove button in an Actions cell (no move: singles have no early/late).

**Done when:** an entry can be removed with a visible button, moved from late to early bids and back
(keeping its max, floor, status and note), and a moved entry stays on its new list after running
Auto-prep.

---

## Reference

- API helpers: `src/lib/api.ts` (`unwatchCard`, `saveBidPlan`, `deleteBidPlan`, `fetchBidPlans`,
  `fetchWatchlist`).
- Admin calls need the signed-in session; they're already wrapped by `adminFetch`.
- Watch-state cache: `watchedCards()` / `watchChanged()` in `src/components/WatchButton.tsx`.
