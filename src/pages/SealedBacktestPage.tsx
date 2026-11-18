import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  fetchSealedBacktestBest, fetchSealedPlan, runSealedBacktest, saveSealedPlan, sealedBuyList, type BuyList, type BuyShare, type SetClass, sweepSealedBacktest, sweepSealedExits, SEALED_KIND_LABEL,
  type BacktestExitRow, type BacktestKindBest, type BacktestLot, type BacktestResult, type BacktestSweepRow, type SealedKind, type SealedRule,
} from "../lib/api";
import { Spinner } from "../components/Spinner";
import { pct, usd } from "./SealedTimingPage";

// Sealed backtests: buying and selling rules written down as mechanics,
// replayed over every set's chart. The best rule per product type sits on
// top; strategies (one rule, or several legs run as one book) below, each
// with a deep dive and experiments (sell rules, discounts, sizing).

const KINDS: SealedKind[] = ["etb", "pc_etb", "booster_box", "booster_bundle", "booster_pack", "upc", "premium_collection", "special_collection", "collection_box", "tin", "blister"];
const MAIN_KINDS: SealedKind[] = ["etb", "pc_etb", "booster_box", "booster_bundle", "booster_pack"];
const LINE_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c"];

interface Strategy { name: string; legs: SealedRule[]; inPlan?: boolean }

const leg = (r: SealedRule): SealedRule => ({ units: 1, cadence: "month", exit: "hold", hold_months: 36, ...r });
const PRESETS: Strategy[] = [
  {
    name: "Standard ETB stack: month 3 on, doubled from month 12, tripled on the hottest in print",
    legs: [
      leg({ name: "Base: month 3 until out of print", rule: "schedule", kinds: ["etb"], set_class: "standard", start_month: 3, until_oop: true, hold_months: 36 }),
      leg({ name: "Double: month 12 until out of print", rule: "schedule", kinds: ["etb"], set_class: "standard", start_month: 12, until_oop: true, hold_months: 36 }),
      leg({ name: "Triple: the hottest standard ETB in print", rule: "hype", kinds: ["etb"], set_class: "standard", hype_by: "momentum", hype_units: 1, in_print_only: true, rotation_months: 36, pick_n: 1, hold_months: 36 }),
    ],
  },
  {
    name: "My ETB plan v2: weekly from month 2 + monthly from month 12 + weekly on reprint dips",
    legs: [
      leg({ name: "1 a week from month 2 until out of print", rule: "schedule", kinds: ["etb"], cadence: "week", start_month: 2, until_oop: true, hold_months: 36 }),
      leg({ name: "+1 a month from month 12 until out of print", rule: "schedule", kinds: ["etb"], start_month: 12, until_oop: true, hold_months: 36 }),
      leg({ name: "+1 a week on a reprint dip until back at its high", rule: "dip", kinds: ["etb"], cadence: "week", dip_pct: 0.2, dip_own: true, dip_follow: "recovered", hold_months: 48 }),
    ],
  },
  {
    name: "My ETB plan: month 12 until out of print + reprint dips + 20%-off early buys",
    legs: [
      leg({ name: "Month 12 until out of print", rule: "schedule", kinds: ["etb"], start_month: 12, until_oop: true, hold_months: 36 }),
      leg({ name: "Reprint dips (20%, own drop)", rule: "dip", kinds: ["etb"], dip_pct: 0.2, dip_own: true, hold_months: 48 }),
      leg({ name: "Months 0–12 at 20% under market", rule: "schedule", kinds: ["etb"], start_month: 0, end_month: 12, buy_discount: 0.2, hold_months: 36 }),
    ],
  },
  { name: "Month 12 until out of print", legs: [leg({ rule: "schedule", kinds: ["etb"], start_month: 12, until_oop: true })] },
  { name: "Hottest ETB in rotation, $60 a month", legs: [leg({ rule: "hype", kinds: ["etb"], budget_cents: 6000, hype_by: "momentum", rotation_months: 24, pick_n: 1 })] },
  { name: "1 ETB at release, hold 3 years (baseline)", legs: [leg({ rule: "schedule", kinds: ["etb"], start_month: 0, end_month: 0 })] },
];

const STORE = "sealed.backtest.strategies.v2";
const loadStrategies = (): Strategy[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (Array.isArray(v) && v.length) return v;
    // v1: a flat list of rules, one strategy each
    const old = JSON.parse(localStorage.getItem("sealed.backtest.rules") ?? "null");
    if (Array.isArray(old) && old.length) return old.map((r: SealedRule) => ({ name: r.name ?? "", legs: [{ ...r, name: "" }] }));
  } catch { /* private window */ }
  return PRESETS;
};
const saveStrategies = (s: Strategy[]) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window */ } };

function exitText(s: SealedRule) {
  switch (s.exit ?? "hold") {
    case "mark": return "never sell (valued today)";
    case "all_at": return s.sell_date ? `sell all on ${s.sell_date}` : `sell all ${s.all_at_months ?? 48}mo after the first buy`;
    case "target": return `sell at ${s.target_mult ?? 3}× ${s.target_basis === "msrp" ? "MSRP" : "cost"}${s.max_hold_months ? `, else after ${s.max_hold_months}mo` : ""}`;
    case "winddown": return `wind down from ${s.wind_start ?? 36}mo: ${s.wind_units ? `${s.wind_units}/mo` : `over ${s.wind_months ?? 24}mo`}`;
  }
  return `sell after ${s.hold_months ?? 36}mo`;
}

function followText(s: SealedRule) {
  const per = `${s.units ?? 1} a ${s.cadence === "week" ? "week" : "month"}`;
  switch (s.dip_follow) {
    case "months": return `, then ${per} for ${s.dip_follow_months ?? 6} months`;
    case "recovered": return `, then ${per} until back at its high`;
    case "oop": return `, then ${per} until out of print`;
  }
  return "";
}

function describe(s: SealedRule) {
  const k = s.kinds.map((x) => SEALED_KIND_LABEL[x]).join(" + ");
  const qty = s.sizing === "dollars" ? `$${((s.dollars_cents ?? 5000) * (s.units ?? 1) / 100).toFixed(0)} of ${k}` : `${s.units ?? 1} ${k}`;
  const off = s.buy_discount ? ` at ${Math.round(s.buy_discount * 100)}% off` : "";
  let buy: string;
  if (s.rule === "hype") buy = `${s.hype_units ? `${s.hype_units} a ${s.cadence ?? "month"} of` : `$${((s.budget_cents ?? 0) / 100).toFixed(0)}/mo on`} the ${s.pick_n ?? 1} most hyped ${k} (${s.hype_by}, sets ≤${s.rotation_months ?? 24}mo old${s.in_print_only ? ", in print" : ""})`;
  else if (s.rule === "dip") buy = `${qty} on every ${Math.round((s.dip_pct ?? 0.15) * 100)}% dip${s.dip_own ? " of its own (reprint)" : ""}${followText(s)}${s.start_month || s.end_month != null ? `, months ${s.start_month ?? 0}–${s.end_month ?? "∞"}` : ""}`;
  else {
    const end = s.until_oop ? (s.end_month != null ? ` to month ${s.end_month} or out of print` : " until out of print") : s.end_month != null && s.end_month !== s.start_month ? ` to month ${s.end_month}` : " only";
    buy = `${qty} a ${s.cadence ?? "month"}, month ${s.start_month ?? 0}${end}`;
  }
  return `${buy}${off}${s.set_class ? ` (${s.set_class} sets)` : ""} · ${exitText(s)}`;
}

// what goes to the API: one leg = that rule; several = a portfolio
function toRule(st: Strategy): SealedRule {
  const legs = st.legs.map((l) => ({ ...l, name: l.name || describe(l) }));
  const name = st.name || legs.map((l) => l.name).join(" + ");
  return legs.length === 1 ? { ...legs[0], name } : { name, rule: "portfolio", kinds: legs[0]?.kinds ?? ["etb"], legs };
}
const mapLegs = (r: SealedRule, f: (l: SealedRule) => SealedRule): SealedRule =>
  r.rule === "portfolio" ? { ...r, legs: (r.legs ?? []).map(f) } : f(r);

const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200 tabular-nums";
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
const u = (n: number) => (Math.round(n * 10) / 10).toString();
const irrTone = (v: number | null | undefined, bench = 0.1) => (v == null ? "text-gray-500" : v >= bench ? "text-emerald-300" : v >= 0 ? "text-amber-300" : "text-rose-300");

function Card({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">{right}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function More<T>({ rows, initial = 15, render }: { rows: T[]; initial?: number; render: (rows: T[]) => ReactNode }) {
  const [n, setN] = useState(initial);
  return (
    <>
      {render(rows.slice(0, n))}
      {rows.length > n && (
        <div className="pt-2 text-xs">
          <button onClick={() => setN(n + 25)} className="text-indigo-300 hover:underline">show {Math.min(25, rows.length - n)} more</button>
          <button onClick={() => setN(rows.length)} className="ml-3 text-gray-500 hover:text-gray-300">show all {rows.length}</button>
        </div>
      )}
    </>
  );
}

const th = "py-1.5 pr-4 font-medium whitespace-nowrap";
const thr = `${th} text-right`;
const td = "py-1 pr-4 align-top";
const tdr = `${td} text-right tabular-nums whitespace-nowrap`;

// ---- best per product type --------------------------------------------------------

function BestPerKind({ gross, onAdd }: { gross: boolean; onAdd: (st: Strategy) => void }) {
  const [data, setData] = useState<{ kinds: BacktestKindBest[]; latest: string } | null>(null);
  const [kind, setKind] = useState<SealedKind>("etb");
  const [err, setErr] = useState("");
  const [showGaps, setShowGaps] = useState(false);
  const [cls, setCls] = useState<SetClass>("all");
  useEffect(() => { setData(null); fetchSealedBacktestBest(gross, cls).then(setData).catch((e) => setErr(String(e))); }, [gross, cls]);
  const k = data?.kinds.find((x) => x.kind === kind);
  return (
    <Card title="Best rule per product type"
      right={<div className="flex flex-wrap gap-1">{MAIN_KINDS.map((x) => (
        <button key={x} onClick={() => setKind(x)} className={`rounded px-2.5 py-1 ${kind === x ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{SEALED_KIND_LABEL[x]}</button>
      ))}</div>}>
      {err && <div className="text-sm text-rose-400 break-all">{err}</div>}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-gray-500 mr-1" title="Special sets print no booster box (Hidden Fates, Crown Zenith, 151, Prismatic Evolutions, ...): their ETBs, PC ETBs and bundles are the main way to open them">Sets:</span>
        {([["all", "All"], ["standard", "Standard (booster box)"], ["special", "Special (no booster box)"]] as [SetClass, string][]).map(([c, l]) => (
          <button key={c} onClick={() => setCls(c)} className={`rounded px-2.5 py-1 ${cls === c ? "bg-fuchsia-700 text-white" : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200"}`}>{l}</button>
        ))}
      </div>
      {!data ? <Spinner /> : !k ? <div className="text-sm text-gray-500">No {SEALED_KIND_LABEL[kind]} products charted.</div> : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Every variant of each family tried on all {k.sets} {SEALED_KIND_LABEL[kind]} sets (hold 24 / 36 / 48 months); the highest yearly return among
            rules with 8+ sets and 10+ finished sales. <span className="text-amber-300">Thin</span>: nothing in the family had that much evidence.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {k.families.map((f) => {
              const b = f.best;
              return (
                <div key={f.family} className={`rounded-lg border p-3 space-y-2 ${f.thin ? "border-amber-900/60" : "border-gray-800"} bg-gray-950/40`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{f.label}</span>
                    {f.thin && <span className="text-[10px] rounded border border-amber-800 px-1 text-amber-300">thin</span>}
                    <span className={`ml-auto text-xl font-semibold tabular-nums ${irrTone(b.irr)}`}>{pct(b.irr, 1)}<span className="text-xs text-gray-500">/yr</span></span>
                  </div>
                  <div className="text-sm text-gray-100">{describe(b.strategy)}</div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-gray-400">
                    <div><div className="text-gray-500">multiple</div><div className="text-gray-200 tabular-nums">{b.multiple.toFixed(2)}×</div></div>
                    <div><div className="text-gray-500">finished sales</div><div className="text-gray-200 tabular-nums">{b.closed_multiple != null ? `${b.closed_multiple.toFixed(2)}×` : "–"}</div></div>
                    <div><div className="text-gray-500">sets</div><div className="text-gray-200 tabular-nums">{b.sets}</div></div>
                    <div><div className="text-gray-500">sold / held</div><div className={`tabular-nums ${b.open_lots > b.closed_lots ? "text-amber-300" : "text-gray-200"}`}>{b.closed_lots} / {b.open_lots}</div></div>
                  </div>
                  {f.discounts && f.discounts.length > 1 && (
                    <div className="text-[11px]" title="The same rule with every buy this much under the month's market price">
                      <div className="text-gray-500 mb-0.5">if bought under market</div>
                      <div className="flex flex-wrap gap-1">
                        {f.discounts.map((x) => (
                          <span key={x.discount} className="rounded bg-gray-900 border border-gray-800 px-1.5 py-0.5 tabular-nums">
                            <span className="text-gray-500">{x.discount ? `−${Math.round(x.discount * 100)}%` : "market"}</span> <span className={irrTone(x.irr)}>{pct(x.irr, 0)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">{f.variants} variants · worst month {pct(b.worst_drawdown)}</span>
                    <button onClick={() => onAdd({ name: `${SEALED_KIND_LABEL[kind]}${cls !== "all" ? ` (${cls} sets)` : ""}: best ${f.label.toLowerCase()}`, legs: [{ ...b.strategy, name: "" }] })}
                      className="text-indigo-300 hover:underline">add to my strategies</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-400">
            Data: {k.full_history} of {k.sets} sets charted from release.
            {k.missing_early.length > 0 && <>
              {" "}<span className="text-amber-300">{k.missing_early.length} start months or years later</span>, so they can only take part in later-month rules.
              <button onClick={() => setShowGaps(!showGaps)} className="ml-2 text-indigo-300 hover:underline">{showGaps ? "hide" : "which"}</button>
            </>}
          </div>
          {showGaps && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {k.missing_early.map((m) => (
                <span key={m.set} className="rounded border border-gray-800 px-1.5 py-0.5 text-gray-300" title={`released ${m.release}, chart from ${m.first_month}`}>
                  {m.set_name} <span className="text-gray-500">{m.missing_months}mo missing</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- strategy editor ----------------------------------------------------------------

function LegEditor({ r, onChange, onRemove, canRemove }: { r: SealedRule; onChange: (r: SealedRule) => void; onRemove: () => void; canRemove: boolean }) {
  const set = (p: Partial<SealedRule>) => onChange({ ...r, ...p });
  const row = "flex flex-wrap items-center gap-x-4 gap-y-1.5";
  const lbl = "flex items-center gap-1";
  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 p-3 space-y-2 text-xs text-gray-300">
      <div className="flex items-center gap-2">
        <input value={r.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Leg name (optional)" className={`${inp} w-64`} />
        <span className="text-[11px] text-gray-500 truncate">{describe(r)}</span>
        {canRemove && <button onClick={onRemove} className="ml-auto text-gray-500 hover:text-rose-300">remove leg</button>}
      </div>
      <div className={row}>
        <label className={lbl}>Buy rule
          <select value={r.rule} onChange={(e) => set({ rule: e.target.value as SealedRule["rule"] })} className={inp}>
            <option value="schedule">Schedule after release</option>
            <option value="dip">Buy the dip</option>
            <option value="hype">Hype pick each month</option>
          </select>
        </label>
        <span className="flex flex-wrap items-center gap-1">
          {KINDS.map((k) => (
            <label key={k} className={`px-1.5 py-0.5 rounded border cursor-pointer ${r.kinds.includes(k) ? "border-indigo-600 text-indigo-200" : "border-gray-800 text-gray-500"}`}>
              <input type="checkbox" className="hidden" checked={r.kinds.includes(k)}
                onChange={(e) => set({ kinds: e.target.checked ? [...r.kinds, k] : r.kinds.filter((x) => x !== k) })} />
              {SEALED_KIND_LABEL[k]}
            </label>
          ))}
        </span>
      </div>
      {r.rule !== "hype" && (
        <div className={row}>
          <label className={lbl}>Size
            <select value={r.sizing ?? "units"} onChange={(e) => set({ sizing: e.target.value as "units" | "dollars" })} className={inp}>
              <option value="units">same count of each</option><option value="dollars">same money on each</option>
            </select>
          </label>
          {(r.sizing ?? "units") === "units"
            ? <label className={lbl}><input value={r.units ?? 1} onChange={(e) => set({ units: num(e.target.value) })} className={`${inp} w-12`} /> per buy</label>
            : <label className={lbl}>$<input value={(r.dollars_cents ?? 5000) / 100} onChange={(e) => set({ dollars_cents: Math.round((num(e.target.value) ?? 50) * 100) })} className={`${inp} w-16`} /> per buy</label>}
          <label className={lbl} title="Every buy at this much under the month's market price (a store discount or fire sale)">
            at <input value={Math.round((r.buy_discount ?? 0) * 100)} onChange={(e) => set({ buy_discount: (num(e.target.value) ?? 0) / 100 || undefined })} className={`${inp} w-10`} />% under market
          </label>
        </div>
      )}
      {r.rule === "schedule" && (
        <div className={row}>
          <label className={lbl}>every
            <select value={r.cadence ?? "month"} onChange={(e) => set({ cadence: e.target.value as "week" | "month" })} className={inp}>
              <option value="week">week</option><option value="month">month</option>
            </select>
          </label>
          <label className={lbl}>from month <input value={r.start_month ?? 0} onChange={(e) => set({ start_month: num(e.target.value) ?? 0 })} className={`${inp} w-12`} /></label>
          <label className={lbl}>to month <input value={r.end_month ?? ""} placeholder="–" onChange={(e) => set({ end_month: num(e.target.value) ?? null })} className={`${inp} w-12`} /></label>
          <label className={lbl}><input type="checkbox" checked={!!r.until_oop} onChange={(e) => set({ until_oop: e.target.checked })} /> stop once out of print</label>
          {r.until_oop && <label className={lbl} title="Out of print = the price this far above its low since buying started">
            at +<input value={Math.round((r.oop_runup ?? 0.3) * 100)} onChange={(e) => set({ oop_runup: (num(e.target.value) ?? 30) / 100 })} className={`${inp} w-10`} />% off the low</label>}
        </div>
      )}
      {r.rule === "dip" && (
        <div className={row}>
          <label className={lbl}>when <input value={Math.round((r.dip_pct ?? 0.15) * 100)} onChange={(e) => set({ dip_pct: (num(e.target.value) ?? 15) / 100 })} className={`${inp} w-10`} />% under its 6-month high</label>
          <label className={lbl} title="Only when it fell 15% more than every other set's same product: a reprint or fresh wave, not the whole market"><input type="checkbox" checked={!!r.dip_own} onChange={(e) => set({ dip_own: e.target.checked })} /> reprints only (its own drop)</label>
          <label className={lbl} title="After a trigger: buy once, or keep buying on a cadence">then
            <select value={r.dip_follow ?? ""} onChange={(e) => set({ dip_follow: e.target.value as SealedRule["dip_follow"] })} className={inp}>
              <option value="">buy once</option>
              <option value="months">keep buying for…</option>
              <option value="recovered">keep buying until back at its high</option>
              <option value="oop">keep buying until out of print</option>
            </select>
          </label>
          {r.dip_follow === "months" && <label className={lbl}><input value={r.dip_follow_months ?? 6} onChange={(e) => set({ dip_follow_months: num(e.target.value) })} className={`${inp} w-10`} /> months</label>}
          {r.dip_follow && <label className={lbl}><input value={r.units ?? 1} onChange={(e) => set({ units: num(e.target.value) ?? 1 })} className={`${inp} w-10`} /> a
            <select value={r.cadence ?? "month"} onChange={(e) => set({ cadence: e.target.value as SealedRule["cadence"] })} className={inp}><option value="week">week</option><option value="month">month</option></select></label>}
          <label className={lbl}>{r.dip_follow ? "next trigger" : "at most every"} <input value={r.cooldown_months ?? 6} onChange={(e) => set({ cooldown_months: num(e.target.value) })} className={`${inp} w-10`} /> months</label>
          <label className={lbl}>months <input value={r.start_month ?? 0} onChange={(e) => set({ start_month: num(e.target.value) ?? 0 })} className={`${inp} w-10`} />
            to <input value={r.end_month ?? ""} placeholder="∞" onChange={(e) => set({ end_month: num(e.target.value) ?? null })} className={`${inp} w-10`} /> after release</label>
        </div>
      )}
      {r.rule === "hype" && (
        <div className={row}>
          <label className={lbl}>buy
            <select value={r.hype_units ? "units" : "budget"} onChange={(e) => set(e.target.value === "units" ? { hype_units: 1 } : { hype_units: undefined })} className={inp}>
              <option value="budget">a monthly budget</option><option value="units">a fixed number of units</option>
            </select></label>
          {r.hype_units
            ? <label className={lbl}><input value={r.hype_units} onChange={(e) => set({ hype_units: num(e.target.value) || 1 })} className={`${inp} w-10`} /> a
                <select value={r.cadence ?? "month"} onChange={(e) => set({ cadence: e.target.value as SealedRule["cadence"] })} className={inp}><option value="month">month</option><option value="week">week</option></select></label>
            : <label className={lbl}>$<input value={(r.budget_cents ?? 6000) / 100} onChange={(e) => set({ budget_cents: Math.round((num(e.target.value) ?? 0) * 100) })} className={`${inp} w-16`} /> a month</label>}
          <label className={lbl} title="Skip sets whose price is 30%+ above its low since month 3 (they look out of print)"><input type="checkbox" checked={!!r.in_print_only} onChange={(e) => set({ in_print_only: e.target.checked || undefined })} /> in print only</label>
          <label className={lbl}>on the top <input value={r.pick_n ?? 1} onChange={(e) => set({ pick_n: num(e.target.value) })} className={`${inp} w-10`} /></label>
          <label className={lbl}>by
            <select value={r.hype_by ?? "momentum"} onChange={(e) => set({ hype_by: e.target.value as SealedRule["hype_by"] })} className={inp}>
              <option value="momentum">3-month momentum</option><option value="rising12">12-month rise</option>
              <option value="premium">premium over MSRP</option><option value="newest">newest set</option>
            </select>
          </label>
          <label className={lbl}>sets released in the last <input value={r.rotation_months ?? 24} onChange={(e) => set({ rotation_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>
        </div>
      )}
      <div className={row}>
        <label className={lbl}>Sell
          <select value={r.exit ?? "hold"} onChange={(e) => set({ exit: e.target.value as SealedRule["exit"] })} className={inp}>
            <option value="hold">each lot after N months</option><option value="all_at">everything at once</option>
            <option value="target">at a price target</option><option value="winddown">wind down each product</option>
            <option value="mark">never (value today)</option>
          </select>
        </label>
        {(r.exit ?? "hold") === "hold" && <label className={lbl}><input value={r.hold_months ?? 36} onChange={(e) => set({ hold_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>}
        {r.exit === "all_at" && <>
          <label className={lbl}><input value={r.all_at_months ?? 48} onChange={(e) => set({ all_at_months: num(e.target.value), sell_date: undefined })} className={`${inp} w-12`} /> months after the first buy</label>
          <label className={lbl}>or on <input value={r.sell_date ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ sell_date: e.target.value || undefined })} className={`${inp} w-20`} /></label>
        </>}
        {r.exit === "target" && <>
          <label className={lbl}>at <input value={r.target_mult ?? 3} onChange={(e) => set({ target_mult: num(e.target.value) })} className={`${inp} w-12`} />×
            <select value={r.target_basis ?? "cost"} onChange={(e) => set({ target_basis: e.target.value as "cost" | "msrp" })} className={inp}>
              <option value="cost">what I paid</option><option value="msrp">MSRP</option>
            </select>
          </label>
          <label className={lbl}>else after <input value={r.max_hold_months ?? ""} placeholder="–" onChange={(e) => set({ max_hold_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>
        </>}
        {r.exit === "winddown" && <>
          <label className={lbl}>from <input value={r.wind_start ?? 36} onChange={(e) => set({ wind_start: num(e.target.value) })} className={`${inp} w-12`} /> months after a product&apos;s first buy,</label>
          <label className={lbl}>sell <input value={r.wind_units ?? ""} placeholder="–" onChange={(e) => set({ wind_units: num(e.target.value) })} className={`${inp} w-12`} /> a month</label>
          <label className={lbl}>or all over <input value={r.wind_months ?? 24} onChange={(e) => set({ wind_months: num(e.target.value), wind_units: undefined })} className={`${inp} w-12`} /> months</label>
        </>}
        <label className={lbl} title="Special sets print no booster box">
          <select value={r.set_class ?? ""} onChange={(e) => set({ set_class: (e.target.value || undefined) as SealedRule["set_class"] })} className={inp}>
            <option value="">all sets</option><option value="standard">standard sets only</option><option value="special">special sets only</option>
          </select></label>
        <label className={lbl}>sets released <input value={r.released_from ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ released_from: e.target.value || undefined })} className={`${inp} w-20`} />
          to <input value={r.released_to ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ released_to: e.target.value || undefined })} className={`${inp} w-20`} /></label>
      </div>
    </div>
  );
}

function StrategyEditor({ st, color, onChange, onRemove }: { st: Strategy; color: string; onChange: (s: Strategy) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color }} className="text-base">●</span>
        <input value={st.name} onChange={(e) => onChange({ ...st, name: e.target.value })} placeholder="Strategy name" className={`${inp} flex-1 min-w-[12rem] text-sm`} />
        <span className="text-gray-500">{st.legs.length === 1 ? "1 rule" : `${st.legs.length} legs`}</span>
        <label className="flex items-center gap-1 text-emerald-300" title="Part of the plan the buy list (and the sealed watchlist) follows">
          <input type="checkbox" checked={!!st.inPlan} onChange={(e) => onChange({ ...st, inPlan: e.target.checked })} /> in my plan</label>
        <button onClick={() => setOpen(!open)} className="text-indigo-300 hover:underline">{open ? "done" : "edit"}</button>
        <button onClick={onRemove} className="text-gray-500 hover:text-rose-300">remove</button>
      </div>
      {!open ? (
        <ul className="space-y-0.5 text-[11px] text-gray-400 pl-5 list-disc">
          {st.legs.map((l, i) => <li key={i}>{l.name ? <span className="text-gray-300">{l.name}: </span> : null}{describe(l)}</li>)}
        </ul>
      ) : (
        <div className="space-y-2">
          {st.legs.map((l, i) => (
            <LegEditor key={i} r={l} canRemove={st.legs.length > 1}
              onChange={(n) => onChange({ ...st, legs: st.legs.map((x, j) => (j === i ? n : x)) })}
              onRemove={() => onChange({ ...st, legs: st.legs.filter((_, j) => j !== i) })} />
          ))}
          <button onClick={() => onChange({ ...st, legs: [...st.legs, leg({ rule: "schedule", kinds: st.legs[0]?.kinds ?? ["etb"] })] })}
            className="text-xs text-indigo-300 hover:underline">+ add a leg (run another rule in the same book)</button>
        </div>
      )}
    </div>
  );
}

// ---- results ----------------------------------------------------------------------------

function Chart({ results, mode }: { results: BacktestResult[]; mode: "value" | "multiple" }) {
  const series = results.map((r) => r.timeline.map((p) => ({
    m: p.month,
    v: mode === "value" ? p.returned_cents + p.held_cents - p.invested_cents : p.invested_cents ? (p.returned_cents + p.held_cents) / p.invested_cents : 1,
  })));
  const months = [...new Set(series.flatMap((s) => s.map((p) => p.m)))].sort();
  if (months.length < 2) return null;
  const vals = series.flatMap((s) => s.map((p) => p.v));
  const base = mode === "value" ? 0 : 1;
  const y0 = Math.min(base, ...vals), y1 = Math.max(base, ...vals);
  const W = 1200, H = 260, L = 64, B = 20;
  const x = (m: string) => L + (months.indexOf(m) / (months.length - 1)) * (W - L - 10);
  const y = (v: number) => 8 + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - B - 12);
  const fmt = (v: number) => (mode === "value" ? usd(v) : `${v.toFixed(2)}×`);
  const years = months.filter((m) => m.endsWith("-01"));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {years.map((m) => <g key={m}><line x1={x(m)} x2={x(m)} y1={8} y2={H - B} stroke="#1f2937" /><text x={x(m)} y={H - 5} textAnchor="middle" className="fill-gray-500 text-[11px]">{m.slice(0, 4)}</text></g>)}
      <line x1={L} x2={W - 10} y1={y(base)} y2={y(base)} stroke="#4b5563" strokeDasharray="3 3" />
      <text x={L - 6} y={y(y1) + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{fmt(y1)}</text>
      <text x={L - 6} y={y(base) + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{fmt(base)}</text>
      {y0 < base && <text x={L - 6} y={y(y0) + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{fmt(y0)}</text>}
      {series.map((s, i) => (
        <polyline key={i} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} points={s.map((p) => `${x(p.m)},${y(p.v)}`).join(" ")} />
      ))}
    </svg>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return [...m.entries()];
}

type Tab = "buys" | "sales" | "held" | "sets" | "exits" | "discount" | "sizing" | "follow";
// how long a dip keeps buying, as the experiment tries it
const FOLLOWS: { name: string; p: Partial<SealedRule> }[] = [
  { name: "Buy once per dip", p: { dip_follow: "" } },
  { name: "Keep buying 3 months", p: { dip_follow: "months", dip_follow_months: 3 } },
  { name: "Keep buying 6 months", p: { dip_follow: "months", dip_follow_months: 6 } },
  { name: "Keep buying 12 months", p: { dip_follow: "months", dip_follow_months: 12 } },
  { name: "Keep buying until back at its high", p: { dip_follow: "recovered" } },
  { name: "Keep buying until out of print", p: { dip_follow: "oop" } },
  { name: "Until out of print, but not past month 36", p: { dip_follow: "oop", end_month: 36 } },
  { name: "Until out of print, but not past month 24", p: { dip_follow: "oop", end_month: 24 } },
];

function Detail({ r, color, gross, onUseExit, onAdd }: {
  r: BacktestResult; color: string; gross: boolean; onUseExit: (exit: Partial<SealedRule>) => void; onAdd: (st: Strategy) => void;
}) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [lots, setLots] = useState<BacktestLot[] | null>(null);
  const [exits, setExits] = useState<BacktestExitRow[] | null>(null);
  const [disc, setDisc] = useState<BacktestResult[] | null>(null);
  const [sizing, setSizing] = useState<BacktestResult[] | null>(null);
  const [follow, setFollow] = useState<BacktestResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setLots(null); setExits(null); setDisc(null); setSizing(null); setFollow(null); }, [r]);
  const hasDip = r.strategy.rule === "dip" || (r.strategy.legs ?? []).some((l) => l.rule === "dip");
  const portfolio = r.strategy.rule === "portfolio";
  const open = async (t: Tab) => {
    if (tab === t) { setTab(null); return; }
    setTab(t); setErr("");
    try {
      setBusy(true);
      if ((t === "buys" || t === "sales" || t === "held") && !lots) setLots((await runSealedBacktest([r.strategy], gross, true)).results[0]?.lots ?? []);
      if (t === "exits" && !exits) setExits((await sweepSealedExits(r.strategy, gross)).rows);
      if (t === "discount" && !disc) {
        const ds = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
        setDisc((await runSealedBacktest(ds.map((d) => ({ ...mapLegs(r.strategy, (l) => ({ ...l, buy_discount: d || undefined })), name: `${Math.round(d * 100)}% under market` })), gross)).results);
      }
      if (t === "follow" && !follow) {
        setFollow((await runSealedBacktest(FOLLOWS.map((f) => ({ ...mapLegs(r.strategy, (l) => (l.rule === "dip" ? { ...l, ...f.p, name: "" } : l)), name: f.name })), gross)).results);
      }
      if (t === "sizing" && !sizing) {
        const avg = Math.max(100, r.avg_cost_cents);
        setSizing((await runSealedBacktest([
          { ...mapLegs(r.strategy, (l) => ({ ...l, sizing: "units" })), name: "Same count of each (1 of every set)" },
          { ...mapLegs(r.strategy, (l) => ({ ...l, sizing: "dollars", dollars_cents: avg })), name: `Same money on each (${usd(avg)} a buy)` },
        ], gross)).results);
      }
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => open(t)} className={`rounded px-2.5 py-1 ${tab === t ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-800"}`}>{label}</button>
  );
  const sales = (lots ?? []).flatMap((l) => (l.sales ?? []).map((x) => ({ ...x, l })));
  const held = groupBy((lots ?? []).filter((l) => l.open_units > 0), (l) => `${l.set_name} · ${SEALED_KIND_LABEL[l.kind]}`);
  const head = (cols: [string, boolean?][]) => (
    <thead className="text-gray-500 text-left"><tr>{cols.map(([c, right], i) => <th key={i} className={right ? thr : th}>{c}</th>)}</tr></thead>
  );
  return (
    <Card title={<><span style={{ color }}>●</span> {r.strategy.name}</>}
      right={<span className="text-gray-500">{r.first_buy} → {r.last_buy} · {r.buys} buys · {r.sets} sets · avg cost {usd(r.avg_cost_cents)} · avg hold {r.avg_hold_months}mo</span>}>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-gray-500 mr-1">Deep dive</span>
          {tabBtn("buys", "What it bought")}{tabBtn("sales", "What it sold")}{tabBtn("held", "Still held")}{tabBtn("sets", "By set")}
          <span className="text-gray-500 ml-4 mr-1">Experiments</span>
          {tabBtn("exits", "Best way to sell")}{tabBtn("discount", "Buying at a discount")}{tabBtn("sizing", "Same count vs same money")}{hasDip && tabBtn("follow", "How long to buy after a dip")}
          {busy && <span className="text-gray-500 ml-2">working…</span>}
        </div>
        {err && <div className="text-rose-400 break-all">{err}</div>}
        {r.notes && r.notes.length > 0 && <ul className="text-[11px] text-amber-300/80 list-disc pl-5">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

        {tab === "sets" && (
          <More rows={r.by_set} render={(rows) => (
            <table className="w-full">{head([["Set"], ["Released"], ["Units", true], ["In", true], ["Out (net)", true], ["Multiple", true]])}
              <tbody>{rows.map((s) => (
                <tr key={s.set} className="border-t border-gray-800">
                  <td className={`${td} text-gray-200`}>{s.set_name}</td><td className={`${td} text-gray-500`}>{s.release?.slice(0, 7)}</td>
                  <td className={tdr}>{u(s.units)}</td><td className={tdr}>{usd(s.invested_cents)}</td><td className={tdr}>{usd(s.value_cents)}</td>
                  <td className={`${tdr} ${s.multiple >= 1 ? "text-emerald-300" : "text-rose-300"}`}>{s.multiple.toFixed(2)}×</td>
                </tr>
              ))}</tbody>
            </table>
          )} />
        )}

        {tab === "buys" && lots && (
          <More rows={groupBy(lots, (l) => l.month)} initial={12} render={(months) => (
            <table className="w-full">{head([["Month"], ["Bought"], ...(portfolio ? [["Leg"] as [string]] : []), ["Units", true], ["Price", true], ["Spent", true], ["Why"], ["What became of it"]])}
              <tbody>{months.map(([m, ls]) => ls.map((l, i) => {
                const ss = l.sales ?? [];
                return (
                  <tr key={`${m}-${i}`} className={i === 0 ? "border-t border-gray-800" : ""}>
                    <td className={`${td} text-gray-400 whitespace-nowrap`}>{i === 0 ? m : ""}</td>
                    <td className={`${td} text-gray-200 whitespace-nowrap`}>{l.set_name} · {SEALED_KIND_LABEL[l.kind]}</td>
                    {portfolio && <td className={`${td} text-gray-400`}>{l.leg}</td>}
                    <td className={tdr}>{u(l.units)}</td><td className={tdr}>{usd(l.cost_cents)}</td><td className={tdr}>{usd(Math.round(l.cost_cents * l.units))}</td>
                    <td className={`${td} text-gray-500`}>{l.why ?? ""}</td>
                    <td className={`${td} text-gray-400`}>
                      {ss.length === 1 && l.open_units === 0 ? `sold ${ss[0].month} at ${usd(ss[0].price_cents)} (${(ss[0].net_cents / l.cost_cents).toFixed(2)}× net)`
                        : <>{ss.length > 0 && `${ss.length} sales, ${u(ss.reduce((a, x) => a + x.units, 0))} units`}
                          {l.open_units > 0 && <span className="text-amber-300/80">{ss.length ? " · " : ""}{u(l.open_units)} held, {usd(l.open_net_cents)} net each today</span>}</>}
                    </td>
                  </tr>
                );
              }))}</tbody>
            </table>
          )} />
        )}

        {tab === "sales" && lots && (sales.length === 0 ? <div className="text-gray-500">Nothing sold yet under this sell rule: everything is still held.</div> : (
          <More rows={groupBy([...sales].sort((a, b) => a.month.localeCompare(b.month)), (x) => x.month)} initial={12} render={(months) => (
            <table className="w-full">{head([["Month"], ["Sold"], ["Units", true], ["Price", true], ["Kept (net)", true], ["vs cost", true], ["Bought"], ["Why"]])}
              <tbody>{months.map(([m, xs]) => xs.map((x, i) => (
                <tr key={`${m}-${i}`} className={i === 0 ? "border-t border-gray-800" : ""}>
                  <td className={`${td} text-gray-400 whitespace-nowrap`}>{i === 0 ? m : ""}</td>
                  <td className={`${td} text-gray-200 whitespace-nowrap`}>{x.l.set_name} · {SEALED_KIND_LABEL[x.l.kind]}</td>
                  <td className={tdr}>{u(x.units)}</td><td className={tdr}>{usd(x.price_cents)}</td><td className={tdr}>{usd(Math.round(x.net_cents * x.units))}</td>
                  <td className={`${tdr} ${x.net_cents >= x.l.cost_cents ? "text-emerald-300" : "text-rose-300"}`}>{(x.net_cents / x.l.cost_cents).toFixed(2)}×</td>
                  <td className={`${td} text-gray-500 whitespace-nowrap`}>{x.l.month} at {usd(x.l.cost_cents)}</td>
                  <td className={`${td} text-gray-500`}>{x.why}</td>
                </tr>
              )))}</tbody>
            </table>
          )} />
        ))}

        {tab === "held" && lots && (held.length === 0 ? <div className="text-gray-500">Everything sold.</div> : (
          <More rows={held} render={(rows) => (
            <table className="w-full">{head([["Product"], ["Units", true], ["Cost", true], ["Worth today (net)", true], ["Multiple", true]])}
              <tbody>{rows.map(([k, ls]) => {
                const units = ls.reduce((a, l) => a + l.open_units, 0);
                const cost = ls.reduce((a, l) => a + l.cost_cents * l.open_units, 0);
                const worth = ls.reduce((a, l) => a + l.open_net_cents * l.open_units, 0);
                return (
                  <tr key={k} className="border-t border-gray-800">
                    <td className={`${td} text-gray-200`}>{k}</td><td className={tdr}>{u(units)}</td><td className={tdr}>{usd(Math.round(cost))}</td>
                    <td className={tdr}>{usd(Math.round(worth))}</td>
                    <td className={`${tdr} ${worth >= cost ? "text-emerald-300" : "text-rose-300"}`}>{(worth / Math.max(1, cost)).toFixed(2)}×</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )} />
        ))}

        {tab === "exits" && exits && (
          <>
            <p className="text-gray-400">The same buys under each sell rule, best yearly return first.{portfolio && " (A portfolio's legs all get the same sell rule here.)"}</p>
            <More rows={exits} render={(rows) => (
              <table className="w-full">{head([["Sell rule"], ["IRR /yr", true], ["Multiple", true], ["Profit", true], ["vs S&P", true], ["Avg hold", true], ["Sold / held", true], [""]])}
                <tbody>{rows.map((x, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className={`${td} text-gray-200`}>{x.exits.replace(/^Leg \d+ \([^)]*\): /, "")}</td>
                    <td className={`${tdr} font-semibold ${irrTone(x.irr)}`}>{pct(x.irr, 1)}</td>
                    <td className={tdr}>{x.multiple.toFixed(2)}×</td><td className={tdr}>{usd(x.profit_cents)}</td>
                    <td className={`${tdr} ${x.vs_sp_cents >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(x.vs_sp_cents)}</td>
                    <td className={tdr}>{x.avg_hold_months}mo</td>
                    <td className={`${tdr} ${x.open_units > x.sold_units ? "text-amber-300" : "text-gray-400"}`}>{u(x.sold_units)} / {u(x.open_units)}</td>
                    <td className={td}>
                      {!portfolio && <button onClick={() => onUseExit({
                        exit: x.strategy.exit, hold_months: x.strategy.hold_months, all_at_months: x.strategy.all_at_months, sell_date: x.strategy.sell_date,
                        target_mult: x.strategy.target_mult, target_basis: x.strategy.target_basis, max_hold_months: x.strategy.max_hold_months || undefined,
                        wind_start: x.strategy.wind_start, wind_months: x.strategy.wind_months, wind_units: x.strategy.wind_units || undefined,
                      })} className="text-indigo-300 hover:underline whitespace-nowrap">use this</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )} />
          </>
        )}

        {tab === "discount" && disc && (
          <>
            <p className="text-gray-400">
              The same strategy if every buy were this much under the month&apos;s market price, e.g. a store fire-selling. The 0% row is the strategy as it stands;
              the first discount that clears your bar is the price to wait for.
            </p>
            <table className="w-full">{head([["Bought at"], ["IRR /yr", true], ["Multiple", true], ["Put in", true], ["Profit", true], ["vs S&P", true], ["Win share", true]])}
              <tbody>{disc.map((x, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className={`${td} text-gray-200`}>{x.strategy.name}</td>
                  <td className={`${tdr} font-semibold ${irrTone(x.irr)}`}>{pct(x.irr, 1)}</td>
                  <td className={tdr}>{x.multiple.toFixed(2)}×</td><td className={tdr}>{usd(x.invested_cents)}</td><td className={tdr}>{usd(x.profit_cents)}</td>
                  <td className={`${tdr} ${x.value_cents >= x.benchmark_cents ? "text-emerald-300" : "text-rose-300"}`}>{usd(x.value_cents - x.benchmark_cents)}</td>
                  <td className={tdr}>{Math.round(x.win_share * 100)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}

        {tab === "follow" && follow && (
          <>
            <p className="text-gray-400">
              The dip leg{portfolio ? "s" : ""} of this strategy, buying once per trigger against keeping on buying ({portfolio ? "other legs unchanged" : "units a cadence as set"}).
              A higher yearly return per dollar can still mean less profit if it buys less: compare both.
            </p>
            <table className="w-full">{head([["After a dip"], ["IRR /yr", true], ["Multiple", true], ["Buys", true], ["Put in", true], ["Profit", true], ["vs S&P", true], ["Win share", true]])}
              <tbody>{follow.map((x, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className={`${td} text-gray-200`}>{x.strategy.name}</td>
                  <td className={`${tdr} font-semibold ${irrTone(x.irr)}`}>{pct(x.irr, 1)}</td>
                  <td className={tdr}>{x.multiple.toFixed(2)}×</td><td className={tdr}>{x.buys}</td>
                  <td className={tdr}>{usd(x.invested_cents)}</td><td className={tdr}>{usd(x.profit_cents)}</td>
                  <td className={`${tdr} ${x.value_cents >= x.benchmark_cents ? "text-emerald-300" : "text-rose-300"}`}>{usd(x.value_cents - x.benchmark_cents)}</td>
                  <td className={tdr}>{Math.round(x.win_share * 100)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}

        {tab === "sizing" && sizing && (
          <>
            <p className="text-gray-400">
              One of every set the rule buys, against the same dollars on each buy (more of the cheap sets, less of the dear ones; the dollar amount is this
              strategy&apos;s average cost so the spend is comparable). Compare the yearly return and multiple, not the dollar totals.
            </p>
            <table className="w-full">{head([["Sizing"], ["IRR /yr", true], ["Multiple", true], ["Finished sales", true], ["Put in", true], ["Profit", true], ["Win share", true], ["Worst month", true]])}
              <tbody>{sizing.map((x, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className={`${td} text-gray-200`}>{x.strategy.name}</td>
                  <td className={`${tdr} font-semibold ${irrTone(x.irr)}`}>{pct(x.irr, 1)}</td>
                  <td className={tdr}>{x.multiple.toFixed(2)}×</td>
                  <td className={tdr}>{x.closed_multiple != null ? `${x.closed_multiple.toFixed(2)}×` : "–"}</td>
                  <td className={tdr}>{usd(x.invested_cents)}</td><td className={tdr}>{usd(x.profit_cents)}</td>
                  <td className={tdr}>{Math.round(x.win_share * 100)}%</td><td className={`${tdr} text-rose-300`}>{pct(x.worst_drawdown)}</td>
                </tr>
              ))}</tbody>
            </table>
            {r.strategy.rule === "hype" && <p className="text-amber-300/80">A hype pick spends a fixed budget already, so sizing doesn&apos;t change it.</p>}
            <button onClick={() => sizing[1] && onAdd({ name: `${r.strategy.name} (same money)`, legs: (r.strategy.rule === "portfolio" ? r.strategy.legs ?? [] : [r.strategy]).map((l) => ({ ...l, sizing: "dollars", dollars_cents: Math.max(100, r.avg_cost_cents) })) })}
              className="text-indigo-300 hover:underline">add the same-money version to my strategies</button>
          </>
        )}
      </div>
    </Card>
  );
}

// ---- sweep ----------------------------------------------------------------------------------

function Sweep({ gross, onAdd }: { gross: boolean; onAdd: (st: Strategy) => void }) {
  const [base, setBase] = useState<SealedRule>({ rule: "schedule", kinds: ["etb"], units: 1, budget_cents: 6000 });
  const [rows, setRows] = useState<BacktestSweepRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr("");
    try { setRows((await sweepSealedBacktest(base, [24, 36, 48], gross)).rows); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="Every variant, ranked" right={<>
      {MAIN_KINDS.map((k) => (
        <label key={k} className={`px-1.5 py-0.5 rounded border cursor-pointer ${base.kinds.includes(k) ? "border-indigo-600 text-indigo-200" : "border-gray-800 text-gray-500"}`}>
          <input type="checkbox" className="hidden" checked={base.kinds.includes(k)}
            onChange={(e) => setBase({ ...base, kinds: e.target.checked ? [...base.kinds, k] : base.kinds.filter((x) => x !== k) })} />
          {SEALED_KIND_LABEL[k]}
        </label>
      ))}
      <label className="flex items-center gap-1 text-gray-400">sets released from <input value={base.released_from ?? ""} placeholder="YYYY-MM"
        onChange={(e) => setBase({ ...base, released_from: e.target.value || undefined })} className={`${inp} w-20`} /></label>
      <button onClick={run} disabled={busy || base.kinds.length === 0} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "Running…" : "Run all variants"}</button>
    </>}>
      {err && <div className="text-sm text-rose-400 break-all">{err}</div>}
      {!rows ? <p className="text-xs text-gray-500">About 250 variants on the chosen product types: monthly schedules (start month × how long × hold 24 / 36 / 48), hype picks, and dips (any and reprints only), best yearly return first.</p> : (
        <More rows={rows} render={(rs) => (
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left"><tr>
              <th className={th}>#</th><th className={th}>Rule</th><th className={thr}>IRR /yr</th><th className={thr}>Multiple</th><th className={thr}>Finished sales</th>
              <th className={thr}>Win share</th><th className={thr}>Worst month</th><th className={thr}>Sets</th><th className={thr}>Sold / held</th><th className={th}></th>
            </tr></thead>
            <tbody>{rs.map((x, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className={`${td} text-gray-500`}>{i + 1}</td>
                <td className={`${td} text-gray-200`}>{describe(x.strategy)}</td>
                <td className={`${tdr} font-semibold ${irrTone(x.irr)}`}>{pct(x.irr, 1)}</td>
                <td className={tdr}>{x.multiple.toFixed(2)}×</td>
                <td className={`${tdr} text-gray-400`}>{x.closed_multiple != null ? `${x.closed_multiple.toFixed(2)}×` : "–"}</td>
                <td className={tdr}>{Math.round(x.win_share * 100)}%</td>
                <td className={`${tdr} text-rose-300`}>{pct(x.worst_drawdown)}</td>
                <td className={tdr}>{x.sets}</td>
                <td className={`${tdr} ${x.open_lots > x.closed_lots ? "text-amber-300" : "text-gray-400"}`}>{x.closed_lots} / {x.open_lots}</td>
                <td className={td}><button onClick={() => onAdd({ name: "", legs: [{ ...x.strategy, name: "" }] })} className="text-indigo-300 hover:underline">add</button></td>
              </tr>
            ))}</tbody>
          </table>
        )} />
      )}
    </Card>
  );
}

// ---- buy list -----------------------------------------------------------------------------------

function ShareBars({ title, xs }: { title: string; xs: BuyShare[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500">{title}</div>
      {xs.slice(0, 12).map((x) => (
        <div key={x.key} className="grid grid-cols-[minmax(6rem,12rem)_1fr_7rem] items-center gap-2 text-xs">
          <span className="truncate text-gray-300" title={x.label}>{x.label}</span>
          <div className="h-3 rounded bg-gray-950"><div className="h-3 rounded bg-indigo-500/70" style={{ width: `${Math.max(1, x.share * 100)}%` }} /></div>
          <span className="text-right tabular-nums text-gray-400">{Math.round(x.share * 100)}% · {usd(x.cents)}</span>
        </div>
      ))}
      {xs.length > 12 && <div className="text-[11px] text-gray-600">+{xs.length - 12} more</div>}
    </div>
  );
}

// This month's buy list from the plan: each leg's rule on the latest chart
// month, 1 unit of the SKU per buy, stacked per product, with projections
// and diversification.
function BuyListCard({ plan }: { plan: SealedRule[] }) {
  const [b, setB] = useState<BuyList | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const build = async (saved: boolean) => {
    setBusy(true); setErr("");
    try { setB(await sealedBuyList(saved ? undefined : plan)); } catch (e) { setErr(String(e).includes("no_plan") || String(e).includes("no strategies") ? "Nothing checked in yet: tick 'in my plan' and check it in." : String(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="Buy list from my plan" right={<>
      <button onClick={() => build(false)} disabled={busy || plan.length === 0} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-40">{busy ? "Building…" : `Build from ticked (${plan.length})`}</button>
      <button onClick={() => build(true)} disabled={busy} className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:text-white">from the checked-in plan</button>
    </>}>
      {err && <div className="text-sm text-amber-300 break-all">{err}</div>}
      {!b ? <p className="text-xs text-gray-500">What each strategy in the plan buys this month at 1 unit of the SKU per buy, legs stacked per product (month 3 + month 12 + hottest = 3 units), with the projected return and how spread out it is.</p> : (
        <div className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded border border-gray-800 p-3"><div className="text-gray-500">Spend this month</div><div className="text-lg font-semibold text-gray-100 tabular-nums">{usd(b.spend_per_month_cents)}</div>
              <div className="text-gray-500">{b.units_per_month} units · {b.lines.length} SKUs · rules on {b.month}</div></div>
            <div className="rounded border border-gray-800 p-3"><div className="text-gray-500">Projected value at the hold</div><div className="text-lg font-semibold text-emerald-300 tabular-nums">{usd(b.projected_value_cents)}</div>
              <div className="text-gray-500">range {usd(b.projected_low_cents)} – {usd(b.projected_high_cents)}</div></div>
            <div className="rounded border border-gray-800 p-3"><div className="text-gray-500">Projected multiple · per year</div><div className="text-lg font-semibold text-gray-100 tabular-nums">{b.projected_multiple != null ? `${b.projected_multiple.toFixed(2)}×` : "–"} · {pct(b.projected_annual, 0)}</div>
              <div className="text-gray-500">history of the same type, set class and age</div></div>
            <div className="rounded border border-gray-800 p-3"><div className="text-gray-500">Backtested yearly return (legs)</div><div className={`text-lg font-semibold tabular-nums ${irrTone(b.blended_leg_irr)}`}>{pct(b.blended_leg_irr, 1)}</div>
              <div className="text-gray-500">spend-weighted</div></div>
            <div className="rounded border border-gray-800 p-3"><div className="text-gray-500">Diversification</div><div className="text-lg font-semibold text-gray-100 tabular-nums">{b.effective_sets} sets · {b.effective_skus} SKUs</div>
              <div className={b.top_set_share > 0.35 ? "text-amber-300" : "text-gray-500"}>effective count · top set {Math.round(b.top_set_share * 100)}%</div></div>
          </div>
          {b.notes.length > 0 && <ul className="list-disc pl-5 text-amber-300/80">{b.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <div className="grid gap-4 lg:grid-cols-3">
            <ShareBars title="Spend by set" xs={b.by_set} />
            <ShareBars title="Spend by product type" xs={b.by_kind} />
            <ShareBars title="Standard vs special sets" xs={b.by_class} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-500 text-left"><tr>
                <th className={th}>SKU</th><th className={thr}>Age</th><th className={thr}>Price</th><th className={thr}>Units / mo</th><th className={thr}>Spend / mo</th>
                <th className={th}>Why (legs)</th><th className={thr} title="Median net return for this type + set class bought at this age, held as the legs hold (middle half under it)">Projected</th>
                <th className={thr}>Value at hold</th><th className={thr} title="The legs' backtested yearly return">Legs IRR</th>
              </tr></thead>
              <tbody>{b.lines.map((l) => (
                <tr key={l.product_id} className="border-t border-gray-800 align-top">
                  <td className={td}><a href={l.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{l.set_name}</a>
                    <div className="text-[10px] text-gray-500">{SEALED_KIND_LABEL[l.kind]} · {l.set_class}</div></td>
                  <td className={tdr}>{l.age_months}mo</td>
                  <td className={tdr}>{usd(l.price_cents)}</td>
                  <td className={`${tdr} font-semibold ${l.units_per_month >= 3 ? "text-fuchsia-300" : l.units_per_month >= 2 ? "text-indigo-300" : "text-gray-200"}`}>{l.units_per_month}<div className="text-[10px] font-normal text-gray-500">{l.units_per_week}/wk</div></td>
                  <td className={tdr}>{usd(l.cost_per_month_cents)}</td>
                  <td className={`${td} text-gray-400`}>{l.legs.map((g, i) => <div key={i}><span className="text-gray-300">{g.leg}</span> ×{g.units_per_month}{g.why ? <span className="text-gray-600"> · {g.why}</span> : null}</div>)}</td>
                  <td className={tdr} title={l.projection?.basis}>{l.projection ? <><span className={irrTone(l.projection.median)}>{pct(l.projection.median, 0)}</span><div className="text-[10px] text-gray-500">{pct(l.projection.p25, 0)}…{pct(l.projection.p75, 0)} · {l.projection.hold_months}mo</div></> : "–"}</td>
                  <td className={tdr}>{usd(l.projected_value_cents)}</td>
                  <td className={`${tdr} ${irrTone(l.leg_irr)}`}>{pct(l.leg_irr, 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500">{b.method}</p>
        </div>
      )}
    </Card>
  );
}

// ---- page ---------------------------------------------------------------------------------------

export default function SealedBacktestPage() {
  const [strategies, setStrategiesState] = useState<Strategy[]>(loadStrategies);
  const [res, setRes] = useState<{ results: BacktestResult[]; latest: string; costs: string; method: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gross, setGross] = useState(false);
  const [mode, setMode] = useState<"value" | "multiple">("multiple");

  const setStrategies = (s: Strategy[]) => { setStrategiesState(s); saveStrategies(s); };
  const run = async (ss = strategies) => {
    if (ss.length === 0) { setRes(null); return; }
    setBusy(true); setErr("");
    try { setRes(await runSealedBacktest(ss.map(toRule), gross)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { run(); }, [gross]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (st: Strategy) => {
    if (strategies.length >= 60) { setErr("60 strategies at most: remove one first."); return; }
    const n = [...strategies, st];
    setStrategies(n); run(n);
    window.scrollTo({ top: document.getElementById("my-strategies")?.offsetTop ?? 0, behavior: "smooth" });
  };
  const [planMsg, setPlanMsg] = useState("");
  const checkIn = async () => {
    const plan = strategies.filter((s) => s.inPlan);
    try {
      await saveSealedPlan(plan.map(toRule));
      setPlanMsg(`Plan checked in: ${plan.length} strateg${plan.length === 1 ? "y" : "ies"}.`);
    } catch (e) { setPlanMsg(`Couldn't save: ${String(e).includes("401") || String(e).includes("403") ? "sign in first" : String(e)}`); }
  };
  useEffect(() => {
    fetchSealedPlan().then((p) => { if (p.strategies.length) setPlanMsg(`Checked-in plan: ${p.strategies.length} strateg${p.strategies.length === 1 ? "y" : "ies"}${p.updated_by ? ` (by ${p.updated_by})` : ""}.`); }).catch(() => {});
  }, []);
  const best = useMemo(() => res?.results.reduce<BacktestResult | null>((b, r) => (r.irr != null && (b?.irr == null || r.irr > b.irr) ? r : b), null), [res]);

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">Sealed backtests</h1>
          <p className="text-sm text-gray-400 max-w-5xl">
            Buying and selling rules written down as mechanics and replayed over every set&apos;s chart: what you&apos;d have put in, what you&apos;d have kept
            after selling costs, the yearly return (IRR) and the same money in the S&amp;P. The winning rules become the <Link to="/sealed/watchlist" className="text-indigo-300 hover:underline">sealed watchlist</Link>&apos;s buy signals.
          </p>
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-400"><input type="checkbox" checked={gross} onChange={(e) => setGross(e.target.checked)} /> gross (before selling costs)</label>
      </header>
      {err && <div className="text-sm text-rose-400 break-all">{err}</div>}

      <BestPerKind gross={gross} onAdd={add} />

      <div id="my-strategies" />
      <Card title="My strategies" right={<>
        <button onClick={() => run()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "Running…" : "Run"}</button>
        <button onClick={() => add({ name: "", legs: [leg({ rule: "schedule", kinds: ["etb"] })] })} className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:text-white">+ new strategy</button>
        <select value="" onChange={(e) => { const p = PRESETS[Number(e.target.value)]; if (p) add(JSON.parse(JSON.stringify(p))); }} className={inp}>
          <option value="">+ preset…</option>
          {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
        </select>
        <button onClick={() => { setStrategies(PRESETS); run(PRESETS); }} className="text-gray-500 hover:text-gray-300">reset</button>
        <button onClick={checkIn} disabled={!strategies.some((s) => s.inPlan)} className="rounded bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-600 disabled:opacity-40"
          title="Save the strategies ticked 'in my plan' as the plan the buy list and watchlist follow">Check in plan ({strategies.filter((s) => s.inPlan).length})</button>
        {planMsg && <span className="text-gray-400">{planMsg}</span>}
      </>}>
        <div className="grid gap-3 xl:grid-cols-2">
          {strategies.map((st, i) => (
            <StrategyEditor key={i} st={st} color={LINE_COLORS[i % LINE_COLORS.length]}
              onChange={(n) => setStrategies(strategies.map((x, j) => (j === i ? n : x)))}
              onRemove={() => { const n = strategies.filter((_, j) => j !== i); setStrategies(n); run(n); }} />
          ))}
        </div>
        {strategies.length === 0 && <p className="text-sm text-gray-500">No strategies: add one from a preset, the best rules above, or the ranked variants below.</p>}
      </Card>

      <BuyListCard plan={strategies.filter((s) => s.inPlan).map(toRule)} />

      {busy && !res ? <Spinner /> : res && res.results.length > 0 && (
        <>
          <Card title="Results" right={<span className="text-gray-500">data through {res.latest}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 text-left"><tr>
                  <th className={th}>Strategy</th>
                  <th className={thr} title="Money-weighted yearly return from the monthly cash flows">IRR /yr</th>
                  <th className={thr}>Put in</th><th className={thr}>Got back (net)</th><th className={thr}>Profit</th>
                  <th className={thr} title="Got back ÷ put in; finished sales only under it">Multiple</th>
                  <th className={thr} title="Against the same cash flows at the S&P benchmark rate">vs S&amp;P</th>
                  <th className={thr}>Win share</th><th className={thr} title="The worst month for the lots held then: value vs cost">Worst month</th>
                  <th className={thr} title="Units sold under the sell rule / still held at the end of the data (valued at today's price)">Sold / held</th>
                </tr></thead>
                <tbody>
                  {res.results.map((r, i) => (
                    <tr key={i} className={`border-t border-gray-800 ${best === r ? "bg-emerald-950/30" : ""}`}>
                      <td className={`${td} text-gray-100`}><span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>●</span> {r.strategy.name}</td>
                      <td className={`${tdr} font-semibold ${irrTone(r.irr, r.benchmark_irr)}`}>{r.buys ? pct(r.irr, 1) : "–"}</td>
                      <td className={tdr}>{usd(r.invested_cents)}</td><td className={tdr}>{usd(r.value_cents)}</td>
                      <td className={`${tdr} ${r.profit_cents >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(r.profit_cents)}</td>
                      <td className={tdr}>{r.multiple.toFixed(2)}×{r.closed_multiple != null && <div className="text-[10px] text-gray-500">sold {r.closed_multiple.toFixed(2)}×</div>}</td>
                      <td className={`${tdr} ${r.value_cents >= r.benchmark_cents ? "text-emerald-300" : "text-rose-300"}`}>{usd(r.value_cents - r.benchmark_cents)}</td>
                      <td className={tdr}>{Math.round(r.win_share * 100)}%</td>
                      <td className={`${tdr} text-rose-300`}>{pct(r.worst_drawdown)}</td>
                      <td className={`${tdr} ${r.open_units > r.sold_units ? "text-amber-300" : "text-gray-400"}`}>{u(r.sold_units)} / {u(r.open_units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Over time" right={<>
            {(["multiple", "value"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                {m === "multiple" ? "(back + held) ÷ put in" : "profit so far"}
              </button>
            ))}
          </>}>
            <Chart results={res.results} mode={mode} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] text-gray-400">
              {res.results.map((r, i) => <span key={i}><span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>●</span> {r.strategy.name}</span>)}
            </div>
          </Card>
          {res.results.map((r, i) => (
            <Detail key={i} r={r} color={LINE_COLORS[i % LINE_COLORS.length]} gross={gross} onAdd={add}
              onUseExit={(ex) => { const n = strategies.map((x, j) => (j === i ? { ...x, legs: x.legs.map((l) => ({ ...l, ...ex })) } : x)); setStrategies(n); run(n); }} />
          ))}
        </>
      )}

      <Sweep gross={gross} onAdd={add} />

      {res && (
        <details className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-xs text-gray-400">
          <summary className="cursor-pointer text-gray-300">How the backtest works</summary>
          <p className="mt-2 max-w-5xl leading-relaxed">{res.costs} {res.method}</p>
        </details>
      )}
    </div>
  );
}
