# Snipe board: small frontend tasks

Five self-contained UI tasks on the **Deals → Ending soon** tab (`src/components/EndingSoonTab.tsx`)
and the Settings page. React + TypeScript + Tailwind (Vite). No backend work is needed: every field
and endpoint below exists (backend PR #82, frontend PR `feat/snipe-board`, both merged before you start).

## How to work

1. Start from an up-to-date `main`: `git checkout main && git pull`.
2. Make **one branch and one PR per task** against `main`, branch names `snipe/<n>-<short-name>`
   (e.g. `snipe/1-countdown`). **Open the PR, do not merge it.** The owner reviews and merges.
3. Before each PR, run `npm run lint`, `npx tsc -b` and `npm run build`. All three must pass (the deploy
   runs lint first). Lint covers the React hooks rules, which the type checker can't see: **never call
   a hook (`useState`, `useEffect`, `useMemo`, `useCallback`, ...) after a component's early `return`**
   (`if (!data) return <Spinner />`). That crashed the Watchlist page once.
4. Match the existing style: Tailwind utility classes, the dark gray palette, small text
   (`text-xs` / `text-sm`), `HelpDot` from `src/components/HelpTip.tsx` for explanations. **No new
   dependencies.** Don't change files outside the ones each task names unless you must, and say so.
5. When all PRs are open, write **`docs/opencode-tasks-snipe-summary.md`** (commit it on the last
   task's branch) with, per task:
   - the PR number and link
   - what you built and which files changed
   - anything you weren't sure about, skipped, or did differently from this spec, and why
   - how you checked it (lint/tsc/build output, what you clicked through in `npm run dev`)
   Leave a `## Review` heading at the end, empty: the reviewer fills it in.

---

## 1. Live countdown in the last hour

**Where:** `EndingSoonTab.tsx`, the "Ends in" cell (`endsIn(a.ends_at, now)`) and the clock effect
(`setNow` every 30 s).

**Do:**
- Tick the clock every second while any shown auction ends within 60 minutes (keep 30 s otherwise).
  One interval for the whole table, not one per row.
- Under 60 minutes show `mm:ss` (e.g. `12:05`); under 5 minutes make it `text-red-400 font-semibold`.
  Past the listed close show `extended?` in amber (Fanatics extends on late bids; the snipe window
  stays open 10 minutes past the close).
- Same treatment for the "next close" countdown in `PulseBar`.

**Done when:** a lot closing in 4 minutes counts down live in red, and nothing re-renders every second
when nothing closes within the hour.

---

## 2. Alert on new snipes

**Where:** `EndingSoonTab.tsx`.

**Do:**
- Track the `url`s of rows with a non-empty `signals` array. After each reload (every 2 min, or after
  "Scan now"), find rows that weren't flagged last time.
- Add a toggle **"Alert me"** next to "Snipes only". When on and there are new flagged rows:
  - play a short beep with the Web Audio API (an `OscillatorNode`, ~200 ms; no audio files)
  - show a desktop notification (`Notification`, ask permission when the toggle is first turned on)
    with the card name, grade and the signal label(s), e.g. `Umbreon ex SIR PSA 10: Under cost to make`.
    Click opens the auction `url`.
  - briefly highlight the new rows (e.g. `ring-1 ring-emerald-400` for 10 s).
- Don't alert on the first load of the page, only on changes after it.
- If notifications are denied, keep the beep and highlight and show a small note.

**Done when:** with "Alert me" on, a row that gains a signal on a reload beeps once and notifies once.

---

## 3. Remember filters

**Where:** `EndingSoonTab.tsx` state: `hours`, `snipesOnly`, `watchedOnly`, `noBids`, `minDisc`, `sort`,
plus "Alert me" from task 2 if merged.

**Do:**
- Save them to `localStorage` under one key, `endingSoon.filters`, as JSON; restore on load.
- Wrap every read and write in `try/catch` (private windows throw) and fall back to the defaults.
  Ignore unknown or invalid values (e.g. an `hours` that isn't one of the buttons).

**Done when:** setting "Snipes only" + 1 h, reloading the browser, keeps both.

---

## 4. Copy the max bid

**Where:** `EndingSoonTab.tsx`, the "Bid up to" cell.

**Do:**
- Each figure in that cell (margin, at value, vs make, to flip) gets a small copy button (`⧉`, quiet,
  `text-gray-500 hover:text-gray-200`, `print:hidden`) that copies the **whole-dollar number without
  `$` or commas** (e.g. `142`) with `navigator.clipboard.writeText`. Fanatics' bid box wants a number.
- Show `✓` for 1.5 s after copying. If the clipboard call fails, show `✕` with the error as `title`.

**Done when:** clicking copy next to "$142 to flip" puts `142` on the clipboard.

---

## 5. Settings: snipe thresholds

**Where:** the Settings page (find it via `src/App.tsx` routes; it edits `GET/PUT /v1/admin/settings`
through the helpers in `src/lib/api.ts`). Add the type if it's missing.

**The backend setting** (`settings.snipe`, all fractions):
| field | default | meaning |
|---|---|---|
| `mint_gap` | 0.25 | flag "Under cost to make" when all-in is at least this far under the cost to make the slab |
| `discount` | 0.40 | flag "Deep discount" when all-in is at least this far under value |
| `flip_margin` | 0.30 | flag "Buy Now flip" when relisting nets at least this margin after the selling fee |

The backend rejects mint_gap or discount outside 0 to under 1, or flip_margin outside 0–5, with a 400 ("a snipe rule is out of range").

**Do:**
- A "Snipe signals" section with three percent inputs (show `25`, store `0.25`), each with a one-line
  hint from the table, saved with the rest of the settings. Show the backend's error message on 400.
- Keep any other settings fields untouched when saving (send the whole object back as the page already does).

**Done when:** changing "Under cost to make" to 30% and saving changes which rows the Ending soon tab flags.

---

## Reference

- API: `fetchEndingSoon(hours, signalsOnly)`, `runSnipePulse(sweep)`, types `EndingAuction`,
  `PulseStatus`, `SnipeSignal`, `SnipeRules` in `src/lib/api.ts`.
- Signals: `under_mint`, `flip`, `deep_discount` (labels and colors in `SIGNAL` in `EndingSoonTab.tsx`).
- Admin calls need the signed-in session; `adminFetch` handles it. `useSession()` from `src/lib/auth`.
- The sticky site nav is `h-12 z-30`; anything sticky goes at `top-12` and under `z-30`.
