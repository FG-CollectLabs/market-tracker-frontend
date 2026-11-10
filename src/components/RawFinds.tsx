import { AutoMore, CheckAll } from "./BoardTools";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWatchlist, type HitReview, type TargetHit, type WatchItem } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";
import AdjEVCell, { CGCCell, OddsFlag, PSAOddsCell } from "./AdjEVCell";
import { CheckCentering } from "./HuntListings";
import ActionCell, { ExplainChip, ShowFilter, countShows, showOf, type Show } from "./ActionCell";
import { ItemNumber } from "./BidCells";
import { useOddsReload } from "../lib/useOddsReload";

// Raw finds: every Raw to grade hit on the watchlist, from any eBay seller,
// in one list ranked by how much better the copy measures than the card's
// gem rate (the pre-grader's adjusted PSA 10 odds minus the public rate).
// The undervalued gradables are the measured copies well above their card.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const PAGE = 150;
const DAY = 864e5;

type Row = { item: WatchItem; h: TargetHit };
type Sort = "lift" | "best_ev" | "ending" | "under";
type Ending = "" | "24h" | "48h" | "week";
type Measured = "" | "measured" | "above5" | "above15" | "above30" | "unmeasured";

// lift: adjusted PSA 10 odds minus the gem rate, measured copies only.
const lift = (h: TargetHit) => {
  const a = h.adj_ev;
  if (!a || a.ev_source !== "measured" || a.population_p10 == null) return null;
  return a.p10 - a.population_p10;
};
const bestEv = (h: TargetHit) => {
  const p = h.adj_ev?.ev_cents, c = h.adj_ev?.cgc?.ev_cents;
  return p == null ? c : c == null ? p : Math.max(p, c);
};

function endsIn(iso?: string) {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3.6e6;
  if (h <= 0) return "ending";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

export default function RawFinds() {
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("lift");
  const [ending, setEnding] = useState<Ending>("");
  const [measured, setMeasured] = useState<Measured>("above15");
  const [evPos, setEvPos] = useState(true);
  const [show, setShow] = useState<Show>("open");
  const [shown, setShown] = useState(PAGE);
  const [rv, setRv] = useState<Record<string, HitReview | undefined>>({});
  const oddsReload = useOddsReload();

  useEffect(() => {
    let live = true;
    fetchWatchlist(false, true).then((r) => live && setItems(r.items)).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
  }, [oddsReload]);

  const reviewOf = (h: TargetHit) => (h.listing_id in rv ? rv[h.listing_id] : h.review);

  const all = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const item of items ?? []) {
      for (const t of item.targets_detail ?? []) {
        if (t.target !== "raw_grade") continue;
        for (const h of t.hits ?? []) {
          if (h.source !== "ebay" || seen.has(h.listing_id)) continue;
          seen.add(h.listing_id);
          out.push({ item, h });
        }
      }
    }
    return out;
  }, [items]);

  const base = useMemo(() => {
    const until = ending === "24h" ? Date.now() + DAY : ending === "48h" ? Date.now() + 2 * DAY : ending === "week" ? Date.now() + 7 * DAY : Infinity;
    return all.filter(({ h }) => {
      if (ending && !(h.kind === "auction" && h.ends_at && new Date(h.ends_at).getTime() < until)) return false;
      const l = lift(h);
      if (measured === "measured" && l == null) return false;
      if (measured === "unmeasured" && l != null) return false;
      if (measured === "above5" && !(l != null && l >= 0.05)) return false;
      if (measured === "above15" && !(l != null && l >= 0.15)) return false;
      if (measured === "above30" && !(l != null && l >= 0.3)) return false;
      if (evPos && !((bestEv(h) ?? -1) > 0)) return false;
      return true;
    });
  }, [all, ending, measured, evPos]);
  const counts = useMemo(() => countShows(base, (r) => reviewOf(r.h)), [base, rv]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const out = base.filter((r) => show === "all" || showOf(reviewOf(r.h)) === show);
    const end = (h: TargetHit) => (h.kind === "auction" && h.ends_at ? new Date(h.ends_at).getTime() : Infinity);
    const val = (r: Row) => sort === "lift" ? lift(r.h) : sort === "best_ev" ? bestEv(r.h) : sort === "under" ? (r.h.max_cents - r.h.all_in_cents) / Math.max(1, r.h.max_cents) : null;
    return [...out].sort((a, b) => sort === "ending" ? end(a.h) - end(b.h) : (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [base, show, rv, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [sort, ending, measured, evPos, show]);

  if (err) return <ErrorMsg msg={err} />;
  if (!items) return <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Loading the watchlist…</div>;

  const nMeasured = all.filter((r) => lift(r.h) != null).length;
  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Every Raw to grade hit on your watchlist, from any eBay seller, ranked by how much better the copy measures than its card:
        the pre-grader's adjusted PSA 10 odds minus the public gem rate. A big positive gap on a cheap copy is the undervalued gradable.
        {" "}<span className="text-gray-500">{nMeasured} of {all.length} hits are measured from their photos; the rest show the card's gem rate until they are (use "check centering").</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <label className="flex items-center gap-1.5">Copies
          <select value={measured} onChange={(e) => setMeasured(e.target.value as Measured)} className={sel}>
            <option value="above15">Measured 15+ pts above the gem rate</option>
            <option value="above30">Measured 30+ pts above</option>
            <option value="above5">Measured 5+ pts above</option>
            <option value="measured">Measured (any)</option>
            <option value="unmeasured">Not measured yet</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">Ending
          <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)} className={sel}>
            <option value="">Any (incl. Buy Now)</option><option value="24h">Auctions, next 24 hours</option>
            <option value="48h">Auctions, next 48 hours</option><option value="week">Auctions, next 7 days</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={evPos} onChange={(e) => setEvPos(e.target.checked)} /> Grading EV positive (PSA or CGC)</label>
        <label className="flex items-center gap-1.5">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel}>
            <option value="lift">Odds above the gem rate</option><option value="best_ev">Best grading EV</option>
            <option value="under">Furthest under your max</option><option value="ending">Ending soonest</option>
          </select>
        </label>
        <ShowFilter show={show} setShow={setShow} counts={counts} />
        <span className="text-gray-500 tabular-nums">{rows.length} copies</span>
            <CheckAll listingIds={rows.filter(({ h }) => !h.grade_odds && (h.image_count == null || h.image_count >= 2)).map(({ h }) => h.listing_id)} />
      </div>

      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 px-3 font-medium">Card</th>
                <th className="py-2 px-2 font-medium" title="Bid (with your max) or pass; then report won / lost">Action</th>
                <th className="py-2 px-2 font-medium">Seller</th>
                <th className="py-2 px-2 font-medium">Type</th>
                <th className="py-2 px-2 font-medium text-right" title="What it costs all-in, and your Raw to grade max for the card">Price · max</th>
                <th className="py-2 px-2 font-medium text-right" title="Adjusted PSA 10 odds minus the card's gem rate (measured copies)">Above gem</th>
                <th className="py-2 px-2 font-medium text-right">PSA 10 odds</th>
                <th className="py-2 px-2 font-medium">Pre-grade</th>
                <th className="py-2 px-2 font-medium text-right">PSA EV</th>
                <th className="py-2 px-3 font-medium text-right">CGC</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map(({ item, h }) => {
                const l = lift(h);
                const under = h.all_in_cents <= h.max_cents;
                return (
                  <tr key={h.listing_id} className="border-t border-gray-800 align-top">
                    <td className="py-1.5 px-3">
                      <div className="flex gap-2 items-start min-w-[15rem]">
                        {(h.image_url || item.image_url) && <img src={h.image_url || item.image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
                        <div className="min-w-0">
                          <Link to={`/cards/${item.display_key}`} className="text-gray-100 hover:text-indigo-300">{item.name}</Link>
                          <span className="text-gray-500"> #{item.number} · {item.set_code}</span>
                          {h.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
                          {h.url
                            ? <a href={h.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{h.title}</a>
                            : <div className="truncate max-w-[22rem] text-gray-500">{h.title}</div>}
                          <ItemNumber n={h.listing_id.split("|")[1]} />
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <ActionCell listingId={h.listing_id} displayKey={item.display_key} priceCents={h.price_cents} review={reviewOf(h)}
                        shown={{ adj_ev: h.adj_ev, odds: h.grade_odds, all_in_cents: h.all_in_cents, max_cents: h.max_cents }}
                        onChange={(r) => setRv((m) => ({ ...m, [h.listing_id]: r }))} />
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">{h.seller ?? "–"}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">
                      {h.kind === "auction" ? <>Auction · {endsIn(h.ends_at)}{h.bids != null && <span className="text-gray-600"> · {h.bids} bids</span>}</> : "Buy Now"}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      <span className="text-gray-100">{usd(h.all_in_cents)}</span>
                      <div className={`text-[10px] ${under ? "text-green-300/80" : "text-gray-500"}`}>max {usd(h.max_cents)}</div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {l == null ? <span className="text-gray-600">–</span>
                        : <span className={`font-semibold ${l >= 0.15 ? "text-green-300" : l > 0 ? "text-green-300/70" : "text-red-300"}`}>{l > 0 ? "+" : ""}{Math.round(l * 100)} pts</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap"><PSAOddsCell ev={h.adj_ev} /></td>
                    <td className="py-1.5 px-2">
                      {h.grade_odds
                        ? <><span className="inline-flex flex-wrap items-center gap-1"><GradeOddsBadge o={h.grade_odds} compact /><OddsFlag odds={h.grade_odds} shown={h.adj_ev} /></span>
                            <ExplainChip e={h.grade_odds.explain?.PSA} /></>
                        : <CheckCentering listingId={h.listing_id} photos={h.image_count} />}
                    </td>
                    <td className="py-1.5 px-2 text-right"><AdjEVCell ev={h.adj_ev} /></td>
                    <td className="py-1.5 px-3 text-right"><CGCCell ev={h.adj_ev} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <AutoMore remaining={rows.length - shown} page={PAGE} onMore={() => setShown((v) => v + PAGE)} />
        </div>
      )}
    </div>
  );
}
