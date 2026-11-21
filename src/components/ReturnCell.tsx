import type { WatchReturns } from "../lib/api";
import { usd } from "../pages/SealedTimingPage";

// The sealed return a year bought at market vs at the best offer, held to the plan's exit.

const yr = (v?: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);
const tone = (v?: number | null) => (v == null ? "text-gray-500" : v >= 0.2 ? "text-emerald-300" : v >= 0.08 ? "text-amber-300" : "text-rose-300");

// a year at market → at the best offer (+ points), history path; then the flat-market case
export default function ReturnCell({ x }: { x?: WatchReturns }) {
  if (!x) return <span className="text-gray-600">–</span>;
  const title = `Sell ${x.sell_month} (${x.months_held} months; ${x.sell_why}): about ${usd(x.sell_cents)} (${usd(x.net_cents)} net), ` +
    `or ${usd(x.sell_flat_market_cents)} (${usd(x.net_flat_market_cents)} net) if the market goes flat. Bought at market ${usd(x.market_cents)}` +
    (x.offer_cents != null ? `; at ${x.offer_where} ${usd(x.offer_cents)}${x.discount_pct != null ? ` (${(x.discount_pct * 100).toFixed(0)}% ${x.discount_pct >= 0 ? "under" : "over"} market)` : ""}` : "") +
    `. Confidence ${x.confidence}.`;
  const gain = x.irr_gain_pts;
  return (
    <span title={title}>
      <span className={tone(x.irr_at_market)}>{yr(x.irr_at_market)}</span>
      {x.irr_at_offer != null && <> → <span className={`font-medium ${tone(x.irr_at_offer)}`}>{yr(x.irr_at_offer)}</span></>}
      {gain != null && Math.abs(gain) >= 0.005 && <span className={`ml-1 text-[10px] ${gain > 0 ? "text-emerald-300" : "text-rose-300"}`}>{gain > 0 ? "+" : ""}{(gain * 100).toFixed(0)} pts</span>}
      <div className="text-[10px] text-gray-500">flat market: {yr(x.irr_at_market_flat)}{x.irr_at_offer_flat != null ? ` → ${yr(x.irr_at_offer_flat)}` : ""} · sell {x.sell_month}</div>
    </span>
  );
}
