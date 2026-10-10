import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCardAnalysis, type ActionMetrics, type BuyAction, type CardAnalysis, type FairValue, type GradeAnalysis, type GradingEV, type Lifecycle } from "../lib/api";
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
  buy_raw_to_grade_cgc: "border-teal-800 bg-teal-950/40 text-teal-200",
  buy_psa10: "border-sky-800 bg-sky-950/40 text-sky-200",
  bid_auction: "border-amber-800 bg-amber-950/40 text-amber-200",
  buy_now: "border-emerald-800 bg-emerald-950/40 text-emerald-200",
  watch: "border-gray-800 bg-gray-950/40 text-gray-300",
};

export const PHASE_LABEL: Record<Lifecycle["phase"], string> = {
  falling: "still falling",
  bottom: "at the bottom",
  recovering: "recovering",
  unknown: "no curve",
};

export const PHASE_STYLE: Record<Lifecycle["phase"], string> = {
  falling: "bg-amber-950/60 text-amber-300",
  bottom: "bg-green-950/60 text-green-300",
  recovering: "bg-sky-950/60 text-sky-300",
  unknown: "bg-gray-800 text-gray-400",
};

const POSITION_TEXT: Record<string, { label: string; cls: string }> = {
  below: { label: "below range", cls: "text-green-400" },
  within: { label: "within range", cls: "text-gray-300" },
  above: { label: "above range", cls: "text-amber-300" },
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

// The fair range of a 10 on one track: cost to make one (tick), the range
// (band) and today's market price (dot), with the numbers as text.
export function FairBar({ f, compact }: { f: FairValue; compact?: boolean }) {
  if (!f.high_cents || !f.low_cents) return null;
  const vals = [f.make_cents, f.low_cents, f.high_cents, f.market_cents ?? f.low_cents];
  const lo = Math.min(...vals) * 0.92;
  const hi = Math.max(...vals) * 1.08;
  const x = (c: number) => `${((c - lo) / (hi - lo)) * 100}%`;
  const pos = f.position ? POSITION_TEXT[f.position] : null;
  const title = `Cost to make one: ${money(f.make_cents)} (${f.tier}, ~${f.turnaround_days} days). ${f.desirability === "all" ? "All tracked cards" : `Tier ${f.desirability} Pokémon`} (${f.cards} cards) trade at ${f.markup_median?.toFixed(2)}x that; fair range ${money(f.low_cents)}–${money(f.high_cents)}.`;
  return (
    <div title={title} className="space-y-1">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-px bg-gray-700" />
        <div className="absolute top-0.5 h-2 rounded-sm bg-gray-600/70" style={{ left: x(f.low_cents), width: `calc(${x(f.high_cents)} - ${x(f.low_cents)})` }} />
        <div className="absolute top-0 h-3 w-px bg-gray-300" style={{ left: x(f.make_cents) }} />
        {f.market_cents != null && (
          <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-gray-900" style={{ left: x(f.market_cents) }} />
        )}
      </div>
      <div className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
        {money(f.low_cents)}–{money(f.high_cents)}
        {pos && <span className={`ml-1.5 ${pos.cls}`}>{pos.label}</span>}
        {!compact && <span className="text-gray-500"> · makes for {money(f.make_cents)}</span>}
      </div>
    </div>
  );
}

const GRADER_LABEL: Record<string, string> = { psa: "PSA", cgc: "CGC" };

function GraderRow({ ev, minROI }: { ev: GradingEV; minROI: number }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 text-gray-200 whitespace-nowrap">{GRADER_LABEL[ev.grader] ?? ev.grader}</td>
      <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{ev.tier} · {money(ev.fee_cents)} · ~{ev.turnaround_days}d</td>
      <td className="py-1.5 pr-3 text-right tabular-nums" title={ev.p_top != null ? `${(ev.p10 * 100).toFixed(0)}% Gem Mint 10 + ${(ev.p_top * 100).toFixed(0)}% Pristine 10` : undefined}>
        {(ev.p10 * 100).toFixed(0)}%{ev.p_top != null && <span className="block text-[10px] text-gray-500">+{(ev.p_top * 100).toFixed(0)}% Pristine</span>}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums"
        title={`Raw x ${(1 + ev.sourcing_pct).toFixed(2)} sourcing + ${money(ev.fee_cents)} fee + ${money(ev.ship_cents)} shipping + ${money(ev.time_cost_cents)} money tied up`}>
        {money(ev.cost_cents)}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums" title="What a 10 must sell for to break even, after the misses resell">{money(ev.break_even_cents)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">
        {Math.abs(ev.ten_drift) >= 0.005 ? <span className={ev.ten_drift < 0 ? "text-amber-300" : "text-sky-300"}>{pct(ev.ten_drift)}</span> : <span className="text-gray-600">—</span>}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums">
        <span className={ev.roi >= minROI ? "text-green-400" : ev.roi < 0 ? "text-red-400" : "text-gray-200"}>{pct(ev.roi)}</span>
        <span className="block text-[10px] text-gray-500">{money(ev.ev_cents)}</span>
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">{money(ev.max_raw_cents)}</td>
    </tr>
  );
}

const TIER_LABEL: Record<string, string> = {
  all: "all cards", ir: "IR-tier", sir: "SIR-tier", ultra: "full-art", gold: "gold", gallery: "gallery", promo: "promo",
};

// Where the card is on its release curve, in dollars.
function TimingBlock({ l, label }: { l: Lifecycle; label: string }) {
  const tier = TIER_LABEL[l.curve_category] ?? l.curve_category;
  const inRange = l.market_cents != null && l.buy_under_cents != null && l.market_cents <= l.buy_under_cents;
  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2 text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-gray-200 font-medium">{label}</span>
        <span className={`px-1 rounded ${PHASE_STYLE[l.phase]}`}>{PHASE_LABEL[l.phase]}</span>
        {l.post_hype && <span className="text-gray-400">past the hype cycle</span>}
        <span className="text-gray-500">({tier} curve{l.curve_lang === "all" ? ", all languages" : ""}{l.provisional ? ", provisional" : ""})</span>
      </div>
      {l.market_cents != null && (
        <div className="text-gray-300 tabular-nums">
          {money(l.market_cents)} now
          {l.bottom_cents != null && l.phase === "falling" && (
            <>
              {" · "}expected bottom <span className="text-gray-100">~{money(l.bottom_cents)}</span> in ~{Math.round(l.months_to_bottom)} month
              {Math.round(l.months_to_bottom) === 1 ? "" : "s"} (month {l.bottom_month})
            </>
          )}
          {l.bottom_cents != null && l.phase !== "falling" && <> · typical low ~{money(l.bottom_cents)}</>}
          {l.buy_under_cents != null && (
            <>
              {" · "}buy under <span className={inRange ? "text-green-400 font-medium" : "text-gray-100"}>{money(l.buy_under_cents)}</span>
              {inRange && <span className="text-green-400"> (in range now)</span>}
            </>
          )}
        </div>
      )}
      <div className="text-gray-500">
        {l.card_change != null && <>This card {pct(l.card_change)} since launch; </>}
        {tier} cards typically bottom at {pct(l.bottom_change)} around month {l.bottom_month} (low-risk months {l.window_from}–{l.window_to}).
      </div>
    </div>
  );
}

// The price lines for a buy: what it costs, where it should bottom, and what
// never to pay.
export function MetricsStrip({ m, unit }: { m: ActionMetrics; unit: string }) {
  const over = m.market_cents != null && m.break_even_cents != null && m.market_cents >= m.break_even_cents;
  const chip = (label: string, value: React.ReactNode, title?: string, cls = "") => (
    <span className={`inline-flex items-baseline gap-1 rounded bg-black/30 px-1.5 py-0.5 ${cls}`} title={title}>
      <span className="opacity-70">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] mt-1.5">
      {m.market_cents != null && chip(`${unit} now`, money(m.market_cents))}
      {m.bottom_cents != null && m.phase === "falling" &&
        chip("Expected bottom", `~${money(m.bottom_cents)}`, `In ~${Math.round(m.months_to_bottom)} months (month ${m.bottom_month})${m.card_change != null && m.curve_bottom != null ? `; this card ${pct(m.card_change)} since launch vs a typical ${pct(m.curve_bottom)}` : ""}`)}
      {m.buy_under_cents != null && chip("Buy under", money(m.buy_under_cents), "Top of the typical bottom band")}
      {m.target_cents != null && chip("Target ≤", money(m.target_cents), "Highest price that still clears your target return")}
      {m.break_even_cents != null &&
        chip("Break-even", money(m.break_even_cents), "Grading nets $0 at this raw price after every cost: never pay this much",
          over ? "text-red-300 ring-1 ring-red-800" : "")}
    </div>
  );
}

// The buying analysis for one card: what to do (with the reasoning), and the
// per-grade numbers behind it. All math is server-side (shared with the
// agent's analyze_card tool).
export default function BuyingGuide({ displayKey }: { displayKey: string }) {
  // null = use the saved setting; set when the user types an override.
  const [target, setTarget] = useState<number | null>(null);
  const [exitFee, setExitFee] = useState<number | null>(null);
  const [a, setA] = useState<CardAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchCardAnalysis(displayKey, {
      targetMargin: target == null ? undefined : target / 100,
      exitFeePct: exitFee == null ? undefined : exitFee / 100,
    })
      .then((r) => {
        setA(r);
        if (target == null) setTarget(Math.round(r.settings.target_margin * 100));
        if (exitFee == null) setExitFee(+(r.settings.exit_fee_pct * 100).toFixed(2));
      })
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
            <input type="number" min={0} max={200} step={5} value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value) || 0)}
              className="w-14 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
          </label>
          <label className="flex items-center gap-1.5" title="Fee when reselling: eBay ~13.25%, Fanatics cash ~6%, FanCash 0%">
            Resale fee
            <input type="number" min={0} max={30} step={0.25} value={exitFee ?? ""} onChange={(e) => setExitFee(Number(e.target.value) || 0)}
              className="w-16 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
          </label>
          <Link to="/settings" className="text-indigo-300 hover:text-indigo-200">Fees & costs →</Link>
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
                {act.metrics && <MetricsStrip m={act.metrics} unit={act.grade === "raw" ? "Raw" : "PSA 10"} />}
                <div className="text-xs opacity-80 mt-1.5">{act.why}</div>
              </div>
            ))}
          </div>

          {(a.lifecycle?.["psa-10"] || a.lifecycle?.raw) && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-gray-300">
                  Timing{a.months_since_release != null && <> · month {Math.floor(a.months_since_release)} since release</>}
                </span>
                <Link to="/timing" className="text-indigo-300 hover:text-indigo-200">Release curves →</Link>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {a.lifecycle.raw && <TimingBlock l={a.lifecycle.raw} label="Raw" />}
                {a.lifecycle["psa-10"] && <TimingBlock l={a.lifecycle["psa-10"]} label="PSA 10" />}
              </div>
            </div>
          )}

          {Object.keys(a.grading_by ?? {}).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left py-1 pr-3 font-medium">Grade it with</th>
                    <th className="text-left py-1 pr-3 font-medium">Tier</th>
                    <th className="text-right py-1 pr-3 font-medium">Gem rate</th>
                    <th className="text-right py-1 pr-3 font-medium" title="Sourced raw copy + fee + shipping + money tied up over the turnaround">All-in cost</th>
                    <th className="text-right py-1 pr-3 font-medium" title="What a 10 must sell for to break even">Cost to make a 10</th>
                    <th className="text-right py-1 pr-3 font-medium" title="Typical change in the 10's price over the turnaround (release curve)">10 by return</th>
                    <th className="text-right py-1 pr-3 font-medium">EV after fees</th>
                    <th className="text-right py-1 pr-3 font-medium" title={`Highest raw price that still clears +${(a.settings.min_roi * 100).toFixed(0)}%`}>Max raw</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {["psa", "cgc"].filter((g) => a.grading_by[g]).map((g) => <GraderRow key={g} ev={a.grading_by[g]} minROI={a.settings.min_roi} />)}
                </tbody>
              </table>
            </div>
          )}

          {a.fair?.some((f) => f.high_cents) && (
            <div className="grid gap-3 md:grid-cols-2">
              {a.fair.filter((f) => f.high_cents).map((f) => (
                <div key={f.grade} className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-gray-200 font-medium">Fair {GRADE_LABEL[f.grade]} price</span>
                    <span className="text-gray-500">market {money(f.market_cents)}</span>
                  </div>
                  <FairBar f={f} />
                </div>
              ))}
            </div>
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
