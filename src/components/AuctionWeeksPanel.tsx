import { useEffect, useState } from "react";
import { fetchAuctionWeeks, type AuctionWeeks } from "../lib/api";
import { formatCents } from "../lib/roi";
import { Spinner, ErrorMsg } from "./Spinner";

const GRADES = [
  { key: "psa-10", label: "PSA 10" },
  { key: "psa-9", label: "PSA 9" },
  { key: "cgc-10", label: "CGC 10" },
  { key: "cgc-10-pristine", label: "CGC Pristine 10" },
];

const m = (c?: number) => (c == null ? "—" : formatCents(c));

// Bid helper: each recent week's Fanatics auctions for one grade, next to
// what a raw copy cost that week and what grading it would have cost (the
// floor a slab is up against). Shows whether a slab is a short-term flip
// (auctions closing over the floor) or priced like the copies people make.
export default function AuctionWeeksPanel({ displayKey }: { displayKey: string }) {
  const [grade, setGrade] = useState("psa-10");
  const [d, setD] = useState<AuctionWeeks | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    setError(null);
    fetchAuctionWeeks(displayKey, grade).then(setD).catch((e: Error) => setError(e.message));
  }, [displayKey, grade]);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Bid helper: auctions by week</h3>
          <p className="text-xs text-gray-500 max-w-3xl">
            What each week's Fanatics auctions closed at (all-in = with the 20% premium; hammer = the winning bid), beside the raw price that week,
            raw + grading fees (one graded copy) and the cost to make this grade by grading (misses resold).
          </p>
        </div>
        <div className="inline-flex rounded border border-gray-700 overflow-hidden text-xs">
          {GRADES.map((g) => (
            <button key={g.key} onClick={() => setGrade(g.key)}
              className={`px-2.5 py-1 ${grade === g.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorMsg msg={error} />}
      {!d && !error && <Spinner />}
      {d && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-300">
            <span><span className="text-gray-500">Closing this week</span> {d.this_week_auctions}</span>
            <span><span className="text-gray-500">Listed for next week</span> {d.next_week_auctions}</span>
            <span><span className="text-gray-500">Usually sold</span> ~{d.avg_auctions_per_week.toFixed(1)}/wk</span>
            <span>
              <span className="text-gray-500">Buy Nows listed</span> {d.buy_now_listings}
              {d.buy_now_low_cents != null && <> from {m(d.buy_now_low_cents)}</>}
              {d.weeks_of_supply != null && (
                <span className={d.weeks_of_supply >= 8 ? "text-amber-300" : ""}> · {d.weeks_of_supply >= 52 ? "52+" : d.weeks_of_supply.toFixed(0)} weeks of supply</span>
              )}
            </span>
            {d.grader && (
              <span>
                <span className="text-gray-500">Grading</span> {d.grader.toUpperCase()} {d.tier} {m(d.fee_cents)} + {m(d.ship_cents)} shipping
                {d.gem_rate != null && <> · {(d.gem_rate * 100).toFixed(0)}% hit this grade</>}
              </span>
            )}
          </div>
          {d.weeks.length === 0 ? (
            <p className="text-xs text-gray-500">No sales at this grade in the last 26 weeks.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left py-1 pr-3 font-medium">Week of</th>
                    <th className="text-right py-1 pr-3 font-medium">Auctions</th>
                    <th className="text-right py-1 pr-3 font-medium">Median all-in</th>
                    <th className="text-right py-1 pr-3 font-medium">Hammer</th>
                    <th className="text-right py-1 pr-3 font-medium">Range</th>
                    <th className="text-right py-1 pr-3 font-medium">Buy Now sold</th>
                    <th className="text-right py-1 pr-3 font-medium">eBay sold</th>
                    <th className="text-right py-1 pr-3 font-medium">Raw</th>
                    <th className="text-right py-1 pr-3 font-medium" title="Raw (with sourcing premium) + grading fee + shipping: one graded copy">Raw + grading</th>
                    <th className="text-right py-1 font-medium" title="What it cost to make this grade by grading, after reselling the misses">Make one</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {d.weeks.map((w) => {
                    const under = w.auction_median_all_in_cents != null && w.make_ten_cents != null && w.auction_median_all_in_cents < w.make_ten_cents;
                    return (
                      <tr key={w.week}>
                        <td className="py-1.5 pr-3 text-gray-400">{w.week}</td>
                        <td className="py-1.5 pr-3 text-right">{w.auctions || "—"}</td>
                        <td className={`py-1.5 pr-3 text-right ${under ? "text-green-400" : ""}`}
                          title={under ? "Auctions closed under the cost to make one by grading" : undefined}>{m(w.auction_median_all_in_cents)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-400">{m(w.auction_median_hammer_cents)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-500">
                          {w.auctions > 1 ? `${m(w.auction_low_all_in_cents)}–${m(w.auction_high_all_in_cents)}` : "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{w.buy_now_sales ? `${w.buy_now_sales} · ${m(w.buy_now_median_cents)}` : "—"}</td>
                        <td className="py-1.5 pr-3 text-right">{w.ebay_sales ? `${w.ebay_sales} · ${m(w.ebay_median_cents)}` : "—"}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-400">{m(w.raw_cents)}</td>
                        <td className="py-1.5 pr-3 text-right">{m(w.floor_cents)}</td>
                        <td className="py-1.5 text-right">{m(w.make_ten_cents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-500">Green: auctions closed under the cost to make one, i.e. cheaper to buy the slab than to grade for it.</p>
        </>
      )}
    </section>
  );
}
