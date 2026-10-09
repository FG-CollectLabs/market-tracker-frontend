import { useState, type ReactNode } from "react";

// Small dependency-free SVG charts for the card history page. Colors are the
// dataviz reference palette's dark steps (validated on the gray-900 surface:
// CVD ΔE 9.4, contrast >= 3:1), assigned in fixed slot order.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"] as const;

const W = 720;
const H = 220;
const PAD = { top: 12, right: 64, bottom: 24, left: 52 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

// Count axes: a max divisible by 4 so the quarter ticks are whole numbers.
function countMax(v: number): number {
  return Math.max(4, Math.ceil(v / 4) * 4);
}

// x-axis label indexes: every `step` weeks plus the last week, dropping a
// step label that would sit within half a step of the last one.
function labelIndexes(n: number): Set<number> {
  const step = Math.max(1, Math.ceil(n / 6));
  const out = new Set<number>();
  for (let i = 0; i < n; i += step) if (n - 1 - i >= step / 2 || i === n - 1) out.add(i);
  out.add(n - 1);
  return out;
}

// Nudge end-of-line labels apart (min 12 px) so close lines stay readable.
function spreadLabels(ys: { key: string; y: number }[]): Map<string, number> {
  const sorted = [...ys].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < 12) sorted[i].y = sorted[i - 1].y + 12;
  }
  return new Map(sorted.map((l) => [l.key, l.y]));
}

// Axis money: whole dollars, "$1.2k" past $1,000.
export function axisMoney(cents: number): string {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k` : `$${Math.round(d)}`;
}

function shortWeek(w: string): string {
  const d = new Date(w + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function Tooltip({ x, children }: { x: number; children: ReactNode }) {
  // Flip to the left of the crosshair past the chart's midpoint.
  const left = (x / W) * 100;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded border border-gray-700 bg-gray-950/95 px-2.5 py-1.5 text-xs text-gray-200 shadow-lg whitespace-nowrap"
      style={left > 55 ? { right: `${100 - left + 1.5}%` } : { left: `${left + 1.5}%` }}
    >
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "line" | "bar" }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === "bar" ? (
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface LineSeries {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean; // second source for the same entity (e.g. Fanatics vs PriceCharting)
  connect?: boolean; // draw across missing weeks (sparse series like monthly prices)
  dots?: boolean; // mark each data point
}

// A round tick step (1, 2, 2.5, 5 x 10^k) giving about four intervals.
function niceStep(span: number): number {
  const raw = span / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

// Multi-series line chart on one y-axis (all series share a unit). Missing
// weeks are gaps unless a series connects across them; negative values get
// a zero baseline. End-of-line direct labels for up to 4 series (legend
// otherwise); crosshair + tooltip.
export function LineChart({ weeks, series, fmt, axisFmt, xLabel, xTitle }: {
  weeks: string[];
  xLabel?: (w: string) => string; // x tick text (default: week date)
  xTitle?: (w: string) => string; // tooltip heading (default: "Week of …")
  series: LineSeries[];
  fmt: (v: number) => string; // tooltip values
  axisFmt?: (v: number) => string; // y-axis ticks (default: fmt)
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (weeks.length === 0 || all.length === 0) return <p className="text-xs text-gray-600 py-6">No data in this window yet.</p>;
  // Axis always includes 0; ticks fall on round steps (so 0 is a tick when
  // values go negative).
  const step = niceStep(Math.max(...all, 0) - Math.min(...all, 0));
  const lo = Math.floor(Math.min(0, ...all) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(0, ...all) / step) * step);
  const x = (i: number) => PAD.left + (weeks.length <= 1 ? IW / 2 : (i * IW) / (weeks.length - 1));
  const y = (v: number) => PAD.top + IH - ((v - lo) / (hi - lo)) * IH;
  const lastIdx = (s: LineSeries) => s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
  const labelled = series.length <= 4;
  const labelY = spreadLabels(
    series.flatMap((s) => {
      const i = lastIdx(s);
      return i == null || !labelled ? [] : [{ key: s.label, y: y(s.values[i]!) + 3 }];
    }),
  );
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  const labels = labelIndexes(weeks.length);
  const af = axisFmt ?? fmt;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
        <g className="text-[10px]" fill="#9ca3af">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + IW} y1={y(t)} y2={y(t)} stroke="#374151" strokeWidth={t === lo ? 1 : 0.5} strokeDasharray={t === lo ? undefined : "2 3"} />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end">{af(t)}</text>
            </g>
          ))}
          {lo < 0 && <line x1={PAD.left} x2={PAD.left + IW} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />}
          {weeks.map((w, i) =>
            labels.has(i) ? <text key={w} x={x(i)} y={H - 6} textAnchor="middle">{(xLabel ?? shortWeek)(w)}</text> : null,
          )}
        </g>
        {series.map((s) => {
          const runs: string[] = [];
          let cur = "";
          s.values.forEach((v, i) => {
            if (v == null) {
              if (!s.connect && cur) {
                runs.push(cur);
                cur = "";
              }
            } else cur += `${cur ? "L" : "M"}${x(i)},${y(v)}`;
          });
          if (cur) runs.push(cur);
          const lastI = lastIdx(s);
          return (
            <g key={s.label}>
              {runs.map((d, k) => (
                <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={s.dashed ? "5 4" : undefined} />
              ))}
              {s.values.map((v, i) => {
                const lone = v != null && !s.connect && s.values[i - 1] == null && s.values[i + 1] == null;
                return v != null && (s.dots || lone) ? (
                  <circle key={i} cx={x(i)} cy={y(v)} r={s.dots ? 2.5 : 3} fill={s.color} />
                ) : null;
              })}
              {lastI != null && labelled && (
                <text x={x(lastI) + 6} y={labelY.get(s.label)} fill="#d1d5db" className="text-[10px]">{s.label}</text>
              )}
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + IH} stroke="#6b7280" strokeWidth={1} />
            {series.map((s) =>
              s.values[hover] != null ? (
                <circle key={s.label} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="#111827" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
        {weeks.map((w, i) => (
          <rect key={w} x={x(i) - IW / Math.max(1, weeks.length - 1) / 2} y={PAD.top}
            width={IW / Math.max(1, weeks.length - 1)} height={IH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <Tooltip x={x(hover)}>
          <div className="text-gray-400 mb-0.5">{xTitle ? xTitle(weeks[hover]) : `Week of ${shortWeek(weeks[hover])}`}</div>
          {series.filter((s) => s.values[hover] != null).map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-400">{s.label}</span>
              <span className="ml-auto pl-3 tabular-nums">{fmt(s.values[hover]!)}</span>
            </div>
          ))}
          {series.every((s) => s.values[hover] == null) && <div className="text-gray-500">No data this week</div>}
        </Tooltip>
      )}
    </div>
  );
}

export interface SupplyWeek {
  week: string;
  auctions: number;
  buyNow: number;
  listed: number | null;
  tooltip: ReactNode;
}

// Copies per week on one axis: sold as stacked bars (auctions, Buy Now) and
// the most copies listed at once as a line. Listed far above sold is the
// oversupply signal.
export function SupplyChart({ weeks }: { weeks: SupplyWeek[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (weeks.length === 0) return <p className="text-xs text-gray-600 py-6">No Fanatics activity in this window.</p>;
  const max = countMax(Math.max(1, ...weeks.map((w) => Math.max(w.auctions + w.buyNow, w.listed ?? 0))));
  const labels = labelIndexes(weeks.length);
  const slot = IW / weeks.length;
  const bw = Math.max(3, Math.min(22, slot - 4));
  const cx = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + IH - (v / max) * IH;
  const fmt = (v: number) => String(Math.round(v));
  const listedPts = weeks.map((w, i) => (w.listed != null ? `${cx(i)},${y(w.listed)}` : null));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
        <g className="text-[10px]" fill="#9ca3af">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={PAD.left + IW} y1={y(f * max)} y2={y(f * max)} stroke="#374151" strokeWidth={f === 0 ? 1 : 0.5} strokeDasharray={f === 0 ? undefined : "2 3"} />
              <text x={PAD.left - 6} y={y(f * max) + 3} textAnchor="end">{fmt(f * max)}</text>
            </g>
          ))}
          {weeks.map((w, i) =>
            labels.has(i) ? (
              <text key={w.week} x={cx(i)} y={H - 6} textAnchor="middle">{shortWeek(w.week)}</text>
            ) : null,
          )}
        </g>
        {weeks.map((w, i) => {
          const a = w.auctions, b = w.buyNow;
          const base = y(0);
          const ha = base - y(a);
          const hb = base - y(a + b);
          return (
            <g key={w.week} opacity={hover == null || hover === i ? 1 : 0.55}>
              {a > 0 && <rect x={cx(i) - bw / 2} y={base - ha} width={bw} height={ha} rx={2} fill={SERIES[0]} />}
              {/* 2 px surface gap between stacked segments */}
              {b > 0 && <rect x={cx(i) - bw / 2} y={y(a + b)} width={bw} height={Math.max(0, hb - ha - (a > 0 ? 2 : 0))} rx={2} fill={SERIES[1]} />}
            </g>
          );
        })}
        {/* listed line, broken where no count was taken */}
        {listedPts
          .reduce<string[][]>((runs, p) => {
            if (p == null) runs.push([]);
            else runs[runs.length - 1].push(p);
            return runs;
          }, [[]])
          .filter((r) => r.length > 0)
          .map((r, k) =>
            r.length === 1 ? (
              <circle key={k} cx={Number(r[0].split(",")[0])} cy={Number(r[0].split(",")[1])} r={3} fill={SERIES[2]} />
            ) : (
              <polyline key={k} points={r.join(" ")} fill="none" stroke={SERIES[2]} strokeWidth={2} strokeLinejoin="round" />
            ),
          )}
        {hover != null && weeks[hover].listed != null && (
          <circle cx={cx(hover)} cy={y(weeks[hover].listed!)} r={4} fill={SERIES[2]} stroke="#111827" strokeWidth={2} />
        )}
        {weeks.map((w, i) => (
          <rect key={w.week} x={PAD.left + slot * i} y={PAD.top} width={slot} height={IH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && <Tooltip x={cx(hover)}>{weeks[hover].tooltip}</Tooltip>}
    </div>
  );
}
