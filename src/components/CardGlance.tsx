import { useEffect, useMemo, useState } from "react";
import {
  fetchCardAnalysis, fetchCardHistory, fetchPriceSources,
  type CardAnalysis, type CardHistory, type EVWorking, type GradingEV, type MarketValue, type PcHistoryWeek, type PriceReading,
} from "../lib/api";
import { formatCents } from "../lib/roi";

// One card at a glance: each grade's price and where it came from, the
// gem rates, and the grading math worked out line by line, so a score's
// "131% after fees: $42.24 on $32.36" can be checked by hand.

const GRADE_ROWS: { key: string; label: string }[] = [
  { key: "raw", label: "Raw" },
  { key: "psa-9", label: "PSA 9" },
  { key: "psa-10", label: "PSA 10" },
  { key: "cgc-10", label: "CGC 10" },
  { key: "cgc-10-pristine", label: "CGC Pristine 10" },
];

const pct = (v?: number | null, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const money = (c?: number | null) => formatCents(c ?? null);

function sourceLabel(m: MarketValue): string {
  switch (m.source) {
    case "pricecharting": return "PriceCharting";
    case "ebay_sold_90d": return `eBay sold median (${m.basis?.sales_count ?? "?"} in 90d)`;
    case "sold_90d": return `Sold median, Fanatics + eBay (${m.basis?.sales_count ?? "?"} in 90d)`;
    default: return m.source;
  }
}

function Prices({ a }: { a: CardAnalysis }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="text-gray-500">
        <tr>
          <th className="text-left py-1 pr-2 font-medium">Grade</th>
          <th className="text-right py-1 pr-2 font-medium" title="The price the scores and grading math use">Value used</th>
          <th className="text-left py-1 pr-2 font-medium">From</th>
          <th className="text-right py-1 pr-2 font-medium">PriceCharting</th>
          <th className="text-right py-1 font-medium" title="Median all-in of Fanatics + eBay sales in the last 90 days">Sold 90d</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800/70 text-gray-300">
        {GRADE_ROWS.map((g) => {
          const ga = a.grades.find((x) => x.grade === g.key);
          const m = ga?.market;
          const b = m?.basis;
          const pcC = b?.pricecharting_cents ?? (m?.source === "pricecharting" ? m.cents : undefined);
          return (
            <tr key={g.key}>
              <td className="py-1 pr-2 text-gray-200">{g.label}</td>
              <td className="py-1 pr-2 text-right font-mono text-gray-100">{m ? money(m.cents) : "—"}</td>
              <td className="py-1 pr-2 text-gray-500" title={b?.note}>
                {m ? sourceLabel(m) : "no price"}
                {b?.overrode_pricecharting && <span className="text-amber-300/90"> · PriceCharting ignored (too far off sales)</span>}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{money(pcC)}</td>
              <td className="py-1 text-right font-mono">
                {b?.median_cents != null ? <>{money(b.median_cents)} <span className="text-gray-600">({b.sales_count})</span></> : <span className="text-gray-600">{ga?.sales_90d ? `${ga.sales_90d} sold` : "—"}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GemRates({ a }: { a: CardAnalysis }) {
  const r = a.gem_rates;
  const cells: [string, number | undefined][] = [
    ["PSA 10", r.psa_10], ["PSA 9", r.psa_9], ["CGC Pristine", r.cgc_pristine], ["CGC 10", r.cgc_10], ["CGC 9", a.grading_by?.cgc?.p9],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {cells.map(([l, v]) => (
        <div key={l} className="rounded border border-gray-800 px-2 py-1 text-xs">
          <div className="text-gray-500">{l}</div>
          <div className="font-mono text-gray-100">{pct(v)}</div>
        </div>
      ))}
      <p className="basis-full text-[11px] text-gray-600">Share of all copies graded (GemRate population), assumed to be your odds too.</p>
    </div>
  );
}

function Working({ ev, w }: { ev: GradingEV; w: EVWorking }) {
  const grader = ev.grader.toUpperCase();
  return (
    <div className="rounded border border-gray-800 p-2 text-xs tabular-nums space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-gray-100 font-medium">Grade with {grader}{ev.tier ? ` · ${ev.tier}` : ""}</span>
        <span className={w.profit_cents >= 0 ? "text-green-300" : "text-red-400"}>
          {w.profit_cents >= 0 ? "+" : ""}{money(w.profit_cents)} on {money(w.cost_cents)} ({ev.roi >= 0 ? "+" : ""}{Math.round(ev.roi * 100)}%)
        </span>
      </div>
      <table className="w-full">
        <tbody className="text-gray-300">
          <tr><td colSpan={3} className="text-gray-500 pt-1">Cost of one graded copy</td></tr>
          {w.cost.map((l) => (
            <tr key={l.label}>
              <td className="pl-2 pr-2">{l.label}{l.note && <span className="text-gray-600"> · {l.note}</span>}</td>
              <td />
              <td className="text-right font-mono">{money(l.cents)}</td>
            </tr>
          ))}
          <tr className="border-t border-gray-800"><td className="pl-2 font-medium text-gray-200">Cost</td><td /><td className="text-right font-mono font-medium text-gray-100">{money(w.cost_cents)}</td></tr>

          <tr><td colSpan={3} className="text-gray-500 pt-2">What comes back (odds × sale price)</td></tr>
          {w.outcomes.map((l) => (
            <tr key={l.label}>
              <td className="pl-2 pr-2">{l.label}{l.note && <span className="text-gray-600"> · {l.note}</span>}</td>
              <td className="text-right text-gray-500 pr-2 whitespace-nowrap">{pct(l.share)} × {money(l.unit_cents)}</td>
              <td className="text-right font-mono">{money(l.cents)}</td>
            </tr>
          ))}
          <tr className="border-t border-gray-800"><td className="pl-2">Expected sale</td><td /><td className="text-right font-mono">{money(w.gross_cents)}</td></tr>
          <tr><td className="pl-2">Selling fee {pct(ev.sell_fee_pct, 0)}</td><td /><td className="text-right font-mono">−{money(w.sell_fee_cents)}</td></tr>
          <tr><td className="pl-2 font-medium text-gray-200">Back after fees</td><td /><td className="text-right font-mono font-medium text-gray-100">{money(w.net_cents)}</td></tr>
          <tr className="border-t border-gray-800">
            <td className="pl-2 font-medium text-gray-200">Profit = {money(w.net_cents)} − {money(w.cost_cents)}</td><td />
            <td className={`text-right font-mono font-semibold ${w.profit_cents >= 0 ? "text-green-300" : "text-red-400"}`}>{money(w.profit_cents)}</td>
          </tr>
        </tbody>
      </table>
      <div className="text-[11px] text-gray-500 space-y-0.5">
        {ev.nine_source && <div>9 price: {money(ev.nine_cents)} · {ev.nine_source}</div>}
        {ev.break_even_cents != null && <div>Cost to make a 10: {money(ev.break_even_cents)} (what a 10 must sell for, before the fee, to break even)</div>}
        {ev.max_raw_cents != null && <div>Most to pay raw and still clear your return bar: {money(ev.max_raw_cents)} · never above {money(ev.break_even_raw_cents)}</div>}
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { pokemonpricetracker: "PokemonPriceTracker", poketrace: "PokeTrace", compsapi: "CompsAPI" };
const CHANNEL_LABEL: Record<string, string> = { tcgplayer: "TCGplayer", ebay: "eBay sold", sold: "Sold (eBay + Fanatics)", cardmarket: "Cardmarket" };
// The one number per source / channel / grade shown first; the rest on hover.
const HEADLINE = ["median_30d", "median", "market", "avg_30d", "smart_market", "avg", "median_7d", "avg_7d", "low"];
const METRIC_LABEL: Record<string, string> = {
  market: "market", low: "low", high: "high", avg: "average", median: "median", median_7d: "7-day median", median_30d: "30-day median",
  avg_7d: "7-day average", avg_30d: "30-day average", smart_market: "smart market",
};

// Other sources' readings for each grade, beside the value we use.
function OtherSources({ displayKey, a }: { displayKey: string; a: CardAnalysis }) {
  const [rs, setRs] = useState<PriceReading[] | null>(null);
  useEffect(() => {
    fetchPriceSources(displayKey).then((r) => setRs(r.readings)).catch(() => setRs([]));
  }, [displayKey]);
  if (!rs || rs.length === 0) return null;
  const groups = new Map<string, PriceReading[]>();
  for (const r of rs) {
    const k = `${r.grade}|${r.source}|${r.channel}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const order = (g: string) => { const i = GRADE_ROWS.findIndex((x) => x.key === g); return i < 0 ? 99 : i; };
  const rows = [...groups.entries()].map(([k, xs]) => {
    const [grade, source, channel] = k.split("|");
    const head = [...xs].sort((x, y) => HEADLINE.indexOf(x.metric) - HEADLINE.indexOf(y.metric))[0];
    return { grade, source, channel, head, xs };
  }).sort((x, y) => order(x.grade) - order(y.grade) || x.grade.localeCompare(y.grade) || x.source.localeCompare(y.source));
  const ours = (g: string) => a.grades.find((x) => x.grade === g)?.market?.cents;
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-300 mb-1">Other sources</h3>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1 pr-2 font-medium">Grade</th>
            <th className="text-left py-1 pr-2 font-medium">Source</th>
            <th className="text-right py-1 pr-2 font-medium">Price</th>
            <th className="text-right py-1 pr-2 font-medium" title="Against the value used (Prices above)">vs ours</th>
            <th className="text-right py-1 font-medium">Read</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/70 text-gray-300">
          {rows.map(({ grade, source, channel, head, xs }) => {
            const o = ours(grade);
            const d = o ? head.price_cents / o - 1 : null;
            return (
              <tr key={`${grade}${source}${channel}`}>
                <td className="py-1 pr-2 text-gray-200">{GRADE_ROWS.find((x) => x.key === grade)?.label ?? grade.toUpperCase().replace("-", " ")}</td>
                <td className="py-1 pr-2 text-gray-500">{SOURCE_LABEL[source] ?? source} · {CHANNEL_LABEL[channel] ?? channel}</td>
                <td className="py-1 pr-2 text-right font-mono text-gray-100 cursor-help"
                  title={xs.map((x) => `${METRIC_LABEL[x.metric] ?? x.metric}: ${money(x.price_cents)}${x.sample_n != null ? ` (${x.sample_n} sales)` : ""}${x.confidence ? `, ${x.confidence} confidence` : ""}`).join("\n")}>
                  {money(head.price_cents)} <span className="text-gray-600 font-sans">{METRIC_LABEL[head.metric] ?? head.metric}{head.sample_n != null ? ` · ${head.sample_n}` : ""}</span>
                </td>
                <td className={`py-1 pr-2 text-right ${d == null ? "text-gray-600" : Math.abs(d) > 0.25 ? "text-amber-300" : "text-gray-400"}`}>
                  {d == null ? "—" : `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%`}
                </td>
                <td className="py-1 text-right text-gray-500" title={head.as_of ? `Source last updated ${head.as_of.slice(0, 10)}` : undefined}>{head.observed_on}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-600 mt-1">Collected daily from free API tiers, highest-priority cards first. Amber: more than 25% off the value we use. Hover a price for every number the source gave.</p>
    </div>
  );
}

export function CardGlance({ displayKey }: { displayKey: string }) {
  const [a, setA] = useState<CardAnalysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setA(null);
    fetchCardAnalysis(displayKey).then(setA).catch((e: Error) => setErr(e.message));
  }, [displayKey]);
  if (err) return <p className="text-xs text-red-400">{err}</p>;
  if (!a) return <p className="text-xs text-gray-500">Loading prices and grading math…</p>;
  const graders = (["psa", "cgc"] as const).map((g) => a.grading_by?.[g]).filter((ev): ev is GradingEV => !!ev?.working);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-300">Prices</h3>
          <Prices a={a} />
          <OtherSources displayKey={displayKey} a={a} />
          <h3 className="text-xs font-semibold text-gray-300">Gem rates</h3>
          <GemRates a={a} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {graders.length === 0 && <p className="text-xs text-gray-500">No grading math: needs a raw price, a 10 price and a population.</p>}
          {graders.map((ev) => <Working key={ev.grader} ev={ev} w={ev.working!} />)}
        </div>
      </div>
    </div>
  );
}

// ---- weekly: Fanatics sales vs PriceCharting ---------------------------------------

const WEEK_GRADES: { key: string; label: string; group: string; pc?: keyof PcHistoryWeek }[] = [
  { key: "psa-10", label: "PSA 10", group: "psa-10", pc: "psa_10" },
  { key: "psa-9", label: "PSA 9", group: "psa-9", pc: "psa_9" },
  { key: "cgc-10", label: "CGC 10", group: "cgc-10", pc: "cgc_10" },
  { key: "cgc-10-pristine", label: "Pristine", group: "cgc-10-pristine", pc: "cgc_10_pristine" },
  { key: "cgc-7-9", label: "CGC 7–9", group: "cgc-7-9" },
];

// Week by week: how many sold on Fanatics, at what average, against
// PriceCharting's price that week.
export function WeeklyVsPc({ displayKey, initial = "psa-10", weeks = 26 }: { displayKey: string; initial?: string; weeks?: number }) {
  const [h, setH] = useState<CardHistory | null>(null);
  const [grade, setGrade] = useState(WEEK_GRADES.some((g) => g.key === initial) ? initial : "psa-10");
  useEffect(() => {
    fetchCardHistory(displayKey, weeks).then(setH).catch(() => setH(null));
  }, [displayKey, weeks]);
  const g = WEEK_GRADES.find((x) => x.key === grade)!;
  const rows = useMemo(() => {
    if (!h) return [];
    const pcs = [...h.pricecharting].sort((x, y) => x.week_start_date.localeCompare(y.week_start_date));
    // PriceCharting was monthly before the weekly scrape: use the latest
    // price at or before the week, if it's within 6 weeks.
    const pcAt = (wk: string): { cents: number; carried: boolean } | null => {
      if (!g.pc) return null;
      for (let i = pcs.length - 1; i >= 0; i--) {
        const p = pcs[i];
        if (p.week_start_date > wk) continue;
        const v = p[g.pc] as number | null;
        if (v == null) continue;
        const ageDays = (Date.parse(wk) - Date.parse(p.week_start_date)) / 864e5;
        return ageDays <= 42 ? { cents: v, carried: ageDays > 0 } : null;
      }
      return null;
    };
    return h.fanatics
      .filter((f) => f.group === g.group && f.sold > 0)
      .sort((x, y) => y.week_start_date.localeCompare(x.week_start_date))
      .map((f) => ({ f, pc: pcAt(f.week_start_date) }));
  }, [h, g]);
  if (!h) return null;
  const sold = rows.reduce((n, r) => n + r.f.sold, 0);
  const avg = sold ? rows.reduce((n, r) => n + (r.f.avg_cents ?? 0) * r.f.sold, 0) / sold : null;
  const gaps = rows.filter((r) => r.pc && r.f.avg_cents != null).map((r) => r.f.avg_cents! / r.pc!.cents - 1);
  const gap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const gapCls = (v: number) => (v < -0.1 ? "text-green-400" : v > 0.1 ? "text-amber-300" : "text-gray-300");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-gray-300">Fanatics sold vs PriceCharting, by week</h3>
        {WEEK_GRADES.map((x) => (
          <button key={x.key} onClick={() => setGrade(x.key)}
            className={`px-2 py-0.5 rounded text-[11px] ${grade === x.key ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>{x.label}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No Fanatics sales of {g.label} in the last {weeks} weeks.</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-2 font-medium">Week of</th>
              <th className="text-right py-1 pr-2 font-medium">Sold</th>
              <th className="text-right py-1 pr-2 font-medium" title="All-in: hammer + buyer's premium">Avg all-in</th>
              <th className="text-right py-1 pr-2 font-medium">Median</th>
              <th className="text-right py-1 pr-2 font-medium">Low – high</th>
              <th className="text-right py-1 pr-2 font-medium">PriceCharting</th>
              <th className="text-right py-1 font-medium" title="Fanatics average vs PriceCharting that week">Fanatics vs PC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 text-gray-300">
            {rows.map(({ f, pc }) => {
              const d = pc && f.avg_cents != null ? f.avg_cents / pc.cents - 1 : null;
              return (
                <tr key={f.week_start_date}>
                  <td className="py-1 pr-2 text-gray-400">{f.week_start_date}</td>
                  <td className="py-1 pr-2 text-right">{f.sold}<span className="text-gray-600"> ({f.auctions} auc{f.buy_now ? ` · ${f.buy_now} BIN` : ""})</span></td>
                  <td className="py-1 pr-2 text-right font-mono text-gray-100">{money(f.avg_cents)}</td>
                  <td className="py-1 pr-2 text-right font-mono">{money(f.median_cents)}</td>
                  <td className="py-1 pr-2 text-right text-gray-500">{f.min_cents != null ? `${money(f.min_cents)} – ${money(f.max_cents)}` : "—"}</td>
                  <td className="py-1 pr-2 text-right font-mono" title={pc?.carried ? "Latest PriceCharting price before this week" : undefined}>
                    {pc ? <>{money(pc.cents)}{pc.carried && <span className="text-gray-600">*</span>}</> : <span className="text-gray-600">{g.pc ? "—" : "n/a"}</span>}
                  </td>
                  <td className={`py-1 text-right ${d != null ? gapCls(d) : "text-gray-600"}`}>{d != null ? `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%` : "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-700 font-medium">
              <td className="py-1 pr-2 text-gray-400">{weeks} weeks</td>
              <td className="py-1 pr-2 text-right">{sold}</td>
              <td className="py-1 pr-2 text-right font-mono text-gray-100">{money(avg != null ? Math.round(avg) : null)}</td>
              <td colSpan={3} />
              <td className={`py-1 text-right ${gap != null ? gapCls(gap) : "text-gray-600"}`} title={`Average of ${gaps.length} weeks`}>{gap != null ? `${gap >= 0 ? "+" : ""}${Math.round(gap * 100)}%` : "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-gray-600 mt-1">* PriceCharting carried from an earlier week (it was monthly before the weekly scrape). Green: Fanatics sells under PriceCharting; amber: over.</p>
    </div>
  );
}
