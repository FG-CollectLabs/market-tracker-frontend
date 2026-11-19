import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWorkCurrent, startWork, stopWork, type WorkSession } from "../lib/api";
import { useSession } from "../lib/auth";

// The nav bar's work timer: start it when you sit down to bid (or pack,
// submit, list), stop it when you're done; the Effective hourly page turns
// the time into $ per hour. An open timer counts at most 6 hours.

const ACTS: [string, string][] = [
  ["bidding", "Bidding"], ["reviewing", "Reviewing"], ["grading_prep", "Grading prep"], ["listing", "Listing"], ["shipping", "Shipping"], ["admin", "Admin"], ["other", "Other"],
];

function clock(ms: number) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}` : `${m}m`;
}

export default function WorkTimer() {
  const session = useSession();
  const [cur, setCur] = useState<WorkSession | null>(null);
  const [act, setAct] = useState("bidding");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (session) fetchWorkCurrent().then((r) => setCur(r.session)).catch(() => {}); }, [session]);
  useEffect(() => {
    if (!cur) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [cur]);
  if (!session) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      if (cur) { await stopWork(); setCur(null); } else { const r = await startWork(act); setCur(r.session); setNow(Date.now()); }
    } catch { /* shown nowhere: the page itself reports errors */ } finally { setBusy(false); }
  };
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs">
      {!cur && (
        <select value={act} onChange={(e) => setAct(e.target.value)} className="rounded border border-gray-800 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-400">
          {ACTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      <button onClick={toggle} disabled={busy} title={cur ? "Stop the work timer" : "Start the work timer (counts toward Effective hourly)"}
        className={`rounded px-2 py-0.5 tabular-nums ${cur ? "bg-emerald-700 text-white" : "border border-gray-700 text-gray-300 hover:text-white"}`}>
        {cur ? `■ ${ACTS.find(([k]) => k === cur.activity)?.[1] ?? cur.activity} ${clock(now - new Date(cur.started_at).getTime())}` : "▶ Timer"}
      </button>
      <Link to="/hourly" className="text-gray-500 hover:text-gray-300" title="Effective hourly">$/h</Link>
    </span>
  );
}
