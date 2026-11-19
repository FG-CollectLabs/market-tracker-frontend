import { useEffect, useMemo, useState } from "react";
import { fetchEbayUsage, type EbayUsage } from "../lib/api";
import { Spinner } from "./Spinner";

// eBay API usage: where the calls go (by job), per day and per hour, against
// eBay's own count of the daily limits, with plain tuning hints. Everything
// is counted in the tracker's processes; the pre-grader makes no eBay API
// calls (it only downloads listing photos from eBay's image CDN).

const COLORS: Record<string, string> = {
  card_search: "#60a5fa", auction_search: "#a78bfa", store_scan: "#f59e0b", seller_sweep: "#f97316", ending_scan: "#fb7185",
  pre_close: "#34d399", price_refresh: "#22d3ee", buyer_orders: "#e879f9", lot_scout: "#a3e635", usage_check: "#9ca3af", other: "#6b7280",
};
const color = (p: string) => COLORS[p] ?? "#9ca3af";

export default function EbayUsagePanel() {
  const [d, setD] = useState<EbayUsage | null>(null);
  const [err, setErr] = useState("");
  const [days, setDays] = useState(7);
  useEffect(() => { setD(null); fetchEbayUsage(days).then(setD).catch((e) => setErr(String(e))); }, [days]);

  const purposes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of d?.last_24h ?? []) if (r.api.startsWith("browse.")) m.set(r.purpose, (m.get(r.purpose) ?? 0) + r.calls);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [d]);
  const total24 = purposes.reduce((a, [, n]) => a + n, 0);
  const daysRows = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of d?.by_day ?? []) {
      const x = m.get(r.day) ?? new Map<string, number>();
      x.set(r.purpose, (x.get(r.purpose) ?? 0) + r.calls);
      m.set(r.day, x);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [d]);
  const dayMax = Math.max(1, ...daysRows.map(([, x]) => [...x.values()].reduce((a, b) => a + b, 0)), 5000);
  const browseLimit = d?.limits?.find((l) => l.api === "browse" && l.resource === "buy.browse");

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-white">eBay API usage</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-200">
          <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
        </select>
        {browseLimit && (
          <span className="text-xs text-gray-400">
            eBay says: <span className="text-gray-100 tabular-nums">{browseLimit.count.toLocaleString()}</span> of {browseLimit.limit.toLocaleString()} Browse calls used
            · {browseLimit.remaining.toLocaleString()} left · resets {new Date(browseLimit.reset).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        {d?.limits_error && <span className="text-xs text-amber-300">eBay limits unavailable: {d.limits_error}</span>}
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!d && !err && <Spinner />}
      {d && (
        <>
          <ul className="text-xs text-gray-300 space-y-0.5">{d.hints.map((h) => <li key={h}>• {h}</li>)}</ul>

          <div>
            <div className="text-xs text-gray-400 mb-1">Browse calls, last 24 hours, by job ({total24.toLocaleString()})</div>
            <div className="flex h-3 w-full overflow-hidden rounded bg-gray-800">
              {purposes.map(([p, n]) => <div key={p} title={`${d.labels[p] ?? p}: ${n}`} style={{ width: `${(n / Math.max(1, total24)) * 100}%`, background: color(p) }} />)}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
              {purposes.map(([p, n]) => <span key={p}><span style={{ color: color(p) }}>■</span> {d.labels[p] ?? p} <span className="tabular-nums text-gray-200">{n.toLocaleString()}</span></span>)}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-1">Browse calls per day (UTC); the line is eBay&apos;s default 5,000 a day</div>
            <div className="space-y-1">
              {daysRows.map(([day, x]) => {
                const n = [...x.values()].reduce((a, b) => a + b, 0);
                return (
                  <div key={day} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 text-gray-500 tabular-nums">{day}</span>
                    <div className="relative flex h-2.5 flex-1 overflow-hidden rounded bg-gray-800">
                      {[...x.entries()].map(([p, c]) => <div key={p} title={`${d.labels[p] ?? p}: ${c}`} style={{ width: `${(c / dayMax) * 100}%`, background: color(p) }} />)}
                      <div className="absolute top-0 bottom-0 w-px bg-rose-400/70" style={{ left: `${(5000 / dayMax) * 100}%` }} />
                    </div>
                    <span className="w-14 text-right text-gray-300 tabular-nums">{n.toLocaleString()}</span>
                  </div>
                );
              })}
              {daysRows.length === 0 && <p className="text-xs text-gray-500">No days recorded yet.</p>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left"><tr>
                <th className="py-1 pr-4 font-medium">Job</th><th className="py-1 pr-4 font-medium">API</th><th className="py-1 pr-4 font-medium">Process</th>
                <th className="py-1 pr-4 font-medium text-right">Calls 24h</th><th className="py-1 pr-4 font-medium text-right">Rate-limited</th><th className="py-1 pr-4 font-medium text-right">Errors</th>
              </tr></thead>
              <tbody>{d.last_24h.map((r) => (
                <tr key={`${r.purpose}|${r.api}|${r.process}`} className="border-t border-gray-800">
                  <td className="py-1 pr-4 text-gray-200"><span style={{ color: color(r.purpose) }}>■</span> {d.labels[r.purpose] ?? r.purpose}</td>
                  <td className="py-1 pr-4 text-gray-400">{r.api}</td><td className="py-1 pr-4 text-gray-400">{r.process}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                  <td className={`py-1 pr-4 text-right tabular-nums ${r.rate_limited ? "text-rose-300" : "text-gray-600"}`}>{r.rate_limited}</td>
                  <td className={`py-1 pr-4 text-right tabular-nums ${r.errors ? "text-amber-300" : "text-gray-600"}`}>{r.errors}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {d.limits && d.limits.length > 0 && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer">Every eBay application limit ({d.limits.length})</summary>
              <table className="mt-1 w-full"><tbody>{d.limits.map((l) => (
                <tr key={`${l.api}|${l.resource}|${l.time_window_s}`} className="border-t border-gray-800">
                  <td className="py-0.5 pr-4">{l.api}</td><td className="py-0.5 pr-4">{l.resource}</td>
                  <td className="py-0.5 pr-4 text-right tabular-nums">{l.count.toLocaleString()} / {l.limit.toLocaleString()}</td>
                  <td className="py-0.5 pr-4 text-gray-500">per {Math.round(l.time_window_s / 3600)}h</td>
                </tr>
              ))}</tbody></table>
            </details>
          )}
          <p className="text-[11px] text-gray-500">{d.note}{d.since ? ` Counting since ${new Date(d.since).toLocaleString()}.` : ""}</p>
        </>
      )}
    </section>
  );
}
