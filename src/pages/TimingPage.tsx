import { useEffect, useState } from "react";
import { fetchReleaseCurves, type ReleaseCurve, type ReleaseCurves } from "../lib/api";
import { LineChart, Legend, SERIES } from "../components/HistoryCharts";
import { Spinner, ErrorMsg } from "../components/Spinner";

const LANGS = [
  { key: "ja", label: "Japanese" },
  { key: "en", label: "English" },
  { key: "all", label: "All" },
] as const;
type Lang = (typeof LANGS)[number]["key"];

const pct = (v: number) => {
  const r = Math.round(v * 100);
  return `${r > 0 ? "+" : ""}${r === 0 ? 0 : r}%`;
};
// Axis ticks: whole percents, or one decimal when the range is tight.
const axisPct = (v: number) => `${+v.toFixed(Math.abs(v) < 5 && v !== Math.round(v) ? 1 : 0)}%`;

// Raw = slot 1, PSA 10 = slot 2: the same colors those grades wear on the
// card page's charts.
const GRADE_COLOR = { raw: SERIES[0], "psa-10": SERIES[1] } as const;

function curveSeries(curves: ReleaseCurve[], grades: ("raw" | "psa-10" | "premium")[], labels: Record<string, string>, colors: Record<string, string>) {
  const months = Math.max(0, ...curves.filter((c) => grades.includes(c.grade)).map((c) => c.points[c.points.length - 1].month));
  const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
  const series = grades.flatMap((g) => {
    const c = curves.find((x) => x.grade === g);
    if (!c) return [];
    const byMonth = new Map(c.points.map((p) => [p.month, p.change * 100]));
    return [{ label: labels[g], color: colors[g], values: xs.map((m) => byMonth.get(Number(m)) ?? null), dots: false }];
  });
  return { xs, series };
}

function WindowTile({ c, label, note }: { c?: ReleaseCurve; label: string; note: string }) {
  if (!c) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-100 tabular-nums mt-0.5">
        Months {c.window_from}–{c.window_to}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Bottom around month {c.bottom_month}, {pct(c.bottom_change)} vs launch. {note}
      </div>
    </div>
  );
}

// When to buy: how raw and PSA 10 prices move with months since a set's
// release, from PriceCharting's monthly history of every tracked card.
export default function TimingPage() {
  const [data, setData] = useState<ReleaseCurves | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("ja");

  useEffect(() => {
    fetchReleaseCurves().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (!data) return error ? <ErrorMsg msg={error} /> : <Spinner />;
  const curves = data.curves.filter((c) => c.lang === lang);
  const raw = curves.find((c) => c.grade === "raw");
  const ten = curves.find((c) => c.grade === "psa-10");
  const prem = curves.find((c) => c.grade === "premium");
  const price = curveSeries(curves, ["raw", "psa-10"], { raw: "Raw", "psa-10": "PSA 10" }, GRADE_COLOR);
  const premium = curveSeries(curves, ["premium"], { premium: "Premium" }, { premium: SERIES[2] });
  const bottoms = data.bottoms.filter((b) => b.lang === lang);
  const maxN = Math.max(0, ...curves.flatMap((c) => c.points.map((p) => p.n)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Timing</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          How prices move with months since a set's release, from PriceCharting's monthly history of every tracked card. Each month's step is the
          typical change across every card with prices in both months, chained from launch (month 0), so older sets count even without launch prices.
        </p>
      </div>

      <div className="inline-flex rounded border border-gray-700 overflow-hidden text-sm">
        {LANGS.map((l) => (
          <button key={l.key} onClick={() => setLang(l.key)}
            className={`px-3 py-1 ${lang === l.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {curves.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough history for this language yet.</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <WindowTile c={ten} label="Buy PSA 10s" note="Prices within 3% of the bottom through this window." />
            <WindowTile c={raw} label="Buy raw to grade" note="Grade early in the window so the 10s come back after the PSA 10 bottom." />
          </div>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Price vs launch month</h2>
              <Legend items={price.series.map((s) => ({ label: s.label, color: s.color }))} />
            </div>
            <LineChart weeks={price.xs} series={price.series} fmt={(v) => pct(v / 100)} axisFmt={axisPct}
              xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release`} />
            <p className="text-xs text-gray-500">
              Curves stop where fewer than 8 cards have history for the next month. Up to {maxN} cards per step.
            </p>
          </section>

          {prem && (
            <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-100">Graded premium (PSA 10 ÷ raw) vs launch month</h2>
              <LineChart weeks={premium.xs} series={premium.series} fmt={(v) => pct(v / 100)} axisFmt={axisPct}
                xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release`} />
              <p className="text-xs text-gray-500">
                Lowest around month {prem.bottom_month} ({pct(prem.bottom_change)}): PSA 10s are cheapest relative to raw then, so buying the slab beats
                grading; when the premium is high, grading pays more.
              </p>
            </section>
          )}

          {bottoms.length > 0 && (
            <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-100">When individual cards bottomed</h2>
              <p className="text-xs text-gray-500">Cards with prices from launch through month 18+: the month each was cheapest in its first two years.</p>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left py-1 font-medium">Grade</th>
                    <th className="text-right py-1 font-medium">Cards</th>
                    <th className="text-right py-1 font-medium">Median bottom</th>
                    <th className="text-right py-1 font-medium">Middle half</th>
                    <th className="text-right py-1 font-medium">Median drop from launch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
                  {bottoms.map((b) => (
                    <tr key={b.grade}>
                      <td className="py-1.5">{b.grade === "raw" ? "Raw" : "PSA 10"}</td>
                      <td className="py-1.5 text-right">{b.cards}</td>
                      <td className="py-1.5 text-right">month {b.median_month}</td>
                      <td className="py-1.5 text-right">months {b.p25_month}–{b.p75_month}</td>
                      <td className="py-1.5 text-right">{pct(b.median_drop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      <p className="text-xs text-gray-600">Built {new Date(data.built_at).toLocaleString()}; refreshes every 6 hours.</p>
    </div>
  );
}
