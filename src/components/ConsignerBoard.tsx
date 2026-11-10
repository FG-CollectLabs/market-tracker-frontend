import { useOddsReload } from "../lib/useOddsReload";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchConsignerBoard, type CopyTiming, type HuntListing, type HuntListingsReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";
import AdjEVCell, { CGCCell, OddsFlag, PSAOddsCell } from "./AdjEVCell";
import { BoughtButton } from "./BoughtToGrade";
import { CheckCentering } from "./HuntListings";
import { ItemNumber, SuggestedBid } from "./BidCells";
import ActionCell, { ExplainChip, ShowFilter, countShows, showOf, type Show } from "./ActionCell";
import type { HitReview } from "../lib/api";

// Consigner board: every raw copy the tracked consigners have listed of a
// tracked card, hunt list or not. For gradable gems of cards you aren't
// buying yet (near their expected low?) and gradable copies of cards well
// past their buy window, bought from consigners you're already ordering from.
// Auctions soonest first, grouped by the day they end, for a daily review.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null, digits = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const PAGE = 150;

type Ending = "" | "today" | "tomorrow" | "48h" | "week";
type Watch = "" | "not_watched" | "watched";
type Win = "" | "near_low" | "before" | "in" | "past" | "well_past" | "past_any";
type Gradable = "" | "measured" | "above_gem" | "ev_pos";
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

function endsAt(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso), h = (t.getTime() - Date.now()) / 3.6e6;
  const clock = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const left = h <= 0 ? "ending" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  return `${clock} · ${left}`;
}

const best = (l: HuntListing) => {
  const a = l.adj_ev?.ev_cents, c = l.adj_ev?.cgc?.ev_cents;
  return a == null ? c : c == null ? a : Math.max(a, c);
};

const WINDOW: Record<CopyTiming["window"], { label: string; cls: string; hint: string }> = {
  before: { label: "before low", cls: "text-amber-300", hint: "Still falling toward its expected low" },
  in: { label: "in window", cls: "text-green-300", hint: "In its tier's low window: the usual time to buy" },
  past: { label: "past window", cls: "text-gray-300", hint: "Recovering: past its low window" },
  well_past: { label: "well past", cls: "text-indigo-300", hint: "12+ months past its low window" },
  unknown: { label: "—", cls: "text-gray-600", hint: "Not enough release-curve data" },
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
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchConsignerBoard({ years: 5, gradeAt: 4.5, feeGrowth: 0.03, valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source, oddsReload]);

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
      if (gradable === "measured" && ev?.ev_source !== "measured") return false;
      if (gradable === "above_gem" && !(ev?.ev_source === "measured" && ev.population_p10 != null && ev.p10 > ev.population_p10)) return false;
      if (gradable === "ev_pos" && !((best(l) ?? -1) > 0)) return false;
      return true;
    });
  }, [rep, seller, kind, ending, watch, win, nearLow, gradable]);
  const counts = useMemo(() => countShows(base, reviewOf), [base, rv]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out = base.filter((l) => show === "all" || showOf(reviewOf(l)) === show);
    const val = (l: HuntListing) => sort === "best_ev" ? best(l) : sort === "adj_p10" ? l.adj_ev?.p10
      : sort === "vs_low" ? (l.timing?.copy_vs_low == null ? undefined : -l.timing.copy_vs_low) : l.score;
    return sort === "ending" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [base, show, rv, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [seller, kind, ending, watch, win, nearLow, gradable, sort, show]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  const cur = rep?.sellers.find((s) => s.username === seller);
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
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
              {cur.ship_rule.text}{cur.ship_rule.note ? ` · ${cur.ship_rule.note}` : ""}
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
          </div>

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left max-lg:!static">
                  <tr>
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium" title="Bid (with your max) or pass; then report won / lost">Action</th>
                    <th className="py-2 px-2 font-medium">Seller</th>
                    <th className="py-2 px-2 font-medium">Ends</th>
                    <th className="py-2 px-2 font-medium text-right" title="Ask or current bid, with its listed shipping">Now</th>
                    <th className="py-2 px-2 font-medium text-right" title="Item (auctions: expected close, the raw market) + what it adds to an order's shipping">Your cost</th>
                    <th className="py-2 px-2 font-medium text-right" title="Suggested max bid, the item price to enter in eBay or Gixen: beats most of this consigner's recent finals, never above what the copy is worth to you. Click to copy; hover for the working.">Max bid</th>
                    <th className="py-2 px-2 font-medium text-right" title="Raw market (eBay sold by default)">Raw market</th>
                    <th className="py-2 px-2 font-medium text-right" title="The card's expected raw low (release curve), and this copy's cost against it">Exp. low</th>
                    <th className="py-2 px-2 font-medium" title="Where the card is on its tier's raw release curve">Timing</th>
                    <th className="py-2 px-2 font-medium text-right" title="PSA 10 odds: the public gem rate, and adjusted for this copy by the pre-grader">PSA 10 odds</th>
                    <th className="py-2 px-2 font-medium">Pre-grade</th>
                    <th className="py-2 px-2 font-medium text-right" title="PSA grading EV with the adjusted odds, and at the public gem rate. Hover for the working.">PSA EV</th>
                    <th className="py-2 px-2 font-medium text-right" title="CGC Pristine / 10 / 9: gem rates (the card's CGC population), adjusted for this copy, and the EV">CGC</th>
                    <th className="py-2 px-3 font-medium text-right" title="Grade later (graded 6 months before selling at year 5) at this copy's cost: yearly return">Grade later</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((l, i) => {
                    const day = sort === "ending" ? dayLabel(l.ends_at) : "";
                    const head = sort === "ending" && (i === 0 || dayLabel(page[i - 1].ends_at) !== day);
                    return (
                      <Fragment key={l.listing_id}>
                        {head && <tr className="border-t border-gray-800 bg-gray-950/60"><td colSpan={15} className="py-1.5 px-3 text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{day}</td></tr>}
                        <Row l={l} bench={rep.params.benchmark} review={reviewOf(l)} onReview={(r) => setRv((m) => ({ ...m, [l.listing_id]: r }))} />
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > shown && (
                <button onClick={() => setShown(shown + PAGE)} className="w-full py-2 text-xs text-indigo-300 hover:text-indigo-200 border-t border-gray-800">
                  Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method}</p>
        </>
      )}
    </div>
  );
}

function Timing({ t }: { t?: CopyTiming }) {
  if (!t) return <span className="text-gray-600">—</span>;
  const w = WINDOW[t.window] ?? WINDOW.unknown;
  return (
    <span className="inline-flex flex-col whitespace-nowrap" title={`${w.hint}. Month ${t.month} since release; low window M${t.window_from}–M${t.window_to}.`}>
      <span className={w.cls}>{w.label}{t.months_past_window != null && t.months_past_window > 0 && <span className="text-gray-500"> +{Math.round(t.months_past_window)}mo</span>}</span>
      {t.window === "before" && t.to_low != null && (
        <span className={`text-[10px] ${t.to_low <= -0.25 ? "text-red-400" : t.to_low <= -0.1 ? "text-amber-300" : "text-gray-500"}`}>
          {pct(t.to_low)} more{t.low_month != null && ` by M${t.low_month}`}
        </span>
      )}
      {t.after_low_yearly != null && (
        <span className={`text-[10px] ${t.after_low_yearly > 0.05 ? "text-green-400" : t.after_low_yearly < 0 ? "text-red-400" : "text-gray-500"}`} title="The tier's yearly change after its low">
          then {pct(t.after_low_yearly)}/yr
        </span>
      )}
    </span>
  );
}

function Row({ l, bench, review, onReview }: { l: HuntListing; bench: number; review?: HitReview; onReview: (r: HitReview | undefined) => void }) {
  const td = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";
  const y = l.grade_later?.yearly;
  const v = l.timing?.copy_vs_low;
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-1.5 px-3">
        <div className="flex gap-2 items-start min-w-[15rem]">
          {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
          <div className="min-w-0">
            <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
            <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
            {l.watched && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200" title="On your watchlist">watching</span>}
            {l.slow && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="PSA 10s sell less than once a month">slow</span>}
            {l.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
            {l.review?.status === "interested" && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">interested</span>}
            {l.url
              ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
              : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
            <ItemNumber n={l.item_number} />
          </div>
        </div>
      </td>
      <td className="py-1.5 px-2"><ActionCell listingId={l.listing_id} displayKey={l.display_key} priceCents={l.price_cents} review={review} suggestCents={l.suggested_bid?.item_cents}
        shown={{ adj_ev: l.adj_ev, odds: l.grade_odds, add_cents: l.add_cents, raw_market_cents: l.raw_market_cents, grade_later: l.grade_later, timing: l.timing }} onChange={onReview} /></td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">{l.seller_label}</td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">
        {l.kind === "auction" ? <>{endsAt(l.ends_at)}{l.bids != null && <div className="text-[10px] text-gray-500">{l.bids} bids</div>}</> : <span className="text-gray-400">Buy Now</span>}
      </td>
      <td className={`${td} text-gray-400`}>{usd(l.price_cents)}</td>
      <td className={`${td} text-gray-100`} title={l.notes?.join("\n")}>
        {usd(l.add_cents)}
        {l.expected && <div className="text-[10px] text-gray-500">expected close</div>}
      </td>
      <td className="py-1.5 px-2 text-right"><SuggestedBid b={l.suggested_bid} /></td>
      <td className={`${td} text-gray-300`}>
        {usd(l.raw_market_cents)}
        <div className={`text-[10px] ${l.vs_raw <= 1 ? "text-green-300/80" : "text-gray-500"}`}>{l.vs_raw <= 1 ? `${Math.round((1 - l.vs_raw) * 100)}% under` : `${Math.round((l.vs_raw - 1) * 100)}% over`}</div>
      </td>
      <td className={`${td} text-gray-300`}>
        {usd(l.timing?.exp_low_cents)}
        {v != null && <div className={`text-[10px] ${v <= 0 ? "text-green-300" : v <= 0.1 ? "text-green-300/70" : v <= 0.25 ? "text-amber-300" : "text-gray-500"}`} title="This copy's cost vs the expected low">{v <= 0 ? `${Math.round(-v * 100)}% under` : `${Math.round(v * 100)}% over`}</div>}
      </td>
      <td className="py-1.5 px-2"><Timing t={l.timing} /></td>
      <td className={td}><PSAOddsCell ev={l.adj_ev} popFallback={l.p10 || undefined} /></td>
      <td className="py-1.5 px-2">
        {l.grade_odds
          ? <><span className="inline-flex flex-wrap items-center gap-1"><GradeOddsBadge o={l.grade_odds} compact /><OddsFlag odds={l.grade_odds} shown={l.adj_ev} /></span>
              <ExplainChip e={l.grade_odds.explain?.PSA} /></>
          : <CheckCentering listingId={l.listing_id} photos={l.image_count} />}
        {(l.image_count == null || l.image_count >= 2 || l.grade_odds) && (
          <div className="mt-0.5"><BoughtButton listingId={l.listing_id} priceCents={l.price_cents} shown={{ adj_ev: l.adj_ev, odds: l.grade_odds }} initial={!!l.grade_odds?.bought_at} /></div>
        )}
      </td>
      <td className="py-1.5 px-2 text-right"><AdjEVCell ev={l.adj_ev} /></td>
      <td className="py-1.5 px-2 text-right"><CGCCell ev={l.adj_ev} /></td>
      <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap font-semibold ${y == null ? "text-gray-600" : y < 0 ? "text-red-300" : y >= bench ? "text-green-300" : "text-gray-300"}`}>{pct(y, 1)}</td>
    </tr>
  );
}
