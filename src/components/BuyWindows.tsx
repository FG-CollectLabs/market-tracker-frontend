import { useState } from "react";
import { Link } from "react-router-dom";
import { watchSetTier, type SetWindow, type SetWindows } from "../lib/api";

// Buy windows: which sets' tiers sit in their release curve's bottom 10%
// right now (or open soon), per grade, with a button to watch the cards.

export const TIER_LABEL: Record<string, string> = {
  all: "All tracked", ir: "IR tier", sir: "SIR tier", ultra: "Full art / UR", gold: "Gold / hyper", gallery: "TG / GG", promo: "Promos",
};
export const WGRADE_LABEL: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "cgc-10": "CGC 10" };

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

export function windowStyle(w: SetWindow): string {
  if (w.status === "in_window") return "bg-green-900/60 text-green-300 border-green-700/60";
  if (w.status === "before" && (w.months_to_window ?? 99) <= 3) return "bg-amber-900/40 text-amber-300 border-amber-700/50";
  return "bg-gray-800/60 text-gray-500 border-gray-700/50";
}

// The best window per grade for a set tile: in window beats opening soon
// beats anything else.
export function TileBadges({ set }: { set?: SetWindows }) {
  if (!set) return null;
  const rank = (w: SetWindow) => (w.status === "in_window" ? 0 : w.status === "before" && (w.months_to_window ?? 99) <= 3 ? 1 : 2);
  const best = new Map<string, SetWindow>();
  for (const w of set.windows) {
    const b = best.get(w.grade);
    if (!b || rank(w) < rank(b)) best.set(w.grade, w);
  }
  const shown = [...best.values()].filter((w) => rank(w) < 2);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {shown.map((w) => (
        <span key={w.grade} title={w.headline} className={`px-1 rounded border text-[10px] ${windowStyle(w)}`}>
          {WGRADE_LABEL[w.grade]} {w.status === "in_window" ? "buy" : `in ${w.months_to_window}mo`}
          {w.provisional ? "*" : ""}
        </span>
      ))}
    </div>
  );
}

function WatchButton({ set, w }: { set: SetWindows; w: SetWindow }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <button disabled={state === "busy" || state === "done"}
      title={`Watch ${w.cards} ${TIER_LABEL[w.tier] ?? w.tier} card${w.cards === 1 ? "" : "s"} from ${set.name}`}
      onClick={() => {
        setState("busy");
        const intent = w.grade === "raw" ? "grade" : "invest";
        watchSetTier(set.code, w.tier, intent, `${WGRADE_LABEL[w.grade]} window months ${w.from}-${w.to}: ${w.headline}`)
          .then((r) => { setState("done"); setMsg(`${r.watched} watched`); })
          .catch((e: Error) => { setState("error"); setMsg(e.message); });
      }}
      className="px-2 py-0.5 rounded border border-gray-700 text-xs text-gray-300 hover:border-indigo-500 hover:text-white disabled:opacity-60">
      {state === "busy" ? "…" : state === "done" ? `✓ ${msg}` : state === "error" ? `Retry (${msg})` : `Watch ${w.cards}`}
    </button>
  );
}

export default function BuyWindowsPanel({ sets }: { sets: SetWindows[] }) {
  const [soon, setSoon] = useState(true);
  const [grade, setGrade] = useState<string>("");
  const rows = sets
    .flatMap((s) => s.windows.map((w) => ({ s, w })))
    .filter(({ w }) => (w.status === "in_window" || (soon && w.status === "before" && (w.months_to_window ?? 99) <= 3)) && (!grade || w.grade === grade))
    .sort((a, b) => (a.w.status === b.w.status ? (a.w.months_to_window ?? 0) - (b.w.months_to_window ?? 0) : a.w.status === "in_window" ? -1 : 1));

  return (
    <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-100">Buy windows</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded border border-gray-700 overflow-hidden">
            {([["", "All grades"], ["raw", "Raw"], ["psa-10", "PSA 10"], ["cgc-10", "CGC 10"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setGrade(k)}
                className={`px-2 py-0.5 ${grade === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{label}</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-gray-400">
            <input type="checkbox" checked={soon} onChange={(e) => setSoon(e.target.checked)} className="accent-indigo-500" />
            Include windows opening within 3 months
          </label>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Months since release when a tier's prices typically sit within 10% of their low (release curves by tier, grade and language).
        Watch adds the tier's tracked cards to the watchlist (raw as "grade", slabs as "invest"). * = provisional curve (few sets behind it).
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No set is in a buy window right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left font-medium py-1">Set</th>
                <th className="text-left font-medium py-1 px-2">Cards</th>
                <th className="text-left font-medium py-1 px-2">Grade</th>
                <th className="text-left font-medium py-1 px-2">Window</th>
                <th className="text-right font-medium py-1 px-2" title="Typical change still to come before the bottom">Still to fall</th>
                <th className="text-left font-medium py-1 px-2">Why</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map(({ s, w }) => (
                <tr key={`${s.code}|${w.tier}|${w.grade}`} className="align-top">
                  <td className="py-1.5 whitespace-nowrap">
                    <Link to={`/browse/${s.code}`} className="text-gray-100 hover:text-indigo-300">{s.name}</Link>
                    <div className="text-[11px] text-gray-500">month {Math.floor(s.months_since_release)}</div>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{TIER_LABEL[w.tier] ?? w.tier} <span className="text-gray-500">· {w.cards}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{WGRADE_LABEL[w.grade]}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span className={`px-1.5 rounded border text-[11px] ${windowStyle(w)}`}>
                      {w.status === "in_window" ? "now" : `in ${w.months_to_window} mo`}
                    </span>{" "}
                    <span className="text-gray-400 text-xs">months {w.from}–{w.to}{w.provisional ? "*" : ""}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{w.to_bottom < -0.005 ? pct(w.to_bottom) : "—"}</td>
                  <td className="py-1.5 px-2 text-xs text-gray-400 max-w-md">{w.headline}</td>
                  <td className="py-1.5 pl-2 text-right"><WatchButton set={s} w={w} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
