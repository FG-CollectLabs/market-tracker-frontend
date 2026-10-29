import { useMemo, useState } from "react";
import { TRAINER_BUCKETS, type CurveLang, type ReleaseCurve, type ReleaseCurves } from "../lib/api";
import GroupCards from "./GroupCards";
import { Link } from "react-router-dom";
import { groupPath } from "../lib/groups";
import { LineChart, Legend, SERIES, type LineSeries } from "./HistoryCharts";

// Compare release curves and returns across groups of one dimension: how
// collectible the Pokémon is, the artist, the trainer, or how many packs it
// takes to pull a copy. One line per group (fixed color order), one grade.

const DIMS: { key: string; label: string; hint: string; buckets: { key: string; label: string }[] }[] = [
  {
    key: "poke", label: "Pokémon tier", hint: "Collectibility rankings (polls + card-market demand): top list, then tiers A / B / C; unranked = little demand.",
    buckets: [{ key: "poke:s", label: "S" }, { key: "poke:top", label: "Top" }, { key: "poke:a", label: "A" }, { key: "poke:b", label: "B" }, { key: "poke:c", label: "C" }, { key: "poke:unranked", label: "Unranked" }],
  },
  {
    key: "artist", label: "Artist tier", hint: "Illustrator rankings from collector guides; unranked artists are neutral.",
    buckets: [{ key: "artist:s", label: "S" }, { key: "artist:top", label: "Top" }, { key: "artist:a", label: "A" }, { key: "artist:b", label: "B" }, { key: "artist:c", label: "C" }, { key: "artist:unranked", label: "Unranked" }],
  },
  {
    key: "trainer", label: "Trainers", hint: "Trainer cards (no Pokémon on them) by who they show: waifu (chased as characters) or aura (cool, villains, rivals), each ranked S / A / B; 'other' is generic NPCs, items and stadiums. Edit the lists on the Rankings page.",
    buckets: TRAINER_BUCKETS.map((b) => ({ key: `trainer:${b.key}`, label: b.label })),
  },
  {
    key: "scarcity", label: "Scarcity", hint: "Packs to pull a specific copy = pull-rate estimate for its tier x cards of that tier in the set; quartiles, 4 = scarcest. Pull rates are community estimates.",
    buckets: [{ key: "scarcity:1", label: "Most common" }, { key: "scarcity:2", label: "Common" }, { key: "scarcity:3", label: "Scarce" }, { key: "scarcity:4", label: "Scarcest" }],
  },
  {
    key: "pull", label: "Pull difficulty", hint: "Packs to pull that exact card against the other sets' cards of its rarity tier, in its language: easy = more than 1 standard deviation fewer packs than the sets' average, hard = more than 1 SD more, medium in between. Per tier and crossed with the Pokémon / artist / trainer tiers on the Pull difficulty tab.",
    buckets: [{ key: "pull:all:easy", label: "Easy" }, { key: "pull:all:medium", label: "Medium" }, { key: "pull:all:hard", label: "Hard" }],
  },
  {
    key: "gem", label: "Gem rate", hint: "PSA gem rate (10s of all graded, cards with 50+ graded) in thirds per language. See the Gem rate tab.",
    buckets: [{ key: "gem:low", label: "Low" }, { key: "gem:mid", label: "Mid" }, { key: "gem:high", label: "High" }],
  },
  {
    key: "chase", label: "Chase", hint: "Top chase: one of its set's 3 most expensive raw cards today.",
    buckets: [{ key: "chase:top", label: "Top chase" }, { key: "chase:rest", label: "Not the chase" }],
  },
];

const GRADES = [
  { key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }, { key: "psa-9", label: "PSA 9" },
  { key: "cgc-10", label: "CGC 10" }, { key: "cgc-10-pristine", label: "Pristine" }, { key: "cgc-7-9", label: "CGC 7–9" },
];

const pct = (v: number) => {
  const r = Math.round(v * 100);
  return `${r > 0 ? "+" : ""}${r === 0 ? 0 : r}%`;
};

// Past the palette, colors repeat dashed.
function bucketStyle(_dim: string, i: number) {
  return { color: SERIES[i % SERIES.length], dashed: i >= SERIES.length };
}

const annualize = (r: number, months: number) => Math.pow(1 + r, 12 / months) - 1;

// Change from buying at month `from` to month `to` on a curve (null past its end).
function between(c: ReleaseCurve | undefined, from: number, to: number): number | null {
  const a = c?.points.find((p) => p.month === from)?.change, b = c?.points.find((p) => p.month === to)?.change;
  return a == null || b == null ? null : (1 + b) / (1 + a) - 1;
}

const HOLDS = [6, 12, 24];

export default function CompareBy({ data, lang }: { data: ReleaseCurves; lang: CurveLang }) {
  const [dim, setDim] = useState(DIMS[0].key);
  const [grade, setGrade] = useState("psa-10");
  const [start, setStart] = useState(0); // buy month
  const [cardsOf, setCardsOf] = useState<string | null>(null); // group whose cards are shown
  const d = DIMS.find((x) => x.key === dim)!;
  const color = (i: number) => bucketStyle(dim, i).color;

  const { xs, series } = useMemo(() => {
    const curves = d.buckets.map((b) => data.curves.find((c) => c.category === b.key && c.grade === grade && c.lang === lang));
    const months = Math.max(0, ...curves.map((c) => (c ? c.points[c.points.length - 1].month : 0)));
    const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
    const series: LineSeries[] = d.buckets.flatMap((b, i) => {
      const c = curves[i];
      if (!c) return [];
      return [{ label: b.label, ...bucketStyle(dim, i), values: xs.map((m) => {
        const v = Number(m) < start ? null : between(c, start, Number(m));
        return v == null ? null : v * 100;
      }) }];
    });
    return { xs, series };
  }, [data, d, dim, grade, lang, start]);
  const maxStart = Math.max(0, xs.length - 7);

  const rows = d.buckets.map((b, i) => ({
    b, i,
    row: data.table.find((r) => r.category === b.key && r.grade === grade && r.lang === lang),
    curve: data.curves.find((c) => c.category === b.key && c.grade === grade && c.lang === lang),
  }));

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-100">Compare by</h2>
        <p className="text-xs text-gray-500 max-w-3xl">
          Does the Pokémon, the artist, the trainer or the scarcity change how a card falls after release and how it appreciates once the hype is
          gone? Pick a dimension and a grade.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {DIMS.map((x) => (
            <button key={x.key} onClick={() => { setDim(x.key); setCardsOf(null); }} title={x.hint}
              className={`px-2.5 py-1 ${dim === x.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{x.label}</button>
          ))}
        </div>
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {GRADES.map((g) => (
            <button key={g.key} onClick={() => setGrade(g.key)}
              className={`px-2.5 py-1 ${grade === g.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{g.label}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        {d.hint}
        {dim === "scarcity" && data.scarcity_bounds && (
          <> Quartile edges: {data.scarcity_bounds.map((b) => `~${Math.round(b).toLocaleString()} packs`).join(", ")}.</>
        )}
      </p>

      {series.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough history for this dimension and grade yet.</p>
      ) : (
        <>
          <div className="flex justify-end"><Legend items={series.map((x) => ({ label: x.label, color: x.color }))} /></div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <label htmlFor="cmp-start" className="whitespace-nowrap">Buy at month</label>
            <input id="cmp-start" type="range" min={0} max={maxStart} value={Math.min(start, maxStart)} onChange={(e) => setStart(Number(e.target.value))} className="w-64 accent-indigo-500" />
            <span className="font-mono text-gray-100 w-10">M{Math.min(start, maxStart)}</span>
            {[0, 6, 12, 18, 24, 36].filter((m) => m <= maxStart).map((m) => (
              <button key={m} onClick={() => setStart(m)}
                className={`px-1.5 py-0.5 rounded border ${start === m ? "border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:text-gray-200"}`}>M{m}</button>
            ))}
            <span className="text-gray-500">Re-bases every group on buying at that month; hover shows the yearly rate 6+ months in.</span>
          </div>
          <LineChart weeks={xs} series={series} fmt={(v) => pct(v / 100)} axisFmt={(v) => `${Math.round(v)}%`} shadeBefore={start}
            fmtAt={(v, i) => (i - start >= 6 ? `${pct(v / 100)} · ${pct(annualize(v / 100, i - start))}/yr` : pct(v / 100))}
            xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release${start ? ` (${Number(m) - start >= 0 ? `${Number(m) - start} months after buying` : "before buying"})` : ""}`} />
        </>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-2 font-medium">Group</th>
              <th className="text-right py-1 px-2 font-medium">Buy window</th>
              <th className="text-right py-1 px-2 font-medium">Bottom</th>
              <th className="text-right py-1 px-2 font-medium" title="Median realized yearly change, cards past their hype cycle">Appreciation / yr</th>
              <th className="text-right py-1 px-2 font-medium" title="Share beating the S&P after the selling fee, held two years">Beats S&P</th>
              <th className="text-right py-1 px-2 font-medium" title="Share of post-hype cards that lost value over the year">Fell</th>
              <th className="text-right py-1 px-2 font-medium" title="Worst decile yearly change">Worst 10%</th>
              <th className="text-right py-1 px-2 font-medium" title="Median biggest peak-to-trough drop within the year: selloff risk">Typical drawdown</th>
              {HOLDS.map((h) => (
                <th key={h} className="text-right py-1 px-2 font-medium" title={`Bought at month ${start}, held ${h} months (curve): total · per year`}>M{start}+{h}</th>
              ))}
              <th className="text-right py-1 pl-2 font-medium">Cards</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300">
            {rows.map(({ b, i, row, curve }) => {
              const t = row?.trailing;
              const open = cardsOf === b.key;
              return (
                <tr key={b.key} onClick={() => setCardsOf(open ? null : b.key)} title="Click to list this group's cards"
                  className={`cursor-pointer ${open ? "bg-indigo-950/40" : row?.outperforms ? "bg-green-950/20 hover:bg-gray-800/30" : "hover:bg-gray-800/30"}`}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span className="text-gray-500 mr-1">{open ? "▾" : "▸"}</span>
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: color(i) }} />{b.label}
                    <Link to={groupPath(b.key, grade, lang)} onClick={(e) => e.stopPropagation()} className="ml-1.5 text-indigo-300 hover:text-indigo-200" title="Open this group's page">↗</Link>
                    {row?.provisional && <span className="ml-1 text-[10px] text-amber-300" title={`As few as ${row.min_sets} sets`}>prov.</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right">{row ? `M${row.window_from}–${row.window_to}` : "—"}</td>
                  <td className="py-1.5 px-2 text-right">{row ? pct(row.bottom_change) : "—"}</td>
                  <td className={`py-1.5 px-2 text-right ${row?.outperforms ? "text-green-400 font-medium" : t && t.median < 0 ? "text-red-400" : ""}`}>
                    {t ? pct(t.median) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right">{t ? `${Math.round(t.beat_share * 100)}%` : "—"}</td>
                  <td className="py-1.5 px-2 text-right">{t ? `${Math.round(t.down_share * 100)}%` : "—"}</td>
                  <td className="py-1.5 px-2 text-right">{t ? pct(t.p10) : "—"}</td>
                  <td className="py-1.5 px-2 text-right">{t ? pct(t.median_drawdown) : "—"}</td>
                  {HOLDS.map((h) => {
                    const v = between(curve, start, start + h);
                    return (
                      <td key={h} className={`py-1.5 px-2 text-right whitespace-nowrap ${v != null && v > 0 ? "text-green-400/90" : v != null && v < 0 ? "text-red-400/90" : ""}`}>
                        {v != null ? <>{pct(v)}{h > 12 && <span className="text-gray-500"> · {pct(annualize(v, h))}/yr</span>}</> : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-right text-gray-500">{t ? `${t.cards}` : row ? row.cards : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cardsOf && (
        <GroupCards category={cardsOf} label={d.buckets.find((b) => b.key === cardsOf)?.label ?? cardsOf} grade={grade} lang={lang} onClose={() => setCardsOf(null)} />
      )}
      <p className="text-[11px] text-gray-500">
        M{start}+12 = buy {start} months after release, hold a year (from the group's curve); 12 months is already a yearly rate. Click a group for its cards. Appreciation and risk come from each card's own last ~12 months,
        cards past month 12 only. Past results on 1–2 years of history, not a forecast.
      </p>
    </section>
  );
}
