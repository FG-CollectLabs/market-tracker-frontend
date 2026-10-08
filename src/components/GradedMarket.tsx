import { useEffect, useMemo, useState } from "react";
import { fetchCardHistory, type CardHistory, type FanaticsHistoryWeek } from "../lib/api";
import { formatCents } from "../lib/roi";
import { Spinner, ErrorMsg } from "./Spinner";
import { Legend, LineChart, SERIES, SupplyChart, axisMoney, type LineSeries } from "./HistoryCharts";

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

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default function GradedMarket({ displayKey }: { displayKey: string }) {
  const [weeks, setWeeks] = useState(26);
  const [data, setData] = useState<CardHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("psa-10");
  const [showCgc, setShowCgc] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchCardHistory(displayKey, weeks).then(setData).catch((e: Error) => setError(e.message));
  }, [displayKey, weeks]);

  const axis = useMemo(() => weekList(weeks), [weeks]);

  const pcSeries = useMemo<LineSeries[]>(() => {
    if (!data) return [];
    const at = new Map(data.pricecharting.map((w) => [w.week_start_date, w]));
    const col = (k: "raw" | "psa_9" | "psa_10" | "cgc_10" | "cgc_10_pristine") => axis.map((w) => at.get(w)?.[k] ?? null);
    const s: LineSeries[] = [
      { label: "Raw", color: SERIES[0], values: col("raw") },
      { label: "PSA 9", color: SERIES[1], values: col("psa_9") },
      { label: "PSA 10", color: SERIES[2], values: col("psa_10") },
    ];
    if (showCgc) {
      s.push({ label: "CGC 10", color: SERIES[3], values: col("cgc_10") });
      s.push({ label: "CGC Pristine", color: SERIES[4], values: col("cgc_10_pristine") });
    }
    return s;
  }, [data, axis, showCgc]);

  const groupWeeks = useMemo(() => {
    const at = new Map<string, FanaticsHistoryWeek>();
    for (const f of data?.fanatics ?? []) if (f.group === group) at.set(f.week_start_date, f);
    return axis.map((w) => ({ week: w, f: at.get(w) }));
  }, [data, group, axis]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of data?.fanatics ?? []) t[f.group] = (t[f.group] ?? 0) + f.sold;
    return t;
  }, [data]);

  const popSeries = useMemo<LineSeries[]>(() => {
    if (!data) return [];
    const rate = (company: string) => {
      const at = new Map(data.pop.filter((p) => p.company === company).map((p) => [p.week_start_date, p]));
      return axis.map((w) => {
        const p = at.get(w);
        return p ? (p.gem / p.total) * 100 : null;
      });
    };
    return [
      { label: "PSA", color: SERIES[0], values: rate("psa") },
      { label: "CGC", color: SERIES[1], values: rate("cgc") },
    ];
  }, [data, axis]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;

  const groupLabel = data.groups.find((g) => g.key === group)?.label ?? group;
  const active = groupWeeks.filter((w) => w.f);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Window</span>
        {[13, 26, 52].map((n) => (
          <button
            key={n}
            onClick={() => setWeeks(n)}
            className={`px-2 py-0.5 rounded text-xs ${weeks === n ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
          >
            {n === 52 ? "1 year" : `${n} weeks`}
          </button>
        ))}
      </div>

      <Section title="PriceCharting prices" sub="Weekly snapshot. PriceCharting's “PSA 9” is a 9 from any grader.">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend items={pcSeries.map((s) => ({ label: s.label, color: s.color }))} />
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            <input type="checkbox" className="accent-indigo-500" checked={showCgc} onChange={(e) => setShowCgc(e.target.checked)} />
            Show CGC 10 / Pristine
          </label>
        </div>
        <LineChart weeks={axis} series={pcSeries} fmt={money} axisFmt={axisMoney} />
      </Section>

      <Section
        title={`Fanatics · ${groupLabel}`}
        sub="Copies sold per week (auction vs Buy Now) against the most copies listed at once. Listings far above weekly sales = room to bid low."
      >
        <div className="flex flex-wrap gap-1.5">
          {data.groups.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              title={g.grades.join(", ")}
              className={`px-2 py-0.5 rounded text-xs ${group === g.key ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
            >
              {g.label} <span className="opacity-60">{totals[g.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <Legend
          items={[
            { label: "Sold at auction", color: SERIES[0], kind: "bar" },
            { label: "Sold Buy Now", color: SERIES[1], kind: "bar" },
            { label: "Most listed at once", color: SERIES[2] },
          ]}
        />
        <SupplyChart
          weeks={groupWeeks.map(({ week, f }) => ({
            week,
            auctions: f?.auctions ?? 0,
            buyNow: f?.buy_now ?? 0,
            listed: f?.listed ?? null,
            tooltip: (
              <>
                <div className="text-gray-400 mb-0.5">Week of {week}</div>
                {f ? (
                  <>
                    <div>Sold {f.sold} <span className="text-gray-500">({f.auctions} auction · {f.buy_now} Buy Now)</span></div>
                    {f.median_cents != null && <div>Median {money(f.median_cents)} <span className="text-gray-500">· avg {money(f.avg_cents ?? 0)}</span></div>}
                    {f.min_cents != null && <div className="text-gray-500">Range {money(f.min_cents)}–{money(f.max_cents ?? 0)}</div>}
                    <div>Listed (max) {f.listed ?? "—"}</div>
                  </>
                ) : (
                  <div className="text-gray-500">No sales, no listing count</div>
                )}
              </>
            ),
          }))}
        />
        <div className="pt-1">
          <h4 className="text-xs text-gray-500 mb-1">All-in price per week · {groupLabel}</h4>
          <Legend
            items={[
              { label: "Median", color: SERIES[0] },
              { label: "Low", color: SERIES[1] },
              { label: "High", color: SERIES[2] },
            ]}
          />
          <LineChart
            weeks={axis}
            fmt={money}
            axisFmt={axisMoney}
            series={[
              { label: "Median", color: SERIES[0], values: groupWeeks.map((w) => w.f?.median_cents ?? null) },
              { label: "Low", color: SERIES[1], values: groupWeeks.map((w) => w.f?.min_cents ?? null) },
              { label: "High", color: SERIES[2], values: groupWeeks.map((w) => w.f?.max_cents ?? null) },
            ]}
          />
        </div>
        {active.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-3 font-medium">Week of</th>
                  <th className="text-right py-1 pr-3 font-medium">Sold</th>
                  <th className="text-right py-1 pr-3 font-medium">Auction / BIN</th>
                  <th className="text-right py-1 pr-3 font-medium">Median</th>
                  <th className="text-right py-1 pr-3 font-medium">Average</th>
                  <th className="text-right py-1 pr-3 font-medium">Low – high</th>
                  <th className="text-right py-1 pr-3 font-medium">Listed (max)</th>
                  <th className="text-right py-1 font-medium" title="Most copies listed at once ÷ copies sold that week">Listed ÷ sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
                {[...active].reverse().map(({ week, f }) => (
                  <tr key={week}>
                    <td className="py-1 pr-3">{week}</td>
                    <td className="py-1 pr-3 text-right">{f!.sold}</td>
                    <td className="py-1 pr-3 text-right text-gray-500">{f!.auctions} / {f!.buy_now}</td>
                    <td className="py-1 pr-3 text-right">{f!.median_cents != null ? money(f!.median_cents) : "—"}</td>
                    <td className="py-1 pr-3 text-right">{f!.avg_cents != null ? money(f!.avg_cents) : "—"}</td>
                    <td className="py-1 pr-3 text-right text-gray-500">
                      {f!.min_cents != null ? `${money(f!.min_cents)} – ${money(f!.max_cents ?? 0)}` : "—"}
                    </td>
                    <td className="py-1 pr-3 text-right">{f!.listed ?? "—"}</td>
                    <td className="py-1 text-right">
                      {f!.listed != null && f!.sold > 0 ? `${(f!.listed / f!.sold).toFixed(1)}×` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Gem rate over time" sub="Share of graded copies at the top grade (PSA 10 / any CGC 10), from GemRate.">
        <Legend items={popSeries.map((s) => ({ label: s.label, color: s.color }))} />
        <LineChart weeks={axis} series={popSeries} fmt={(v) => `${v.toFixed(0)}%`} />
      </Section>
    </div>
  );
}
