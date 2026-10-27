import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchReleaseCurves, fetchSetWindows, type CurveCategory, type CurveGrade, type CurveLang, type ReleaseCurve, type ReleaseCurves, type SetWindows,
  type WindowRow,
  CLASS_LABELS,
} from "../lib/api";
import { LineChart, Legend, SERIES, type ChartMarker, type LineSeries } from "../components/HistoryCharts";
import { PhaseChip, phaseOfWindow } from "../components/BuyWindows";
import { Spinner, ErrorMsg } from "../components/Spinner";
import CompareBy from "../components/CompareBy";
import AfterHype from "../components/AfterHype";

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
  { key: "promo", label: "Promos (untagged)", hint: "Promos not tagged with a class on the Promos page." },
  ...Object.entries(CLASS_LABELS).map(([key, label]) => ({ key, label, hint: "Tagged on the Promos page; counts from each card's own release date." })),
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

// Change vs launch at a month (null past the curve's end).
function changeAt(c: ReleaseCurve, month: number): number | null {
  return c.points.find((p) => p.month === month)?.change ?? null;
}

// Change from buying at month `from` to month `to`, off the curve:
// (1 + change(to)) / (1 + change(from)) - 1.
function changeBetween(c: ReleaseCurve, from: number, to: number): number | null {
  const a = changeAt(c, from), b = changeAt(c, to);
  return a == null || b == null ? null : (1 + b) / (1 + a) - 1;
}

// Curves as % change since `start` (0 = launch); months before start are empty.
function seriesFor(curves: ReleaseCurve[], picks: { key: string; label: string; color: string; dashed?: boolean }[], start = 0) {
  const months = Math.max(0, ...curves.map((c) => c.points[c.points.length - 1].month));
  const xs = Array.from({ length: months + 1 }, (_, i) => String(i));
  const series: LineSeries[] = picks.flatMap((p) => {
    const c = curves.find((x) => x.grade === p.key);
    if (!c) return [];
    return [{ label: p.label, color: p.color, dashed: p.dashed, values: xs.map((m) => {
      const v = Number(m) < start ? null : changeBetween(c, start, Number(m));
      return v == null ? null : v * 100;
    }) }];
  });
  return { xs, series };
}

const annualize = (r: number, months: number) => Math.pow(1 + r, 12 / months) - 1;
const HOLDS = [6, 12, 24, 36];

// What buying at `start` returned on each picked curve.
function ReturnsFrom({ curves, picked, start }: { curves: ReleaseCurve[]; picked: typeof GRADES; start: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1 pr-4 font-medium">Bought at month {start}</th>
            {HOLDS.map((h) => <th key={h} className="text-right py-1 px-3 font-medium" title={`Change from month ${start} to month ${start + h}, and per year`}>{h} months later</th>)}
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {picked.map((g) => {
            const c = curves.find((x) => x.grade === g.key);
            return (
              <tr key={g.key}>
                <td className="py-1 pr-4 whitespace-nowrap"><span className="inline-block w-3 h-0.5 mr-1.5 align-middle" style={{ background: g.color }} />{g.label}</td>
                {HOLDS.map((h) => {
                  const r = c ? changeBetween(c, start, start + h) : null;
                  return (
                    <td key={h} className="py-1 px-3 text-right">
                      {r == null ? <span className="text-gray-600" title="Past the end of the curve">—</span> : (
                        <>
                          <span className={r > 0 ? "text-green-400" : r < 0 ? "text-red-400" : ""}>{pct(r)}</span>
                          <span className="text-gray-500"> · {pct(annualize(r, h))}/yr</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const WIN_GRADE: Record<string, "raw" | "psa-10" | "cgc-10"> = { raw: "raw", "psa-10": "psa-10", "psa-9": "psa-10", "cgc-10": "cgc-10", "cgc-10-pristine": "cgc-10", "cgc-7-9": "raw" };

// The numbers for a set at month m on curve c: vs launch, vs the curve's
// bottom, and the next 6 / 12 / 24 months (with the 24 as a yearly rate).
function cycleCells(c: ReleaseCurve | undefined, m: number) {
  const v = (r: number | null, yearly?: number) => r == null ? <span className="text-gray-600">—</span> : (
    <>
      <span className={r > 0 ? "text-green-400" : r < 0 ? "text-red-400" : ""}>{pct(r)}</span>
      {yearly != null && <span className="text-gray-500"> · {pct(annualize(r, yearly))}/yr</span>}
    </>
  );
  const now = c ? changeAt(c, m) : null;
  const vsLow = c && now != null ? (1 + now) / (1 + c.bottom_change) - 1 : null;
  return (
    <>
      <td className="py-1 px-2 text-right">{v(now)}</td>
      <td className="py-1 px-2 text-right" title={c ? `The curve's low: ${pct(c.bottom_change)} vs launch, month ${c.bottom_month}` : undefined}>
        {vsLow == null ? <span className="text-gray-600">—</span> : <span className={vsLow <= 0.03 ? "text-green-400" : vsLow <= 0.15 ? "text-amber-300" : "text-gray-300"}>{Math.abs(vsLow) <= 0.03 ? "at low" : pct(vsLow)}</span>}
      </td>
      <td className="py-1 px-2 text-right">{v(c ? changeBetween(c, m, m + 6) : null)}</td>
      <td className="py-1 px-2 text-right">{v(c ? changeBetween(c, m, m + 12) : null)}</td>
      <td className="py-1 px-2 text-right whitespace-nowrap">{v(c ? changeBetween(c, m, m + 24) : null, 24)}</td>
    </>
  );
}

const SET_TIERS: CurveCategory[] = ["ir", "sir", "ultra", "gold", "gallery"];

// Each set's position on the curve for one tier + grade: where it is now,
// what the curve says comes next. Click a set for the same per rarity tier.
function SetCycle({ sets, curves, all, cat, grade }: { sets: SetWindows[]; curves: ReleaseCurve[]; all: ReleaseCurve[]; cat: CurveCategory; grade: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const c = curves.find((x) => x.grade === grade);
  if (!c) return <p className="text-xs text-gray-500">No {GRADE_LABEL[grade] ?? grade} curve for this tier and language.</p>;
  const rows = [...sets].sort((a, b) => a.months_since_release - b.months_since_release);
  const winOf = (s: SetWindows, g: string) => s.windows.find((w) => w.grade === g && w.tier === cat) ?? s.windows.find((w) => w.grade === g && w.tier === "all");
  const tierCurve = (t: CurveCategory) => all.find((x) => x.grade === grade && x.category === t);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1 pr-2 font-medium">Set</th>
            <th className="text-right py-1 px-2 font-medium">Month</th>
            <th className="text-left py-1 px-2 font-medium" title="Phase of the raw price cycle">Phase</th>
            <th className="text-left py-1 px-2 font-medium" title={`This tier's ${GRADE_LABEL[grade]} buy window`}>{GRADE_LABEL[grade]} window</th>
            <th className="text-right py-1 px-2 font-medium" title="Where the curve sits now vs launch">vs launch now</th>
            <th className="text-right py-1 px-2 font-medium" title="Where the curve sits now vs its typical low (green: at the low)">vs expected low</th>
            <th className="text-right py-1 px-2 font-medium" title="Curve change over the next 6 months">Next 6 mo</th>
            <th className="text-right py-1 px-2 font-medium" title="Curve change over the next 12 months (= the yearly rate)">Next 12 mo</th>
            <th className="text-right py-1 px-2 font-medium" title="Curve change over the next 24 months, and per year">Next 24 mo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800 text-gray-300">
          {rows.map((s) => {
            const m = Math.floor(s.months_since_release);
            const w = winOf(s, WIN_GRADE[grade] ?? "raw");
            const raw = winOf(s, "raw");
            const isOpen = open === s.code;
            const tiers = SET_TIERS.filter((t) => (s.tiers?.[t] ?? 0) > 0);
            return (
              <Fragment key={s.code}>
                <tr className={`cursor-pointer ${isOpen ? "bg-gray-800/40" : "hover:bg-gray-800/20"}`} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) setOpen(isOpen ? null : s.code); }}
                  title="Click for each rarity tier in this set">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <span className="text-gray-500 mr-1">{isOpen ? "▾" : "▸"}</span>
                    <Link to={`/browse/${encodeURIComponent(s.code)}`} className="text-gray-100 hover:text-indigo-300">{s.name}</Link>
                    {!s.in_print && <span className="ml-1.5 text-sky-300">OOP</span>}
                  </td>
                  <td className="py-1 px-2 text-right">M{m}</td>
                  <td className="py-1 px-2"><PhaseChip phase={phaseOfWindow(raw)} title={raw?.headline} /></td>
                  <td className="py-1 px-2 whitespace-nowrap text-gray-400" title={w?.headline}>
                    {w ? `M${w.from}–${w.to} · ${w.action === "buy" ? "in window" : w.action === "wait" ? `opens in ${w.months_to_window ?? "?"} mo` : w.action === "past" ? "past" : w.action === "watch_only" ? "watch only" : "—"}` : "—"}
                  </td>
                  {cycleCells(c, m)}
                </tr>
                {isOpen && (tiers.length === 0
                  ? <tr><td colSpan={9} className="py-1 pl-6 text-gray-500">No tracked IR / SIR / full-art / gold / gallery cards in this set.</td></tr>
                  : tiers.map((t) => {
                    const tc = tierCurve(t);
                    const tw = s.windows.find((x) => x.grade === (WIN_GRADE[grade] ?? "raw") && x.tier === t);
                    return (
                      <tr key={t} className="bg-gray-950/40 text-gray-400">
                        <td className="py-1 pr-2 pl-6 whitespace-nowrap">{CAT_LABEL[t]} <span className="text-gray-600">({s.tiers[t]} cards{tc ? "" : ", no curve"})</span></td>
                        <td className="py-1 px-2 text-right">M{m}</td>
                        <td className="py-1 px-2" />
                        <td className="py-1 px-2 whitespace-nowrap" title={tw?.headline}>{tw ? `M${tw.from}–${tw.to}` : "—"}</td>
                        {cycleCells(tc, m)}
                      </tr>
                    );
                  }))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  const [start, setStart] = useState(0);
  const [sets, setSets] = useState<SetWindows[]>([]);
  const [cycleGrade, setCycleGrade] = useState("psa-10");

  useEffect(() => {
    fetchReleaseCurves().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    fetchSetWindows(lang === "all" ? undefined : lang).then((r) => setSets(r.sets.filter((x) => x.lang !== "zh"))).catch(() => setSets([]));
  }, [lang]);

  const rows = useMemo(() => {
    if (!data) return [];
    const r = data.table.filter((x) => x.lang === lang && x.category in CAT_LABEL && (!tCat || x.category === tCat) && (!tGrade || x.grade === tGrade));
    return [...r].sort((a, b) => (sortValue(a, sort.k) - sortValue(b, sort.k)) * (sort.desc ? -1 : 1));
  }, [data, lang, tCat, tGrade, sort]);

  if (!data) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  const curves = data.curves.filter((c) => c.lang === lang && c.category === cat);
  const picked = GRADES.filter((g) => grades.includes(g.key));
  const price = seriesFor(curves, picked, start);
  const maxMonth = Math.max(0, ...curves.map((c) => c.points[c.points.length - 1].month));
  const markers: ChartMarker[] = sets.map((x) => ({ i: Math.floor(x.months_since_release), label: x.name }));
  const prem = curves.find((c) => c.grade === "premium");
  const premium = seriesFor(curves, [{ key: "premium", label: "Premium", color: SERIES[0] }]);
  const bottoms = data.bottoms.filter((b) => b.lang === lang && b.category === cat);
  const winners = data.table.filter((r) => r.lang === lang && r.category in CAT_LABEL && r.outperforms && r.trailing).sort((a, b) => b.trailing!.net_median_2y - a.trailing!.net_median_2y);
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
          {CATEGORIES.filter((c) => !(c.key in CLASS_LABELS) || data.curves.some((x) => x.category === c.key)).map((c) => (
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
              <h2 className="text-sm font-semibold text-gray-100">
                {start === 0 ? "Price vs launch month" : `Price vs month ${start} (bought at M${start})`} · {CAT_LABEL[cat]}
              </h2>
              <Legend items={price.series.map((s) => ({ label: s.label, color: s.color }))} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <label htmlFor="start-month" className="whitespace-nowrap">Buy at month</label>
              <input id="start-month" type="range" min={0} max={Math.max(0, maxMonth - 6)} value={Math.min(start, Math.max(0, maxMonth - 6))}
                onChange={(e) => setStart(Number(e.target.value))} className="w-64 accent-indigo-500" />
              <span className="font-mono text-gray-100 w-10">M{start}</span>
              {[0, 6, 8, 12, 18, 24].filter((m) => m <= maxMonth - 6).map((m) => (
                <button key={m} onClick={() => setStart(m)}
                  className={`px-1.5 py-0.5 rounded border ${start === m ? "border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:text-gray-200"}`}>M{m}</button>
              ))}
              <span className="text-gray-500">Slide to re-base every curve on buying at that month instead of at release.</span>
            </div>
            <LineChart weeks={price.xs} series={price.series} fmt={(v) => pct(v / 100)} axisFmt={axisPct} shadeBefore={start} markers={markers}
              fmtAt={(v, i) => (i - start >= 6 ? `${pct(v / 100)} · ${pct(annualize(v / 100, i - start))}/yr` : pct(v / 100))}
              xLabel={(m) => `M${m}`} xTitle={(m) => `Month ${m} since release${start ? ` (${Number(m) - start >= 0 ? `${Number(m) - start} months after buying` : "before buying"})` : ""}`} />
            <ReturnsFrom curves={curves} picked={picked} start={start} />
            <p className="text-xs text-gray-500">
              Curves stop where fewer than 8 cards have a price for the next month. <span className="text-indigo-300">●</span> marks sets at their current month
              (number = several sets); hover a month to see which.
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
        </>
      )}

      {curves.length > 0 && sets.length > 0 && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Where sets are on the cycle · {CAT_LABEL[cat]}</h2>
              <p className="text-xs text-gray-500">
                Each set at its current month on the {CAT_LABEL[cat]} curve: where the curve has it vs launch and vs its typical low, and what the curve
                says the next 6, 12 and 24 months typically bring. Click a set to see the same for each rarity tier in it. The curve is the tier's
                average, not a forecast for any one card.
              </p>
            </div>
            <select value={cycleGrade} onChange={(e) => setCycleGrade(e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200">
              {GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
          <SetCycle sets={sets} curves={curves} all={data.curves.filter((c) => c.lang === lang)} cat={cat} grade={cycleGrade} />
        </section>
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
              {CATEGORIES.filter((c) => !(c.key in CLASS_LABELS) || data.curves.some((x) => x.category === c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
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

      <CompareBy data={data} lang={lang} />

      <AfterHype data={data} lang={lang} />

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
          <p className="text-xs text-gray-500">
            Cards with prices from launch through month 18+: the month each was cheapest in its first two years, and that low as a share of its release
            price. A card selling inside "Low ÷ release" is at a typical bottom for its kind.
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left py-1 font-medium">Grade</th>
                <th className="text-right py-1 font-medium">Cards (sets)</th>
                <th className="text-right py-1 font-medium">Median bottom</th>
                <th className="text-right py-1 font-medium">Middle half</th>
                <th className="text-right py-1 font-medium">Median drop from launch</th>
                <th className="text-right py-1 font-medium" title="Each card's low ÷ its release price (its price in the first two months): median, and the middle half of cards">Low ÷ release</th>
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
                  <td className="py-1.5 text-right">
                    {b.low_ratio != null ? <>{Math.round(b.low_ratio * 100)}% <span className="text-gray-500">({Math.round((b.low_ratio_p25 ?? 0) * 100)}–{Math.round((b.low_ratio_p75 ?? 0) * 100)}%)</span></> : "—"}
                  </td>
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
