// The development roadmap and patch notes shown on the Roadmap tab. Edit this
// file (or ask the agent to) in a PR; the git history is the audit trail.

export type Status = "done" | "in_progress" | "next" | "later" | "blocked";

export interface RoadmapItem {
  title: string;
  detail?: string;
  status: Status;
  links?: { label: string; href: string }[];
}

export interface Phase {
  id: string;
  title: string;
  goal: string;
  items: RoadmapItem[];
}

export interface PatchNote {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
  links?: { label: string; href: string }[];
}

const BE = "https://github.com/FG-CollectLabs/market-tracker-backend/pull/";
const FE = "https://github.com/FG-CollectLabs/market-tracker-frontend/pull/";

// Questions waiting on a decision, shown at the top of the page.
export const OPEN_QUESTIONS: string[] = [
  "Cost basis: the owned-cards feed has no purchase price, so hold-vs-sell can value a card and forecast it but can't show profit on it yet. Add purchase price (and date) to the feed, or keep a separate cost table?",
  "Pristine 10 buying rules (deferred).",
  "Fanatics ingest cost at ~3x the tracked cards (Apify fallback): set a monthly budget before the full English rollout.",
];

export const PHASES: Phase[] = [
  {
    id: "coverage",
    title: "1. Coverage: owned cards + the sets worth grading",
    goal: "Every card owned is tracked, plus Illustration Rare-and-better from Sun & Moon through Mega Evolution, so the analytics have enough sets behind them.",
    items: [
      { title: "Owned-cards sync", status: "done",
        detail: "sync-owned pulls the FGL owned-cards feed into owned_cards (grader + grade + label, quantity, certs) and tracks every match. Cards that leave the feed are flagged, never untracked. Daily schedule proposed." },
      { title: "English catalog import (SM, SWSH, SV, ME + promos, galleries)", status: "done",
        detail: "import-en creates ~70 English sets from TCGdex; the tracking rules add IR / SIR / UR / HR / MHR, SWSH-SM Secret and Ultra Rares, and every Trainer / Galarian Gallery card (~3,000 cards)." },
      { title: "Chinese cards", status: "next", detail: "TCGdex has Chinese data; Chinese sets and their PriceCharting / pop sources still need mapping. Owned Chinese cards are listed as unmatched until then." },
      { title: "Promo sources (box vs ETB vs collection)", status: "later",
        detail: "Neither TCGdex nor PriceCharting says which product a promo came from; a hand-kept list lets the Timing page split box full-art promos from ETB promos." },
      { title: "Japanese promos and Classic decks", status: "next", detail: "SV-P promos and the Trainer Card Game Classic decks aren't in the catalog yet." },
      { title: "Pop reports and prices for the new sets", status: "next", detail: "GemRate set mapping (gemrate-sets --apply), PriceCharting history backfill and Fanatics comps for the new English cards." },
    ],
  },
  {
    id: "data",
    title: "2. Data quality and cost",
    goal: "Trustworthy inputs at the larger scale.",
    items: [
      { title: "Stamped printings as their own card", status: "done", detail: "Box toppers and set-stamped promos split from the regular card (ME1 Bulbasaur #133)." },
      { title: "PriceCharting cross-checked against our sales", status: "done", detail: "With 5+ sales in 90 days, a PriceCharting price off by 1.75x+ is replaced by the sales median." },
      { title: "Market value from what sold, never a listing", status: "done", detail: "Fanatics Buy Nows are competition and ceiling only." },
      { title: "This week's auctions only", status: "done", detail: "Auction close times stored; next week's lots counted separately." },
      { title: "Review pull-rate estimates and the trainer tier list", status: "next", detail: "Both are ballpark (factors.yaml); per-set overrides for special sets (151, Prismatic, high-class JP)." },
      { title: "Warm the caches after each deploy", status: "next", detail: "The first minute after a deploy rebuilds the models; requests can fail meanwhile." },
      { title: "Price groups for every grade owned", status: "next", detail: "Sales groups for PCG, SGC, BGS and CGC 9 so owned slabs at those grades get comps." },
      { title: "Fanatics ingest budget at 3x the cards", status: "next" },
      { title: "423 ingest rows hitting numeric overflow", status: "later" },
      { title: "14 PriceCharting backfill failures", status: "later" },
    ],
  },
  {
    id: "analytics",
    title: "3. Analytics: when to buy and what it returns",
    goal: "Fine-tune the best moment to buy each card and forecast returns per grade.",
    items: [
      { title: "Buying guide, Deals, fair value of a 10, release-curve timing", status: "done",
        links: [{ label: "BE #30", href: BE + "30" }, { label: "BE #31", href: BE + "31" }, { label: "FE #14", href: FE + "14" }, { label: "FE #15", href: FE + "15" }] },
      { title: "Release curves on enough sets", status: "next",
        detail: "Provisional until 8+ sets back every month through the buying window; firms up as the English sets' history loads." },
      { title: "Compare by Pokémon, artist, trainer tier and scarcity", status: "done", detail: "Timing: curves, hold returns, appreciation and selloff risk per group and grade." },
      { title: "Card strategy and set-page plays", status: "done", detail: "Invest / grade / flip / wait / pass with buy-by prices, on card pages, set tables and the watchlist." },
      { title: "Bid helper: auctions by week vs cost to grade", status: "done" },
      { title: "Sell-through supply (weeks of Buy Now supply)", status: "done" },
      { title: "Return forecasts per grade", status: "later",
        detail: "Expected appreciation of raw, PSA 9, PSA 10, CGC 10 and Pristine by months since release, desirability and supply, with ranges." },
      { title: "Hold vs churn", status: "later",
        detail: "Annualized return of holding a card (forecast appreciation minus cost of capital) vs selling now and redeploying at the typical deal margin." },
      { title: "Crack CGC/BGS slabs to regrade with PSA", status: "later",
        detail: "Its own Deals tab. Several strategies (high-grade CGC 10s, BGS 9.5s, centering-driven picks), and the CGC-to-PSA conversion rate isn't published, so it needs our own crack log to estimate." },
      { title: "PSA 9 regrade score", status: "later" },
      { title: "Pristine 10 buying rules", status: "blocked", detail: "Waiting on a decision." },
    ],
  },
  {
    id: "portfolio",
    title: "4. Portfolio: sell now on Fanatics, or hold",
    goal: "For every owned card: what it's worth today, what it should be worth later, and a sell-now / hold call.",
    items: [
      { title: "Pricing API for the admin panel", status: "done", detail: "/v1/pricing: list price, offer thresholds and eBay vs Fanatics vault per owned card." },
      { title: "Portfolio view of owned cards", status: "later", detail: "Market value per owned grade, freshness, liquidity, trend and release-curve phase." },
      { title: "Sell-now vs hold recommendation", status: "later", detail: "Net proceeds on Fanatics today vs the forecast, cost of capital and the churn alternative; a batch list to send to Fanatics." },
      { title: "Cost basis and P&L", status: "blocked", detail: "Needs purchase prices (see open questions)." },
    ],
  },
  {
    id: "platform",
    title: "5. Platform",
    goal: "Keep the system easy to run and audit.",
    items: [
      { title: "Developer tab: roadmap, patch notes, architecture", status: "done" },
      { title: "Watchlist with a printable buy list", status: "done" },
      { title: "Job queue + worker with priority tiers (phase 1)", status: "done", detail: "fgl-worker, Automation page, audited settings; Fanatics refresh by tier; daily owned-cards sync." },
      { title: "Move PriceCharting and pop jobs to the worker", status: "next" },
      { title: "Agent workers (phase 2): deal vetting and data triage", status: "done",
        detail: "claude -p workers on two subscription accounts (primary first, then secondary); findings on Automation and Deals." },
      { title: "More agent jobs: watchlist / owned re-checks, weekly category briefs, deep dives, research refresh", status: "next",
        detail: "PolyEdge's claude -p worker pattern with model routing per job; shares agent1 with PolyEdge." },
      { title: "Right-size the homelab: tracker off the 1-core LXC 109", status: "next" },
      { title: "Agent tools for the portfolio", status: "later", detail: "MCP tools to read owned cards and the hold / sell analysis." },
    ],
  },
];

export const PATCH_NOTES: PatchNote[] = [
  {
    date: "2026-10-14",
    title: "Buy windows tab, set timing and per-card targets",
    items: [
      "Buy windows has its own tab; the Sets page is back to the tiles, each showing Raw / PSA 10 / CGC 10 as Prime, Early, Too early, Past window or Watch only.",
      "Out-of-print sets (18 months after release by default, or marked by hand on the set page) never say buy raw to grade: raw is watch only, for the odd gradable copy.",
      "Set pages open with the set's timing per grade and tier, and every card has Raw / PSA 10 / CGC 10 target chips coloured by its window. Targets are saved on the watchlist.",
    ],
    links: [{ label: "API #57", href: BE + "57" }],
  },
  {
    date: "2026-10-13",
    title: "Buy windows and after-hype returns",
    items: [
      "Sets page: a Buy windows panel lists every set tier whose raw, PSA 10 or CGC 10 prices typically sit in their bottom 10% right now (or within 3 months), with a one-click Watch for the tier's cards. Set tiles show the same as badges.",
      "Timing: After the hype table, the yearly return of buying at month 4 or at the bottom and holding 12 / 24 months, by rarity, Pokémon tier, artist, trainer or scarcity, next to realized appreciation and the S&P.",
      "Deals: auction pressure now compares this week's auctions with sales a week across every channel.",
    ],
    links: [{ label: "API #53", href: BE + "53" }],
  },
  {
    date: "2026-10-13",
    title: "Deals: this week's auctions",
    items: [
      "Deals is split into sub-tabs: This week's auctions (new, default), Buy Now, Grade raw (PSA / CGC) and Buy PSA 10s. The language filter applies to all of them.",
      "This week's auctions: every slab with auctions closing in 7 days, by source, ranked by seller pressure (this week's auctions vs the usual weekly closes; 3x+ is a dump).",
      "Per slab: the grading EV breakeven at the public gem rate, the first-10-sales launch price carried along the release curve (now and 3 / 6 / 9 / 12 months after the first sale), 12 weeks of Fanatics closes vs the breakeven, and a snipe line that clears your target margin.",
      "Pricing API 1.2: value basis, recent sales and live listings behind every number, canonical search titles, the plan's formula, and a backtested 24-month price projection with hold / sell-now advice.",
      "CGC pop reports now store 9 and 9.5 counts, so the grading EV stops counting CGC 9s as misses.",
    ],
    links: [{ label: "API #48", href: BE + "48" }, { label: "API #49", href: BE + "49" }],
  },
  {
    date: "2026-10-12",
    title: "Agent workers",
    items: [
      "Claude agent workers on the agent hosts: daily deal vetting (listings checked against the card, grade, printing and condition) and data triage (unmatched owned cards, PriceCharting disagreements, with the exact fix).",
      "Two subscription accounts: primary first, the secondary takes over when the primary is offline, paused on a usage limit or full (or balanced).",
      "Automation page: agent accounts, model / effort / items / schedule per agent job, findings; Deals show vetting verdicts.",
    ],
  },
  {
    date: "2026-10-12",
    title: "Automation: job queue and worker",
    items: [
      "fgl-worker runs the refresh jobs: Fanatics history and listings by card priority tier (hot daily, warm weekly, cold monthly), plus the daily owned-cards sync.",
      "Automation page: tiers and what's due, cadences, batch sizes, delays, run-now, recent jobs, cancel, and the change history of every setting.",
      "Deploys no longer wait behind long ingests.",
    ],
  },
  {
    date: "2026-10-12",
    title: "Strategy, bid helper, watchlist, investment factors",
    items: [
      "Card strategy: invest / grade / flip / wait / pass with buy-by prices and an appreciation projection; a one-line play on every set-table row.",
      "Bid helper: each week's Fanatics auctions next to the raw price, raw + grading and the cost to make the grade.",
      "Market value comes from what sold (never a Buy Now listing); live auctions count this week's lots only; Buy Now sell-through and weeks of supply.",
      "Timing: compare by Pokémon tier, artist tier, trainer tier and scarcity (packs per copy), with hold returns and selloff risk.",
      "Watchlist: star cards, print the buy list by set.",
      "Developer tab: roadmap, patch notes and architecture.",
    ],
  },
  {
    date: "2026-10-11",
    title: "Pricing API, stamped printings, buy-by numbers",
    items: [
      "Pricing API for the admin panel: list price, offer thresholds, eBay vs Fanatics vault per owned card (OpenAPI + Swagger).",
      "Stamped box toppers split from the regular card; PriceCharting cross-checked against our sales.",
      "Buying guide in dollars: expected bottom, buy-under, target and break-even on grading and buy-the-10 calls.",
      "Catalog cleanup finished; TCGdex retries longer.",
    ],
  },
  {
    date: "2026-10-10",
    title: "Timing by tier and grade, CGC grading deals",
    items: [
      "Timing: filter release curves by card tier (IR, SIR, full art, gold, galleries, promos; era-aware) and grade (PSA 10, PSA 9, CGC 10, Pristine, CGC 7-9, raw).",
      "Buy-window table with hold returns and realized appreciation vs the S&P after fees.",
      "Deals: language filter; separate grade-with-PSA and grade-with-CGC tabs (Pristine 10s counted at their own price).",
      "Catalog cleanup: ~1,250 duplicate cards merged, gallery cards in their parent sets, TCGdex names kept.",
    ],
  },
  {
    date: "2026-10-09",
    title: "Owned cards, English sets, roadmap",
    items: [
      "Owned-cards sync from the FGL API: owned grade, quantity and certs; every owned card tracked; sold cards listed, not dropped.",
      "English catalog import from TCGdex for Sun & Moon through Mega Evolution, with Illustration Rare-and-better tracking rules.",
      "Roadmap and patch notes tab.",
    ],
  },
  {
    date: "2026-10-09",
    title: "Settings, fair value, timing",
    items: [
      "Settings page: grading tiers per grader (fee, max value, turnaround), shipping, sourcing premium, cost of capital, fees and buying rules.",
      "Grading EV per grader, cost to make a 10 and a fair range by desirability.",
      "Timing page: release curves, low-risk buying windows (provisional), 'past hype cycle' filter on Deals.",
      "Deals: card thumbnails with hover preview.",
    ],
    links: [{ label: "BE #31", href: BE + "31" }, { label: "FE #15", href: FE + "15" }],
  },
  {
    date: "2026-10-09",
    title: "Buying guide and Deals",
    items: [
      "Expected Fanatics auction price per grade from 20k+ auction weeks, adjusted for supply.",
      "Max bid, Buy Now ceiling, flip margin, liquidity; buy-raw-to-grade and buy-the-10 calls.",
      "Deals page across every tracked card; MCP analyze_card / find_deals.",
    ],
    links: [{ label: "BE #30", href: BE + "30" }, { label: "FE #14", href: FE + "14" }],
  },
  {
    date: "2026-10-08",
    title: "Graded tracker rebuild",
    items: [
      "Set browser by language, era and set; collectibility tiers for Pokémon and artists.",
      "Last-updated dates on every value (red after 30 days); card thumbnails.",
      "Fanatics sold columns per grade group; grading EV view.",
      "Card history: PriceCharting and Fanatics charts, gem-rate tiles, Fanatics vs PriceCharting gap, auction vs Buy Now.",
      "Live listings with supply-spike flag; PriceCharting, Fanatics and eBay sold backfills.",
      "Screenshot drop box (Google sign-in) read by the agent; eBay listing snapshots.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Gem rates",
    items: ["PSA and CGC gem rates (incl. PSA 9 and CGC Pristine) from GemRate, free."],
  },
  {
    date: "2026-10-03",
    title: "Price ingest fixed",
    items: ["ingest-prices writes again (10,320 rows)."],
  },
];
