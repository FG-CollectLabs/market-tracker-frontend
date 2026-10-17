import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuctionDeals, fetchBidPlans, saveBidPlan, type AuctionDeal, type EdgeCalc, type PlanKind } from "../lib/api";
import { onWatchChange, watchedCards } from "./WatchButton";
import { useSession } from "../lib/auth";
import { MarketLinkRow } from "./MarketLinks";
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

// What's already in this Sunday's Buying prep (and the watchlist), to mark
// rows: by card, with each list's grades and max bids.
type PrepKind = "auction" | "min_bid" | "lowball";
type PrepEntry = { kind: PrepKind; grade: string; max?: number; origin?: string; status: string };
const PREP: Record<PrepKind | "watch", { label: string; chip: string; edge: string }> = {
  auction: { label: "Sunday's bids", chip: "bg-indigo-900/70 text-indigo-200 border-indigo-700/60", edge: "border-l-indigo-500" },
  min_bid: { label: "Min-bid", chip: "bg-amber-900/60 text-amber-200 border-amber-700/60", edge: "border-l-amber-500" },
  lowball: { label: "Lowball", chip: "bg-teal-900/60 text-teal-200 border-teal-700/60", edge: "border-l-teal-500" },
  watch: { label: "Watchlist", chip: "bg-yellow-900/40 text-yellow-200 border-yellow-700/50", edge: "border-l-yellow-500" },
};

function usePrepMarks() {
  const session = useSession();
  const [plans, setPlans] = useState<Map<string, PrepEntry[]>>(new Map());
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    let live = true;
    Promise.all((["auction", "min_bid", "lowball"] as PlanKind[]).map((k) => fetchBidPlans(undefined, k).catch(() => null))).then((rs) => {
      if (!live) return;
      const m = new Map<string, PrepEntry[]>();
      for (const r of rs) {
        if (!r) continue;
        setDay(r.auction_date);
        for (const p of r.plans) {
          if (p.status === "skipped") continue;
          const e: PrepEntry = { kind: r.kind as PrepKind, grade: p.grade, max: p.max_bid_cents, origin: p.origin, status: p.status };
          m.set(p.display_key, [...(m.get(p.display_key) ?? []), e]);
        }
      }
      setPlans(m);
    });
    return () => { live = false; };
  }, [session, tick]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () => watchedCards().then((m) => live && setWatched(new Set(m.keys())));
    load();
    const off = onWatchChange(load);
    return () => { live = false; off(); };
  }, [session]);
  return { plans, watched, day, reload: () => setTick((t) => t + 1), on: !!session };
}

// Tags under the card name: the lists it's on (grade shown when it differs
// from the row's).
function PrepTags({ entries, watched, grade }: { entries: PrepEntry[]; watched: boolean; grade: string }) {
  if (!entries.length && !watched) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {entries.map((e, i) => (
        <span key={i} className={`px-1 rounded border text-[10px] leading-4 ${PREP[e.kind].chip} ${e.grade !== grade ? "opacity-70" : ""}`}
          title={`On this Sunday's ${PREP[e.kind].label} list${e.origin === "auto" ? " (added by auto-prep)" : ""} · ${e.status}${e.max != null ? ` · your max ${formatCents(e.max)}` : " · no max yet"}`}>
          {PREP[e.kind].label}{e.grade !== grade ? ` · ${GRADE_LABEL[e.grade] ?? e.grade.toUpperCase().replace("-", " ")}` : ""}{e.max != null ? ` · ${formatCents(e.max)}` : ""}{e.origin === "auto" ? " · auto" : ""}
        </span>
      ))}
      {watched && <span className={`px-1 rounded border text-[10px] leading-4 ${PREP.watch.chip}`} title="On your watchlist">★ Watchlist</span>}
    </div>
  );
}

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

// Auction closes vs the price it sells for elsewhere.
function DiscountCell({ d }: { d: AuctionDeal }) {
  const x = d.auction_discount;
  if (!x) return <span className="text-gray-700" title="Needs 2+ weeks of its own auction closes and 3+ eBay or Buy Now sales">—</span>;
  const ch = x.ref_channel === "ebay" ? "eBay" : "Buy Now";
  const color = x.pct >= 0.25 ? "text-green-400" : x.pct >= 0.1 ? "text-green-300/80" : x.pct >= 0 ? "text-gray-300" : "text-amber-300";
  const title = [
    `Usual auction close ${formatCents(x.auction_cents)} all-in (${x.auction_weeks} weeks of closes)`,
    x.ebay_cents != null ? `eBay sold median ${formatCents(x.ebay_cents)} (${x.ebay_sales})` : "eBay: no sales",
    x.fanatics_buy_now_cents != null ? `Fanatics Buy Now sold median ${formatCents(x.fanatics_buy_now_cents)} (${x.fanatics_buy_now_sales})` : "Buy Now: no sales",
    `${Math.round(x.pct * 100)}% = 1 - ${formatCents(x.auction_cents)} / ${formatCents(x.ref_cents)} (${ch}, the lower one with 3+ sales)`,
  ].join("\n");
  return (
    <span title={title} className="cursor-help">
      <span className={`font-semibold ${color}`}>{x.pct >= 0 ? "−" : "+"}{Math.abs(Math.round(x.pct * 100))}%</span>
      <div className="text-[10px] text-gray-500">{formatCents(x.auction_cents)} vs {formatCents(x.ref_cents)} {ch}</div>
    </span>
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

// How "Resale (net)" was arrived at: each channel's sold median and fees.
function ResaleWorking({ e }: { e: EdgeCalc }) {
  const r = e.resale;
  return (
    <div>
      <div className="text-gray-200 font-medium mb-1">Resale (net): {formatCents(r.net_cents)} via {CHANNEL[r.channel]}</div>
      <table className="tabular-nums">
        <tbody>
          <tr><td className="pr-3">Fanatics Buy Now sold median</td><td className="text-right text-gray-200">{r.fanatics_buy_now_median_cents != null ? `${formatCents(r.fanatics_buy_now_median_cents)} (${r.fanatics_buy_now_sales} sales)` : "fewer than 3 sales"}</td></tr>
          <tr><td className="pr-3">eBay sold median</td><td className="text-right text-gray-200">{r.ebay_median_cents != null ? `${formatCents(r.ebay_median_cents)} (${r.ebay_sales} sales)` : "fewer than 3 sales"}</td></tr>
          <tr><td className="pr-3">Used: {CHANNEL[r.channel]}</td><td className="text-right text-gray-200">{formatCents(r.gross_cents)}</td></tr>
          <tr><td className="pr-3">Fees, shipping, vault withdrawal</td><td className="text-right text-gray-200">−{formatCents(r.fees_cents)}</td></tr>
          {r.trend_pct != null && <tr><td className="pr-3">Falling price path</td><td className="text-right text-gray-200">{Math.round(r.trend_pct * 100)}%</td></tr>}
          <tr><td className="pr-3 text-gray-200">Net</td><td className="text-right text-gray-100 font-medium">{formatCents(r.net_cents)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// Put this auction on the bid list for the coming Sunday, max bid prefilled
// with the suggestion (whole dollars: Fanatics bids in $1 steps).
function AddToBidList({ d, entries, onSaved }: { d: AuctionDeal; entries: PrepEntry[]; onSaved: () => void }) {
  const session = useSession();
  const [max, setMax] = useState(d.snipe_hammer_cents != null ? Math.floor(d.snipe_hammer_cents / 100) : 0);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<PrepKind>("auction");
  const already = entries.filter((e) => e.grade === d.grade);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  if (!session) return <div className="text-gray-500">Sign in to add it to your bid list.</div>;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(ev) => {
      ev.preventDefault();
      setState("busy");
      saveBidPlan({ display_key: d.display_key, grade: d.grade, max_bid_cents: max * 100, note: note || undefined, kind })
        .then((r) => { setState("done"); setMsg(`on the ${r.auction_date} ${PREP[kind].label} list`); onSaved(); })
        .catch((e: Error) => { setState("error"); setMsg(e.message); });
    }}>
      <span className="text-gray-200 font-medium">Bid list</span>
      {already.length > 0 && (
        <span className="text-indigo-200">Already on {already.map((e) => `${PREP[e.kind].label}${e.max != null ? ` (max ${formatCents(e.max)})` : ""}`).join(", ")}:</span>
      )}
      <select value={kind} onChange={(e) => { const k = e.target.value as PrepKind; setKind(k); if (k === "min_bid") setMax(Math.min(max, 6)); }}
        className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
        title="Sunday's bids: set a floor and bid near the close. Min-bid: cheap cards bid early at a small max, hoping nobody pays more.">
        <option value="auction">Sunday's bids (bid late)</option>
        <option value="min_bid">Min-bid (bid early)</option>
        <option value="lowball">Lowball (bid late)</option>
      </select>
      <label className="flex items-center gap-1">max bid $
        <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />
      </label>
      <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
        className="w-48 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" />
      <button type="submit" disabled={state === "busy"} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60">
        {state === "done" ? "Update" : "Add"}
      </button>
      {state === "done" && <span className="text-green-400">✓ {msg}</span>}
      {state === "error" && <span className="text-red-400">{msg}</span>}
      <span className="text-gray-500">suggested {formatCents(d.snipe_hammer_cents)} (clears your margin on the resale)</span>
    </form>
  );
}

function Detail({ d, entries, onSaved }: { d: AuctionDeal; entries: PrepEntry[]; onSaved: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 text-xs text-gray-400 p-3 bg-gray-950/60">
      <div className="md:col-span-3 space-y-2">
        <MarketLinkRow links={d.links} />
        <AddToBidList d={d} entries={entries} onSaved={onSaved} />
      </div>
      {d.edge_calc && <div className="md:col-span-2"><EdgeWorking e={d.edge_calc} /></div>}
      {d.edge_calc && <ResaleWorking e={d.edge_calc} />}
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
  const [prepFilter, setPrepFilter] = useState<"" | "in" | "out">("");
  const marks = usePrepMarks();
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
    const inPrep = (d: AuctionDeal) => (marks.plans.get(d.display_key) ?? []).some((e) => e.grade === d.grade);
    const xs = rows.filter((d) => (!dumpsOnly || (d.pressure ?? 0) >= 2) && (prepFilter === "" || (prepFilter === "in") === inPrep(d)));
    const key = (d: AuctionDeal) => (sort === "pressure" ? d.pressure ?? 0 : sort === "edge" ? d.edge_calc?.adjusted_pct ?? -9 : d.live_auctions);
    return [...xs].sort((a, b) => key(b) - key(a));
  }, [rows, sort, dumpsOnly, prepFilter, marks.plans]);

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
        {marks.on && (
          <select value={prepFilter} onChange={(e) => setPrepFilter(e.target.value as "" | "in" | "out")}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200" title={`Buying prep for Sunday ${marks.day ?? ""}`}>
            <option value="">In prep or not</option>
            <option value="out">Not in this Sunday's prep</option>
            <option value="in">In this Sunday's prep</option>
          </select>
        )}
        {rows && <span className="text-gray-500">{shown.length} of {rows.length}</span>}
        {marks.on && (
          <span className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
            {(["auction", "min_bid", "lowball", "watch"] as const).map((k) => (
              <span key={k} className={`px-1 rounded border ${PREP[k].chip}`}>{k === "watch" ? "★ " : ""}{PREP[k].label}</span>
            ))}
            <span>= on that list{marks.day ? ` (Sunday ${marks.day})` : ""}; faded = a different grade of the card</span>
          </span>
        )}
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
                <th className="text-right px-3 py-2 font-medium" title="How far this card's own auction closes (usual weekly close, all-in) run under what it sells for on eBay or Fanatics Buy Now (the lower of the two). Needs 2+ weeks of its own closes.">Auction vs BIN/eBay</th>
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
                const entries = marks.plans.get(d.display_key) ?? [];
                const same = entries.find((e) => e.grade === d.grade);
                const watched = marks.watched.has(d.display_key);
                const edge = same ? `border-l-4 ${PREP[same.kind].edge} bg-indigo-950/20` : entries.length ? "border-l-4 border-l-gray-600" : watched ? `border-l-4 ${PREP.watch.edge}` : "border-l-4 border-l-transparent";
                return (
                  <Fragment key={id}>
                    <tr className={`align-top hover:bg-gray-900/40 cursor-pointer ${edge}`} onClick={() => setOpen(open === id ? null : id)}>
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
                        <PrepTags entries={entries} watched={watched} grade={d.grade} />
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
                      <td className="px-3 py-2 text-right tabular-nums">
                        <DiscountCell d={d} />
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
                        <td colSpan={11} className="p-0"><Detail d={d} entries={entries} onSaved={marks.reload} /></td>
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
