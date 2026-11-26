import { AutoMore, CheckAll } from "./BoardTools";
import { useOddsReload } from "../lib/useOddsReload";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchCCRegrade, fetchRegrade, type CCLang, type RegradeListing, type RegradePlay, type RegradeReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";
import { CheckCentering } from "./HuntListings";
import { ItemNumber } from "./BidCells";
import ActionCell, { ShowFilter, countShows, showOf, type Show } from "./ActionCell";
import type { HitReview, LaterPlay } from "../lib/api";
import { useColumns, type ColMeta } from "../lib/useColumns";
import ColumnPicker, { FROZEN_BOX, FROZEN_HEAD } from "./ColumnPicker";
import { CenteringCell, centeringVerdict } from "./ListingColumns";
import { peekBands, useBandsFor } from "../lib/centeringBands";

// Graded side of the Consigner board: slabs below the premium grade from the
// tracked consigners, each priced as a crack-and-resubmit (PSA, CGC; CGC 10s
// for Pristine) against just holding the slab. Shafted copies: a good-looking
// PSA 9 that should have been a 10, a BGS 9.5 or TAG 10 that crosses to a
// PSA 10, a CGC 10 that reshoots Pristine.
//
// Views: regrade EV positive; value slabs (offered under what the slab cost
// its grader to make: raw + fee + shipping, the seller eating the fees);
// hold now and act later (sell or crack at 3-24 months on the card's
// projected prices beats today); and a centering filter for the slabs whose
// measured centering looks like a 10 (under-graded 9s).

const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`);
const pc = (v?: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);
const PAGE = 150;
const DAY = 864e5;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

type Ending = "" | "today" | "tomorrow" | "48h" | "week";
type Sort = "ending" | "best_ev" | "roi" | "discount" | "under_cost" | "later";
type View = "regrade" | "value" | "later" | "all";
type CenterF = "" | "clean" | "gradable";

const GRADERS: [string, string][] = [["", "All slabs"], ["psa", "PSA 9"], ["cgc", "CGC"], ["bgs", "BGS"], ["tag", "TAG"], ["pcg", "PCG"]];
const gradeLabel = (gk: string) => {
  if (gk === "cgc-10") return "CGC 10 (Gem Mint)";
  const [g, n] = gk.split(/-(.+)/);
  return `${g.toUpperCase()} ${n}`;
};

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

// market "cc": Collector Crypt slabs instead of the consigners' eBay
// listings (no seller tabs or auctions; costs are all-in to your door).
export default function RegradeBoard({ seller, setSeller, market, lang = "en" }: {
  seller: string; setSeller: (s: string) => void; market?: "cc"; lang?: CCLang;
}) {
  const cc = market === "cc";
  const [measuredOnly, setMeasuredOnly] = useState(false);
  const [ccInfo, setCcInfo] = useState<{ live: number; measured: number } | null>(null);
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [grader, setGrader] = useState("");
  const [ending, setEnding] = useState<Ending>("");
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [view, setView] = useState<View>("regrade");
  const [centerF, setCenterF] = useState<CenterF>("");
  const cols = useColumns(cc ? "regrade.cc" : "regrade.board", REGRADE_COLS, REGRADE_DEFAULTS);
  const [show, setShow] = useState<Show>("open");
  const [rv, setRv] = useState<Record<string, HitReview | undefined>>({});
  const reviewOf = (l: RegradeListing) => (l.listing_id in rv ? rv[l.listing_id] : l.review);
  const [sort, setSort] = useState<Sort>("best_ev");
  const [shown, setShown] = useState(PAGE);
  const [rep, setRep] = useState<RegradeReport | null>(null);
  const oddsReload = useOddsReload(); // ↻ on an odds badge: refetch so odds and EV recompute
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    (cc
      ? fetchCCRegrade(lang).then((r) => {
        if (live) setCcInfo({ live: r.live, measured: r.measured });
        return { sellers: [], listings: r.listings, rates: r.rates, crack_damage_pct: r.crack_damage_pct, passed: 0, method: r.method } as RegradeReport;
      })
      : fetchRegrade({ valueSource: source || undefined }))
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source, oddsReload, cc, lang]);

  // the Centering filter judges each slab by its card's bands (load them for the measured ones)
  const measuredKeys = useMemo(() => (centerF ? [...new Set((rep?.listings ?? []).filter((l) => l.grade_odds?.front || l.grade_odds?.back).map((l) => l.display_key))] : []), [rep, centerF]);
  const bandsV = useBandsFor(measuredKeys);
  const base = useMemo(() => {
    const until = endsBefore(ending);
    return (rep?.listings ?? []).filter((l) =>
      (!seller || l.seller === seller) && (!grader || l.grader === grader) && (!kind || l.kind === kind) &&
      (!ending || (l.ends_at && new Date(l.ends_at).getTime() < until)) &&
      (view !== "regrade" || (l.best?.ev_cents ?? -1) > 0) &&
      (view !== "value" || (l.under_cost_to_make_cents ?? -1) > 0) &&
      (view !== "later" || (l.later?.beats_now_cents ?? -1) > 0) &&
      (!centerF || centerOK(l, centerF)) &&
      (!measuredOnly || (l.best != null && l.best.rate_source !== "settings")));
  }, [rep, seller, grader, kind, ending, view, centerF, measuredOnly, bandsV]); // eslint-disable-line react-hooks/exhaustive-deps
  const showCounts = useMemo(() => countShows(base, reviewOf), [base, rv]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out = base.filter((l) => show === "all" || showOf(reviewOf(l)) === show);
    const val = (l: RegradeListing) => sort === "best_ev" ? l.best?.ev_cents : sort === "roi" ? l.best?.roi
      : sort === "discount" ? (l.vs_hold == null ? undefined : -l.vs_hold)
      : sort === "under_cost" ? l.under_cost_to_make_cents
      : sort === "later" ? l.later?.ev_cents : undefined;
    return sort === "ending" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [base, show, rv, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [seller, grader, kind, ending, view, centerF, sort, show]);
  // each view's natural order
  useEffect(() => { setSort(view === "value" ? "under_cost" : view === "later" ? "later" : "best_ev"); }, [view]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  const page = rows.slice(0, shown);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of rep?.listings ?? []) m.set(l.grader, (m.get(l.grader) ?? 0) + 1);
    return m;
  }, [rep]);
  return (
    <div className="space-y-4">
      {cc ? (
        <p className="text-sm text-gray-400 max-w-4xl">
          Collector Crypt slabs below the premium grade (tracked and watched cards), priced as cracked and resubmitted against holding the
          slab. Your cost is all-in to your door: the ask, buyer fee and redemption. Collector Crypt shows each slab&apos;s full-size front and
          back, so the pre-grader measures them; the most promising English slabs are sent automatically every hour. Tick
          &ldquo;Pre-graded only&rdquo; for the copies whose measured odds make the regrade pay.
          {ccInfo && <span className="text-gray-500"> {ccInfo.live.toLocaleString()} slabs live, {ccInfo.measured.toLocaleString()} measured.</span>}
        </p>
      ) : <p className="text-sm text-gray-400 max-w-4xl">
        Slabs below the premium grade from your consigners, each priced as cracked and resubmitted (to PSA, to CGC; CGC 10s for Pristine)
        against just holding the slab. The odds start from Settings&apos; regrade rates, which are assumptions until your outcomes come in;
        once the pre-grader measures a slab&apos;s photos they move with how that copy compares with a typical one, and a PSA centering cap
        below 10 rules out the PSA play.
      </p>}

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Pricing every consigner slab…</div>}
      {rep && (
        <>
          {!cc && <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
            {[{ username: "", label: "All consigners", priced: rep.sellers.reduce((a, s) => a + s.priced, 0), beat: rep.sellers.reduce((a, s) => a + s.beat, 0) }, ...rep.sellers].map((s) => (
              <button key={s.username || "all"} onClick={() => setSeller(s.username)}
                className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${seller === s.username ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                {s.label} <span className="text-xs text-gray-500 tabular-nums" title="regrade EV positive · slabs priced"><span className="text-green-400/90">{s.beat}</span> / {s.priced}</span>
              </button>
            ))}
            {loading && <span className="text-xs text-gray-500 px-2 pb-2">Loading…</span>}
          </div>}

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <div className="inline-flex rounded border border-gray-700 overflow-hidden" role="group" aria-label="Grader">
              {GRADERS.map(([k, l]) => (
                <button key={k || "all"} onClick={() => setGrader(k)} aria-pressed={grader === k}
                  className={`px-2 py-1 ${grader === k ? "bg-gray-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>
                  {l}{k && <span className="text-gray-500"> {counts.get(k) ?? 0}</span>}
                </button>
              ))}
            </div>
            {!cc && <>
            <label className="flex items-center gap-1.5">Ending
              <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)} className={sel}>
                <option value="">Any time (incl. Buy Now)</option><option value="today">Today</option><option value="tomorrow">Today + tomorrow</option>
                <option value="48h">Next 48 hours</option><option value="week">Next 7 days</option>
              </select>
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={sel}>
              <option value="">Auctions + Buy Now</option><option value="auction">Auctions</option><option value="buy_now">Buy Now</option>
            </select>
            </>}
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel}>
                <option value="best_ev">Best regrade EV</option><option value="roi">Best regrade ROI</option><option value="discount">Cheapest vs slab market</option>
                <option value="under_cost">Most under cost to make</option><option value="later">Best later EV</option><option value="ending">Ending soonest</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">View
              <select value={view} onChange={(e) => setView(e.target.value as View)} className={sel}>
                <option value="regrade">Regrade EV positive</option>
                <option value="value">Value: under cost to make</option>
                <option value="later">Hold now, act later beats today</option>
                <option value="all">All slabs</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5" title="The slab's measured centering against PSA 10: clean = every axis green (not deducted); gradable = no axis past PSA's limit. Under-graded 9s hide here.">Centering
              <select value={centerF} onChange={(e) => setCenterF(e.target.value as CenterF)} className={sel}>
                <option value="">Any</option><option value="clean">Clean for a 10</option><option value="gradable">Gradable for a 10</option>
              </select>
            </label>
            <ColumnPicker cols={cols} />
            {cc && <label className="flex items-center gap-1.5" title="Only slabs the pre-grader has measured (the EV uses this copy's odds, not the base rate)">
              <input type="checkbox" checked={measuredOnly} onChange={(e) => setMeasuredOnly(e.target.checked)} /> Pre-graded only</label>}
            {!cc && <label className="flex items-center gap-1.5">Prices
              <select value={source} onChange={(e) => setSource(e.target.value as ValueSource | "")} className={sel}>
                <option value="ebay">eBay sold</option><option value="comps">Sold comps</option><option value="pricecharting">PriceCharting</option><option value="">Settings default</option>
              </select>
            </label>}
            {!cc && <ShowFilter show={show} setShow={setShow} counts={showCounts} />}
            <span className="text-gray-500 tabular-nums">{rows.length} slabs</span>
            <CheckAll source={cc ? "cc" : "ebay"} listingIds={rows.filter((l) => (!l.grade_odds || l.grade_odds.status === "failed") && ["psa", "cgc", "bgs"].includes(l.grader) && (l.image_count == null || l.image_count >= 2)).map((l) => l.listing_id)} />
          </div>

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className={FROZEN_BOX}>
              <table className="w-full text-xs">
                <thead className={`text-gray-500 text-left ${FROZEN_HEAD}`}>
                  <tr>
                    {cols.visible.map((id) => {
                      const c = REGRADE_BY_ID.get(id)!;
                      return <th key={id} title={c.title} className={`py-2 font-medium whitespace-nowrap ${id === "card" ? "px-3" : "px-2"} ${c.right ? "text-right" : ""}`}>{c.label}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {page.map((l, i) => {
                    const day = sort === "ending" ? dayLabel(l.ends_at) : "";
                    const head = sort === "ending" && (i === 0 || dayLabel(page[i - 1].ends_at) !== day);
                    const x: RCtx = { cc, review: reviewOf(l), onReview: (r) => setRv((m) => ({ ...m, [l.listing_id]: r })) };
                    return (
                      <Fragment key={l.listing_id}>
                        {head && <tr className="border-t border-gray-800 bg-gray-950/60"><td colSpan={cols.visible.length} className="py-1.5 px-3 text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{day}</td></tr>}
                        <tr className="border-t border-gray-800 align-top">
                          {cols.visible.map((id) => {
                            const c = REGRADE_BY_ID.get(id)!;
                            return <td key={id} className={id === "card" ? "py-1.5 px-3" : c.right ? TDN : "py-1.5 px-2"}>{c.td(l, x)}</td>;
                          })}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <AutoMore remaining={rows.length - shown} page={PAGE} onMore={() => setShown((v) => v + PAGE)} />
            </div>
          )}
          <details className="text-[11px] text-gray-500 max-w-4xl">
            <summary className="cursor-pointer text-gray-400">Regrade rates in use (edit in Settings)</summary>
            <div className="mt-1 tabular-nums">
              {rep.rates.map((r) => `${gradeLabel(r.from)} → ${r.to.toUpperCase()} ${pc(r.rate)}`).join(" · ")} · cracking damage {pc(rep.crack_damage_pct)}
            </div>
          </details>
          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method}</p>
        </>
      )}
    </div>
  );
}

function Play({ p }: { p: RegradePlay }) {
  const top = p.to === "psa" ? "PSA 10" : "CGC 10+";
  return (
    <div className="whitespace-nowrap tabular-nums" title={[p.reason, p.basis ? `Basis: ${p.basis}` : "", p.odds_ratio ? `This copy: ${p.odds_ratio.toFixed(2)}× the odds of a typical slab of its grade` : "", p.note].filter(Boolean).join("\n")}>
      <span className="text-gray-400">→ {p.to.toUpperCase()}</span>{" "}
      <span className={p.rate_source === "measured" || p.rate_source === "predictor" ? "text-green-300" : p.rate_source === "centering_cap" ? "text-red-300" : "text-gray-300"}>
        {pc(p.rate)} {top}
      </span>
      {p.rate_source === "measured" && <span className="text-[10px] text-gray-500"> (base {pc(p.base_rate)})</span>}
      {p.rate_source === "predictor" && <span className="text-[10px] text-gray-500"> (crack outcomes)</span>}
      {p.rate_source === "centering_cap" && <span className="text-[10px] text-red-300/80"> centering cap</span>}
      {p.reason && <div className="text-[10px] text-gray-500 max-w-[18rem] truncate">{p.reason}</div>}
      {" · "}
      <span className={p.ev_cents >= 0 ? "text-green-300" : "text-red-300"}>{usd(p.ev_cents)}</span>
      <span className="text-[10px] text-gray-500"> {p.roi >= 0 ? "+" : ""}{(p.roi * 100).toFixed(0)}%</span>
      <span className="text-[10px] text-gray-500" title="The share back at the top grade needed to break even at this cost">
        {" · needs "}{p.break_even_rate > 1 ? "never pays" : pc(p.break_even_rate)}
      </span>
    </div>
  );
}

const MEASURABLE = new Set(["psa", "cgc", "bgs"]);

const TDN = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";

interface RCtx { cc?: boolean; review?: HitReview; onReview: (r: HitReview | undefined) => void }
interface RegradeCol extends ColMeta { right?: boolean; td: (l: RegradeListing, x: RCtx) => ReactNode }

function centerOK(l: RegradeListing, f: CenterF): boolean {
  const v = centeringVerdict(l.grade_odds, peekBands(l.display_key));
  if (!v) return false;
  return f === "clean" ? v.band === "green" : v.band !== "red";
}

function Later({ p }: { p?: LaterPlay }) {
  if (!p) return <span className="text-gray-600" title="No price projection for this card (or no slab market)">–</span>;
  const what = p.action === "hold" ? "sell as is" : `crack → ${p.action.toUpperCase()}`;
  const tip = [p.note, p.basis ? `Projection: ${p.basis}` : "", `Cost of money while held: ${usd(p.capital_cents)}`,
    `PSA 10 ${p.ten_drift >= 0 ? "+" : ""}${(p.ten_drift * 100).toFixed(0)}% · this slab ${p.slab_drift >= 0 ? "+" : ""}${(p.slab_drift * 100).toFixed(0)}% by then`].filter(Boolean).join("\n");
  return (
    <span className="inline-flex flex-col items-end" title={tip}>
      <span className={`font-semibold ${p.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(p.ev_cents)}</span>
      <span className="text-[10px] text-gray-400 whitespace-nowrap">{what} in {p.months} mo</span>
      <span className={`text-[10px] ${p.beats_now_cents > 0 ? "text-sky-300" : "text-gray-500"}`}>
        {p.beats_now_cents > 0 ? `+${usd(p.beats_now_cents)} vs today` : "today is better"}
      </span>
    </span>
  );
}

const REGRADE_COLS: RegradeCol[] = [
  {
    id: "card", label: "Card", locked: true,
    td: (l) => (
      <div className="flex gap-2 items-start min-w-[15rem]">
        {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
        <div className="min-w-0">
          <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
          <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
          {l.watched && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200" title="On your watchlist">watching</span>}
          {l.review?.status === "interested" && !l.review.result && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">bidding</span>}
          {l.review?.status === "shortlist" && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200">interested</span>}
          {l.url
            ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
            : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
          <ItemNumber n={l.item_number} />
        </div>
      </div>
    ),
  },
  {
    id: "action", label: "Action", title: "Bid (with your max) or pass; then report won / lost",
    td: (l, x) => x.cc ? <a href={l.url} target="_blank" rel="noreferrer" className="text-indigo-300/80 hover:text-indigo-200">Buy on CC ↗</a>
      : <ActionCell listingId={l.listing_id} displayKey={l.display_key} priceCents={l.price_cents} review={x.review}
        shown={{ grade_key: l.grade_key, add_cents: l.add_cents, hold_cents: l.hold_cents, best: l.best, plays: l.plays, odds: l.grade_odds }} onChange={x.onReview} />,
  },
  { id: "slab", label: "Slab", td: (l) => <span className="whitespace-nowrap px-1.5 py-0.5 rounded border border-gray-700 text-gray-200">{gradeLabel(l.grade_key)}</span> },
  { id: "seller", label: "Seller", td: (l) => <span className="whitespace-nowrap text-gray-400">{l.seller_label}</span> },
  {
    id: "ends", label: "Ends",
    td: (l) => <span className="whitespace-nowrap text-gray-300">{l.kind === "auction" ? <>{endsAt(l.ends_at)}{l.bids != null && <div className="text-[10px] text-gray-500">{l.bids} bids</div>}</> : <span className="text-gray-400">Buy Now</span>}</span>,
  },
  { id: "now", label: "Now", right: true, title: "Ask or current bid, with its listed shipping", td: (l) => <span className="text-gray-400">{usd(l.price_cents)}</span> },
  {
    id: "cost", label: "Your cost", right: true, title: "Item (auctions: the slab's market, its expected close) + what it adds to an order from the consigner",
    td: (l) => <span className="text-gray-100" title={l.notes?.join("\n")}>{usd(l.add_cents)}{l.expected && <div className="text-[10px] text-gray-500">expected close</div>}</span>,
  },
  {
    id: "slab_market", label: "Slab market", right: true, title: "This slab grade's 90-day market, your cost against it, and what selling it as is nets",
    td: (l) => {
      const v = l.vs_hold;
      return (
        <span className="text-gray-300">
          {usd(l.hold_cents)}
          {v != null && <div className={`text-[10px] ${v <= 0.9 ? "text-green-300" : v <= 1 ? "text-green-300/70" : "text-gray-500"}`}>{v <= 1 ? `${Math.round((1 - v) * 100)}% under` : `${Math.round((v - 1) * 100)}% over`}</div>}
          {l.hold_ev_cents != null && <div className={`text-[10px] ${l.hold_ev_cents >= 0 ? "text-green-300/80" : "text-gray-500"}`} title="Sell the slab as is: market after the selling fee, minus your cost">hold {usd(l.hold_ev_cents)}</div>}
        </span>
      );
    },
  },
  {
    id: "cost_to_make", label: "Cost to make", right: true,
    title: "What the slab cost its grader to make: the raw card + the grading fee and shipping. Under it, the seller is eating the grading fees: you get the slab for less than a raw copy plus grading.",
    td: (l) => {
      if (l.cost_to_make_cents == null) return <span className="text-gray-600">–</span>;
      const u = l.under_cost_to_make_cents ?? 0;
      return (
        <span className="text-gray-300" title={l.cost_to_make_note}>
          {usd(l.cost_to_make_cents)}
          <div className={`text-[10px] ${u > 0 ? "text-green-300" : "text-gray-500"}`}>{u > 0 ? `${usd(u)} under` : `${usd(-u)} over`}</div>
        </span>
      );
    },
  },
  {
    id: "psa10", label: "PSA 10", right: true, title: "PSA 10 market and the card's PSA gem rate",
    td: (l) => <span className="text-gray-300">{usd(l.psa10_cents)}{l.psa_gem_rate != null && l.psa_gem_rate > 0 && <div className="text-[10px] text-gray-500">gem {pc(l.psa_gem_rate)}</div>}</span>,
  },
  {
    id: "raw", label: "Raw", right: true, title: "The raw card's market and your cost for this slab against it: what buying a raw copy to grade costs instead",
    td: (l) => l.raw_cents ? <span className="text-gray-300">{usd(l.raw_cents)}<div className="text-[10px] text-gray-500" title="Your cost for this slab ÷ the raw card's market">slab {(l.add_cents / l.raw_cents).toFixed(1)}× raw</div></span> : <span className="text-gray-600">–</span>,
  },
  {
    id: "centering", label: "Centering", title: "The slab's measured centering (from its photos), colored against PSA 10: green not deducted, amber noticed, red past PSA's limit. A PSA 9 that's all green may be under-graded.",
    td: (l) => <CenteringCell o={l.grade_odds} dk={l.display_key} />,
  },
  {
    id: "plays", label: "Regrade plays", title: "Each regrade play: share expected back at the top grade and the EV after the buy, fees and the selling fee. Hover for the working.",
    td: (l) => l.plays?.length ? <>{l.plays.map((p) => <Play key={p.to} p={p} />)}</> : <span className="text-gray-600" title={l.notes?.join("\n")}>–</span>,
  },
  {
    id: "photos", label: "Photos",
    td: (l, x) => l.grade_odds && l.grade_odds.status !== "failed" ? <GradeOddsBadge o={l.grade_odds} compact />
      : MEASURABLE.has(l.grader) ? <CheckCentering listingId={l.listing_id} photos={l.image_count} source={x.cc ? "cc" : "ebay"} />
      : <span className="text-[11px] text-gray-600" title="The pre-grader measures PSA, CGC and BGS slabs only">not measurable</span>,
  },
  {
    id: "later", label: "Later", right: true,
    title: "Hold now and act later: the best of selling as is or cracking to PSA / CGC at 3-24 months, on the card's projected prices, less the cost of money while held. Hover for the working.",
    td: (l) => <Later p={l.later} />,
  },
  {
    id: "best", label: "Best EV", right: true,
    td: (l) => <span className={`font-semibold ${l.best == null ? "text-gray-600" : l.best.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`}>
      {l.best ? <>{usd(l.best.ev_cents)}<div className="text-[10px] font-normal text-gray-500">→ {l.best.to.toUpperCase()}</div></> : "–"}
    </span>,
  },
];
const REGRADE_BY_ID = new Map(REGRADE_COLS.map((c) => [c.id, c]));
const REGRADE_DEFAULTS = ["card", "action", "slab", "seller", "ends", "now", "cost", "slab_market", "cost_to_make", "psa10", "raw", "centering", "plays", "photos", "later", "best"];
