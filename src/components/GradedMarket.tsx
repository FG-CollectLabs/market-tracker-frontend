import { useEffect, useMemo, useState } from "react";
import { fetchCardHistory, type CardHistory, type FanaticsHistoryWeek, type LiveGroup, type PcHistoryWeek, type PopHistoryWeek } from "../lib/api";
import { formatCents } from "../lib/roi";
import { Spinner, ErrorMsg } from "./Spinner";
import { Legend, LineChart, SERIES, SupplyChart, axisMoney, type LineSeries } from "./HistoryCharts";
import { AsOf } from "./AsOf";
import { ago, shortDate } from "../lib/freshness";
import ImportsPanel from "./ImportsPanel";

// The grades every chart on this tab follows, each with one fixed color.
// "Raw" pairs PriceCharting's ungraded price with Fanatics' CGC 6-9 sales:
// Fanatics doesn't sell raw cards, and low CGC slabs trade around raw.
type PcKey = "psa_10" | "psa_9" | "cgc_10_pristine" | "cgc_10" | "raw";
const GRADES: { key: string; label: string; short: string; pc: PcKey; group: string; color: string }[] = [
  { key: "psa-10", label: "PSA 10", short: "PSA 10", pc: "psa_10", group: "psa-10", color: SERIES[0] },
  { key: "psa-9", label: "PSA 9", short: "PSA 9", pc: "psa_9", group: "psa-9", color: SERIES[1] },
  { key: "cgc-10-pristine", label: "CGC Pristine 10", short: "Pristine", pc: "cgc_10_pristine", group: "cgc-10-pristine", color: SERIES[2] },
  { key: "cgc-10", label: "CGC 10", short: "CGC 10", pc: "cgc_10", group: "cgc-10", color: SERIES[3] },
  { key: "raw", label: "Raw (Fanatics: CGC 6–9)", short: "Raw", pc: "raw", group: "cgc-6-9", color: SERIES[4] },
];

// Mondays (UTC) from `weeks` weeks ago through this week, matching the
// backend's date_trunc('week') buckets, so every chart shares one x-axis.
function weekList(weeks: number): string[] {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const out: string[] = [];
  for (let i = weeks; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const money = (c: number) => formatCents(Math.round(c));
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// ---- gem rate tiles ------------------------------------------------------------

function latestPop(pop: PopHistoryWeek[], company: string): PopHistoryWeek | null {
  return pop.filter((p) => p.company === company).sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))[0] ?? null;
}

function RateTile({ label, n, total, at }: { label: string; n: number | null | undefined; total: number | undefined; at: string | undefined }) {
  const has = n != null && total != null && total > 0;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 min-w-[8rem]">
      <div className="text-[11px] text-gray-500">{label}</div>
      {has ? (
        <AsOf at={at} label={`${n!.toLocaleString()} of ${total!.toLocaleString()} graded`}>
          <span className="text-xl font-semibold tabular-nums text-gray-100">{((n! / total!) * 100).toFixed(1)}%</span>
        </AsOf>
      ) : (
        <span className="text-xl text-gray-700">—</span>
      )}
      <div className="text-[10px] text-gray-600 tabular-nums">{has ? `${n!.toLocaleString()} / ${total!.toLocaleString()}` : "not yet"}</div>
    </div>
  );
}

function GemRates({ pop }: { pop: PopHistoryWeek[] }) {
  const psa = latestPop(pop, "psa");
  const cgc = latestPop(pop, "cgc");
  const at = (p: PopHistoryWeek | null) => (p ? `${p.week_start_date}T12:00:00Z` : undefined);
  return (
    <div className="flex flex-wrap gap-2">
      <RateTile label="PSA 10" n={psa?.gem} total={psa?.total} at={at(psa)} />
      <RateTile label="PSA 9" n={psa?.nine} total={psa?.total} at={at(psa)} />
      <RateTile label="CGC 10 (any)" n={cgc?.gem} total={cgc?.total} at={at(cgc)} />
      <RateTile label="CGC Pristine 10" n={cgc?.pristine} total={cgc?.total} at={at(cgc)} />
    </div>
  );
}

// ---- live listings ---------------------------------------------------------------

// Average copies sold per week over the last 8 weeks, for the supply check.
function weeklySold(rows: FanaticsHistoryWeek[], group: string, axis: string[]): number {
  const recent = new Set(axis.slice(-8));
  const n = rows.filter((r) => r.group === group && recent.has(r.week_start_date)).reduce((s, r) => s + r.sold, 0);
  return n / 8;
}

function LivePanel({ live, rows, axis }: { live: Record<string, LiveGroup>; rows: FanaticsHistoryWeek[]; axis: string[] }) {
  const checked = Object.values(live).map((l) => l.checked_at).filter((v): v is string => !!v).sort().pop() ?? null;
  return (
    <Section
      title="Listed on Fanatics now"
      sub="Auctions running and Buy Now listings at the last listings check. The cheapest Buy Now is today's ceiling; far more auctions than usually sell in a week tend to close cheap."
      right={checked && <span className="text-[11px] text-gray-500" title={new Date(checked).toLocaleString()}>checked {ago(checked)}</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-3 font-medium">Grade</th>
              <th className="text-right py-1 pr-3 font-medium">Auctions</th>
              <th className="text-right py-1 pr-3 font-medium" title="Highest / lowest current bid">Bids now</th>
              <th className="text-right py-1 pr-3 font-medium">Buy Now</th>
              <th className="text-right py-1 pr-3 font-medium" title="Cheapest Buy Now listing">Ceiling</th>
              <th className="text-right py-1 pr-3 font-medium" title="Average copies sold per week, last 8 weeks">Usually sells / wk</th>
              <th className="text-left py-1 font-medium">Supply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
            {GRADES.map((g) => {
              const l = live[g.group];
              const avg = weeklySold(rows, g.group, axis);
              const spike = !!l && l.auctions >= 5 && l.auctions >= 2 * Math.max(avg, 1);
              return (
                <tr key={g.key}>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: g.color }} />
                    {g.label}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {l ? l.auctions : 0}
                    {l && l.auction_bids > 0 && <span className="text-gray-500"> ({l.auction_bids} bids)</span>}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {l?.auction_high_cents != null
                      ? `${money(l.auction_high_cents)}${l.auctions > 1 && l.auction_low_cents != null ? ` / ${money(l.auction_low_cents)}` : ""}`
                      : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right">{l ? l.buy_now : 0}</td>
                  <td className="py-1 pr-3 text-right">
                    {l?.buy_now_low_cents != null ? (
                      <span title={l.buy_now_median_cents != null ? `median Buy Now ${money(l.buy_now_median_cents)}` : undefined}>
                        {money(l.buy_now_low_cents)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right text-gray-500">{avg > 0 ? avg.toFixed(1) : "—"}</td>
                  <td className="py-1">
                    {spike ? (
                      <span
                        className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-900/60 text-amber-300"
                        title={`${l!.auctions} in auction vs ~${avg.toFixed(1)} sold a week: likely to close below market`}
                      >
                        ⚑ spike: {l!.auctions} vs ~{avg.toFixed(1)}/wk
                      </span>
                    ) : (
                      <span className="text-gray-600">normal</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-600">eBay live listings aren't tracked yet (eBay blocks the home server); Fanatics only for now.</p>
    </Section>
  );
}

// ---- main ------------------------------------------------------------------------

export default function GradedMarket({ displayKey }: { displayKey: string }) {
  const [weeks, setWeeks] = useState(52);
  const [data, setData] = useState<CardHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set(["psa-10", "psa-9", "raw"]));

  useEffect(() => {
    setData(null);
    setError(null);
    fetchCardHistory(displayKey, weeks).then(setData).catch((e: Error) => setError(e.message));
  }, [displayKey, weeks]);

  const axis = useMemo(() => weekList(weeks), [weeks]);

  // Per grade: PriceCharting price by week, Fanatics rows by week, and the
  // Fanatics-vs-PriceCharting gap.
  const series = useMemo(() => {
    const pcAt = new Map<string, PcHistoryWeek>((data?.pricecharting ?? []).map((w) => [w.week_start_date, w]));
    const fan = new Map<string, Map<string, FanaticsHistoryWeek>>();
    for (const f of data?.fanatics ?? []) {
      if (!fan.has(f.group)) fan.set(f.group, new Map());
      fan.get(f.group)!.set(f.week_start_date, f);
    }
    return GRADES.map((g) => {
      const pc = axis.map((w) => pcAt.get(w)?.[g.pc] ?? null);
      const f = axis.map((w) => fan.get(g.group)?.get(w));
      // PriceCharting is monthly before the weekly scrape: compare each
      // Fanatics week with the latest PriceCharting price at or before it
      // (within 6 weeks).
      let last: number | null = null;
      let lastI = -99;
      const pcCarry = pc.map((v, i) => {
        if (v != null) {
          last = v;
          lastI = i;
        }
        return i - lastI <= 6 ? last : null;
      });
      const gap = f.map((row, i) => {
        const base = pcCarry[i];
        return row?.median_cents != null && base ? (row.median_cents / base - 1) * 100 : null;
      });
      return { g, pc, f, gap };
    });
  }, [data, axis]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;

  const active = series.filter((s) => shown.has(s.g.key));
  const priceSeries: LineSeries[] = active.flatMap((s) => [
    { label: `${s.g.short} · PC`, color: s.g.color, values: s.pc, connect: true },
    { label: `${s.g.short} · Fanatics`, color: s.g.color, values: s.f.map((r) => r?.median_cents ?? null), dashed: true, dots: true, connect: true },
  ]);
  const gapSeries: LineSeries[] = active.map((s) => ({ label: s.g.short, color: s.g.color, values: s.gap, dots: true, connect: true }));
  const gapSummary = active.map((s) => {
    const recent = s.gap.slice(-12).filter((v): v is number => v != null);
    return { g: s.g, avg: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null, n: recent.length };
  });

  const volume = axis.map((w, i) => {
    const rows = active.map((s) => s.f[i]).filter((r): r is FanaticsHistoryWeek => !!r);
    const listed = rows.some((r) => r.listed != null) ? rows.reduce((n, r) => n + (r.listed ?? 0), 0) : null;
    return {
      week: w,
      auctions: rows.reduce((n, r) => n + r.auctions, 0),
      buyNow: rows.reduce((n, r) => n + r.buy_now, 0),
      listed,
      tooltip: (
        <>
          <div className="text-gray-400 mb-0.5">Week of {w}</div>
          {rows.length === 0 && <div className="text-gray-500">No sales, no listing count</div>}
          {active.map((s) => {
            const r = s.f[i];
            if (!r) return null;
            return (
              <div key={s.g.key} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.g.color }} />
                <span className="text-gray-400">{s.g.short}</span>
                <span className="ml-auto pl-3 tabular-nums">
                  {r.auctions > 0 && <>{r.auctions} auc @ {money(r.auction_median_cents ?? 0)} </>}
                  {r.buy_now > 0 && <>{r.buy_now} BIN @ {money(r.buy_now_median_cents ?? 0)} </>}
                  {r.listed != null && <span className="text-gray-500">· {r.listed} listed</span>}
                </span>
              </div>
            );
          })}
        </>
      ),
    };
  });

  const tableRows = axis
    .map((w, i) => ({ w, rows: active.map((s) => ({ s, r: s.f[i] })).filter((x) => x.r && (x.r.sold > 0 || x.r.listed != null)) }))
    .filter((x) => x.rows.length > 0)
    .reverse();

  const toggle = (k: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="space-y-5">
      <Section title="Gem rates" sub="Share of graded copies at each grade (GemRate). Hover a value for when it was updated.">
        <GemRates pop={data.pop} />
      </Section>

      <div className="sticky top-12 z-[5] -mx-1 px-1 py-2 bg-gray-950/95 backdrop-blur flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-gray-500">Grades</span>
        {GRADES.map((g) => (
          <label key={g.key} className="flex items-center gap-1.5 cursor-pointer text-gray-300">
            <input type="checkbox" className="accent-indigo-500" checked={shown.has(g.key)} onChange={() => toggle(g.key)} />
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
            {g.label}
          </label>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {[13, 26, 52, 104].map((n) => (
            <button
              key={n}
              onClick={() => setWeeks(n)}
              className={`px-2 py-0.5 rounded text-xs ${weeks === n ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
            >
              {n === 52 ? "1 year" : n === 104 ? "2 years" : `${n} weeks`}
            </button>
          ))}
        </span>
      </div>

      <LivePanel live={data.live ?? {}} rows={data.fanatics} axis={axis} />

      <Section
        title="Price: PriceCharting vs Fanatics"
        sub="Solid = PriceCharting (mostly eBay; monthly history, weekly since). Dashed with dots = Fanatics weekly median all-in. Raw compares PriceCharting ungraded with Fanatics CGC 6–9 sales."
      >
        <Legend items={active.map((s) => ({ label: s.g.label, color: s.g.color }))} />
        <LineChart weeks={axis} series={priceSeries} fmt={money} axisFmt={axisMoney} />
      </Section>

      <Section
        title="Fanatics vs PriceCharting"
        sub="How much more (+) or less (−) Fanatics buyers paid than PriceCharting's price that week. Consistently negative: buy on Fanatics, sell elsewhere. Positive: list on Fanatics."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {gapSummary.map(({ g, avg, n }) => (
            <span key={g.key} className="flex items-center gap-1.5 text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: g.color }} />
              {g.short}:
              {avg == null ? (
                <span className="text-gray-600">no overlap yet</span>
              ) : (
                <span
                  className={`tabular-nums font-medium ${avg < -10 ? "text-green-400" : avg > 10 ? "text-amber-300" : "text-gray-200"}`}
                  title={`average of the last ${n} weeks with Fanatics sales (12-week window)`}
                >
                  {pct(avg)} on Fanatics
                </span>
              )}
            </span>
          ))}
        </div>
        <LineChart weeks={axis} series={gapSeries} fmt={pct} />
      </Section>

      <Section
        title="Fanatics volume"
        sub="Copies sold per week across the checked grades (auction vs Buy Now), against the most listed at once. Hover a week for each grade's count and median price."
      >
        <Legend
          items={[
            { label: "Sold at auction", color: SERIES[0], kind: "bar" },
            { label: "Sold Buy Now", color: SERIES[1], kind: "bar" },
            { label: "Most listed at once", color: SERIES[2] },
          ]}
        />
        <SupplyChart weeks={volume} />
        {tableRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-3 font-medium">Week of</th>
                  <th className="text-left py-1 pr-3 font-medium">Grade</th>
                  <th className="text-right py-1 pr-3 font-medium">Auction: sold @ median</th>
                  <th className="text-right py-1 pr-3 font-medium">Buy Now: sold @ median</th>
                  <th className="text-right py-1 pr-3 font-medium">Low – high</th>
                  <th className="text-right py-1 font-medium">Listed (max)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
                {tableRows.map(({ w, rows }) =>
                  rows.map(({ s, r }, k) => (
                    <tr key={`${w}-${s.g.key}`}>
                      <td className="py-1 pr-3 text-gray-400">{k === 0 ? shortDate(`${w}T12:00:00Z`) : ""}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: s.g.color }} />
                        {s.g.short}
                      </td>
                      <td className="py-1 pr-3 text-right">{r!.auctions > 0 ? `${r!.auctions} @ ${money(r!.auction_median_cents ?? 0)}` : "—"}</td>
                      <td className="py-1 pr-3 text-right">{r!.buy_now > 0 ? `${r!.buy_now} @ ${money(r!.buy_now_median_cents ?? 0)}` : "—"}</td>
                      <td className="py-1 pr-3 text-right text-gray-500">{r!.min_cents != null ? `${money(r!.min_cents)} – ${money(r!.max_cents ?? 0)}` : "—"}</td>
                      <td className="py-1 text-right">{r!.listed ?? "—"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <ImportsPanel displayKey={displayKey} />
    </div>
  );
}
