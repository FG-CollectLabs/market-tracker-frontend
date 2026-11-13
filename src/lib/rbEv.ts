import type { PcgAnalysis, PcgSummary, ROICard } from "./api";
import { tierFor, type GraderCfg } from "./gradeEv";

// Riftbound grading EV for PSA, CGC and Beckett. Same method as Pokémon
// (lib/gradeEv.ts): expected sale over the grade outcomes, less the selling
// fee, the raw price and the grading tier's fee + shipping, annualized over
// the turnaround (+ buffer, business days -> calendar days).
//
// Riftbound has no population data yet, so the grade odds are the
// assumptions set on the page (RbRates). A card with a population (GemRate
// upload) uses its population instead.

export type RbGrader = "psa" | "cgc" | "bgs" | "pcg";
export const RB_GRADERS: RbGrader[] = ["psa", "cgc", "bgs", "pcg"];

export interface RbRates {
  psa: { p10: number; p9: number };
  cgc: { pristine: number; p10: number; p95: number };
  bgs: { black: number; p10: number; p95: number };
  pcg: { flawless: number; pristine: number; p10: number; p95: number; p9: number };
}

// Assumptions for pack-fresh modern cards; edit them on the page.
export const DEFAULT_RATES: RbRates = {
  psa: { p10: 0.5, p9: 0.4 },
  cgc: { pristine: 0.1, p10: 0.55, p95: 0.25 },
  bgs: { black: 0.02, p10: 0.13, p95: 0.55 },
  // PCG is strict: Riftbound chase cards' population runs ~ 9.5 40%, Gem 10 25%, Pristine 15%.
  pcg: { flawless: 0.01, pristine: 0.12, p10: 0.22, p95: 0.4, p9: 0.2 },
};

// PCG prices by grade when a card has no PCG sales: PSA 10 × the typical
// PCG / PSA 10 ratio for that grade (from the PCG analytics), keyed by
// grade key (pcg-10-flawless, pcg-10-pristine, pcg-10, pcg-9.5, pcg-9).
export type PcgRatios = Record<string, number>;

// Cards with at least this many PCG copies use their own population.
export const PCG_MIN_POP = 10;

// Used while Settings has no BGS grader: placeholder prices.
export const DEFAULT_BGS: GraderCfg = {
  ship_cents: 300,
  tiers: [
    { name: "Base (placeholder)", fee_cents: 3000, max_value_cents: 150000, turnaround_days: 60 },
    { name: "Express (placeholder)", fee_cents: 10000, max_value_cents: 500000, turnaround_days: 15 },
    { name: "Premium (placeholder)", fee_cents: 25000, max_value_cents: 0, turnaround_days: 10 },
  ],
};

export interface RbEvOpts {
  graders: Record<string, GraderCfg>;
  sellFee: number;
  businessDays: boolean;
  buffer: number;
  rates: RbRates;
  pcgRatios?: PcgRatios;
}

export interface RbEv {
  grader: RbGrader;
  source: "population" | "assumed";
  pTop: number; // P(the grader's 10 or better)
  saleCents: number;
  costCents: number;
  evCents: number;
  roi: number;
  annualized: number;
  netCents: number; // expected sale after the selling fee
  feeCents: number; // tier fee + shipping
  days: number;
  tier: string;
  note: string;
}

type Outcome = { p: number; cents: number | null | undefined; label: string };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function graderCfg(graders: Record<string, GraderCfg>, g: RbGrader): GraderCfg | undefined {
  return graders[g] ?? (g === "bgs" ? DEFAULT_BGS : undefined);
}

// raw: what a miss sells for; buy: what the copy costs (raw, unless a listing's price).
function evOf(grader: RbGrader, source: RbEv["source"], raw: number, buy: number, outcomes: Outcome[], pTop: number, topCents: number, opts: RbEvOpts): RbEv | null {
  const cfg = graderCfg(opts.graders, grader);
  const tier = tierFor(cfg, topCents);
  if (!cfg || !tier) return null;
  let p = 0;
  let sale = 0;
  const parts: string[] = [];
  for (const o of outcomes) {
    if (o.p <= 0) continue;
    const c = o.cents ?? raw;
    p += o.p;
    sale += o.p * c;
    parts.push(`${pct(o.p)} × ${o.label} ${usd(c)}${o.cents == null ? " (no price: raw)" : ""}`);
  }
  const rest = Math.max(0, 1 - p);
  if (rest > 0.005) {
    sale += rest * raw;
    parts.push(`${pct(rest)} lower × raw`);
  }
  const fee = tier.fee_cents + cfg.ship_cents;
  const cost = buy + fee;
  const net = sale * (1 - opts.sellFee);
  const days = Math.max(1, tier.turnaround_days * (1 + opts.buffer) * (opts.businessDays ? 7 / 5 : 1));
  return {
    grader, source, pTop, saleCents: Math.round(sale), costCents: cost, netCents: Math.round(net), feeCents: fee,
    evCents: Math.round(net - cost), roi: cost > 0 ? (net - cost) / cost : 0,
    annualized: net <= 0 ? -1 : Math.pow(net / cost, 365 / days) - 1, days: Math.round(days), tier: tier.name,
    note: `${parts.join(" + ")} = ${usd(sale)}, less ${pct(opts.sellFee)} selling fee, − ${buy === raw ? "raw" : "buy"} ${usd(buy)} − ${tier.name} ${usd(tier.fee_cents)} + ${usd(cfg.ship_cents)} shipping; ~${Math.round(days)} days to get it back`,
  };
}

// buyCents: the price paid for the raw copy (a listing's price + shipping);
// the card's raw price when left out. Misses sell at the raw price.
export function rbEv(c: ROICard, opts: RbEvOpts, buyCents?: number): Record<RbGrader, RbEv | null> {
  const out: Record<RbGrader, RbEv | null> = { psa: null, cgc: null, bgs: null, pcg: null };
  const raw = c.raw_price_cents;
  if (raw == null || raw <= 0) return out;
  const R = opts.rates;

  if (c.psa_10_cents != null) {
    const t = c.psa_total_pop ?? 0;
    const pop = t > 0 && c.psa_gem_pop != null;
    const p10 = pop ? c.psa_gem_pop! / t : R.psa.p10;
    const p9 = pop ? (c.psa_9_pop != null ? c.psa_9_pop / t : 1 - p10) : R.psa.p9;
    out.psa = evOf("psa", pop ? "population" : "assumed", raw, buyCents ?? raw,
      [{ p: p10, cents: c.psa_10_cents, label: "PSA 10" }, { p: p9, cents: c.psa_9_cents, label: "PSA 9" }],
      p10, c.psa_10_cents, opts);
  }

  if (c.cgc_10_cents != null) {
    const t = c.cgc_total_pop ?? 0;
    const pop = t > 0 && c.cgc_gem_pop != null;
    const pP = pop ? Math.min(c.cgc_pristine_pop ?? 0, c.cgc_gem_pop!) / t : R.cgc.pristine;
    const p10 = pop ? c.cgc_gem_pop! / t - pP : R.cgc.p10;
    const p95 = pop ? (c.cgc_9_5_pop ?? 0) / t : R.cgc.p95;
    const prisCents = c.cgc_pristine_cents ?? c.cgc_10_cents;
    out.cgc = evOf("cgc", pop ? "population" : "assumed", raw, buyCents ?? raw, [
      { p: pP, cents: prisCents, label: "Pristine 10" },
      { p: p10, cents: c.cgc_10_cents, label: "CGC 10" },
      { p: p95, cents: c.cgc_9_5_cents, label: "CGC 9.5" },
    ], pP + p10, c.cgc_10_cents, opts); // tier by the CGC 10 price, as for Pokémon
  }

  const b10 = c.bgs_10_cents ?? null;
  const b95 = c.bgs_9_5_cents ?? null;
  if (b10 != null || b95 != null) {
    const t = c.bgs_total_pop ?? 0;
    const pop = t > 0 && c.bgs_gem_pop != null;
    // A BGS population's 10 count includes Black Labels: no split from it.
    const pB = pop ? 0 : R.bgs.black;
    const p10 = pop ? c.bgs_gem_pop! / t : R.bgs.p10;
    const p95 = pop ? (c.bgs_9_5_pop ?? 0) / t : R.bgs.p95;
    const tenCents = b10 ?? b95;
    const blackCents = c.bgs_10_black_cents ?? tenCents;
    out.bgs = evOf("bgs", pop ? "population" : "assumed", raw, buyCents ?? raw, [
      { p: pB, cents: blackCents, label: "Black Label" },
      { p: p10, cents: tenCents, label: "BGS 10" },
      { p: p95, cents: b95, label: "BGS 9.5" },
    ], pB + p10, tenCents ?? 0, opts); // tier by the BGS 10 price, not Black Label
  }

  // PCG: its sales per grade, else PSA 10 × the grade's typical ratio; a
  // missing top grade takes the next one down.
  const pcgPrice = (gk: string): number | null => {
    const own = c.pcg_cents?.[gk];
    if (own != null) return own;
    const r = opts.pcgRatios?.[gk];
    return r != null && c.psa_10_cents != null ? Math.round(c.psa_10_cents * r) : null;
  };
  const gem = pcgPrice("pcg-10");
  if (gem != null) {
    const pr = pcgPrice("pcg-10-pristine") ?? gem;
    const fl = pcgPrice("pcg-10-flawless") ?? pr;
    const t = c.pcg_total_pop ?? 0;
    const pop = t >= PCG_MIN_POP && c.pcg_pop != null;
    const share = (g: string) => (c.pcg_pop?.[g] ?? 0) / t;
    const P = pop
      ? { flawless: share("Flawless 10"), pristine: share("Pristine 10"), p10: share("10"), p95: share("9.5"), p9: share("9") }
      : R.pcg;
    out.pcg = evOf("pcg", pop ? "population" : "assumed", raw, buyCents ?? raw, [
      { p: P.flawless, cents: fl, label: "Flawless 10" },
      { p: P.pristine, cents: pr, label: "Pristine 10" },
      { p: P.p10, cents: gem, label: "Gem Mint 10" },
      { p: P.p95, cents: pcgPrice("pcg-9.5"), label: "PCG 9.5" },
      { p: P.p9, cents: pcgPrice("pcg-9"), label: "PCG 9" },
    ], P.flawless + P.pristine + P.p10, gem, opts); // tier by the Gem Mint 10 price
  }
  return out;
}

// The grade odds a viewer set, shared by the Riftbound pages (this browser).
const RATES_KEY = "rb.gradeRates.v1";

export function loadRates(): RbRates {
  try {
    const v = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null");
    if (v?.psa && v?.cgc && v?.bgs) return { ...DEFAULT_RATES, ...v }; // graders added later keep their defaults
  } catch { /* storage unavailable */ }
  return DEFAULT_RATES;
}

export function saveRates(r: RbRates) {
  try { localStorage.setItem(RATES_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

// maxBuy: the most to pay for the copy (all in) so this grader still
// returns minRoi on the cost: net / (1 + minRoi) − fees.
export function maxBuy(ev: RbEv, minRoi: number): number {
  return Math.floor(ev.netCents / (1 + minRoi) - ev.feeCents);
}

// pcgRatiosFrom: PCG / PSA 10 per PCG grade from the PCG analytics. Sales
// (3+) first; else live asks (3+) less 15%, since asks sit above sales.
export function pcgRatiosFrom(a: PcgAnalysis | null): { ratios: PcgRatios; from: Record<string, string> } {
  const ratios: PcgRatios = {};
  const from: Record<string, string> = {};
  if (!a) return { ratios, from };
  const pick = (rows: PcgSummary[], gk: string) => rows.find((r) => r.grade_key === gk && r.band === "all")?.vs_psa_10;
  for (const gk of ["pcg-10-flawless", "pcg-10-pristine", "pcg-10", "pcg-9.5", "pcg-9"]) {
    const s = pick(a.sales_summary, gk);
    if (s && s.n >= 3 && s.median != null) {
      ratios[gk] = s.median;
      from[gk] = `${s.n} sales`;
      continue;
    }
    const k = pick(a.asks_summary, gk);
    if (k && k.n >= 3 && k.median != null) {
      ratios[gk] = k.median * 0.85;
      from[gk] = `${k.n} asks −15%`;
    }
  }
  return { ratios, from };
}
