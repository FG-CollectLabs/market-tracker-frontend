// The Developer tab's API views: what the tracker publishes (and who calls
// it) and what it calls. Keep it current in the same PR that adds or retires
// a route or a source. Never put token values here, only the variable names.

export type AuthKind = "public" | "admin" | "token" | "worker";

export const AUTH: Record<AuthKind, { label: string; cls: string; detail: string }> = {
  public: { label: "Public", cls: "bg-green-950/60 text-green-300 border-green-900", detail: "No auth: reads anyone can make." },
  admin: {
    label: "Admin",
    cls: "bg-amber-950/60 text-amber-300 border-amber-900",
    detail: "Bearer ADMIN_API_TOKEN (CI, scrapers, MCP) or a Google sign-in (Firebase) on ADMIN_ALLOWED_EMAILS.",
  },
  token: { label: "Read token", cls: "bg-sky-950/60 text-sky-300 border-sky-900", detail: "Its own read-only Bearer token; admin auth works too." },
  worker: { label: "Worker token", cls: "bg-indigo-950/60 text-indigo-300 border-indigo-900", detail: "Bearer AGENT_WORKER_TOKEN." },
};

export interface Endpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  note?: string;
}

export interface EndpointGroup {
  title: string;
  endpoints: Endpoint[];
}

export interface PublishedApi {
  id: string;
  name: string;
  summary: string;
  auth: AuthKind;
  authNote?: string;
  consumers: string[];
  // Path to an OpenAPI spec on the API: rendered with Swagger UI.
  spec?: { json: string; docs: string };
  groups: EndpointGroup[];
}

const g = (method: Endpoint["method"], path: string, note?: string): Endpoint => ({ method, path, note });

export const PUBLISHED: PublishedApi[] = [
  {
    id: "pricing",
    name: "Pricing API",
    summary: "Read-only selling advice for cards the owner holds: list price, offer thresholds, best channel, history and hold-vs-sell analysis. The one versioned, spec'd contract.",
    auth: "token",
    authNote: "PRICING_API_TOKEN",
    consumers: ["FGL admin panel agent (admin.futuregadgetlabs.com)"],
    spec: { json: "/v1/pricing/openapi.json", docs: "/v1/pricing/docs" },
    groups: [
      {
        title: "Cards",
        endpoints: [
          g("GET", "/v1/pricing/owned", "every owned card, priced"),
          g("GET", "/v1/pricing/cards/{display_key}"),
          g("GET", "/v1/pricing/cards/{display_key}/history"),
          g("POST", "/v1/pricing/history", "bulk history"),
          g("POST", "/v1/pricing/quote", "price a card the tracker may not own"),
          g("POST", "/v1/pricing/hold-analysis", "hold / trim / sell"),
        ],
      },
      {
        title: "Sealed, rankings, observations",
        endpoints: [
          g("POST", "/v1/pricing/sealed-links"),
          g("POST", "/v1/pricing/sealed-prices"),
          g("GET", "/v1/pricing/rankings/species"),
          g("GET", "/v1/pricing/rankings/illustrators"),
          g("POST", "/v1/observations", "price points the admin app saw"),
        ],
      },
      {
        title: "Spec (public)",
        endpoints: [g("GET", "/v1/pricing/openapi.json"), g("GET", "/v1/pricing/openapi.yaml"), g("GET", "/v1/pricing/docs", "Swagger UI")],
      },
    ],
  },
  {
    id: "graded-feed",
    name: "Graded-copy feed",
    summary: "Every graded copy the tracker has seen (eBay and Fanatics listings and sales) with photos and certs, for grading backtests. Cursor-paged by feed_changed_at with a 10-minute settle window; ids are ebay:<item> / fanatics:<listing>. Grade keys include psa, cgc, bgs, sgc, tag, ace and pcg.",
    auth: "token",
    authNote: "GRADED_FEED_TOKEN (the catalog is public)",
    consumers: ["Grading predictor (LXC 109 :8084)"],
    groups: [
      {
        title: "Feed",
        endpoints: [
          g("GET", "/v1/graded-copies/feed", "?cursor=&limit=&grade="),
          g("GET", "/v1/tracked/catalog", "public: every tracked card with set, number, rarity, image"),
        ],
      },
    ],
  },
  {
    id: "public",
    name: "Public read API",
    summary: "What this site reads, plus the price lookups the sibling apps use. Cached where it's hot.",
    auth: "public",
    consumers: [
      "This site",
      "EV calculator (prices/batch)",
      "Pack price finder, card identifier (prices/by-tcgplayer)",
      "Graded lister (cards/resolve)",
      "Sealed arb analyzer (products, sealed)",
      "Sell-through analyzer (sets, tracked, graded coverage)",
    ],
    groups: [
      {
        title: "Catalog",
        endpoints: [
          g("GET", "/v1/sets"),
          g("GET", "/v1/sets/{game}/{code}"),
          g("GET", "/v1/sets/{game}/{code}/cards"),
          g("GET", "/v1/sets/{game}/{code}/sealed"),
          g("GET", "/v1/sets/{game}/{code}/market"),
          g("GET", "/v1/sets/{game}/{set_code}/graded"),
          g("GET", "/v1/cards/resolve"),
          g("GET", "/v1/cards/{display_key}"),
          g("GET", "/v1/sealed/{display_key}"),
          g("GET", "/v1/sealed/{display_key}/snapshots"),
          g("GET", "/v1/products/lookup", "external id → card or sealed"),
          g("GET", "/v1/products/tcgplayer-lookup/{id}"),
          g("GET", "/v1/products/tcgplayer-meta/{id}"),
          g("POST", "/v1/products/tcgplayer-track"),
        ],
      },
      {
        title: "Card detail",
        endpoints: [
          g("GET", "/v1/cards/{display_key}/analysis"),
          g("GET", "/v1/cards/{display_key}/history"),
          g("GET", "/v1/cards/{display_key}/sales"),
          g("GET", "/v1/cards/{display_key}/snapshots"),
          g("GET", "/v1/cards/{display_key}/listings"),
          g("GET", "/v1/cards/{display_key}/live-listings"),
          g("GET", "/v1/cards/{display_key}/market-listings"),
          g("GET", "/v1/cards/{display_key}/listing-depth"),
          g("GET", "/v1/cards/{display_key}/listing-depth/velocity"),
          g("GET", "/v1/cards/{display_key}/auction-weeks"),
          g("GET", "/v1/cards/{display_key}/graded"),
          g("GET", "/v1/cards/{display_key}/gem-rate"),
          g("GET", "/v1/cards/{display_key}/signals"),
          g("GET", "/v1/cards/{display_key}/price-sources"),
          g("GET", "/v1/cards/{display_key}/links"),
        ],
      },
      {
        title: "Tracked, rankings, settings",
        endpoints: [
          g("GET", "/v1/tracked"),
          g("GET", "/v1/tracked/search"),
          g("GET", "/v1/tracked/sets"),
          g("GET", "/v1/rankings"),
          g("GET", "/v1/rankings/cards"),
          g("GET", "/v1/card-classes"),
          g("GET", "/v1/graded/coverage"),
          g("GET", "/v1/settings"),
          g("GET", "/v1/automation"),
          g("GET", "/v1/agent/findings"),
          g("GET", "/v1/ingest-runs"),
        ],
      },
      {
        title: "Analysis and deals",
        endpoints: [
          g("GET", "/v1/analysis/deals"),
          g("GET", "/v1/analysis/model"),
          g("GET", "/v1/analysis/release-curves"),
          g("GET", "/v1/analysis/set-windows"),
          g("GET", "/v1/analysis/set-tiers"),
          g("GET", "/v1/analysis/scores"),
          g("GET", "/v1/analysis/make-vs-market"),
          g("GET", "/v1/analysis/beat-sp"),
          g("GET", "/v1/analysis/group-cards"),
          g("GET", "/v1/analysis/group-curve"),
          g("GET", "/v1/analysis/group-series"),
          g("GET", "/v1/analysis/timing-notes"),
          g("GET", "/v1/deals/auctions"),
          g("GET", "/v1/deals/ending-soon"),
          g("GET", "/v1/deals/collectorcrypt"),
          g("GET", "/v1/deals/snipe-status"),
        ],
      },
      {
        title: "Prices (sibling apps)",
        endpoints: [g("POST", "/v1/prices/batch"), g("GET", "/v1/prices/by-tcgplayer/{tcgplayer_product_id}")],
      },
      {
        title: "Health and auth",
        endpoints: [g("GET", "/healthz"), g("GET", "/readyz", "checks Postgres"), g("GET", "/v1/auth/config", "which sign-in the site offers"), g("GET", "/admin", "legacy dashboard page")],
      },
    ],
  },
  {
    id: "admin",
    name: "Admin API",
    summary: "Every write: catalog, snapshots, sales and supply, watchlist, lots, settings, jobs. Also the reads that show private data (watchlist, bid plans, system status).",
    auth: "admin",
    consumers: ["This site (signed in)", "Sell-through analyzer worker (bulk snapshots, pops)", "MCP server", "GitHub Actions jobs"],
    groups: [
      {
        title: "Catalog and data writes",
        endpoints: [
          g("POST", "/v1/admin/sets"),
          g("PUT", "/v1/admin/sets/{code}/print"),
          g("POST", "/v1/admin/sets/{code}/recheck"),
          g("POST", "/v1/admin/cards"),
          g("POST", "/v1/admin/cards/external-ids"),
          g("POST", "/v1/admin/cards/snapshots/bulk"),
          g("POST", "/v1/admin/cards/listing-depth/bulk"),
          g("POST", "/v1/admin/cards/{display_key}/graded-watch"),
          g("POST", "/v1/admin/sealed"),
          g("POST", "/v1/admin/sealed/external-ids"),
          g("POST", "/v1/admin/sealed/snapshots/bulk"),
          g("POST", "/v1/admin/graded/bulk"),
          g("POST", "/v1/admin/graded/refresh", "proxied to the sell-through worker"),
          g("GET", "/v1/admin/graded/jobs/{id}"),
          g("POST", "/v1/admin/sales/bulk"),
          g("DELETE", "/v1/admin/sales/{id}"),
          g("POST", "/v1/admin/supply"),
          g("DELETE", "/v1/admin/supply/{id}"),
          g("POST", "/v1/admin/price-points"),
          g("POST", "/v1/admin/listings/snapshot"),
          g("POST", "/v1/admin/fanatics/refresh"),
          g("POST", "/v1/admin/auction-snapshot"),
          g("POST", "/v1/admin/collectorcrypt/sweep"),
          g("POST", "/v1/admin/snipe/pulse"),
        ],
      },
      {
        title: "Watchlist and bidding",
        endpoints: [
          g("GET", "/v1/admin/watchlist"),
          g("PUT", "/v1/admin/watchlist/{display_key}"),
          g("DELETE", "/v1/admin/watchlist/{display_key}"),
          g("PUT", "/v1/admin/watchlist/{display_key}/targets"),
          g("POST", "/v1/admin/watchlist/bulk"),
          g("POST", "/v1/admin/watchlist/apply-preset"),
          g("GET", "/v1/admin/watch-presets"),
          g("GET", "/v1/admin/watch-suggestions"),
          g("POST", "/v1/admin/watch-suggestions/run"),
          g("POST", "/v1/admin/watch-suggestions/{id}/{action}"),
          g("GET", "/v1/admin/watch-hits/reviews"),
          g("PUT", "/v1/admin/watch-hits/review"),
          g("DELETE", "/v1/admin/watch-hits/review"),
          g("GET", "/v1/admin/bid-plans"),
          g("PUT", "/v1/admin/bid-plans"),
          g("POST", "/v1/admin/bid-plans/auto-prep"),
          g("DELETE", "/v1/admin/bid-plans/{id}"),
          g("GET", "/v1/watchlist/graded"),
          g("POST", "/v1/watchlist/graded"),
          g("DELETE", "/v1/watchlist/graded/{id}"),
        ],
      },
      {
        title: "Lots and imports",
        endpoints: [
          g("GET", "/v1/admin/lots"),
          g("POST", "/v1/admin/lots"),
          g("GET", "/v1/admin/lots/{id}"),
          g("PATCH", "/v1/admin/lots/{id}"),
          g("POST", "/v1/admin/lots/{id}/items"),
          g("PATCH", "/v1/admin/lots/{id}/items/{item_id}"),
          g("DELETE", "/v1/admin/lots/{id}/items/{item_id}"),
          g("GET", "/v1/admin/imports"),
          g("POST", "/v1/admin/imports", "screenshot upload"),
          g("GET", "/v1/admin/imports/{id}"),
          g("GET", "/v1/admin/imports/{id}/image"),
          g("POST", "/v1/admin/imports/{id}/status"),
        ],
      },
      {
        title: "Settings, tagging, jobs, status",
        endpoints: [
          g("PUT", "/v1/admin/settings"),
          g("GET", "/v1/admin/settings-audit"),
          g("PUT", "/v1/admin/automation"),
          g("POST", "/v1/admin/jobs", "enqueue a job"),
          g("POST", "/v1/admin/jobs/{id}/cancel"),
          g("PUT", "/v1/admin/tracked/{display_key}"),
          g("PUT", "/v1/admin/rankings"),
          g("DELETE", "/v1/admin/rankings"),
          g("PUT", "/v1/admin/card-classes"),
          g("POST", "/v1/admin/card-classes/custom"),
          g("DELETE", "/v1/admin/card-classes/{display_key}"),
          g("GET", "/v1/admin/connected-art"),
          g("GET", "/v1/admin/sealed-links"),
          g("PUT", "/v1/admin/sealed-links/{id}"),
          g("GET", "/v1/admin/system-status"),
        ],
      },
    ],
  },
  {
    id: "worker",
    name: "Agent worker API",
    summary: "The claude -p agent workers poll here for jobs (deal vetting, data triage, art tags), heartbeat, and post results. The worker script itself downloads from files/.",
    auth: "worker",
    consumers: ["Agent 1 (CT 115, primary account)", "Agent 2 (backup account)"],
    groups: [
      {
        title: "Jobs",
        endpoints: [
          g("POST", "/v1/worker/agent/heartbeat"),
          g("POST", "/v1/worker/agent/claim"),
          g("POST", "/v1/worker/agent/jobs/{id}/result"),
          g("POST", "/v1/worker/agent/jobs/{id}/fail"),
          g("POST", "/v1/worker/agent/jobs/{id}/release"),
          g("GET", "/v1/worker/agent/files/{name}", "public: the worker script"),
        ],
      },
    ],
  },
];

// The MCP server (cmd/mcp) runs where Claude runs and calls the APIs above
// with the admin token.
export const MCP_TOOLS: { group: string; tools: string[] }[] = [
  { group: "Catalog", tools: ["find_card", "get_card", "list_tracked", "track_card"] },
  { group: "Record data", tools: ["record_sales", "record_supply", "record_price_points", "record_listings_snapshot", "delete_sale", "delete_supply"] },
  { group: "Analysis", tools: ["analyze_card", "find_deals", "release_curves", "fanatics_lookup", "fanatics_refresh"] },
  { group: "Screenshot imports", tools: ["list_history_imports", "get_history_import", "finish_history_import"] },
  { group: "Lots", tools: ["create_lot", "list_lots", "add_lot_items", "update_lot", "update_lot_item", "evaluate_lot"] },
];

export interface ConsumedApi {
  name: string;
  host: string;
  what: string;
  via: string; // the job or package that calls it
  auth?: string; // env var name only
}

export interface ConsumedGroup {
  title: string;
  apis: ConsumedApi[];
}

export const CONSUMED: ConsumedGroup[] = [
  {
    title: "Market data",
    apis: [
      { name: "PriceCharting", host: "www.pricecharting.com", what: "Raw / graded prices (weekly), monthly history backfill, eBay sold listings per card. Card images from storage.googleapis.com/images.pricecharting.com.", via: "ingest-prices, backfill-pricecharting, ingest-listings" },
      { name: "Fanatics Collect: sales history", host: "sales-history-api.services.fanaticscollect.com", what: "Sold history (hammer; all-in = hammer + 20% premium).", via: "fgl-worker, ingest-fanatics, MCP fanatics_refresh" },
      { name: "Fanatics Collect: listings", host: "Algolia index (app.fanaticscollect.com)", what: "Live Buy Nows and weekly / premier auctions with close times, photos and cert (serial).", via: "fgl-worker, snipe pulse" },
      { name: "Apify", host: "api.apify.com", what: "Fallback for Fanatics sold history when the API fails. Monthly spend cap checked before each call.", via: "internal/fanatics", auth: "APIFY_TOKEN" },
      { name: "eBay Browse API", host: "api.ebay.com", what: "Auctions of watched cards (every 3 h) and lot scouting.", via: "ingest-ebay, lot-scout", auth: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET" },
      { name: "CompsAPI", host: "api.compsapi.com", what: "eBay sold comps.", via: "ingest-comps", auth: "COMPSAPI_API_KEY" },
      { name: "PokemonPriceTracker", host: "www.pokemonpricetracker.com/api/v2", what: "Price observations on the free daily allowance.", via: "ingest-comps", auth: "POKEMONPRICETRACKER_API_KEY" },
      { name: "PokeTrace", host: "api.poketrace.com/v1", what: "Price observations on the free daily allowance.", via: "ingest-comps", auth: "POKETRACE_API_KEY" },
      { name: "TCGplayer marketplace search", host: "mp-search-api.tcgplayer.com", what: "Listings and listing depth; product page lookups.", via: "ingest-depth, ingest-listings, products lookup" },
      { name: "TCGCSV", host: "tcgcsv.com", what: "TCGplayer prices for sealed and price links.", via: "sealed prices, price links" },
      { name: "Card Kingdom, Manapool", host: "www.cardkingdom.com, manapool.com", what: "Card Kingdom buylist / sell prices; Manapool listing depth.", via: "ingest-ck, ingest-depth" },
      { name: "Collector Crypt", host: "api.collectorcrypt.com", what: "Listings for the Collector Crypt deals tab and watch alerts.", via: "collectorcrypt sweep", auth: "CC_DISCORD_WEBHOOK_URL (alerts out)" },
    ],
  },
  {
    title: "Populations and pull rates",
    apis: [
      { name: "GemRate (PSA pops)", host: "gemrate", what: "PSA population: gem rate and PSA 9 share per card, weekly.", via: "sell-through worker (Python) → /v1/admin/graded/bulk" },
      { name: "CGC population", host: "www.cgccards.com", what: "CGC 10 and Pristine share per card, weekly; JP sets link their CGC pop page.", via: "sell-through worker, import-jp" },
      { name: "ThePriceDex", host: "www.thepricedex.com", what: "Pull rates per rarity, monthly.", via: "import-pullrates" },
    ],
  },
  {
    title: "Catalog",
    apis: [
      { name: "TCGdex", host: "api.tcgdex.net, assets.tcgdex.net", what: "EN and JP sets and cards: numbers, names, rarity, illustrator, images.", via: "import-en, import-jp, enrich-sets" },
      { name: "Scryfall", host: "api.scryfall.com", what: "Magic catalog.", via: "internal/scryfall" },
    ],
  },
  {
    title: "Your data and AI",
    apis: [
      { name: "FGL owned-cards API", host: "api.futuregadgetlabs.com", what: "What you own: grader, grade, label, quantity, certs. Daily.", via: "sync-owned", auth: "FGL_OWNED_CARDS_URL + owned-cards token" },
      { name: "Anthropic Messages API", host: "api.anthropic.com", what: "Claude Haiku reads eBay lot listings for the lot scout. The agent workers use claude -p on subscriptions instead.", via: "lot-scout", auth: "LOT_SCOUT_ANTHROPIC_API_KEY" },
      { name: "Discord webhooks", host: "discord.com", what: "Collector Crypt and lot scout alerts out.", via: "collectorcrypt, lot-scout", auth: "CC_DISCORD_WEBHOOK_URL, LOT_SCOUT_DISCORD_WEBHOOK_URL" },
    ],
  },
  {
    title: "Platform",
    apis: [
      { name: "Firebase Auth / Google", host: "securetoken.google.com, googleapis.com", what: "Verifies the site's Google sign-in tokens for admin calls.", via: "firebaseauth, googleauth", auth: "FIREBASE_WEB_CONFIG, ADMIN_ALLOWED_EMAILS" },
      { name: "BigQuery / GCS", host: "Google Cloud", what: "Optional exports: per-set JSON dumps and BigQuery sync.", via: "cmd/sync", auth: "BQ_PROJECT, BQ_DATASET, GCS_BUCKET" },
      { name: "GitHub Actions + Docker Hub", host: "github.com, hub.docker.com", what: "Builds philwin/market-tracker-backend on merge; self-hosted runners on LXC 109 deploy it and run the scheduled ingests.", via: "docker.yml, ingest.yml" },
      { name: "Cloudflare", host: "market.futuregadgetlabs.com", what: "Public edge in front of the API on LXC 109.", via: "DNS / proxy" },
      { name: "Sibling services (health)", host: "172.17.0.1 :8081–:8090", what: "System status probes /healthz on the other apps sharing LXC 109.", via: "sysstatus" },
    ],
  },
];
