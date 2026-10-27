# Watchlist round 2: frontend tasks for opencode

Two small, independent UI tasks. React + TypeScript + Tailwind (Vite). **No backend work and no new
dependencies.** Claude is building the larger watchlist changes (tabs per buy target, "interested" /
max-bid marks, the set-aside history) at the same time in other files, so **change only the files named
in each task.**

## How to work (follow exactly)

1. Start from an up-to-date `main`:
   `cd /home/phil/workspace/fg-collectlabs/market-tracker-frontend && git checkout main && git pull --ff-only`.
   Then check these anchors exist; if any is missing, **stop and say so** (it means your `main` is stale):
   - `src/components/WatchSuggestions.tsx` contains `const [open, setOpen] = useState(true);`
   - `src/pages/WatchlistPage.tsx` contains `sortHits(ch.all, filters.sort).map((x) => (`
   - `src/components/WatchHits.tsx` exports `HitRow` and `sortHits`
2. **One branch and one PR per task, both branched from `main`** (they don't depend on each other):
   `watch2/1-suggestions-collapsed`, `watch2/2-listing-columns`. **Open the PRs; never merge them.**
3. Before every PR run `npm run lint`, `npx tsc -b` and `npm run build`. All three must pass. Never call a
   React hook after an early `return` in a component.
4. Style: Tailwind utility classes, the existing dark gray palette, `text-xs` / `text-sm`. Wrap every
   `localStorage` read and write in `try { … } catch { … }` (it can throw in private windows).
5. When both PRs are open, create `docs/opencode-tasks-watchlist-2-summary.md` **on the
   `watch2/2-listing-columns` branch** with one section per task: PR number and link, what you changed,
   anything you did differently from this spec and why, and how you checked it (lint / tsc / build
   output, what you clicked in `npm run dev`).

---

## 1. Suggestions collapsed by default

**File:** `src/components/WatchSuggestions.tsx` only.

**Today:** the "Suggestions" panel at the top of the Watchlist starts open (`useState(true)`).

**Do:**
- Start collapsed: the initial value of `open` is read from `localStorage` key
  `watchlist.suggestions.open` (`"1"` = open); anything else, a missing key or an error means **closed**.
- When the user clicks the toggle, save the new state to that key (`"1"` or `"0"`).
- Keep the header line visible when collapsed, including the count ("N to review") and the "Run now"
  button. Change nothing else.

**Done when:** a fresh visit shows Suggestions collapsed; opening it and reloading keeps it open;
closing it and reloading keeps it closed.

---

## 2. Listings in two columns: Buy Now and Auctions

**File:** `src/pages/WatchlistPage.tsx` only (use `HitRow` and `sortHits` from
`src/components/WatchHits.tsx` as they are; don't edit that file).

**Today:** clicking a card row opens its listings as one list (`sortHits(ch.all, filters.sort).map(...)`
inside `<div className="divide-y divide-gray-800 print:divide-gray-200">`).

**Do:**
- Replace that single list with **two columns side by side**:
  `<div className="grid gap-3 md:grid-cols-2">`. Left: **Buy Now**, right: **Auctions**.
  - Split `ch.all` by `x.h.kind` (`"buy_now"` vs `"auction"`). Sort each part with
    `sortHits(part, filters.sort)`.
  - Each column has a small heading: `Buy Now (N)` / `Auctions (N)`
    (`text-[11px] font-semibold text-gray-400 uppercase tracking-wide`), then its rows in
    `<div className="divide-y divide-gray-800 print:divide-gray-200">`, each row rendered with the exact
    same `<HitRow … />` element and props as today.
  - An empty column shows `None right now.` (`text-xs text-gray-600 py-2`).
- When the Kind filter is **Auctions** or **Buy Now** (`filters.kind !== "all"`), show only that one
  column, full width (no empty second column).
- Keep everything around it as it is: the "N listings at or under a target price" line, the Undo line,
  the "Nothing listed…" message when `ch.all` is empty (then show neither column), and printing.

**Done when:** opening a card with both kinds shows Buy Nows on the left and auctions on the right,
each sorted by the page's Sort; with Kind = Auctions only the auction column shows; on a narrow window
the columns stack.
