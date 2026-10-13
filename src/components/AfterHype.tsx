import { useMemo, useState } from "react";
import type { CurveLang, ReleaseCurves, WindowRow } from "../lib/api";

// After the hype: what buying at month 4 (or at the curve's bottom) and
// holding returns a year, by card category: rarity tier, Pokémon tier,
// artist, trainer or scarcity. Next to the realized yearly change of cards
// already past their hype cycle and the S&P benchmark.

const GROUPS: { key: string; label: string; cats: { key: string; label: string }[] }[] = [
  {
    key: "rarity", label: "Rarity",
    cats: [
      { key: "all", label: "All tracked" }, { key: "ir", label: "IR tier" }, { key: "sir", label: "SIR tier" }, { key: "ultra", label: "Full art / UR" },
      { key: "gold", label: "Gold / hyper" }, { key: "gallery", label: "TG / GG" }, { key: "promo", label: "Promos" },
    ],
  },
  { key: "poke", label: "Pokémon tier", cats: [["poke:top", "Top"], ["poke:a", "A"], ["poke:b", "B"], ["poke:c", "C"], ["poke:unranked", "Unranked"]].map(([key, label]) => ({ key, label })) },
  { key: "artist", label: "Artist tier", cats: [["artist:top", "Top"], ["artist:a", "A"], ["artist:b", "B"], ["artist:c", "C"], ["artist:unranked", "Unranked"]].map(([key, label]) => ({ key, label })) },
  { key: "trainer", label: "Trainers", cats: [["trainer:s", "S-tier"], ["trainer:a", "A-tier"], ["trainer:other", "Other"]].map(([key, label]) => ({ key, label })) },
  { key: "scarcity", label: "Scarcity", cats: [["scarcity:1", "Most common"], ["scarcity:2", "Common"], ["scarcity:3", "Scarce"], ["scarcity:4", "Scarcest"]].map(([key, label]) => ({ key, label })) },
];

const GRADES = [
  { key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }, { key: "psa-9", label: "PSA 9" },
  { key: "cgc-10", label: "CGC 10" }, { key: "cgc-10-pristine", label: "Pristine" },
];

const pct = (v?: number) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);

function trade(r: WindowRow, at: "month_4" | "bottom", hold: number) {
  return r.post_hype?.find((p) => p.buy_at === at && p.hold_months === hold);
}

export default function AfterHype({ data, lang }: { data: ReleaseCurves; lang: CurveLang }) {
  const [group, setGroup] = useState("rarity");
  const [grade, setGrade] = useState("psa-10");
  const g = GROUPS.find((x) => x.key === group)!;
  const rows = useMemo(() => {
    const by = new Map(data.table.filter((r) => r.lang === lang && r.grade === grade).map((r) => [r.category, r]));
    return g.cats.map((c) => ({ c, r: by.get(c.key) }));
  }, [data, lang, grade, g]);

  const yearly = (v?: number) => {
    if (v == null) return <span className="text-gray-600">—</span>;
    const cls = v > data.benchmark ? "text-green-400 font-medium" : v < 0 ? "text-red-400" : "text-gray-200";
    return <span className={cls}>{pct(v)}</span>;
  };

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-100">After the hype: yearly return by category</h2>
      <p className="text-xs text-gray-500 max-w-3xl">
        Buying once the launch hype has worn off. <span className="text-gray-300">Release → month 4</span> is how far the curve fell from launch;
        the <span className="text-gray-300">buy at month 4</span> and <span className="text-gray-300">buy at the bottom</span> columns are the curve's yearly
        return held 12 or 24 months (blank where the curve doesn't reach that far yet). <span className="text-gray-300">Realized / yr</span> is the median
        yearly change of cards already past their hype cycle. Green beats the S&P's {pct(data.benchmark)}/yr.
      </p>
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {GROUPS.map((x) => (
            <button key={x.key} onClick={() => setGroup(x.key)}
              className={`px-2 py-0.5 ${group === x.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{x.label}</button>
          ))}
        </div>
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {GRADES.map((x) => (
            <button key={x.key} onClick={() => setGrade(x.key)}
              className={`px-2 py-0.5 ${grade === x.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-900/60 text-gray-400">
            <tr>
              <th rowSpan={2} className="text-left py-1 px-2 font-medium">{g.label}</th>
              <th rowSpan={2} className="text-right py-1 px-2 font-medium" title="Curve's price at month 4 vs the launch month">Release → month 4</th>
              <th rowSpan={2} className="text-right py-1 px-2 font-medium" title="Month of the curve's low, and its change vs launch">Bottom</th>
              <th colSpan={2} className="text-center py-1 px-2 font-medium border-l border-gray-800">Buy at month 4, yearly</th>
              <th colSpan={2} className="text-center py-1 px-2 font-medium border-l border-gray-800">Buy at the bottom, yearly</th>
              <th rowSpan={2} className="text-right py-1 px-2 font-medium border-l border-gray-800" title="Median realized yearly change of cards past their hype cycle">Realized / yr</th>
              <th rowSpan={2} className="text-right py-1 px-2 font-medium">Cards</th>
            </tr>
            <tr>
              <th className="text-right py-1 px-2 font-normal border-l border-gray-800">hold 12 mo</th>
              <th className="text-right py-1 px-2 font-normal">hold 24 mo</th>
              <th className="text-right py-1 px-2 font-normal border-l border-gray-800">hold 12 mo</th>
              <th className="text-right py-1 px-2 font-normal">hold 24 mo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70">
            {rows.map(({ c, r }) => (
              <tr key={c.key} className={r ? "" : "text-gray-600"}>
                <td className="py-1.5 px-2 text-gray-200 whitespace-nowrap">
                  {c.label}
                  {r?.provisional && <span className="ml-1 text-amber-400" title={`Provisional: as few as ${r.min_sets} sets behind some months`}>*</span>}
                </td>
                {r ? (
                  <>
                    <td className="py-1.5 px-2 text-right text-gray-300">{pct(r.month4_change)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-300">m{r.bottom_month} · {pct(r.bottom_change)}</td>
                    <td className="py-1.5 px-2 text-right border-l border-gray-800">{yearly(trade(r, "month_4", 12)?.yearly)}</td>
                    <td className="py-1.5 px-2 text-right">{yearly(trade(r, "month_4", 24)?.yearly)}</td>
                    <td className="py-1.5 px-2 text-right border-l border-gray-800">{yearly(trade(r, "bottom", 12)?.yearly)}</td>
                    <td className="py-1.5 px-2 text-right">{yearly(trade(r, "bottom", 24)?.yearly)}</td>
                    <td className="py-1.5 px-2 text-right border-l border-gray-800"
                      title={r.trailing ? `${r.trailing.cards} cards from ${r.trailing.sets} sets; middle half ${pct(r.trailing.p25)} to ${pct(r.trailing.p75)}` : undefined}>
                      {yearly(r.trailing?.median)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-400">{r.cards}</td>
                  </>
                ) : (
                  <td colSpan={8} className="py-1.5 px-2 text-gray-600">not enough history yet</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">* Provisional: fewer than 8 sets behind some month. English history is short until the PriceCharting backfill completes.</p>
    </section>
  );
}
