import { useEffect, useMemo, useState } from "react";
import { fetchGroupCurve, fetchGroupSeries, type GroupCurve, type GroupSeriesCard, type ReleaseCurve } from "../lib/api";
import { groupLabel } from "../lib/groups";
import { SERIES } from "./HistoryCharts";
import CardLinesChart, { type CardLine, type MainLine } from "./CardLinesChart";

// A group's release curve (and the group it splits), with every card behind
// it as a faint line, re-based on buying at a chosen month: the average
// curve from that month, each card from its own price that month.

export function rebaseCurve(c: ReleaseCurve | undefined, months: number, start: number): (number | null)[] {
  const by = new Map((c?.points ?? []).map((p) => [p.month, p.change]));
  const base = by.get(start);
  return Array.from({ length: months + 1 }, (_, m) => {
    const v = by.get(m);
    return m < start || v == null || base == null ? null : (1 + v) / (1 + base) - 1;
  });
}

// A card from its own price at the buy month (or the first within 2 months
// after); at month 0, from its first price in the first two months.
export function rebaseCard(c: GroupSeriesCard, months: number, start: number): (number | null)[] | null {
  const by = new Map(c.points);
  let b = -1;
  for (let m = start; m <= start + 2; m++) if (by.has(m)) { b = m; break; }
  if (b < 0) return null;
  const base = by.get(b)!;
  return Array.from({ length: months + 1 }, (_, m) => {
    const v = by.get(m);
    return m < b || v == null || base <= 0 ? null : v / base - 1;
  });
}

export default function GroupChart({ category, grade, lang, start, compact, title }: {
  category: string;
  grade: string;
  lang: string;
  start: number;
  compact?: boolean;
  title?: string;
}) {
  const [gc, setGc] = useState<GroupCurve | null>(null);
  const [cards, setCards] = useState<GroupSeriesCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [showCards, setShowCards] = useState(true);
  useEffect(() => {
    setGc(null);
    setCards(null);
    fetchGroupCurve(category, grade, lang).then(setGc).catch(() => setGc({ category, grade, lang, parent: "all" }));
    fetchGroupSeries(category, grade, lang).then((r) => { setCards(r.cards); setTotal(r.total); }).catch(() => setCards([]));
  }, [category, grade, lang]);

  const { months, main, lines } = useMemo(() => {
    const curveEnd = Math.max(0, ...[gc?.curve, gc?.parent_curve].filter(Boolean).map((c) => c!.points[c!.points.length - 1].month));
    const cardEnd = Math.max(0, ...(cards ?? []).map((c) => c.points[c.points.length - 1]?.[0] ?? 0));
    const months = Math.max(curveEnd, Math.min(cardEnd, curveEnd + 12), start + 6);
    const main: MainLine[] = [];
    if (gc?.curve) main.push({ label: groupLabel(category), color: SERIES[0], values: rebaseCurve(gc.curve, months, start) });
    if (gc?.parent_curve && !compact) main.push({ label: groupLabel(gc.parent), color: SERIES[1], dashed: true, values: rebaseCurve(gc.parent_curve, months, start) });
    const lines: CardLine[] = [];
    for (const c of cards ?? []) {
      const v = rebaseCard(c, months, start);
      if (v) lines.push({ key: c.display_key, name: c.name, set: c.set_code.toUpperCase(), values: v });
    }
    return { months, main, lines };
  }, [gc, cards, category, start, compact]);

  if (!gc || !cards) return <p className="text-xs text-gray-500 py-4">Loading…</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-gray-200 font-medium">{title ?? groupLabel(category)}</span>
        <span className="text-gray-500">
          {lines.length} cards priced at M{start}{total > cards.length ? ` (of ${total}; the ${cards.length} with the most history)` : ""} ·{" "}
          <label className="cursor-pointer"><input type="checkbox" checked={showCards} onChange={(e) => setShowCards(e.target.checked)} className="accent-indigo-500 align-middle" /> cards</label>
        </span>
      </div>
      {main.length === 0 && lines.length === 0
        ? <p className="text-xs text-gray-500 py-4">No curve or card history for this group, grade and language yet.</p>
        : <CardLinesChart months={months} main={main} cards={lines} start={start} showCards={showCards} compact={compact} />}
    </div>
  );
}

// The buy-at-month slider every chart here shares.
export function BuyMonthSlider({ start, onChange, max = 48 }: { start: number; onChange: (m: number) => void; max?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      <span className="whitespace-nowrap">Buy at month</span>
      <input type="range" min={0} max={max} value={start} onChange={(e) => onChange(Number(e.target.value))} className="w-56 accent-indigo-500" />
      <span className="font-mono text-gray-100 w-8">M{start}</span>
      {[0, 3, 6, 12, 18, 24, 36].filter((m) => m <= max).map((m) => (
        <button key={m} onClick={() => onChange(m)} className={`px-1.5 py-0.5 rounded border ${start === m ? "border-indigo-500 text-white" : "border-gray-700 hover:text-gray-200"}`}>M{m}</button>
      ))}
      <span className="text-gray-500">Re-bases the average and every card on buying at that month.</span>
    </div>
  );
}
