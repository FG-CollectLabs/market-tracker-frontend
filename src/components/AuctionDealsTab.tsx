import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuctionDeals, type AuctionDeal, type EdgeCalc } from "../lib/api";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import { Spinner, ErrorMsg } from "./Spinner";

// This week's auctions: every card + grade with auctions closing in the next
// 7 days, most seller pressure first. Built to spot slabs being dumped and
// bid well under what they should go for.

const GRADE_LABEL: Record<string, string> = {
  raw: "Raw",
  "psa-10": "PSA 10",
  "psa-9": "PSA 9",
  "cgc-10": "CGC 10",
  "cgc-10-pristine": "CGC Pristine",
};

const SOURCE_LABEL: Record<string, string> = { fanatics: "Fanatics", ebay: "eBay" };

type SortKey = "pressure" | "edge" | "live";

function pct(x: number | undefined, digits = 0): string {
  if (x == null) return "—";
  return `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

function endsIn(iso?: string): string {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3600e3;
  if (h < 0) return "ended";
  if (h < 48) return `ends in ${Math.round(h)}h`;
  return `ends in ${Math.round(h / 24)}d`;
}

function pressureStyle(p?: number): string {
  if (p == null) return "text-gray-500";
  if (p >= 3) return "text-red-400";
  if (p >= 2) return "text-amber-300";
  return "text-gray-300";
}

// Twelve weeks of Fanatics auction closes: bar height = auctions closed,
// colour = average sale vs the grading breakeven (green under, red over).
function WeekBars({ d }: { d: AuctionDeal }) {
  const most = Math.max(1, ...d.weeks.map((w) => w.closed));
  return (
    <div className="flex items-end gap-px h-8" title="Fanatics auctions closed per week, last 12 weeks (colour: average sale vs grading breakeven)">
      {d.weeks.map((w) => {
        const vb = w.vs_breakeven;
        const color = w.closed === 0 ? "bg-gray-800" : vb == null ? "bg-gray-500" : vb < 0 ? "bg-green-500/80" : vb < 0.25 ? "bg-amber-400/80" : "bg-red-400/80";
        return (
          <div key={w.week} className={`w-1.5 rounded-sm ${color}`} style={{ height: `${Math.max(8, (w.closed / most) * 100)}%` }}
            title={`${w.week}: ${w.closed} closed${w.avg_cents != null ? `, avg ${formatCents(w.avg_cents)}` : ""}${vb != null ? ` (${pct(vb)} vs breakeven)` : ""}`} />
        );
      })}
    </div>
  );
}

const CHANNEL: Record<string, string> = { ebay: "eBay", fanatics_buy_now: "Fanatics Buy Now", market: "market value" };

// The edge in one number, with every input on hover.
function EdgeCell({ e }: { e?: EdgeCalc }) {
  if (!e || e.edge_pct == null) return <span className="text-gray-700" title="Not enough auction or resale data">—</span>;
  const v = e.edge_pct;
  const color = v >= 0.3 ? "text-green-400" : v >= 0.1 ? "text-green-300/80" : v >= 0 ? "text-gray-300" : "text-red-400";
  const conf = e.confidence === "high" ? "" : e.confidence === "medium" ? " ·" : " ··";
  return (
    <span title={e.why.join("\n")} className="cursor-help">
      <span className={`font-semibold tabular-nums ${color}`}>{v >= 0 ? "+" : ""}{Math.round(v * 100)}%</span>
      <span className="text-gray-500" title={`${e.confidence} confidence`}>{conf}</span>
      {e.steal_pct != null && (
        <div className={`text-[10px] tabular-nums ${e.steal_pct > 0.05 ? "text-amber-300" : "text-gray-500"}`}>
          steal {Math.round(e.steal_pct * 100)}%{e.method === "grade_model" ? " (grade)" : ""}
        </div>
      )}
    </span>
  );
}

function EdgeWorking({ e }: { e: EdgeCalc }) {
  return (
    <div>
      <div className="text-gray-200 font-medium mb-1">How the edge was worked out <span className="text-gray-500 font-normal">({e.confidence} confidence)</span></div>
      <ol className="list-decimal ml-4 space-y-0.5">{e.why.map((w, i) => <li key={i}>{w}</li>)}</ol>
    </div>
  );
}

function Detail({ d }: { d: AuctionDeal }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 text-xs text-gray-400 p-3 bg-gray-950/60">
      {d.edge_calc && <div className="md:col-span-3"><EdgeWorking e={d.edge_calc} /></div>}
      <div>
        <div className="text-gray-200 font-medium mb-1">Fanatics auctions by week</div>
        <table className="w-full tabular-nums">
          <thead className="text-gray-500">
            <tr><th className="text-left font-normal">Week of</th><th className="text-right font-normal">Closed</th><th className="text-right font-normal">Avg all-in</th><th className="text-right font-normal">vs breakeven</th></tr>
          </thead>
          <tbody>
            {[...d.weeks].reverse().map((w) => (
              <tr key={w.week} className={w.closed ? "text-gray-300" : "text-gray-600"}>
                <td>{w.week}</td>
                <td className="text-right">{w.closed}</td>
                <td className="text-right">{w.avg_cents != null ? formatCents(w.avg_cents) : "—"}</td>
                <td className={`text-right ${w.vs_breakeven == null ? "" : w.vs_breakeven < 0 ? "text-green-400" : "text-gray-300"}`}>{pct(w.vs_breakeven)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 text-gray-500">
          Sells {d.usual_per_week.toFixed(1)} a week across channels ({(d.usual_fanatics_auctions_per_week ?? 0).toFixed(1)} Fanatics auctions); {d.live_auctions} closing this week, {d.next_week_auctions} listed for next week.
        </div>
      </div>
      <div>
        <div className="text-gray-200 font-medium mb-1">Launch anchor</div>
        {d.launch ? (
          <>
            <div>
              First {d.launch.sales} sold for {formatCents(d.launch.avg_cents)} on average (from {d.launch.first_sold_at.slice(0, 10)}, month {d.launch.at_month.toFixed(1)}).
              {d.launch.now_cents != null && <> Carried along the release curve to today: <span className="text-gray-200">{formatCents(d.launch.now_cents)}</span>.</>}
            </div>
            {d.launch.after.length > 0 && (
              <table className="mt-1 w-full tabular-nums">
                <tbody>
                  {d.launch.after.map((p) => (
                    <tr key={p.months_after_first}>
                      <td>+{p.months_after_first} months ({p.date})</td>
                      <td className="text-right text-gray-200">{formatCents(p.expected_cents)}{p.extrapolated ? "*" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.launch.note && <div className="mt-1 text-amber-300/80">{d.launch.note}</div>}
          </>
        ) : (
          <div>No sales of this slab yet.</div>
        )}
        {d.advice && (
          <div className="mt-2">
            <span className={`px-1 rounded text-[10px] ${d.advice.signal === "hold" ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-300"}`}>
              {d.advice.signal === "hold" ? `hold ${d.advice.hold_months} mo` : "sell now"}
            </span>{" "}
            {d.advice.reason} <span className="text-gray-500">({d.projection_confidence} confidence)</span>
          </div>
        )}
      </div>
      <div>
        <div className="text-gray-200 font-medium mb-1">Cheapest live auctions</div>
        {d.listings?.length ? (
          <ul className="space-y-1">
            {d.listings.map((l, i) => (
              <li key={i}>
                <span className="text-gray-200 tabular-nums">{formatCents(l.price_cents)}</span> bid · {endsIn(l.ends_at)}{" "}
                {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">{l.title}</a> : l.title}
              </li>
            ))}
          </ul>
        ) : (
          <div>None listed with details.</div>
        )}
        {d.value?.basis && <div className="mt-2 text-gray-500">Value: {d.value.basis.note}.</div>}
        {d.search_title && <div className="mt-1 font-mono text-[10px] text-gray-600 select-all">{d.search_title}</div>}
        {d.flags.length > 0 && <ul className="mt-2 space-y-0.5 text-amber-300/90">{d.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      </div>
    </div>
  );
}

export default function AuctionDealsTab({ lang }: { lang: "" | "en" | "ja" }) {
  const [rows, setRows] = useState<AuctionDeal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("pressure");
  const [dumpsOnly, setDumpsOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [margin, setMargin] = useState<number | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    fetchAuctionDeals({ lang: lang || undefined, limit: 500 })
      .then((r) => {
        setRows(r.auctions);
        setMargin(r.settings.target_margin);
      })
      .catch((e: Error) => setError(e.message));
  }, [lang]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const xs = rows.filter((d) => !dumpsOnly || (d.pressure ?? 0) >= 2);
    const key = (d: AuctionDeal) => (sort === "pressure" ? d.pressure ?? 0 : sort === "edge" ? d.edge_calc?.adjusted_pct ?? -9 : d.live_auctions);
    return [...xs].sort((a, b) => key(b) - key(a));
  }, [rows, sort, dumpsOnly]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Every slab with auctions closing in the next 7 days. <span className="text-gray-300">Pressure</span> is this week's auctions against how many usually sell in a week
        across every channel (what the market absorbs): 3× and up is a dump. <span className="text-gray-300">Edge</span> is the expected profit buying at this week's
        projected close (the card's usual auction price, adjusted for this week's supply by its own past heavy weeks) and reselling through the better of eBay or
        Fanatics Buy Now after fees; <span className="text-gray-300">steal</span> is how far under its usual close that projection sits. Hover an edge for every
        input; dots mean lower confidence ("Biggest edge" sorts by the edge weighted by confidence, so thin data can't top the list). <span className="text-gray-300">Snipe</span> is the most to pay and still clear your {margin != null ? `${Math.round(margin * 100)}%` : "target"} margin on that resale.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {([["pressure", "Most pressure"], ["edge", "Biggest edge"], ["live", "Most auctions"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-3 py-1 ${sort === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-400">
          <input type="checkbox" checked={dumpsOnly} onChange={(e) => setDumpsOnly(e.target.checked)} className="accent-indigo-500" />
          Heavy or dumping only (2×+)
        </label>
        {rows && <span className="text-gray-500">{shown.length} of {rows.length}</span>}
      </div>
      {error && <ErrorMsg msg={error} />}
      {!rows && !error && <Spinner />}
      {rows && shown.length === 0 && <p className="text-sm text-gray-500">No auctions match.</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-left px-3 py-2 font-medium">Live this week</th>
                <th className="text-right px-3 py-2 font-medium" title="Auctions closing this week vs sales a week across every channel (last 12 weeks)">Pressure</th>
                <th className="px-3 py-2 font-medium" title="Fanatics auctions closed per week, last 12 weeks">12 weeks</th>
                <th className="text-right px-3 py-2 font-medium" title="Expected profit buying at the projected close and reselling at the best channel after fees; steal = how far under its usual close. Hover a value for the working.">Edge</th>
                <th className="text-right px-3 py-2 font-medium" title="What you'd net reselling through the better of eBay and Fanatics Buy Now; projected close under it">Resale (net)</th>
                <th className="text-right px-3 py-2 font-medium" title="Max hammer bid that clears your target margin (all-in under it)">Snipe ≤</th>
                <th className="text-right px-3 py-2 font-medium" title="Grading EV: what this grade must sell for to cover making it at the public gem rate">Breakeven</th>
                <th className="text-right px-3 py-2 font-medium" title="First 10 sales' average, carried along the release curve to today">Launch → now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {shown.map((d) => {
                const id = `${d.display_key}|${d.grade}`;
                const first = d.sources.map((s) => s.first_ends_at).filter(Boolean).sort()[0];
                return (
                  <Fragment key={id}>
                    <tr className="align-top hover:bg-gray-900/40 cursor-pointer" onClick={() => setOpen(open === id ? null : id)}>
                      <td className="pl-3 py-2 w-12">
                        {d.image_url ? (
                          <img src={cardThumb(d.image_url)} alt={d.name} loading="lazy" className="w-10 h-14 object-cover rounded-sm bg-gray-800" />
                        ) : (
                          <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to={`/cards/${encodeURIComponent(d.display_key)}`} onClick={(e) => e.stopPropagation()} className="text-gray-100 hover:text-indigo-300">{d.name}</Link>
                        <div className="text-[11px] text-gray-500">
                          <span className="font-mono">{d.set_code.replace(/^jp-/, "JP ").toUpperCase()}</span>
                          <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{GRADE_LABEL[d.grade] ?? d.grade}</span>
                          {d.months_since_release != null && <span className="ml-1.5">month {d.months_since_release}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                        {d.sources.map((s) => (
                          <div key={s.source}>
                            <span className="text-gray-200">{s.auctions}</span> on {SOURCE_LABEL[s.source] ?? s.source}
                            {s.bids > 0 && <> · {s.bids} bids</>}
                            {s.high_bid_cents != null && <> · high {formatCents(s.high_bid_cents)}</>}
                          </div>
                        ))}
                        {first && <div className="text-gray-500">first {endsIn(first)}</div>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${pressureStyle(d.pressure)}`}>
                        {d.pressure != null ? `${d.pressure.toFixed(1)}×` : "—"}
                        <div className="text-[10px] font-normal text-gray-500" title="Sales a week, all channels (Fanatics auctions alone in brackets)">
                          sells {d.usual_per_week.toFixed(1)}/wk{d.usual_fanatics_auctions_per_week != null ? ` (${d.usual_fanatics_auctions_per_week.toFixed(1)})` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2"><WeekBars d={d} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        <EdgeCell e={d.edge_calc} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        {formatCents(d.our_value_cents)}
                        {d.edge_calc && <div className="text-[10px] text-gray-500">{CHANNEL[d.edge_calc.resale.channel]}</div>}
                        {d.expected_all_in_cents != null && (
                          <div className="text-[10px] text-gray-500">close ~{formatCents(d.expected_all_in_cents)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-400 font-medium">
                        {formatCents(d.snipe_hammer_cents)}
                        <div className="text-[10px] font-normal text-gray-500">{formatCents(d.snipe_all_in_cents)} all-in</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        {formatCents(d.breakeven_cents)}
                        {d.gem_rate_source && <div className="text-[10px] text-gray-500">{d.gem_rate_source} pop</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300 whitespace-nowrap">
                        {d.launch ? (
                          <>
                            {formatCents(d.launch.avg_cents)} → {formatCents(d.launch.now_cents)}
                            <div className="text-[10px] text-gray-500">first {d.launch.sales} sales</div>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                    {open === id && (
                      <tr>
                        <td colSpan={10} className="p-0"><Detail d={d} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
