import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRiftboundTiming, type RbTimingKind, type RbTimingPoint, type RbTimingSet } from "../lib/api";
import { Spinner } from "../components/Spinner";

// Riftbound timing, separate from Pokémon's: when each card type bottoms
// after its set's release. Prices are TCGplayer market, indexed to each
// card's launch price (1.0 = what it cost at release).

const KIND_LABEL: Record<string, string> = {
  signature: "Signatures", overnumbered: "Overnumbered", alt_art: "Alt arts", promo: "Promos",
  special_art: "Special arts", ultimate: "Ultimates", showcase: "T1 bundle",
};
// Categorical slots (dark steps, validated against the page surface), in
// set release order so a set keeps its color on every chart.
const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const POOLED = "#9ca3af";

const pct = (v: number) => `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`;
const usd = (c: number) => (c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);

const STATUS: Record<RbTimingSet["status"], { label: string; cls: string; icon: string }> = {
  wait: { label: "Wait", cls: "bg-amber-900/50 text-amber-200", icon: "⏳" },
  window: { label: "In window", cls: "bg-emerald-900/50 text-emerald-200", icon: "●" },
  past: { label: "Past bottom", cls: "bg-gray-800 text-gray-300", icon: "✓" },
  unknown: { label: "Too early to tell", cls: "bg-gray-800 text-gray-400", icon: "?" },
};

export default function RiftboundTimingPage() {
  const [kinds, setKinds] = useState<RbTimingKind[] | null>(null);
  const [method, setMethod] = useState("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState("signature");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    fetchRiftboundTiming().then((r) => { setKinds(r.kinds); setMethod(r.method); }).catch((e) => setErr(String(e)));
  }, []);

  // Color by set in release order, the same on every type.
  const colorOf = useMemo(() => {
    const sets = new Map<string, string>();
    for (const k of kinds ?? []) for (const s of k.sets) if (!sets.has(s.set_code)) sets.set(s.set_code, s.release_date ?? "9999");
    const order = [...sets.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([c]) => c);
    return (code: string) => SLOTS[order.indexOf(code) % SLOTS.length] ?? POOLED;
  }, [kinds]);

  const k = kinds?.find((x) => x.kind === sel) ?? kinds?.[0];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound timing</h1>
        <p className="text-sm text-gray-400">
          When each card type bottoms after its set comes out, from Riftbound's own price history. Pokémon's timing isn't assumed
          to carry over.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!kinds ? <Spinner /> : !k ? <p className="text-sm text-gray-500">No history yet.</p> : (
        <>
          <div className="flex flex-wrap gap-1" role="tablist">
            {kinds.map((x) => (
              <button key={x.kind} role="tab" aria-selected={x.kind === k.kind} onClick={() => setSel(x.kind)}
                className={`px-3 py-1.5 rounded text-sm ${x.kind === k.kind ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
                {KIND_LABEL[x.kind] ?? x.kind}
              </button>
            ))}
          </div>

          <Headline k={k} />
          <StatusTable k={k} colorOf={colorOf} />

          <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-sm font-medium text-gray-200">{KIND_LABEL[k.kind] ?? k.kind}: price vs launch, by weeks since release</h2>
              <button onClick={() => setShowTable(!showTable)} className="ml-auto text-xs text-sky-400 hover:text-sky-300">
                {showTable ? "Show chart" : "Show as table"}
              </button>
            </div>
            {showTable ? <CurveTable k={k} /> : <TimingChart k={k} colorOf={colorOf} />}
          </section>
          <p className="text-xs text-gray-500">{method}</p>
        </>
      )}
    </div>
  );
}

function Headline({ k }: { k: RbTimingKind }) {
  if (k.typical_bottom_week == null) {
    return (
      <p className="text-sm text-gray-300">
        No set has bottomed yet for {(KIND_LABEL[k.kind] ?? k.kind).toLowerCase()}: a bottom counts once a set has 16+ weeks of
        history and a rise after its low.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-4">
      <div className="rounded-lg border border-gray-800 px-4 py-3">
        <div className="text-xs text-gray-500">Typical bottom</div>
        <div className="text-2xl font-semibold text-white">week {k.typical_bottom_week}</div>
        <div className="text-xs text-gray-500">after release (from {(k.bottoms_from ?? []).map((s) => s.toUpperCase()).join(", ")})</div>
      </div>
      {k.typical_bottom_index != null && (
        <div className="rounded-lg border border-gray-800 px-4 py-3">
          <div className="text-xs text-gray-500">Typical low vs launch</div>
          <div className="text-2xl font-semibold text-white">{pct(k.typical_bottom_index)}</div>
          <div className="text-xs text-gray-500">median card, at the bottom</div>
        </div>
      )}
    </div>
  );
}

function StatusTable({ k, colorOf }: { k: RbTimingKind; colorOf: (c: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="text-sm min-w-full">
        <thead className="bg-gray-900 text-xs text-gray-400">
          <tr>
            <th className="text-left font-normal px-3 py-2">Set</th>
            <th className="text-right font-normal px-2">Weeks out</th>
            <th className="text-right font-normal px-2">Cards</th>
            <th className="text-right font-normal px-2">Now vs launch</th>
            <th className="text-right font-normal px-2">Its low</th>
            <th className="text-left font-normal px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {k.sets.map((s) => {
            const st = STATUS[s.status];
            return (
              <tr key={s.set_code} className="border-t border-gray-900">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: colorOf(s.set_code) }} />
                  <span className="text-gray-200">{s.set_name}</span>
                </td>
                <td className="text-right px-2 tabular-nums text-gray-300">{s.weeks_since_release}</td>
                <td className="text-right px-2 tabular-nums text-gray-400">{s.cards}</td>
                <td className="text-right px-2 tabular-nums text-gray-200">{s.index_now != null ? pct(s.index_now) : "—"}</td>
                <td className="text-right px-2 tabular-nums text-gray-400 whitespace-nowrap">
                  {s.bottom_index != null ? `${pct(s.bottom_index)} · wk ${s.bottom_week}` : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${st.cls}`}>{st.icon} {st.label}</span>
                  <span className="ml-2 text-xs text-gray-500">{s.note}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const W = 760, H = 320, PAD = { left: 52, right: 56, top: 12, bottom: 30 };
const IW = W - PAD.left - PAD.right, IH = H - PAD.top - PAD.bottom;

function TimingChart({ k, colorOf }: { k: RbTimingKind; colorOf: (c: string) => string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lines = k.sets.filter((s) => s.curve.length >= 2);
  const all = [...k.pooled, ...lines.flatMap((s) => s.curve)];
  if (all.length === 0) return <p className="text-sm text-gray-500 py-6">Not enough cards per week to draw yet.</p>;
  const w0 = Math.min(...all.map((p) => p.week)), w1 = Math.max(...all.map((p) => p.week));
  // Clip the y-range to the bulk so one runaway set doesn't flatten the rest.
  const vals = all.map((p) => p.median).sort((a, b) => a - b);
  const lo = Math.min(0.9, vals[Math.floor(vals.length * 0.02)] ?? 0.5), hi = Math.max(1.1, vals[Math.ceil(vals.length * 0.98) - 1] ?? 1.5);
  const x = (w: number) => PAD.left + ((w - w0) / Math.max(1, w1 - w0)) * IW;
  const y = (v: number) => PAD.top + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * IH;
  const path = (pts: RbTimingPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.week).toFixed(1)},${y(p.median).toFixed(1)}`).join("");
  const ticksY = [lo, (lo + 1) / 2, 1, (1 + hi) / 2, hi].filter((v, i, a) => a.indexOf(v) === i);
  const stepX = Math.max(1, Math.round((w1 - w0) / 10 / 4) * 4) || 4;
  const ticksX: number[] = [];
  for (let w = Math.ceil(w0 / stepX) * stepX; w <= w1; w += stepX) ticksX.push(w);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.round(w0 + ((px - PAD.left) / IW) * (w1 - w0)));
  };
  const at = (pts: RbTimingPoint[], w: number) => pts.find((p) => p.week === w);
  const tip = hover != null && hover >= w0 && hover <= w1 ? hover : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
        {lines.map((s) => (
          <span key={s.set_code} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5" style={{ background: colorOf(s.set_code) }} />{s.set_name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: POOLED }} />All sets (median)
        </span>
      </div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          role="img" aria-label={`${k.kind} price versus launch by weeks since release`}>
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={v === 1 ? "#6b7280" : "#1f2937"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-gray-500" fontSize={11}>{v === 1 ? "launch" : pct(v)}</text>
            </g>
          ))}
          {ticksX.map((w) => (
            <text key={w} x={x(w)} y={H - 10} textAnchor="middle" className="fill-gray-500" fontSize={11}>{w === 0 ? "release" : `wk ${w}`}</text>
          ))}
          {k.typical_bottom_week != null && (
            <g>
              <line x1={x(k.typical_bottom_week)} x2={x(k.typical_bottom_week)} y1={PAD.top} y2={H - PAD.bottom} stroke="#4b5563" strokeDasharray="3 3" />
              <text x={x(k.typical_bottom_week) + 4} y={PAD.top + 10} className="fill-gray-400" fontSize={11}>typical bottom</text>
            </g>
          )}
          <path d={path(k.pooled)} fill="none" stroke={POOLED} strokeWidth={2} strokeDasharray="6 4" />
          {lines.map((s) => (
            <g key={s.set_code}>
              <path d={path(s.curve)} fill="none" stroke={colorOf(s.set_code)} strokeWidth={2} strokeLinejoin="round" />
              {/* direct label at the line's end */}
              <text x={x(s.curve[s.curve.length - 1].week) + 5} y={y(s.curve[s.curve.length - 1].median) + 4}
                className="fill-gray-300" fontSize={11}>{s.set_code.toUpperCase()}</text>
            </g>
          ))}
          {tip != null && (
            <g>
              <line x1={x(tip)} x2={x(tip)} y1={PAD.top} y2={H - PAD.bottom} stroke="#9ca3af" strokeWidth={1} />
              {lines.map((s) => {
                const p = at(s.curve, tip);
                return p ? <circle key={s.set_code} cx={x(tip)} cy={y(p.median)} r={4} fill={colorOf(s.set_code)} stroke="#030712" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
        {tip != null && (
          <div className="absolute top-2 left-14 rounded border border-gray-700 bg-gray-950/95 px-2 py-1.5 text-xs space-y-0.5 pointer-events-none">
            <div className="text-gray-400">{tip === 0 ? "Release week" : tip < 0 ? `${-tip} wk before release` : `Week ${tip}`}</div>
            {[...lines.map((s) => ({ s, p: at(s.curve, tip) })), { s: null, p: at(k.pooled, tip) }].filter((r) => r.p).map(({ s, p }) => (
              <div key={s?.set_code ?? "all"} className="flex items-center gap-2 tabular-nums">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s ? colorOf(s.set_code) : POOLED }} />
                <span className="text-gray-300 w-24">{s ? s.set_code.toUpperCase() : "All sets"}</span>
                <span className="text-gray-100">{pct(p!.median)}</span>
                <span className="text-gray-500">{usd(p!.median_cents)} · {p!.n} cards</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CurveTable({ k }: { k: RbTimingKind }) {
  const weeks = [...new Set([...k.pooled, ...k.sets.flatMap((s) => s.curve)].map((p) => p.week))].sort((a, b) => a - b);
  return (
    <div className="overflow-x-auto max-h-96">
      <table className="text-xs min-w-full tabular-nums">
        <thead className="text-gray-400 sticky top-0 bg-gray-900">
          <tr>
            <th className="text-left font-normal px-2 py-1">Week</th>
            {k.sets.map((s) => <th key={s.set_code} className="text-right font-normal px-2">{s.set_code.toUpperCase()}</th>)}
            <th className="text-right font-normal px-2">All</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w} className="border-t border-gray-900">
              <td className="px-2 py-0.5 text-gray-400">{w}</td>
              {k.sets.map((s) => {
                const p = s.curve.find((q) => q.week === w);
                return <td key={s.set_code} className="text-right px-2 text-gray-300">{p ? pct(p.median) : ""}</td>;
              })}
              <td className="text-right px-2 text-gray-200">{(() => { const p = k.pooled.find((q) => q.week === w); return p ? pct(p.median) : ""; })()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
