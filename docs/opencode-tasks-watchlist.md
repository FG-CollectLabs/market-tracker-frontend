# Watchlist cleanup: frontend tasks

Four UI tasks on the Watchlist page (`src/pages/WatchlistPage.tsx`) and its components. React +
TypeScript + Tailwind (Vite). **No backend work is needed:** the endpoints and the `src/lib/api.ts`
functions below exist (backend PR #91 and the frontend PR that added this file, both merged before
you start).

## How to work

1. Start from an up-to-date `main`: `git checkout main && git pull`.
2. **One branch and one PR per task** against `main`, branch names `watch/<n>-<short-name>`
   (e.g. `watch/1-bulk-actions`). **Open the PR, do not merge it.** The owner reviews and merges.
   Tasks 1-4 all touch `WatchlistPage.tsx`: keep each task's changes to what it needs, so the PRs
   merge cleanly one after another. If one task depends on another's code, say so in the PR.
3. Before each PR, run `npm run lint`, `npx tsc -b` and `npm run build`. All three must pass (the
   deploy runs lint first). Lint covers the React hooks rules the type checker can't see: **never call
   a hook (`useState`, `useEffect`, `useMemo`, `useCallback`, ...) after a component's early `return`**
   (`if (!items) return <Spinner />`). That crashed the Watchlist page once.
4. Match the existing style: Tailwind utility classes, the dark gray palette, small text (`text-xs` /
   `text-sm`), `HelpDot` from `src/components/HelpTip.tsx` for explanations, `print:hidden` on
   controls. **No new dependencies.** The site's top nav is sticky, `h-12` and `z-30`: sticky things go
   at `top-12` and under `z-30`; an overlay (drawer, modal) may use `z-40`.
5. When all PRs are open, write **`docs/opencode-tasks-watchlist-summary.md`** (commit it on the last
   task's branch) with, per task: the PR number and link; what you built and which files changed;
   anything you weren't sure about, skipped, or did differently from this spec, and why; how you checked
   it (lint / tsc / build output, what you clicked through in `npm run dev`). Leave an empty `## Review`
   heading at the end for the reviewer.

## What exists (read this first)

- **Strategies** replace the old grade targets. `BUY_TARGETS` (key, label, grades, hint), `RULES_FOR`,
  `RULE_KINDS` and the `BuyTarget` type are in `src/lib/api.ts`. The five keys: `raw_grade`,
  `raw_invest`, `cgc_10`, `psa_10`, `regrade`.
- **`TargetEditor`** (`src/components/WatchTargets.tsx`) edits one card's strategies (all five listed
  with on/off toggles). It already saves through `putTargets` and calls `watchChanged()`. Reuse it,
  don't rewrite it.
- **Each `WatchItem`** has `targets_detail: WatchTarget[]`; each target has `rule_text`, `max_cents`
  (headline), `hits: TargetHit[]` and `passed_hits` (how many hits you passed on).
- **Each `TargetHit`** has `source` (`fanatics` | `ebay`), `listing_id`, `grade_key`, `kind`
  (`buy_now` | `auction`), `price_cents` (ask or current bid), `all_in_cents` (Fanatics auctions include
  the buyer's premium), `max_cents` (the max **for this copy's grade**: use this, not the target's),
  `bids?`, `ends_at?` (auctions), `title`, `url`, and `review?` (`{status: "pass" | "note", note?,
  price_cents?, reviewed_at}`).
- **Hits now include eBay auctions** (refreshed every 3 hours) besides Fanatics auctions and Buy Nows
  and eBay Buy Nows.
- **API functions:**
  - `fetchWatchlist(keysOnly?, showPassed?)`: `showPassed = true` also returns passed hits (with
    `review.status === "pass"`)
  - `reviewHit({source, listing_id, display_key, status, note?, price_cents?})`: pass or note
  - `clearHitReview(source, listing_id)`: undo a pass or drop a note
  - `putTargets(displayKey, targets)`: replace a card's strategies (`[]` clears them)
  - `applyPreset(displayKeys, presetKey)`
  - `unwatchCard(displayKey)`: removes the card and its strategies
  - `watchChanged()` (`src/components/WatchButton.tsx`): call after any change so stars elsewhere update

---

## 1. Bulk actions on selected cards

**Where:** `WatchlistPage.tsx`: the `picked` selection set and the `PresetBar` above the tables
(`src/components/WatchTargets.tsx`).

**Today:** you can tick cards and apply a preset to them, but removing many cards means clicking
Remove on each one, and there's no "select everything shown".

**Do:**
- A **"Select all shown"** checkbox above the tables that selects every card passing the current
  filters (not just one set), with the count ("Select all 37 shown"). It becomes "Clear selection"
  when everything shown is selected.
- In the selection bar (extend `PresetBar` via its `extra` prop, or a new bar in the same sticky spot),
  next to "Watch with this strategy":
  - **"Remove N from watchlist"**: one `window.confirm("Remove N cards from the watchlist? Their
    strategies are removed too.")`, then `unwatchCard` for each, one at a time. Show progress
    ("Removing 3 / 12…"), then a result line ("Removed 12", or "Removed 10; 2 failed: <names>"). Clear
    the selection, call `watchChanged()` and reload.
  - **"Clear strategies"**: confirm, then `putTargets(key, [])` for each. Keeps the cards watched, with
    no strategies. Same progress and result handling.
- Disable the buttons while a bulk action runs. Never run requests in parallel (one at a time).

**Done when:** 20 cards can be removed in two clicks (select all shown, Remove + confirm), and a
failure on one card doesn't stop the rest.

---

## 2. Edit strategies in a side drawer

**Where:** `WatchlistPage.tsx`: the per-set tables, where "Edit targets" expands the row with
`TargetEditor` inline (`editing` state).

**Today:** the editor opens inside the table row, which pushes the table around and is hard to use on
long lists.

**Do:**
- Open `TargetEditor` in a **drawer** fixed to the right side (`fixed inset-y-0 right-0`, about
  `w-[32rem] max-w-full`, `z-40`, a dark backdrop that closes it on click). At the top: the card
  thumbnail, name, set and number, and a link to the card page.
- Below the editor in the drawer: the card's **current hits** (all its targets' `hits`), each with
  source, kind, grade, price and all-in, and a link to the listing.
- Close on Escape, on the backdrop, on Cancel and after Save. Keep the page's scroll position. Only
  one drawer at a time.
- In the table, replace the "Edit targets" button with **compact strategy chips** per card: one chip
  per strategy showing label and headline max (e.g. `PSA 10 ≤ $80`, `Raw to grade ≤ $12`, or `CGC 10 ·
  no rule`). Clicking any chip, or a small "+ strategy" chip when there are none, opens the drawer.
  `title` on each chip = its `rule_text`.

**Done when:** editing a card's strategies never moves the table, and the drawer shows that card's
hits while you edit.

---

## 3. Pass and notes on hits

**Where:** `WatchlistPage.tsx`: the **Hits** section table.

**Do:**
- Two quiet actions on each hit row (`print:hidden`):
  - **Pass**: `reviewHit({source: h.source, listing_id: h.listing_id, display_key: it.display_key,
    status: "pass", price_cents: h.all_in_cents})`. The row leaves the list (update local state, no
    full reload needed). A small "Undo" toast or inline link for a few seconds calls `clearHitReview`
    and puts it back.
  - **Note**: opens a small inline text input (max 2000 characters) with Save / Cancel; saves with
    `status: "note"` and the text. The note shows under the listing title (`text-[11px]
    text-amber-200/80`). A noted hit stays in the list. Editing the note again pre-fills it; saving an
    empty note calls `clearHitReview`.
- A toggle above the table: **"Show passed (N)"**, where N is the sum of `passed_hits` across shown
  targets. When on, reload with `fetchWatchlist(false, true)`. Passed rows are dimmed (`opacity-50`),
  tagged "passed", and have **"Undo pass"** (`clearHitReview`, then reload).
- Show errors inline on the row, not in an alert.

**Done when:** passing a hit removes it and it stays gone after a reload; a note survives a reload;
"Show passed" brings passed hits back, and undoing a pass returns the hit to the normal list.

---

## 4. Hits: auctions and filters

**Where:** `WatchlistPage.tsx`: the **Hits** section.

**Do:**
- Filters above the hits table: **kind** (All / Auctions / Buy Now) and **source** (All / Fanatics /
  eBay), as small button groups like the ones on the Deals page.
- For auction hits, show the **current bid**, **bids** (`h.bids`) and **ends in** (from `h.ends_at`:
  `2d 4h`, `3h 12m`, or `mm:ss` under an hour; refresh the clock every 30 s, every second in the last
  hour). Under 5 minutes: red. Buy Now rows show "Buy Now" in that column.
- A **sort** select: "Most under max" (today's order), "Ending soonest" (auctions first, by
  `ends_at`), "Cheapest".
- Source badge on each row: `Fanatics` / `eBay`, plus `auction` or `Buy Now`.
- Keep "Your max" as `h.max_cents` (per grade) and "Under by" as `1 - all_in / max`.

**Done when:** you can show only eBay auctions ending soonest, with live countdowns, and only Fanatics
Buy Nows cheapest first.

---

## Reference

- Strategy and hit types, API functions: `src/lib/api.ts` (search `BUY_TARGETS`, `TargetHit`,
  `reviewHit`).
- Editor: `TargetEditor` in `src/components/WatchTargets.tsx`.
- Watch-state cache: `watchedCards()` / `watchChanged()` in `src/components/WatchButton.tsx`.
- Admin calls need the signed-in session; `adminFetch` handles it.
