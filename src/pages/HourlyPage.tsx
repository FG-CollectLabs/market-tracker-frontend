import { useEffect, useState } from "react";
import { deleteWork, fetchWorkHourly, logWork, type WorkHourly, type WorkWeek } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { useSession } from "../lib/auth";

// Effective hourly: what an hour of the buying-and-grading work earns. Time
// comes from the timer in the nav bar (or minutes logged here); earnings are
// the expected profit of the copies won from that week's bids and, as they
// sell, the realized profit.

const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "-" : ""}$${Math.abs(c / 100).toFixed(0)}`);
const tone = (c?: number | null) => (c == null ? "text-gray-500" : c >= 3000 ? "text-emerald-300" : c >= 1500 ? "text-amber-300" : "text-rose-300");

function Stat({ label, value, sub, cls = "text-white" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function HourlyPage() {
  const session = useSession();
  const [d, setD] = useState<WorkHourly | null>(null);
  const [err, setErr] = useState("");
  const [weeks, setWeeks] = useState(12);
  const [f, setF] = useState({ activity: "bidding", minutes: "", day: "", note: "" });
  const load = () => fetchWorkHourly(weeks).then(setD).catch((e) => setErr(String(e)));
  useEffect(() => { if (session) load(); }, [weeks, session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return <p className="text-sm text-gray-400">Sign in to log time and see your hourly.</p>;
  const t: WorkWeek | undefined = d?.total;
  const inp = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Effective hourly</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          What an hour of buying and grading actually earns. Start the timer in the top bar when you sit down to bid (or pack, submit, list), stop it when you&apos;re done,
          or log minutes below. Profit is the copies won from that week&apos;s bids: expected (the EV after buying, grading and selling costs) now, realized as they sell.
        </p>
      </header>
      {err && <p className="text-sm text-rose-400">{err}</p>}
      {!d && !err && <Spinner />}
      {d && t && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label={`Expected hourly · ${weeks} weeks`} value={t.expected_hourly_cents != null ? `${usd(t.expected_hourly_cents)}/h` : "–"} cls={tone(t.expected_hourly_cents)}
              sub={`${usd(t.expected_profit_cents)} expected over ${t.hours} h`} />
            <Stat label="Realized hourly (sold copies only)" value={t.realized_hourly_cents != null ? `${usd(t.realized_hourly_cents)}/h` : "–"} cls={tone(t.realized_hourly_cents)}
              sub={`${t.sold} of ${t.wins} wins sold · ${usd(t.realized_profit_cents)}`} />
            <Stat label="Hours logged" value={`${t.hours}`} sub={Object.entries(t.hours_by_activity).map(([k, v]) => `${d.activities[k] ?? k} ${v}h`).join(" · ") || "none yet"} />
            <Stat label="Bids per hour" value={t.bids_per_hour != null ? `${t.bids_per_hour}` : "–"} sub={`${t.bids} bids · ${t.reviewed} listings reviewed`} />
            <Stat label="Expected profit per win" value={t.expected_known ? usd(t.expected_profit_cents / t.expected_known) : "–"} sub={`${t.wins} wins · ${usd(t.spent_cents)} spent`} />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Period</span>
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={inp}>
              <option value={4}>4 weeks</option><option value={12}>12 weeks</option><option value={26}>26 weeks</option><option value={52}>52 weeks</option>
            </select>
            <span className="text-gray-500">Colors: green ≥ $30/h, amber ≥ $15/h, red under.</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left"><tr>
                <th className="px-3 py-2 font-medium">Week of</th><th className="px-2 py-2 font-medium text-right">Hours</th>
                <th className="px-2 py-2 font-medium text-right">Reviewed</th><th className="px-2 py-2 font-medium text-right">Bids</th><th className="px-2 py-2 font-medium text-right">Wins</th>
                <th className="px-2 py-2 font-medium text-right">Spent</th><th className="px-2 py-2 font-medium text-right">Expected profit</th>
                <th className="px-2 py-2 font-medium text-right">Expected /h</th><th className="px-2 py-2 font-medium text-right">Sold</th>
                <th className="px-2 py-2 font-medium text-right">Realized</th><th className="px-2 py-2 font-medium text-right">Realized /h</th>
              </tr></thead>
              <tbody>{d.weeks.map((w) => (
                <tr key={w.week} className="border-t border-gray-800">
                  <td className="px-3 py-1.5 text-gray-300">{w.week}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" title={Object.entries(w.hours_by_activity).map(([k, v]) => `${d.activities[k] ?? k}: ${v}h`).join("\n")}>{w.hours || <span className="text-amber-300" title="No time logged this week">0</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.reviewed}</td><td className="px-2 py-1.5 text-right tabular-nums">{w.bids}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.wins}</td><td className="px-2 py-1.5 text-right tabular-nums">{usd(w.spent_cents)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(w.expected_profit_cents)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${tone(w.expected_hourly_cents)}`}>{w.expected_hourly_cents != null ? usd(w.expected_hourly_cents) : "–"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.sold}</td><td className="px-2 py-1.5 text-right tabular-nums">{w.sold ? usd(w.realized_profit_cents) : "–"}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${tone(w.realized_hourly_cents)}`}>{w.realized_hourly_cents != null ? usd(w.realized_hourly_cents) : "–"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">Log time by hand</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} className={inp}>
                {Object.entries(d.activities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} placeholder="minutes" className={`${inp} w-20`} />
              <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} className={inp} />
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="note (optional)" className={`${inp} w-56`} />
              <button onClick={async () => {
                setErr("");
                try { await logWork({ activity: f.activity, minutes: Number(f.minutes), day: f.day || undefined, note: f.note }); setF({ ...f, minutes: "", note: "" }); load(); }
                catch (e) { setErr(String(e)); }
              }} disabled={!(Number(f.minutes) > 0)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-40">Log</button>
            </div>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-white">Recent sessions</h2>
            <table className="w-full text-xs"><tbody>{d.recent.map((s) => (
              <tr key={s.id} className="border-t border-gray-800">
                <td className="py-1 pr-4 text-gray-400 whitespace-nowrap">{new Date(s.started_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td className="py-1 pr-4 text-gray-200">{d.activities[s.activity] ?? s.activity}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{s.minutes} min{s.running && <span className="text-emerald-300"> · running</span>}</td>
                <td className="py-1 pr-4 text-gray-500">{s.note}</td>
                <td className="py-1 text-right"><button onClick={async () => { await deleteWork(s.id); load(); }} className="text-gray-600 hover:text-rose-300">delete</button></td>
              </tr>
            ))}</tbody></table>
          </section>
          <p className="text-[11px] text-gray-500">{d.method}</p>
        </>
      )}
    </div>
  );
}
