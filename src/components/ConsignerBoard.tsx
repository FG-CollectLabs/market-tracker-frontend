import { AutoMore, CheckAll, ChainCheck } from "./BoardTools";
import { useOddsReload } from "../lib/useOddsReload";
import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchConsignerBoard, fetchSellerPage, startSellerSweep, type HuntListing, type HuntListingsReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import { ShowFilter, countShows, showOf, type Show } from "./ActionCell";
import type { HitReview } from "../lib/api";
import { useColumns } from "../lib/useColumns";
import ColumnPicker, { FROZEN_BOX, FROZEN_HEAD } from "./ColumnPicker";
import { LISTING_COLS, ListingHead, ListingRow, reviewFlags } from "./ListingColumns";

// Consigner board: every raw copy the tracked consigners have listed of a
// tracked card, hunt list or not. For gradable gems of cards you aren't
// buying yet (near their expected low?) and gradable copies of cards well
// past their buy window, bought from consigners you're already ordering from.
// Auctions soonest first, grouped by the day they end, for a daily review.

const PAGE = 150;
const BOARD_COLS = ["card", "action", "seller", "ends", "now", "cost", "max_bid", "raw", "exp_low", "timing", "p10_odds", "pregrade", "review", "centering", "psa_ev", "cgc", "at_sale", "grade_later"];

type Ending = "" | "today" | "tomorrow" | "48h" | "week";
type Watch = "" | "not_watched" | "watched";
type Win = "" | "near_low" | "before" | "in" | "past" | "well_past" | "past_any";
type Gradable = "" | "measured" | "above_gem" | "ev_pos" | "review";
type Sort = "ending" | "best_ev" | "adj_p10" | "vs_low" | "score";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 864e5;

function endsBefore(e: Ending): number {
  const today = startOfDay(new Date()).getTime();
  if (e === "today") return today + DAY;
  if (e === "tomorrow") return today + 2 * DAY;
  if (e === "48h") return Date.now() + 2 * DAY;
  if (e === "week") return Date.now() + 7 * DAY;
  return Infinity;
}

function dayLabel(iso?: string) {
  if (!iso) return "Buy Now";
  const d = startOfDay(new Date(iso)).getTime(), today = startOfDay(new Date()).getTime();
  if (d === today) return "Ends today";
  if (d === today + DAY) return "Ends tomorrow";
  return `Ends ${new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`;
}

const best = (l: HuntListing) => {
  const a = l.adj_ev?.ev_cents, c = l.adj_ev?.cgc?.ev_cents;
  return a == null ? c : c == null ? a : Math.max(a, c);
};

export default function ConsignerBoard({ seller, setSeller }: { seller: string; setSeller: (s: string) => void }) {
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [ending, setEnding] = useState<Ending>("tomorrow");
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [watch, setWatch] = useState<Watch>("");
  const [win, setWin] = useState<Win>("");
  const [nearLow, setNearLow] = useState(0.1);
  const [gradable, setGradable] = useState<Gradable>("");
  const [sort, setSort] = useState<Sort>("ending");
  const [shown, setShown] = useState(PAGE);
  const [show, setShow] = useState<Show>("open");
  const [rv, setRv] = useState<Record<string, HitReview | undefined>>({});
  const reviewOf = (l: HuntListing) => (l.listing_id in rv ? rv[l.listing_id] : l.review);
  const [rep, setRep] = useState<HuntListingsReport | null>(null);
  const oddsReload = useOddsReload(); // ↻ on an odds badge: refetch so odds and EV recompute
  const [scanned, setScanned] = useState(0); // an ending-soon scan finished: refetch
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cols = useColumns("watchlist.board", LISTING_COLS, BOARD_COLS);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchConsignerBoard({ years: 5, gradeAt: 4.5, feeGrowth: 0.03, valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source, oddsReload, scanned]);

  const base = useMemo(() => {
    const until = endsBefore(ending);
    return (rep?.listings ?? []).filter((l) => {
      if (seller && l.seller !== seller) return false;
      if (kind && l.kind !== kind) return false;
      if (ending && (!l.ends_at || new Date(l.ends_at).getTime() >= until)) return false;
      if (watch === "watched" && !l.watched) return false;
      if (watch === "not_watched" && l.watched) return false;
      const t = l.timing;
      if (win === "near_low" && !(t?.copy_vs_low != null && t.copy_vs_low <= nearLow)) return false;
      if (win === "past_any" && !(t?.window === "past" || t?.window === "well_past")) return false;
      if (win && win !== "near_low" && win !== "past_any" && t?.window !== win) return false;
      const ev = l.adj_ev;
      if (gradable === "review") return reviewFlags(l).length > 0;
      // held for manual centering: unknown, so it stays in view ("look at it"), never filtered out as a no
      if (gradable && ev?.needs_manual_centering) return true;
      if (gradable === "measured" && ev?.ev_source !== "measured") return false;
      if (gradable === "above_gem" && !(ev?.ev_source === "measured" && ev.population_p10 != null && ev.p10 > ev.population_p10)) return false;
      if (gradable === "ev_pos" && !((best(l) ?? -1) > 0)) return false;
      return true;
    });
  }, [rep, seller, kind, ending, watch, win, nearLow, gradable]);
  const counts = useMemo(() => countShows(base, reviewOf), [base, rv]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out = base.filter((l) => show === "all" || showOf(reviewOf(l)) === show);
    const val = (l: HuntListing) => sort === "best_ev" ? best(l) : sort === "adj_p10" ? (l.adj_ev?.needs_manual_centering ? undefined : l.adj_ev?.p10)
      : sort === "vs_low" ? (l.timing?.copy_vs_low == null ? undefined : -l.timing.copy_vs_low) : l.score;
    return sort === "ending" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [base, show, rv, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [seller, kind, ending, watch, win, nearLow, gradable, sort, show]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  const cur = rep?.sellers.find((s) => s.username === seller);
  // auctions ending today or tomorrow, per consigner: how many are still
  // waiting on their pre-grade or AI check, to expedite before they close
  const expedite = useMemo(() => {
    const until = endsBefore("tomorrow");
    const by = new Map<string, { seller: string; label: string; total: number; behind: HuntListing[] }>();
    for (const l of rep?.listings ?? []) {
      if (l.kind !== "auction" || !l.ends_at || new Date(l.ends_at).getTime() >= until || new Date(l.ends_at).getTime() < Date.now()) continue;
      if (l.image_count != null && l.image_count < 2) continue;
      const g = by.get(l.seller) ?? { seller: l.seller, label: l.seller_label, total: 0, behind: [] };
      g.total++;
      const ai = l.grade_odds?.ai?.state;
      const oddsDone = l.grade_odds && !["pending", "measuring"].includes(l.grade_odds.status);
      const aiDone = ai && !["not_checked", "failed"].includes(ai);
      if (!oddsDone || !aiDone) g.behind.push(l);
      by.set(l.seller, g);
    }
    return [...by.values()].sort((a, b) => b.behind.length - a.behind.length);
  }, [rep]);
  const page = rows.slice(0, shown);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Every raw copy your consigners have listed of a tracked card, on a hunt list or not: gradable gems of cards you aren't buying yet
        (is it near its expected low?) and gradable copies of cards well past their buy window, from the consigners you're already ordering
        from. Same costing and pre-grade odds as the Hunt list. Auctions soonest first.
      </p>

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Pricing every consigner copy (up to a minute the first time)…</div>}
      {rep && (
        <>
          <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
            {[{ username: "", label: "All consigners", priced: rep.sellers.reduce((a, s) => a + s.priced, 0) }, ...rep.sellers].map((s) => (
              <button key={s.username || "all"} onClick={() => setSeller(s.username)}
                className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${seller === s.username ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                {s.label} <span className="text-xs text-gray-500 tabular-nums" title="raw copies priced">{s.priced}</span>
              </button>
            ))}
            {loading && <span className="text-xs text-gray-500 px-2 pb-2">Loading…</span>}
          </div>

          {cur && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span>{cur.ship_rule.text}{cur.ship_rule.note ? ` · ${cur.ship_rule.note}` : ""}</span>
              <ScanEnding seller={cur.username} onDone={() => setScanned((n) => n + 1)} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <label className="flex items-center gap-1.5">Ending
              <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)} className={sel}>
                <option value="today">Today</option><option value="tomorrow">Today + tomorrow</option><option value="48h">Next 48 hours</option>
                <option value="week">Next 7 days</option><option value="">Any time (incl. Buy Now)</option>
              </select>
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={sel}>
              <option value="">Auctions + Buy Now</option><option value="auction">Auctions</option><option value="buy_now">Buy Now</option>
            </select>
            <label className="flex items-center gap-1.5">Cards
              <select value={watch} onChange={(e) => setWatch(e.target.value as Watch)} className={sel}>
                <option value="">All tracked</option><option value="not_watched">Not on my watchlist</option><option value="watched">On my watchlist</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">Timing
              <select value={win} onChange={(e) => setWin(e.target.value as Win)} className={sel}>
                <option value="">Any</option>
                <option value="near_low">Copy near its expected low</option>
                <option value="before">Before the low (still falling)</option>
                <option value="in">In the low window</option>
                <option value="past_any">Past the window</option>
                <option value="well_past">Well past (12+ months)</option>
              </select>
            </label>
            {win === "near_low" && (
              <select value={nearLow} onChange={(e) => setNearLow(Number(e.target.value))} className={sel} title="This copy's cost vs the card's expected raw low">
                <option value={0}>at or under the low</option><option value={0.1}>within 10% over</option><option value={0.25}>within 25% over</option><option value={0.5}>within 50% over</option>
              </select>
            )}
            <label className="flex items-center gap-1.5">Gradable
              <select value={gradable} onChange={(e) => setGradable(e.target.value as Gradable)} className={sel}>
                <option value="">Any</option>
                <option value="above_gem">Measured, PSA 10 odds above the gem rate</option>
                <option value="measured">Measured from photos</option>
                <option value="ev_pos">Grading EV positive (PSA or CGC)</option>
                <option value="review">Needs manual review</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel}>
                <option value="ending">Ending soonest</option><option value="best_ev">Best EV (PSA or CGC)</option><option value="adj_p10">PSA 10 odds (adjusted)</option>
                <option value="vs_low">Cheapest vs expected low</option><option value="score">Hunt score</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">Prices
              <select value={source} onChange={(e) => setSource(e.target.value as ValueSource | "")} className={sel}>
                <option value="ebay">eBay sold</option><option value="comps">Sold comps</option><option value="pricecharting">PriceCharting</option><option value="">Settings default</option>
              </select>
            </label>
            <ShowFilter show={show} setShow={setShow} counts={counts} />
            <span className="text-gray-500 tabular-nums">{rows.length} copies</span>
            <ColumnPicker cols={cols} />
            <CheckAll listingIds={rows.filter((l) => !l.grade_odds && (l.image_count == null || l.image_count >= 2)).map((l) => l.listing_id)} />
            <ChainCheck listingIds={rows.filter((l) => (l.image_count == null || l.image_count >= 2)
              && (!l.grade_odds?.ai || ["not_checked", "failed", "skipped"].includes(l.grade_odds.ai.state))).map((l) => l.listing_id)} />
          </div>

          {expedite.length > 0 && (
            <div className="rounded-lg border border-fuchsia-900/50 bg-gray-900 p-3 space-y-1.5">
              <div className="text-xs text-gray-300"><span className="font-medium text-fuchsia-200">Ending today or tomorrow</span>
                <span className="text-gray-500"> · auctions still waiting on their pre-grade or AI check, by consigner: expedite runs the pre-grade now and the AI check right after (if centering allows a 10; up to 50 AI a click)</span></div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {expedite.map((g) => (
                  <div key={g.seller} className="flex items-center gap-2">
                    <button onClick={() => setSeller(g.seller)} className="text-gray-200 hover:text-indigo-300">{g.label}</button>
                    <span className="text-gray-500 tabular-nums">{g.total - g.behind.length}/{g.total} done</span>
                    <ScanEnding compact seller={g.seller} onDone={() => setScanned((n) => n + 1)} />
                    {g.behind.length > 0
                      ? <ChainCheck compact label="Expedite" listingIds={g.behind.map((l) => l.listing_id)} />
                      : <span className="text-emerald-400">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className={FROZEN_BOX}>
              <table className="w-full text-xs">
                <thead className={`text-gray-500 text-left ${FROZEN_HEAD}`}>
                  <ListingHead ids={cols.visible} />
                </thead>
                <tbody>
                  {page.map((l, i) => {
                    const day = sort === "ending" ? dayLabel(l.ends_at) : "";
                    const head = sort === "ending" && (i === 0 || dayLabel(page[i - 1].ends_at) !== day);
                    return (
                      <Fragment key={l.listing_id}>
                        {head && <tr className="border-t border-gray-800 bg-gray-950/60"><td colSpan={cols.visible.length} className="py-1.5 px-3 text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{day}</td></tr>}
                        <ListingRow l={l} ids={cols.visible} ctx={{ bench: rep.params.benchmark, review: reviewOf(l), onReview: (r) => setRv((m) => ({ ...m, [l.listing_id]: r })) }} />
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <AutoMore remaining={rows.length - shown} page={PAGE} onMore={() => setShown((v) => v + PAGE)} />
            </div>
          )}
          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method}</p>
        </>
      )}
    </div>
  );
}

// ScanEnding: look for the consigner's auctions ending in the next 48 hours
// on eBay now (soonest first). The regular store scans page the whole store
// in eBay's best-match order and stop at its 10,000-result cap, so a big
// consign store's next-day auctions can be past it; this window always fits.
// Runs on the worker (a few eBay calls); the board reloads when it's done.
function ScanEnding({ seller, onDone, compact }: { seller: string; onDone: () => void; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [msg, setMsg] = useState<string>("");
  const run = async () => {
    setState("running"); setMsg("");
    try {
      const r = await startSellerSweep(seller, undefined, 48);
      const id = r.id ?? r.sweep?.id;
      const until = Date.now() + 5 * 60e3;
      while (Date.now() < until) {
        await new Promise((ok) => setTimeout(ok, 4000));
        const s = (await fetchSellerPage(seller)).sweep;
        if (!s || (id && s.id !== id) || s.status === "queued" || s.status === "running") continue;
        if (s.status !== "done") { setState("failed"); setMsg(s.error ?? s.status); return; }
        const x = s.result;
        setState("done");
        setMsg(x ? `eBay: ${x.total ?? x.items} auctions ending ≤48h · ${x.matched} matched a card · ${x.new ?? 0} new` : "done");
        onDone();
        return;
      }
      setState("failed"); setMsg("still queued after 5 minutes (the eBay lane is busy); it will finish on its own");
    } catch (e) {
      setState("failed"); setMsg(String(e));
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={run} disabled={state === "running"}
        title="Search eBay now for this consigner's auctions ending in the next 48 hours (soonest first) and add any the store scans missed. Big stores are cut off at eBay's 10,000-result cap; this window isn't."
        className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">
        {state === "running" ? "Scanning…" : compact ? "Scan 48h" : "Scan next 2 days"}
      </button>
      {msg && <span className={state === "failed" ? "text-red-400" : "text-gray-500"}>{msg}</span>}
    </span>
  );
}
