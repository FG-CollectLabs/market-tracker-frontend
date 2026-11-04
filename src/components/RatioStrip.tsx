import { useState } from "react";
import type { ChannelDist } from "../lib/api";

// One channel's spread of "final price ÷ market" on a shared axis: the thin
// line is 10–90%, the thick bar the middle half, the dot the median, the
// dashed line 1.0× (market). Hover for the numbers.

export const STRIP_MIN = 0.4;
export const STRIP_MAX = 1.8;

const pct = (v: number) => `${(((Math.min(Math.max(v, STRIP_MIN), STRIP_MAX) - STRIP_MIN) / (STRIP_MAX - STRIP_MIN)) * 100).toFixed(2)}%`;

export const fmtX = (v: number) => `${v.toFixed(2)}×`;

export function StripAxis() {
  const ticks = [0.5, 0.75, 1, 1.25, 1.5];
  return (
    <div className="relative h-4 text-[10px] text-gray-500 tabular-nums" aria-hidden>
      {ticks.map((t) => (
        <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>{t === 1 ? "market" : fmtX(t)}</span>
      ))}
    </div>
  );
}

export default function RatioStrip({ d, approx, title }: { d: ChannelDist | null; approx?: boolean; title: string }) {
  const [hover, setHover] = useState(false);
  if (!d) return <div className="h-6 text-[11px] text-gray-600 flex items-center">no sales placed</div>;
  const clipped = d.p10 < STRIP_MIN || d.p90 > STRIP_MAX;
  return (
    <div className="relative h-6" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      role="img" aria-label={`${title}: median ${fmtX(d.p50)} of market, middle half ${fmtX(d.p25)} to ${fmtX(d.p75)}, 10–90% ${fmtX(d.p10)} to ${fmtX(d.p90)}, ${d.n} sales`}>
      {/* gridlines */}
      {[0.5, 0.75, 1.25, 1.5].map((t) => (
        <div key={t} className="absolute top-0 bottom-0 border-l border-gray-800" style={{ left: pct(t) }} />
      ))}
      <div className="absolute top-0 bottom-0 border-l border-dashed border-gray-500" style={{ left: pct(1) }} />
      {/* 10–90% */}
      <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-indigo-400/50 rounded-full" style={{ left: pct(d.p10), right: `calc(100% - ${pct(d.p90)})` }} />
      {/* middle half */}
      <div className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded bg-indigo-500/80 ${approx ? "bg-[repeating-linear-gradient(45deg,rgb(99_102_241/0.8)_0_3px,rgb(99_102_241/0.45)_3px_6px)]" : ""}`}
        style={{ left: pct(d.p25), right: `calc(100% - ${pct(d.p75)})` }} />
      {/* median */}
      <div className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-gray-900" style={{ left: pct(d.p50) }} />
      {hover && (
        <div className="absolute z-10 bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-200 shadow-lg tabular-nums"
          style={{ left: pct(d.p50) }}>
          <div className="text-gray-400">{title}</div>
          median <b>{fmtX(d.p50)}</b> · middle half {fmtX(d.p25)}–{fmtX(d.p75)} · 10–90% {fmtX(d.p10)}–{fmtX(d.p90)} · {d.n.toLocaleString()} sales
          {clipped && <div className="text-gray-500">range runs past the axis</div>}
        </div>
      )}
    </div>
  );
}
