import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { checkListingGradeOdds, fetchWatchHunt, type GradeOdds, type HuntListing, type HuntListingsReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";
import AdjEVCell, { OddsFlag } from "./AdjEVCell";

// Hunt list across consigners and raw sellers: every raw copy they have
// listed of a tracked or watched card, priced at what the copy costs in an
// order from them and ranked by the grade-later return at that price. The
// one page of raw copies worth checking.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null, digits = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const PAGE = 100;

function endsIn(iso?: string) {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3.6e6;
  if (h <= 0) return "ending";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

export default function HuntListings({ seller, setSeller }: { seller: string; setSeller: (s: string) => void }) {
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [years, setYears] = useState(5);
  const [gradeEarly, setGradeEarly] = useState(0.5);
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [beatOnly, setBeatOnly] = useState(true);
  const [hideSlow, setHideSlow] = useState(false);
  const [sort, setSort] = useState<"score" | "adj_ev" | "grade_later">("score");
  const [shown, setShown] = useState(PAGE);
  const [rep, setRep] = useState<HuntListingsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchWatchHunt({ years, gradeAt: Math.max(0, years - gradeEarly), feeGrowth: 0.03, valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source, years, gradeEarly]);

  const rows = useMemo(() => {
    const out = (rep?.listings ?? []).filter((l) =>
      (!seller || l.seller === seller) && (!kind || l.kind === kind) && (!beatOnly || l.beats_benchmark) && (!hideSlow || !l.slow));
    const val = (l: HuntListing) => sort === "adj_ev" ? l.adj_ev?.ev_cents : sort === "grade_later" ? l.grade_later?.yearly : l.score;
    return sort === "score" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [rep, seller, kind, beatOnly, hideSlow, sort]);
  useEffect(() => setShown(PAGE), [seller, kind, beatOnly, hideSlow]);

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
                <option value="score">Hunt score</option><option value="adj_ev">Adj. EV (pre-grade odds)</option><option value="grade_later">Grade later, yearly</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={beatOnly} onChange={(e) => setBeatOnly(e.target.checked)} /> Beats the S&amp;P ({pct(rep.params.benchmark)}/yr) only</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={hideSlow} onChange={(e) => setHideSlow(e.target.checked)} /> Hide slow sellers</label>
            <span className="text-gray-500 tabular-nums">{rows.length} copies{rep.passed > 0 && ` · ${rep.passed} passed on hidden`}</span>
          </div>

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left max-lg:!static">
                  <tr>
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium">Seller</th>
                    <th className="py-2 px-2 font-medium">Type</th>
                    <th className="py-2 px-2 font-medium text-right" title="Ask or current bid, with its listed shipping">Now</th>
                    <th className="py-2 px-2 font-medium text-right" title="Item (auctions: expected close) + what it adds to an order's shipping">Your cost</th>
                    <th className="py-2 px-2 font-medium text-right" title="Raw market (eBay sold by default) and your cost against it">Raw market</th>
                    <th className="py-2 px-2 font-medium text-right">PSA 10</th>
                    <th className="py-2 px-2 font-medium text-right" title="PSA population 10 rate">10 odds</th>
                    <th className="py-2 px-2 font-medium">Pre-grade</th>
                    <th className="py-2 px-2 font-medium text-right" title="Grading EV with odds for this copy: measured from its photos, or the card's baseline until it's measured. Hover a value for the working.">Adj. EV</th>
                    <th className="py-2 px-2 font-medium text-right text-gray-300" title="Grade later at this copy's cost: yearly return">Grade later</th>
                    <th className="py-2 px-2 font-medium text-right" title="Grade now, sell when it's back: ROI at this cost">Flip now</th>
                    <th className="py-2 px-2 font-medium text-right" title="Grade later and it comes back a 10: profit">If it 10s</th>
                    <th className="py-2 px-3 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody>{rows.slice(0, shown).map((l) => <Row key={l.listing_id} l={l} bench={rep.params.benchmark} />)}</tbody>
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

function Row({ l, bench }: { l: HuntListing; bench: number }) {
  const td = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";
  const y = l.grade_later?.yearly;
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-1.5 px-3">
        <div className="flex gap-2 items-start min-w-[15rem]">
          {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
          <div className="min-w-0">
            <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
            <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
            {l.slow && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="PSA 10s sell less than once a month">slow</span>}
            {l.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
            {l.review?.status === "interested" && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">interested</span>}
            {l.url
              ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
              : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
          </div>
        </div>
      </td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">{l.seller_label}</td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">
        {l.kind === "auction" ? <>Auction · {endsIn(l.ends_at)}{l.bids != null && <span className="text-gray-600"> · {l.bids} bids</span>}</> : "Buy Now"}
      </td>
      <td className={`${td} text-gray-400`}>{usd(l.price_cents)}</td>
      <td className={`${td} text-gray-100`} title={l.notes?.join("\n")}>
        {usd(l.add_cents)}
        {l.expected && <div className="text-[10px] text-gray-500">expected close</div>}
      </td>
      <td className={`${td} text-gray-300`}>
        {usd(l.raw_market_cents)}
        <div className={`text-[10px] ${l.vs_raw <= 1 ? "text-green-300/80" : "text-gray-500"}`}>{l.vs_raw <= 1 ? `${Math.round((1 - l.vs_raw) * 100)}% under` : `${Math.round((l.vs_raw - 1) * 100)}% over`}</div>
      </td>
      <td className={`${td} text-gray-300`}>{usd(l.psa10_cents)}</td>
      <td className={`${td} text-gray-300`}>{l.p10 ? `${Math.round(l.p10 * 100)}%` : "–"}</td>
      <td className="py-1.5 px-2">
        {l.grade_odds
          ? <span className="inline-flex flex-wrap items-center gap-1"><GradeOddsBadge o={l.grade_odds} compact /><OddsFlag odds={l.grade_odds} shown={l.adj_ev} /></span>
          : <CheckCentering listingId={l.listing_id} photos={l.image_count} />}
      </td>
      <td className="py-1.5 px-2 text-right"><AdjEVCell ev={l.adj_ev} /></td>
      <td className={`${td} font-semibold ${y == null ? "text-gray-600" : y < 0 ? "text-red-300" : y >= bench ? "text-green-300" : "text-gray-300"}`}>{pct(y, 1)}</td>
      <td className={`${td} ${l.flip_now && l.flip_now.roi > 0 ? "text-gray-200" : "text-red-300"}`}>{l.flip_now ? pct(l.flip_now.roi) : "–"}</td>
      <td className={`${td} text-gray-300`}>{usd(l.if_ten_profit_cents)}</td>
      <td className="py-1.5 px-3 text-right tabular-nums text-white">{pct(l.score, 1)}</td>
    </tr>
  );
}

// Not sent yet: send this one listing's photos to the grading predictor.
function CheckCentering({ listingId, photos }: { listingId: string; photos?: number }) {
  const [busy, setBusy] = useState(false);
  const [odds, setOdds] = useState<GradeOdds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (odds) return <GradeOddsBadge o={odds} compact />;
  if (photos != null && photos < 2) return <span className="text-gray-600 text-[11px]" title="Needs a front and a back photo">1 photo</span>;
  return (
    <span className="text-[11px]">
      <button disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try { setOdds(await checkListingGradeOdds(listingId)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
        }}
        title="Send this listing's first two photos (front, back) to the grading predictor; the odds show here in a few minutes"
        className="px-1.5 py-0.5 rounded border border-gray-700 text-indigo-300 hover:text-indigo-200 hover:border-indigo-700 disabled:opacity-50">
        {busy ? "sending…" : "check centering"}
      </button>
      {err && <span className="block text-red-300" title={err}>couldn't send</span>}
    </span>
  );
}
