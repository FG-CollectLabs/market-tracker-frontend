// The infrastructure diagram on the Developer tab's Architecture view: where
// each piece runs and what talks to what. Coordinates are in the SVG's
// 1200 × 780 viewBox; data flows bottom to top (sources → jobs → Postgres →
// API → Cloudflare → the apps that use it). Keep it current in the same PR
// that moves a service.

export type InfraKind = "consumer" | "edge" | "serve" | "data" | "job" | "agent" | "build" | "source";

export interface InfraNode {
  id: string;
  kind: InfraKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string[];
  detail: string;
}

export interface InfraZone {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  outer?: boolean; // the Proxmox host frame
}

export interface InfraEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  // Explicit route (start, corners, end) for edges that must go around boxes.
  points?: [number, number][];
  labelAt?: [number, number];
}

export const INFRA_ZONES: InfraZone[] = [
  { label: "Apps that use the tracker", x: 20, y: 12, w: 880, h: 92 },
  { label: "Proxmox homelab", x: 20, y: 196, w: 880, h: 360, outer: true },
  { label: "LXC 109 · fg-market-app (Docker) · serving", x: 40, y: 222, w: 520, h: 84 },
  { label: "Agent hosts", x: 580, y: 222, w: 300, h: 84 },
  { label: "LXC 106 · pg-market-tracker", x: 40, y: 322, w: 400, h: 84 },
  { label: "LXC 102", x: 480, y: 322, w: 400, h: 84 },
  { label: "LXC 109 · jobs", x: 40, y: 432, w: 840, h: 104 },
  { label: "Build & deploy", x: 920, y: 196, w: 260, h: 220 },
  { label: "Outside sources", x: 20, y: 600, w: 1160, h: 160 },
];

const SRC_Y = 648, SRC_W = 116, SRC_H = 86;
const src = (i: number) => 32 + i * 128;

export const INFRA_NODES: InfraNode[] = [
  // Consumers
  { id: "site", kind: "consumer", x: 40, y: 38, w: 190, h: 52, label: "This site", sub: ["React · GitHub Pages"], detail: "market-tracker-coverage.futuregadgetlabs.com. Public reads for everyone; Google sign-in (Firebase) for admin writes." },
  { id: "admin", kind: "consumer", x: 250, y: 38, w: 190, h: 52, label: "FGL admin panel", sub: ["Pricing API · read token"], detail: "admin.futuregadgetlabs.com's agent reads /v1/pricing with PRICING_API_TOKEN: list prices, offers, hold analysis." },
  { id: "mcp", kind: "consumer", x: 460, y: 38, w: 190, h: 52, label: "Claude + MCP server", sub: ["cmd/mcp · admin token"], detail: "The MCP server runs where Claude runs and calls the API: find_card, record_sales, analyze_card, lots, screenshot imports." },
  { id: "apps", kind: "consumer", x: 670, y: 38, w: 210, h: 52, label: "Other FG apps", sub: ["graded lister, pack finder,", "card identifier, sealed arb"], detail: "Public reads: cards/resolve, prices/batch, prices/by-tcgplayer, products, sealed. EV calculator and the sell-through analyzer too." },

  { id: "cf", kind: "edge", x: 40, y: 128, w: 840, h: 44, label: "Cloudflare · market.futuregadgetlabs.com", sub: ["public HTTPS edge for the API"], detail: "Every outside caller, including the apps on LXC 109 that use the public URL, reaches the API through Cloudflare. It 403s default Python user agents, so workers send their own." },

  // LXC 109 serving
  { id: "api", kind: "serve", x: 60, y: 244, w: 230, h: 52, label: "market-tracker API", sub: ["Go · :8080 · /v1/*"], detail: "market-tracker-backend: public reads, admin writes, Pricing API, graded-copy feed, agent worker API, system status. Deployed on merge to master." },
  { id: "siblings", kind: "serve", x: 310, y: 244, w: 230, h: 52, label: "Sibling apps", sub: ["grading predictor :8084, graded", "lister :8082, EV :8081, pack EV :8090"], detail: "Other FG services on the same Docker host (also listing tool :8087, tcgcsv-proxy :8088). The API's system status probes their /healthz. The grading predictor pulls the graded-copy feed and catalog." },

  // Agent hosts
  { id: "agent1", kind: "agent", x: 596, y: 244, w: 134, h: 52, label: "Agent 1", sub: ["CT 115 · primary"], detail: "claude -p worker on the primary subscription. Polls /v1/worker/agent for deal vetting, data triage and art-tag jobs." },
  { id: "agent2", kind: "agent", x: 742, y: 244, w: 124, h: 52, label: "Agent 2", sub: ["backup account"], detail: "claude -p worker on the backup subscription; takes jobs when agent 1 is busy or down." },

  // Data
  { id: "pg", kind: "data", x: 60, y: 344, w: 360, h: 52, label: "Postgres · market_tracker", sub: ["cards, sales, listings, snapshots, owned, watchlist, job queue"], detail: "The tracker's only database. Migrations (goose) are run by hand on LXC 106." },
  { id: "pg102", kind: "data", x: 500, y: 344, w: 360, h: 52, label: "Postgres · grading_predictor", sub: ["the grading predictor's own data"], detail: "Separate database for the grading predictor; the tracker never touches it." },

  // Jobs
  { id: "sell", kind: "job", x: 60, y: 456, w: 190, h: 64, label: "Sell-through worker", sub: ["Python · pop scrapes", "→ admin API writes"], detail: "sellthrough-analyzer's worker: PSA (GemRate) and CGC pops, listing snapshots. Writes through the admin API." },
  { id: "worker", kind: "job", x: 270, y: 456, w: 190, h: 64, label: "fgl-worker", sub: ["job queue + scheduler", "hot / warm / cold tiers"], detail: "Claims jobs from Postgres every 5 minutes: Fanatics history and listings per tier, daily owned-cards sync, Collector Crypt sweeps. Configured on the Automation page." },
  { id: "ingest", kind: "job", x: 480, y: 456, w: 190, h: 64, label: "Ingest jobs", sub: ["docker run per schedule", "prices, eBay, comps, catalog"], detail: "One-shot containers from ingest.yml: ingest-prices, backfill-pricecharting, ingest-ebay (every 3 h), ingest-comps (daily), ingest-depth, import-en / -jp, import-pullrates, lot-scout, suggest-watch." },
  { id: "runners", kind: "job", x: 690, y: 456, w: 170, h: 64, label: "GitHub runners", sub: ["homelab: ingests", "deploy: redeploys"], detail: "Two self-hosted runners on LXC 109: fg-market-lxc109 (homelab label) runs the scheduled ingests one at a time; fg-market-lxc109-deploy redeploys the API so deploys never queue behind ingests." },

  // Build & deploy
  { id: "gh", kind: "build", x: 940, y: 222, w: 220, h: 64, label: "GitHub", sub: ["Actions: build, schedules", "Pages: this site"], detail: "Merging to master builds the API image; ingest.yml holds the schedules. Merging the frontend to main builds and publishes this site." },
  { id: "hub", kind: "build", x: 940, y: 326, w: 220, h: 52, label: "Docker Hub", sub: ["philwin/market-tracker-backend"], detail: "Image registry. The deploy runner pulls the new tag and recreates the container (health-checked); the 3 newest images are kept." },

  // Sources
  { id: "s-pops", kind: "source", x: src(0), y: SRC_Y, w: SRC_W, h: SRC_H, label: "Pop reports", sub: ["GemRate (PSA)", "CGC pop"], detail: "PSA gem rate and PSA 9 share via GemRate; CGC 10 and Pristine share. Weekly, by the sell-through worker." },
  { id: "s-fan", kind: "source", x: src(1), y: SRC_Y, w: SRC_W, h: SRC_H, label: "Fanatics Collect", sub: ["sales API, Algolia", "Apify fallback"], detail: "Sold history (sales-history API) and live listings with photos and certs (Algolia). Apify runs only when the sales API fails, under a monthly cap." },
  { id: "s-owned", kind: "source", x: src(2), y: SRC_Y, w: SRC_W, h: SRC_H, label: "FGL owned cards", sub: ["api.futuregadget", "labs.com"], detail: "What you own, synced daily into owned_cards (sync-owned). Cards that leave the feed are flagged, never untracked." },
  { id: "s-cc", kind: "source", x: src(3), y: SRC_Y, w: SRC_W, h: SRC_H, label: "Collector Crypt", sub: ["listings, alerts", "→ Discord"], detail: "Listings for the Collector Crypt deals tab; watch hits are posted to Discord." },
  { id: "s-pc", kind: "source", x: src(4), y: SRC_Y, w: SRC_W, h: SRC_H, label: "PriceCharting", sub: ["prices, history,", "eBay solds"], detail: "Weekly raw / graded prices, monthly history backfill, and the eBay sold listings on card pages." },
  { id: "s-ebay", kind: "source", x: src(5), y: SRC_Y, w: SRC_W, h: SRC_H, label: "eBay & comps", sub: ["eBay, CompsAPI,", "PPT, PokeTrace"], detail: "eBay auctions of watched cards (Browse API), sold comps (CompsAPI), and price observations from PokemonPriceTracker and PokeTrace free tiers." },
  { id: "s-tcgp", kind: "source", x: src(6), y: SRC_Y, w: SRC_W, h: SRC_H, label: "TCGplayer & co.", sub: ["TCGplayer, TCGCSV,", "CK, Manapool"], detail: "TCGplayer listings and depth, TCGCSV sealed prices, Card Kingdom prices, Manapool depth." },
  { id: "s-cat", kind: "source", x: src(7), y: SRC_Y, w: SRC_W, h: SRC_H, label: "Catalogs", sub: ["TCGdex, Scryfall,", "ThePriceDex"], detail: "TCGdex for EN and JP sets and cards; Scryfall for Magic; ThePriceDex pull rates (monthly)." },
  { id: "s-ai", kind: "source", x: src(8), y: SRC_Y, w: SRC_W, h: SRC_H, label: "Anthropic API", sub: ["Claude Haiku", "lot scout"], detail: "The lot scout sends eBay lot listings to Claude Haiku to read them. The agent workers use claude -p on subscriptions, not this API." },
];

// Arrows point from caller to callee: who makes the request.
export const INFRA_EDGES: InfraEdge[] = [
  { from: "site", to: "cf" },
  { from: "admin", to: "cf", label: "/v1/pricing" },
  { from: "mcp", to: "cf" },
  { from: "apps", to: "cf" },
  { from: "cf", to: "api" },
  { from: "agent1", to: "cf", label: "/v1/worker/agent" },
  { from: "agent2", to: "cf" },
  { from: "siblings", to: "cf", label: "feed, catalog, prices" },
  { from: "api", to: "pg" },
  { from: "siblings", to: "pg102" },
  { from: "worker", to: "pg", label: "jobs, writes" },
  { from: "ingest", to: "pg", label: "writes" },
  { from: "sell", to: "cf", points: [[60, 488], [28, 488], [28, 150], [40, 150]] },
  { from: "runners", to: "ingest" },
  { from: "runners", to: "gh", label: "picks up jobs", points: [[860, 478], [906, 478], [906, 270], [940, 270]], labelAt: [906, 430] },
  { from: "gh", to: "hub", label: "push image" },
  { from: "runners", to: "hub", label: "pull", dashed: true, points: [[860, 500], [1050, 500], [1050, 378]], labelAt: [1050, 440] },
  { from: "sell", to: "s-pops" },
  { from: "worker", to: "s-fan" },
  { from: "worker", to: "s-owned" },
  { from: "worker", to: "s-cc" },
  { from: "ingest", to: "s-pc" },
  { from: "ingest", to: "s-ebay" },
  { from: "ingest", to: "s-tcgp" },
  { from: "ingest", to: "s-cat" },
  { from: "ingest", to: "s-ai", dashed: true },
];
