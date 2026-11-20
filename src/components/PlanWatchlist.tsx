import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPlanStatus, watchSealed, SEALED_KIND_LABEL, type PlanStatus, type PlanStatusRow } from "../lib/api";
import { Spinner } from "./Spinner";
import { SEALED_COLORS, usd } from "../pages/SealedTimingPage";

// The plan as a watchlist: every product the plan's rules cover in a set
// still in Standard, where it stands today and what the rules say: buy now
// (how many), wait for a price, a rule starting later, or a dip to watch for.

const STATUS: Record<string, { label: string; cls: string; hint: string }> = {
  buy: { label: "Buy now", cls: "border-emerald-700 text-emerald-300", hint: "a rule buys it this month" },
  wait: { label: "Wait for price", cls: "border-amber-700 text-amber-300", hint: "in its buy window, but over the rule's MSRP gate" },
  watching: { label: "Watch for dip", cls: "border-sky-700 text-sky-300", hint: "a dip rule triggers at the price shown" },
  upcoming: { label: "Upcoming", cls: "border-gray-700 text-gray-400", hint: "a rule starts in a few months" },
};

export default function PlanWatchlist({ onWatched }: { onWatched?: () => void }) {
  const [plan, setPlan] = useState<"mine" | "recommended">("mine");
  const [d, setD] = useState<PlanStatus | null>(null);
  const [err, setErr] = useState("");
  const [show, setShow] = useState<Record<string, boolean>>({ buy: true, wait: true, watching: false, upcoming: false });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState("");
  const load = () => { setD(null); fetchPlanStatus(plan).then(setD).catch((e) => setErr(String(e))); };
  useEffect(load, [plan]);

  const rows = useMemo(() => (d?.rows ?? []).filter((r) => show[r.status]), [d, show]);
  // the target to watch at: the gate (wait), the dip trigger (watching), else today's price
  const targetOf = (r: PlanStatusRow) => r.target_cents || r.dip_trigger_cents || null;
  const watch = async (r: PlanStatusRow) => {
    setDone((x) => ({ ...x, [r.product_id]: "…" }));
    try { await watchSealed(r.product_id, targetOf(r), `plan: ${r.status}`); setDone((x) => ({ ...x, [r.product_id]: "ok" })); onWatched?.(); }
    catch (e) { setDone((x) => ({ ...x, [r.product_id]: String(e) })); }
  };
  const watchAll = async () => {
    const todo = rows.filter((r) => !r.watched && done[r.product_id] !== "ok");
    for (let i = 0; i < todo.length; i++) { setBusy(`watching ${i + 1} of ${todo.length}…`); await watch(todo[i]); }
    setBusy("");
  };

  return (
    <section className="rounded-lg border border-indigo-900/60 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-white">Plan watchlist</h2>
        <select value={plan} onChange={(e) => setPlan(e.target.value as "mine" | "recommended")} className="rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-200">
          <option value="mine">My checked-in plan</option><option value="recommended">The recommended plan</option>
        </select>
        {d && <span className="text-xs text-gray-400">{d.from} · prices as of {d.month} · <span className="text-emerald-300">{usd(d.spend_this_month_cents)}</span> to buy this month</span>}
      </div>
      <p className="text-xs text-gray-500 max-w-5xl">
        Every product your rules cover in a set still in Standard, where it is today and what the rules say. Edit the rules on{" "}
        <Link to="/sealed/backtest" className="text-indigo-300 hover:underline">Sealed backtests</Link> (then Check in plan). Watch adds it here with the price to buy at: the gate for &quot;wait&quot;, the dip trigger for &quot;watch for dip&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(STATUS).map(([k, s]) => (
          <button key={k} onClick={() => setShow((x) => ({ ...x, [k]: !x[k] }))} title={s.hint}
            className={`rounded border px-2 py-0.5 ${s.cls} ${show[k] ? "bg-gray-800" : "opacity-50"}`}>{s.label} {d?.counts[k] ?? 0}</button>
        ))}
        {rows.length > 0 && <button onClick={watchAll} disabled={busy !== ""} className="ml-2 rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:text-white disabled:opacity-50">{busy || `Watch all shown`}</button>}
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!d && !err && <Spinner />}
      {d && (rows.length === 0 ? <p className="text-xs text-gray-500">Nothing in the statuses shown.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left"><tr>
              <th className="py-1 pr-3 font-medium">Product</th><th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 pr-3 font-medium text-right">Market</th><th className="py-1 pr-3 font-medium text-right">vs MSRP</th>
              <th className="py-1 pr-3 font-medium text-right" title="This month's buy: units a month (1 MSRP's worth per leg with MSRP sizing) and spend">This month</th>
              <th className="py-1 pr-3 font-medium text-right" title="Wait: buy at or under. Watch for dip: a dip at or under this triggers">Buy at</th>
              <th className="py-1 pr-3 font-medium text-right">Rotates in</th><th className="py-1 pr-3 font-medium"></th>
            </tr></thead>
            <tbody>{rows.map((r) => {
              const s = STATUS[r.status];
              return [
                <tr key={r.product_id} className="border-t border-gray-800 align-top">
                  <td className="py-1.5 pr-3">
                    <span style={{ color: SEALED_COLORS[r.kind] ?? "#e5e7eb" }}>●</span>{" "}
                    <a href={r.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{r.set_name} · {SEALED_KIND_LABEL[r.kind] ?? r.name}</a>
                    <span className={`ml-1 rounded border px-1 text-[10px] ${r.class === "special" ? "border-fuchsia-800 text-fuchsia-300" : "border-sky-800 text-sky-300"}`}>{r.class}</span>
                    <div className="text-[10px] text-gray-500">month {r.age_months}{r.starts_in_months ? ` · next rule starts in ${r.starts_in_months} mo` : ""}</div>
                  </td>
                  <td className="py-1.5 pr-3"><span className={`rounded border px-1.5 text-[10px] ${s?.cls}`}>{s?.label ?? r.status}</span>
                    <button onClick={() => setOpen((o) => ({ ...o, [r.product_id]: !o[r.product_id] }))} className="ml-1 text-[10px] text-indigo-300 hover:underline">{r.legs.length} rule{r.legs.length > 1 ? "s" : ""}</button></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-200">{usd(r.price_cents)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${r.vs_msrp <= 1.1 ? "text-emerald-300" : r.vs_msrp <= 1.5 ? "text-amber-300" : "text-rose-300"}`}>{r.vs_msrp.toFixed(2)}×</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.spend_cents ? <>{usd(r.spend_cents)}<div className="text-[10px] text-gray-500">{r.units_per_month} units</div></> : <span className="text-gray-600">–</span>}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.target_cents ? usd(r.target_cents) : r.dip_trigger_cents ? <span className="text-sky-300">≤ {usd(r.dip_trigger_cents)}</span> : <span className="text-gray-600">–</span>}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{r.months_to_rotation != null ? `${r.months_to_rotation} mo` : "–"}</td>
                  <td className="py-1.5 whitespace-nowrap text-right">
                    {r.watched || done[r.product_id] === "ok" ? <span className="text-emerald-400">watched</span>
                      : <button onClick={() => watch(r)} className="rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:text-white">{done[r.product_id] === "…" ? "…" : "Watch"}</button>}
                    {done[r.product_id] && !["ok", "…"].includes(done[r.product_id]) && <div className="text-[10px] text-rose-400">{done[r.product_id]}</div>}
                  </td>
                </tr>,
                open[r.product_id] && (
                  <tr key={`${r.product_id}-l`} className="bg-gray-950/50">
                    <td colSpan={8} className="px-4 py-1.5">
                      <ul className="space-y-0.5 text-[11px] text-gray-400">{r.legs.map((l, i) => (
                        <li key={i}><span className={`mr-1 ${STATUS[l.status]?.cls.split(" ")[1] ?? ""}`}>{STATUS[l.status]?.label ?? l.status}</span>
                          <span className="text-gray-300">{l.strategy ? `${l.strategy} · ` : ""}{l.leg}</span>: {l.why}{l.units_per_month ? ` · ${l.units_per_month} units, ${usd(l.spend_cents ?? 0)}` : ""}</li>
                      ))}</ul>
                    </td>
                  </tr>
                ),
              ];
            })}</tbody>
          </table>
        </div>
      ))}
      {d && <p className="text-[11px] text-gray-500">{d.method}</p>}
    </section>
  );
}
