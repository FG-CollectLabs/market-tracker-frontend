import type { BoardPCG } from "../lib/api";

// Grading with PCG: the profit after eBay's fee and shipping, PCG's fee and
// shipping, and the copy's cost; Gem Mint 10+ / Pristine / Flawless odds;
// and whether the copy's centering can get a Pristine at all (PCG: 50/50
// front, within a point).

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString(undefined, { maximumFractionDigits: Math.abs(c) >= 10000 ? 0 : 2 })}`;
const pc = (p: number) => `${p > 0 && p < 0.01 ? (p * 100).toFixed(1) : Math.round(p * 100)}%`;

const SOURCE: Record<string, string> = {
  pregrader_cgc: "this copy's pre-grade (its CGC odds), capped by PCG's centering rules",
  card_pop: "the card's PCG population (what was submitted: screened copies grade better)",
  set_pop: "its set's PCG population (the card has under 20 graded)",
  all_pop: "every PCG-graded Pokémon card (its set has under 20)",
  none: "no PCG population or pre-grade",
};
const SHORT: Record<string, string> = { card_pop: "card pop", set_pop: "set pop", all_pop: "all PCG" };

export default function PCGCell({ p }: { p?: BoardPCG }) {
  if (!p || p.profit_cents == null) return <span className="text-gray-600" title={p?.notes?.join("\n") || "No PCG price or odds"}>–</span>;
  const tip = [
    `Odds from ${SOURCE[p.odds_source] ?? p.odds_source}${p.odds_n ? ` (${p.odds_n.toLocaleString()} graded)` : ""}.`,
    `Expected eBay sale ${p.expected_sale_cents != null ? usd(p.expected_sale_cents) : "–"}, less eBay's fee and shipping, PCG ${p.fee_tier ?? ""} ${usd(p.fee_cents)} + shipping, and this copy's cost.`,
    p.pristine_cents != null ? `PCG Pristine sells ~${usd(p.pristine_cents)}${p.ten_cents != null ? `, Gem Mint 10 ~${usd(p.ten_cents)}` : ""}.` : "",
    p.cap_why ?? "Centering not measured: odds aren't capped by PCG's centering rules.",
    ...(p.notes ?? []),
  ].filter(Boolean).join("\n");
  const elig = p.pristine_eligible;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums" title={tip}>
      <span className={`font-semibold ${p.profit_cents >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(p.profit_cents)}</span>
      {p.profit_with_flawless_cents != null && (
        <span className="text-[11px] whitespace-nowrap" title={`With Flawless at ${p.flawless_vs_pristine}× the Pristine price (Settings)`}>
          <span className="text-[10px] text-gray-500">w/ Flawless </span>
          <span className={p.profit_with_flawless_cents >= 0 ? "text-amber-200" : "text-red-300/80"}>{usd(p.profit_with_flawless_cents)}</span>
        </span>
      )}
      <span className="text-[10px] text-gray-400 whitespace-nowrap">
        10+ {pc(p.p10)} · Pr {pc(p.p_pristine)}{p.p_flawless > 0 ? ` · Fl ${pc(p.p_flawless)}` : ""}
      </span>
      {elig === true && (
        <span className={`text-[10px] ${p.flawless_eligible ? "text-amber-200" : "text-emerald-300"}`}>
          {p.flawless_eligible ? "Flawless eligible ★" : "Pristine eligible ✓"}
        </span>
      )}
      {elig === false && <span className="text-[10px] text-gray-500">no Pristine ({p.cap_label})</span>}
      {SHORT[p.odds_source] && <span className="text-[10px] text-gray-600">{SHORT[p.odds_source]}</span>}
    </span>
  );
}
