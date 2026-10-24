import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BUY_TARGETS, STRATEGY_FOR_GRADE, setTargets, watchSetTier, type BuyTarget, type SetWindow, type SetWindows } from "../lib/api";
import { useSession } from "../lib/auth";
import { onWatchChange, watchChanged, watchedCards } from "./WatchButton";

// Buy windows: where each set sits on its release curve per grade (raw,
// PSA 10, CGC 10): in the window to buy, too early, past it, or, for raw in
// out-of-print sets, watch only (copies left are unlikely to be pack fresh).

export const TIER_LABEL: Record<string, string> = {
  all: "All tracked", ir: "IR tier", sir: "SIR tier", ultra: "Full art / UR", gold: "Gold / hyper", gallery: "TG / GG", promo: "Promos",
};
export const WGRADE_LABEL: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "cgc-10": "CGC 10" };
// The grades with buy windows, and the strategy chip for each.
const GRADES = ["raw", "psa-10", "cgc-10"] as const;
const CHIPS: { strategy: BuyTarget; grade: (typeof GRADES)[number] }[] = [
  { strategy: "raw_grade", grade: "raw" }, { strategy: "psa_10", grade: "psa-10" }, { strategy: "cgc_10", grade: "cgc-10" },
];
// Strategies without a buy window of their own, behind the chips' "+" menu.
const MORE: BuyTarget[] = ["raw_invest", "regrade"];
const TARGET_LABEL = Object.fromEntries(BUY_TARGETS.map((t) => [t.key, t.label])) as Record<BuyTarget, string>;

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const soon = (w: SetWindow) => w.action === "wait" && (w.months_to_window ?? 99) <= 3;

// One word for where a window stands.
export function actionLabel(w: SetWindow): string {
  switch (w.action) {
    case "buy": return "Prime";
    case "watch_only": return "Watch only";
    case "wait": return soon(w) ? `Early · ${w.months_to_window} mo` : `Too early · ${w.months_to_window} mo`;
    case "past": return "Past window";
    default: return "No data";
  }
}

export function windowStyle(w: SetWindow): string {
  if (w.action === "buy") return "bg-green-900/60 text-green-300 border-green-700/60";
  if (w.action === "watch_only") return "bg-sky-900/50 text-sky-300 border-sky-700/50";
  if (soon(w)) return "bg-amber-900/40 text-amber-300 border-amber-700/50";
  return "bg-gray-800/60 text-gray-500 border-gray-700/50";
}

const rank = (w: SetWindow) => (w.action === "buy" ? 0 : w.action === "watch_only" ? 1 : soon(w) ? 2 : w.action === "wait" ? 3 : 4);

// The window that best describes a set for one grade: the most actionable
// of its tiers.
export function bestWindow(set: SetWindows | undefined, grade: string): SetWindow | undefined {
  return set?.windows.filter((w) => w.grade === grade).sort((a, b) => rank(a) - rank(b))[0];
}

// The card's window for a grade: its tier's own, else the set as a whole.
// The card's price-cycle phase, from its raw window: still falling after
// release, at the bottom (in print / out of print), or recovering.
export const PHASE: Record<string, { label: string; cls: string; hint: string }> = {
  hype: { label: "Hype", cls: "bg-rose-900/50 text-rose-200 border-rose-700/50", hint: "Release hype: prices are still falling toward the bottom" },
  post_hype: { label: "Post-hype", cls: "bg-green-900/50 text-green-200 border-green-700/50", hint: "At the bottom and still in print" },
  out_of_print: { label: "Out of print", cls: "bg-sky-900/50 text-sky-200 border-sky-700/50", hint: "At the bottom and out of print: recovery usually starts 6-12 months after" },
  recovering: { label: "Recovering", cls: "bg-amber-900/50 text-amber-200 border-amber-700/50", hint: "Past the bottom: prices typically rising" },
};
export function phaseOfWindow(raw?: SetWindow): string {
  switch (raw?.action) {
    case "wait": return "hype";
    case "buy": return "post_hype";
    case "watch_only": return "out_of_print";
    case "past": return "recovering";
  }
  return "unknown";
}
export function PhaseChip({ phase, title }: { phase?: string; title?: string }) {
  const p = phase ? PHASE[phase] : undefined;
  if (!p) return null;
  return <span className={`px-1 rounded border text-[10px] leading-4 ${p.cls}`} title={title ?? p.hint}>{p.label}</span>;
}

export function cardWindow(set: SetWindows | undefined, grade: string, tier: string): SetWindow | undefined {
  return set?.windows.find((w) => w.grade === grade && w.tier === tier) ?? set?.windows.find((w) => w.grade === grade && w.tier === "all");
}

// A card's rarity tier, the way the release curves file it (see categoryOf in
// the backend); "all" when it has none.
export function tierOf(rarity: string | undefined, number: string, setCode: string, era?: string): string {
  const r = (rarity ?? "").toLowerCase();
  const n = number.toUpperCase();
  if (n.startsWith("TG") || n.startsWith("GG")) return "gallery";
  if (r === "promo") return "promo";
  if (r === "illustration rare") return "ir";
  if (r === "special illustration rare") return "sir";
  if (r === "hyper rare" || r === "mega hyper rare") return "gold";
  if (r === "secret rare") return ["swsh", "sm", "xy", "bw"].includes(era ?? "") || /^(swsh|sm|xy|bw|g1|dc1|dv1)/.test(setCode) ? "sir" : "gold";
  if (r === "ultra rare" || r === "full art trainer" || r === "shiny ultra rare") return "ultra";
  return "all";
}

// Set tile: one line per grade.
export function TileTiming({ set }: { set?: SetWindows }) {
  if (!set) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {GRADES.map((g) => {
        const w = bestWindow(set, g);
        if (!w) return null;
        return (
          <div key={g} className="flex items-center justify-between gap-2 text-[10px]" title={w.headline}>
            <span className="text-gray-500">{WGRADE_LABEL[g]}</span>
            <span className={`px-1 rounded border ${windowStyle(w)}`}>
              {actionLabel(w)}{w.provisional ? "*" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Per-card buy targets: Raw / PSA 10 / CGC 10, coloured by the card's window,
// filled when targeted. Clicking adds or removes the target (and puts the card
// on the watchlist).
export function TargetChips({ displayKey, set, tier }: { displayKey: string; set?: SetWindows; tier: string }) {
  const session = useSession();
  const [targets, setT] = useState<BuyTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () => watchedCards().then((m) => live && setT(m.get(displayKey)?.targets ?? []));
    load();
    const off = onWatchChange(load);
    return () => {
      live = false;
      off();
    };
  }, [session, displayKey]);
  if (!session || targets == null) return null;
  const toggle = async (g: BuyTarget) => {
    const next = targets.includes(g) ? targets.filter((x) => x !== g) : [...targets, g];
    setBusy(true);
    try {
      await setTargets(displayKey, next.includes("raw_grade") ? "grade" : next.length ? "invest" : "watch", next);
      setT(next);
      watchChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex gap-0.5 print:hidden">
      {CHIPS.map(({ strategy: g, grade }) => {
        const w = cardWindow(set, grade, tier);
        const on = targets.includes(g);
        const base = w ? windowStyle(w) : "bg-gray-800/60 text-gray-500 border-gray-700/50";
        return (
          <button key={g} disabled={busy} onClick={() => toggle(g)}
            title={`${on ? "Targeted: click to remove" : "Target"} ${TARGET_LABEL[g]}${w ? ` · ${actionLabel(w)}: ${w.headline}` : ""}`}
            className={`px-1 rounded border text-[10px] leading-4 ${base} ${on ? "ring-1 ring-yellow-300 font-semibold" : "opacity-70 hover:opacity-100"}`}>
            {on ? "★ " : ""}{WGRADE_LABEL[grade]}
          </button>
        );
      })}
      {MORE.filter((g) => targets.includes(g)).map((g) => (
        <button key={g} disabled={busy} onClick={() => toggle(g)} title={`Targeted: click to remove ${TARGET_LABEL[g]}`}
          className="px-1 rounded border text-[10px] leading-4 bg-gray-800/60 text-gray-300 border-gray-700/50 ring-1 ring-yellow-300 font-semibold">
          ★ {TARGET_LABEL[g]}
        </button>
      ))}
      <span className="relative">
        <button onClick={() => setMore((v) => !v)} title="More strategies: Raw to invest (raw + graded under 10), Regrade 9s (any 9 / 9.5). Set prices on the Watchlist page."
          className="px-1 rounded border border-gray-700/50 text-[10px] leading-4 text-gray-500 hover:text-gray-200">+</button>
        {more && (
          <span className="absolute z-30 left-0 top-5 flex flex-col gap-0.5 rounded border border-gray-700 bg-gray-950 p-1 shadow-xl">
            {MORE.map((g) => (
              <label key={g} className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-300">
                <input type="checkbox" className="accent-indigo-500" checked={targets.includes(g)} disabled={busy} onChange={() => toggle(g)} />
                {TARGET_LABEL[g]}
              </label>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

// The set page header: per grade, where each tier stands.
export function SetTimingSummary({ set, onPrint }: { set: SetWindows; onPrint?: (v: boolean | null) => void }) {
  const session = useSession();
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-100">Timing · month {Math.floor(set.months_since_release)}</h2>
        <span className="text-xs text-gray-400">
          {set.in_print ? "In print" : "Out of print"}
          <span className="text-gray-600"> ({set.print_source === "override" ? "set by hand" : "by age"})</span>
          {session && onPrint && (
            <>
              {" · "}
              <button className="text-indigo-300 hover:underline" onClick={() => onPrint(!set.in_print)}>mark {set.in_print ? "out of print" : "in print"}</button>
              {set.print_source === "override" && (
                <> · <button className="text-indigo-300 hover:underline" onClick={() => onPrint(null)}>use the age rule</button></>
              )}
            </>
          )}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {GRADES.map((g) => (
          <div key={g} className="space-y-1">
            <div className="text-xs text-gray-400">{WGRADE_LABEL[g]}</div>
            {set.windows.filter((w) => w.grade === g).sort((a, b) => rank(a) - rank(b)).map((w) => (
              <div key={w.tier} className="text-xs flex items-start gap-1.5" title={w.headline}>
                <span className={`px-1 rounded border text-[10px] shrink-0 ${windowStyle(w)}`}>{actionLabel(w)}{w.provisional ? "*" : ""}</span>
                <span className="text-gray-400">{TIER_LABEL[w.tier] ?? w.tier} · months {w.from}–{w.to}{w.to_bottom < -0.005 ? ` · ${pct(w.to_bottom)} to go` : ""}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        Pick targets per card below (Raw / PSA 10 / CGC 10). Chip colours are that card's window: green prime, amber opening soon, blue watch only
        (out of print: don't buy raw to grade, watch for a gradable copy), grey early or past. * provisional curve.
      </p>
    </section>
  );
}

function WatchTierButton({ set, w }: { set: SetWindows; w: SetWindow }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <button disabled={state === "busy" || state === "done"}
      title={`Target ${WGRADE_LABEL[w.grade]} on all ${w.cards} ${TIER_LABEL[w.tier] ?? w.tier} card${w.cards === 1 ? "" : "s"} in ${set.name}`}
      onClick={() => {
        setState("busy");
        watchSetTier(set.code, w.tier, w.grade === "raw" ? "grade" : "invest", `${WGRADE_LABEL[w.grade]} window months ${w.from}-${w.to}`, STRATEGY_FOR_GRADE[w.grade])
          .then((r) => { setState("done"); setMsg(`${r.watched} watched`); watchChanged(); })
          .catch((e: Error) => { setState("error"); setMsg(e.message); });
      }}
      className="px-2 py-0.5 rounded border border-gray-700 text-xs text-gray-300 hover:border-indigo-500 hover:text-white disabled:opacity-60">
      {state === "busy" ? "…" : state === "done" ? `✓ ${msg}` : state === "error" ? `Retry (${msg})` : `Target all ${w.cards}`}
    </button>
  );
}

// The list of every window that's open or about to be.
export default function BuyWindowsPanel({ sets }: { sets: SetWindows[] }) {
  const [incSoon, setIncSoon] = useState(true);
  const [grade, setGrade] = useState<string>("");
  const rows = sets
    .flatMap((s) => s.windows.map((w) => ({ s, w })))
    .filter(({ w }) => (w.action === "buy" || w.action === "watch_only" || (incSoon && soon(w))) && (!grade || w.grade === grade))
    .sort((a, b) => rank(a.w) - rank(b.w) || (a.w.months_to_window ?? 0) - (b.w.months_to_window ?? 0));

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center justify-end gap-3 mb-3 text-xs">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {([["", "All grades"], ["raw", "Raw"], ["psa-10", "PSA 10"], ["cgc-10", "CGC 10"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setGrade(k)}
              className={`px-2 py-0.5 ${grade === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-gray-400">
          <input type="checkbox" checked={incSoon} onChange={(e) => setIncSoon(e.target.checked)} className="accent-indigo-500" />
          Include windows opening within 3 months
        </label>
      </div>
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
                    <div className="text-[11px] text-gray-500">month {Math.floor(s.months_since_release)}{s.in_print ? "" : " · out of print"}</div>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{TIER_LABEL[w.tier] ?? w.tier} <span className="text-gray-500">· {w.cards}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{WGRADE_LABEL[w.grade]}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span className={`px-1.5 rounded border text-[11px] ${windowStyle(w)}`}>{actionLabel(w)}</span>{" "}
                    <span className="text-gray-400 text-xs">months {w.from}–{w.to}{w.provisional ? "*" : ""}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{w.to_bottom < -0.005 ? pct(w.to_bottom) : "—"}</td>
                  <td className="py-1.5 px-2 text-xs text-gray-400 max-w-md">{w.headline}</td>
                  <td className="py-1.5 pl-2 text-right"><WatchTierButton set={s} w={w} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
