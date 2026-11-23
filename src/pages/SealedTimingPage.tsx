import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchSealedEarly, fetchSealedPriority, fetchSealedSets, fetchSealedTiming, fetchSealedWatch, watchSealed,
  type SealedEarly, type SealedKind, type SealedKindTiming, type SealedPriorityItem, type SealedRet, type SealedSetChart, type SealedYearRow, type SetClass,
} from "../lib/api";
import { Spinner } from "../components/Spinner";

// Sealed timing: what to focus buying on now, the best historic plays per
// kind (after release, after a reprint signal), the price path by months
// since release, the sliding window of returns, and the set-by-set data.

export const SEALED_COLORS: Record<SealedKind, string> = {
  etb: "#818cf8", pc_etb: "#f472b6", booster_box: "#34d399", booster_bundle: "#fbbf24", booster_pack: "#60a5fa",
  upc: "#f87171", premium_collection: "#c084fc", special_collection: "#2dd4bf", collection_box: "#fb923c", tin: "#a3e635",
  blister: "#94a3b8", build_battle: "#e879f9",
  mtg_play_box: "#34d399", mtg_collector_box: "#f472b6", mtg_collector_omega: "#fbbf24", mtg_bundle: "#818cf8",
  mtg_play_pack: "#60a5fa", mtg_collector_pack: "#c084fc",
};
const HOLDS = ["12", "24", "36"];
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
export const usd = (c: number | null | undefined) => (c == null ? "–" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);
const tone = (v: number | null | undefined) => (v == null ? "text-gray-600" : v >= 0.25 ? "text-emerald-300" : v >= 0 ? "text-emerald-200/70" : "text-rose-300");
const share = (v: number | null | undefined) => (v == null ? "" : `${Math.round(v * 100)}% up`);

// Watched product ids, shared by the Watch buttons on this page.
let watchedCache: Promise<Set<number>> | null = null;
const watchedIds = () => (watchedCache ??= fetchSealedWatch().then((r) => new Set(r.products.map((x) => x.product.id))).catch(() => new Set<number>()));

function WatchButton({ productId }: { productId: number }) {
  const [state, setState] = useState<"" | "watching" | "busy" | "error">("");
  useEffect(() => { watchedIds().then((s) => s.has(productId) && setState("watching")); }, [productId]);
  if (state === "watching") return <Link to="/sealed/watchlist" className="text-[11px] text-emerald-300 hover:underline">watching</Link>;
  return (
    <button disabled={state === "busy"} title="Add to the Sealed watchlist (fetches where to buy it)"
      onClick={async () => {
        setState("busy");
        try { await watchSealed(productId); (await watchedIds()).add(productId); setState("watching"); } catch { setState("error"); }
      }}
      className="text-[11px] text-indigo-300 hover:underline">{state === "error" ? "sign in to watch" : state === "busy" ? "…" : "watch"}</button>
  );
}

function Curves({ kinds, on }: { kinds: SealedKindTiming[]; on: Set<SealedKind> }) {
  const shown = kinds.filter((k) => on.has(k.kind) && k.curve.length > 1);
  const maxM = Math.min(96, Math.max(12, ...shown.map((k) => k.curve[k.curve.length - 1].month)));
  const vals = shown.flatMap((k) => k.curve.filter((p) => p.month <= maxM).map((p) => p.change));
  const lo = Math.min(-0.2, ...vals), hi = Math.max(0.5, ...vals);
  const W = 720, H = 240, L = 48, B = 22;
  const x = (m: number) => L + (m / maxM) * (W - L - 8);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  if (!shown.length) return <div className="text-sm text-gray-500">No curves yet.</div>;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-3xl">
        {[lo, 0, hi / 2, hi].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#6b7280" : "#1f2937"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{pct(t)}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(maxM / 12) + 1 }, (_, i) => i * 12).map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">{m === 0 ? "release" : `${m / 12}y`}</text>
        ))}
        {shown.map((k) => (
          <polyline key={k.kind} fill="none" stroke={SEALED_COLORS[k.kind]} strokeWidth={2}
            points={k.curve.filter((p) => p.month <= maxM).map((p) => `${x(p.month)},${y(p.change)}`).join(" ")} />
        ))}
      </svg>
    </div>
  );
}

// Year by year after release: does growth fade (a best time to sell) or
// keep compounding at the same rate?
export type YearMetric = "ret" | "excess" | "from_release";
export const YEAR_METRICS: { key: YearMetric; label: string; tip: string }[] = [
  { key: "ret", label: "that year's return", tip: "Each product's own return over that year after release (month 12(Y-1) to 12Y), median across products" },
  { key: "excess", label: "vs the market", tip: "That year's return net of the product type's whole market over the same calendar months: is it the age, or did everything rise then?" },
  { key: "from_release", label: "release → then, per year", tip: "Holding from release to the end of that year, annualized" },
];
const yv = (r: SealedYearRow, m: YearMetric) => (m === "from_release" ? r.from_release.annualized : r[m].median) ?? null;

function YearChart({ kinds, on, metric }: { kinds: SealedKindTiming[]; on: Set<SealedKind>; metric: YearMetric }) {
  const shown = kinds.filter((k) => on.has(k.kind) && (k.years ?? []).filter((r) => yv(r, metric) != null).length > 1);
  if (!shown.length) return <div className="text-sm text-gray-500">Not enough products with charts a year apart yet.</div>;
  const maxY = Math.max(3, ...shown.flatMap((k) => (k.years ?? []).map((r) => r.year)));
  const vals = shown.flatMap((k) => (k.years ?? []).map((r) => yv(r, metric)).filter((v): v is number => v != null));
  const lo = Math.min(-0.1, ...vals), hi = Math.max(0.3, ...vals);
  const W = 720, H = 220, L = 48, B = 22;
  const x = (yr: number) => L + 12 + ((yr - 1) / Math.max(1, maxY - 1)) * (W - L - 32);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-3xl">
        {[lo, 0, hi / 2, hi].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#6b7280" : "#1f2937"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{pct(t)}</text>
          </g>
        ))}
        {Array.from({ length: maxY }, (_, i) => i + 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">year {yr}</text>
        ))}
        {shown.map((k) => {
          const pts = (k.years ?? []).filter((r) => yv(r, metric) != null);
          return (
            <g key={k.kind}>
              <polyline fill="none" stroke={SEALED_COLORS[k.kind]} strokeWidth={2} points={pts.map((r) => `${x(r.year)},${y(yv(r, metric)!)}`).join(" ")} />
              {pts.map((r) => {
                const st = metric === "from_release" ? r.from_release : r[metric];
                return (
                  <circle key={r.year} cx={x(r.year)} cy={y(yv(r, metric)!)} r={3} fill={SEALED_COLORS[k.kind]}>
                    <title>{`${k.label}, year ${r.year}: ${metric === "from_release" ? `${pct(st.annualized, 1)} a year from release (${pct(st.median)} total)` : `median ${pct(st.median, 1)}`}, middle half ${pct(st.p25)} to ${pct(st.p75)}, ${share(st.up_share)}, ${st.n} products released ${r.released_from}-${r.released_to}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function YearTable({ k }: { k: SealedKindTiming }) {
  const rows = k.years ?? [];
  if (!rows.length) return <div className="text-sm text-gray-500">Not enough products with charts a year apart yet.</div>;
  const cell = (r: SealedRet, v: number | null | undefined) => (
    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap" title={r.n ? `${r.n} products · middle half ${pct(r.p25)} to ${pct(r.p75)} · ${share(r.up_share)}` : ""}>
      <span className={tone(v)}>{pct(v, 1)}</span>
      {r.n > 0 && <span className="ml-1 text-[10px] text-gray-500">{pct(r.p25)}…{pct(r.p75)}</span>}
    </td>
  );
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Year after release</th>
            {YEAR_METRICS.map((m) => <th key={m.key} className="px-2 py-1 text-right font-medium" title={m.tip}>{m.label[0].toUpperCase() + m.label.slice(1)}</th>)}
            <th className="px-2 py-1 text-right font-medium">Went up</th>
            <th className="px-2 py-1 text-right font-medium">Products</th>
            <th className="px-2 py-1 text-left font-medium" title="Release years of the products behind the row: late years are only older sets">Sets released</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year} className="border-t border-gray-800">
              <td className="px-2 py-1 text-gray-300">Year {r.year} <span className="text-gray-600">({12 * (r.year - 1)}→{12 * r.year}mo)</span></td>
              {cell(r.ret, r.ret.median)}
              {cell(r.excess, r.excess.median)}
              {cell(r.from_release, r.from_release.annualized)}
              <td className="px-2 py-1 text-right tabular-nums text-gray-400">{share(r.ret.up_share)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-gray-400">{r.ret.n}</td>
              <td className="px-2 py-1 text-gray-500">{r.released_from === r.released_to ? r.released_from : `${r.released_from}–${r.released_to}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Sliding window: the return of each hold window by the month it starts
// (buy month after release), median with the middle half shaded.
function Window({ k, hold }: { k: SealedKindTiming; hold: string }) {
  const pts = k.buy.map((b) => ({ m: b.buy_month, r: b.returns[hold] })).filter((p) => p.r?.median != null) as { m: number; r: SealedRet }[];
  if (pts.length < 2) return <div className="text-sm text-gray-500">Not enough products for a {hold}-month window yet.</div>;
  const maxM = Math.max(...pts.map((p) => p.m));
  const vals = pts.flatMap((p) => [p.r.p25 ?? 0, p.r.p75 ?? 0, p.r.median ?? 0]);
  const lo = Math.min(-0.2, ...vals), hi = Math.max(0.5, ...vals);
  const W = 720, H = 220, L = 48, B = 22;
  const x = (m: number) => L + (m / Math.max(12, maxM)) * (W - L - 8);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  const band = [...pts.map((p) => `${x(p.m)},${y(p.r.p75 ?? 0)}`), ...[...pts].reverse().map((p) => `${x(p.m)},${y(p.r.p25 ?? 0)}`)].join(" ");
  const best = k.best_buy_month[hold];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-3xl">
        {[lo, 0, hi / 2, hi].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#6b7280" : "#1f2937"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{pct(t)}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(maxM / 12) + 1 }, (_, i) => i * 12).map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">{m === 0 ? "buy at release" : `${m}mo`}</text>
        ))}
        <polygon points={band} fill={SEALED_COLORS[k.kind]} opacity={0.15} />
        <polyline fill="none" stroke={SEALED_COLORS[k.kind]} strokeWidth={2} points={pts.map((p) => `${x(p.m)},${y(p.r.median ?? 0)}`).join(" ")} />
        {best != null && <line x1={x(best)} x2={x(best)} y1={8} y2={H - B} stroke="#34d399" strokeDasharray="4 3" />}
        {pts.map((p) => (
          <circle key={p.m} cx={x(p.m)} cy={y(p.r.median ?? 0)} r={2.5} fill={SEALED_COLORS[k.kind]}>
            <title>{`Buy at month ${p.m}: median ${pct(p.r.median)} over ${hold} months (middle half ${pct(p.r.p25)} to ${pct(p.r.p75)}), ${share(p.r.up_share)}, ${p.r.n} products`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function RetCell({ r }: { r?: SealedRet }) {
  if (!r) return <td className="px-2 py-1 text-right text-gray-700">–</td>;
  return (
    <td className="px-2 py-1 text-right tabular-nums" title={`${r.n} products · middle half ${pct(r.p25)} to ${pct(r.p75)} · ${pct(r.annualized, 1)} a year`}>
      <span className={tone(r.median)}>{pct(r.median)}</span>
      <span className="ml-1 text-[10px] text-gray-500">{r.up_share != null ? `${Math.round(r.up_share * 100)}%↑` : ""}</span>
    </td>
  );
}

function PlayLine({ p, hold, what }: { p?: { month: number; returns: SealedRet } | null; hold: string; what: "release" | "reprint" }) {
  if (!p) return <div className="text-gray-600">{hold}m hold: not enough data</div>;
  const when = what === "release" ? <>buy at <b>month {p.month}</b></> : <>buy <b>{p.month === 0 ? "the month of the signal" : `${p.month}mo after`}</b></>;
  return (
    <div className="text-gray-200">{hold}m hold: {when} → <span className={tone(p.returns.median)}>{pct(p.returns.median)}</span>
      <span className="text-gray-500"> ({pct(p.returns.annualized)}/yr, {share(p.returns.up_share)}, n={p.returns.n})</span></div>
  );
}

function PlayCard({ k }: { k: SealedKindTiming }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 space-y-2 text-xs">
      <div className="font-medium" style={{ color: SEALED_COLORS[k.kind] ?? "#e5e7eb" }}>{k.label} <span className="text-gray-600 font-normal">{k.with_history} products</span></div>
      <div className="space-y-0.5">
        <div className="text-gray-500">New release</div>
        <PlayLine p={k.release_play?.["24"]} hold="24" what="release" />
        <PlayLine p={k.release_play?.["36"]} hold="36" what="release" />
      </div>
      <div className="space-y-0.5">
        <div className="text-gray-500">After a reprint signal <span className="text-gray-600">({k.reprint_basis === "confirmed" ? "confirmed reprints" : "detected drops"}, {k.reprint_events})</span></div>
        <PlayLine p={k.reprint_play?.["24"]} hold="24" what="reprint" />
        <PlayLine p={k.reprint_play?.["36"]} hold="36" what="reprint" />
      </div>
    </div>
  );
}

function Priority({ gross }: { gross: boolean }) {
  const [hold, setHold] = useState(36);
  const [rows, setRows] = useState<SealedPriorityItem[] | null>(null);
  const [method, setMethod] = useState("");
  useEffect(() => { setRows(null); fetchSealedPriority(hold, gross).then((r) => { setRows(r.products); setMethod(`${r.method} ${r.costs ?? ""}`); }).catch(() => setRows([])); }, [hold, gross]);
  return (
    <section className="rounded-lg border border-emerald-900/60 bg-gray-900 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-emerald-300">Priority: where to focus buying now</span>
        <span className="flex gap-1 text-xs">
          {[24, 36].map((h) => (
            <button key={h} onClick={() => setHold(h)} className={`rounded px-2 py-0.5 ${hold === h ? "bg-emerald-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>hold {h}m</button>
          ))}
        </span>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="text-sm text-gray-500">Nothing qualifies right now.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="px-2 py-1 font-medium">Product</th>
                <th className="px-2 py-1 font-medium text-right">Price</th>
                <th className="px-2 py-1 font-medium">Play</th>
                <th className="px-2 py-1 font-medium text-right" title="Median historic return of buying at this point, at market price">Expected</th>
                <th className="px-2 py-1 font-medium text-right">Per year</th>
                <th className="px-2 py-1 font-medium text-right" title="Middle half of historic outcomes">Range</th>
                <th className="px-2 py-1 font-medium">Why</th>
                <th className="px-2 py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.product_id} className="border-t border-gray-800 align-top">
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span style={{ color: SEALED_COLORS[p.kind] ?? "#e5e7eb" }}>●</span>{" "}
                    <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{p.set_name} · {p.name}</a>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-200">{usd(p.latest_cents)}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-gray-300">{p.play === "release" ? `month ${p.month} after release` : `${p.month}mo after ${p.signal_month} drop`}</td>
                  <td className={`px-2 py-1 text-right tabular-nums font-medium ${tone(p.expected.median)}`}>{pct(p.expected.median)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-300">{pct(p.expected.annualized)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-500 whitespace-nowrap">{pct(p.expected.p25)} to {pct(p.expected.p75)}</td>
                  <td className="px-2 py-1 text-gray-500 max-w-md">{p.reason}</td>
                  <td className="px-2 py-1"><WatchButton productId={p.product_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-500 max-w-4xl">{method}</p>
    </section>
  );
}

function Spark({ points, w = 140, h = 28 }: { points: { m: number; cents: number }[]; w?: number; h?: number }) {
  if (points.length < 2) return <span className="text-gray-700">–</span>;
  const xs = points.map((p) => p.m), ys = points.map((p) => p.cents);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (m: number) => ((m - x0) / Math.max(1, x1 - x0)) * (w - 2) + 1;
  const py = (c: number) => h - 1 - ((c - y0) / Math.max(1, y1 - y0)) * (h - 2);
  return <svg width={w} height={h}><polyline fill="none" stroke="#9ca3af" strokeWidth={1.2} points={points.map((p) => `${px(p.m)},${py(p.cents)}`).join(" ")} /></svg>;
}

const COLS = [0, 6, 12, 18, 24, 36, 48];
const at = (pts: { m: number; cents: number }[], m: number) => pts.find((p) => p.m === m)?.cents ?? pts.find((p) => p.m === m + 1)?.cents ?? pts.find((p) => p.m === m - 1)?.cents;

const YEARS = [1, 2, 3, 4, 5, 6, 7, 8];
// a product's return over year Y after release, from its chart
const yearRet = (pts: { m: number; cents: number }[], yr: number) => {
  const a = at(pts, 12 * (yr - 1)), b = at(pts, 12 * yr);
  return a && b ? b / a - 1 : null;
};

// One product's return each year after release, as a strip of chips.
export function YearStrip({ points }: { points: { m: number; cents: number }[] }) {
  const ys = Array.from({ length: 12 }, (_, i) => ({ yr: i + 1, v: yearRet(points, i + 1) })).filter((y) => y.v != null);
  if (!ys.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className="text-gray-500 mr-1" title="Each year's own return after release (month 12(Y-1) to 12Y)">Year by year:</span>
      {ys.map((y) => (
        <span key={y.yr} className="rounded bg-gray-950/70 border border-gray-800 px-1.5 py-0.5 tabular-nums">
          <span className="text-gray-500">Y{y.yr}</span> <span className={tone(y.v)}>{pct(y.v)}</span>
        </span>
      ))}
    </div>
  );
}

const SpecialTag = () => <span className="ml-1 rounded border border-fuchsia-900 px-1 text-[10px] text-fuchsia-300" title="Special set: no booster box printed">special</span>;

function BySet({ kind, era, cls }: { kind: SealedKind; era: string; cls: SetClass }) {
  const [sets, setSets] = useState<SealedSetChart[] | null>(null);
  const [view, setView] = useState<"prices" | "years">("prices");
  useEffect(() => { setSets(null); fetchSealedSets(kind, era, cls).then((r) => setSets(r.sets)).catch(() => setSets([])); }, [kind, era, cls]);
  if (!sets) return <Spinner />;
  const toggle = (
    <span className="flex gap-1 text-xs">
      <button onClick={() => setView("prices")} className={`rounded px-2 py-0.5 ${view === "prices" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>prices</button>
      <button onClick={() => setView("years")} className={`rounded px-2 py-0.5 ${view === "years" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
        title="Each year's own return after release: does it fade, or keep compounding?">return year by year</button>
    </span>
  );
  if (view === "years") return (
    <div className="space-y-2">
      {toggle}
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-left sticky top-0 bg-gray-900">
            <tr>
              <th className="px-2 py-1 font-medium">Set · product</th>
              <th className="px-2 py-1 font-medium">Chart</th>
              {YEARS.map((yr) => <th key={yr} className="px-2 py-1 font-medium text-right" title={`Month ${12 * (yr - 1)} to ${12 * yr} after release`}>Year {yr}</th>)}
              <th className="px-2 py-1 font-medium text-right" title="Release (or first chart month) to now, per year">Per year to now</th>
            </tr>
          </thead>
          <tbody>
            {sets.flatMap((s) => s.products.map((p) => {
              const last = p.points[p.points.length - 1], first = p.points[0];
              const yrs = first && last ? (last.m - first.m) / 12 : 0;
              const cagr = yrs >= 1 ? Math.pow(last.cents / first.cents, 1 / yrs) - 1 : null;
              return (
                <tr key={p.id} className="border-t border-gray-800">
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="text-gray-300">{s.set_name}</span>{s.set_class === "special" && <SpecialTag />}{s.set_class === "special" && <SpecialTag />} <span className="text-gray-500">{p.variant ?? ""}</span>
                    <div className="text-[10px] text-gray-600">{s.release_date ?? "no date"} · chart from {first?.month ?? "–"}</div>
                  </td>
                  <td className="px-2 py-1"><Spark points={p.points} /></td>
                  {YEARS.map((yr) => { const v = yearRet(p.points, yr); return <td key={yr} className={`px-2 py-1 text-right tabular-nums ${tone(v)}`}>{pct(v)}</td>; })}
                  <td className={`px-2 py-1 text-right tabular-nums ${tone(cagr)}`} title={first ? `from ${first.month}` : ""}>{pct(cagr, 1)}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
    {toggle}
    <div className="overflow-x-auto max-h-[560px]">
      <table className="w-full text-xs">
        <thead className="text-gray-500 text-left sticky top-0 bg-gray-900">
          <tr>
            <th className="px-2 py-1 font-medium">Set · product</th>
            <th className="px-2 py-1 font-medium">Chart</th>
            {COLS.map((m) => <th key={m} className="px-2 py-1 font-medium text-right">{m === 0 ? "Release" : `${m}mo`}</th>)}
            <th className="px-2 py-1 font-medium text-right">Latest</th>
            <th className="px-2 py-1 font-medium text-right" title="From its first chart price">Since start</th>
          </tr>
        </thead>
        <tbody>
          {sets.flatMap((s) => s.products.map((p) => {
            const last = p.points[p.points.length - 1], first = p.points[0];
            return (
              <tr key={p.id} className="border-t border-gray-800">
                <td className="px-2 py-1 whitespace-nowrap">
                  <span className="text-gray-300">{s.set_name}</span>
                  <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="ml-1 text-gray-500 hover:text-indigo-300">{p.variant ?? ""}</a>
                  <div className="text-[10px] text-gray-600">{s.release_date ?? "no date"} · chart from {first?.month ?? "–"} · <WatchButton productId={p.id} /></div>
                </td>
                <td className="px-2 py-1"><Spark points={p.points} /></td>
                {COLS.map((m) => <td key={m} className="px-2 py-1 text-right tabular-nums text-gray-400">{usd(at(p.points, m))}</td>)}
                <td className="px-2 py-1 text-right tabular-nums text-gray-200">{usd(last?.cents)}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${tone(first && last ? last.cents / first.cents - 1 : null)}`}>{first && last ? pct(last.cents / first.cents - 1) : "–"}</td>
              </tr>
            );
          }))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

// Early years of pre-2021 sets: PriceCharting's charts start in 2021, so
// growth from launch to the first chart month (archived price or MSRP).
function EarlyYears({ gross }: { gross: boolean }) {
  const [kind, setKind] = useState<"booster_box" | "etb">("booster_box");
  const [d, setD] = useState<SealedEarly | null>(null);
  useEffect(() => { setD(null); fetchSealedEarly(kind, gross).then(setD).catch(() => setD(null)); }, [kind, gross]);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-200 font-medium">Early years of older sets</span>
        <span className="flex gap-1 text-xs">
          {(["booster_box", "etb"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded px-2 py-0.5 ${kind === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{k === "etb" ? "ETB" : "Booster box"}</button>
          ))}
        </span>
        {d && (
          <span className="text-xs text-gray-400">
            median launch → 2021+ <span className={tone(d.median_to_first_pc_per_year)}>{pct(d.median_to_first_pc_per_year)}/yr</span>,
            launch → now <span className={tone(d.median_to_latest_per_year)}>{pct(d.median_to_latest_per_year)}/yr</span>
            <span className="text-gray-600"> · launch from {Object.entries(d.launch_sources).map(([k, v]) => `${v} ${k === "msrp" ? "MSRP" : "archived price"}`).join(", ")}</span>
          </span>
        )}
      </div>
      {!d ? <Spinner /> : d.products.length === 0 ? <div className="text-sm text-gray-500">No older products missing early history.</div> : (
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left sticky top-0 bg-gray-900">
              <tr>
                <th className="px-2 py-1 font-medium">Set · product</th>
                <th className="px-2 py-1 font-medium text-right">Launch</th>
                <th className="px-2 py-1 font-medium" title="Archived TCGplayer market prices (Internet Archive)">Archived prices</th>
                <th className="px-2 py-1 font-medium text-right">First chart</th>
                <th className="px-2 py-1 font-medium text-right" title="Launch to first PriceCharting month, after selling costs">Per year to then</th>
                <th className="px-2 py-1 font-medium text-right">Latest</th>
                <th className="px-2 py-1 font-medium text-right">Per year to now</th>
              </tr>
            </thead>
            <tbody>
              {d.products.map((p) => (
                <tr key={p.product_id} className="border-t border-gray-800 align-top">
                  <td className="px-2 py-1"><span className="text-gray-200">{p.set_name}</span> <span className="text-gray-500">{p.name}</span>
                    <div className="text-[10px] text-gray-600">released {p.release_date}</div></td>
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{usd(p.launch?.cents)}
                    <div className="text-[10px] text-gray-500">{p.launch ? (p.launch.source === "msrp" ? "MSRP (approx.)" : `archived ${p.launch.month}`) : ""}</div></td>
                  <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{p.archive.length ? p.archive.map((a) => `${a.month} ${usd(a.cents)}`).join(" · ") : <span className="text-gray-700">none</span>}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-300 whitespace-nowrap">{usd(p.first_pricecharting?.cents)}<div className="text-[10px] text-gray-500">{p.first_pricecharting?.month}</div></td>
                  <td className={`px-2 py-1 text-right tabular-nums ${tone(p.to_first_pc_per_year)}`}>{pct(p.to_first_pc_per_year)}<div className="text-[10px] text-gray-500">{p.years_to_first_pc != null ? `${p.years_to_first_pc}y` : ""}</div></td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-200">{usd(p.latest?.cents)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${tone(p.to_latest_per_year)}`}>{pct(p.to_latest_per_year)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && <p className="text-[11px] text-gray-500 max-w-4xl">{d.method} {d.costs}</p>}
    </section>
  );
}

export default function SealedTimingPage() {
  const [kinds, setKinds] = useState<SealedKindTiming[] | null>(null);
  const [method, setMethod] = useState("");
  const [on, setOn] = useState<Set<SealedKind>>(new Set(["etb", "pc_etb", "booster_box", "booster_bundle", "upc", "premium_collection"]));
  const [kind, setKind] = useState<SealedKind>("etb");
  const [hold, setHold] = useState("24");
  const [yearMetric, setYearMetric] = useState<YearMetric>("ret");
  const [era, setEra] = useState("all");
  const [cls, setCls] = useState<SetClass>("all");
  const [classes, setClasses] = useState<{ key: SetClass; label: string }[]>([]);
  const [eras, setEras] = useState<{ key: string; label: string }[]>([]);
  const [gross, setGross] = useState(false);
  const [costs, setCosts] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setKinds(null);
    fetchSealedTiming(era, gross, cls).then((r) => { setKinds(r.kinds); setMethod(r.method); setEras(r.eras ?? []); setClasses(r.classes ?? []); setCosts(r.costs ?? ""); }).catch((e) => setErr(String(e)));
  }, [era, gross, cls]);
  const cur = useMemo(() => kinds?.find((k) => k.kind === kind), [kinds, kind]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed timing</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          English Pokémon sealed from PriceCharting&apos;s monthly charts: what to focus buying on now, the best historic plays per product
          type, and the data behind them set by set. Returns are at market price and lean on the 2020-22 boom and the products PriceCharting
          still lists: compare eras, and read a best month as a range. Reprints are reviewed set by set on <Link to="/sealed/reprints" className="text-indigo-300 hover:underline">Sealed reprints</Link>.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex rounded border border-gray-800 overflow-hidden">
          <button onClick={() => setGross(false)} className={`px-2.5 py-1 ${!gross ? "bg-emerald-700 text-white" : "text-gray-400"}`}>after selling costs</button>
          <button onClick={() => setGross(true)} className={`px-2.5 py-1 ${gross ? "bg-gray-700 text-white" : "text-gray-400"}`}>gross</button>
        </span>
        <span className="text-gray-500">{costs} <Link to="/settings" className="text-indigo-300 hover:underline">Settings</Link></span>
      </div>

      <Priority gross={gross} />

      {eras.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-gray-500 mr-1">Sets:</span>
          {eras.map((e) => (
            <button key={e.key} onClick={() => setEra(e.key)}
              className={`rounded px-2.5 py-1 ${era === e.key ? "bg-indigo-600 text-white" : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200"}`}>{e.label}</button>
          ))}
        </div>
      )}
      {classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-gray-500 mr-1" title="Special sets print no booster box: their ETBs, PC ETBs and bundles are the main way to open them">Set type:</span>
          {classes.map((c) => (
            <button key={c.key} onClick={() => setCls(c.key)}
              className={`rounded px-2.5 py-1 ${cls === c.key ? "bg-fuchsia-700 text-white" : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200"}`}>{c.label}</button>
          ))}
        </div>
      )}
      {!kinds ? <Spinner /> : (
        <>
          <section className="space-y-2">
            <div className="text-sm text-gray-200 font-medium">Best historic plays</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{kinds.filter((k) => k.with_history > 0).map((k) => <PlayCard key={k.kind} k={k} />)}</div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-300 font-medium">Price vs release month</span>
              {kinds.map((k) => (
                <label key={k.kind} className="flex items-center gap-1 text-gray-400">
                  <input type="checkbox" checked={on.has(k.kind)} onChange={() => setOn((s) => { const n = new Set(s); if (n.has(k.kind)) n.delete(k.kind); else n.add(k.kind); return n; })} />
                  <span style={{ color: SEALED_COLORS[k.kind] ?? "#e5e7eb" }}>●</span> {k.label}
                </label>
              ))}
            </div>
            <Curves kinds={kinds} on={on} />
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <span className="text-gray-300 font-medium">Return year by year after release</span>
              <span className="flex gap-1">
                {YEAR_METRICS.map((m) => (
                  <button key={m.key} onClick={() => setYearMetric(m.key)} title={m.tip}
                    className={`rounded px-2 py-0.5 ${yearMetric === m.key ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{m.label}</button>
                ))}
              </span>
            </div>
            <YearChart kinds={kinds} on={on} metric={yearMetric} />
            <p className="text-[11px] text-gray-500 max-w-4xl">
              A falling line means growth fades with age, so there&apos;s a best time to sell; a flat line means it keeps compounding.
              Late years are only older sets (charts start in 2021), so compare against &quot;vs the market&quot;, which takes out what the whole product type did in those same months.
            </p>
            <p className="text-[11px] text-gray-500 max-w-4xl">{method}</p>
          </section>

          <div className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <button key={k.kind} onClick={() => setKind(k.kind)}
                className={`rounded px-2.5 py-1 text-xs ${kind === k.kind ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                {k.label} <span className="text-gray-500">{k.with_history}</span>
              </button>
            ))}
          </div>

          {cur && (
            <>
              <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-gray-200 font-medium">{cur.label}: return by buy month (sliding window)</span>
                  <span className="flex gap-1 text-xs">
                    {HOLDS.map((h) => (
                      <button key={h} onClick={() => setHold(h)} className={`rounded px-2 py-0.5 ${hold === h ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{h}-month hold</button>
                    ))}
                  </span>
                </div>
                <Window k={cur} hold={hold} />
                <p className="text-[11px] text-gray-500">Each point: buy that many months after release, sell {hold} months later. Line = median, shaded = middle half, dashed = best month. Hover a point for the numbers.</p>
              </section>

              <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
                <span className="text-sm text-gray-200 font-medium">{cur.label}: return year by year after release</span>
                <YearTable k={cur} />
                <p className="text-[11px] text-gray-500">Median across products, middle half in grey; hover for counts. Per set on &quot;by set&quot; below (return year by year).</p>
              </section>

              <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
                <span className="text-sm text-gray-200 font-medium">{cur.label}: by buy month</span>
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="text-xs">
                    <thead className="text-gray-500 sticky top-0 bg-gray-900">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">Buy at month</th>
                        {HOLDS.map((h) => <th key={h} className="px-2 py-1 text-right font-medium">Hold {h}m</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cur.buy.map((b) => (
                        <tr key={b.buy_month} className="border-t border-gray-800">
                          <td className="px-2 py-1 text-gray-300">{b.buy_month}{HOLDS.some((h) => cur.best_buy_month[h] === b.buy_month) && <span className="ml-1 text-emerald-400">★</span>}</td>
                          {HOLDS.map((h) => <RetCell key={h} r={b.returns[h]} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <EarlyYears gross={gross} />

              <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
                <span className="text-sm text-gray-200 font-medium">{cur.label}: by set (the data points)</span>
                <BySet kind={kind} era={era} cls={cls} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
