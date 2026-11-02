import { useEffect, useState } from "react";
import { fetchSetTiers, type SetTier } from "../lib/api";
import { groupLabel } from "../lib/groups";

// The set's core numbers per rarity tier: how hard one specific card is to
// pull, and how the tier grades (cards of a rarity share print sheets, so a
// tier tends to gem better or worse as a whole).

const rate = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const packs = (v?: number) => (v == null ? "—" : Math.round(v).toLocaleString());

export default function SetTiers({ code }: { code: string }) {
  const [tiers, setTiers] = useState<SetTier[] | null>(null);
  useEffect(() => {
    setTiers(null);
    fetchSetTiers(code).then((r) => setTiers(r.tiers)).catch(() => setTiers([]));
  }, [code]);
  if (!tiers) return <p className="text-xs text-gray-500 p-3">Loading…</p>;
  if (tiers.length === 0) return <p className="text-xs text-gray-500 p-3">No rarity tiers found for this set.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1 pr-4 font-medium">Tier</th>
            <th className="text-right py-1 px-3 font-medium">Cards</th>
            <th className="text-right py-1 px-3 font-medium" title="Packs to open to pull one exact card of this tier: packs per card of the rarity x cards of that rarity in the set (median card; ~ = the era's estimate)">Packs for one specific card</th>
            <th className="text-right py-1 px-3 font-medium" title="Packs to open to pull any card of this tier">Packs for any of the tier</th>
            <th className="text-right py-1 px-3 font-medium" title="PSA 10s ÷ all PSA-graded copies, every card of the tier pooled">PSA gem rate</th>
            <th className="text-right py-1 px-3 font-medium" title="CGC 10s of any kind ÷ all CGC-graded copies (Pristines included), and the Pristine share">CGC 10 rate (Pristine)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800 text-gray-300">
          {tiers.map((t) => (
            <tr key={t.tier}>
              <td className="py-1 pr-4 text-gray-100">{groupLabel(t.tier)}</td>
              <td className="py-1 px-3 text-right">{t.cards}</td>
              <td className="py-1 px-3 text-right font-medium">{t.packs_estimated ? "~" : ""}{packs(t.packs_per_copy)}</td>
              <td className="py-1 px-3 text-right text-gray-400">{t.packs_estimated ? "~" : ""}{packs(t.packs_per_tier)}</td>
              <td className="py-1 px-3 text-right" title={`${t.psa_cards} of ${t.cards} cards, ${t.psa_graded.toLocaleString()} graded`}>
                {rate(t.psa_gem_rate)}
                {t.psa_graded > 0 && <span className="text-gray-500"> · {t.psa_graded.toLocaleString()}</span>}
              </td>
              <td className="py-1 px-3 text-right" title={`${t.cgc_cards} of ${t.cards} cards, ${t.cgc_graded.toLocaleString()} graded`}>
                {rate(t.cgc_gem_rate)}
                {t.cgc_pristine_rate != null && <span className="text-gray-500"> ({rate(t.cgc_pristine_rate)})</span>}
                {t.cgc_graded > 0 && <span className="text-gray-500"> · {t.cgc_graded.toLocaleString()}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
