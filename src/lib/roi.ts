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
  bestStrategy: "psa_regrade" | "cgc_auction" | "cgc_takehome" | "hold" | null;
  bestEv: number | null;
}

function gemRate(pop: number | null, total: number | null): number | null {
  if (pop == null || total == null || total === 0) return null;
  return pop / total;
}

function applyMultiplier(rate: number | null, multiplier: number): number | null {
  if (rate == null) return null;
  return Math.min(rate * multiplier, 0.95);
}

export function computeROI(card: ROICard, options?: ROIOptions): ROIResult {
  const psa9Market = card.psa_9_cents;
  const psa10 = card.psa_10_cents;
  const cgc10 = card.cgc_10_cents;
  const raw = card.raw_price_cents;

  const multiplier = options?.gemRateMultiplier ?? 1;
  const psa9Cost = options?.psa9CostOverrideCents ?? psa9Market;

  const psaGem = gemRate(card.psa_gem_pop, card.psa_total_pop);
  const cgcGem = gemRate(card.cgc_gem_pop, card.cgc_total_pop);

  const effectivePsaGem = multiplier !== 1 ? applyMultiplier(psaGem, multiplier) : psaGem;
  const effectiveCgcGem = multiplier !== 1 ? applyMultiplier(cgcGem, multiplier) : cgcGem;

  let psaRegradePsa9Ev: number | null = null;
  if (effectivePsaGem != null && psa9Cost != null && psa10 != null) {
    psaRegradePsa9Ev = effectivePsaGem * (psa10 - psa9Cost) - GRADING_FEES.psa;
  }

  let cgcRegradePsa9AuctionEv: number | null = null;
  let cgcRegradePsa9TakehomeEv: number | null = null;
  if (effectiveCgcGem != null && psa9Cost != null && cgc10 != null) {
    const failValue = psa9Cost * 0.8;
    cgcRegradePsa9AuctionEv =
      effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failValue - psa9Cost - GRADING_FEES.cgc_auction;
    cgcRegradePsa9TakehomeEv =
      effectiveCgcGem * cgc10 + (1 - effectiveCgcGem) * failValue - psa9Cost - GRADING_FEES.cgc_takehome;
  }

  let psaGradeRawEv: number | null = null;
  let cgcGradeRawAuctionEv: number | null = null;
  let cgcGradeRawTakehomeEv: number | null = null;

  if (raw != null) {
    if (effectivePsaGem != null && psa10 != null && psa9Market != null) {
      psaGradeRawEv = effectivePsaGem * psa10 + (1 - effectivePsaGem) * psa9Market - raw - GRADING_FEES.psa;
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
    bestStrategy,
    bestEv,
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
