// The system as it stands, for the Developer tab's Architecture view. Keep
// it current in the same PR that changes the system.

export interface ArchNode {
  id: string;
  label: string;
  sub?: string;
}

export interface ArchColumn {
  title: string;
  nodes: ArchNode[];
}

// Left to right: where data comes from, what moves it, where it lives, what
// serves it, who uses it.
export const DIAGRAM: ArchColumn[] = [
  {
    title: "Sources",
    nodes: [
      { id: "pc", label: "PriceCharting", sub: "prices, monthly history, eBay solds" },
      { id: "fan", label: "Fanatics Collect", sub: "sold history, live listings" },
      { id: "gem", label: "GemRate / CGC", sub: "PSA & CGC pop reports" },
      { id: "tcgdex", label: "TCGdex", sub: "catalog, rarity, artists" },
      { id: "owned", label: "FGL owned-cards API", sub: "what you own" },
      { id: "shots", label: "Screenshots", sub: "eBay listings, charts" },
    ],
  },
  {
    title: "Jobs",
    nodes: [
      { id: "worker", label: "fgl-worker", sub: "job queue + scheduler, by priority tier" },
      { id: "gha", label: "GitHub Actions", sub: "build, deploy, weekly set-level jobs" },
      { id: "ingest", label: "Ingests", sub: "prices, pops, Fanatics, backfills" },
      { id: "catalog", label: "Catalog jobs", sub: "import-en / -jp, sync-tracked, split-stamped" },
      { id: "syncowned", label: "sync-owned", sub: "owned → tracked" },
      { id: "selltrough", label: "Sell-through worker", sub: "Python, pop scrapes" },
      { id: "agent", label: "Agent (MCP)", sub: "reads screenshots, records data" },
    ],
  },
  {
    title: "Data",
    nodes: [
      { id: "pg", label: "Postgres", sub: "LXC 106 · market_tracker" },
      { id: "tables", label: "Core tables", sub: "cards, sets, tracked_cards, card_sales" },
      { id: "snap", label: "Snapshots", sub: "weekly prices & pops, listings" },
      { id: "mine", label: "Yours", sub: "owned_cards, watchlist, settings" },
    ],
  },
  {
    title: "API",
    nodes: [
      { id: "api", label: "Go API", sub: "LXC 109 · market.futuregadgetlabs.com" },
      { id: "analysis", label: "Analysis", sub: "buying guide, strategy, deals" },
      { id: "models", label: "Models", sub: "auction model, release curves, fair value" },
      { id: "pricing", label: "Pricing API", sub: "/v1/pricing · OpenAPI" },
    ],
  },
  {
    title: "Uses",
    nodes: [
      { id: "web", label: "This site", sub: "GitHub Pages · React" },
      { id: "mcp", label: "Claude (MCP tools)", sub: "analyze_card, find_deals, …" },
      { id: "admin", label: "Admin panel", sub: "admin.futuregadgetlabs.com" },
    ],
  },
];

export interface ArchSection {
  title: string;
  items: { name: string; detail: string }[];
}

export const SECTIONS: ArchSection[] = [
  {
    title: "Data sources",
    items: [
      { name: "PriceCharting", detail: "Current raw / PSA 9 / PSA 10 / CGC prices per card (weekly), monthly history (backfill, Mondays), and the eBay sold listings shown on each card page. One product per card, so stamped printings can blend in: the analysis cross-checks it against our own sales." },
      { name: "Fanatics Collect", detail: "Sold history (sales API, all-in = hammer + 20% premium) and live listings (Algolia index: Buy Nows and weekly / premier auctions with their close time). Self-hosted scraping with an Apify fallback." },
      { name: "GemRate / CGC", detail: "Population reports: PSA gem rate and PSA 9 share, CGC 10 and Pristine share, per card (weekly)." },
      { name: "TCGdex", detail: "Catalog for English (Sun & Moon → Mega Evolution) and Japanese sets: card numbers, names, rarity, illustrator, images. Names and rarities from TCGdex win over scraper names." },
      { name: "FGL owned-cards API", detail: "What you own (per grader + grade + label, quantity, certs). sync-owned tracks every owned card; cards that leave the feed are flagged, never untracked." },
    ],
  },
  {
    title: "Jobs (GitHub Actions on the homelab runner)",
    items: [
      { name: "fgl-worker (job queue)", detail: "Its own container. Claims jobs from Postgres, heartbeats, records results; the worker holding an advisory lock schedules every 5 minutes. Cards are hot (owned, watchlist, new sets), warm (SIR / gold / gallery, top-A Pokémon or artist) or cold; Fanatics history and listings refresh each tier on its own cadence, one job per source at a time. Also the daily owned-cards sync. Configured on the Automation page; every settings change is audited." },
      { name: "Scheduled (GitHub Actions)", detail: "Set-level weekly jobs still here: PriceCharting prices and backfill, PSA and CGC pops (Mondays). Moving to the worker next." },
      { name: "Manual", detail: "import-en / import-jp (catalog), sync-tracked (tracking rules in tracking.yaml), sync-owned, split-stamped, enrich-sets, backfill-fanatics." },
      { name: "Deploy", detail: "Merging to master builds the image on GitHub and deploys it on the runner (health-checked). Migrations run by hand on LXC 106 (goose)." },
    ],
  },
  {
    title: "Analysis",
    items: [
      { name: "Market value", detail: "PriceCharting, cross-checked against 90 days of our own sales (overridden when off by 1.75x+); else eBay sold; else recent solds. Never a listing price." },
      { name: "Auction model", detail: "Weekly Fanatics auction prices vs market per grade (20k+ auction weeks), shrunk toward the grade average, adjusted for this week's supply." },
      { name: "Release curves", detail: "Price vs months since release by rarity tier, Pokémon / artist / trainer tier and scarcity, per grade: bottoms, low-risk windows, hold returns, post-hype appreciation and selloff risk." },
      { name: "Grading EV", detail: "Per grader and tier: sourcing, fee, shipping, money tied up, price drift over the turnaround, misses resold; break-even and target raw prices." },
      { name: "Strategy", detail: "Per card: invest / grade / flip / wait / pass, with the price lines to buy by. Shown on the card page, set tables and the watchlist." },
    ],
  },
  {
    title: "Interfaces",
    items: [
      { name: "Website", detail: "Sets, card pages (buying guide, bid helper, history), Deals, Timing, Watchlist, Settings, Developer. Google sign-in (Firebase) for admin actions." },
      { name: "MCP server", detail: "Tools for Claude: find_card, record_sales, analyze_card, find_deals, release_curves, history imports, lots." },
      { name: "Pricing API", detail: "/v1/pricing (read-only token): list price, offer thresholds and best channel per owned card for the admin panel. Spec at /v1/pricing/openapi.json." },
    ],
  },
];
