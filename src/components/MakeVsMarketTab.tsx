import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMakeVsMarket, type MakeRow } from "../lib/api";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import HelpTip from "./HelpTip";
import { Spinner, ErrorMsg } from "./Spinner";

// Market vs cost to make: what each tracked PSA 10 / CGC 10 sells for
// against what it costs to make one by grading raw copies. Under the cost
// to make, buying the slab beats grading for it. The formula and every
// figure are shown so the model can be checked and tuned (Settings).

const money = (c?: number | null) => formatCents(c ?? null);
const pct = (v: number, d = 0) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const SOURCE: Record<string, string> = { pricecharting: "PriceCharting", ebay_sold_90d: "eBay sold median", sold_90d: "sold median" };

// The cost to make one row's 10, figure by figure.
function Working({ r }: { r: MakeRow }) {
  const m = r.make;
  const b = m.break_even_working;
  if (!b) return <span>No working.</span>;
  const grader = m.grader.toUpperCase();
  const line = (label: string, v: string, note?: string) => (
    <tr><td className="pr-3 text-gray-400">{label}</td><td className="text-right font-mono text-gray-100">{v}</td><td className="pl-2 text-gray-500">{note}</td></tr>
  );
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-gray-100">{r.name} · {grader} 10: cost to make {money(b.break_even_cents)}</div>
      <table className="tabular-nums">
        <tbody>
          {line("Raw copy", money(b.raw_cents))}
          {line("Cost per graded copy", money(b.cost_cents), `+${Math.round(m.sourcing_pct * 100)}% sourcing, ${money(m.fee_cents)} fee${m.tier ? ` (${m.tier})` : ""}, ${money(m.ship_cents)} shipping, ${m.turnaround_days} days of capital at ${Math.round(m.capital_rate * 100)}%/yr`)}
          {line("− Misses bring back", money(b.salvage_cents), `${m.p9 != null ? `${Math.round(m.p9 * 100)}% 9s at ${money(m.nine_cents)}` : "no 9 price"}; lower grades at raw; after the ${Math.round(b.sell_fee_pct * 100)}% fee`)}
          {line("÷ Share that's a 10", `${(b.ten_share * 100).toFixed(1)}%`, m.p_top != null ? `incl. ${(m.p_top * 100).toFixed(1)}% Pristine` : "public gem rate")}
          {line("= Cost per 10", money(b.cost_per_10_cents))}
          {line("÷ (1 − selling fee)", money(b.break_even_cents), `${Math.round(b.sell_fee_pct * 100)}% fee`)}
        </tbody>
      </table>
      <div className="text-gray-400">
        Sells for {money(r.market.cents)} ({SOURCE[r.market.source] ?? r.market.source}{r.market.basis?.sales_count ? `, ${r.market.basis.sales_count} sales in 90 days` : ""}):{" "}
        <span className={r.gap_pct < 0 ? "text-green-300" : "text-gray-200"}>{pct(r.gap_pct)} vs cost to make</span>
      </div>
      {m.nine_source && <div className="text-gray-500">9 price: {m.nine_source}</div>}
    </div>
  );
}

export default function MakeVsMarketTab({ lang }: { lang: "" | "en" | "ja" }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMakeVsMarket>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grader, setGrader] = useState<"" | "psa" | "cgc">("");
  const [under, setUnder] = useState(true);
  const [minSales, setMinSales] = useState(3);
  useEffect(() => {
    fetchMakeVsMarket().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) =>
    (!grader || r.grade.startsWith(grader)) &&
    (!lang || (lang === "ja") === r.set_code.startsWith("jp-")) &&
    (!under || r.gap_pct < 0) &&
    r.sales_90d >= minSales), [data, grader, lang, under, minSales]);
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 max-w-4xl">
        What each tracked PSA 10 and CGC 10 actually sells for, against what it costs to make one by grading raw copies at the public gem rate.
        Under the cost to make, buying the slab beats grading for it. Hover a cost for its working; the inputs (sourcing, capital, fees, grading tiers, 9 floors) are on the{" "}
        <Link to="/settings" className="text-indigo-300 hover:underline">Settings page</Link>.
      </p>
      <div className="rounded border border-gray-800 bg-gray-900/50 p-2 text-xs">
        <div className="mb-1 font-semibold text-gray-300">How the cost to make is worked out</div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-gray-300">{data.formula}</pre>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {([["", "PSA + CGC"], ["psa", "PSA 10"], ["cgc", "CGC 10"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setGrader(k)}
              className={`px-3 py-1 ${grader === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-400">
          <input type="checkbox" checked={under} onChange={(e) => setUnder(e.target.checked)} className="accent-indigo-500" />
          Only selling under the cost to make
        </label>
        <label className="flex items-center gap-1.5 text-gray-400" title="Sales of that grade in the last 90 days (Fanatics + eBay): fewer means the market price is less certain">
          at least
          <input type="number" min={0} value={minSales} onChange={(e) => setMinSales(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" /> sales in 90 days
        </label>
        <span className="text-gray-500">{rows.length} of {data.count}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-right px-3 py-2 font-medium" title="The market value the model uses, and where it comes from">Sells for</th>
                <th className="text-right px-3 py-2 font-medium">Cost to make</th>
                <th className="text-right px-3 py-2 font-medium" title="Sells for ÷ cost to make − 1. Negative: cheaper to buy than to grade for one.">vs cost</th>
                <th className="text-right px-3 py-2 font-medium" title="Cheapest live Buy Now (Fanatics or eBay)">Cheapest Buy Now</th>
                <th className="text-right px-3 py-2 font-medium" title="Gem rate (Pristine share for CGC) from the population report">10 rate</th>
                <th className="text-right px-3 py-2 font-medium" title="Raw market price used for the copies you'd grade">Raw</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((r) => {
                const m = r.make;
                return (
                  <tr key={r.display_key + r.grade} className="align-top hover:bg-gray-900/40">
                    <td className="pl-3 py-2 w-12">
                      {r.image_url ? <img src={cardThumb(r.image_url)} alt="" loading="lazy" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/cards/${encodeURIComponent(r.display_key)}`} className="text-gray-100 hover:text-indigo-300">{r.name}</Link>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-mono">{r.set_code.replace(/^jp-/, "JP ").toUpperCase()}</span>
                        <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{r.grade === "psa-10" ? "PSA 10" : "CGC 10"}</span>
                        {r.months_since_release != null && <span className="ml-1.5">month {Math.round(r.months_since_release)}</span>}
                        {!r.in_print && <span className="ml-1.5 text-sky-300">out of print</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="text-gray-100">{money(r.market.cents)}</div>
                      <div className="text-[10px] text-gray-500" title={r.market.basis?.note}>{SOURCE[r.market.source] ?? r.market.source} · {r.sales_90d} sold 90d</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <HelpTip help={<Working r={r} />} width="w-[30rem]">
                        <span tabIndex={0} className="cursor-help border-b border-dotted border-gray-500 text-gray-100">{money(r.break_even_cents)}</span>
                      </HelpTip>
                      {m.break_even_working && <div className="text-[10px] text-gray-500">{money(m.break_even_working.cost_per_10_cents)} per 10 before fee</div>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.gap_pct < -0.15 ? "text-green-400" : r.gap_pct < 0 ? "text-green-300/80" : "text-gray-400"}`}>{pct(r.gap_pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                      {r.cheapest_buy_now_cents != null ? (
                        <>
                          <div className={r.cheapest_buy_now_cents < r.break_even_cents ? "text-green-300" : ""}>{money(r.cheapest_buy_now_cents)}</div>
                          <div className="text-[10px] text-gray-500">{r.cheapest_buy_now_source} · {r.buy_now_listings} listed</div>
                        </>
                      ) : <span className="text-gray-600">none listed</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                      {(m.p10 * 100).toFixed(1)}%
                      {m.p_top != null && <div className="text-[10px] text-gray-500">+{(m.p_top * 100).toFixed(1)}% Pristine</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300">{money(m.break_even_working?.raw_cents)}</td>
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
