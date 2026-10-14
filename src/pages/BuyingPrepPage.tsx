import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteBidPlan, fetchBidPlans, saveBidPlan, type BidPlan, type BidStatus } from "../lib/api";
import { useSession } from "../lib/auth";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import { MarketLinkRow } from "../components/MarketLinks";
import { Spinner, ErrorMsg } from "../components/Spinner";

// Buying prep: the Fanatics weekly auctions you've decided to bid on for one
// Sunday, with everything needed on the day in one place. Add cards from
// Deals → This week's auctions.

const GRADE: Record<string, string> = { "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine", raw: "Raw" };
const STATUSES: BidStatus[] = ["planned", "bid", "won", "lost", "skipped"];
const STATUS_STYLE: Record<BidStatus, string> = {
  planned: "text-gray-200", bid: "text-sky-300", won: "text-green-400", lost: "text-red-400", skipped: "text-gray-500",
};

function shiftDate(d: string, days: number): string {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const dollars = (c?: number) => (c == null ? "" : String(Math.floor(c / 100)));

function PlanRow({ p, premium, onChange, onRemove }: { p: BidPlan; premium: number; onChange: () => void; onRemove: () => void }) {
  const d = p.deal;
  const [max, setMax] = useState(dollars(p.max_bid_cents));
  const [note, setNote] = useState(p.note ?? "");
  const [won, setWon] = useState(dollars(p.won_cents));
  const [open, setOpen] = useState(false);
  const save = (patch: Parameters<typeof saveBidPlan>[0]) => saveBidPlan(patch).then(onChange).catch(() => undefined);
  const base = { display_key: p.display_key, grade: p.grade, auction_date: p.auction_date };
  const maxNum = Math.floor(Number(max) || 0);
  const closes = (d?.weeks ?? []).filter((w) => w.closed > 0);
  return (
    <Fragment>
      <tr className="align-top">
        <td className="py-2 pr-2 w-12">
          {d?.image_url ? <img src={cardThumb(d.image_url)} alt="" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
        </td>
        <td className="py-2 pr-3">
          <Link to={`/cards/${encodeURIComponent(p.display_key)}`} className="text-gray-100 hover:text-indigo-300">{d?.name ?? p.display_key}</Link>
          <div className="text-[11px] text-gray-500">
            <span className="font-mono">{(d?.set_code ?? "").replace(/^jp-/, "JP ").toUpperCase()}</span>
            <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{GRADE[p.grade] ?? p.grade}</span>
          </div>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-indigo-300 hover:underline print:hidden">{open ? "hide" : "history & links"}</button>
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title="The most recent week it closed on Fanatics">
          {p.last_week ? (
            <>
              <div className="text-gray-200">{formatCents(p.last_week.avg_hammer_cents)} <span className="text-gray-500">avg bid</span></div>
              <div className="text-gray-500">{p.last_week.closed} closed · {formatCents(p.last_week.avg_all_in_cents)} all-in</div>
              <div className="text-gray-600">week of {p.last_week.week}</div>
            </>
          ) : <span className="text-gray-600">no closes in 12 weeks</span>}
        </td>
        <td className="py-2 pr-3 text-xs whitespace-nowrap">
          <div className="text-gray-200 tabular-nums">{d?.live_auctions ?? 0} closing <span className="text-gray-500">({d?.usual_fanatics_auctions_per_week?.toFixed(1) ?? "0"}/wk usual)</span></div>
          {(d?.listings ?? []).map((l, i) => (
            <div key={i}>
              {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">auction {i + 1} ↗</a> : `auction ${i + 1}`}
              <span className="text-gray-500"> bid {formatCents(l.price_cents)}</span>
            </div>
          ))}
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title={d?.edge_calc?.why.join("\n")}>
          <div className="text-green-400 font-medium">{formatCents(d?.snipe_hammer_cents)}</div>
          {d?.edge_calc?.edge_pct != null && <div className="text-gray-500">edge {Math.round(d.edge_calc.edge_pct * 100)}% · {d.edge_calc.confidence}</div>}
          {d?.our_value_cents != null && <div className="text-gray-500">resale {formatCents(d.our_value_cents)}</div>}
        </td>
        <td className="py-2 pr-3 text-xs">
          <label className="flex items-center gap-1 text-gray-400">$
            <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)}
              onBlur={() => maxNum * 100 !== (p.max_bid_cents ?? -1) && save({ ...base, max_bid_cents: maxNum * 100 })}
              className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 font-mono print:border-0" />
          </label>
          {maxNum > 0 && <div className="text-gray-500 tabular-nums mt-0.5">{formatCents(Math.round(maxNum * 100 * (1 + premium)))} all-in</div>}
        </td>
        <td className="py-2 pr-3 text-xs">
          <select value={p.status} onChange={(e) => save({ ...base, status: e.target.value as BidStatus })}
            className={`bg-gray-900 border border-gray-700 rounded px-1 py-0.5 ${STATUS_STYLE[p.status]}`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {p.status === "won" && (
            <label className="flex items-center gap-1 mt-1 text-gray-400">won at $
              <input type="number" min={0} step={1} value={won} onChange={(e) => setWon(e.target.value)}
                onBlur={() => save({ ...base, won_cents: Math.floor(Number(won) || 0) * 100 })}
                className="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-100 font-mono" />
            </label>
          )}
        </td>
        <td className="py-2 pr-2 text-xs">
          <input value={note} placeholder="note" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.note ?? "") && save({ ...base, note })}
            className="w-40 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 print:border-0" />
          <button onClick={onRemove} className="ml-2 text-gray-500 hover:text-red-400 print:hidden" title="Remove from this Sunday">✕</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={7} className="pb-3 text-xs text-gray-400 space-y-2">
            <MarketLinkRow links={d?.links} />
            {closes.length > 0 ? (
              <table className="tabular-nums">
                <thead className="text-gray-500"><tr><th className="text-left font-normal pr-4">Week of</th><th className="text-right font-normal pr-4">Closed</th><th className="text-right font-normal pr-4">Avg bid</th><th className="text-right font-normal">Avg all-in</th></tr></thead>
                <tbody>
                  {[...closes].reverse().map((w) => (
                    <tr key={w.week}>
                      <td className="pr-4">{w.week}</td>
                      <td className="text-right pr-4">{w.closed}</td>
                      <td className="text-right pr-4 text-gray-200">{w.avg_cents != null ? formatCents(Math.round(w.avg_cents / (1 + premium))) : "—"}</td>
                      <td className="text-right">{w.avg_cents != null ? formatCents(w.avg_cents) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div>No Fanatics auction closes in the last 12 weeks.</div>}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function BuyingPrepPage() {
  const session = useSession();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchBidPlans>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    fetchBidPlans(date).then((r) => { setData(r); setError(null); }).catch((e: Error) => setError(e.message));
  }, [session, date, tick]);
  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your buying prep.</p>;
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const day = data.auction_date;
  const refresh = () => setTick((t) => t + 1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Buying prep</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Fanatics weekly auctions you've decided to bid on, closing Sunday {day}. Add cards from Deals → This week's auctions (open a row, "Add to Sunday's bids").
            Max bids are whole dollars: Fanatics bids go in $1 steps. Suggested max clears your target margin on the resale; hover it for the working.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm print:hidden">
          <button onClick={() => setDate(shiftDate(day, -7))} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">← prev Sunday</button>
          <span className="text-gray-200 font-mono">{day}</span>
          <button onClick={() => setDate(shiftDate(day, 7))} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">next Sunday →</button>
          {day !== data.next_auction_date && <button onClick={() => setDate(undefined)} className="px-2 py-1 rounded border border-gray-700 text-indigo-300">this Sunday</button>}
          <button onClick={() => window.print()} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500">Print</button>
        </div>
      </div>
      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-100">Fanatics weekly auctions · {data.plans.length} card{data.plans.length === 1 ? "" : "s"}</h2>
          <div className="text-xs text-gray-400 tabular-nums">
            If every max hits: <span className="text-gray-100">{formatCents(data.totals.max_bids_cents)}</span> in bids,{" "}
            <span className="text-gray-100">{formatCents(data.totals.max_all_in_cents)}</span> all-in ({Math.round(data.buyers_premium_pct * 100)}% buyer's premium)
          </div>
        </div>
        {data.plans.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing on this Sunday's list yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left font-medium py-1" colSpan={2}>Card</th>
                  <th className="text-left font-medium py-1 pr-3" title="The most recent week it closed: average winning bid, copies, all-in">Last week</th>
                  <th className="text-left font-medium py-1 pr-3">Up this week</th>
                  <th className="text-left font-medium py-1 pr-3" title="Most to bid and still clear your target margin reselling at the best channel">Suggested max</th>
                  <th className="text-left font-medium py-1 pr-3">Your max</th>
                  <th className="text-left font-medium py-1 pr-3">Status</th>
                  <th className="text-left font-medium py-1">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70">
                {data.plans.map((p) => (
                  <PlanRow key={p.id + p.updated_at} p={p} premium={data.buyers_premium_pct} onChange={refresh}
                    onRemove={() => deleteBidPlan(p.id).then(refresh).catch(() => undefined)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
