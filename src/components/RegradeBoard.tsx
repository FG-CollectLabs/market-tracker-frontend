import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRegrade, type RegradeListing, type RegradePlay, type RegradeReport, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";

// Graded side of the Consigner board: slabs below the premium grade from the
// tracked consigners, each priced as a crack-and-resubmit (PSA, CGC; CGC 10s
// for Pristine) against just holding the slab. Shafted copies: a good-looking
// PSA 9 that should have been a 10, a BGS 9.5 or TAG 10 that crosses to a
// PSA 10, a CGC 10 that reshoots Pristine.

const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`);
const pc = (v?: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);
const PAGE = 150;
const DAY = 864e5;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

type Ending = "" | "today" | "tomorrow" | "48h" | "week";
type Sort = "ending" | "best_ev" | "roi" | "discount";

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

export default function RegradeBoard({ seller, setSeller }: { seller: string; setSeller: (s: string) => void }) {
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [grader, setGrader] = useState("");
  const [ending, setEnding] = useState<Ending>("");
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [posOnly, setPosOnly] = useState(true);
  const [sort, setSort] = useState<Sort>("best_ev");
  const [shown, setShown] = useState(PAGE);
  const [rep, setRep] = useState<RegradeReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchRegrade({ valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [source]);

  const rows = useMemo(() => {
    const until = endsBefore(ending);
    const out = (rep?.listings ?? []).filter((l) =>
      (!seller || l.seller === seller) && (!grader || l.grader === grader) && (!kind || l.kind === kind) &&
      (!ending || (l.ends_at && new Date(l.ends_at).getTime() < until)) && (!posOnly || (l.best?.ev_cents ?? -1) > 0));
    const val = (l: RegradeListing) => sort === "best_ev" ? l.best?.ev_cents : sort === "roi" ? l.best?.roi
      : sort === "discount" ? (l.vs_hold == null ? undefined : -l.vs_hold) : undefined;
    return sort === "ending" ? out : [...out].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  }, [rep, seller, grader, kind, ending, posOnly, sort]);
  useEffect(() => setShown(PAGE), [seller, grader, kind, ending, posOnly, sort]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  const page = rows.slice(0, shown);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of rep?.listings ?? []) m.set(l.grader, (m.get(l.grader) ?? 0) + 1);
    return m;
  }, [rep]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Slabs below the premium grade from your consigners, each priced as cracked and resubmitted (to PSA, to CGC; CGC 10s for Pristine)
        against just holding the slab. The odds start from Settings&apos; regrade rates, which are assumptions until your outcomes come in;
        once the pre-grader measures a slab&apos;s photos they move with how that copy compares with a typical one, and a PSA centering cap
        below 10 rules out the PSA play.
      </p>

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Pricing every consigner slab…</div>}
      {rep && (
        <>
          <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
            {[{ username: "", label: "All consigners", priced: rep.sellers.reduce((a, s) => a + s.priced, 0), beat: rep.sellers.reduce((a, s) => a + s.beat, 0) }, ...rep.sellers].map((s) => (
              <button key={s.username || "all"} onClick={() => setSeller(s.username)}
                className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${seller === s.username ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                {s.label} <span className="text-xs text-gray-500 tabular-nums" title="regrade EV positive · slabs priced"><span className="text-green-400/90">{s.beat}</span> / {s.priced}</span>
              </button>
            ))}
            {loading && <span className="text-xs text-gray-500 px-2 pb-2">Loading…</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <div className="inline-flex rounded border border-gray-700 overflow-hidden" role="group" aria-label="Grader">
              {GRADERS.map(([k, l]) => (
                <button key={k || "all"} onClick={() => setGrader(k)} aria-pressed={grader === k}
                  className={`px-2 py-1 ${grader === k ? "bg-gray-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>
                  {l}{k && <span className="text-gray-500"> {counts.get(k) ?? 0}</span>}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5">Ending
              <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)} className={sel}>
                <option value="">Any time (incl. Buy Now)</option><option value="today">Today</option><option value="tomorrow">Today + tomorrow</option>
                <option value="48h">Next 48 hours</option><option value="week">Next 7 days</option>
              </select>
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={sel}>
              <option value="">Auctions + Buy Now</option><option value="auction">Auctions</option><option value="buy_now">Buy Now</option>
            </select>
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel}>
                <option value="best_ev">Best regrade EV</option><option value="roi">Best regrade ROI</option><option value="discount">Cheapest vs slab market</option><option value="ending">Ending soonest</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={posOnly} onChange={(e) => setPosOnly(e.target.checked)} /> Regrade EV positive only</label>
            <label className="flex items-center gap-1.5">Prices
              <select value={source} onChange={(e) => setSource(e.target.value as ValueSource | "")} className={sel}>
                <option value="ebay">eBay sold</option><option value="comps">Sold comps</option><option value="pricecharting">PriceCharting</option><option value="">Settings default</option>
              </select>
            </label>
            <span className="text-gray-500 tabular-nums">{rows.length} slabs{rep.passed > 0 && ` · ${rep.passed} passed on hidden`}</span>
          </div>

          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left max-lg:!static">
                  <tr>
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium">Slab</th>
                    <th className="py-2 px-2 font-medium">Seller</th>
                    <th className="py-2 px-2 font-medium">Ends</th>
                    <th className="py-2 px-2 font-medium text-right" title="Ask or current bid, with its listed shipping">Now</th>
                    <th className="py-2 px-2 font-medium text-right" title="Item (auctions: the slab's market, its expected close) + what it adds to an order from the consigner">Your cost</th>
                    <th className="py-2 px-2 font-medium text-right" title="This slab grade's 90-day market, your cost against it, and what selling it as is nets">Slab market</th>
                    <th className="py-2 px-2 font-medium text-right" title="PSA 10 market and the card's PSA gem rate">PSA 10</th>
                    <th className="py-2 px-2 font-medium" title="Each regrade play: share expected back at the top grade and the EV after the buy, fees and the selling fee. Hover for the working.">Regrade plays</th>
                    <th className="py-2 px-2 font-medium">Photos</th>
                    <th className="py-2 px-3 font-medium text-right">Best EV</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((l, i) => {
                    const day = sort === "ending" ? dayLabel(l.ends_at) : "";
                    const head = sort === "ending" && (i === 0 || dayLabel(page[i - 1].ends_at) !== day);
                    return (
                      <Fragment key={l.listing_id}>
                        {head && <tr className="border-t border-gray-800 bg-gray-950/60"><td colSpan={11} className="py-1.5 px-3 text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{day}</td></tr>}
                        <Row l={l} />
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
    <div className="whitespace-nowrap tabular-nums" title={p.note}>
      <span className="text-gray-400">→ {p.to.toUpperCase()}</span>{" "}
      <span className={p.rate_source === "measured" ? "text-green-300" : p.rate_source === "centering_cap" ? "text-red-300" : "text-gray-300"}>
        {pc(p.rate)} {top}
      </span>
      {p.rate_source === "measured" && <span className="text-[10px] text-gray-500"> (base {pc(p.base_rate)})</span>}
      {p.rate_source === "centering_cap" && <span className="text-[10px] text-red-300/80"> centering cap</span>}
      {" · "}
      <span className={p.ev_cents >= 0 ? "text-green-300" : "text-red-300"}>{usd(p.ev_cents)}</span>
      <span className="text-[10px] text-gray-500"> {p.roi >= 0 ? "+" : ""}{(p.roi * 100).toFixed(0)}%</span>
      <span className="text-[10px] text-gray-500" title="The share back at the top grade needed to break even at this cost">
        {" · needs "}{p.break_even_rate > 1 ? "never pays" : pc(p.break_even_rate)}
      </span>
    </div>
  );
}

function Row({ l }: { l: RegradeListing }) {
  const td = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";
  const v = l.vs_hold;
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-1.5 px-3">
        <div className="flex gap-2 items-start min-w-[15rem]">
          {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
          <div className="min-w-0">
            <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
            <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
            {l.watched && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200" title="On your watchlist">watching</span>}
            {l.review?.status === "interested" && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">interested</span>}
            {l.url
              ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
              : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
          </div>
        </div>
      </td>
      <td className="py-1.5 px-2 whitespace-nowrap"><span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-200">{gradeLabel(l.grade_key)}</span></td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">{l.seller_label}</td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">
        {l.kind === "auction" ? <>{endsAt(l.ends_at)}{l.bids != null && <div className="text-[10px] text-gray-500">{l.bids} bids</div>}</> : <span className="text-gray-400">Buy Now</span>}
      </td>
      <td className={`${td} text-gray-400`}>{usd(l.price_cents)}</td>
      <td className={`${td} text-gray-100`} title={l.notes?.join("\n")}>
        {usd(l.add_cents)}
        {l.expected && <div className="text-[10px] text-gray-500">expected close</div>}
      </td>
      <td className={`${td} text-gray-300`}>
        {usd(l.hold_cents)}
        {v != null && <div className={`text-[10px] ${v <= 0.9 ? "text-green-300" : v <= 1 ? "text-green-300/70" : "text-gray-500"}`}>{v <= 1 ? `${Math.round((1 - v) * 100)}% under` : `${Math.round((v - 1) * 100)}% over`}</div>}
        {l.hold_ev_cents != null && <div className={`text-[10px] ${l.hold_ev_cents >= 0 ? "text-green-300/80" : "text-gray-500"}`} title="Sell the slab as is: market after the selling fee, minus your cost">hold {usd(l.hold_ev_cents)}</div>}
      </td>
      <td className={`${td} text-gray-300`}>
        {usd(l.psa10_cents)}
        {l.psa_gem_rate != null && l.psa_gem_rate > 0 && <div className="text-[10px] text-gray-500">gem {pc(l.psa_gem_rate)}</div>}
      </td>
      <td className="py-1.5 px-2">{l.plays?.length ? l.plays.map((p) => <Play key={p.to} p={p} />) : <span className="text-gray-600" title={l.notes?.join("\n")}>–</span>}</td>
      <td className="py-1.5 px-2">
        {l.grade_odds ? <GradeOddsBadge o={l.grade_odds} compact /> : <span className="text-[11px] text-gray-600" title="Slab photos go to the pre-grader once it accepts slabs">not measured</span>}
      </td>
      <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap font-semibold ${l.best == null ? "text-gray-600" : l.best.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`}>
        {l.best ? <>{usd(l.best.ev_cents)}<div className="text-[10px] font-normal text-gray-500">→ {l.best.to.toUpperCase()}</div></> : "–"}
      </td>
    </tr>
  );
}
