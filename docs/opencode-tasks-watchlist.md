# Watchlist cleanup: frontend tasks

**Task 1 (bulk actions) is done:** PR #67, reviewed and merged. **Tasks 2-4 below replace the
earlier tasks 2-4** (drawer / pass and notes / filters). Don't build the old ones.

React + TypeScript + Tailwind (Vite). **No backend work is needed:** every endpoint, field and
`src/lib/api.ts` function below exists (backend PRs #91 and #93, frontend PR #68, all merged before you
start).

## How to work (follow exactly)

1. Start from an up-to-date `main`: `git checkout main && git pull`. Confirm `runBulk` exists in
   `src/pages/WatchlistPage.tsx` and `HIT_REASONS` exists in `src/lib/api.ts`; if either is missing,
   stop and say so.
2. **One branch and one PR per task**, branch names `watch/2-cards`, `watch/3-reviews`,
   `watch/4-filters`. All three change `WatchlistPage.tsx`, so **stack them**: branch task 3 from task
   2's branch and task 4 from task 3's, and write "stacked on #N" in each PR description. **Open the PRs;
   never merge them.**
3. Before every PR run `npm run lint`, `npx tsc -b` and `npm run build`. All three must pass. Lint covers
   the React hooks rules: **never call a hook (`useState`, `useEffect`, `useMemo`, `useCallback`, ...)
   after a component's early `return`** (`if (!items) return <Spinner />`). That crashed this page once.
4. Style: Tailwind utility classes, the dark gray palette, small text (`text-xs` / `text-sm`),
   `HelpDot` (`src/components/HelpTip.tsx`) for explanations, `print:hidden` on controls. **No new
   dependencies.** The site nav is sticky, `h-12`, `z-30`: sticky things go at `top-12` under `z-30`;
   an overlay (drawer, menu) may use `z-40`.
5. Reuse what exists: `TargetEditor` and `CardPrepButtons` (`src/components/WatchTargets.tsx`),
   `runBulk` and the selection bar (task 1), `watchChanged()` (`src/components/WatchButton.tsx`) after
   any change. Don't rewrite them.
6. When all three PRs are open, **add a section per task** to
   `docs/opencode-tasks-watchlist-summary.md` (keep the task 1 section and the `## Review` heading as
   they are). Commit it on the task 4 branch. For each task, give:
   - the PR number and link
   - what you built and which files changed
   - anything you weren't sure about or did differently from this spec, and why
   - how you checked it (lint / tsc / build output, what you clicked through in `npm run dev`)

## What the data looks like

- `fetchWatchlist(keysOnly?, showPassed?)` returns `items: WatchItem[]`. Each has `display_key`,
  `name`, `number`, `set_name`, `image_url`, and `targets_detail: WatchTarget[]`.
- **Each `WatchTarget`** has:
  - `target`: one of `raw_grade`, `raw_invest`, `cgc_10`, `psa_10`, `regrade`. Labels and descriptions
    are in `BUY_TARGETS`.
  - `rule_text`, and `max_cents` (the headline max).
  - `hits: TargetHit[]`, and `passed_hits` (how many you set aside).
  - `gate`: set when a "Raw to invest" target is paused, with why (e.g. "raw is still falling after
    release").
- **Each `TargetHit`** has:
  - `source` (`fanatics` | `ebay`), `listing_id`, `grade_key`, `kind` (`buy_now` | `auction`)
  - `price_cents` (ask or current bid) and `all_in_cents` (Fanatics auctions include the buyer's
    premium)
  - `max_cents`: the max **for this copy's grade**. Use it, not the target's.
  - `bids?` and `ends_at?` (auctions), `title`, `url`
  - `image_url?` and `image_count?` (eBay photos: `image_count === 1` on a raw listing means the back
    isn't shown)
  - `review?`: `{status: "pass" | "note", reason?, note?, price_cents?, reviewed_at}`
- **Reviews:**
  - `reviewHit({source, listing_id, display_key, status, reason?, note?, price_cents?})` sets a hit
    aside or keeps a note on it. `HIT_REASONS` gives the reasons with labels and hints: Not this card,
    Damaged, Wrong variant, Not interested, Other.
  - `clearHitReview(source, listing_id)` undoes either.
  - Set-aside hits are left out of `hits` unless you call `fetchWatchlist(false, true)`, which returns
    them with `review.status === "pass"`.

---

## 2. One row per card, with its listings under it

**Where:** `WatchlistPage.tsx`: the **Hits** section (one big table of every listing) and the per-set
card tables.

**Today:** hits are one long list across all cards; editing strategies opens inline in the table.

**Do:**
- **Remove the big Hits table.** In its place, a small **"Best hits"** strip: the 8 hits most under
  their max across shown cards (photo thumbnail, card name, price vs max, "under by %"). Each one
  scrolls to its card and expands it.
- **Per-set card rows stay.** Each card row shows:
  - the card thumbnail, name, number and set
  - **strategy chips**, one per target: label and headline max, e.g. `PSA 10 ≤ $80` or
    `Raw to invest ≤ $12`, with `title` = `rule_text`. A target with `gate` shows its chip in amber
    with "paused", and `title` = the gate text.
  - a **hit count** badge ("6 listings"; green when > 0)
  - existing buttons (`CardPrepButtons`, Remove)
- **Clicking a card row expands it** (one or more open at a time; remember which are open while the page
  is open). The expanded area lists **that card's hits**, sorted by "under by" (1 − all_in ÷ max), each
  row showing:
  - a 48 px photo (`image_url`, `loading="lazy"`; a gray box when missing)
  - source and kind badges (`eBay` / `Fanatics`, `Buy Now` / `auction`), grade (`grade_key`
    upper-cased), and the strategy it matched
  - price, all-in, max, under by %
  - auctions: bids and time left
  - the title as a link to the listing (new tab)
- **"Edit strategies"** in the expanded area opens `TargetEditor` in a **drawer** on the right
  (`fixed inset-y-0 right-0 w-[32rem] max-w-full z-40`, a backdrop that closes it on click). Escape,
  Cancel and Save close it. After Save, reload and keep the row expanded.
- Keep the filters above the tables, the select-all and bulk bar (task 1), and printing (expanded
  listings print; drawer and buttons don't).

**Done when:** you can scan the cards, expand one to see exactly what's listed for it with photos and
links, and edit its strategies without the table jumping.

---

## 3. Set listings aside, with a reason

**Where:** the expanded listing rows from task 2.

**Do:**
- Each listing row gets two quiet actions (`print:hidden`):
  - **"Set aside ▾"**: a small menu of `HIT_REASONS` (label, `title` = hint) and an optional note
    field. Choosing one calls `reviewHit({source, listing_id, display_key, status: "pass", reason,
    note, price_cents: all_in_cents})`. The row leaves the list at once (local state). An inline
    **Undo** shows for 5 s and calls `clearHitReview`.
  - **"Note"**: an inline text input (max 2000 characters) with Save / Cancel. Saves with
    `status: "note"`. The note shows under the title (`text-[11px] text-amber-200/80`), and the listing
    stays. Saving an empty note calls `clearHitReview`.
- A toggle above the tables: **"Show set-aside (N)"**, N = the sum of `passed_hits` across shown
  targets. When on, reload with `fetchWatchlist(false, true)`. Set-aside rows show dimmed
  (`opacity-50`) with a reason badge ("Not this card", "Damaged", ...; `no_back_photo` shows "No back
  photo · auto") and **"Restore"** (`clearHitReview`, then reload).
- The card's hit count (task 2) counts only listings not set aside.
- Errors show inline on the row, never in `alert()`.

**Done when:**
- setting a listing aside as "Not this card" removes it, and it stays gone after a reload
- "Show set-aside" brings it back with its reason
- Restore returns it to the normal list
- a note survives a reload

---

## 4. Filters, auctions and photos

**Where:** above the tables, and the expanded listing rows.

**Do:**
- Filters that apply to every card's listings, as small button groups like the Deals page:
  - **Kind:** All / Auctions / Buy Now
  - **Source:** All / Fanatics / eBay
  - a checkbox **"Hide 1-photo raw listings"** (raw listings with `image_count === 1`)

  The card hit counts and "Best hits" follow the filters. Remember the filters in `localStorage`
  (`watchlist.filters`, every read and write in try/catch).
- A **sort** for the expanded listings: "Most under max" (default), "Ending soonest" (auctions by
  `ends_at`, then Buy Nows), "Cheapest".
- **Auction rows:** current bid, bids, and time left from `ends_at`: `2d 4h`, `3h 12m`, or `mm:ss`
  under an hour. One shared clock for the page: every 30 s, every second while any shown auction ends
  within the hour. Under 5 minutes: red.
- **Photos:** a **"1 photo"** badge (amber) on raw listings with `image_count === 1`, `title` = "Only one
  photo: the back isn't shown". Clicking a listing's photo opens it larger in an overlay (`z-40`,
  Escape or a click closes it) with a link to the listing.

**Done when:** you can show only eBay auctions ending soonest, with live countdowns and photos, and hide
the single-photo raw listings.

---

## Reference

- Types and functions: `src/lib/api.ts`. Search `BUY_TARGETS`, `TargetHit`, `HIT_REASONS`,
  `reviewHit`, `clearHitReview`, `fetchWatchlist`.
- `TargetEditor`, `CardPrepButtons`: `src/components/WatchTargets.tsx`.
- Watch-state cache: `watchedCards()` / `watchChanged()` in `src/components/WatchButton.tsx`.
- Admin calls need the signed-in session; `adminFetch` handles it.
