// Grading math for one card: what it costs to grade a raw copy, what a 9 or
// a 10 pays over that, the expected value of grading after every fee, and a
// 0-100 "buy raw to grade" score built on that EV.
//
// Outcomes come from the PSA population (GemRate): P(10) = gems / total,
// P(9) = nines / total, the rest is "8 or lower", which we value at the raw
// price (an 8-and-under slab of a modern card sells for about raw). When
// the 9 count isn't known, every non-10 is valued at raw (understates EV).
// Every sale pays the selling fee (Fanatics cash payout, eBay, ...).

export interface GradingSettings {
  feeCents: number; // grading fee per card
  extraCents: number; // shipping / insurance / handling per card
  sellFeePct: number; // selling fee on the slab (0.06 = 6%); 0 for FanCash
  minRoi: number; // "Grade raw" when EV after fees is at least this (0.3 = 30%)
  minProfitCents: number; // ...and expected profit is at least this
}

export const DEFAULT_GRADING: GradingSettings = {
  feeCents: 25_00,
  extraCents: 3_00,
  sellFeePct: 0.06, // Fanatics cash payout, same default as the lot evaluator
  minRoi: 0.3,
  minProfitCents: 10_00,
};

export interface GradingInputs {
  rawCents: number | null;
  nineCents: number | null;
  tenCents: number | null;
  gem: number; // copies graded 10
  nine: number | null; // copies graded 9 (null = unknown)
  total: number; // copies graded
}

export type GradingSignal = "grade" | "buy10" | null;

export interface GradingMath {
  p10: number;
  p9: number | null;
  costCents: number | null; // raw + fee + extra: cost of one graded attempt
  prem9Cents: number | null; // PSA 9 net of selling fee, minus cost
  prem10Cents: number | null; // PSA 10 net of selling fee, minus cost
  evCents: number | null; // expected profit from grading one raw copy, after all fees
  roi: number | null; // EV % after fees: evCents / costCents
  // Expected net spend to end up holding one 10: cost of the attempts it
  // takes, minus what the 9s and lower slabs sell for (after fees).
  costPer10Cents: number | null;
  // PSA 10 price / cost to make one. Below 1, buying a 10 beats grading
  // for one: the market under-prices how hard the 10 is.
  tenValue: number | null;
  signal: GradingSignal;
}

export function gradingMath(i: GradingInputs, s: GradingSettings): GradingMath {
  const p10 = i.total > 0 ? i.gem / i.total : 0;
  const p9 = i.nine != null && i.total > 0 ? i.nine / i.total : null;
  const out: GradingMath = {
    p10, p9, costCents: null, prem9Cents: null, prem10Cents: null,
    evCents: null, roi: null, costPer10Cents: null, tenValue: null, signal: null,
  };
  if (i.rawCents == null || i.total <= 0) return out;

  const net = (c: number) => c * (1 - s.sellFeePct);
  const cost = i.rawCents + s.feeCents + s.extraCents;
  out.costCents = cost;
  if (i.nineCents != null) out.prem9Cents = Math.round(net(i.nineCents) - cost);
  if (i.tenCents != null) out.prem10Cents = Math.round(net(i.tenCents) - cost);
  if (i.tenCents == null) return out;

  // A 9 is only worth more than raw when we know its price and its odds.
  const nineShare = p9 != null && i.nineCents != null ? p9 : 0;
  const lowShare = 1 - p10 - nineShare;
  const salvage = net(nineShare * (i.nineCents ?? 0) + lowShare * i.rawCents);
  const expectedSale = net(p10 * i.tenCents) + salvage;
  out.evCents = Math.round(expectedSale - cost);
  out.roi = out.evCents / cost;

  if (p10 > 0) {
    // Buying a 10 outright costs its price; making one costs this.
    out.costPer10Cents = Math.max(0, Math.round((cost - salvage) / p10));
    out.tenValue = out.costPer10Cents > 0 ? i.tenCents / out.costPer10Cents : null;
  }

  if (out.roi >= s.minRoi && out.evCents >= s.minProfitCents) out.signal = "grade";
  else if (out.tenValue != null && out.tenValue < 1) out.signal = "buy10";
  return out;
}

// ---- buy raw to grade score -------------------------------------------------

export interface ScoreContext {
  monthsSinceRelease: number | null; // set release -> today
  psa10Sold30d: number | null; // Fanatics PSA 10 sales in the window (liquidity)
  pokemonScore: number | null; // collectibility 0-100 (unranked Pokémon = 10)
  artistScore: number | null; // collectibility 0-100 (unranked artist = 45)
}

export interface ScorePart {
  label: string;
  points: number;
  why: string;
}

export interface GradeScore {
  score: number; // 0-100
  parts: ScorePart[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// EV % after fees -> base points on a curve: -50% or worse = 0, break-even
// = 40, +50% = 65, +100% = 80, +200% and up = 95.
function evPoints(roi: number): number {
  const knots: [number, number][] = [[-0.5, 0], [0, 40], [0.5, 65], [1, 80], [2, 95]];
  if (roi <= knots[0][0]) return 0;
  for (let k = 1; k < knots.length; k++) {
    const [x1, y1] = knots[k];
    if (roi <= x1) {
      const [x0, y0] = knots[k - 1];
      return y0 + ((roi - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 95;
}

// How good a buy is a raw copy of this card, to grade? Driven by EV % after
// fees, then adjusted for release hype (prices and gem rates are still
// settling in the first months), how easily a 10 sells, how big the
// expected profit is in dollars, and how collectible the card is.
export function gradeScore(m: GradingMath | null, ctx: ScoreContext): GradeScore | null {
  if (!m || m.roi == null || m.evCents == null) return null;
  const parts: ScorePart[] = [];
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

  const base = evPoints(m.roi);
  parts.push({ label: "EV after fees", points: base, why: `${pct(m.roi)} expected return on raw + grading + shipping, after the selling fee` });

  if (ctx.monthsSinceRelease != null) {
    const mo = ctx.monthsSinceRelease;
    const pts = mo < 3 ? -15 : mo < 6 ? -7 : 0;
    parts.push({
      label: "Release age",
      points: pts,
      why: mo < 6
        ? `${Math.floor(mo)} months since release: prices and gem rates are still settling after launch`
        : `${Math.floor(mo)} months since release: past the launch hype`,
    });
  }

  if (ctx.psa10Sold30d != null) {
    const n = ctx.psa10Sold30d;
    const pts = n === 0 ? -8 : n < 3 ? 0 : n < 8 ? 4 : 8;
    parts.push({ label: "Liquidity", points: pts, why: `${n} PSA 10 sold on Fanatics in the window` });
  }

  const dollars = m.evCents / 100;
  const dpts = dollars < 5 ? -10 : dollars < 15 ? -4 : dollars >= 50 ? 4 : 0;
  parts.push({ label: "Profit size", points: dpts, why: `$${dollars.toFixed(2)} expected profit per copy` });

  if (ctx.pokemonScore != null || ctx.artistScore != null) {
    // Neutral at 45 (tier B); up to about ±8 for the best / least collectible.
    const avg = ((ctx.pokemonScore ?? 45) + (ctx.artistScore ?? 45)) / 2;
    const pts = Math.round(clamp((avg - 45) / 6, -6, 8));
    parts.push({ label: "Collectibility", points: pts, why: `Pokémon ${ctx.pokemonScore ?? "—"} · artist ${ctx.artistScore ?? "—"} (0-100): demand that can grow the premium` });
  }

  const score = Math.round(clamp(parts.reduce((s, p) => s + p.points, 0), 0, 100));
  return { score, parts };
}

export function monthsSince(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00Z");
  return (now.getTime() - d.getTime()) / (30.44 * 86_400_000);
}
