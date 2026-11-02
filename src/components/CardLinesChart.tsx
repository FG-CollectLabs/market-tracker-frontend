import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// A group's average path in bold over every card behind it, faint. Values
// are changes (0.25 = +25%) by month since release. Hover finds the nearest
// card at that month and names it; click opens it. The y-axis is clipped to
// the middle of the cards so one 10x card doesn't flatten the rest.

export interface MainLine {
  label: string;
  color: string;
  dashed?: boolean;
  values: (number | null)[];
}
export interface CardLine {
  key: string;
  name: string;
  set: string;
  values: (number | null)[];
}

const W = 760, H = 300, PAD = { left: 48, right: 12, top: 10, bottom: 26 };
const IW = W - PAD.left - PAD.right, IH = H - PAD.top - PAD.bottom;
const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function quantile(xs: number[], q: number) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

export default function CardLinesChart({ months, main, cards, start = 0, showCards = true }: {
  months: number;
  main: MainLine[];
  cards: CardLine[];
  start?: number;
  showCards?: boolean;
}) {
  const nav = useNavigate();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; card?: CardLine } | null>(null);

  const { lo, hi } = useMemo(() => {
    const mains = main.flatMap((m) => m.values.filter((v): v is number => v != null));
    const cv = showCards ? cards.flatMap((c) => c.values.filter((v): v is number => v != null)) : [];
    let lo = Math.min(0, ...mains, cv.length ? quantile(cv, 0.04) : 0);
    let hi = Math.max(0.1, ...mains, cv.length ? quantile(cv, 0.96) : 0);
    const span = hi - lo || 1;
    lo -= span * 0.04;
    hi += span * 0.04;
    return { lo, hi };
  }, [main, cards, showCards]);

  const x = (i: number) => PAD.left + (months <= 0 ? 0 : (i * IW) / months);
  const y = (v: number) => PAD.top + IH - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * IH;
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const step = (() => {
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
    return mag * 10;
  })();
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const xTicks = Array.from({ length: 7 }, (_, k) => Math.round((k * months) / 6));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    const i = Math.max(0, Math.min(months, Math.round(((px - PAD.left) / IW) * months)));
    let best: CardLine | undefined, bestD = 14;
    if (showCards) {
      for (const c of cards) {
        const v = c.values[i];
        if (v == null) continue;
        const d = Math.abs(y(v) - py);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    setHover({ i, card: best });
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onClick={() => hover?.card && nav(`/cards/${encodeURIComponent(hover.card.key)}`)} style={{ cursor: hover?.card ? "pointer" : "default" }}>
        {start > 0 && <rect x={PAD.left} y={PAD.top} width={x(start) - PAD.left} height={IH} className="fill-gray-950/60" />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-gray-500" : "stroke-gray-800"} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-gray-500 text-[10px]">{pct(t)}</text>
          </g>
        ))}
        {xTicks.map((m) => <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[10px]">M{m}</text>)}
        {showCards && cards.map((c) => (
          <path key={c.key} d={path(c.values)} fill="none" stroke="#9ca3af" strokeOpacity={0.13} strokeWidth={1} />
        ))}
        {hover?.card && <path d={path(hover.card.values)} fill="none" stroke="#a5b4fc" strokeWidth={2} />}
        {main.map((m) => (
          <path key={m.label} d={path(m.values)} fill="none" stroke={m.color} strokeWidth={2.75} strokeDasharray={m.dashed ? "6 4" : undefined} />
        ))}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={PAD.top} y2={PAD.top + IH} className="stroke-gray-600" />}
      </svg>
      {hover && (
        <div className="absolute top-1 right-2 rounded border border-gray-700 bg-gray-950/95 px-2 py-1 text-[11px] text-gray-300 pointer-events-none">
          <div className="text-gray-400">Month {hover.i}{start > 0 ? ` (bought at M${start})` : ""}</div>
          {main.map((m) => m.values[hover.i] != null && (
            <div key={m.label}><span style={{ color: m.color }}>■</span> {m.label}: {pct(m.values[hover.i]!)}</div>
          ))}
          {hover.card && <div className="text-indigo-200">{hover.card.name} · {hover.card.set}: {pct(hover.card.values[hover.i]!)} <span className="text-gray-500">(click to open)</span></div>}
        </div>
      )}
    </div>
  );
}
