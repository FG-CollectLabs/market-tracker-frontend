import type { RbTier } from "../lib/api";

// A Riftbound champion's collectibility tier (S/A/B/C), from what collectors
// pay for the champion's chase cards, or set by hand on Champions.
const TONE: Record<string, string> = {
  s: "border-amber-600 text-amber-200 bg-amber-950/40",
  a: "border-emerald-700 text-emerald-200",
  b: "border-sky-800 text-sky-200",
  c: "border-gray-700 text-gray-400",
};

export default function RbTierChip({ tier, champion }: { tier?: RbTier | null; champion?: string }) {
  if (!tier) return null;
  return (
    <span className={`px-1 rounded border text-[10px] font-medium ${TONE[tier] ?? TONE.c}`}
      title={`${champion ?? "Champion"}: tier ${tier.toUpperCase()} (Riftbound Champions)`}>
      {tier.toUpperCase()}
    </span>
  );
}
