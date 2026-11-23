import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchSealedReprints, fetchSealedSets, markSealedReprint,
  SEALED_KIND_LABEL, type ReprintEvent, type SealedKind, type SealedReprints, type SealedSetChart,
} from "../lib/api";
import { Spinner } from "../components/Spinner";
import { SEALED_COLORS, YearStrip, pct, usd } from "./SealedTimingPage";

// Sealed reprints, set by set: every significant drop in each product's
// chart (a reprint or a fresh wave of product), to confirm or reject. The
// timing stats use confirmed reprints once a product type has three.

const KINDS: [SealedKind | "", string][] = [["", "All"], ...(Object.entries(SEALED_KIND_LABEL) as [SealedKind, string][]).filter(([k]) => !k.startsWith("mtg_"))];

function Chart({ points, events }: { points: { month: string; cents: number }[]; events: ReprintEvent[] }) {
  if (points.length < 2) return <div className="text-xs text-gray-600">no chart</div>;
  const W = 520, H = 110, L = 44, B = 16;
  const ys = points.map((p) => p.cents);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - 6);
  const y = (c: number) => 4 + (1 - (c - y0) / Math.max(1, y1 - y0)) * (H - B - 6);
  const idx = (m: string) => points.findIndex((p) => p.month === m);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl">
      <text x={L - 4} y={y(y1) + 4} textAnchor="end" className="fill-gray-500 text-[9px]">{usd(y1)}</text>
      <text x={L - 4} y={y(y0) + 4} textAnchor="end" className="fill-gray-500 text-[9px]">{usd(y0)}</text>
      <text x={L} y={H - 3} className="fill-gray-500 text-[9px]">{points[0].month}</text>
      <text x={W - 6} y={H - 3} textAnchor="end" className="fill-gray-500 text-[9px]">{points[points.length - 1].month}</text>
      <polyline fill="none" stroke="#9ca3af" strokeWidth={1.3} points={points.map((p, i) => `${x(i)},${y(p.cents)}`).join(" ")} />
      {events.map((e) => {
        const i = idx(e.signal_month);
        if (i < 0) return null;
        const c = e.status === "confirmed" ? "#34d399" : e.set_specific ? "#fbbf24" : "#6b7280";
        return (
          <g key={e.signal_month}>
            <line x1={x(i)} x2={x(i)} y1={4} y2={H - B} stroke={c} strokeDasharray="3 2" />
            <circle cx={x(i)} cy={y(points[i].cents)} r={3} fill={c}><title>{`${e.signal_month}: ${usd(e.peak_cents)} → ${usd(e.signal_cents)}`}</title></circle>
          </g>
        );
      })}
    </svg>
  );
}

export default function SealedReprintsPage() {
  const [kind, setKind] = useState<SealedKind | "">("");
  const [all, setAll] = useState<SealedReprints | null>(null);
  const [set, setSet] = useState("");
  const [charts, setCharts] = useState<SealedSetChart | null>(null);
  const [showMarket, setShowMarket] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [add, setAdd] = useState<Record<number, string>>({});

  const load = () => fetchSealedReprints(kind).then((r) => {
    setAll(r);
    setSet((s) => s || r.sets[0]?.set_code || "");
  }).catch((e) => setErr(String(e)));
  useEffect(() => { setAll(null); load(); }, [kind]);
  useEffect(() => {
    if (!set) return;
    setCharts(null);
    fetchSealedSets(kind || "", "all").then((r) => setCharts(r.sets.find((s) => s.set_code === set) ?? null)).catch((e) => setErr(String(e)));
  }, [set, kind]);

  const events = useMemo(() => (all?.events ?? []).filter((e) => e.set_code === set && (showMarket || e.set_specific || e.status === "confirmed")), [all, set, showMarket]);

  const mark = async (pid: number, month: string, status: "confirmed" | "rejected" | "clear") => {
    setBusy(`${pid}-${month}`);
    try { await markSealedReprint(pid, month, status); await load(); } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed reprints</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          Every significant drop in each product&apos;s price, set by set: usually a reprint or a fresh wave of product. Confirm the real ones
          (yes), drop the rest (no), and add any it missed. <span className="text-amber-300">Amber</span> drops are the product&apos;s own
          (15%+ against every other set&apos;s same product); <span className="text-gray-400">grey</span> ones moved with the whole market;
          <span className="text-emerald-300"> green</span> are confirmed. The <Link to="/sealed/timing" className="text-indigo-300 hover:underline">timing</Link> stats
          switch to confirmed reprints once a product type has three.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {KINDS.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded px-2.5 py-1 ${kind === k ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>
        ))}
        <label className="ml-3 flex items-center gap-1 text-gray-400"><input type="checkbox" checked={showMarket} onChange={(e) => setShowMarket(e.target.checked)} /> show market-wide drops</label>
      </div>
      {!all ? <Spinner /> : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <aside className="rounded-lg border border-gray-800 bg-gray-900 max-h-[75vh] overflow-y-auto">
            {all.sets.map((s) => (
              <button key={s.set_code} onClick={() => setSet(s.set_code)}
                className={`w-full text-left px-3 py-1.5 text-xs border-b border-gray-800 ${set === s.set_code ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800/50"}`}>
                <div className="flex justify-between gap-2">
                  <span className="truncate">{s.set_name}</span>
                  <span className="whitespace-nowrap text-gray-500">
                    {s.confirmed > 0 && <span className="text-emerald-300">{s.confirmed}✓ </span>}{s.candidates}
                  </span>
                </div>
                <div className="text-[10px] text-gray-600">{s.release_date ?? "no date"}</div>
              </button>
            ))}
          </aside>
          <main className="space-y-3">
            {!charts ? <Spinner /> : charts.products.map((p) => {
              const evs = events.filter((e) => e.product_id === p.id);
              return (
                <section key={p.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span style={{ color: SEALED_COLORS[p.kind] ?? "#e5e7eb" }}>●</span>
                    <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{charts.set_name} · {p.name}</a>
                    <span className="text-xs text-gray-500">released {charts.release_date ?? "?"}</span>
                  </div>
                  <Chart points={p.points} events={evs} />
                  <YearStrip points={p.points} />
                  {evs.length > 0 && (
                    <table className="w-full text-xs">
                      <tbody>
                        {evs.map((e) => {
                          const k = `${e.product_id}-${e.signal_month}`;
                          return (
                            <tr key={k} className="border-t border-gray-800">
                              <td className="px-2 py-1 text-gray-300 whitespace-nowrap">{e.signal_month}{e.months_since_release != null && <span className="text-gray-500"> · month {e.months_since_release}</span>}</td>
                              <td className="px-2 py-1 tabular-nums text-gray-300 whitespace-nowrap">{usd(e.peak_cents)} → {usd(e.signal_cents)}</td>
                              <td className="px-2 py-1 tabular-nums whitespace-nowrap"><span className="text-rose-300">{pct(e.drawdown)}</span><span className="text-gray-500"> to trough in {e.months_to_trough}mo</span></td>
                              <td className="px-2 py-1 text-gray-500 whitespace-nowrap">market {pct(e.market_move)}{e.set_specific ? <span className="text-amber-300"> · own drop</span> : ""}</td>
                              <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{e.months_to_recover != null ? `recovered in ${e.months_to_recover}mo` : "not recovered"}</td>
                              <td className="px-2 py-1 whitespace-nowrap">
                                {e.status === "confirmed" ? (
                                  <span className="text-emerald-300">reprint ✓ <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "clear")} className="ml-1 text-gray-500 hover:text-gray-300">undo</button></span>
                                ) : (
                                  <span className="flex gap-3">
                                    <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "confirmed")} className="text-emerald-300 hover:text-emerald-200">yes, reprint</button>
                                    <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "rejected")} className="text-gray-500 hover:text-rose-300">no</button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    add a reprint it missed:
                    <input type="month" value={add[p.id] ?? ""} onChange={(e) => setAdd((a) => ({ ...a, [p.id]: e.target.value }))}
                      className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200" />
                    <button disabled={!add[p.id] || busy !== ""} onClick={() => add[p.id] && mark(p.id, add[p.id], "confirmed")}
                      className="rounded bg-gray-800 px-2 py-0.5 text-gray-200 hover:bg-gray-700 disabled:opacity-40">add</button>
                  </div>
                </section>
              );
            })}
            {charts && charts.products.length === 0 && <div className="text-sm text-gray-500">No products of this type in this set.</div>}
          </main>
        </div>
      )}
      <p className="text-[11px] text-gray-500 max-w-4xl">{all?.method}</p>
    </div>
  );
}
