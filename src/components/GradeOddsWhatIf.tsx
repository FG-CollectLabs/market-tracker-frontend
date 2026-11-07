import { useEffect, useState } from "react";
import { fetchWhatIfOdds, type WhatIfOdds } from "../lib/api";
import AdjEVCell from "./AdjEVCell";

// What-if: the grading predictor's odds for a copy of this card at the
// centering (and corner roundness) you set, and the EV of buying one at a
// price. For sizing up a listing before sending its photos.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-gray-200">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-indigo-500" />
    </label>
  );
}

const split = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")}/${(100 - v).toFixed(1).replace(/\.0$/, "")}`;

export default function GradeOddsWhatIf({ displayKey }: { displayKey: string }) {
  const [flr, setFlr] = useState(50);
  const [ftb, setFtb] = useState(50);
  const [blr, setBlr] = useState(50);
  const [btb, setBtb] = useState(50);
  const [corners, setCorners] = useState(false);
  const [fc, setFc] = useState(0.05);
  const [bc, setBc] = useState(0.05);
  const [buy, setBuy] = useState("");
  const [res, setRes] = useState<WhatIfOdds | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const b = Math.round(parseFloat(buy) * 100);
      fetchWhatIfOdds(displayKey, { flr, ftb, blr, btb, fcorner: corners ? fc : undefined, bcorner: corners ? bc : undefined, buyCents: b > 0 ? b : undefined })
        .then((r) => { if (live) { setRes(r); setErr(null); } })
        .catch((e) => live && setErr(String(e).includes("unknown_card") ? "The pre-grader doesn't have this card yet (its catalog syncs every 6 hours)." : String(e)));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [displayKey, flr, ftb, blr, btb, corners, fc, bc, buy]);

  const pct = (p?: number) => (p == null ? "–" : `${(p * 100).toFixed(0)}%`);
  const psa = res?.graders.PSA;
  const cgc = res?.graders.CGC;
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3 mb-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-100">What-if: odds at a centering</h2>
        <p className="text-xs text-gray-500">Set a copy's centering (and worst-corner roundness) to see the pre-grader's odds and the EV of buying it. No photos needed. Not a grade promise.</p>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Slider label="Front left / right" value={flr} min={35} max={65} step={0.5} onChange={setFlr} fmt={split} />
        <Slider label="Back left / right" value={blr} min={20} max={80} step={0.5} onChange={setBlr} fmt={split} />
        <Slider label="Front top / bottom" value={ftb} min={35} max={65} step={0.5} onChange={setFtb} fmt={split} />
        <Slider label="Back top / bottom" value={btb} min={20} max={80} step={0.5} onChange={setBtb} fmt={split} />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-gray-400">
        <input type="checkbox" checked={corners} onChange={(e) => setCorners(e.target.checked)} /> Include corner roundness (worst corner, mm off a clean quarter circle)
      </label>
      {corners && (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Slider label="Front worst corner" value={fc} min={0} max={0.4} step={0.01} onChange={setFc} fmt={(v) => `${v.toFixed(2)} mm`} />
          <Slider label="Back worst corner" value={bc} min={0} max={0.4} step={0.01} onChange={setBc} fmt={(v) => `${v.toFixed(2)} mm`} />
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-400">
        Buy price $
        <input value={buy} onChange={(e) => setBuy(e.target.value)} placeholder={res ? (res.buy_cents / 100).toFixed(2) : "raw market"} inputMode="decimal"
          className="w-24 rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-gray-200 tabular-nums" />
        <span className="text-gray-600">empty = raw market {usd(res?.prices.raw)}</span>
      </label>
      {err && <p className="text-xs text-amber-300">{err}</p>}
      {res && (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3 text-xs">
          <div>
            <div className="text-gray-500">PSA</div>
            <div className="tabular-nums text-gray-200">10 <b className="text-white text-sm">{pct(psa?.p["10"])}</b> · not a 10 {pct(psa?.p["9"])}</div>
            {psa?.centering_cap && psa.centering_cap !== "10" && <div className="text-amber-300">centering caps PSA at {psa.centering_cap}</div>}
          </div>
          {cgc && (
            <div>
              <div className="text-gray-500">CGC <span className="text-amber-300/80">(listing-based, optimistic)</span></div>
              <div className="tabular-nums text-gray-200">Pristine {pct(cgc.p["10 pristine"])} · 10 {pct(cgc.p["10"])} · 9.5 {pct(cgc.p["9.5"])} · 9 {pct(cgc.p["9"])}</div>
            </div>
          )}
          <div>
            <div className="text-gray-500">EV at {usd(res.buy_cents)} (PSA)</div>
            <AdjEVCell ev={res.ev} />
          </div>
        </div>
      )}
    </section>
  );
}
