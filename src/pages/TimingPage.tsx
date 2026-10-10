import { useEffect, useMemo, useState } from "react";
import {
  fetchReleaseCurves, type CurveCategory, type CurveGrade, type CurveLang, type ReleaseCurve, type ReleaseCurves, type WindowRow,
} from "../lib/api";
import { LineChart, Legend, SERIES, type LineSeries } from "../components/HistoryCharts";
import { Spinner, ErrorMsg } from "../components/Spinner";

const LANGS: { key: CurveLang; label: string }[] = [
  { key: "ja", label: "Japanese" },
  { key: "en", label: "English" },
  { key: "all", label: "All" },
];

// Era-aware tiers (see categoryOf in the backend).
const CATEGORIES: { key: CurveCategory; label: string; hint: string }[] = [
  { key: "all", label: "All tracked", hint: "Every tracked card." },
  { key: "ir", label: "IR tier", hint: "SV / ME Illustration Rare; Japanese AR (and CHR in Sword & Shield)." },
  { key: "sir", label: "SIR tier", hint: "SV / ME Special Illustration Rare; Japanese SAR (CSR); Sword & Shield / Sun & Moon Secret Rares (alt arts, rainbows and golds: TCGdex doesn't separate them)." },
  { key: "ultra", label: "Full art / UR", hint: "Ultra Rares and full-art trainers; Japanese SR." },
  { key: "gold", label: "Gold / hyper", hint: "Hyper and Mega Hyper Rares; SV-era Secret Rares; Japanese UR." },
  { key: "gallery", label: "TG / GG", hint: "Sword & Shield Trainer Gallery and Galarian Gallery." },
  { key: "promo", label: "Promos", hint: "Tracked promos (owned ones for now). Box vs ETB promos need a promo-source list (roadmap)." },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<CurveCategory, string>;

// Same colors as the card page's grade picker; CGC 7-9 pairs with raw (dashed).
const GRADES: { key: Exclude<CurveGrade, "premium">; label: string; color: string; dashed?: boolean; source: string }[] = [
  { key: "psa-10", label: "PSA 10", color: SERIES[0], source: "PriceCharting" },
  { key: "psa-9", label: "PSA 9", color: SERIES[1], source: "PriceCharting" },
  { key: "cgc-10-pristine", label: "CGC Pristine 10", color: SERIES[2], source: "Fanatics + eBay sales" },
  { key: "cgc-10", label: "CGC 10", color: SERIES[3], source: "Fanatics + eBay sales" },
  { key: "raw", label: "Raw", color: SERIES[4], source: "PriceCharting" },
  { key: "cgc-7-9", label: "CGC 7–9", color: SERIES[4], dashed: true, source: "Fanatics + eBay sales" },
];
const GRADE_LABEL = Object.fromEntries(GRADES.map((g) => [g.key, g.label])) as Record<string, string>;

const pct = (v: number) => {
  const r = Math.round(v * 100);
  return `${r > 0 ? "+" : ""}${r === 0 ? 0 : r}%`;
};
const axisPct = (v: number) => `${+v.toFixed(Math.abs(v) < 5 && v !== Math.round(v) ? 1 : 0)}%`;

function seriesFor(curves: ReleaseCurve[], picks: { key: string; label: string; color: string; dashed?: boolean }[]) {
  const months = Math.max(0, ...curves.map((c) => c.points[c.points.length - 1].month));
  const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
  const series: LineSeries[] = picks.flatMap((p) => {
    const c = curves.find((x) => x.grade === p.key);
    if (!c) return [];
    const byMonth = new Map(c.points.map((pt) => [pt.month, pt.change * 100]));
    return [{ label: p.label, color: p.color, dashed: p.dashed, values: xs.map((m) => byMonth.get(Number(m)) ?? null) }];
  });
  return { xs, series };
}

function ProvisionalBadge({ c }: { c: { provisional: boolean; min_sets: number } }) {
  if (!c.provisional) return null;
  return (
    <span className="px-1.5 rounded bg-amber-950/60 text-amber-300 text-[10px]" title="Fewer than 8 sets behind some month up to the window">
      provisional · {c.min_sets} set{c.min_sets === 1 ? "" : "s"}
    </span>
  );
}

type SortKey = "window" | "drop" | "hold" | "trail" | "beat" | "cards";

function sortValue(r: WindowRow, k: SortKey): number {
  switch (k) {
    case "window": return r.window_from;
    case "drop": return r.bottom_change;
    case "hold": return r.hold_rate ?? -9;
    case "trail": return r.trailing?.median ?? -9;
    case "beat": return r.trailing?.beat_share ?? -1;
    case "cards": return r.cards;
  }
}

// When to buy, and what holding returns: release curves by card category,
// grade and language, the buy-window table, and appreciation vs the S&P.
export default function TimingPage() {
  const [data, setData] = useState<ReleaseCurves | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<CurveLang>("ja");
  const [cat, setCat] = useState<CurveCategory>("all");
  const [grades, setGrades] = useState<string[]>(["psa-10", "raw"]);
  const [tCat, setTCat] = useState<CurveCategory | "">("");
  const [tGrade, setTGrade] = useState<string>("");
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "trail", desc: true });

  useEffect(() => {
    fetchReleaseCurves().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const r = data.table.filter((x) => x.lang === lang && (!tCat || x.category === tCat) && (!tGrade || x.grade === tGrade));
    return [...r].sort((a, b) => (sortValue(a, sort.k) - sortValue(b, sort.k)) * (sort.desc ? -1 : 1));
  }, [data, lang, tCat, tGrade, sort]);

  if (!data) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  const curves = data.curves.filter((c) => c.lang === lang && c.category === cat);
  const picked = GRADES.filter((g) => grades.includes(g.key));
  const price = seriesFor(curves, picked);
  const prem = curves.find((c) => c.grade === "premium");
  const premium = seriesFor(curves, [{ key: "premium", label: "Premium", color: SERIES[0] }]);
  const bottoms = data.bottoms.filter((b) => b.lang === lang && b.category === cat);
  const winners = data.table.filter((r) => r.lang === lang && r.outperforms && r.trailing).sort((a, b) => b.trailing!.net_median_2y - a.trailing!.net_median_2y);
  const th = (k: SortKey, label: string, title?: string) => (
    <th className="text-right py-1 px-2 font-medium cursor-pointer select-none hover:text-gray-300" title={title}
      onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : true }))}>
      {label}{sort.k === k ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Timing</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          How prices move with months since a set's release, by card tier, grade and language, and what holding past the hype cycle has returned.
          Raw, PSA 10 and PSA 9 come from PriceCharting's monthly history; CGC grades from Fanatics + eBay sales. Each month's step is the typical
          change across cards with prices in both months (gaps up to 3 months), chained from launch.
        </p>
        <p className="text-xs text-amber-300/90 max-w-3xl mt-1">
          Placeholders until more sets have history: use timing as a supporting reason, not a rule. Curves firm up once 8+ sets back every month
          through the buying window.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {LANGS.map((l) => (
            <button key={l.key} onClick={() => setLang(l.key)}
              className={`px-3 py-1 ${lang === l.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="inline-flex flex-wrap rounded border border-gray-700 overflow-hidden">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} title={c.hint}
              className={`px-2.5 py-1 ${cat === c.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-3">{CATEGORIES.find((c) => c.key === cat)?.hint}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {GRADES.map((g) => (
          <label key={g.key} className="flex items-center gap-1.5 text-gray-300" title={g.source}>
            <input type="checkbox" checked={grades.includes(g.key)} className="accent-indigo-500"
              onChange={(e) => setGrades((cur) => (e.target.checked ? [...cur, g.key] : cur.filter((x) => x !== g.key)))} />
            <span className="inline-block w-3 h-0.5" style={{ background: g.color, opacity: g.dashed ? 0.6 : 1 }} />
            {g.label}
          </label>
        ))}
      </div>

      {curves.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough history for this tier and language yet.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {picked.map((g) => {
              const c = curves.find((x) => x.grade === g.key);
              return (
                <div key={g.key} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5" style={{ background: g.color }} /> Buy {g.label}
                    </span>
                    {c && <ProvisionalBadge c={c} />}
                  </div>
                  {c ? (
                    <>
                      <div className="text-xl font-semibold text-gray-100 tabular-nums mt-0.5">Months {c.window_from}–{c.window_to}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Bottom ~month {c.bottom_month}, {pct(c.bottom_change)} vs launch · {c.cards} cards
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500 mt-1">Not enough history.</div>
                  )}
                </div>
              );
            })}
          </div>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Price vs launch month · {CAT_LABEL[cat]}</h2>
              <Legend items={price.series.map((s) => ({ label: s.label, color: s.color }))} />
            </div>
            <LineChart weeks={price.xs} series={price.series} fmt={(v) => pct(v / 100)} axisFmt={axisPct}
              xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release`} />
            <p className="text-xs text-gray-500">Curves stop where fewer than 8 cards have a price for the next month.</p>
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
        </>
      )}

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Buy windows and returns · {LANGS.find((l) => l.key === lang)?.label}</h2>
            <p className="text-xs text-gray-500">
              Click a column to sort. Appreciation is the realized yearly change of cards past their hype cycle (price at month 12+ vs about a year
              later); "beats S&P" counts cards whose two-year hold, after a {Math.round(data.sell_fee_pct * 100)}% selling fee, tops the{" "}
              {Math.round(data.benchmark * 100)}%/yr benchmark.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <select value={tCat} onChange={(e) => setTCat(e.target.value as CurveCategory | "")} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-gray-200">
              <option value="">Every tier</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={tGrade} onChange={(e) => setTGrade(e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-gray-200">
              <option value="">Every grade</option>
              {GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1 pr-2 font-medium">Tier</th>
                <th className="text-left py-1 px-2 font-medium">Grade</th>
                {th("window", "Buy window", "Months within 3% of the bottom")}
                {th("drop", "Bottom", "Change vs launch at the bottom")}
                {th("hold", "Hold after window", "Curve's yearly change from the end of the window to its last month")}
                {th("trail", "Appreciation / yr", "Median realized yearly change of post-hype cards")}
                {th("beat", "Beats S&P", "Share of cards beating the benchmark after fees, two-year hold")}
                {th("cards", "Cards")}
                <th className="py-1 pl-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
              {rows.map((r) => (
                <tr key={r.category + r.grade} className={r.outperforms ? "bg-green-950/20" : ""}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{CAT_LABEL[r.category]}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">{GRADE_LABEL[r.grade] ?? r.grade}</td>
                  <td className="py-1.5 px-2 text-right">M{r.window_from}–{r.window_to}</td>
                  <td className="py-1.5 px-2 text-right">M{r.bottom_month} · {pct(r.bottom_change)}</td>
                  <td className="py-1.5 px-2 text-right">
                    {r.hold_rate != null ? <span title={`over ${r.hold_months} months`}>{pct(r.hold_rate)}</span> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {r.trailing ? (
                      <span title={`Middle half ${pct(r.trailing.p25)} to ${pct(r.trailing.p75)}; ${r.trailing.cards} cards from ${r.trailing.sets} sets. After fees, two-year hold: ${pct(r.trailing.net_median_2y)}/yr`}
                        className={r.outperforms ? "text-green-400 font-medium" : r.trailing.median < 0 ? "text-red-400" : ""}>
                        {pct(r.trailing.median)}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right">{r.trailing ? `${Math.round(r.trailing.beat_share * 100)}%` : <span className="text-gray-600">—</span>}</td>
                  <td className="py-1.5 px-2 text-right text-gray-400">{r.cards}</td>
                  <td className="py-1.5 pl-2"><ProvisionalBadge c={r} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-3 text-gray-500">No rows for these filters yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Outperforming the S&P after fees</h2>
        {winners.length === 0 ? (
          <p className="text-xs text-gray-500">
            No tier/grade in this language beats {Math.round(data.benchmark * 100)}%/yr after the selling fee yet (or there aren't 8+ post-hype cards
            to measure). It fills in as more sets pass their first year of history.
          </p>
        ) : (
          <ul className="text-sm text-gray-300 space-y-1">
            {winners.map((r) => (
              <li key={r.category + r.grade}>
                <span className="text-green-400 font-medium">{CAT_LABEL[r.category]} · {GRADE_LABEL[r.grade]}</span>: median {pct(r.trailing!.median)}/yr,{" "}
                {pct(r.trailing!.net_median_2y)}/yr after fees held two years; {Math.round(r.trailing!.beat_share * 100)}% of {r.trailing!.cards} cards
                beat the benchmark.
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500">Past appreciation, not a forecast: it rests on 1–2 years of history and on cards that were tracked because they're chase cards.</p>
      </section>

      {bottoms.length > 0 && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-100">When individual cards bottomed · {CAT_LABEL[cat]}</h2>
          <p className="text-xs text-gray-500">Cards with prices from launch through month 18+: the month each was cheapest in its first two years.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left py-1 font-medium">Grade</th>
                <th className="text-right py-1 font-medium">Cards (sets)</th>
                <th className="text-right py-1 font-medium">Median bottom</th>
                <th className="text-right py-1 font-medium">Middle half</th>
                <th className="text-right py-1 font-medium">Median drop from launch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300 tabular-nums">
              {bottoms.map((b) => (
                <tr key={b.grade}>
                  <td className="py-1.5">{GRADE_LABEL[b.grade] ?? b.grade}</td>
                  <td className="py-1.5 text-right">{b.cards} ({b.sets})</td>
                  <td className="py-1.5 text-right">month {b.median_month}</td>
                  <td className="py-1.5 text-right">months {b.p25_month}–{b.p75_month}</td>
                  <td className="py-1.5 text-right">{pct(b.median_drop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-xs text-gray-600">Built {new Date(data.built_at).toLocaleString()}; refreshes every 6 hours.</p>
    </div>
  );
}
