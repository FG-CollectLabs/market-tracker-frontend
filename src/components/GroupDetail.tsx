import { useEffect, useMemo, useState } from "react";
import { fetchGroupCurve, type GroupCurve, type ReleaseCurves } from "../lib/api";
import { groupLabel } from "../lib/groups";
import { LineChart, Legend, SERIES } from "./HistoryCharts";
import GroupCards from "./GroupCards";

// One curve group in depth: its release curve against the group it splits
// (an IR difficulty band against the IR tier, a gem band against its
// tier...), lows and appreciation, and the cards behind it. Shown inline on
// the Timing tabs and as the group page.

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

export default function GroupDetail({ data, category, grade, lang, definition, onClose }: {
  data: ReleaseCurves;
  category: string;
  grade: string;
  lang: string;
  definition?: React.ReactNode; // what puts a card in this group
  onClose?: () => void;
}) {
  const [gc, setGc] = useState<GroupCurve | null>(null);
  useEffect(() => {
    setGc(null);
    fetchGroupCurve(category, grade, lang).then(setGc).catch(() => setGc({ category, grade, lang, parent: "all" }));
  }, [category, grade, lang]);
  const label = groupLabel(category);

  const chart = useMemo(() => {
    if (!gc?.curve) return null;
    const curves = [gc.curve, gc.parent_curve].filter(Boolean) as NonNullable<GroupCurve["curve"]>[];
    const months = Math.max(...curves.map((c) => c.points[c.points.length - 1].month));
    const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
    const series = curves.map((c, i) => {
      const by = new Map(c.points.map((p) => [p.month, p.change * 100]));
      return { label: i === 0 ? label : groupLabel(gc.parent), color: SERIES[i], dashed: i > 0, values: xs.map((m) => by.get(Number(m)) ?? null) };
    });
    return { xs, series };
  }, [gc, label]);

  const row = data.table.find((r) => r.category === category && r.grade === grade && r.lang === lang);
  const bottoms = data.bottoms.find((b) => b.category === category && b.grade === grade && b.lang === lang);
  const t = row?.trailing;

  return (
    <div className="space-y-3">
      {onClose && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-100">{label}</h3>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-200">Close</button>
        </div>
      )}
      {definition && <p className="text-xs text-gray-400">{definition}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Cards behind the curve" value={gc?.curve?.cards ?? row?.cards ?? "—"} hint="Cards with prices behind this curve" />
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

      <div className="rounded border border-gray-800 bg-gray-950/40 p-3 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold text-gray-200">Price vs launch month{gc?.parent_curve ? ` · against ${groupLabel(gc.parent)}` : ""}</h4>
          {chart && <Legend items={chart.series.map((s) => ({ label: s.label, color: s.color }))} />}
        </div>
        {!gc ? <p className="text-xs text-gray-500">Loading…</p> : chart ? (
          <LineChart weeks={chart.xs} series={chart.series} fmt={(v) => pct(v / 100)} axisFmt={(v) => `${Math.round(v)}%`}
            xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release`} />
        ) : <p className="text-xs text-gray-500">No curve for this group, grade and language yet (too few cards with prices).</p>}
      </div>

      <GroupCards category={category} label="Cards in this group" grade={grade} lang={lang} />
    </div>
  );
}
