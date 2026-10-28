import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchReleaseCurves, type ReleaseCurves } from "../lib/api";
import { groupLabel } from "../lib/groups";
import { LineChart, Legend, SERIES } from "../components/HistoryCharts";
import GroupCards from "../components/GroupCards";
import { Spinner, ErrorMsg } from "../components/Spinner";

// One curve group in depth (a rarity tier, promo class or Compare-by
// bucket): its curve against every card's, where it bottoms and how far
// below release, how its cards appreciated after the hype, and the cards
// behind it.

const GRADES: [string, string][] = [["raw", "Raw"], ["psa-10", "PSA 10"], ["psa-9", "PSA 9"], ["cgc-10", "CGC 10"], ["cgc-10-pristine", "Pristine"]];
const LANGS: [string, string][] = [["en", "English"], ["ja", "Japanese"], ["all", "All"]];
const pct = (v?: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);
const share = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded border border-gray-800 bg-gray-950/50 px-3 py-2" title={hint}>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm text-gray-100 tabular-nums">{value}</div>
    </div>
  );
}

export default function GroupPage() {
  const { category = "all" } = useParams();
  const [sp, setSp] = useSearchParams();
  const grade = sp.get("grade") ?? "raw";
  const lang = sp.get("lang") ?? "en";
  const [data, setData] = useState<ReleaseCurves | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchReleaseCurves().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  const label = groupLabel(category);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };

  const chart = useMemo(() => {
    if (!data) return null;
    const pick = (cat: string) => data.curves.find((c) => c.category === cat && c.grade === grade && c.lang === lang);
    const mine = pick(category), all = category === "all" ? undefined : pick("all");
    const curves = [mine, all].filter(Boolean) as NonNullable<typeof mine>[];
    if (curves.length === 0) return null;
    const months = Math.max(...curves.map((c) => c.points[c.points.length - 1].month));
    const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
    const series = curves.map((c, i) => {
      const by = new Map(c.points.map((p) => [p.month, p.change * 100]));
      return { label: i === 0 ? label : "All tracked", color: SERIES[i], dashed: i > 0, values: xs.map((m) => by.get(Number(m)) ?? null) };
    });
    return { xs, series, mine };
  }, [data, category, grade, lang, label]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const row = data.table.find((r) => r.category === category && r.grade === grade && r.lang === lang);
  const bottoms = data.bottoms.find((b) => b.category === category && b.grade === grade && b.lang === lang);
  const t = row?.trailing;
  const mine = chart?.mine;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/timing" className="text-xs text-indigo-300 hover:text-indigo-200">← Timing</Link>
          <h1 className="text-xl font-semibold text-white">{label}</h1>
          <p className="text-sm text-gray-500">The release curve, lows and appreciation of this group, and the cards behind it.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex rounded border border-gray-700 overflow-hidden">
            {GRADES.map(([k, l]) => <button key={k} onClick={() => set("grade", k)} className={`px-2 py-1 ${grade === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>)}
          </span>
          <span className="inline-flex rounded border border-gray-700 overflow-hidden">
            {LANGS.map(([k, l]) => <button key={k} onClick={() => set("lang", k)} className={`px-2 py-1 ${lang === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Cards behind the curve" value={mine?.cards ?? row?.cards ?? "—"} hint="Cards with prices behind this curve" />
        <Stat label="Bottom" value={row ? `M${row.bottom_month} · ${pct(row.bottom_change)}` : "—"} hint="The curve's low: month since release and change vs launch" />
        <Stat label="Buy window" value={row ? `M${row.window_from}–${row.window_to}` : "—"} hint="Months the curve stays within 3% of its bottom" />
        <Stat label="Low ÷ release" value={bottoms?.low_ratio != null ? `${share(bottoms.low_ratio)} (${share(bottoms.low_ratio_p25)}–${share(bottoms.low_ratio_p75)})` : "—"}
          hint={bottoms ? `Each card's low in its first two years ÷ its release price: median and middle half (${bottoms.cards} cards, ${bottoms.sets} sets)` : "Not enough cards with history from launch"} />
        <Stat label="Appreciation / yr" value={t ? `${pct(t.median)} (${pct(t.p25)} to ${pct(t.p75)})` : "—"} hint="Median realized yearly change of cards past their hype cycle, and the middle half" />
        <Stat label="Beat the S&P" value={t ? `${share(t.beat_share)} of ${t.cards}` : "—"} hint="Share of post-hype cards beating the benchmark after fees, held two years" />
        <Stat label="Fell over the year" value={t ? share(t.down_share) : "—"} />
        <Stat label="Worst 10%" value={t ? pct(t.p10) : "—"} />
        <Stat label="Typical drawdown" value={t ? pct(t.median_drawdown) : "—"} hint="Median biggest peak-to-trough drop inside the year" />
        <Stat label="Month 4 vs launch" value={pct(row?.month4_change)} />
        {(row?.post_hype ?? []).filter((p) => p.hold_months === 24).map((p) => (
          <Stat key={p.buy_at} label={`Buy at ${p.buy_at === "bottom" ? `the bottom (M${p.buy_month})` : "M4"}, hold 2y`} value={`${pct(p.yearly)}/yr`} />
        ))}
      </div>
      {row?.provisional && <p className="text-xs text-amber-300">Provisional: as few as {row.min_sets} sets behind some months of this curve.</p>}

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-100">Price vs launch month</h2>
          {chart && <Legend items={chart.series.map((s) => ({ label: s.label, color: s.color }))} />}
        </div>
        {chart ? (
          <LineChart weeks={chart.xs} series={chart.series} fmt={(v) => pct(v / 100)} axisFmt={(v) => `${Math.round(v)}%`}
            xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release`} />
        ) : <p className="text-xs text-gray-500">No curve for this group, grade and language yet (too few cards with prices).</p>}
      </section>

      <GroupCards category={category} label="Cards in this group" grade={grade} lang={lang} />
    </div>
  );
}
