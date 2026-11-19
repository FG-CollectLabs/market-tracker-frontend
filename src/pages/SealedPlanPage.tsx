import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchSealedStrategy, saveSealedPlan, watchSealed, SEALED_KIND_LABEL,
  type SealedStrategy, type StrategyLine, type StrategyTrigger,
} from "../lib/api";
import { Spinner } from "../components/Spinner";
import { SEALED_COLORS, usd } from "./SealedTimingPage";

// The sealed plan: one mechanical buying and selling plan, broken down by
// product and set type, in a few plain rules; the backtest behind each rule
// against the alternatives it beat; and what it buys this month.

const yr = (v?: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);
const conf: Record<string, string> = {
  high: "border-emerald-700 text-emerald-300", medium: "border-amber-700 text-amber-300", low: "border-gray-700 text-gray-400",
};
const classChip = (c: string) => c === "special" ? "border-fuchsia-800 text-fuchsia-300" : "border-sky-800 text-sky-300";

function LineCard({ l }: { l: StrategyLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: SEALED_COLORS[l.kind] ?? "#e5e7eb" }}>●</span>
        <h3 className="text-sm font-semibold text-white">{l.title}</h3>
        <span className={`rounded border px-1.5 text-[10px] ${classChip(l.class)}`}>{l.class} sets</span>
        <span className={`rounded border px-1.5 text-[10px] ${conf[l.confidence]}`} title="high: 10+ rotated sets, mostly sold; medium: 6+; low: fewer">{l.confidence} confidence</span>
        {l.status === "watch" && <span className="rounded border border-gray-700 px-1.5 text-[10px] text-gray-400">watch only</span>}
        {l.result && (
          <span className="ml-auto text-xs text-gray-400">
            <span className="text-lg font-semibold text-emerald-300 tabular-nums">{yr(l.result.irr)}</span> a year ·{" "}
            {l.result.multiple.toFixed(2)}× · {l.sets_tested} sets · {Math.round((1 - l.result.open_share) * 100)}% sold
          </span>
        )}
      </div>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-200">
        {l.rules.map((r) => <li key={r}>{r}</li>)}
      </ol>
      {l.notes && l.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-200/80">{l.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
      )}
      <div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-indigo-300 hover:underline">{open ? "Hide" : "Why this rule"} ({l.why.length})</button>
        {open && (
          <div className="mt-2 space-y-3">
            <ul className="space-y-1 text-xs text-gray-300">{l.why.map((w) => <li key={w}>• {w}</li>)}</ul>
            {l.alternatives && l.alternatives.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500"><tr>
                    <th className="py-1 pr-4 text-left font-medium">Same line, but…</th>
                    <th className="py-1 pr-4 text-right font-medium">A year</th>
                    <th className="py-1 pr-4 text-right font-medium">vs the plan</th>
                    <th className="py-1 pr-4 text-right font-medium">Multiple</th>
                    <th className="py-1 pr-4 text-right font-medium">Sets</th>
                    <th className="py-1 pr-4 text-right font-medium">Still held</th>
                  </tr></thead>
                  <tbody>
                    {l.result && (
                      <tr className="border-t border-gray-800 text-emerald-200">
                        <td className="py-1 pr-4">The plan</td><td className="py-1 pr-4 text-right tabular-nums">{yr(l.result.irr)}</td><td />
                        <td className="py-1 pr-4 text-right tabular-nums">{l.result.multiple.toFixed(2)}×</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{l.result.sets}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{Math.round(l.result.open_share * 100)}%</td>
                      </tr>
                    )}
                    {l.alternatives.map((a) => (
                      <tr key={a.label} className={`border-t border-gray-800 ${a.result.sets < 5 ? "opacity-50" : ""}`} title={a.note}>
                        <td className="py-1 pr-4 text-gray-300">{a.label}{a.result.sets < 5 && <span className="text-gray-500"> (too few sets)</span>}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{yr(a.result.irr)}</td>
                        <td className={`py-1 pr-4 text-right tabular-nums ${a.delta_irr == null ? "" : a.delta_irr >= 0.02 ? "text-emerald-300" : a.delta_irr <= -0.02 ? "text-rose-300" : "text-gray-400"}`}>
                          {a.delta_irr == null ? "–" : `${a.delta_irr >= 0 ? "plan +" : "plan "}${(a.delta_irr * 100).toFixed(1)} pts`}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{a.result.multiple.toFixed(2)}×</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{a.result.sets}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{Math.round(a.result.open_share * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TriggerTable({ rows, onWatch }: { rows: StrategyTrigger[]; onWatch?: (t: StrategyTrigger) => Promise<void> }) {
  const [done, setDone] = useState<Record<number, string>>({});
  if (rows.length === 0) return <p className="text-xs text-gray-500">Nothing right now.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500 text-left"><tr>
          <th className="py-1 pr-4 font-medium">Product</th>
          <th className="py-1 pr-4 font-medium text-right">Market</th>
          <th className="py-1 pr-4 font-medium text-right">vs MSRP</th>
          <th className="py-1 pr-4 font-medium text-right" title="Buy at or under (the line's price gate)">Buy at or under</th>
          <th className="py-1 pr-4 font-medium text-right" title="This month's buy: 1 MSRP's worth per leg">This month</th>
          <th className="py-1 pr-4 font-medium text-right">Rotates</th>
          <th className="py-1 pr-4 font-medium"></th>
        </tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.product_id} className="border-t border-gray-800" title={t.why}>
            <td className="py-1 pr-4">
              <span style={{ color: SEALED_COLORS[t.kind] ?? "#e5e7eb" }}>●</span>{" "}
              <a href={t.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{t.set_name} · {SEALED_KIND_LABEL[t.kind] ?? t.name}</a>
              <span className={`ml-1 rounded border px-1 text-[10px] ${classChip(t.class)}`}>{t.class}</span>
              <div className="text-[10px] text-gray-500">month {t.age_months} · {t.why}</div>
            </td>
            <td className="py-1 pr-4 text-right tabular-nums text-gray-200">{usd(t.price_cents)}</td>
            <td className={`py-1 pr-4 text-right tabular-nums ${t.vs_msrp <= 1.1 ? "text-emerald-300" : t.vs_msrp <= 1.5 ? "text-amber-300" : "text-rose-300"}`}>{t.vs_msrp.toFixed(2)}×</td>
            <td className="py-1 pr-4 text-right tabular-nums">{t.target_cents ? usd(t.target_cents) : "any price"}</td>
            <td className="py-1 pr-4 text-right tabular-nums">{t.status === "buy" ? <>{usd(t.spend_per_month_cents)}<div className="text-[10px] text-gray-500">{t.units_per_month} units</div></> : <span className="text-gray-500">wait</span>}</td>
            <td className="py-1 pr-4 text-right tabular-nums text-gray-400">{t.months_to_rotation != null ? `${t.months_to_rotation}mo` : "–"}</td>
            <td className="py-1 pr-4 whitespace-nowrap text-right">
              {t.watched || done[t.product_id] === "ok" ? <span className="text-emerald-400">watched</span>
                : onWatch && <button onClick={async () => {
                  setDone((d) => ({ ...d, [t.product_id]: "…" }));
                  try { await onWatch(t); setDone((d) => ({ ...d, [t.product_id]: "ok" })); } catch (e) { setDone((d) => ({ ...d, [t.product_id]: String(e) })); }
                }} className="rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:text-white" title="Watch it with the gate as the buy-below target">{done[t.product_id] === "…" ? "…" : "Watch"}</button>}
              {done[t.product_id] && done[t.product_id] !== "ok" && done[t.product_id] !== "…" && <div className="text-[10px] text-rose-400">{done[t.product_id]}</div>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export const watchTrigger = (t: StrategyTrigger) => watchSealed(t.product_id, t.target_cents || null, `plan: ${t.line}`).then(() => undefined);

export default function SealedPlanPage() {
  const [d, setD] = useState<SealedStrategy | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { fetchSealedStrategy().then(setD).catch((e) => setErr(String(e))); }, []);
  const use = async () => {
    if (!d) return;
    setMsg("");
    try { await saveSealedPlan(d.plan); setMsg("Checked in as my plan: the buy list and the watchlist's suggestions now follow it."); } catch (e) { setMsg(String(e)); }
  };
  const buys = d?.triggers.filter((t) => t.status === "buy") ?? [];
  const waits = d?.triggers.filter((t) => t.status === "wait") ?? [];
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed plan</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          One mechanical plan for buying and selling sealed, by product and set type. Every rule below was picked from backtests on the sets that have
          already rotated out of Standard, and beat the alternatives listed under &quot;Why this rule&quot;. Experiment on{" "}
          <Link to="/sealed/backtest" className="text-indigo-300 hover:underline">Sealed backtests</Link>; watch and buy from the{" "}
          <Link to="/sealed/watchlist" className="text-indigo-300 hover:underline">Sealed watchlist</Link>.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!d && !err && <Spinner />}
      {d && (
        <>
          <section className="rounded-lg border border-indigo-900/60 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-white">The plan in four lines</h2>
              <span className="ml-auto text-xs text-gray-400">
                All lines together: <span className="text-base font-semibold text-emerald-300">{yr(d.total.irr)}</span> a year · {d.total.multiple.toFixed(2)}× · {d.total.sets} sets ·{" "}
                {Math.round((1 - d.total.open_share) * 100)}% sold
              </span>
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-200">{d.summary.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button onClick={use} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500">Use this as my plan</button>
              <span className="text-gray-500">Replaces the strategies checked in on Sealed backtests (signed in).</span>
              {msg && <span className="text-emerald-300">{msg}</span>}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-white">By product and set type</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left"><tr>
                  <th className="px-3 py-2 font-medium">Product</th><th className="px-2 py-2 font-medium">Sets</th><th className="px-2 py-2 font-medium">Buy</th>
                  <th className="px-2 py-2 font-medium">Only when</th><th className="px-2 py-2 font-medium">Sell</th>
                  <th className="px-2 py-2 font-medium text-right">A year</th><th className="px-2 py-2 font-medium text-right">Tested on</th><th className="px-2 py-2 font-medium">Confidence</th>
                </tr></thead>
                <tbody>{d.lines.map((l) => {
                  const g = l.legs?.[0];
                  return (
                    <tr key={l.key} className="border-t border-gray-800">
                      <td className="px-3 py-2 text-gray-100"><span style={{ color: SEALED_COLORS[l.kind] ?? "#e5e7eb" }}>●</span> {SEALED_KIND_LABEL[l.kind]}</td>
                      <td className="px-2 py-2"><span className={`rounded border px-1 text-[10px] ${classChip(l.class)}`}>{l.class}</span></td>
                      <td className="px-2 py-2 text-gray-300">{g ? `month ${g.start_month} → rotation${(l.legs?.length ?? 0) > 1 ? `, ramping (${l.legs!.map((x) => `${x.units}× from ${x.start_month}`).join(", ")})` : ""}` : "watch only"}</td>
                      <td className="px-2 py-2 text-gray-300">{g ? (g.max_msrp_mult ? `≤ ${g.max_msrp_mult}× MSRP` : "any price") : "–"}</td>
                      <td className="px-2 py-2 text-gray-300">{g ? `${g.sell_after_rotation}mo after rotation` : "–"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-300">{yr(l.result?.irr)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-400">{l.sets_tested} sets</td>
                      <td className="px-2 py-2"><span className={`rounded border px-1.5 text-[10px] ${conf[l.confidence]}`}>{l.confidence}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Each line, and why</h2>
            {d.lines.map((l) => <LineCard key={l.key} l={l} />)}
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">This month ({d.latest}): {usd(d.spend_this_month_cents)} to buy</h2>
            <h3 className="text-xs font-medium text-emerald-300">Buy now ({buys.length})</h3>
            <TriggerTable rows={buys} onWatch={watchTrigger} />
            <h3 className="text-xs font-medium text-amber-300">In the buy window, waiting for the price ({waits.length})</h3>
            <TriggerTable rows={waits} onWatch={watchTrigger} />
          </section>
          <p className="text-[11px] text-gray-500">{d.costs} {d.method}</p>
        </>
      )}
    </div>
  );
}
