import { useEffect, useState } from "react";
import { fetchCardAnalysis, type BuyAction, type CardAnalysis, type GradeAnalysis } from "../lib/api";
import { formatCents } from "../lib/roi";
import { AsOf } from "./AsOf";
import { Spinner, ErrorMsg } from "./Spinner";

const GRADE_LABEL: Record<string, string> = {
  raw: "Raw",
  "psa-10": "PSA 10",
  "psa-9": "PSA 9",
  "cgc-10-pristine": "CGC Pristine 10",
  "cgc-10": "CGC 10",
};

const SOURCE_LABEL: Record<string, string> = {
  pricecharting: "PriceCharting",
  ebay_sold_90d: "eBay sold (90d median)",
  fanatics_bin: "cheapest Fanatics Buy Now",
};

export const ACTION_STYLE: Record<BuyAction["kind"], string> = {
  buy_raw_to_grade: "border-green-800 bg-green-950/40 text-green-200",
  buy_psa10: "border-sky-800 bg-sky-950/40 text-sky-200",
  bid_auction: "border-amber-800 bg-amber-950/40 text-amber-200",
  buy_now: "border-emerald-800 bg-emerald-950/40 text-emerald-200",
  watch: "border-gray-800 bg-gray-950/40 text-gray-300",
};

const money = (c?: number | null) => (c == null ? "—" : formatCents(c));
const pct = (v?: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`);

function Cell({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <td className={`py-1.5 pr-3 text-right tabular-nums ${dim ? "text-gray-500" : ""}`}>{children}</td>;
}

function GradeRow({ g }: { g: GradeAnalysis }) {
  const graded = g.grade !== "raw";
  return (
    <tr>
      <td className="py-1.5 pr-3 whitespace-nowrap text-gray-200">{GRADE_LABEL[g.grade] ?? g.grade}</td>
      <Cell>
        {g.market ? (
          <AsOf at={g.market.as_of} label={SOURCE_LABEL[g.market.source] ?? g.market.source}>
            <span title={SOURCE_LABEL[g.market.source] ?? g.market.source}>{money(g.market.cents)}</span>
          </AsOf>
        ) : "—"}
        {g.market && g.market.source !== "pricecharting" && <span className="block text-[10px] text-gray-500">{g.market.source === "ebay_sold_90d" ? "eBay sold" : "Fanatics BIN"}</span>}
      </Cell>
      <Cell dim={!graded}>
        {g.expected_hammer_cents != null ? (
          <span
            title={`Expected all-in ${money(g.expected_all_in_cents)} = ${pct((g.expected_ratio ?? 1) - 1)} vs market. This card's auctions: ${g.card_ratio != null ? pct(g.card_ratio - 1) : "no history"} over ${g.card_auction_weeks} weeks; grade average ${pct((g.baseline_ratio ?? 1) - 1)}.`}
          >
            {money(g.expected_hammer_cents)}
            <span className="block text-[10px] text-gray-500">{pct((g.expected_ratio ?? 1) - 1)} all-in</span>
          </span>
        ) : "—"}
      </Cell>
      <Cell dim={!graded}>
        {graded && g.supply ? (
          <span title={`${g.live_auctions} in auction now vs ~${g.usual_auctions_per_week.toFixed(1)} a week usually`}>
            <span className={g.supply === "dump" ? "text-amber-300 font-medium" : g.supply === "heavy" ? "text-amber-200" : ""}>{g.supply}</span>
            <span className="block text-[10px] text-gray-500">{g.live_auctions} live / ~{g.usual_auctions_per_week.toFixed(1)}</span>
          </span>
        ) : "—"}
      </Cell>
      <Cell>
        {g.max_bid_cents != null ? (
          <span title={`Most to pay for the target margin: ${money(g.max_bid_cents)} hammer, ${money(g.max_all_in_cents)} all-in / Buy Now`}>
            <span className="font-medium text-gray-100">{money(g.max_bid_cents)}</span>
            <span className="block text-[10px] text-gray-500">{money(g.max_all_in_cents)} BIN</span>
          </span>
        ) : "—"}
      </Cell>
      <Cell>
        {g.ceiling_cents != null ? (
          <AsOf at={g.ceiling_as_of} label={`cheapest Buy Now on ${g.ceiling_source}`}>
            <span className={g.max_all_in_cents != null && g.ceiling_cents <= g.max_all_in_cents ? "text-green-400 font-medium" : ""}>{money(g.ceiling_cents)}</span>
          </AsOf>
        ) : "—"}
        {g.ceiling_source && <span className="block text-[10px] text-gray-500">{g.ceiling_source}</span>}
      </Cell>
      <Cell>
        <span className={g.flip_margin == null ? "" : g.flip_margin >= 0.2 ? "text-green-400" : g.flip_margin < 0 ? "text-red-400" : "text-gray-300"}>
          {pct(g.flip_margin)}
        </span>
      </Cell>
      <Cell dim>
        <span title={`${g.sales_90d} sales in 90 days (Fanatics + eBay)${g.spread != null ? `; middle half within ${(g.spread * 100).toFixed(0)}% of the median` : ""}`}>
          {g.sales_per_week.toFixed(1)}/wk
        </span>
      </Cell>
    </tr>
  );
}

// The buying analysis for one card: what to do (with the reasoning), and the
// per-grade numbers behind it. All math is server-side (shared with the
// agent's analyze_card tool).
export default function BuyingGuide({ displayKey }: { displayKey: string }) {
  const [target, setTarget] = useState(20);
  const [exitFee, setExitFee] = useState(13.25);
  const [a, setA] = useState<CardAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchCardAnalysis(displayKey, { targetMargin: target / 100, exitFeePct: exitFee / 100 })
      .then(setA)
      .catch((e: Error) => setError(e.message));
  }, [displayKey, target, exitFee]);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Buying guide</h3>
          <p className="text-xs text-gray-500">
            What to do with this card at today's prices. Fanatics auction estimates come from 20k+ past auction weeks (PSA 10 closes ~8% under market,
            CGC 10 ~18%, deeper when a card floods the auction). Bids are hammer prices; all-in adds the 20% buyer's premium.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <label className="flex items-center gap-1.5" title="Profit you want on a flip after the resale fee">
            Target margin
            <input type="number" min={0} max={200} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)}
              className="w-14 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
          </label>
          <label className="flex items-center gap-1.5" title="Fee when reselling: eBay ~13.25%, Fanatics cash ~6%, FanCash 0%">
            Resale fee
            <input type="number" min={0} max={30} step={0.25} value={exitFee} onChange={(e) => setExitFee(Number(e.target.value) || 0)}
              className="w-16 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
          </label>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {!a && !error && <Spinner />}
      {a && (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {a.actions.map((act, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${ACTION_STYLE[act.kind]}`}>
                <div className="text-sm font-semibold">{act.headline}</div>
                <div className="text-xs opacity-80 mt-0.5">{act.why}</div>
              </div>
            ))}
          </div>

          {a.grading && (
            <p className="text-xs text-gray-400">
              Grading one raw copy (PSA, average gem rate {(a.grading.p10 * 100).toFixed(0)}%): EV after fees{" "}
              <span className={a.grading.roi >= 0.3 ? "text-green-400" : a.grading.roi < 0 ? "text-red-400" : "text-gray-200"}>
                {pct(a.grading.roi)} ({money(a.grading.ev_cents)})
              </span>
              {a.grading.max_raw_cents != null && <> · worth grading up to a raw price of <span className="text-gray-200">{money(a.grading.max_raw_cents)}</span></>}
              {a.grading.cost_per_10_cents != null && <> · making a PSA 10 costs about {money(a.grading.cost_per_10_cents)}</>}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-3 font-medium">Grade</th>
                  <th className="text-right py-1 pr-3 font-medium" title="PriceCharting, else eBay sold median, else cheapest Fanatics Buy Now">Market</th>
                  <th className="text-right py-1 pr-3 font-medium" title="Expected Fanatics winning bid this week">Expected bid</th>
                  <th className="text-right py-1 pr-3 font-medium" title="Copies in auction now vs usual weekly">Supply</th>
                  <th className="text-right py-1 pr-3 font-medium" title="Highest hammer that keeps your target margin after the resale fee">Max bid</th>
                  <th className="text-right py-1 pr-3 font-medium" title="Cheapest Buy Now now (Fanatics, or your last eBay screenshot); green = under your max">Ceiling</th>
                  <th className="text-right py-1 pr-3 font-medium" title="Resale (after fee) vs the expected all-in price">Flip margin</th>
                  <th className="text-right py-1 pr-3 font-medium">Liquidity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {a.grades.map((g) => <GradeRow key={g.grade} g={g} />)}
              </tbody>
            </table>
          </div>

          {a.flags.length > 0 && (
            <ul className="text-xs text-amber-300/90 space-y-0.5">
              {a.flags.map((f, i) => <li key={i}>⚠ {f}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
