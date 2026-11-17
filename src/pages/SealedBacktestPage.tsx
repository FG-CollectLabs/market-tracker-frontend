import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  runSealedBacktest, sweepSealedBacktest, sweepSealedExits, SEALED_KIND_LABEL,
  type BacktestExitRow, type BacktestLot, type BacktestResult, type BacktestSweepRow, type SealedKind, type SealedRule,
} from "../lib/api";
import { Spinner } from "../components/Spinner";
import { pct, usd } from "./SealedTimingPage";

// Sealed backtests: write buying rules down as hard mechanics, replay them
// over every set's chart, and compare what each would have made (net of
// selling costs, against the same money in the S&P).

const KINDS: SealedKind[] = ["etb", "pc_etb", "booster_box", "booster_bundle", "booster_pack", "upc", "premium_collection", "special_collection", "collection_box", "tin", "blister"];
const LINE_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c"];

const PRESETS: SealedRule[] = [
  { name: "1 ETB a week, month 3 until out of print", rule: "schedule", kinds: ["etb"], cadence: "week", units: 1, start_month: 3, until_oop: true, exit: "hold", hold_months: 36 },
  { name: "Hottest ETB in rotation, $60 a month", rule: "hype", kinds: ["etb"], budget_cents: 6000, hype_by: "momentum", rotation_months: 24, pick_n: 1, exit: "hold", hold_months: 36 },
  { name: "1 ETB at release, then monthly for 2 years", rule: "schedule", kinds: ["etb"], cadence: "month", units: 1, start_month: 0, end_month: 24, exit: "hold", hold_months: 36 },
  { name: "Hottest ETB in rotation, sell at 3× MSRP (else after 4 years)", rule: "hype", kinds: ["etb"], budget_cents: 6000, hype_by: "momentum", rotation_months: 24, pick_n: 1, exit: "target", target_mult: 3, target_basis: "msrp", max_hold_months: 48 },
  { name: "1 ETB a week from month 3, wind down from year 3 over 2 years", rule: "schedule", kinds: ["etb"], cadence: "week", units: 1, start_month: 3, until_oop: true, exit: "winddown", wind_start: 36, wind_months: 24 },
  { name: "1 ETB at release, hold 3 years (baseline)", rule: "schedule", kinds: ["etb"], cadence: "month", units: 1, start_month: 0, end_month: 0, exit: "hold", hold_months: 36 },
];

const STORE = "sealed.backtest.rules";
const loadRules = (): SealedRule[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return Array.isArray(v) && v.length ? v : PRESETS;
  } catch {
    return PRESETS;
  }
};
const saveRules = (r: SealedRule[]) => { try { localStorage.setItem(STORE, JSON.stringify(r)); } catch { /* private window */ } };

function exitText(s: SealedRule) {
  switch (s.exit ?? "hold") {
    case "mark": return "hold, valued today";
    case "all_at": return s.sell_date ? `sell all on ${s.sell_date}` : `sell all ${s.all_at_months ?? 48}mo after the first buy`;
    case "target": return `sell at ${s.target_mult ?? 3}× ${s.target_basis === "msrp" ? "MSRP" : "cost"}${s.max_hold_months ? `, else after ${s.max_hold_months}mo` : ""}`;
    case "winddown": return `wind down from ${s.wind_start ?? 36}mo: ${s.wind_units ? `${s.wind_units}/mo` : `over ${s.wind_months ?? 24}mo`}`;
  }
  return `sell after ${s.hold_months ?? 36}mo`;
}

function describe(s: SealedRule) {
  const k = s.kinds.map((x) => SEALED_KIND_LABEL[x]).join(" + ");
  const hold = exitText(s);
  if (s.rule === "hype") return `$${((s.budget_cents ?? 0) / 100).toFixed(0)}/mo on the ${s.pick_n ?? 1} most hyped ${k} (${s.hype_by}, sets ≤${s.rotation_months ?? 24}mo old) · ${hold}`;
  if (s.rule === "dip") return `${s.units ?? 1} ${k} on every ${Math.round((s.dip_pct ?? 0.15) * 100)}% dip under the 6-month high · ${hold}`;
  const end = s.until_oop ? (s.end_month != null ? ` to month ${s.end_month} or out of print` : " until out of print") : s.end_month != null && s.end_month !== s.start_month ? ` to month ${s.end_month}` : " only";
  return `${s.units ?? 1} ${k} a ${s.cadence ?? "month"}, month ${s.start_month ?? 0}${end} · ${hold}`;
}

const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200 tabular-nums";
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

function RuleEditor({ r, onChange, onRemove, color }: { r: SealedRule; onChange: (r: SealedRule) => void; onRemove: () => void; color: string }) {
  const set = (p: Partial<SealedRule>) => onChange({ ...r, ...p });
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2 text-xs text-gray-300">
      <div className="flex items-center gap-2">
        <span style={{ color }}>●</span>
        <input value={r.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder={describe(r)} className={`${inp} flex-1 text-sm`} />
        <button onClick={onRemove} className="text-gray-500 hover:text-rose-300">remove</button>
      </div>
      <div className="text-[11px] text-gray-500">{describe(r)}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1">Rule
          <select value={r.rule} onChange={(e) => set({ rule: e.target.value as SealedRule["rule"] })} className={inp}>
            <option value="schedule">Schedule (after release)</option>
            <option value="hype">Hype pick (each month)</option>
            <option value="dip">Buy the dip</option>
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
      {r.rule === "schedule" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-1">Buy <input value={r.units ?? 1} onChange={(e) => set({ units: num(e.target.value) })} className={`${inp} w-12`} /></label>
          <label className="flex items-center gap-1">every
            <select value={r.cadence ?? "month"} onChange={(e) => set({ cadence: e.target.value as "week" | "month" })} className={inp}>
              <option value="week">week</option><option value="month">month</option>
            </select>
          </label>
          <label className="flex items-center gap-1">from month <input value={r.start_month ?? 0} onChange={(e) => set({ start_month: num(e.target.value) ?? 0 })} className={`${inp} w-12`} /></label>
          <label className="flex items-center gap-1">to month <input value={r.end_month ?? ""} placeholder="–" onChange={(e) => set({ end_month: num(e.target.value) ?? null })} className={`${inp} w-12`} /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!r.until_oop} onChange={(e) => set({ until_oop: e.target.checked })} /> stop once out of print</label>
          {r.until_oop && <label className="flex items-center gap-1" title="Out of print = the price this far above its low since buying started">
            at +<input value={Math.round((r.oop_runup ?? 0.3) * 100)} onChange={(e) => set({ oop_runup: (num(e.target.value) ?? 30) / 100 })} className={`${inp} w-10`} />% off the low</label>}
        </div>
      )}
      {r.rule === "hype" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-1">$<input value={(r.budget_cents ?? 6000) / 100} onChange={(e) => set({ budget_cents: Math.round((num(e.target.value) ?? 0) * 100) })} className={`${inp} w-16`} /> a month</label>
          <label className="flex items-center gap-1">on the top <input value={r.pick_n ?? 1} onChange={(e) => set({ pick_n: num(e.target.value) })} className={`${inp} w-10`} /></label>
          <label className="flex items-center gap-1">by
            <select value={r.hype_by ?? "momentum"} onChange={(e) => set({ hype_by: e.target.value as SealedRule["hype_by"] })} className={inp}>
              <option value="momentum">3-month momentum</option>
              <option value="rising12">12-month rise</option>
              <option value="premium">premium over MSRP</option>
              <option value="newest">newest set</option>
            </select>
          </label>
          <label className="flex items-center gap-1">sets released in the last <input value={r.rotation_months ?? 24} onChange={(e) => set({ rotation_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>
        </div>
      )}
      {r.rule === "dip" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-1">Buy <input value={r.units ?? 1} onChange={(e) => set({ units: num(e.target.value) })} className={`${inp} w-12`} /></label>
          <label className="flex items-center gap-1">when <input value={Math.round((r.dip_pct ?? 0.15) * 100)} onChange={(e) => set({ dip_pct: (num(e.target.value) ?? 15) / 100 })} className={`${inp} w-10`} />% under its 6-month high</label>
          <label className="flex items-center gap-1">at most every <input value={r.cooldown_months ?? 6} onChange={(e) => set({ cooldown_months: num(e.target.value) })} className={`${inp} w-10`} /> months</label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1">Sell
          <select value={r.exit ?? "hold"} onChange={(e) => set({ exit: e.target.value as SealedRule["exit"] })} className={inp}>
            <option value="hold">each lot after N months</option>
            <option value="all_at">everything at once</option>
            <option value="target">at a price target</option>
            <option value="winddown">wind down each product</option>
            <option value="mark">never (value today)</option>
          </select>
        </label>
        {(r.exit ?? "hold") === "hold" && <label className="flex items-center gap-1"><input value={r.hold_months ?? 36} onChange={(e) => set({ hold_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>}
        {r.exit === "all_at" && <>
          <label className="flex items-center gap-1"><input value={r.all_at_months ?? 48} onChange={(e) => set({ all_at_months: num(e.target.value), sell_date: undefined })} className={`${inp} w-12`} /> months after the first buy</label>
          <label className="flex items-center gap-1">or on <input value={r.sell_date ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ sell_date: e.target.value || undefined })} className={`${inp} w-20`} /></label>
        </>}
        {r.exit === "target" && <>
          <label className="flex items-center gap-1">at <input value={r.target_mult ?? 3} onChange={(e) => set({ target_mult: num(e.target.value) })} className={`${inp} w-12`} />×
            <select value={r.target_basis ?? "cost"} onChange={(e) => set({ target_basis: e.target.value as "cost" | "msrp" })} className={inp}>
              <option value="cost">what I paid</option><option value="msrp">MSRP</option>
            </select>
          </label>
          <label className="flex items-center gap-1" title="Sell then if the target never hits (blank: hold until it does)">else after <input value={r.max_hold_months ?? ""} placeholder="–" onChange={(e) => set({ max_hold_months: num(e.target.value) })} className={`${inp} w-12`} /> months</label>
        </>}
        {r.exit === "winddown" && <>
          <label className="flex items-center gap-1">from <input value={r.wind_start ?? 36} onChange={(e) => set({ wind_start: num(e.target.value) })} className={`${inp} w-12`} /> months after a product&apos;s first buy,</label>
          <label className="flex items-center gap-1">sell <input value={r.wind_units ?? ""} placeholder="–" onChange={(e) => set({ wind_units: num(e.target.value) })} className={`${inp} w-12`} /> a month</label>
          <label className="flex items-center gap-1">or all of it over <input value={r.wind_months ?? 24} onChange={(e) => set({ wind_months: num(e.target.value), wind_units: undefined })} className={`${inp} w-12`} /> months</label>
        </>}
        <label className="flex items-center gap-1">sets released <input value={r.released_from ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ released_from: e.target.value || undefined })} className={`${inp} w-20`} />
          to <input value={r.released_to ?? ""} placeholder="YYYY-MM" onChange={(e) => set({ released_to: e.target.value || undefined })} className={`${inp} w-20`} /></label>
      </div>
    </div>
  );
}

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
  const W = 760, H = 220, L = 60, B = 18;
  const x = (m: string) => L + (months.indexOf(m) / (months.length - 1)) * (W - L - 8);
  const y = (v: number) => 6 + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - B - 10);
  const fmt = (v: number) => (mode === "value" ? usd(v) : `${v.toFixed(2)}×`);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]">
        <line x1={L} x2={W - 8} y1={y(base)} y2={y(base)} stroke="#4b5563" strokeDasharray="3 3" />
        <text x={L - 4} y={y(y1) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{fmt(y1)}</text>
        <text x={L - 4} y={y(base) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{fmt(base)}</text>
        {y0 < base && <text x={L - 4} y={y(y0) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{fmt(y0)}</text>}
        <text x={L} y={H - 4} className="fill-gray-500 text-[10px]">{months[0]}</text>
        <text x={W - 8} y={H - 4} textAnchor="end" className="fill-gray-500 text-[10px]">{months[months.length - 1]}</text>
        {series.map((s, i) => (
          <polyline key={i} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.6}
            points={s.map((p) => `${x(p.m)},${y(p.v)}`).join(" ")} />
        ))}
      </svg>
    </div>
  );
}

type Tab = "sets" | "buys" | "sales" | "held" | "exits";

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return [...m.entries()];
}
const u = (n: number) => (Math.round(n * 10) / 10).toString();

function Detail({ r, color, gross, onUseExit }: { r: BacktestResult; color: string; gross: boolean; onUseExit: (exit: Partial<SealedRule>) => void }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [lots, setLots] = useState<BacktestLot[] | null>(null);
  const [exits, setExits] = useState<BacktestExitRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setLots(null); setExits(null); }, [r]);
  const open = async (t: Tab) => {
    if (tab === t) { setTab(null); return; }
    setTab(t); setErr("");
    try {
      if ((t === "buys" || t === "sales" || t === "held") && !lots) {
        setBusy(true);
        setLots((await runSealedBacktest([r.strategy], gross, true)).results[0]?.lots ?? []);
      }
      if (t === "exits" && !exits) {
        setBusy(true);
        setExits((await sweepSealedExits(r.strategy, gross)).rows);
      }
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => open(t)} className={`rounded px-2 py-0.5 ${tab === t ? "bg-gray-700 text-white" : "text-indigo-300 hover:underline"}`}>{label}</button>
  );
  const sales = (lots ?? []).flatMap((l) => (l.sales ?? []).map((x) => ({ ...x, l })));
  const held = groupBy((lots ?? []).filter((l) => l.open_units > 0), (l) => `${l.set_name} · ${SEALED_KIND_LABEL[l.kind]}`);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-2">
        <span style={{ color }}>●</span>
        <span className="text-sm text-gray-100">{r.strategy.name}</span>
        <span className="text-gray-500">{r.first_buy} → {r.last_buy} · {r.buys} buys · {r.sets} sets · avg cost {usd(r.avg_cost_cents)} · {u(r.sold_units)} sold, {u(r.open_units)} still held · avg hold {r.avg_hold_months}mo</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {tabBtn("buys", "What it bought")}{tabBtn("sales", "What it sold")}{tabBtn("held", "Still held")}{tabBtn("sets", `By set (${r.by_set.length})`)}
        {tabBtn("exits", "Best way to sell these buys")}
        {busy && <span className="text-gray-500 ml-2">loading…</span>}
      </div>
      {err && <div className="text-rose-400 break-all">{err}</div>}
      {r.notes?.map((n) => <div key={n} className="text-[11px] text-amber-300/80">{n}</div>)}
      {tab === "sets" && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left"><tr>
              <th className="py-1 pr-3 font-medium">Set</th><th className="py-1 pr-3 font-medium">Released</th>
              <th className="py-1 pr-3 font-medium text-right">Units</th><th className="py-1 pr-3 font-medium text-right">In</th>
              <th className="py-1 pr-3 font-medium text-right">Out (net)</th><th className="py-1 font-medium text-right">Multiple</th>
            </tr></thead>
            <tbody>
              {r.by_set.map((s) => (
                <tr key={s.set} className="border-t border-gray-800">
                  <td className="py-0.5 pr-3 text-gray-200">{s.set_name}</td>
                  <td className="py-0.5 pr-3 text-gray-500">{s.release?.slice(0, 7)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{u(s.units)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(s.invested_cents)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(s.value_cents)}</td>
                  <td className={`py-0.5 text-right tabular-nums ${s.multiple >= 1 ? "text-emerald-300" : "text-rose-300"}`}>{s.multiple.toFixed(2)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "buys" && lots && (
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left sticky top-0 bg-gray-900"><tr>
              <th className="py-1 pr-3 font-medium">Month</th><th className="py-1 pr-3 font-medium">Bought</th>
              <th className="py-1 pr-3 font-medium text-right">Units</th><th className="py-1 pr-3 font-medium text-right">Price</th>
              <th className="py-1 pr-3 font-medium text-right">Spent</th><th className="py-1 pr-3 font-medium">Why</th>
              <th className="py-1 font-medium">What became of it</th>
            </tr></thead>
            <tbody>
              {groupBy(lots, (l) => l.month).map(([m, ls]) => ls.map((l, i) => (
                <tr key={`${m}-${i}`} className={i === 0 ? "border-t border-gray-800" : ""}>
                  <td className="py-0.5 pr-3 text-gray-400 whitespace-nowrap">{i === 0 ? m : ""}</td>
                  <td className="py-0.5 pr-3 text-gray-200 whitespace-nowrap">{l.set_name} · {SEALED_KIND_LABEL[l.kind]}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{u(l.units)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(l.cost_cents)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(Math.round(l.cost_cents * l.units))}</td>
                  <td className="py-0.5 pr-3 text-gray-500">{l.why ?? ""}</td>
                  <td className="py-0.5 text-gray-400 whitespace-nowrap">
                    {(l.sales ?? []).length === 1 && l.open_units === 0 ? `sold ${l.sales![0].month} at ${usd(l.sales![0].price_cents)} (${(l.sales![0].net_cents / l.cost_cents).toFixed(2)}× net)`
                      : <>{(l.sales ?? []).length > 0 && `${(l.sales ?? []).length} sales, ${u((l.sales ?? []).reduce((a, x) => a + x.units, 0))} units`}
                        {l.open_units > 0 && <span className="text-amber-300/80">{(l.sales ?? []).length ? " · " : ""}{u(l.open_units)} held, worth {usd(l.open_net_cents)} net each</span>}</>}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "sales" && lots && (sales.length === 0 ? <div className="text-gray-500">Nothing sold yet under this sell rule: everything is still held.</div> : (
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left sticky top-0 bg-gray-900"><tr>
              <th className="py-1 pr-3 font-medium">Month</th><th className="py-1 pr-3 font-medium">Sold</th>
              <th className="py-1 pr-3 font-medium text-right">Units</th><th className="py-1 pr-3 font-medium text-right">Price</th>
              <th className="py-1 pr-3 font-medium text-right">Kept (net)</th><th className="py-1 pr-3 font-medium text-right">vs cost</th>
              <th className="py-1 pr-3 font-medium">Bought</th><th className="py-1 font-medium">Why</th>
            </tr></thead>
            <tbody>
              {groupBy([...sales].sort((a, b) => a.month.localeCompare(b.month)), (x) => x.month).map(([m, xs]) => xs.map((x, i) => (
                <tr key={`${m}-${i}`} className={i === 0 ? "border-t border-gray-800" : ""}>
                  <td className="py-0.5 pr-3 text-gray-400 whitespace-nowrap">{i === 0 ? m : ""}</td>
                  <td className="py-0.5 pr-3 text-gray-200 whitespace-nowrap">{x.l.set_name} · {SEALED_KIND_LABEL[x.l.kind]}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{u(x.units)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(x.price_cents)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(Math.round(x.net_cents * x.units))}</td>
                  <td className={`py-0.5 pr-3 text-right tabular-nums ${x.net_cents >= x.l.cost_cents ? "text-emerald-300" : "text-rose-300"}`}>{(x.net_cents / x.l.cost_cents).toFixed(2)}×</td>
                  <td className="py-0.5 pr-3 text-gray-500 whitespace-nowrap">{x.l.month} at {usd(x.l.cost_cents)}</td>
                  <td className="py-0.5 text-gray-500">{x.why}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      ))}
      {tab === "held" && lots && (held.length === 0 ? <div className="text-gray-500">Everything sold.</div> : (
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-left"><tr>
            <th className="py-1 pr-3 font-medium">Product</th><th className="py-1 pr-3 font-medium text-right">Units</th>
            <th className="py-1 pr-3 font-medium text-right">Cost</th><th className="py-1 pr-3 font-medium text-right">Worth today (net)</th>
            <th className="py-1 font-medium text-right">Multiple</th>
          </tr></thead>
          <tbody>
            {held.map(([k, ls]) => {
              const units = ls.reduce((a, l) => a + l.open_units, 0);
              const cost = ls.reduce((a, l) => a + l.cost_cents * l.open_units, 0);
              const worth = ls.reduce((a, l) => a + l.open_net_cents * l.open_units, 0);
              return (
                <tr key={k} className="border-t border-gray-800">
                  <td className="py-0.5 pr-3 text-gray-200">{k}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{u(units)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(Math.round(cost))}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(Math.round(worth))}</td>
                  <td className={`py-0.5 text-right tabular-nums ${worth >= cost ? "text-emerald-300" : "text-rose-300"}`}>{(worth / Math.max(1, cost)).toFixed(2)}×</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {tab === "exits" && exits && (
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left sticky top-0 bg-gray-900"><tr>
              <th className="py-1 pr-3 font-medium">Sell rule (same buys)</th><th className="py-1 pr-3 font-medium text-right">IRR /yr</th>
              <th className="py-1 pr-3 font-medium text-right">Multiple</th><th className="py-1 pr-3 font-medium text-right">Profit</th>
              <th className="py-1 pr-3 font-medium text-right">vs S&amp;P</th><th className="py-1 pr-3 font-medium text-right">Avg hold</th>
              <th className="py-1 pr-3 font-medium text-right" title="Units sold under the rule / still held at the end of the data (valued at today's price)">Sold / held</th><th />
            </tr></thead>
            <tbody>
              {exits.map((x, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="py-0.5 pr-3 text-gray-200">{x.exits}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums font-semibold text-emerald-300">{pct(x.irr, 1)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{x.multiple.toFixed(2)}×</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{usd(x.profit_cents)}</td>
                  <td className={`py-0.5 pr-3 text-right tabular-nums ${x.vs_sp_cents >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(x.vs_sp_cents)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{x.avg_hold_months}mo</td>
                  <td className={`py-0.5 pr-3 text-right tabular-nums ${x.open_units > x.sold_units ? "text-amber-300" : "text-gray-400"}`}>{u(x.sold_units)} / {u(x.open_units)}</td>
                  <td className="py-0.5 whitespace-nowrap">
                    <button onClick={() => onUseExit({
                      exit: x.strategy.exit, hold_months: x.strategy.hold_months, all_at_months: x.strategy.all_at_months, sell_date: x.strategy.sell_date,
                      target_mult: x.strategy.target_mult, target_basis: x.strategy.target_basis, max_hold_months: x.strategy.max_hold_months || undefined,
                      wind_start: x.strategy.wind_start, wind_months: x.strategy.wind_months, wind_units: x.strategy.wind_units || undefined,
                    })} className="text-indigo-300 hover:underline">use this</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SealedBacktestPage() {
  const [rules, setRulesState] = useState<SealedRule[]>(loadRules);
  const [res, setRes] = useState<{ results: BacktestResult[]; latest: string; costs: string; method: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gross, setGross] = useState(false);
  const [mode, setMode] = useState<"value" | "multiple">("multiple");
  const [sweepBase, setSweepBase] = useState<SealedRule>({ rule: "schedule", kinds: ["etb"], units: 1, budget_cents: 6000 });
  const [sweep, setSweep] = useState<{ rows: BacktestSweepRow[]; method: string } | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const setRules = (r: SealedRule[]) => { setRulesState(r); saveRules(r); };
  const run = async (rs = rules) => {
    setBusy(true); setErr("");
    try { setRes(await runSealedBacktest(rs.map((r) => ({ ...r, name: r.name || describe(r) })), gross)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { run(); }, [gross]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSweep = async () => {
    setSweeping(true); setErr("");
    try { setSweep(await sweepSealedBacktest(sweepBase, [24, 36, 48], gross)); } catch (e) { setErr(String(e)); } finally { setSweeping(false); }
  };

  const best = res?.results.reduce<BacktestResult | null>((b, r) => (r.irr != null && (b?.irr == null || r.irr > b.irr) ? r : b), null);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed backtests</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          Write a buying rule and a selling rule down as mechanics, then see what they would have made on every set&apos;s chart: what you put in, what you got back
          after selling costs, the money-weighted yearly return (IRR), and the same cash in the S&amp;P. Compare up to 12 rules side by side,
          or sweep every start month, length and hold to find the best schedule. Each rule&apos;s details show what it bought each month (and why),
          what it sold and when, what&apos;s still held, and the best way to sell those same buys (all at once, at a price target, or a wind-down). The data behind it is on <Link to="/sealed/timing" className="text-indigo-300 hover:underline">Sealed timing</Link>.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400 break-all">{err}</div>}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <h2 className="text-sm font-semibold text-gray-200 mr-2">Rules</h2>
          <button onClick={() => run()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "Running…" : "Run backtest"}</button>
          <button onClick={() => setRules([...rules, { ...PRESETS[0], name: "" }])} disabled={rules.length >= 12} className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:text-white">+ add a rule</button>
          <select value="" onChange={(e) => { const p = PRESETS[Number(e.target.value)]; if (p) setRules([...rules, { ...p }]); }} className={inp}>
            <option value="">+ add a preset…</option>
            {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
          <button onClick={() => setRules(PRESETS)} className="text-gray-500 hover:text-gray-300">reset to presets</button>
          <label className="ml-auto flex items-center gap-1 text-gray-400"><input type="checkbox" checked={gross} onChange={(e) => setGross(e.target.checked)} /> gross (before selling costs)</label>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {rules.map((r, i) => (
            <RuleEditor key={i} r={r} color={LINE_COLORS[i % LINE_COLORS.length]}
              onChange={(n) => setRules(rules.map((x, j) => (j === i ? n : x)))} onRemove={() => setRules(rules.filter((_, j) => j !== i))} />
          ))}
        </div>
      </section>

      {busy && !res ? <Spinner /> : res && (
        <section className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-2 py-2 font-medium text-right" title="Money-weighted yearly return from the monthly cash flows">IRR /yr</th>
                  <th className="px-2 py-2 font-medium text-right">Put in</th>
                  <th className="px-2 py-2 font-medium text-right">Got back (net)</th>
                  <th className="px-2 py-2 font-medium text-right">Profit</th>
                  <th className="px-2 py-2 font-medium text-right" title="Got back ÷ put in; finished holds only under it">Multiple</th>
                  <th className="px-2 py-2 font-medium text-right" title="The same cash flows at the S&P benchmark rate">vs S&amp;P</th>
                  <th className="px-2 py-2 font-medium text-right" title="Lots that sold (or are worth) more than they cost, net">Win share</th>
                  <th className="px-2 py-2 font-medium text-right" title="The worst month: what the lots still held would sell for against what they cost">Worst month</th>
                  <th className="px-2 py-2 font-medium text-right" title="Units sold under the sell rule / still held at the end of the data (valued at today's price)">Sold / held</th>
                </tr>
              </thead>
              <tbody>
                {res.results.map((r, i) => (
                  <tr key={i} className={`border-t border-gray-800 ${best === r ? "bg-emerald-950/30" : ""}`}>
                    <td className="px-3 py-1.5 text-gray-200"><span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>●</span> {r.strategy.name}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${r.irr == null ? "text-gray-500" : r.irr >= r.benchmark_irr ? "text-emerald-300" : r.irr >= 0 ? "text-amber-300" : "text-rose-300"}`}>{r.buys ? pct(r.irr, 1) : "–"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{usd(r.invested_cents)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{usd(r.value_cents)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.profit_cents >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(r.profit_cents)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.multiple.toFixed(2)}×{r.closed_multiple != null && <div className="text-[10px] text-gray-500">sold {r.closed_multiple.toFixed(2)}×</div>}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.value_cents >= r.benchmark_cents ? "text-emerald-300" : "text-rose-300"}`}>{usd(r.value_cents - r.benchmark_cents)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(r.win_share * 100)}%</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-rose-300">{pct(r.worst_drawdown)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.open_units > r.sold_units ? "text-amber-300" : "text-gray-400"}`}>{u(r.sold_units)} / {u(r.open_units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="text-sm text-gray-200">Over time:</span>
              {(["multiple", "value"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? "bg-gray-700 text-white" : "hover:text-gray-200"}`}>
                  {m === "multiple" ? "(back + held) ÷ put in" : "profit so far ($)"}
                </button>
              ))}
              <span className="text-gray-500">held lots valued at that month&apos;s price, net of selling costs</span>
            </div>
            <Chart results={res.results} mode={mode} />
          </div>
          <div className="space-y-2">
            {res.results.map((r, i) => <Detail key={i} r={r} color={LINE_COLORS[i % LINE_COLORS.length]} gross={gross}
              onUseExit={(ex) => { const n = rules.map((x, j) => (j === i ? { ...x, ...ex, name: "" } : x)); setRules(n); run(n); }} />)}
          </div>
          <p className="text-[11px] text-gray-500 max-w-5xl">{res.costs} {res.method} Data through {res.latest}.</p>
        </section>
      )}

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <h2 className="text-sm font-semibold text-gray-200 mr-2">Find the best rule</h2>
          {KINDS.slice(0, 5).map((k) => (
            <label key={k} className={`px-1.5 py-0.5 rounded border cursor-pointer ${sweepBase.kinds.includes(k) ? "border-indigo-600 text-indigo-200" : "border-gray-800 text-gray-500"}`}>
              <input type="checkbox" className="hidden" checked={sweepBase.kinds.includes(k)}
                onChange={(e) => setSweepBase({ ...sweepBase, kinds: e.target.checked ? [...sweepBase.kinds, k] : sweepBase.kinds.filter((x) => x !== k) })} />
              {SEALED_KIND_LABEL[k]}
            </label>
          ))}
          <label className="flex items-center gap-1">hype budget $<input value={(sweepBase.budget_cents ?? 6000) / 100}
            onChange={(e) => setSweepBase({ ...sweepBase, budget_cents: Math.round((num(e.target.value) ?? 60) * 100) })} className={`${inp} w-14`} />/mo</label>
          <label className="flex items-center gap-1">sets released <input value={sweepBase.released_from ?? ""} placeholder="YYYY-MM"
            onChange={(e) => setSweepBase({ ...sweepBase, released_from: e.target.value || undefined })} className={`${inp} w-20`} /></label>
          <button onClick={runSweep} disabled={sweeping || sweepBase.kinds.length === 0} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-50">{sweeping ? "Sweeping…" : "Sweep"}</button>
          <span className="text-gray-500">about 200 variants: monthly schedules (start × length × hold 24/36/48), hype picks and dip buys</span>
        </div>
        {sweep && (
          <>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left sticky top-0 bg-gray-900">
                  <tr>
                    <th className="py-1 pr-3 font-medium">#</th><th className="py-1 pr-3 font-medium">Rule</th>
                    <th className="py-1 pr-3 font-medium text-right">IRR /yr</th><th className="py-1 pr-3 font-medium text-right">Multiple</th>
                    <th className="py-1 pr-3 font-medium text-right">Sold multiple</th><th className="py-1 pr-3 font-medium text-right">Win share</th>
                    <th className="py-1 pr-3 font-medium text-right">Worst month</th><th className="py-1 pr-3 font-medium text-right">Sets</th>
                    <th className="py-1 pr-3 font-medium text-right">Sold / open</th><th />
                  </tr>
                </thead>
                <tbody>
                  {sweep.rows.slice(0, 60).map((x, i) => (
                    <tr key={i} className="border-t border-gray-800">
                      <td className="py-0.5 pr-3 text-gray-500">{i + 1}</td>
                      <td className="py-0.5 pr-3 text-gray-200">{describe(x.strategy)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums font-semibold text-emerald-300">{pct(x.irr, 1)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">{x.multiple.toFixed(2)}×</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-gray-400">{x.closed_multiple != null ? `${x.closed_multiple.toFixed(2)}×` : "–"}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">{Math.round(x.win_share * 100)}%</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-rose-300">{pct(x.worst_drawdown)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">{x.sets}</td>
                      <td className={`py-0.5 pr-3 text-right tabular-nums ${x.open_lots > x.closed_lots ? "text-amber-300" : "text-gray-400"}`}>{x.closed_lots} / {x.open_lots}</td>
                      <td className="py-0.5 whitespace-nowrap">
                        <button disabled={rules.length >= 12} onClick={() => { const n = [...rules, { ...x.strategy, name: "" }]; setRules(n); run(n); }}
                          className="text-indigo-300 hover:underline disabled:opacity-40">compare</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-500">{sweep.method}</p>
          </>
        )}
      </section>
    </div>
  );
}
