import type { SellSpeed } from "../lib/api";

// How fast a Fanatics Buy Now of a card + grade sells: for "if I list it at
// the lowest price, how long until it goes?".

export const SELL_SPEED_HELP = (
  <>
    <div className="font-semibold text-gray-100">How fast a Fanatics Buy Now sells</div>
    <ul className="mt-1 list-disc pl-4 space-y-1">
      <li><span className="text-gray-100">Sells N/wk</span>: Fanatics Buy Now sales of this card and grade a week, last 90 days (sold, not listed).</li>
      <li><span className="text-gray-100">~N days at lowest</span>: 7 ÷ that rate. Listed at the lowest ask you're first in line, so that's about the wait. Not the cheapest: the copies listed under you go first.</li>
      <li><span className="text-gray-100">N listed</span>: live Fanatics Buy Nows now: the competition.</li>
      <li><span className="text-gray-100">Seen: N days</span>: Buy Nows that sold, matched to a listing we watched (same card, grade and price, gone at the sale), median days from first seen to sold. A floor: some were up before we first saw them, and listings are tracked from October 2026, so it fills in week by week.</li>
    </ul>
    <p className="mt-1 text-gray-500">The all-channel "sells N/wk" under Pressure counts every sale (auctions, Buy Now, eBay): how much the market absorbs, not how fast one Buy Now goes.</p>
  </>
);

export function SellSpeedCell({ s }: { s?: SellSpeed }) {
  if (!s) return <span className="text-gray-700">—</span>;
  const d = s.days_per_sale;
  const color = d == null ? "text-gray-500" : d <= 3 ? "text-green-400" : d <= 14 ? "text-gray-200" : "text-amber-300";
  return (
    <span className="whitespace-nowrap">
      <span className={`font-medium ${color}`}>{d == null ? "none sold" : d < 1 ? "< 1 day" : `~${d < 10 ? d.toFixed(1) : Math.round(d)} days`}</span>
      <div className="text-[10px] text-gray-500">
        sells {s.bin_sold_per_week.toFixed(1)}/wk · {s.bin_listed} listed
      </div>
      {s.observed_days_listed != null && (
        <div className="text-[10px] text-gray-500" title={`${s.observed_n} sold Buy Now${s.observed_n === 1 ? "" : "s"} we watched (a floor)`}>
          seen: {s.observed_days_listed.toFixed(1)} days ({s.observed_n})
        </div>
      )}
    </span>
  );
}
