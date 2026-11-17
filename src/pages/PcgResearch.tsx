import { useEffect, useState } from "react";
import { fetchPcgModel, pcgValue, type PcgModel, type PcgRatio, type PcgValue } from "../lib/api";
import { Spinner } from "../components/Spinner";

// PCG pricing research: the model that prices PCG slabs from the same card's
// PSA 10 (and raw), refit as PCG sales are recorded, its evidence per grade
// and price band, PCG's centering gates, and a calculator for one copy.

const BANDS = ["all", "PSA 10 under $50", "PSA 10 $50–200", "PSA 10 $200–1,000", "PSA 10 $1,000+"];
const GRADES = ["pcg-10-flawless", "pcg-10-pristine", "pcg-10", "pcg-9.5", "pcg-9", "pcg-8.5", "pcg-8"];
const pct = (v?: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const usd = (c?: number | null) => (c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: c >= 10000 ? 0 : 2 })}`);
const CONF: Record<PcgRatio["confidence"], string> = {
  none: "text-gray-600", low: "text-amber-300", medium: "text-sky-200", high: "text-emerald-300",
};
const ratio = (v: number) => `${v}/${100 - v}`;

function Calculator({ game }: { game: string }) {
  const [key, setKey] = useState("");
  const [c, setC] = useState({ front_lr: "", front_tb: "", back_lr: "", back_tb: "" });
  const [res, setRes] = useState<PcgValue | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(""); setRes(null);
    const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
    try {
      const r = await pcgValue(game, [{ display_key: key.trim(), front_lr: n(c.front_lr), front_tb: n(c.front_tb), back_lr: n(c.back_lr), back_tb: n(c.back_tb) }]);
      setRes(r.items[0] ?? null);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200 tabular-nums";
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="text-sm font-medium text-gray-200">Price one copy</div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="display key, e.g. pokemon-me4-119" className={`${inp} w-56`} />
        {(["front_lr", "front_tb", "back_lr", "back_tb"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1">{k.replace("_", " ")}
            <input value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder="53" className={`${inp} w-12`} /></label>
        ))}
        <button onClick={run} disabled={!key.trim() || busy} className="rounded bg-indigo-600 px-2.5 py-1 text-white disabled:opacity-40">{busy ? "…" : "Price it"}</button>
        <span className="text-gray-500">centering optional: one side&apos;s share per axis (53 = 53/47), from the pre-grader</span>
      </div>
      {err && <div className="text-xs text-rose-400 break-all">{err.includes("401") || err.includes("403") ? "Sign in to price copies." : err}</div>}
      {res && (
        <div className="space-y-2 text-xs">
          <div className="text-gray-200">{res.name} · PSA 10 {usd(res.psa_10_cents)} · raw {usd(res.raw_cents)}
            {res.pcg_10_vs_raw != null && <span className="text-gray-400"> · premium over raw: PCG 10 {res.pcg_10_vs_raw}× vs PSA 10 {res.psa_10_vs_raw ?? "—"}×</span>}</div>
          {res.centering_cap && (
            <div className={res.centering_cap.ten_possible ? "text-emerald-300" : "text-amber-300"}>{res.centering_cap.why}</div>
          )}
          <table className="text-xs">
            <thead className="text-gray-500"><tr><th className="px-2 py-1 text-left font-medium">Grade</th><th className="px-2 py-1 text-right font-medium">Price</th><th className="px-2 py-1 text-left font-medium">Basis</th><th className="px-2 py-1 text-right font-medium">Odds</th></tr></thead>
            <tbody>{res.grades.map((g) => (
              <tr key={g.grade} className="border-t border-gray-800">
                <td className="px-2 py-1 text-gray-300">{g.label}</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-100">{usd(g.cents)}</td>
                <td className="px-2 py-1 text-gray-400">{g.basis === "own_sales" ? "its own PCG sales" : g.basis === "psa10_ratio" ? `PSA 10 × ${pct(g.vs_psa_10)}` : g.basis === "raw_ratio" ? "raw × ratio" : "no data"}
                  <span className={`ml-1 ${CONF[g.confidence as PcgRatio["confidence"]] ?? "text-gray-500"}`}>({g.confidence})</span></td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-300">{g.p != null ? pct(g.p) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="text-gray-300">Fee {usd(res.fee_cents)} ({res.fee_tier}) · EV after fee + shipping <b>{usd(res.ev_cents)}</b>
            {res.gain_vs_raw_cents != null && <span className={res.gain_vs_raw_cents >= 0 ? "text-emerald-300" : "text-rose-300"}> · {res.gain_vs_raw_cents >= 0 ? "+" : ""}{usd(res.gain_vs_raw_cents)} vs selling raw</span>}
            {res.best_case_cents != null && <span className="text-gray-400"> · best case {usd(res.best_case_cents)}</span>}
            <span className="text-gray-500"> · odds: {res.odds_source.replace("_", " ")}{res.odds_n ? ` (${res.odds_n} graded)` : ""}</span></div>
          {res.notes.length > 0 && <ul className="list-disc pl-5 text-gray-500">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

export default function PcgResearch({ game }: { game: "pokemon" | "riftbound" }) {
  const [m, setM] = useState<PcgModel | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setM(null); fetchPcgModel(game).then(setM).catch((e) => setErr(String(e))); }, [game]);
  if (err) return <div className="text-sm text-rose-400">{err}</div>;
  if (!m) return <Spinner />;
  const cell = (g: string, b: string) => m.ratios.find((r) => r.grade === g && r.band === b);
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3"><div className="text-xs text-gray-500">PCG sales behind the model</div>
          <div className="text-xl font-semibold text-gray-100 tabular-nums">{m.sales}</div><div className="text-[11px] text-gray-500">{m.cards} cards{m.first_sale ? ` · since ${m.first_sale.slice(0, 10)}` : ""}</div></div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 sm:col-span-2"><div className="text-xs text-gray-500">How to read it</div>
          <div className="text-xs text-gray-300">Each cell is what a PCG grade sells for as a share of the same card&apos;s PSA 10, by the card&apos;s PSA 10 price.
            Thin bands lean on the grade&apos;s overall ratio. Colour = evidence: <span className={CONF.high}>high</span> 20+ sales, <span className={CONF.medium}>medium</span> 5–19, <span className={CONF.low}>low</span> under 5, <span className={CONF.none}>none</span>.</div></div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="text-sm font-medium text-gray-200">PCG price ÷ PSA 10 (fitted)</div>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead className="text-xs text-gray-500"><tr><th className="px-2 py-1 text-left font-medium">PCG grade</th>
              {BANDS.map((b) => <th key={b} className="px-3 py-1 text-right font-medium">{b === "all" ? "All cards" : b.replace("PSA 10 ", "")}</th>)}
              <th className="px-3 py-1 text-right font-medium">÷ raw</th></tr></thead>
            <tbody>{GRADES.map((g) => (
              <tr key={g} className="border-t border-gray-800">
                <td className="px-2 py-1.5 text-gray-200 whitespace-nowrap">{cell(g, "all")?.label ?? g}</td>
                {BANDS.map((b) => {
                  const r = cell(g, b);
                  return (
                    <td key={b} className="px-3 py-1.5 text-right tabular-nums" title={r && r.n ? `${r.n} sales · its own median ${pct(r.raw_vs_psa_10)} · middle half ${pct(r.p25)}–${pct(r.p75)}` : "no sales in this band"}>
                      <span className={CONF[r?.confidence ?? "none"]}>{pct(r?.vs_psa_10)}</span>
                      <span className="ml-1 text-[10px] text-gray-600">{r?.n ?? 0}</span>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">{cell(g, "all")?.vs_raw != null ? `${cell(g, "all")!.vs_raw!.toFixed(2)}×` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <ul className="list-disc pl-5 text-[11px] text-gray-500">{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>

      <Calculator game={game} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="text-sm font-medium text-gray-200">PCG centering gates</div>
        <p className="text-xs text-gray-400">From PCG&apos;s grading standards. A copy whose measured centering misses a grade can&apos;t get it: its odds above the cap move down to the best grade allowed. &quot;50/50&quot; counts within 1 point. Front worse than 55/45 rules out a 9 as well as a 10.</p>
        <table className="text-xs">
          <thead className="text-gray-500"><tr><th className="px-2 py-1 text-left font-medium">Grade</th><th className="px-2 py-1 text-right font-medium">Front (worst axis)</th><th className="px-2 py-1 text-right font-medium">Back</th></tr></thead>
          <tbody>{m.centering_gates.slice(0, 9).map((g) => (
            <tr key={g.grade} className="border-t border-gray-800">
              <td className="px-2 py-1 text-gray-300">{g.grade.replace("pcg-", "").replace("-", " ")}</td>
              <td className="px-2 py-1 text-right tabular-nums text-gray-200">{ratio(Math.round(g.front_worst))}{g.front_best ? `, other axis ${ratio(Math.round(g.front_best))}` : ""}</td>
              <td className="px-2 py-1 text-right tabular-nums text-gray-200">{g.back_worst >= 100 ? "any" : ratio(Math.round(g.back_worst))}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <p className="text-[11px] text-gray-500 max-w-5xl">{m.method}</p>
    </div>
  );
}
