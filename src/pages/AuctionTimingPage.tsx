import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchInjectAnalytics, fetchInjectCandidates,
  type InjBreakdown, type InjectAnalytics, type InjectCandidate, type InjectWindow, type InjStat,
} from "../lib/api";
import { Spinner } from "../components/Spinner";

// Auction timing: when to put graded copies back on the market through the
// Fanatics Weekly Auction. Pooled weekly closes show what a crowded week
// costs, how long prices recover after a surge, and the seasons and tiers
// that close best; those become triggers, and every graded copy we own is
// scored against the auction we can still flash into.

const usd = (c?: number | null) => (c == null ? "–" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);
const ratio = (v?: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const signed = (v?: number | null) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const tone = (v?: number | null, base = 1) => (v == null ? "text-gray-500" : v >= base ? "text-emerald-300" : v >= base - 0.05 ? "text-gray-200" : "text-rose-300");

const SIGNAL: Record<InjectCandidate["signal"], { label: string; cls: string }> = {
  inject: { label: "inject", cls: "bg-emerald-900/60 text-emerald-200 border-emerald-800" },
  ebay: { label: "eBay instead", cls: "bg-sky-900/50 text-sky-200 border-sky-800" },
  wait: { label: "wait", cls: "bg-amber-900/40 text-amber-200 border-amber-800" },
  hold: { label: "hold", cls: "bg-gray-800 text-gray-300 border-gray-700" },
  no_data: { label: "no data", cls: "bg-gray-900 text-gray-500 border-gray-800" },
};

function Countdown({ w }: { w: InjectWindow }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(t); }, []);
  const left = new Date(w.cutoff_at).getTime() - now;
  const h = Math.max(0, Math.floor(left / 3600e3));
  const fmt = (s: string) => new Date(s).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div className="rounded-lg border border-emerald-900/60 bg-gray-900 p-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <div>
        <div className="text-xs text-gray-500">Flash from the vault by</div>
        <div className="text-lg font-semibold text-emerald-300">{fmt(w.cutoff_at)}</div>
        <div className="text-xs text-gray-400">{h >= 48 ? `${Math.floor(h / 24)} days` : `${h} hours`} left</div>
      </div>
      <div>
        <div className="text-xs text-gray-500">to close in the auction ending</div>
        <div className="text-lg font-semibold text-gray-100">{fmt(w.close_at)}</div>
        <div className="text-xs text-gray-400">{w.this_week ? "this Sunday" : "next Sunday: this week's cutoff has passed"}</div>
      </div>
      <p className="text-[11px] text-gray-500 max-w-2xl basis-full">{w.note}</p>
    </div>
  );
}

// a horizontal bar per bucket: median close as % of the eBay reference,
// middle half as a lighter band, 100% marked
function Bars({ b, overall }: { b: InjBreakdown; overall: number | null }) {
  const lo = 0.5, hi = 1.4;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
      <div>
        <div className="text-sm font-medium text-gray-200">{b.label}</div>
        <div className="text-[11px] text-gray-500">{b.why}</div>
      </div>
      {b.rows.length === 0 ? <div className="text-xs text-gray-600">No data yet.</div> : (
        <div className="space-y-1.5">
          {b.rows.map((r: InjStat) => (
            <div key={r.key} className="grid grid-cols-[minmax(7rem,11rem)_1fr_5.5rem] items-center gap-2 text-xs">
              <span className={`truncate ${r.thin ? "text-gray-600" : "text-gray-300"}`} title={r.label}>{r.label}</span>
              <div className="relative h-4 rounded bg-gray-950">
                <div className="absolute inset-y-0 w-px bg-gray-500" style={{ left: x(1) }} title="= eBay" />
                {overall != null && <div className="absolute inset-y-0 w-px bg-indigo-500/70" style={{ left: x(overall) }} title="overall median" />}
                {r.p25 != null && r.p75 != null && (
                  <div className="absolute inset-y-1 rounded bg-emerald-500/20" style={{ left: x(r.p25), width: `calc(${x(r.p75)} - ${x(r.p25)})` }} />
                )}
                {r.median != null && <div className={`absolute top-0.5 bottom-0.5 w-1.5 -ml-[3px] rounded ${r.thin ? "bg-gray-500" : "bg-emerald-400"}`} style={{ left: x(r.median) }} />}
              </div>
              <span className="text-right tabular-nums" title={`${r.weeks} card-weeks, ${r.copies} copies · middle half ${ratio(r.p25)}–${ratio(r.p75)}`}>
                <span className={r.thin ? "text-gray-500" : tone(r.median, overall ?? 1)}>{ratio(r.median)}</span>
                <span className="text-gray-600 ml-1">{r.weeks}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Candidates() {
  const [d, setD] = useState<{ candidates: InjectCandidate[]; count: number } | null>(null);
  const [err, setErr] = useState("");
  const [show, setShow] = useState<"all" | InjectCandidate["signal"]>("all");
  useEffect(() => { fetchInjectCandidates().then(setD).catch((e) => setErr(String(e))); }, []);
  const rows = useMemo(() => (d?.candidates ?? []).filter((c) => show === "all" || c.signal === show), [d, show]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of d?.candidates ?? []) m[c.signal] = (m[c.signal] ?? 0) + c.quantity;
    return m;
  }, [d]);
  const th = "px-2 py-1 font-medium text-left", thr = "px-2 py-1 font-medium text-right";
  const td = "px-2 py-1", tdr = "px-2 py-1 text-right tabular-nums";
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-200">Our graded copies</span>
        <span className="text-xs text-gray-500">from the owned-cards feed; the admin app gets the same scoring for its inventory</span>
        <span className="ml-auto flex flex-wrap gap-1 text-xs">
          {(["all", "inject", "ebay", "wait", "hold", "no_data"] as const).map((s) => (
            <button key={s} onClick={() => setShow(s)} className={`rounded px-2 py-0.5 ${show === s ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {s === "all" ? "all" : SIGNAL[s].label} {s !== "all" && counts[s] ? <span className="text-gray-500">{counts[s]}</span> : null}
            </button>
          ))}
        </span>
      </div>
      {err && <div className="text-sm text-amber-300 break-all">{err.includes("401") || err.includes("403") ? "Sign in to see our inventory." : err}</div>}
      {!d && !err ? <Spinner /> : d && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className={th}>Card</th><th className={th}>Grade</th><th className={thr}>Qty</th><th className={th}>Signal</th>
                <th className={thr} title="Fanatics weekly copies of this card + grade already in the auction a flash lands in">In that auction</th>
                <th className={thr} title="Copies a week, last 12 weeks">Usual</th>
                <th className={thr} title="eBay median all-in, last 28 days">eBay</th>
                <th className={thr} title="eBay now vs 8 weeks ago">Trend</th>
                <th className={thr} title="Expected all-in close with ours added (eBay × the median ratio for that many copies)">Expected close</th>
                <th className={thr} title="Hammer (expected ÷ 1.2), 0% seller fee as FanCash">Net FanCash</th>
                <th className={thr} title="Hammer less the cash seller fee">Net cash</th>
                <th className={thr} title="eBay median less eBay fees and shipping">Net eBay</th>
                <th className={th}>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.display_key}|${c.grade_key}|${c.cert ?? i}`} className="border-t border-gray-800 align-top">
                  <td className={td}>
                    <Link to={`/cards/${encodeURIComponent(c.display_key)}`} className="text-gray-100 hover:text-indigo-300">{c.name || c.display_key}</Link>
                    <div className="text-[10px] text-gray-600">{c.set_code}{c.cert ? ` · cert ${c.cert}` : ""}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-gray-300`}>{c.grade_key.toUpperCase()}</td>
                  <td className={tdr}>{c.quantity}</td>
                  <td className={td}><span className={`rounded border px-1.5 py-0.5 whitespace-nowrap ${SIGNAL[c.signal].cls}`}>{SIGNAL[c.signal].label}</span></td>
                  <td className={tdr}>{c.live_copies}<span className="text-gray-600"> · next {c.next_live_copies}</span></td>
                  <td className={tdr}>{c.usual_per_week?.toFixed(1) ?? "–"}{c.weeks_since_surge > 0 && <div className="text-[10px] text-amber-300">surge {c.weeks_since_surge}w ago</div>}</td>
                  <td className={tdr}>{usd(c.ebay_ref_cents ?? c.auction_ref_cents)}</td>
                  <td className={`${tdr} ${c.trend == null ? "text-gray-600" : c.trend >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signed(c.trend)}</td>
                  <td className={tdr}>{usd(c.expected_all_in_cents)}<div className="text-[10px] text-gray-500">{c.expected_ratio != null ? `${ratio(c.expected_ratio)} of eBay` : ""}</div></td>
                  <td className={`${tdr} text-gray-100`}>{usd(c.net_fancash_cents)}</td>
                  <td className={tdr}>{usd(c.net_cash_cents)}</td>
                  <td className={tdr}>{usd(c.net_ebay_cents)}</td>
                  <td className={`${td} text-gray-400 max-w-md`}>{c.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-sm text-gray-500 py-2">Nothing here.</div>}
        </div>
      )}
    </section>
  );
}

export default function AuctionTimingPage() {
  const [a, setA] = useState<InjectAnalytics | null>(null);
  const [weeks, setWeeks] = useState(104);
  const [err, setErr] = useState("");
  useEffect(() => { setA(null); fetchInjectAnalytics(weeks).then(setA).catch((e) => setErr(String(e))); }, [weeks]);
  const overall = a?.overall.median ?? null;
  return (
    <div className="w-full space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Auction timing</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          When to put graded copies back on the market through the Fanatics Weekly Auction, whether we graded them or bought them in a surge.
          Every weekly close of a card + grade is compared with the eBay market going in; pooled across cards, that shows what a crowded week
          costs and how long prices take to recover, and turns into triggers for each copy we hold.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400 break-all">{err}</div>}
      {!a ? <Spinner /> : (
        <>
          <Countdown w={a.window} />

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="text-xs text-gray-500">Weekly closes analysed</div>
              <div className="text-xl font-semibold text-gray-100 tabular-nums">{a.observations.toLocaleString()}</div>
              <div className="text-[11px] text-gray-500">{a.series.toLocaleString()} card + grade pairs · {a.with_ebay.toLocaleString()} with an eBay reference</div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="text-xs text-gray-500">Median close vs eBay (all-in)</div>
              <div className={`text-xl font-semibold tabular-nums ${tone(overall)}`}>{ratio(overall)}</div>
              <div className="text-[11px] text-gray-500">middle half {ratio(a.overall.p25)}–{ratio(a.overall.p75)} · vs its own last 8 weeks {ratio(a.overall_own.median)}</div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="text-xs text-gray-500">Doubling the copies in a week</div>
              <div className={`text-xl font-semibold tabular-nums ${a.doubling_effect != null && a.doubling_effect < 0 ? "text-rose-300" : "text-gray-100"}`}>{signed(a.doubling_effect)}</div>
              <div className="text-[11px] text-gray-500">moves the median close, within the same card + grade</div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 flex flex-col">
              <div className="text-xs text-gray-500">History</div>
              <div className="flex gap-1 mt-1">
                {[52, 104, 156].map((w) => (
                  <button key={w} onClick={() => setWeeks(w)} className={`rounded px-2 py-0.5 text-xs ${weeks === w ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{w / 52} yr</button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-indigo-900/60 bg-gray-900 p-4 space-y-2">
            <div className="text-sm font-medium text-indigo-200">Triggers from the data</div>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-200">
              {a.triggers.map((t) => <li key={t.key}>{t.rule}</li>)}
            </ol>
            <p className="text-[11px] text-gray-500">Plus: the expected close (eBay × the median ratio for that many copies) has to net more as FanCash than eBay would after its fees, and beat what the copy cost when we know it.</p>
          </section>

          <Candidates />

          <section className="grid gap-3 lg:grid-cols-2">
            {a.breakdowns.map((b) => <Bars key={b.key} b={b} overall={overall} />)}
          </section>
          <p className="text-[11px] text-gray-500 max-w-5xl">
            Bars: median close as a share of the eBay median of the 4 weeks before (dot), middle half (band), 100% = eBay (grey line), the overall median (blue line).
            Grey rows have under 8 weeks behind them. {a.method}
          </p>
        </>
      )}
    </div>
  );
}
