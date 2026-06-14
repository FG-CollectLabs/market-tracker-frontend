import type { ROICard } from "./api";

export const GRADING_FEES = {
  psa: 25_00,
  cgc_auction: 8_50,
  cgc_takehome: 10_00,
} as const;

export interface ROIOptions {
  /** Multiplies population gem rate: 1.5 = "I gem 50% better than average". Capped at 0.95. */
  gemRateMultiplier?: number;
  /** Override PSA 9 market price as cost basis for regrade strategies. */
  psa9CostOverrideCents?: number;
  /**
   * XIRR: months from card purchase to graded sale (default 6).
   * Used to annualise the return: r = (proceeds/cost)^(12/months) − 1
   */
  gradingMonths?: number;
  /**
   * XIRR: fraction of expected graded value actually received after platform/eBay fees
   * (default 0.85 = 85%).
   */
  sellingFeePct?: number;
}

export interface ROIResult {
  psaGemRate: number | null;
  cgcGemRate: number | null;
  /** Effective gem rate after multiplier (same as psaGemRate when multiplier = 1). */
  personalPsaGemRate: number | null;
  personalCgcGemRate: number | null;
  psaRegradePsa9Ev: number | null;
  cgcRegradePsa9AuctionEv: number | null;
  cgcRegradePsa9TakehomeEv: number | null;
  psaGradeRawEv: number | null;
  cgcGradeRawAuctionEv: number | null;
  cgcGradeRawTakehomeEv: number | null;
  /** EV as a fraction of cost basis (e.g. 0.40 = 40% ROI). */
  psaRegradePsa9EvRoi: number | null;
  psaGradeRawEvRoi: number | null;
  bestStrategy: "psa_regrade" | "cgc_auction" | "cgc_takehome" | "hold" | null;
  bestEv: number | null;
  /** Annualised return (XIRR) for each strategy. Null when price data is missing. */
  psaGradeRawXirr: number | null;
  psaRegradePsa9Xirr: number | null;
  cgcRegradePsa9AuctionXirr: number | null;
  cgcRegradePsa9TakehomeXirr: number | null;
  /** Best annualised return across all strategies with computable XIRR. */
  bestXirr: number | null;
}

function gemRate(pop: number | null, total: number | null): number | null {
  if (pop == null || total == null || total === 0) return null;
  return pop / total;
}

function applyMultiplier(rate: number | null, multiplier: number): number | null {
  if (rate == null) return null;
  return Math.min(rate * multiplier, 0.95);
}

/**
 * Two-cashflow XIRR: pay `costCents` now, receive `netProceedsCents` after `gradingMonths`.
 * Returns annualised rate (0.25 = 25%/yr). Returns -1 if proceeds ≤ 0 (total loss).
 */
function annualisedReturn(
  costCents: number | null,
  netProceedsCents: number,
  gradingMonths: number,
): number | null {
  if (costCents == null || costCents <= 0) return null;
  if (netProceedsCents <= 0) return -1;
  return Math.pow(netProceedsCents / costCents, 12 / gradingMonths) - 1;
}

export function computeROI(card: ROICard, options?: ROIOptions): ROIResult {
  const psa9Market = card.psa_9_cents;
  const psa10 = card.psa_10_cents;
  const cgc10 = card.cgc_10_cents;
  const raw = card.raw_price_cents;

  const multiplier = options?.gemRateMultiplier ?? 1;
  const psa9Cost = options?.psa9CostOverrideCents ?? psa9Market;
  const gradingMonths = options?.gradingMonths ?? 6;
  const sellingFeePct = options?.sellingFeePct ?? 0.85;

  const psaGem = gemRate(card.psa_gem_pop, card.psa_total_pop);
  const cgcGem = gemRate(card.cgc_gem_pop, card.cgc_total_pop);

  const effectivePsaGem = multiplier !== 1 ? applyMultiplier(psaGem, multiplier) : psaGem;
  const effectiveCgcGem = multiplier !== 1 ? applyMultiplier(cgcGem, multiplier) : cgcGem;

  let psaRegradePsa9Ev: number | null = null;
  let psaRegradePsa9Xirr: number | null = null;
  if (effectivePsaGem != null && psa9Cost != null && psa10 != null) {
    psaRegradePsa9Ev = effectivePsaGem * (psa10 - psa9Cost) - GRADING_FEES.psa;
    // On fail, card remains a PSA 9 sold at market. Expected sale before fee:
    const expectedSale = effectivePsaGem * psa10 + (1 - effectivePsaGem) * (psa9Market ?? psa9Cost);
    const netProceeds = expectedSale * sellingFeePct - GRADING_FEES.psa;
    psaRegradePsa9Xirr = annualisedReturn(psa9Cost, netProceeds, gradingMonths);
  }

  let cgcRegradePsa9AuctionEv: number | null = null;
  let cgcRegradePsa9TakehomeEv: number | null = null;
  let cgcRegradePsa9AuctionXirr: number | null = null;
  let cgcRegradePsa9TakehomeXirr: number | null = null;
  if (effectiveCgcGem != null && psa9Cost != null && cgc10 != null) {
    const failValue = psa9Cost * 0.8;
    cgcRegradePsa9AuctionEv =
      effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failValue - psa9Cost - GRADING_FEES.cgc_auction;
    cgcRegradePsa9TakehomeEv =
      effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failValue - psa9Cost - GRADING_FEES.cgc_takehome;
    const expectedSaleCgc = effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failValue;
    cgcRegradePsa9AuctionXirr = annualisedReturn(
      psa9Cost,
      expectedSaleCgc * sellingFeePct - GRADING_FEES.cgc_auction,
      gradingMonths,
    );
    cgcRegradePsa9TakehomeXirr = annualisedReturn(
      psa9Cost,
      expectedSaleCgc * sellingFeePct - GRADING_FEES.cgc_takehome,
      gradingMonths,
    );
  }

  let psaGradeRawEv: number | null = null;
  let cgcGradeRawAuctionEv: number | null = null;
  let cgcGradeRawTakehomeEv: number | null = null;
  let psaGradeRawXirr: number | null = null;

  if (raw != null) {
    if (effectivePsaGem != null && psa10 != null && psa9Market != null) {
      psaGradeRawEv = effectivePsaGem * psa10 + (1 - effectivePsaGem) * psa9Market - raw - GRADING_FEES.psa;
      const expectedSaleRaw = effectivePsaGem * psa10 + (1 - effectivePsaGem) * psa9Market;
      psaGradeRawXirr = annualisedReturn(
        raw,
        expectedSaleRaw * sellingFeePct - GRADING_FEES.psa,
        gradingMonths,
      );
    }
    if (effectiveCgcGem != null && cgc10 != null && psa9Market != null) {
      const failVal = psa9Market * 0.9;
      cgcGradeRawAuctionEv =
        effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failVal - raw - GRADING_FEES.cgc_auction;
      cgcGradeRawTakehomeEv =
        effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failVal - raw - GRADING_FEES.cgc_takehome;
    }
  }

  const candidates: Array<[ROIResult["bestStrategy"], number | null]> = [
    ["psa_regrade", psaRegradePsa9Ev],
    ["cgc_auction", cgcRegradePsa9AuctionEv],
    ["cgc_takehome", cgcRegradePsa9TakehomeEv],
  ];

  let bestStrategy: ROIResult["bestStrategy"] = null;
  let bestEv: number | null = null;
  for (const [strategy, ev] of candidates) {
    if (ev != null && (bestEv == null || ev > bestEv)) {
      bestEv = ev;
      bestStrategy = strategy;
    }
  }
  if (bestEv != null && bestEv <= 0) {
    bestStrategy = "hold";
  }

  // Best XIRR across all strategies that have computable values
  const xirrCandidates: Array<number | null> = [
    psaGradeRawXirr,
    psaRegradePsa9Xirr,
    cgcRegradePsa9AuctionXirr,
    cgcRegradePsa9TakehomeXirr,
  ];
  let bestXirr: number | null = null;
  for (const x of xirrCandidates) {
    if (x != null && (bestXirr == null || x > bestXirr)) bestXirr = x;
  }

  const psaRegradePsa9EvRoi =
    psaRegradePsa9Ev != null && psa9Cost != null && psa9Cost > 0
      ? psaRegradePsa9Ev / psa9Cost
      : null;
  const psaGradeRawEvRoi =
    psaGradeRawEv != null && raw != null && raw > 0
      ? psaGradeRawEv / raw
      : null;

  return {
    psaGemRate: psaGem,
    cgcGemRate: cgcGem,
    personalPsaGemRate: effectivePsaGem,
    personalCgcGemRate: effectiveCgcGem,
    psaRegradePsa9Ev,
    cgcRegradePsa9AuctionEv,
    cgcRegradePsa9TakehomeEv,
    psaGradeRawEv,
    cgcGradeRawAuctionEv,
    cgcGradeRawTakehomeEv,
    psaRegradePsa9EvRoi,
    psaGradeRawEvRoi,
    bestStrategy,
    bestEv,
    psaGradeRawXirr,
    psaRegradePsa9Xirr,
    cgcRegradePsa9AuctionXirr,
    cgcRegradePsa9TakehomeXirr,
    bestXirr,
  };
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toFixed(2)}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatPct(rate: number | null | undefined, decimals = 1): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(decimals)}%`;
}

export function evColor(ev: number | null): string {
  if (ev == null) return "text-gray-500";
  if (ev > 0) return "text-green-400";
  return "text-red-400";
}
