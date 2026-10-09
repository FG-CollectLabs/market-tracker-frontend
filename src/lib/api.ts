import { authHeaders } from "./auth";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Sets ------------------------------------------------------------------

export interface SetRow {
  id: string;
  game: string;
  code: string;
  name: string;
  release_date: string | null;
  card_count: number | null;
  image_url: string | null;
  external_ids: Record<string, string>;
}

export function fetchSets(game?: string): Promise<{ sets: SetRow[] }> {
  const qs = game ? `?game=${encodeURIComponent(game)}` : "";
  return get(`/v1/sets${qs}`);
}

export function fetchSet(game: string, code: string): Promise<SetRow> {
  return get(`/v1/sets/${game}/${code}`);
}

// ---- Cards -----------------------------------------------------------------

export interface CardRow {
  id: string;
  set_id: string;
  number: string;
  finish: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  display_key: string;
  details: Record<string, unknown>;
}

export function fetchCards(game: string, code: string): Promise<{ cards: CardRow[] }> {
  return get(`/v1/sets/${game}/${code}/cards`);
}

export function fetchCard(displayKey: string): Promise<CardRow> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}`);
}

// ---- Sealed products -------------------------------------------------------

export interface SealedRow {
  id: string;
  set_id: string | null;
  game: string;
  product_type: string;
  qualifier: string | null;
  name: string;
  image_url: string | null;
  display_key: string;
  msrp_cents: number | null;
  in_print: boolean | null;
  metadata: Record<string, unknown>;
}

export function fetchSealed(game: string, code: string): Promise<{ sealed: SealedRow[] }> {
  return get(`/v1/sets/${game}/${code}/sealed`);
}

// ---- Market view -----------------------------------------------------------

export interface LatestPrice {
  source: string;
  market_price_cents: number | null;
  lowest_price_cents: number | null;
  week_start_date: string | null;
}

export interface CardMarketRow extends CardRow {
  latest_price: LatestPrice | null;
}

export interface SealedMarketRow extends SealedRow {
  latest_price: LatestPrice | null;
}

export interface MarketResponse {
  game: string;
  code: string;
  source: string;
  cards: CardMarketRow[];
  sealed: SealedMarketRow[];
}

export function fetchMarket(game: string, code: string, source?: string): Promise<MarketResponse> {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return get(`/v1/sets/${game}/${code}/market${qs}`);
}

// ---- Snapshots -------------------------------------------------------------

export interface SnapshotRow {
  id: string;
  product_id: string;
  source: string;
  week_start_date: string;
  captured_at: string;
  market_price_cents: number | null;
  lowest_price_cents: number | null;
  lowest_legit_cents: number | null;
  median_price_cents: number | null;
  qty_weighted_avg_cents: number | null;
  listing_count: number | null;
  inventory_units: number | null;
  units_sold_week: number | null;
  net_listings_delta: number | null;
  sellthrough_ratio: number | null;
  refill_rate: number | null;
  days_of_supply: number | null;
  depth_to_plus_10_units: number | null;
  depth_to_plus_25_units: number | null;
  depth_to_plus_50_units: number | null;
  price_percentile_52w: number | null;
  dispersion_vs_ebay_pct: number | null;
  dispersion_vs_manapool_pct: number | null;
  extra: Record<string, unknown>;
}

export function fetchCardSnapshots(
  displayKey: string,
  params?: { source?: string; from?: string; to?: string },
): Promise<{ snapshots: SnapshotRow[] }> {
  const qs = new URLSearchParams();
  if (params?.source) qs.set("source", params.source);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const q = qs.toString() ? `?${qs}` : "";
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/snapshots${q}`);
}

export function fetchSealedSnapshots(
  displayKey: string,
  params?: { source?: string; from?: string; to?: string },
): Promise<{ snapshots: SnapshotRow[] }> {
  const qs = new URLSearchParams();
  if (params?.source) qs.set("source", params.source);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const q = qs.toString() ? `?${qs}` : "";
  return get(`/v1/sealed/${encodeURIComponent(displayKey)}/snapshots${q}`);
}

// ---- Listings --------------------------------------------------------------

export interface ListingRow {
  id: string;
  source: string;
  captured_at: string;
  listing_id: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller_feedback_count: number | null;
  seller_feedback_pct: number | null;
  price_cents: number;
  shipping_cents: number | null;
  quantity: number;
  condition: string | null;
  is_direct: boolean | null;
  phantom_score: number | null;
  fake_score: number | null;
}

export function fetchCardListings(
  displayKey: string,
  params?: { source?: string },
): Promise<{ listings: ListingRow[]; captured_at: string | null }> {
  const qs = new URLSearchParams();
  if (params?.source) qs.set("source", params.source);
  const q = qs.toString() ? `?${qs}` : "";
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/listings${q}`);
}

// ---- Graded ----------------------------------------------------------------

export interface CoverageSet {
  game: string;
  set_code: string;
  set_name: string;
  release_date: string | null;
  total_cards: number;
  cards_with_graded_data: number;

  cards_with_raw_prices: number;
  raw_prices_updated: string | null;

  cards_with_psa_prices: number;
  psa_prices_updated: string | null;

  cards_with_cgc_prices: number;
  cgc_prices_updated: string | null;

  cards_with_psa_gem_rate: number;
  psa_gem_rate_updated: string | null;

  cards_with_cgc_gem_rate: number;
  cgc_gem_rate_updated: string | null;

  psa_pop_url: string | null;
  cgc_pop_url: string | null;
  pricecharting_console_url: string | null;
}

// By default the coverage endpoint counts only cards worth grading (holo Rare
// and up). Pass { all: true } to include Common / Uncommon / non-holo Rare.
export function fetchGradedCoverage(
  game = "pokemon",
  opts?: { all?: boolean },
): Promise<{ sets: CoverageSet[] }> {
  const qs = new URLSearchParams();
  if (game) qs.set("game", game);
  if (opts?.all) qs.set("all", "true");
  const q = qs.toString() ? `?${qs}` : "";
  return get(`/v1/graded/coverage${q}`);
}

export interface ROICard {
  card_id: string;
  display_key: string;
  name: string;
  number: string;
  rarity: string | null;
  finish: string | null;
  image_url: string | null;
  price_week: string | null;
  graded_watch: boolean;
  pc_url: string | null;
  raw_price_cents: number | null;
  psa_9_cents: number | null;
  psa_10_cents: number | null;
  cgc_10_cents: number | null;
  psa_gem_pop: number | null;
  psa_total_pop: number | null;
  cgc_gem_pop: number | null;
  cgc_total_pop: number | null;
  // When each value above was captured.
  raw_price_at?: string | null;
  psa_9_at?: string | null;
  psa_10_at?: string | null;
  cgc_10_at?: string | null;
  psa_pop_at?: string | null;
  cgc_pop_at?: string | null;
  tracked?: boolean;
  tracked_reason?: string | null;
}

// Defaults to grading-worthy rarities only; pass { all: true } for every card,
// or { tracked: true } for just the graded tracker's cards.
export function fetchSetGraded(
  game: string,
  setCode: string,
  opts?: { all?: boolean; tracked?: boolean },
): Promise<{ game: string; set_code: string; cards: ROICard[] }> {
  const qs = new URLSearchParams();
  if (opts?.all) qs.set("all", "true");
  if (opts?.tracked) qs.set("tracked", "true");
  const q = qs.toString() ? `?${qs}` : "";
  return get(`/v1/sets/${game}/${setCode}/graded${q}`);
}

export async function updateSetExternalIds(
  game: string,
  code: string,
  name: string,
  patch: Record<string, string | null>,
): Promise<unknown> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const auth = await authHeaders();
  return fetch(`${BASE}/v1/admin/sets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...auth,
    },
    body: JSON.stringify({ game, code, name, external_ids: patch }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} updateSetExternalIds`);
    return r.json();
  });
}

// ---- Graded refresh (proxied to Python worker) -----------------------------

export type RefreshSource = "psa-pop" | "cgc-pop" | "console-prices";

export interface RefreshJob {
  id: string;
  game: string;
  set_code: string;
  source: RefreshSource;
  url: string;
  status: "pending" | "running" | "succeeded" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  log_tail: string;
}

export async function triggerGradedRefresh(
  game: string,
  setCode: string,
  source: RefreshSource,
  url: string,
): Promise<{ job_id: string; status: string }> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const auth = await authHeaders();
  return fetch(`${BASE}/v1/admin/graded/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...auth,
    },
    body: JSON.stringify({ game, set_code: setCode, source, url }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} triggerGradedRefresh`);
    return r.json();
  });
}

export async function fetchGradedJob(jobId: string): Promise<RefreshJob> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const auth = await authHeaders();
  return fetch(`${BASE}/v1/admin/graded/jobs/${encodeURIComponent(jobId)}`, {
    headers: auth,
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} fetchGradedJob`);
    return r.json();
  });
}

export async function toggleGradedWatch(displayKey: string, watch: boolean): Promise<{ watch: boolean }> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const auth = await authHeaders();
  return fetch(`${BASE}/v1/admin/cards/${encodeURIComponent(displayKey)}/graded-watch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...auth,
    },
    body: JSON.stringify({ watch }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} toggle-watch`);
    return r.json() as Promise<{ watch: boolean }>;
  });
}

export interface GradedSnapshot {
  company: string;
  grade: string;
  data_source: string;
  week_start_date: string;
  market_price_cents: number | null;
  last_sale_cents: number | null;
  pop_count: number | null;
  pop_total: number | null;
  gem_rate_pct: number | null;
}

export function fetchCardGraded(displayKey: string): Promise<{
  card_id: string;
  display_key: string;
  snapshots: GradedSnapshot[];
}> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/graded`);
}

// ---- Graded tracker ----------------------------------------------------------
// Curated cards with one column group per source; see
// .github/projects/graded-tracker/ARCHITECTURE.md. Read-only here: sales and
// supply are entered through the MCP server (market-tracker-backend/cmd/mcp).

export interface PcPrice {
  cents: number;
  week_start_date: string;
  captured_at: string;
}

// A grader's latest population: copies at the top grade (PSA 10 / any CGC 10)
// and at 9, out of all graded copies.
export interface PopSummary {
  gem: number;
  nine: number | null; // copies graded a plain 9; null until stored
  total: number;
  week_start_date: string;
  captured_at: string;
}

export interface SalesSummary {
  median_all_in_cents: number | null;
  min_all_in_cents: number | null;
  sold_7d: number;
  sold_window: number;
  sold_total: number;
  last_sold_at: string | null;
  last_all_in_cents: number | null;
  last_recorded_at: string | null;
}

export interface SupplySummary {
  active_count: number;
  observed_at: string;
  closes_at?: string;
}

// Collectibility rank (backend internal/collectibility/collectibility.yaml):
// tier "top" (with position), "a", "b", "c", or none; score 0-100.
export interface CollectRank {
  tier?: "top" | "a" | "b" | "c";
  position?: number;
  score: number;
}

export interface TrackedPokemon extends CollectRank {
  slug: string;
  name: string;
  dex: number;
}

export interface TrackedCard {
  card_id: string;
  display_key: string;
  set_code: string;
  name: string;
  number: string;
  finish?: string;
  rarity?: string;
  artist?: string;
  image_url?: string;
  reason: string;
  pinned: boolean;
  excluded: boolean;
  note?: string;
  pricecharting: Record<string, PcPrice>; // grade key -> price
  pop?: Record<string, PopSummary>; // grader ("psa" | "cgc") -> latest pop
  pokemon?: TrackedPokemon; // species on the card; absent for Trainers / items / energy
  artist_rank?: CollectRank;
  sales: Record<string, Record<string, SalesSummary>>; // source -> grade key -> summary
  sales_groups?: Record<string, Record<string, SalesSummary>>; // source -> grade group -> summary
  set_release_date?: string;
  supply: Record<string, Record<string, SupplySummary>>;
}

export interface SourceFreshness {
  latest_data_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  stale: boolean;
}

export interface TrackedResponse {
  game: string;
  sets: string[];
  window_days: number;
  grades: string[];
  sources: Record<string, SourceFreshness>;
  sales_groups?: SalesGroup[];
  cards: TrackedCard[];
}

// One tile in the set browser (language -> era -> set).
export interface BrowseSet {
  code: string;
  name: string;
  lang: "en" | "ja" | string;
  era: string | null; // "me" | "sv" | "swsh" ...
  era_name: string | null;
  release_date: string | null;
  logo_url: string | null;
  cover_url: string | null; // priciest tracked card's art; used when there's no logo
  tracked: number;
  pricecharting_at: string | null;
  fanatics_at: string | null;
  psa_pop_at: string | null;
}

// Sets with tracked cards; { all: true } adds every other Pokémon set too.
export function fetchTrackedSets(opts?: { all?: boolean }): Promise<{ sets: BrowseSet[] }> {
  return get(`/v1/tracked/sets${opts?.all ? "?all=true" : ""}`);
}

export function fetchTracked(params?: { set?: string; windowDays?: number }): Promise<TrackedResponse> {
  const qs = new URLSearchParams();
  if (params?.set) qs.set("set", params.set);
  if (params?.windowDays) qs.set("window_days", String(params.windowDays));
  const s = qs.toString();
  return get(`/v1/tracked${s ? `?${s}` : ""}`);
}

export interface CardSale {
  id: string;
  grade_key: string;
  source: string;
  sold_at: string;
  price_cents: number;
  buyers_premium_pct?: number;
  shipping_cents?: number;
  all_in_cents: number;
  sale_type?: string;
  external_id?: string;
  cert_number?: string;
  url?: string;
  title_raw?: string;
  note?: string;
  entry_method: string;
  recorded_at: string;
}

export interface CardSalesWeek {
  grade_key: string;
  source: string;
  week_start_date: string;
  sold_count: number;
  median_all_in_cents: number;
  min_all_in_cents: number;
  max_all_in_cents: number;
}

export interface CardSupplySnapshot {
  id: string;
  grade_key: string;
  source: string;
  observed_at: string;
  active_count: number;
  closes_at?: string;
  url?: string;
  note?: string;
  entry_method: string;
}

export function fetchCardSales(displayKey: string): Promise<{
  display_key: string;
  name: string;
  sales: CardSale[];
  weekly: CardSalesWeek[];
  supply: CardSupplySnapshot[];
}> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/sales`);
}

// ---- card history (GET /v1/cards/{key}/history) ----------------------------

export interface SalesGroup {
  key: string; // "psa-10" | "psa-9" | "cgc-10-pristine" | "cgc-10" | "cgc-7-9"
  label: string;
  grades: string[];
}

export interface PcHistoryWeek {
  week_start_date: string;
  raw: number | null;
  psa_9: number | null;
  psa_10: number | null;
  cgc_10: number | null;
  cgc_10_pristine: number | null;
}

// One grade group's Fanatics week. Prices are all-in cents; listed is the
// most copies up for sale at once that week (null = not counted).
export interface FanaticsHistoryWeek {
  week_start_date: string;
  group: string;
  sold: number;
  auctions: number;
  buy_now: number;
  avg_cents: number | null;
  median_cents: number | null;
  min_cents: number | null;
  max_cents: number | null;
  listed: number | null;
  auction_median_cents: number | null;
  buy_now_median_cents: number | null;
}

export interface PopHistoryWeek {
  week_start_date: string;
  company: string;
  gem: number;
  nine: number | null;
  pristine: number | null; // CGC Pristine 10 + Perfect 10
  total: number;
}

export interface CardHistory {
  display_key: string;
  name: string;
  weeks: number;
  groups: SalesGroup[];
  pricecharting: PcHistoryWeek[];
  fanatics: FanaticsHistoryWeek[];
  pop: PopHistoryWeek[];
  live: Record<string, LiveGroup>; // grade group -> what's listed on Fanatics now
  live_by_source?: Record<string, Record<string, LiveGroup>>; // source ("fanatics", "ebay") -> grade group -> listed now
}

// What's listed on Fanatics right now in one grade group.
export interface LiveGroup {
  auctions: number;
  auction_bids: number;
  auction_high_cents: number | null;
  auction_low_cents: number | null;
  buy_now: number;
  buy_now_low_cents: number | null; // cheapest Buy Now: the current ceiling
  buy_now_median_cents: number | null;
  checked_at: string | null;
}

export function fetchCardHistory(displayKey: string, weeks = 26): Promise<CardHistory> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/history?weeks=${weeks}`);
}

// ---- history imports (screenshot drop box; admin) ---------------------------

export type ImportSource = "pricecharting" | "fanatics" | "ebay" | "130point" | "other";

export interface HistoryImport {
  id: string;
  display_key: string | null;
  card_name: string | null;
  source: ImportSource;
  grade_hint?: string;
  note?: string;
  content_type: string;
  size_bytes: number;
  status: "pending" | "processing" | "done" | "failed" | "rejected";
  result?: Record<string, unknown>;
  error?: string;
  uploaded_by?: string;
  created_at: string;
  processed_at?: string;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(await authHeaders()), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      msg = JSON.parse(body).message ?? body;
    } catch {
      /* not JSON */
    }
    throw new Error(res.status === 401 ? "Sign in with Google to do this" : `${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export function uploadHistoryImport(f: {
  displayKey: string;
  source: ImportSource;
  gradeHint?: string;
  note?: string;
  image: Blob;
}): Promise<HistoryImport> {
  const form = new FormData();
  form.set("display_key", f.displayKey);
  form.set("source", f.source);
  if (f.gradeHint) form.set("grade_hint", f.gradeHint);
  if (f.note) form.set("note", f.note);
  form.set("image", f.image, "screenshot");
  return adminFetch("/v1/admin/imports", { method: "POST", body: form });
}

export function fetchHistoryImports(displayKey: string): Promise<{ imports: HistoryImport[] }> {
  return adminFetch(`/v1/admin/imports?display_key=${encodeURIComponent(displayKey)}&limit=50`);
}


// ---- buying analysis (GET /v1/cards/{key}/analysis, /v1/analysis/deals) ------

export interface MarketValue {
  cents: number;
  source: "pricecharting" | "ebay_sold_90d" | "fanatics_bin" | string;
  as_of?: string;
}

export interface GradeAnalysis {
  grade: string; // raw, psa-10, psa-9, cgc-10, cgc-10-pristine
  market?: MarketValue;
  expected_ratio?: number;
  expected_all_in_cents?: number;
  expected_hammer_cents?: number;
  max_bid_cents?: number;
  max_all_in_cents?: number;
  flip_margin?: number;
  supply?: "quiet" | "usual" | "heavy" | "dump";
  live_auctions: number;
  usual_auctions_per_week: number;
  card_auction_weeks: number;
  card_ratio?: number;
  baseline_ratio?: number;
  ceiling_cents?: number;
  ceiling_source?: string;
  ceiling_as_of?: string;
  sales_per_week: number;
  spread?: number;
  sales_90d: number;
}

export interface BuyAction {
  kind: "buy_raw_to_grade" | "buy_psa10" | "bid_auction" | "buy_now" | "watch";
  grade?: string;
  headline: string;
  why: string;
  max_cents?: number;
}

export interface AnalysisSettings {
  fee_cents: number;
  extra_cents: number;
  sell_fee_pct: number;
  min_roi: number;
  min_profit_cents: number;
  target_margin: number;
  exit_fee_pct: number;
  premium_pct: number;
  buy_ten_below_ev: number;
}

export interface CardAnalysis {
  display_key: string;
  name: string;
  set_code: string;
  months_since_release?: number;
  gem_rates: Record<string, number>;
  grading?: {
    p10: number;
    p9?: number;
    cost_cents: number;
    ev_cents: number;
    roi: number;
    cost_per_10_cents?: number;
    ten_value?: number;
    max_raw_cents?: number;
  };
  grades: GradeAnalysis[];
  trend?: Record<string, number>;
  collectibility: Record<string, number>;
  actions: BuyAction[];
  flags: string[];
  settings: AnalysisSettings;
}

export interface Deal {
  display_key: string;
  name: string;
  set_code: string;
  action: BuyAction;
  margin: number;
  market_cents: number;
}

function analysisQS(o?: { targetMargin?: number; exitFeePct?: number }): URLSearchParams {
  const q = new URLSearchParams();
  if (o?.targetMargin != null) q.set("target_margin", String(o.targetMargin));
  if (o?.exitFeePct != null) q.set("exit_fee_pct", String(o.exitFeePct));
  return q;
}

export function fetchCardAnalysis(displayKey: string, o?: { targetMargin?: number; exitFeePct?: number }): Promise<CardAnalysis> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/analysis?${analysisQS(o)}`);
}

export function fetchDeals(o?: { targetMargin?: number; exitFeePct?: number; kind?: string; limit?: number }): Promise<{ deals: Deal[]; settings: AnalysisSettings }> {
  const q = analysisQS(o);
  if (o?.kind) q.set("kind", o.kind);
  q.set("limit", String(o?.limit ?? 100));
  return get(`/v1/analysis/deals?${q}`);
}
