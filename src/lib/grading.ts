// Grading math for one card: what it costs to grade a raw copy, what a 9 or
// a 10 pays over that, and how the 10 price compares with what it costs to
// *produce* a 10 given the card's gem rate.
//
// Outcomes come from the PSA population (GemRate): P(10) = gems / total,
// P(9) = nines / total, the rest is "8 or lower", which we value at the raw
// price (an 8-and-under slab of a modern card sells for about raw). When
// the 9 count isn't known yet, every non-10 is valued at raw, which
// understates grading EV.

export interface GradingSettings {
  feeCents: number; // grading fee per card
  extraCents: number; // shipping / insurance / handling per card
  minRoi: number; // "Grade it" when expected ROI is at least this (0.3 = 30%)
  minProfitCents: number; // ...and expected profit is at least this
}

export const DEFAULT_GRADING: GradingSettings = {
  feeCents: 25_00,
  extraCents: 3_00,
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
  prem9Cents: number | null; // PSA 9 price minus cost
  prem10Cents: number | null; // PSA 10 price minus cost
  evCents: number | null; // expected profit from grading one raw copy
  roi: number | null; // evCents / costCents
  // Expected net spend to end up holding one 10: cost of the attempts it
  // takes, minus what the 9s and lower slabs sell for along the way.
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

  const cost = i.rawCents + s.feeCents + s.extraCents;
  out.costCents = cost;
  if (i.nineCents != null) out.prem9Cents = i.nineCents - cost;
  if (i.tenCents != null) out.prem10Cents = i.tenCents - cost;
  if (i.tenCents == null) return out;

  // A 9 is only worth more than raw when we know its price and its odds.
  const nineShare = p9 != null && i.nineCents != null ? p9 : 0;
  const lowShare = 1 - p10 - nineShare;
  const salvage = nineShare * (i.nineCents ?? 0) + lowShare * i.rawCents;
  const expectedSale = p10 * i.tenCents + salvage;
  out.evCents = Math.round(expectedSale - cost);
  out.roi = out.evCents / cost;

  if (p10 > 0) {
    out.costPer10Cents = Math.max(0, Math.round((cost - salvage) / p10));
    out.tenValue = out.costPer10Cents > 0 ? i.tenCents / out.costPer10Cents : null;
  }

  if (out.roi >= s.minRoi && out.evCents >= s.minProfitCents) out.signal = "grade";
  else if (out.tenValue != null && out.tenValue < 1) out.signal = "buy10";
  return out;
}
