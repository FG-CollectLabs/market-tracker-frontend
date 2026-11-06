import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchHunt, type HuntPlay, type HuntReport, type HuntRow, type ValueSource } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";

// Hunt list: which cards of the set to hunt raw copies of, and so pre-grade
// the most. Each card is priced four ways to the horizon; the score is the
// grade-later yearly return, scaled down when PSA 10s are slow to sell.

const usd = (c?: number | null) => (c == null ? "–" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null, digits = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const SOURCES: [ValueSource | "", string][] = [["", "Settings default"], ["ebay", "eBay sold"], ["comps", "Sold comps (eBay + Fanatics)"], ["pricecharting", "PriceCharting"]];
const SOURCE_LABEL: Record<string, string> = { pricecharting: "PriceCharting", sold_90d: "sold comps", ebay_sold_90d: "eBay sold" };

type SortKey = "score" | "later" | "hold" | "raw" | "flip" | "if10" | "liquidity" | "listed" | "premium";
const SORTS: { key: SortKey; label: string; val: (r: HuntRow) => number | undefined }[] = [
  { key: "score", label: "Hunt score", val: (r) => r.score },
  { key: "later", label: "Grade later, yearly", val: (r) => r.grade_later?.yearly },
  { key: "hold", label: "Grade now + hold, yearly", val: (r) => r.grade_now_hold?.yearly },
  { key: "raw", label: "Hold raw, yearly", val: (r) => r.hold_raw?.yearly },
  { key: "flip", label: "Flip now, ROI", val: (r) => r.flip_now?.roi },
  { key: "if10", label: "Profit if it 10s", val: (r) => r.if_ten_profit_cents },
  { key: "liquidity", label: "PSA 10 sales a week", val: (r) => r.psa10_sales_per_week },
  { key: "listed", label: "Raw copies listed", val: (r) => r.raw_listed },
  { key: "premium", label: "Premium widening", val: (r) => r.premium_then / r.premium_now - 1 },
];

export default function HuntTab({ game, code }: { game: string; code: string }) {
  const [source, setSource] = useState<ValueSource | "">("ebay");
  const [years, setYears] = useState(5);
  const [gradeEarly, setGradeEarly] = useState(0.5); // grade this long before selling
  const [feeGrowth, setFeeGrowth] = useState(0.03);
  const [hideSlow, setHideSlow] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [rep, setRep] = useState<HuntReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchHunt(game, code, { years, gradeAt: Math.max(0, years - gradeEarly), feeGrowth, valueSource: source || undefined })
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [game, code, source, years, gradeEarly, feeGrowth]);

  const rows = useMemo(() => {
    const s = SORTS.find((x) => x.key === sort)!;
    return (rep?.rows ?? []).filter((r) => !hideSlow || !r.slow)
      .slice().sort((a, b) => (s.val(b) ?? -Infinity) - (s.val(a) ?? -Infinity));
  }, [rep, sort, hideSlow]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-200";
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Which cards to hunt raw copies of, and so pre-grade the most. Each card is priced four ways over {years} years (PSA):
        grade now and sell when it's back, <span className="text-gray-200">buy raw now and grade {gradeEarly === 0 ? "at the end" : `${gradeEarly} year${gradeEarly === 1 ? "" : "s"} before selling`}</span>,
        grade now and hold the slab, or hold raw. Future prices follow the card's release curve; grade odds are PSA's population rates.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-400 flex items-center gap-1.5">Prices
          <select value={source} onChange={(e) => setSource(e.target.value as ValueSource | "")} className={sel}>
            {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-1.5">Horizon
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} className={sel}>
            {[3, 5, 7].map((y) => <option key={y} value={y}>{y} years</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-1.5">Grade
          <select value={gradeEarly} onChange={(e) => setGradeEarly(Number(e.target.value))} className={sel}>
            {[0.5, 1, 2].map((g) => <option key={g} value={g}>{g === 0.5 ? "6 months" : `${g} year${g === 1 ? "" : "s"}`} before selling</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-1.5" title="How fast PSA's fees rise each year: grading later pays the later fee">Fee growth
          <select value={feeGrowth} onChange={(e) => setFeeGrowth(Number(e.target.value))} className={sel}>
            {[0, 0.03, 0.05, 0.1].map((f) => <option key={f} value={f}>{f * 100}%/yr</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-1.5">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={sel}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-1.5">
          <input type="checkbox" checked={hideSlow} onChange={(e) => setHideSlow(e.target.checked)} />
          Hide slow sellers (PSA 10 under once a month)
        </label>
        {loading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <Spinner />}
      {rep && <Thesis rep={rep} />}
      {rep && (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left max-lg:!static">
              <tr>
                <th className="py-2 px-3 font-medium">Card</th>
                <th className="py-2 px-2 font-medium text-right">Raw</th>
                <th className="py-2 px-2 font-medium text-right">PSA 10</th>
                <th className="py-2 px-2 font-medium text-right" title="PSA population: share of copies graded that came back a 10">10 odds</th>
                <th className="py-2 px-2 font-medium text-right" title="PSA 10 ÷ raw, today → at the horizon">Premium</th>
                <th className="py-2 px-2 font-medium text-right text-gray-300" title="Buy raw now, grade late, sell at the horizon: yearly return">Grade later</th>
                <th className="py-2 px-2 font-medium text-right" title="Grade now, hold the slab, sell at the horizon: yearly return">Grade now + hold</th>
                <th className="py-2 px-2 font-medium text-right" title="Buy raw, sell raw at the horizon: yearly return">Hold raw</th>
                <th className="py-2 px-2 font-medium text-right" title="Grade now, sell when it's back: return on cost, not annualized">Flip now</th>
                <th className="py-2 px-2 font-medium text-right" title="Grade later and it comes back a 10: profit per copy">If it 10s</th>
                <th className="py-2 px-2 font-medium text-right" title="PSA 10 sales a week (eBay + Fanatics, 8 weeks)">10s / wk</th>
                <th className="py-2 px-2 font-medium text-right" title="Live raw eBay listings: copies to hunt">Raw listed</th>
                <th className="py-2 px-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.display_key} r={r} rep={rep} open={open === r.display_key} onToggle={() => setOpen(open === r.display_key ? null : r.display_key)} />
              ))}
              {rows.length === 0 && <tr><td colSpan={13} className="p-3 text-gray-500">No priced cards.</td></tr>}
            </tbody>
          </table>
          {rep.skipped > 0 && <p className="text-[11px] text-gray-500 px-3 py-2">{rep.skipped} tracked cards left out: no raw or PSA 10 price yet.</p>}
        </div>
      )}
      {rep && <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method} Selling fee on slabs {pct(rep.params.sell_fee_pct)}, on raw {pct(rep.params.exit_fee_pct, 2)}; sourcing {pct(rep.params.sourcing_pct)} over raw market (Settings).</p>}
    </div>
  );
}

function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// The set's read on the delay-grading thesis.
function Thesis({ rep }: { rep: HuntReport }) {
  const priced = rep.rows.filter((r) => r.grade_later?.yearly != null && r.grade_now_hold?.yearly != null);
  const widen = rep.rows.filter((r) => r.premium_then > r.premium_now).length;
  const later = median(priced.map((r) => r.grade_later!.yearly!));
  const hold = median(priced.map((r) => r.grade_now_hold!.yearly!));
  const raw = median(rep.rows.filter((r) => r.hold_raw?.yearly != null).map((r) => r.hold_raw!.yearly!));
  const beatSP = priced.filter((r) => r.grade_later!.yearly! > rep.params.benchmark).length;
  const extrap = rep.rows.filter((r) => r.growth?.extrapolated).length;
  const tile = "rounded-lg border border-gray-800 bg-gray-900 p-3";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
      <div className={tile}>
        <div className="text-gray-500">Median yearly return</div>
        <div className="text-lg text-white tabular-nums">{pct(later, 1)}</div>
        <div className="text-gray-500 tabular-nums">grade later · vs {pct(hold, 1)} grade now + hold · {pct(raw, 1)} hold raw</div>
      </div>
      <div className={tile}>
        <div className="text-gray-500">Beat the S&amp;P 500 ({pct(rep.params.benchmark)}/yr)</div>
        <div className="text-lg text-white tabular-nums">{beatSP} <span className="text-sm text-gray-500">of {priced.length}</span></div>
        <div className="text-gray-500">grading later, at today's population odds</div>
      </div>
      <div className={tile}>
        <div className="text-gray-500">PSA 10 premium over raw widens</div>
        <div className="text-lg text-white tabular-nums">{widen} <span className="text-sm text-gray-500">of {rep.rows.length}</span></div>
        <div className="text-gray-500">by the horizon, on each card's tier curve</div>
      </div>
      <div className={tile}>
        <div className="text-gray-500">Past the curves' data</div>
        <div className="text-lg text-white tabular-nums">{extrap} <span className="text-sm text-gray-500">of {rep.rows.length}</span></div>
        <div className="text-gray-500">extended at the curve's last two years' rate (capped ±15%/yr): treat as rougher</div>
      </div>
    </div>
  );
}

function Yearly({ p, bench, strong }: { p?: HuntPlay; bench: number; strong?: boolean }) {
  if (!p || p.yearly == null) return <span className="text-gray-600">–</span>;
  const c = p.yearly < 0 ? "text-red-300" : p.yearly >= bench ? (strong ? "text-green-300" : "text-green-300/80") : "text-gray-300";
  return <span className={`${c} ${strong ? "font-semibold" : ""}`} title={`${usd(p.cost_cents)} in → ${usd(p.proceeds_cents)} out over ${p.years} years`}>{pct(p.yearly, 1)}</span>;
}

function Row({ r, rep, open, onToggle }: { r: HuntRow; rep: HuntReport; open: boolean; onToggle: () => void }) {
  const b = rep.params.benchmark;
  const td = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";
  return (
    <Fragment>
      <tr className="border-t border-gray-800 align-top hover:bg-gray-800/40 cursor-pointer" onClick={onToggle}>
        <td className="py-1.5 px-3">
          <div className="flex gap-2 items-start min-w-[13rem]">
            {r.image_url && <img src={r.image_url} alt="" loading="lazy" className="w-8 h-11 object-cover rounded border border-gray-800" />}
            <div className="min-w-0">
              <Link to={`/cards/${r.display_key}`} onClick={(e) => e.stopPropagation()} className="text-gray-100 hover:text-indigo-300">{r.name}</Link>
              <span className="text-gray-500"> #{r.number}</span>
              {r.slow && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="PSA 10s sell less than once a month">slow</span>}
              {(r.notes?.length ?? 0) > 0 && <span className="ml-1 text-gray-600" title={r.notes!.join("\n")}>ⓘ</span>}
            </div>
          </div>
        </td>
        <td className={`${td} text-gray-300`}>{usd(r.raw_cents)}</td>
        <td className={`${td} text-gray-300`}>{usd(r.psa10_cents)}</td>
        <td className={`${td} text-gray-300`}>{r.p10 ? `${Math.round(r.p10 * 100)}%` : "–"}</td>
        <td className={`${td} text-gray-400`}>
          {r.premium_now.toFixed(1)}× <span className={r.premium_then > r.premium_now ? "text-green-300/80" : "text-gray-500"}>→ {r.premium_then.toFixed(1)}×</span>
        </td>
        <td className={td}><Yearly p={r.grade_later} bench={b} strong /></td>
        <td className={td}><Yearly p={r.grade_now_hold} bench={b} /></td>
        <td className={td}><Yearly p={r.hold_raw} bench={b} /></td>
        <td className={`${td} ${r.flip_now && r.flip_now.roi > 0 ? "text-gray-200" : "text-red-300"}`}>{r.flip_now ? pct(r.flip_now.roi) : "–"}</td>
        <td className={`${td} text-gray-300`}>{usd(r.if_ten_profit_cents)}</td>
        <td className={`${td} ${r.slow ? "text-amber-300" : "text-gray-300"}`}>{r.psa10_sales_per_week.toFixed(1)}</td>
        <td className={`${td} text-gray-300`}>{r.raw_listed}</td>
        <td className="py-1.5 px-3 text-right tabular-nums text-white">{r.score != null ? pct(r.score, 1) : "–"}</td>
      </tr>
      {open && (
        <tr className="bg-gray-950/50">
          <td colSpan={13} className="px-3 py-3">
            <div className="grid gap-4 md:grid-cols-2 text-xs text-gray-400">
              <div className="space-y-1">
                <div className="text-gray-200 font-medium">Prices and growth</div>
                <div className="tabular-nums">
                  Raw {usd(r.raw_cents)} ({SOURCE_LABEL[r.value_sources.raw] ?? r.value_sources.raw}) · PSA 10 {usd(r.psa10_cents)} ({SOURCE_LABEL[r.value_sources["psa-10"]] ?? r.value_sources["psa-10"]})
                  {r.psa9_cents != null && <> · PSA 9 {usd(r.psa9_cents)}</>}
                </div>
                <div className="tabular-nums">Odds: 10 {Math.round(r.p10 * 100)}%{r.p9 != null && <>, 9 {Math.round(r.p9 * 100)}%</>}, lower (sold as raw) {Math.round(Math.max(0, 1 - r.p10 - (r.p9 ?? 0)) * 100)}%</div>
                {r.growth && (
                  <div className="tabular-nums">
                    Over {rep.params.years} years ({r.growth.curve.replace(/^ · /, "all · ")} curve): raw ×{r.growth.raw.toFixed(2)}, PSA 10 ×{r.growth.psa10.toFixed(2)}, PSA 9 ×{r.growth.psa9.toFixed(2)}
                    {r.growth.extrapolated && r.growth.extrap_yearly && (
                      <span className="text-amber-300/80"> · extended past the data at {Object.entries(r.growth.extrap_yearly).map(([g, v]) => `${g} ${pct(v, 1)}/yr`).join(", ")}</span>
                    )}
                  </div>
                )}
                <div className="tabular-nums">
                  Selling: PSA 10s {r.psa10_sales_per_week.toFixed(2)}/wk{r.psa10_days_per_sale != null && <> (one every {r.psa10_days_per_sale} days)</>} · raw {r.raw_sales_per_week.toFixed(2)}/wk · {r.raw_listed} raw listed on eBay
                </div>
                {r.notes?.map((n) => <div key={n} className="text-amber-300/80">{n}</div>)}
              </div>
              <div className="space-y-1">
                <div className="text-gray-200 font-medium">The four plays, per copy</div>
                {([["Grade later", r.grade_later], ["Grade now + hold", r.grade_now_hold], ["Hold raw", r.hold_raw], ["Flip now", r.flip_now]] as const).map(([l, p]) => p && (
                  <div key={l} className="tabular-nums">
                    <span className="text-gray-300">{l}:</span> {usd(p.cost_cents)} in → {usd(p.proceeds_cents)} out, {usd(p.profit_cents)} profit
                    {p.yearly != null ? <> · {pct(p.yearly, 1)}/yr</> : <> · {pct(p.roi)} ROI</>}
                    {p.note && <div className="text-gray-500 pl-3">{p.note}</div>}
                  </div>
                ))}
                {r.fee_timing_gain != null && <div className="text-gray-500">Grading later instead of now adds {pct(r.fee_timing_gain, 1)} a year (the fee is paid later).</div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
