import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDeals, type Deal } from "../lib/api";
import { formatCents } from "../lib/roi";
import { ACTION_STYLE } from "../components/BuyingGuide";
import { Spinner, ErrorMsg } from "../components/Spinner";

const KINDS = [
  { key: "", label: "All" },
  { key: "bid_auction", label: "Bid on auctions" },
  { key: "buy_now", label: "Buy Now under max" },
  { key: "buy_raw_to_grade", label: "Buy raw to grade" },
  { key: "buy_psa10", label: "Buy PSA 10s" },
];

const KIND_LABEL: Record<string, string> = {
  bid_auction: "Bid",
  buy_now: "Buy Now",
  buy_raw_to_grade: "Grade raw",
  buy_psa10: "Buy PSA 10",
};

// Every tracked card's live buying opportunities, ranked. The same list the
// agent's find_deals tool returns.
export default function DealsPage() {
  const [kind, setKind] = useState("");
  const [target, setTarget] = useState(20);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeals(null);
    setError(null);
    fetchDeals({ kind: kind || undefined, targetMargin: target / 100, limit: 200 })
      .then((r) => setDeals(r.deals))
      .catch((e: Error) => setError(e.message));
  }, [kind, target]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Deals</h1>
        <p className="text-sm text-gray-500">
          Live opportunities across every tracked card: Fanatics auctions expected to close under your max bid, Buy Nows listed under it, raw cards worth
          grading, and PSA 10s that cost less than grading for one. Margin is after the resale fee (grading: EV after fees).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => setKind(k.key)}
              className={`px-3 py-1 ${kind === k.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-400">
          Target margin
          <input type="number" min={0} max={200} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)}
            className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
        </label>
      </div>
      {error && <ErrorMsg msg={error} />}
      {!deals && !error && <Spinner />}
      {deals && deals.length === 0 && <p className="text-sm text-gray-500">Nothing clears your margin right now.</p>}
      {deals && deals.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Card</th>
                <th className="text-left px-3 py-2 font-medium">Do</th>
                <th className="text-left px-3 py-2 font-medium">Why</th>
                <th className="text-right px-3 py-2 font-medium">Max</th>
                <th className="text-right px-3 py-2 font-medium">Market</th>
                <th className="text-right px-3 py-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {deals.map((d, i) => (
                <tr key={i} className="align-top hover:bg-gray-900/40">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link to={`/cards/${encodeURIComponent(d.display_key)}`} className="text-gray-100 hover:text-indigo-300">{d.name}</Link>
                    <div className="text-[11px] text-gray-500 font-mono">{d.set_code.replace(/^jp-/, "JP ").toUpperCase()}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[11px] font-medium ${ACTION_STYLE[d.action.kind]}`}>{KIND_LABEL[d.action.kind] ?? d.action.kind}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400 max-w-xl">
                    <div className="text-gray-200">{d.action.headline}</div>
                    {d.action.why}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-100">{d.action.max_cents != null ? formatCents(d.action.max_cents) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">{d.market_cents ? formatCents(d.market_cents) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-400">{`${d.margin > 0 ? "+" : ""}${(d.margin * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
