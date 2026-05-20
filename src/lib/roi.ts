import type { ROICard } from "./api";

export const GRADING_FEES = {
  psa: 25_00,
  cgc_auction: 8_50,
  cgc_takehome: 10_00,
} as const;

export interface ROIResult {
  psaGemRate: number | null;
  cgcGemRate: number | null;
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

export function computeROI(card: ROICard): ROIResult {
  const psa9 = card.psa_9_cents;
  const psa10 = card.psa_10_cents;
  const cgc10 = card.cgc_10_cents;
  const raw = card.raw_price_cents;

  const psaGem = gemRate(card.psa_gem_pop, card.psa_total_pop);
  const cgcGem = gemRate(card.cgc_gem_pop, card.cgc_total_pop);

  let psaRegradePsa9Ev: number | null = null;
  if (psaGem != null && psa9 != null && psa10 != null) {
    psaRegradePsa9Ev = psaGem * (psa10 - psa9) - GRADING_FEES.psa;
  }

  let cgcRegradePsa9AuctionEv: number | null = null;
  let cgcRegradePsa9TakehomeEv: number | null = null;
  if (cgcGem != null && psa9 != null && cgc10 != null) {
    const failValue = psa9 * 0.8;
    cgcRegradePsa9AuctionEv =
      cgcGem * cgc10 + (1 - cgcGem) * failValue - psa9 - GRADING_FEES.cgc_auction;
    cgcRegradePsa9TakehomeEv =
      cgcGem * cgc10 + (1 - cgcGem) * failValue - psa9 - GRADING_FEES.cgc_takehome;
  }

  let psaGradeRawEv: number | null = null;
  let cgcGradeRawAuctionEv: number | null = null;
  let cgcGradeRawTakehomeEv: number | null = null;

  if (raw != null) {
    if (psaGem != null && psa10 != null && psa9 != null) {
      psaGradeRawEv = psaGem * psa10 + (1 - psaGem) * psa9 - raw - GRADING_FEES.psa;
    }
    if (cgcGem != null && cgc10 != null && psa9 != null) {
      const failVal = psa9 * 0.9;
      cgcGradeRawAuctionEv =
        cgcGem * cgc10 + (1 - cgcGem) * failVal - raw - GRADING_FEES.cgc_auction;
      cgcGradeRawTakehomeEv =
        cgcGem * cgc10 + (1 - cgcGem) * failVal - raw - GRADING_FEES.cgc_takehome;
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
