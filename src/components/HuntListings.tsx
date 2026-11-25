import { AutoMore, CheckAll } from "./BoardTools";
import { useOddsReload } from "../lib/useOddsReload";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWatchHunt, type HuntListing, type HuntListingsReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import { ShowFilter, countShows, showOf, type Show } from "./ActionCell";
import type { HitReview } from "../lib/api";
import { useColumns } from "../lib/useColumns";
import ColumnPicker, { FROZEN_BOX, FROZEN_HEAD } from "./ColumnPicker";
import { LISTING_COLS, ListingHead, ListingRow } from "./ListingColumns";
export { CheckCentering } from "./CheckCentering";

// Hunt list across consigners and raw sellers: every raw copy they have
// listed of a tracked or watched card, priced at what the copy costs in an
// order from them and ranked by the grade-later return at that price. The
// one page of raw copies worth checking.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null, digits = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const PAGE = 100;
const HUNT_COLS = ["card", "action", "seller", "type", "now", "cost", "max_bid", "raw", "psa10", "p10_odds", "pregrade", "review", "centering", "psa_ev", "cgc", "at_sale", "grade_later", "flip_now", "if_ten", "score"];

export default function HuntListings({ seller, setSeller }: { seller: string; setSeller: (s: string) => void }) {
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [years, setYears] = useState(5);
  const [gradeEarly, setGradeEarly] = useState(0.5);
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [beatOnly, setBeatOnly] = useState(true);
  const [hideSlow, setHideSlow] = useState(false);
  const [sort, setSort] = useState<"score" | "adj_ev" | "cgc_ev" | "best_ev" | "grade_later">("score");
  const [shown, setShown] = useState(PAGE);
  const [show, setShow] = useState<Show>("open");
  const [rv, setRv] = useState<Record<string, HitReview | undefined>>({});
  const reviewOf = (l: HuntListing) => (l.listing_id in rv ? rv[l.listing_id] : l.review);
  const [rep, setRep] = useState<HuntListingsReport | null>(null);
  const oddsReload = useOddsReload(); // ↻ on an odds badge: refetch so odds and EV recompute
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cols = useColumns("watchlist.hunt", LISTING_COLS, HUNT_COLS);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchWatchHunt({ years, gradeAt: Math.max(0, years - gradeEarly), feeGrowth: 0.03, valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source, years, gradeEarly, oddsReload]);

  const base = useMemo(() => (rep?.listings ?? []).filter((l) =>
    (!seller || l.seller === seller) && (!kind || l.kind === kind) && (!beatOnly || l.beats_benchmark) && (!hideSlow || !l.slow)),
  [rep, seller, kind, beatOnly, hideSlow]);
  const counts = useMemo(() => countShows(base, reviewOf), [base, rv]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out = base.filter((l) => show === "all" || showOf(reviewOf(l)) === show);
    const best = (l: HuntListing) => {
      const a = l.adj_ev?.ev_cents, c = l.adj_ev?.cgc?.ev_cents;
      return a == null ? c : c == null ? a : Math.max(a, c);
    };
    const val = (l: HuntListing) => sort === "adj_ev" ? l.adj_ev?.ev_cents : sort === "cgc_ev" ? l.adj_ev?.cgc?.ev_cents
      : sort === "best_ev" ? best(l) : sort === "grade_later" ? l.grade_later?.yearly : l.score;
    return sort === "score" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [base, show, rv, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [seller, kind, beatOnly, hideSlow, show]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  const cur = rep?.sellers.find((s) => s.username === seller);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Raw copies your consigners and raw sellers have listed, ranked by the <Link to="/" className="text-indigo-300 hover:text-indigo-200">set hunt lists</Link>,
        but priced at what each copy costs you: the item (auctions at their expected close, the raw market) plus what it adds to an order
        from that seller. Grading later is the play: buy raw now, grade {gradeEarly === 0.5 ? "6 months" : `${gradeEarly} year${gradeEarly === 1 ? "" : "s"}`} before selling at year {years}.
        Adj. EV prices grading each copy with the pre-grader's odds: measured from its photos once it's been checked (the best copies are
        sent automatically, a share of the daily cap), the card's baseline until then. Flag measured odds that look wrong; the pre-grader
        learns from it.
      </p>

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Pricing every listed copy (up to a minute the first time)…</div>}
      {rep && (
        <>
          <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
            {[{ username: "", label: "All sellers", beat: rep.sellers.reduce((a, s) => a + s.beat, 0), priced: rep.sellers.reduce((a, s) => a + s.priced, 0) }, ...rep.sellers].map((s) => (
              <button key={s.username || "all"} onClick={() => setSeller(s.username)}
                className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${seller === s.username ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                {s.label} <span className="text-xs text-gray-500 tabular-nums" title="beat the S&P graded later · priced"><span className="text-green-400/90">{s.beat}</span> / {s.priced}</span>
              </button>
            ))}
            {loading && <span className="text-xs text-gray-500 px-2 pb-2">Loading…</span>}
          </div>

          {cur && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400 flex flex-wrap justify-between gap-2">
              <div>{cur.ship_rule.text}{cur.ship_rule.note ? ` · ${cur.ship_rule.note}` : ""}</div>
              {cur.basket && (
                <div className="tabular-nums">
                  Every copy that beats the S&amp;P in one order: {cur.basket.items} for {usd(cur.basket.items_cents)} + {usd(cur.basket.ship_cents)} ship ={" "}
                  <span className="text-gray-100">{usd(cur.basket.total_cents)}</span> ({usd(cur.basket.per_card_cents)}/card)
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <label className="flex items-center gap-1.5">Prices
              <select value={source} onChange={(e) => setSource(e.target.value as ValueSource | "")} className={sel}>
                <option value="ebay">eBay sold</option><option value="comps">Sold comps</option><option value="pricecharting">PriceCharting</option><option value="">Settings default</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">Horizon
              <select value={years} onChange={(e) => setYears(Number(e.target.value))} className={sel}>
                {[3, 5, 7].map((y) => <option key={y} value={y}>{y} years</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">Grade
              <select value={gradeEarly} onChange={(e) => setGradeEarly(Number(e.target.value))} className={sel}>
                {[0.5, 1, 2].map((g) => <option key={g} value={g}>{g === 0.5 ? "6 months" : `${g} year${g === 1 ? "" : "s"}`} before selling</option>)}
              </select>
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={sel}>
              <option value="">Auctions + Buy Now</option><option value="auction">Auctions</option><option value="buy_now">Buy Now</option>
            </select>
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={sel}>
                <option value="score">Hunt score</option><option value="best_ev">Best EV (PSA or CGC)</option><option value="adj_ev">PSA EV (adjusted)</option><option value="cgc_ev">CGC EV (adjusted)</option><option value="grade_later">Grade later, yearly</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={beatOnly} onChange={(e) => setBeatOnly(e.target.checked)} /> Beats the S&amp;P ({pct(rep.params.benchmark)}/yr) only</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={hideSlow} onChange={(e) => setHideSlow(e.target.checked)} /> Hide slow sellers</label>
            <ShowFilter show={show} setShow={setShow} counts={counts} />
            <span className="text-gray-500 tabular-nums">{rows.length} copies</span>
            <ColumnPicker cols={cols} />
            <CheckAll listingIds={rows.filter((l) => !l.grade_odds && (l.image_count == null || l.image_count >= 2)).map((l) => l.listing_id)} />
          </div>

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className={FROZEN_BOX}>
              <table className="w-full text-xs">
                <thead className={`text-gray-500 text-left ${FROZEN_HEAD}`}>
                  <ListingHead ids={cols.visible} />
                </thead>
                <tbody>{rows.slice(0, shown).map((l) => <ListingRow key={l.listing_id} l={l} ids={cols.visible}
                  ctx={{ bench: rep.params.benchmark, review: reviewOf(l), onReview: (r) => setRv((m) => ({ ...m, [l.listing_id]: r })) }} />)}</tbody>
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
