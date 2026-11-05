import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCardChannels, type CardChannels } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import RatioStrip, { StripAxis, fmtX } from "./RatioStrip";

const GRADES = [["psa-10", "PSA 10"], ["psa-9", "PSA 9"], ["cgc-10", "CGC 10"], ["cgc-10-pristine", "CGC Pristine 10"], ["bgs-9.5", "BGS 9.5"], ["tag-10", "TAG 10"]] as const;

const usd = (c: number) => {
  if (c <= 0) return "–";
  const d = c >= 10000 ? 0 : 2;
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

const BASIS: Record<string, string> = {
  grade_and_band: "this grade and price band",
  band: "this price band, every grade",
  grade: "this grade, every price",
  channel: "the whole channel",
};

// Expected final price for one card and grade through each sell channel:
// the card's market × that channel's spread (see the Sell channels page).
export default function CardChannelsPanel({ displayKey }: { displayKey: string }) {
  const [grade, setGrade] = useState("psa-10");
  const [data, setData] = useState<CardChannels | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setErr(null);
    fetchCardChannels(displayKey, grade).then(setData).catch((e) => setErr(String(e)));
  }, [displayKey, grade]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded border border-gray-700 overflow-hidden text-sm">
          {GRADES.map(([g, label]) => (
            <button key={g} onClick={() => setGrade(g)}
              className={`px-3 py-1 ${grade === g ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <Link to="/channels" className="text-xs text-indigo-300 hover:text-indigo-200">Every card: Sell channels →</Link>
      </div>

      {err && <ErrorMsg msg={err} />}
      {!data && !err && <Spinner />}
      {data && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3 overflow-x-auto">
          <div className="text-sm text-gray-300">
            Market <span className="text-white font-semibold tabular-nums">{usd(data.market_cents)}</span>
            {data.market_sales > 0 && <span className="text-xs text-gray-500"> · median of {data.market_sales} sales (what buyers paid)</span>}
            {data.note && <div className="text-xs text-amber-300/80 mt-0.5">{data.note}</div>}
          </div>
          <table className="w-full">
            <thead className="max-lg:!static">
              <tr className="text-[11px] text-gray-500 text-left">
                <th className="pb-1 pr-3 font-medium">Selling through</th>
                <th className="pb-1 px-2 font-medium text-right">Expect</th>
                <th className="pb-1 px-2 font-medium text-right hidden sm:table-cell">Middle half</th>
                <th className="pb-1 px-2 font-medium text-right hidden md:table-cell">10–90%</th>
                <th className="pb-1 pl-2 font-medium w-[34%] min-w-[12rem]"><StripAxis /></th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((c) => (
                <tr key={c.channel} className="border-t border-gray-800 align-middle">
                  <td className="py-2 pr-3">
                    <div className="text-sm text-gray-100">{c.label}</div>
                    <div className="text-[11px] text-gray-500">
                      {c.seller_ratio ? <>{fmtX(c.seller_ratio.p50)} of market · from {BASIS[c.basis] ?? c.basis} ({c.basis_n.toLocaleString()})</> : "no sales placed"}
                      {c.card_seller_ratio && (
                        <span className="text-gray-400"> · this card: {fmtX(c.card_seller_ratio.p50)} over {c.card_seller_ratio.n}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-sm text-white whitespace-nowrap">{usd(c.expected_cents)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-xs text-gray-400 whitespace-nowrap hidden sm:table-cell">
                    {c.expected_cents ? `${usd(c.p25_cents)}–${usd(c.p75_cents)}` : ""}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">
                    {c.expected_cents ? `${usd(c.p10_cents)}–${usd(c.p90_cents)}` : ""}
                  </td>
                  <td className="py-2 pl-2"><RatioStrip d={c.seller_ratio} title={c.label} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500">
            What the seller gets before fees (Fanatics auctions: the hammer, before the buyer's premium). Ratios come from the most specific
            group with 20+ sales: this grade and price band, then the price band, the grade, the whole channel.
          </p>
        </section>
      )}
    </div>
  );
}
