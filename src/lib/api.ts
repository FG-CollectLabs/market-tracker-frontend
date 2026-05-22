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

// ---- Graded ----------------------------------------------------------------

export interface CoverageSet {
  game: string;
  set_code: string;
  set_name: string;
  release_date: string | null;
  cards_with_graded_data: number;
  cards_with_prices: number;
  cards_with_gem_rates: number;
  last_updated: string | null;
  psa_pop_url: string | null;
  cgc_pop_url: string | null;
  pricecharting_console_url: string | null;
}

export function fetchGradedCoverage(game = "pokemon"): Promise<{ sets: CoverageSet[] }> {
  const q = game ? `?game=${encodeURIComponent(game)}` : "";
  return get(`/v1/graded/coverage${q}`);
}

export interface ROICard {
  card_id: string;
  display_key: string;
  name: string;
  number: string;
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
}

export function fetchSetGraded(game: string, setCode: string): Promise<{ game: string; set_code: string; cards: ROICard[] }> {
  return get(`/v1/sets/${game}/${setCode}/graded`);
}

export function updateSetExternalIds(
  game: string,
  code: string,
  name: string,
  patch: Record<string, string | null>,
): Promise<unknown> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  return fetch(`${BASE}/v1/admin/sets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_ADMIN_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ game, code, name, external_ids: patch }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} updateSetExternalIds`);
    return r.json();
  });
}

export function toggleGradedWatch(displayKey: string, watch: boolean): Promise<{ watch: boolean }> {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  return fetch(`${BASE}/v1/admin/cards/${encodeURIComponent(displayKey)}/graded-watch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_ADMIN_API_KEY ?? ""}`,
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
