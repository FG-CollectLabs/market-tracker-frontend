import { useEffect, useState } from "react";
import { fetchPcgOutcomes, type PcgOutcomes } from "../lib/api";

// Your own PCG results by what each copy's measured centering allowed under
// PCG's rules. A class with enough results replaces PCG's population mix in
// the boards' PCG EV.

const COLS: [string, string][] = [["pcg-10-flawless", "Flawless"], ["pcg-10-pristine", "Pristine"], ["pcg-10", "10"], ["pcg-9.5", "9.5"], ["pcg-9", "9"], ["lower", "lower"]];
const pct = (v?: number) => (v == null ? "–" : `${Math.round(v * 100)}%`);

export default function PCGOutcomes() {
  const [d, setD] = useState<PcgOutcomes | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchPcgOutcomes().then(setD).catch((e) => setErr(String(e))); }, []);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
      <div className="text-sm font-medium text-gray-200">Your PCG results</div>
      <p className="text-xs text-gray-400 max-w-3xl">
        Copies you logged as graded by PCG (Bids &amp; results → Graded → PCG, or the admin app), by what the copy&apos;s measured centering
        allowed. Once a group has {d?.min_n ?? 15} results, the boards&apos; PCG EV uses your mix for copies in it instead of PCG&apos;s population report.
      </p>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {d && (d.classes.length === 0 ? <p className="text-xs text-gray-500">None logged yet. When a copy comes back from PCG, record its grade on Watchlist → Bids &amp; results.</p> : (
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums">
            <thead className="text-gray-500 text-left"><tr>
              <th className="py-1 pr-4 font-medium">Centering allowed</th><th className="py-1 pr-3 font-medium text-right">Graded</th>
              {COLS.map(([, l]) => <th key={l} className="py-1 pr-3 font-medium text-right">{l}</th>)}<th className="py-1 font-medium">On boards</th>
            </tr></thead>
            <tbody>{d.classes.map((c) => (
              <tr key={c.class} className="border-t border-gray-800">
                <td className="py-1 pr-4 text-gray-300">{c.label}</td>
                <td className="py-1 pr-3 text-right text-gray-100">{c.n}</td>
                {COLS.map(([k]) => <td key={k} className="py-1 pr-3 text-right text-gray-300" title={`${c.grades[k] ?? 0} of ${c.n}`}>{c.grades[k] ? pct(c.shares[k]) : <span className="text-gray-600">–</span>}</td>)}
                <td className="py-1 text-[11px]">{c.used_on_boards ? <span className="text-emerald-300">used</span> : <span className="text-gray-500">{Math.max(0, d.min_n - c.n)} more</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
