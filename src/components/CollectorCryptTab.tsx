import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCCDeals, type CCDeal } from "../lib/api";
import { formatCents } from "../lib/roi";
import { HelpDot } from "./HelpTip";
import { Spinner, ErrorMsg } from "./Spinner";

// Collector Crypt deals: slabs listed there under what they sell for, to buy,
// redeem to your door and resell on eBay. We don't sell there. The watcher
// reads new listings every 2 minutes and pings Discord when one clears the
// alert rules (Settings → Collector Crypt).

const money = (c?: number | null) => formatCents(c ?? null);
const GRADE: Record<string, string> = { "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine", "bgs-10-black": "BGS Black" };
const gradeLabel = (g: string) => GRADE[g] ?? g.toUpperCase().replace("-", " ");

function ago(iso?: string): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

type Sort = "margin" | "profit" | "newest" | "discount";

export default function CollectorCryptTab({ lang }: { lang: "" | "en" | "ja" | "zh" }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchCCDeals>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minMargin, setMinMargin] = useState(10);
  const [days, setDays] = useState(7);
  const [minSales, setMinSales] = useState(3);
  const [sort, setSort] = useState<Sort>("margin");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    fetchCCDeals({ minMargin: minMargin / 100, days, limit: 500 })
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [minMargin, days, tick]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 120_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => {
    const langOf = (code: string) => (code.startsWith("jp-") ? "ja" : code.startsWith("cn-") ? "zh" : "en");
    const xs = (data?.deals ?? []).filter((d) => (!lang || langOf(d.set_code) === lang) && (d.value_sales ?? 0) >= minSales);
    const key: Record<Sort, (d: CCDeal) => number> = {
      margin: (d) => -(d.margin ?? -9),
      profit: (d) => -(d.profit_cents ?? -1e9),
      newest: (d) => -new Date(d.listed_at).getTime(),
      discount: (d) => -(d.discount ?? -9),
    };
    return [...xs].sort((a, b) => key[sort](a) - key[sort](b));
  }, [data, lang, minSales, sort]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const r = data.settings;
  const st = data.status;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 max-w-4xl">
        Slabs on <a href="https://collectorcrypt.com/marketplace/cards" target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">Collector Crypt</a> listed
        under what they sell for: buy there, redeem to your door, resell on eBay. Every new listing is checked within about 2 minutes;
        one that clears {pct(r.alert_min_margin)} margin and {money(r.alert_min_profit_cents)} profit on a value with {r.alert_min_sales}+ sales, and costs at least {pct(r.alert_min_under_bin ?? 0.1)} less all-in than the cheapest Buy Now on Fanatics or eBay, is sent to Discord.
        Check the slab and cert before buying: the value is ours, the listing is theirs.
      </p>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs ${st.last_error ? "border-red-900/70 bg-red-950/30" : "border-gray-800 bg-gray-900/40"}`}>
        <span className="font-semibold text-gray-300">Watcher</span>
        <span className="text-gray-400">last check {ago(st.last_poll)} ({st.last_poll_listings} new)</span>
        <span className="text-gray-400">full sweep {ago(st.last_sweep)}{st.last_sweep ? ` (${st.last_sweep_listings})` : ""}</span>
        <span className={st.alerts_configured ? "text-green-400" : "text-amber-300"}>{st.alerts_configured ? "Discord alerts on" : "Discord alerts off (no webhook)"}</span>
        {st.last_error && <span className="text-red-400" title={st.last_error}>last error: {st.last_error.slice(0, 80)}</span>}
        <HelpDot help={<>
          <div className="font-semibold text-gray-100">How a deal is worked out</div>
          <div className="my-1.5 rounded bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-200">
            cost = ask × (1 + {pct(r.buyer_fee_pct)} buyer fee) + {pct(r.redeem_pct)} of ask redemption + {money(r.redeem_flat_cents)} redemption shipping
            <br />eBay net = our value × (1 − {pct(r.resale_fee_pct)} fees) − {money(r.resale_ship_cents)} shipping
            <br />profit = eBay net − cost; margin = profit ÷ cost
          </div>
          <p>Our value is the Pricing API's for that card and grade (recent sales, all-in), with the number of sales behind it. Listings are matched to our catalog by number, name, set and language; cards we don't track (vintage, most Japanese non-chase cards) aren't shown.</p>
          <p className="mt-1">Fees are in Settings → Collector Crypt. Redemption fees vary (2-3% + shipping by region): check their redeem screen and tune.</p>
        </>} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-gray-400">margin at least
          <input type="number" value={minMargin} onChange={(e) => setMinMargin(Number(e.target.value) || 0)} className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" />%
        </label>
        <label className="flex items-center gap-1.5 text-gray-400" title="Sales behind our value: fewer means the value is a guess">at least
          <input type="number" min={0} value={minSales} onChange={(e) => setMinSales(Math.max(0, Number(e.target.value) || 0))} className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" /> sales
        </label>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200">
          <option value={1}>Listed today</option>
          <option value={7}>Listed this week</option>
          <option value={30}>Listed this month</option>
          <option value={365}>Any time</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200">
          <option value="margin">Best margin</option>
          <option value="profit">Most profit</option>
          <option value="discount">Most under value</option>
          <option value="newest">Newest</option>
        </select>
        <span className="text-gray-500">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing clears that margin right now.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-right px-3 py-2 font-medium">Ask</th>
                <th className="text-right px-3 py-2 font-medium">Worth<HelpDot help="Our value for this card and grade (Pricing API: recent sales, all-in) and the sales behind it; Collector Crypt's own insured value below." /></th>
                <th className="text-right px-3 py-2 font-medium">Under value</th>
                <th className="text-right px-3 py-2 font-medium">Cheapest Buy Now<HelpDot help="The cheapest live Buy Now for this card and grade on Fanatics or eBay (eBay asks under a fifth of value left out as wrong matches), and how far under it the all-in cost here is. A card that's as cheap elsewhere isn't a Collector Crypt deal." /></th>
                <th className="text-right px-3 py-2 font-medium">All-in cost<HelpDot help="The ask plus the buyer fee, the redemption fee and redemption shipping to your door." /></th>
                <th className="text-right px-3 py-2 font-medium">eBay net</th>
                <th className="text-right px-3 py-2 font-medium">Profit</th>
                <th className="text-right px-3 py-2 font-medium">Listed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((d) => {
                const m = d.margin ?? 0;
                return (
                  <tr key={d.nft_address} className={`align-top hover:bg-gray-900/40 ${d.alerted_at ? "bg-emerald-950/20" : ""}`}>
                    <td className="pl-3 py-2 w-12">
                      {d.image_url ? <img src={d.image_url} alt="" loading="lazy" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/cards/${encodeURIComponent(d.display_key)}`} className="text-gray-100 hover:text-indigo-300">{d.name}</Link>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-mono">{d.set_code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</span>
                        <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{gradeLabel(d.grade)}</span>
                        {d.cert_number && <span className="ml-1.5 font-mono">cert {d.cert_number}</span>}
                        {d.alerted_at && <span className="ml-1.5 text-emerald-300" title={`Sent to Discord ${ago(d.alerted_at)}`}>alerted</span>}
                      </div>
                      <div className="text-[10px] text-gray-600 max-w-md truncate" title={d.title}>{d.title}</div>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-300 hover:underline">open on Collector Crypt ↗</a>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-100">{money(d.ask_cents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="text-gray-100">{money(d.value_cents)}</div>
                      <div className="text-[10px] text-gray-500">{d.value_sales ?? 0} sales{d.value_source ? ` · ${d.value_source}` : ""}</div>
                      {d.insured_cents != null && <div className="text-[10px] text-gray-600" title="Collector Crypt's own value">theirs {money(d.insured_cents)}</div>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${(d.discount ?? 0) >= 0.3 ? "text-green-400" : (d.discount ?? 0) >= 0.1 ? "text-green-300/80" : "text-gray-400"}`}>
                      {d.discount != null ? `${Math.round(d.discount * 100)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(() => {
                        const f = d.fanatics_bin_low_cents, e = d.ebay_bin_low_cents;
                        const low = f != null && (e == null || f <= e) ? { c: f, src: "Fanatics" } : e != null ? { c: e, src: "eBay" } : null;
                        if (!low) return <span className="text-gray-600">none listed</span>;
                        const u = d.under_bin ?? 0;
                        return (
                          <>
                            <div className="text-gray-200">{money(low.c)}</div>
                            <div className="text-[10px] text-gray-500">{low.src}</div>
                            <div className={`text-[10px] ${u >= r.alert_min_under_bin ? "text-green-400" : u >= 0 ? "text-gray-400" : "text-red-400"}`}>
                              {u >= 0 ? `${Math.round(u * 100)}% under it` : `${Math.round(-u * 100)}% over it`}
                            </div>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">{money(d.cost_cents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">{money(d.resale_net_cents)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${m >= r.alert_min_margin ? "text-green-400" : m >= 0 ? "text-gray-200" : "text-red-400"}`}>
                      {money(d.profit_cents)}
                      <div className="text-[10px] font-normal text-gray-500">{m >= 0 ? "+" : ""}{Math.round(m * 100)}%</div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400 whitespace-nowrap">{ago(d.listed_at)}</td>
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
