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
  nine_five?: number | null; // CGC 9.5s (null for PSA / until stored)
  pristine?: number | null; // CGC Pristine + Perfect 10s, inside gem (null for PSA / until stored)
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
  play?: PlaySummary; // where capital should go (strategy summary)
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
  stale_after_days: number; // gem rates: by the set's age (8 / 30 / 90 days)
  recheckable: boolean; // "recheck now" exists (one set's page; not eBay)
  recheck?: RecheckStatus; // the latest one, last 3 days
}

export interface RecheckStatus {
  job_id: number;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  queued_at: string;
  finished_at?: string;
  error?: string;
}

// Queue one source of one set ahead of its schedule (an open recheck is
// returned instead of a second).
export function recheckSetSource(code: string, source: string): Promise<{ recheck: RecheckStatus; already: boolean }> {
  return adminFetch(`/v1/admin/sets/${encodeURIComponent(code)}/recheck`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }),
  });
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
  source: "pricecharting" | "ebay_sold_90d" | "sold_90d" | string;
  as_of?: string;
  basis?: {
    method: string; // pricecharting, median_sold, median_sold_ebay
    window_days: number;
    sales_count: number;
    median_cents?: number;
    pricecharting_cents?: number;
    overrode_pricecharting: boolean;
    note: string;
  };
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
  buy_now_listings: number;
  bin_sales_per_week: number;
  weeks_of_supply?: number;
  next_week_auctions: number;
}

export interface BuyAction {
  kind: "buy_raw_to_grade" | "buy_raw_to_grade_cgc" | "buy_psa10" | "bid_auction" | "buy_now" | "watch";
  grade?: string;
  headline: string;
  why: string;
  max_cents?: number;
  metrics?: ActionMetrics;
}

export interface ActionMetrics {
  market_cents?: number;
  bottom_cents?: number;
  bottom_month?: number;
  months_to_bottom: number;
  buy_under_cents?: number;
  card_change?: number;
  curve_bottom?: number;
  phase?: string;
  break_even_cents?: number;
  target_cents?: number;
}

export interface ServiceTier {
  name: string;
  fee_cents: number;
  max_value_cents: number; // 0 = no cap
  turnaround_days: number;
}

export interface Grader {
  name: string;
  ship_cents: number; // per card, both ways
  tiers: ServiceTier[];
}

export interface AnalysisSettings {
  graders: Record<string, Grader>;
  sourcing_pct: number;
  capital_rate: number;
  use_timing: boolean;
  sell_fee_pct: number;
  exit_fee_pct: number;
  premium_pct: number;
  target_margin: number;
  min_roi: number;
  min_profit_cents: number;
  buy_ten_below_ev: number;
  benchmark_rate: number;
  miss_floor_cgc_cents: number;
  miss_floor_psa_cents: number;
  auto_prep?: AutoPrepRules;
  snipe?: SnipeRules;
  collector_crypt?: CCRules;
  out_of_print_months: number;
  crack_psa9_to_cgc10_rate: number;
  crack_cgc10_to_psa10_rate: number;
  ebay_ship_cents: number;
  vault_inbound_cents: number;
  vault_withdraw_cents: number;
  list_markup_pct: number;
  accept_offer_pct: number;
  min_offer_pct: number;
  updated_at?: string;
  updated_by?: string;
}

export interface GradingEV {
  grader: string;
  tier?: string;
  fee_cents: number;
  ship_cents: number;
  turnaround_days: number;
  sourcing_pct: number;
  capital_rate: number;
  sell_fee_pct: number;
  ten_drift: number;
  p10: number;
  p9?: number;
  p_top?: number; // CGC Pristine share
  cost_cents: number;
  time_cost_cents: number;
  ev_cents: number;
  roi: number;
  cost_per_10_cents?: number;
  break_even_cents?: number;
  ten_value?: number;
  max_raw_cents?: number;
  break_even_raw_cents?: number;
  nine_cents?: number;
  nine_source?: string;
  working?: EVWorking;
  break_even_working?: BreakEvenWorking;
}

// The cost to make a 10, figure by figure (GradingEV.break_even_working).
export interface BreakEvenWorking {
  raw_cents: number;
  cost_cents: number; // per graded copy
  salvage_cents: number; // what the misses bring back per copy, after the fee
  ten_share: number; // 10s (Pristine included) per copy graded
  cost_per_10_cents: number;
  sell_fee_pct: number;
  break_even_cents: number;
}

export interface MakeRow {
  display_key: string;
  name: string;
  set_code: string;
  image_url?: string;
  months_since_release?: number;
  in_print: boolean;
  grade: "psa-10" | "cgc-10";
  market: MarketValue;
  sales_90d: number;
  cheapest_buy_now_cents?: number;
  cheapest_buy_now_source?: string;
  buy_now_listings: number;
  break_even_cents: number;
  gap_pct: number; // market / cost to make - 1
  make: GradingEV;
  // This week's Fanatics auctions of this grade.
  auctions_this_week: number;
  auction_bids: number;
  auction_low_cents?: number; // lowest current bid (hammer)
  expected_all_in_cents?: number; // the usual close for this week's supply
  max_bid_under_make_cents?: number; // most to bid and pay no more than the cost to make, all-in
}

export function fetchMakeVsMarket(): Promise<{ count: number; rows: MakeRow[]; formula: string; settings: Record<string, unknown> }> {
  return get(`/v1/analysis/make-vs-market`);
}

// One copy's grading math, line by line: cost lines add up to cost_cents,
// outcomes (share x price) to gross_cents; net - cost = profit.
export interface EVLine { label: string; share?: number; unit_cents?: number; cents: number; note?: string }
export interface EVWorking {
  cost: EVLine[];
  outcomes: EVLine[];
  gross_cents: number;
  sell_fee_cents: number;
  net_cents: number;
  cost_cents: number;
  profit_cents: number;
}

export interface FairValue {
  grade: string; // psa-10, cgc-10
  grader: string;
  tier: string;
  make_cents: number;
  desirability?: string;
  cards?: number;
  low_cents?: number;
  mid_cents?: number;
  high_cents?: number;
  market_cents?: number;
  markup_median?: number;
  card_markup?: number;
  position?: "below" | "within" | "above";
  turnaround_days: number;
}

export interface Lifecycle {
  grade: string;
  curve_lang: string;
  month: number;
  phase: "falling" | "bottom" | "recovering" | "unknown";
  bottom_month: number;
  window_from: number;
  window_to: number;
  to_bottom: number;
  post_hype: boolean;
  provisional: boolean;
  min_sets: number;
  curve_category: string;
  bottom_change: number;
  now_change: number;
  market_cents?: number;
  launch_cents?: number;
  card_change?: number;
  bottom_cents?: number;
  buy_under_cents?: number;
  months_to_bottom: number;
}

export interface CurvePoint {
  month: number;
  change: number;
  n: number;
  sets: number;
}

export type CurveCategory = "all" | "ir" | "sir" | "ultra" | "gold" | "gallery" | "promo" | string; // or a factor bucket: poke:top, artist:a, trainer:s, scarcity:4
export type CurveGrade = "raw" | "psa-10" | "psa-9" | "cgc-10" | "cgc-10-pristine" | "cgc-7-9" | "premium";
export type CurveLang = "en" | "ja" | "all";

export interface ReleaseCurve {
  category: CurveCategory;
  grade: CurveGrade;
  lang: CurveLang;
  points: CurvePoint[];
  bottom_month: number;
  bottom_change: number;
  window_from: number;
  window_to: number;
  provisional: boolean;
  min_sets: number;
  cards: number;
  returns: { buy_month: number; hold_months: number; change: number }[];
}

export interface CurveBottoms {
  category: CurveCategory;
  grade: string;
  lang: string;
  cards: number;
  sets: number;
  median_month: number;
  p25_month: number;
  p75_month: number;
  median_drop: number;
}

export interface Appreciation {
  cards: number;
  sets: number;
  median: number;
  p25: number;
  p75: number;
  beat_share: number;
  net_median_2y: number;
  p10: number;
  down_share: number;
  median_drawdown: number;
}

export interface WindowRow {
  category: CurveCategory;
  grade: CurveGrade;
  lang: CurveLang;
  bottom_month: number;
  bottom_change: number;
  window_from: number;
  window_to: number;
  hold_rate?: number;
  hold_months?: number;
  trailing?: Appreciation;
  outperforms: boolean;
  provisional: boolean;
  min_sets: number;
  cards: number;
  month4_change?: number;
  post_hype?: { buy_at: "month_4" | "bottom"; buy_month: number; hold_months: number; yearly: number; total: number }[];
}

export interface ReleaseCurves {
  built_at: string;
  benchmark: number;
  sell_fee_pct: number;
  curves: ReleaseCurve[];
  bottoms: CurveBottoms[];
  table: WindowRow[];
  scarcity_bounds?: number[];
}

export interface CardAnalysis {
  display_key: string;
  name: string;
  set_code: string;
  months_since_release?: number;
  gem_rates: Record<string, number>;
  image_url?: string;
  grading?: GradingEV;
  grading_by: Record<string, GradingEV>;
  fair: FairValue[];
  lifecycle: Record<string, Lifecycle>;
  strategy?: Strategy;
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
  image_url?: string;
  months_since_release?: number;
  phase?: Lifecycle["phase"];
  post_hype?: boolean;
  timing_provisional?: boolean;
  fair?: FairValue;
  action: BuyAction;
  margin: number; // Buy Now deals: net resale at market ÷ the ask − 1
  market_cents: number;
  ask_cents?: number; // Buy Now deals: the listed price
  cost_to_make_cents?: number; // Buy Now deals on a 10: what grading for one costs
  sell_speed?: SellSpeed; // graded deals: how fast a Fanatics Buy Now sells
}

function analysisQS(o?: { targetMargin?: number; exitFeePct?: number }): URLSearchParams {
  const q = new URLSearchParams();
  if (o?.targetMargin != null) q.set("target_margin", String(o.targetMargin));
  if (o?.exitFeePct != null) q.set("exit_fee_pct", String(o.exitFeePct));
  return q;
}

// Latest reading of a card from each outside price source.
export interface PriceReading {
  source: "pokemonpricetracker" | "poketrace" | string;
  channel: "tcgplayer" | "ebay" | "sold" | "cardmarket" | string;
  grade: string;
  condition?: string;
  metric: string; // market, low, avg, median, median_7d, median_30d, avg_7d, avg_30d, smart_market
  price_cents: number;
  sample_n?: number;
  confidence?: string;
  as_of?: string;
  observed_on: string;
}

export function fetchPriceSources(displayKey: string): Promise<{ readings: PriceReading[] }> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/price-sources`);
}

export function fetchCardAnalysis(displayKey: string, o?: { targetMargin?: number; exitFeePct?: number }): Promise<CardAnalysis> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/analysis?${analysisQS(o)}`);
}

export function fetchDeals(o?: { targetMargin?: number; exitFeePct?: number; kind?: string; limit?: number; afterHype?: boolean; lang?: "en" | "ja" | "zh" }): Promise<{ deals: Deal[]; settings: AnalysisSettings }> {
  const q = analysisQS(o);
  if (o?.kind) q.set("kind", o.kind);
  if (o?.afterHype) q.set("after_hype", "1");
  if (o?.lang) q.set("lang", o.lang);
  q.set("limit", String(o?.limit ?? 100));
  return get(`/v1/analysis/deals?${q}`);
}

export function fetchReleaseCurves(lang?: string): Promise<ReleaseCurves> {
  return get(`/v1/analysis/release-curves${lang ? `?lang=${lang}` : ""}`);
}

export function fetchSettings(): Promise<{ settings: AnalysisSettings; defaults: AnalysisSettings }> {
  return get("/v1/settings");
}

export function saveSettings(s: AnalysisSettings): Promise<{ settings: AnalysisSettings; defaults: AnalysisSettings }> {
  return adminFetch("/v1/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
}

export interface StrategyStep {
  kind: "grade_raw" | "sell_misses" | "bid" | "buy_now" | "hold" | "wait" | string;
  text: string;
  cents?: number;
}

export interface Projection {
  grade: string;
  yearly: number;
  net_yearly_2y: number;
  beats_benchmark: boolean;
  basis: { category: string; median: number; cards: number; beat_share: number }[];
}

export interface Strategy {
  stance: "invest" | "grade" | "flip" | "wait" | "pass";
  headline: string;
  steps: StrategyStep[];
  projection: Record<string, Projection>;
}

export interface PlaySummary {
  stance: Strategy["stance"];
  headline: string;
  projection?: number;
  raw_cents?: number;
  bottom_cents?: number;
  target_cents?: number;
  break_even_cents?: number;
  bid_cents?: number;
  grader?: string;
}

export interface AuctionWeek {
  week: string;
  auctions: number;
  auction_median_all_in_cents?: number;
  auction_median_hammer_cents?: number;
  auction_low_all_in_cents?: number;
  auction_high_all_in_cents?: number;
  buy_now_sales: number;
  buy_now_median_cents?: number;
  ebay_sales: number;
  ebay_median_cents?: number;
  raw_cents?: number;
  floor_cents?: number;
  make_ten_cents?: number;
}

export interface AuctionWeeks {
  display_key: string;
  grade: string;
  grader?: string;
  tier?: string;
  fee_cents: number;
  ship_cents: number;
  gem_rate?: number;
  weeks: AuctionWeek[];
  this_week_auctions: number;
  next_week_auctions: number;
  buy_now_listings: number;
  buy_now_low_cents?: number;
  weeks_of_supply?: number;
  avg_auctions_per_week: number;
}

export function fetchAuctionWeeks(displayKey: string, grade: string): Promise<AuctionWeeks> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/auction-weeks?grade=${grade}&weeks=26`);
}

export type WatchIntent = "grade" | "invest" | "flip" | "watch";

export interface WatchItem {
  display_key: string;
  name: string;
  number: string;
  set_code: string;
  set_name: string;
  set_release_date?: string;
  image_url?: string;
  intent: WatchIntent;
  auto_fanatics?: boolean; // auto-prep: any live Fanatics copy goes to Buying prep
  targets?: BuyTarget[];
  note?: string;
  added_by?: string;
  created_at: string;
  psa10_cents?: number;
  play?: PlaySummary;
  targets_detail?: WatchTarget[];
  hits?: number;
}

export function fetchWatchlist(keysOnly = false): Promise<{ count: number; items: WatchItem[] }> {
  return adminFetch(`/v1/admin/watchlist${keysOnly ? "?keys_only=1" : ""}`);
}

export function setAutoFanatics(displayKey: string, on: boolean): Promise<unknown> {
  return adminFetch(`/v1/admin/watchlist/${encodeURIComponent(displayKey)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto_fanatics: on }),
  });
}

export function watchCard(displayKey: string, intent: WatchIntent, note?: string): Promise<unknown> {
  return adminFetch(`/v1/admin/watchlist/${encodeURIComponent(displayKey)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, note }),
  });
}

export async function unwatchCard(displayKey: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/admin/watchlist/${encodeURIComponent(displayKey)}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
}

// ---- Automation (job queue + worker) ----

export interface KindConfig {
  enabled: boolean;
  cadence_hours?: Record<string, number>;
  batch_size?: number;
  delay_ms?: number;
  daily_hour_utc?: number;
  model?: string;
  effort?: "low" | "medium" | "high";
  max_items?: number;
  timeout_s?: number;
}

export interface TierRules {
  hot_new_set_months: number;
  hot_owned: boolean;
  hot_watchlist: boolean;
  warm_pokemon_tiers: string[];
  warm_artist_tiers: string[];
  warm_rarity_tiers: string[];
}

export interface Automation {
  enabled: boolean;
  tiers: TierRules;
  kinds: Record<string, KindConfig>;
  agents: { mode: "primary_first" | "balanced" };
  updated_at?: string;
  updated_by?: string;
}

export interface Job {
  id: number;
  kind: string;
  lane: string;
  scope: { tiers?: Record<string, number>; card_ids?: string[] };
  priority: number;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  source: string;
  requested_by?: string;
  claimed_by?: string;
  claimed_at?: string;
  finished_at?: string;
  attempts: number;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
}

export interface AutomationStatus {
  settings: Automation;
  defaults: Automation;
  tiers: Record<string, { cards: number; due: Record<string, number> }>;
  queue: Record<string, number>;
  workers: { name: string; last_seen: string; online: boolean; info: Record<string, unknown> }[];
  recent: Job[];
}

export interface SettingChange {
  at: string;
  key: string;
  old: unknown;
  new: unknown;
  actor?: string;
}

export function fetchAutomation(): Promise<AutomationStatus> {
  return get("/v1/automation");
}

export function saveAutomation(a: Automation): Promise<AutomationStatus> {
  return adminFetch("/v1/admin/automation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
}

export function runJob(body: { kind: string; tier?: string; card_keys?: string[] }): Promise<{ id: number }> {
  return adminFetch("/v1/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function cancelJob(id: number): Promise<void> {
  const res = await fetch(`${BASE}/v1/admin/jobs/${id}/cancel`, { method: "POST", headers: await authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
}

export function fetchSettingsAudit(prefix = ""): Promise<{ changes: SettingChange[] }> {
  return adminFetch(`/v1/admin/settings-audit?prefix=${encodeURIComponent(prefix)}&limit=200`);
}

export interface AgentFinding {
  id: number;
  job_id?: number;
  kind: "agent_deal_vetting" | "agent_data_triage" | string;
  display_key?: string;
  card_name?: string;
  subject: string;
  verdict: "ok" | "flag" | "fix" | "info" | string;
  summary: string;
  details: { issues?: string[]; fix?: string; confidence?: string; title?: string; url?: string; price_cents?: number; grade_key?: string };
  model?: string;
  account?: string;
  created_at: string;
}

export function fetchFindings(o?: { kind?: string; card?: string; limit?: number }): Promise<{ findings: AgentFinding[] }> {
  const q = new URLSearchParams();
  if (o?.kind) q.set("kind", o.kind);
  if (o?.card) q.set("card", o.card);
  q.set("limit", String(o?.limit ?? 100));
  return get(`/v1/agent/findings?${q}`);
}

// ---- This week's auctions (Deals) -------------------------------------------

export interface AuctionSource {
  source: string;
  auctions: number;
  next_week: number;
  bids: number;
  high_bid_cents?: number;
  low_bid_cents?: number;
  first_ends_at?: string;
}

export interface AuctionListing {
  price_cents: number;
  title: string;
  url?: string;
  kind: "buy_now" | "auction";
  ends_at?: string;
}

export interface LaunchAnchor {
  sales: number;
  avg_cents: number;
  at_month: number;
  first_sold_at: string;
  now_cents?: number;
  after: { months_after_first: number; month: number; date: string; expected_cents: number; extrapolated?: boolean }[];
  note?: string;
}

export interface EdgeCalc {
  edge_pct?: number;
  adjusted_pct?: number; // edge x confidence weight: what "Biggest edge" sorts by
  steal_pct?: number;
  projected_all_in_cents: number;
  projected_hammer_cents: number;
  usual_close_cents: number;
  usual_weeks: number;
  method: "card_history" | "grade_model";
  supply_bucket: string;
  supply_adj_pct: number;
  supply_source: "card" | "grade" | "none";
  live_this_week: number;
  fanatics_closes_per_week: number;
  buy_now_listings: number;
  sales_per_week: number;
  resale: {
    channel: "ebay" | "fanatics_buy_now" | "market";
    gross_cents: number; fees_cents: number; net_cents: number;
    ebay_median_cents?: number; ebay_sales: number;
    fanatics_buy_now_median_cents?: number; fanatics_buy_now_sales: number;
    trend_pct?: number;
  };
  breakeven_cents?: number;
  vs_breakeven_pct?: number;
  weeks_to_sell?: number;
  confidence: "low" | "medium" | "high";
  why: string[];
}

export interface AuctionDeal {
  display_key: string;
  name: string;
  set_code: string;
  image_url?: string;
  grade: string;
  search_title?: string;
  months_since_release?: number;
  sources: AuctionSource[];
  live_auctions: number;
  next_week_auctions: number;
  usual_per_week: number;
  usual_fanatics_auctions_per_week?: number;
  pressure?: number; // live ÷ copies sold a week (every channel)
  usual_listed_per_week: number; // Fanatics auctions listed a week, from its first auctioned week
  listing_surge?: number; // this week's Fanatics auctions ÷ usual listed
  first_listed_week?: boolean; // never auctioned in the last 12 weeks: no baseline
  listings?: AuctionListing[];
  value?: { cents: number; source: string; basis?: { method: string; sales_count: number; note: string; pricecharting_cents?: number } };
  expected_hammer_cents?: number;
  expected_all_in_cents?: number;
  breakeven_cents?: number;
  cost_to_make_cents?: number;
  gem_rate_source?: string;
  make_ten?: MakeTen;
  launch?: LaunchAnchor;
  weeks: { week: string; closed: number; avg_cents?: number; vs_breakeven?: number }[];
  our_value_cents?: number;
  snipe_all_in_cents?: number;
  snipe_hammer_cents?: number;
  edge?: number;
  edge_calc?: EdgeCalc;
  links?: MarketLinks;
  auction_low?: { hammer_cents: number; all_in_cents: number; sold_at: string; url?: string; auctions: number };
  fanatics_bin_low_cents?: number;
  fanatics_bin_listings: number;
  fanatics_bin_sold_median_cents?: number;
  fanatics_bin_sold_n: number;
  sell_speed?: SellSpeed; // relisting it as a Fanatics Buy Now: how fast it goes
  advice?: { signal: "sell_now" | "hold"; hold_months: number; reason: string };
  projection_confidence?: "low" | "medium" | "high";
  auction_discount?: AuctionDiscount;
  timing?: { phase: "hype" | "post_hype" | "out_of_print" | "recovering" | "unknown"; phase_label: string; raw_action?: string; grade_action?: string; headline?: string };
  flags: string[];
}

export function fetchAuctionDeals(o?: { lang?: "en" | "ja" | "zh"; limit?: number }): Promise<{
  count: number;
  auctions: AuctionDeal[];
  settings: { target_margin: number; sell_fee_pct: number; buyers_premium_pct: number };
}> {
  const q = new URLSearchParams();
  if (o?.lang) q.set("lang", o.lang);
  if (o?.limit) q.set("limit", String(o.limit));
  return get(`/v1/deals/auctions?${q}`);
}

// ---- Set buy windows ----------------------------------------------------------

export interface SetWindow {
  grade: "raw" | "psa-10" | "cgc-10";
  tier: string; // all, ir, sir, ultra, gold, gallery, promo
  curve: string;
  curve_lang: CurveLang;
  cards: number;
  from: number;
  to: number;
  bottom_month: number;
  status: "in_window" | "before" | "after" | "unknown";
  action: "buy" | "watch_only" | "wait" | "past" | "unknown";
  months_to_window?: number;
  to_bottom: number;
  from_bottom: number;
  provisional: boolean;
  min_sets: number;
  headline: string;
}

export interface SetWindows {
  code: string;
  name: string;
  lang: "en" | "ja" | "zh";
  release_date?: string;
  months_since_release: number;
  tracked: number;
  tiers: Record<string, number>;
  in_print: boolean;
  print_source: "override" | "age";
  windows: SetWindow[];
}

export function fetchSetWindows(lang?: "en" | "ja" | "zh"): Promise<{ band: number; out_of_print_months: number; sets: SetWindows[] }> {
  return get(`/v1/analysis/set-windows${lang ? `?lang=${lang}` : ""}`);
}

// Watchlist buy categories: raw (to grade) or the slab to buy.
export type BuyTarget = "raw" | "psa-10" | "psa-9" | "psa-low" | "cgc-10" | "cgc-10-pristine" | "cgc-9" | "cgc-low";
export const BUY_TARGETS: { key: BuyTarget; label: string }[] = [
  { key: "raw", label: "Raw to grade" }, { key: "psa-10", label: "PSA 10" }, { key: "psa-9", label: "PSA 9" },
  { key: "psa-low", label: "PSA 8 & below" }, { key: "cgc-10", label: "CGC 10" }, { key: "cgc-10-pristine", label: "CGC Pristine 10" },
  { key: "cgc-9", label: "CGC 9 / 9.5" }, { key: "cgc-low", label: "CGC 8.5 & below" },
];

// Buy targets with a price rule (see watch_targets on the backend).
export type RuleKind = "pct_market" | "cost_to_make" | "max_raw" | "fixed";
export const RULE_KINDS: { key: RuleKind; label: string; hint: string }[] = [
  { key: "pct_market", label: "% of market", hint: "A share of that grade's market price (8 & below: of the raw price)" },
  { key: "cost_to_make", label: "≤ cost to make a 10", hint: "At or under what a 10 costs to make by grading raw copies (PSA 10, CGC 10)" },
  { key: "max_raw", label: "≤ max raw to grade", hint: "Raw at or under the most you can pay and still clear your grading return bar" },
  { key: "fixed", label: "Fixed $", hint: "A price you set" },
];
export type Channels = "any" | "auction" | "buy_now";

export interface TargetHit {
  source: string;
  grade_key: string;
  kind: "buy_now" | "auction";
  price_cents: number;
  all_in_cents: number;
  title: string;
  url?: string;
  ends_at?: string;
}

export interface WatchTarget {
  id?: string;
  target: BuyTarget;
  rule_kind?: RuleKind | null;
  rule_value?: number | null; // pct_market: share (0.8); fixed: cents
  buy_all: boolean;
  channels: Channels;
  preset?: string | null;
  note?: string | null;
  reference_cents?: number;
  max_cents?: number;
  rule_text?: string;
  hits?: TargetHit[];
}

export interface WatchPreset {
  key: string;
  label: string;
  description: string;
  targets: { target: BuyTarget; rule_kind: RuleKind; rule_value?: number; buy_all: boolean; channels: Channels }[];
}

export function fetchWatchPresets(): Promise<{ presets: WatchPreset[] }> {
  return adminFetch(`/v1/admin/watch-presets`);
}

export function putTargets(displayKey: string, targets: WatchTarget[]): Promise<unknown> {
  const body = targets.map(({ target, rule_kind, rule_value, buy_all, channels, preset, note }) => ({ target, rule_kind: rule_kind || null, rule_value: rule_value ?? null, buy_all, channels, preset: preset ?? null, note: note ?? null }));
  return adminFetch(`/v1/admin/watchlist/${encodeURIComponent(displayKey)}/targets`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: body }),
  });
}

export function applyPreset(displayKeys: string[], preset: string): Promise<{ cards: number; newly_watched: number }> {
  return adminFetch(`/v1/admin/watchlist/apply-preset`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_keys: displayKeys, preset }),
  });
}

export function watchSetTier(setCode: string, tier: string, intent: WatchIntent, note?: string, target?: BuyTarget): Promise<{ watched: number }> {
  return adminFetch(`/v1/admin/watchlist/bulk`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set_code: setCode, tier, intent, note, target }),
  });
}

export function setTargets(displayKey: string, intent: WatchIntent, targets: BuyTarget[]): Promise<unknown> {
  return adminFetch(`/v1/admin/watchlist/${encodeURIComponent(displayKey)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, targets }),
  });
}

export function setPrintStatus(code: string, inPrint: boolean | null): Promise<unknown> {
  return adminFetch(`/v1/admin/sets/${encodeURIComponent(code)}/print`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ in_print: inPrint }),
  });
}

// ---- Card scores and live listings ----------------------------------------------

export type ScoreKind = "keep_raw" | "grade_psa" | "grade_cgc" | "psa9_to_cgc" | "cgc10_to_psa" | "buy_psa10" | "buy_cgc10" | "buy_pristine";
export const SCORE_KINDS: { key: ScoreKind; label: string; hint: string }[] = [
  { key: "keep_raw", label: "Keep raw", hint: "Buy raw to hold: how low today's raw price sits in the card's own history, and where the set is on its release curve" },
  { key: "grade_psa", label: "Grade PSA", hint: "Buy raw to grade with PSA: expected return after fees at the public gem rate" },
  { key: "grade_cgc", label: "Grade CGC", hint: "Buy raw to grade with CGC: expected return after fees, Pristine counted" },
  { key: "psa9_to_cgc", label: "PSA 9 → CGC", hint: "Buy a PSA 9, crack it, send it to CGC (crossover rate from Settings)" },
  { key: "cgc10_to_psa", label: "CGC 10 → PSA", hint: "Buy a CGC 10, crack it, send it to PSA (crossover rate from Settings)" },
  { key: "buy_psa10", label: "Buy PSA 10", hint: "Buy the PSA 10 to hold: price vs its own history, its release curve, vs what a 10 costs to make by grading, liquidity" },
  { key: "buy_cgc10", label: "Buy CGC 10", hint: "Buy the CGC 10 to hold: price vs its own history, its release curve, vs what a 10 costs to make, liquidity" },
  { key: "buy_pristine", label: "Buy Pristine", hint: "Buy the CGC Pristine 10 to hold: price vs its own history, its release curve, liquidity" },
];

export interface CardScore {
  score: number;
  roi?: number;
  ev_cents?: number;
  cost_cents?: number;
  parts: { label: string; points: number; why: string }[];
  note?: string;
}

export interface ScoredCard {
  display_key: string;
  name: string;
  set_code: string;
  image_url?: string;
  in_print: boolean;
  months_since_release?: number;
  scores: Partial<Record<ScoreKind, CardScore>>;
}

export function fetchScores(o?: { set?: string; kind?: ScoreKind; min?: number }): Promise<{ count: number; cards: ScoredCard[] }> {
  const q = new URLSearchParams();
  if (o?.set) q.set("set", o.set);
  if (o?.kind) q.set("kind", o.kind);
  if (o?.min) q.set("min", String(o.min));
  return get(`/v1/analysis/scores?${q}`);
}

export interface CardListing {
  source: string;
  grade_key: string;
  kind: "buy_now" | "auction";
  price_cents: number;
  bids?: number;
  title: string;
  url?: string;
  ends_at?: string;
  last_seen_at: string;
}

// Live Buy Nows and auctions (Fanatics, eBay) with links, every grade.
export function fetchLiveListings(displayKey: string): Promise<{ count: number; listings: CardListing[] }> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/live-listings`);
}

// ---- Marketplace links and buying prep -------------------------------------------

export interface MarketLinks {
  title: string;
  fanatics_buy_now: string;
  fanatics_auctions: string;
  fanatics_sold: string;
  ebay_listings: string;
  ebay_sold: string;
  pricecharting?: string; // the card's PriceCharting page (chart + eBay solds), when known
  weekly_auction_id?: string; // set when fanatics_auctions opens this week's auction
}

export interface MakeTen {
  submission_cents: number;
  p10: number;
  p_miss: number;
  miss_grade: string;
  miss_value_cents: number;
  miss_value_source: string;
  loss_per_miss_cents: number;
  sell_fee_pct: number;
  cost_per_10_cents: number;
  breakeven_10_cents: number;
  current_10_cents: number;
  margin_pct?: number;
  reason: string;
  raw_cents: number;
  grading_fee_cents: number;
  shipping_cents: number;
  route: string;
  gem_source: string;
  gem_scope: string;
  scenarios: { label: "release" | "now" | "projected_low"; raw_cents: number; submission_cents: number; breakeven_10_cents: number; note?: string }[];
}

export function fetchCardLinks(displayKey: string, grade: string): Promise<MarketLinks> {
  return get(`/v1/cards/${encodeURIComponent(displayKey)}/links?grade=${encodeURIComponent(grade)}`);
}

export type BidStatus = "planned" | "bid" | "won" | "lost" | "skipped";

export interface GraderPrep {
  grader: "psa" | "cgc";
  tier?: string;
  roi?: number;
  ev_cents?: number;
  cost_cents?: number;
  breakeven_10_cents?: number;
  breakeven_raw_cents?: number;
  max_raw_cents?: number;
  p10?: number;
}

export interface SinglePrep {
  name: string;
  set_code: string;
  image_url?: string;
  grade: string;
  markets: Record<string, number>;
  sources: Record<string, string>;
  floor_cents?: number;
  floor_month?: number;
  floor_note: string;
  grading: GraderPrep[];
  buy_low_cents?: number;
  buy_high_cents?: number;
  buy_note: string;
  in_print: boolean;
  scores?: Partial<Record<ScoreKind, CardScore>>;
  links?: MarketLinks;
}

export type PlanKind = "auction" | "min_bid" | "lowball" | "single";

// This card's own auction closes vs what it sells for on eBay / Fanatics
// Buy Now (the lower of the two, 3+ sales): pct = 1 - auction / ref.
export interface AuctionDiscount {
  pct: number;
  auction_cents: number;
  auction_weeks: number;
  ref_cents: number;
  ref_channel: "ebay" | "fanatics_buy_now";
  ebay_cents?: number;
  ebay_sales: number;
  fanatics_buy_now_cents?: number;
  fanatics_buy_now_sales: number;
}

// Min-bid / lowball: a low-grade slab priced against the raw card.
export interface LowPrep {
  raw_cents?: number;
  raw_source?: string;
  max_pct_of_raw?: number;
  copies: { price_cents: number; title: string; url?: string; kind: string; ends_at?: string }[];
  links?: MarketLinks;
}

export interface AutoPrepRules {
  pressure_min: number;
  edge_min: number;
  auction_discount_min: number;
  require_window: boolean;
  nm_min_grade: number;
  low_raw_min_cents: number;
  low_raw_max_cents: number;
  low_pct: number;
  early_max_cents: number; // max bid at or under this: bid early
  early_gap_cents: number; // or the current bid within this of the max
}

export interface AutoPrepResult {
  auction_date: string;
  dry_run: boolean;
  rules: AutoPrepRules;
  picks: { display_key: string; name: string; grade: string; kind: PlanKind; reasons: string[]; notes?: string[]; suggested_max_cents?: number }[];
  skipped: { display_key: string; name: string; grade: string; kind: PlanKind; reasons?: string[]; why: string }[];
  counts: Record<string, Record<string, number>>;
}

export function runAutoPrep(dryRun: boolean): Promise<AutoPrepResult> {
  return adminFetch(`/v1/admin/bid-plans/auto-prep`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dry_run: dryRun }) });
}

export interface BidPlan {
  id: string;
  kind: PlanKind;
  floor_bid_cents?: number;
  single?: SinglePrep;
  display_key: string;
  grade: string;
  auction_date: string;
  max_bid_cents?: number;
  max_all_in_cents?: number;
  status: BidStatus;
  won_cents?: number;
  note?: string;
  added_by?: string;
  updated_at: string;
  last_week?: { week: string; closed: number; avg_all_in_cents: number; avg_hammer_cents: number };
  deal?: AuctionDeal;
  origin?: "manual" | "auto";
  auto_reasons?: string[];
  auto_notes?: string[];
  suggested_max_cents?: number;
  low?: LowPrep;
}

export function fetchBidPlans(date?: string, kind: PlanKind = "auction"): Promise<{
  kind: PlanKind;
  auction_date: string;
  next_auction_date: string;
  plans: BidPlan[];
  totals: { max_bids_cents: number; max_all_in_cents: number };
  buyers_premium_pct: number;
}> {
  const q = new URLSearchParams({ kind });
  if (date) q.set("date", date);
  return adminFetch(`/v1/admin/bid-plans?${q}`);
}

export function saveBidPlan(p: {
  display_key: string; grade: string; auction_date?: string; max_bid_cents?: number; floor_bid_cents?: number; status?: BidStatus;
  won_cents?: number; note?: string; kind?: PlanKind;
}): Promise<{ id: string; auction_date: string; max_bid_cents?: number }> {
  return adminFetch(`/v1/admin/bid-plans`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
}

export async function deleteBidPlan(id: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/admin/bid-plans/${encodeURIComponent(id)}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
}

// ---- Ending soon (snipe board) and watchlist suggestions ------------------------

export interface EndingAuction {
  display_key: string;
  name: string;
  set_code: string;
  image_url?: string;
  grade: string;
  title: string;
  url?: string;
  ends_at: string;
  bid_cents: number; // current bid (hammer)
  bids: number;
  all_in_cents: number; // bid + buyer's premium
  bid_seen_at: string; // when the bid was read
  marketplace: string;
  value_cents?: number;
  value_source?: "estimate" | "market";
  confidence?: string;
  low_cents?: number;
  high_cents?: number;
  discount?: number; // 1 - all-in / value
  max_bid_at_value_cents?: number;
  max_bid_at_margin_cents?: number;
  watched: boolean;
  in_prep?: "auction" | "min_bid";
  // Snipe signals (see the backend's snipeSignals).
  mint_cents?: number; // cost to make this slab by grading raw copies
  mint_gap?: number; // all-in / mint - 1: below 0 = cheaper than making one
  flip_sold_cents?: number; // Fanatics Buy Now sold median
  flip_ask_cents?: number; // cheapest live Fanatics Buy Now
  flip_list_cents?: number; // where to list it
  flip_net_cents?: number; // after the selling fee
  flip_margin?: number; // net / all-in - 1
  max_bid_for_mint_cents?: number;
  max_bid_for_flip_cents?: number;
  signals: SnipeSignal[];
  strength: number;
}

export type SnipeSignal = "under_mint" | "deep_discount" | "flip";

export interface SnipeRules { mint_gap: number; discount: number; flip_margin: number }

export interface PulseStatus {
  at?: string;
  kind?: "sweep" | "manual"; // sweep: the automatic one 2 h before the close
  cards: number;
  lots: number;
  requests: number;
  took_ms: number;
  error?: string;
  running: boolean;
  next_close?: string; // the next weekly close
  sweep_at?: string; // when the automatic sweep runs
  swept: boolean; // it has run for this close
  active: boolean; // between the sweep and 10 min past the close
}

export function fetchEndingSoon(hours: number, signalsOnly = false): Promise<{
  hours: number; count: number; auctions: EndingAuction[]; pulse?: PulseStatus;
  settings: { buyers_premium_pct: number; target_margin: number; sell_fee_pct: number; snipe: SnipeRules };
}> {
  return get(`/v1/deals/ending-soon?hours=${hours}${signalsOnly ? "&signals=1" : ""}`);
}

export function runSnipePulse(sweep = false): Promise<PulseStatus> {
  return adminFetch(`/v1/admin/snipe/pulse${sweep ? "?sweep=1" : ""}`, { method: "POST" });
}

export interface WatchSuggestion {
  id: number;
  display_key: string;
  name: string;
  set_code: string;
  image_url?: string;
  rule: "raw_window" | "under_make" | "auction_discount";
  grade: string;
  summary: string;
  score: number;
  preset?: string;
  targets: { target: string; rule_kind: string; rule_value?: number; buy_all: boolean; channels: string }[];
  created_at: string;
}

export function fetchWatchSuggestions(): Promise<{ count: number; suggestions: WatchSuggestion[] }> {
  return adminFetch(`/v1/admin/watch-suggestions`);
}

export function decideWatchSuggestion(id: number, action: "accept" | "dismiss"): Promise<unknown> {
  return adminFetch(`/v1/admin/watch-suggestions/${id}/${action}`, { method: "POST" });
}

export function runWatchSuggestions(): Promise<{ proposed: number; added: number; updated: number; skipped_recently_dismissed: number; expired: number }> {
  return adminFetch(`/v1/admin/watch-suggestions/run`, { method: "POST" });
}

// How fast a Fanatics Buy Now of a card + grade sells.
export interface SellSpeed {
  bin_sold_per_week: number; // Fanatics Buy Now sales a week, 90 days
  days_per_sale?: number; // 7 / that: the wait listed at the lowest ask
  bin_listed: number; // live Fanatics Buy Nows
  observed_days_listed?: number; // median days listed, sold Buy Nows we watched (a floor)
  observed_n: number;
}

// Collector Crypt: costs of buying there, redeeming to your door and
// reselling on eBay, and when a listing is worth a Discord alert.
export interface CCRules {
  buyer_fee_pct: number;
  redeem_pct: number;
  redeem_flat_cents: number;
  resale_fee_pct: number;
  resale_ship_cents: number;
  alert_min_margin: number;
  alert_min_profit_cents: number;
  alert_min_sales: number;
}

export interface CCDeal {
  nft_address: string;
  url: string; // the listing on Collector Crypt
  display_key: string;
  name: string;
  set_code: string;
  grade: string;
  title: string;
  cert_number?: string;
  image_url?: string;
  ask_cents: number;
  insured_cents?: number; // Collector Crypt's own value
  value_cents?: number; // ours
  value_source?: string;
  value_sales?: number;
  cost_cents?: number; // ask + buyer fee + redemption
  resale_net_cents?: number; // value after eBay fees and shipping
  profit_cents?: number;
  margin?: number;
  discount?: number;
  listed_at: string;
  first_seen_at: string;
  alerted_at?: string;
}

export interface CCStatus {
  last_poll?: string;
  last_poll_listings: number;
  last_sweep?: string;
  last_sweep_listings: number;
  alerts_configured: boolean;
  last_error?: string;
  catalog_cards: number;
}

export function fetchCCDeals(o: { minMargin?: number; days?: number; limit?: number }): Promise<{ count: number; deals: CCDeal[]; status: CCStatus; settings: CCRules }> {
  const q = new URLSearchParams();
  if (o.minMargin != null) q.set("min_margin", String(o.minMargin));
  if (o.days) q.set("days", String(o.days));
  q.set("limit", String(o.limit ?? 300));
  return get(`/v1/deals/collectorcrypt?${q}`);
}
