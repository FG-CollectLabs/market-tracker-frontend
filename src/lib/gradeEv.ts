import type { ROICard } from "./api";

// Expected value of buying a raw copy at its market price and grading it,
// assuming it grades like the card's public population (gem rate, and how
// the misses split), per grader:
//
//   PSA: P(10) × PSA 10 + P(9) × PSA 9 + the rest × raw
//   CGC: P(Pristine) × Pristine + P(10) × CGC 10 + P(9.5) × CGC 9.5 + the rest × raw
//
// less the selling fee, the raw price, and the grading tier's fee and
// shipping from Settings (the cheapest tier whose value cap covers the top
// grade). Annualized over the time to get it back: the tier's quoted
// turnaround + a buffer (business days -> calendar days when set).

export interface GraderTier {
  name: string;
  fee_cents: number;
  max_value_cents: number; // 0 = no cap
  turnaround_days: number;
}

export interface GraderCfg {
  ship_cents: number;
  tiers: GraderTier[];
}

export interface GradeEvOptions {
  graders: Record<string, GraderCfg>;
  sellFee: number; // 0.13 = 13% of the sale
  gemMultiplier?: number; // "I gem 1.5× the population": scales the top grades (capped at 95%)
  businessDays?: boolean; // turnaround in Settings is quoted business days (×7/5 to calendar)
  buffer?: number; // added to the turnaround, 0.10 = +10%
}

export interface GraderEv {
  grader: "psa" | "cgc";
  pTop: number; // PSA 10, or CGC 10 incl. Pristine
  pPristine?: number;
  saleCents: number; // expected sale, before the selling fee
  feeCents: number; // tier fee + shipping
  tier: string;
  days: number; // calendar days to get it back
  costCents: number; // raw + fee + shipping
  evCents: number; // profit after everything
  roi: number; // ev / cost
  annualized: number; // (net sale / cost)^(365 / days) − 1
  note: string;
}

export interface GradeEvResult {
  psa: GraderEv | null;
  cgc: GraderEv | null;
  best: "psa" | "cgc" | null; // the higher dollar EV
  psaGem: number | null; // public rates, before any multiplier
  cgcGem: number | null; // all CGC 10s
  pristineGem: number | null;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function tierFor(g: GraderCfg | undefined, valueCents: number): GraderTier | null {
  if (!g) return null;
  const fits = g.tiers.filter((t) => t.max_value_cents === 0 || t.max_value_cents >= valueCents);
  if (fits.length === 0) return null;
  return fits.reduce((a, b) => (b.fee_cents < a.fee_cents ? b : a));
}

// scaleTop: the top grades × m (capped at 95% together), the misses shrunk
// to keep the total at 1.
function scaleTop(top: number[], miss: number[], m: number): { top: number[]; miss: number[] } {
  const t = top.reduce((a, b) => a + b, 0);
  if (m === 1 || t <= 0) return { top, miss };
  const t2 = Math.min(0.95, t * m);
  const k = t2 / t;
  const mt = miss.reduce((a, b) => a + b, 0);
  const km = mt > 0 ? (1 - t2) / mt : 0;
  return { top: top.map((x) => x * k), miss: miss.map((x) => x * km) };
}

function finish(grader: "psa" | "cgc", raw: number, sale: number, tierValue: number, pTop: number, parts: string[], opts: GradeEvOptions, pPristine?: number): GraderEv | null {
  const cfg = opts.graders[grader];
  const tier = tierFor(cfg, tierValue);
  if (!cfg || !tier) return null;
  const fee = tier.fee_cents + cfg.ship_cents;
  const cost = raw + fee;
  const net = sale * (1 - opts.sellFee);
  const ev = net - cost;
  const days = Math.max(1, tier.turnaround_days * (1 + (opts.buffer ?? 0.1)) * (opts.businessDays === false ? 1 : 7 / 5));
  const annualized = net <= 0 ? -1 : Math.pow(net / cost, 365 / days) - 1;
  return {
    grader, pTop, pPristine, saleCents: Math.round(sale), feeCents: fee, tier: tier.name, days: Math.round(days), costCents: cost,
    evCents: Math.round(ev), roi: cost > 0 ? ev / cost : 0, annualized,
    note: `${parts.join(" + ")} = ${usd(sale)}, less ${pct(opts.sellFee)} selling fee, − raw ${usd(raw)} − ${tier.name} ${usd(tier.fee_cents)} + ${usd(cfg.ship_cents)} shipping; ~${Math.round(days)} days to get it back`,
  };
}

export function gradeEv(card: ROICard, opts: GradeEvOptions): GradeEvResult {
  const m = opts.gemMultiplier ?? 1;
  const raw = card.raw_price_cents;
  const out: GradeEvResult = { psa: null, cgc: null, best: null, psaGem: null, cgcGem: null, pristineGem: null };

  const psaTotal = card.psa_total_pop ?? 0;
  if (psaTotal > 0 && card.psa_gem_pop != null) out.psaGem = card.psa_gem_pop / psaTotal;
  const cgcTotal = card.cgc_total_pop ?? 0;
  if (cgcTotal > 0 && card.cgc_gem_pop != null) {
    out.cgcGem = card.cgc_gem_pop / cgcTotal;
    if (card.cgc_pristine_pop != null) out.pristineGem = Math.min(card.cgc_pristine_pop, card.cgc_gem_pop) / cgcTotal;
  }
  if (raw == null || raw <= 0) return out;

  // PSA
  if (out.psaGem != null && card.psa_10_cents != null) {
    const nine = card.psa_9_pop != null ? card.psa_9_pop / psaTotal : 1 - out.psaGem;
    const s = scaleTop([out.psaGem], [nine, Math.max(0, 1 - out.psaGem - nine)], m);
    const [p10] = s.top, [p9, lower] = s.miss;
    const nineCents = card.psa_9_cents ?? raw;
    const sale = p10 * card.psa_10_cents + p9 * nineCents + lower * raw;
    const parts = [`${pct(p10)} × PSA 10 ${usd(card.psa_10_cents)}`, `${pct(p9)} × PSA 9 ${usd(nineCents)}${card.psa_9_cents == null ? " (no price: raw)" : ""}`];
    if (lower > 0.005) parts.push(`${pct(lower)} lower × raw`);
    out.psa = finish("psa", raw, sale, card.psa_10_cents, p10, parts, opts);
  }

  // CGC
  if (out.cgcGem != null && card.cgc_10_cents != null) {
    const pristine = out.pristineGem ?? 0;
    const ten = Math.max(0, out.cgcGem - pristine);
    const nineFive = card.cgc_9_5_pop != null ? card.cgc_9_5_pop / cgcTotal : 0;
    const s = scaleTop([pristine, ten], [nineFive, Math.max(0, 1 - out.cgcGem - nineFive)], m);
    const [pP, p10] = s.top, [p95, lower] = s.miss;
    const prisCents = card.cgc_pristine_cents ?? card.cgc_10_cents;
    const nfCents = card.cgc_9_5_cents ?? raw;
    const sale = pP * prisCents + p10 * card.cgc_10_cents + p95 * nfCents + lower * raw;
    const parts = [];
    if (pP > 0) parts.push(`${pct(pP)} × Pristine ${usd(prisCents)}${card.cgc_pristine_cents == null ? " (no sales: CGC 10 price)" : ""}`);
    parts.push(`${pct(p10)} × CGC 10 ${usd(card.cgc_10_cents)}`);
    if (p95 > 0) parts.push(`${pct(p95)} × CGC 9.5 ${usd(nfCents)}${card.cgc_9_5_cents == null ? " (no sales: raw)" : ""}`);
    if (lower > 0.005) parts.push(`${pct(lower)} lower × raw`);
    out.cgc = finish("cgc", raw, sale, card.cgc_10_cents, pP + p10, parts, opts, pP);
  }

  if (out.psa && (!out.cgc || out.psa.evCents >= out.cgc.evCents)) out.best = "psa";
  else if (out.cgc) out.best = "cgc";
  return out;
}
