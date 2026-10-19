import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEndingSoon, type EndingAuction } from "../lib/api";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import { HelpDot } from "./HelpTip";
import { Spinner, ErrorMsg } from "./Spinner";

// Ending soon: every live Fanatics auction closing in the next few hours,
// its current bid against what the card + grade is worth. For the last
// hour on the watchlist and for snipes on auctions nobody is watching.

const money = (c?: number | null) => formatCents(c ?? null);
const GRADE: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine" };
const gradeLabel = (g: string) => GRADE[g] ?? g.toUpperCase().replace("-", " ");

function endsIn(iso: string, now: number): string {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return "ending";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ago(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

type Sort = "discount" | "ends" | "value";

export default function EndingSoonTab({ lang }: { lang: "" | "en" | "ja" | "zh" }) {
  const [hours, setHours] = useState(3);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchEndingSoon>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [minDisc, setMinDisc] = useState(0);
  const [noBids, setNoBids] = useState(false);
  const [sort, setSort] = useState<Sort>("discount");
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(null);
    fetchEndingSoon(hours).then(setData).catch((e: Error) => setError(e.message));
  }, [hours, tick]);
  // Refresh every 2 minutes; the clock every 30 s.
  useEffect(() => {
    const a = setInterval(() => setTick((t) => t + 1), 120_000);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const rows = useMemo(() => {
    const langOf = (code: string) => (code.startsWith("jp-") ? "ja" : code.startsWith("cn-") ? "zh" : "en");
    const xs = (data?.auctions ?? []).filter((a) =>
      (!lang || langOf(a.set_code) === lang) && (!watchedOnly || a.watched) && (!noBids || a.bids === 0) &&
      (minDisc <= 0 || (a.discount ?? -9) >= minDisc / 100));
    const key: Record<Sort, (a: EndingAuction) => number> = {
      discount: (a) => -(a.discount ?? -9),
      ends: (a) => new Date(a.ends_at).getTime(),
      value: (a) => -(a.value_cents ?? 0),
    };
    return [...xs].sort((a, b) => key[sort](a) - key[sort](b));
  }, [data, lang, watchedOnly, noBids, minDisc, sort]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const premium = Math.round(data.settings.buyers_premium_pct * 100);
  const margin = Math.round(data.settings.target_margin * 100);
  const oldest = data.auctions.reduce((m, a) => (a.bid_seen_at < m ? a.bid_seen_at : m), new Date().toISOString());

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 max-w-4xl">
        Every Fanatics auction closing soon, its current bid against what the card is worth (the Pricing API's estimate from recent sales, all-in).
        Bids are refreshed about 2 h and 1 h before the weekly close (Sunday 7 pm Pacific); between refreshes they can be stale, so check the
        listing before bidding. This page reloads every 2 minutes.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {[1, 2, 3, 6, 24, 72].map((h) => (
            <button key={h} onClick={() => setHours(h)}
              className={`px-3 py-1 ${hours === h ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{h < 24 ? `${h} h` : `${h / 24} d`}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-400">
          <input type="checkbox" checked={watchedOnly} onChange={(e) => setWatchedOnly(e.target.checked)} className="accent-indigo-500" /> Watchlist only
        </label>
        <label className="flex items-center gap-1.5 text-gray-400" title="Nobody has bid yet: the ones people aren't paying attention to">
          <input type="checkbox" checked={noBids} onChange={(e) => setNoBids(e.target.checked)} className="accent-indigo-500" /> No bids yet
        </label>
        <label className="flex items-center gap-1.5 text-gray-400">
          at least
          <input type="number" value={minDisc} onChange={(e) => setMinDisc(Number(e.target.value) || 0)}
            className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" />% under value
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200">
          <option value="discount">Most under value</option>
          <option value="ends">Ending first</option>
          <option value="value">Highest value</option>
        </select>
        <button onClick={() => setTick((t) => t + 1)} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">Reload</button>
        <span className="text-gray-500">{rows.length} of {data.count} · oldest bid read {ago(oldest, now)}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">No auctions match in the next {hours} h.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-right px-3 py-2 font-medium">Ends in</th>
                <th className="text-right px-3 py-2 font-medium">Current bid<HelpDot help={`The highest bid when last read, and what you'd pay at it with the ${premium}% buyer's premium.`} /></th>
                <th className="text-right px-3 py-2 font-medium">Worth<HelpDot help="The Pricing API's estimate for this card and grade: a weighted median of recent sales (all-in), with PriceCharting when it agrees. Hover a value for its range." /></th>
                <th className="text-right px-3 py-2 font-medium">Under value<HelpDot help="1 − all-in at the current bid ÷ worth. Positive: you'd pay less than it's worth if the bidding stopped now." /></th>
                <th className="text-right px-3 py-2 font-medium">Bid up to<HelpDot help={`Whole-dollar bids: the most that pays exactly the value all-in, and the most that still leaves your ${margin}% margin.`} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((a, i) => {
                const d = a.discount;
                return (
                  <tr key={a.url ?? i} className={`align-top hover:bg-gray-900/40 ${a.watched ? "border-l-4 border-l-yellow-500" : "border-l-4 border-l-transparent"}`}>
                    <td className="pl-3 py-2 w-12">
                      {a.image_url ? <img src={cardThumb(a.image_url)} alt="" loading="lazy" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/cards/${encodeURIComponent(a.display_key)}`} className="text-gray-100 hover:text-indigo-300">{a.name}</Link>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-mono">{a.set_code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</span>
                        <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{gradeLabel(a.grade)}</span>
                        {a.watched && <span className="ml-1.5 text-yellow-300">★ watchlist</span>}
                        {a.in_prep && <span className="ml-1.5 text-indigo-300">{a.in_prep === "auction" ? "in late bids" : "in early bids"}</span>}
                        {a.marketplace === "premier" && <span className="ml-1.5 text-amber-300">premier</span>}
                      </div>
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-300 hover:underline">open auction ↗</a>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300 whitespace-nowrap">{endsIn(a.ends_at, now)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="text-gray-100">{money(a.bid_cents)} <span className="text-gray-500">· {a.bids} bid{a.bids === 1 ? "" : "s"}</span></div>
                      <div className="text-[10px] text-gray-500">{money(a.all_in_cents)} all-in · read {ago(a.bid_seen_at, now)}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={a.low_cents != null ? `Range ${money(a.low_cents)}–${money(a.high_cents)}` : undefined}>
                      <div className="text-gray-100">{money(a.value_cents)}</div>
                      <div className="text-[10px] text-gray-500">{a.value_source ?? "no value"}{a.confidence ? ` · ${a.confidence}` : ""}</div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${d == null ? "text-gray-600" : d >= 0.3 ? "text-green-400" : d >= 0.1 ? "text-green-300/80" : d >= 0 ? "text-gray-300" : "text-red-400"}`}>
                      {d == null ? "—" : `${Math.abs(Math.round(d * 100))}% ${d >= 0 ? "under" : "over"}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.max_bid_at_margin_cents != null ? (
                        <>
                          <div className="text-green-400 font-medium" title={`Keeps your ${margin}% margin`}>{money(a.max_bid_at_margin_cents)}</div>
                          <div className="text-[10px] text-gray-500" title="Pays exactly the value all-in">{money(a.max_bid_at_value_cents)} at value</div>
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
