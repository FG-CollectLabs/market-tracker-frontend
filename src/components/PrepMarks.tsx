import { useEffect, useState } from "react";
import { fetchBidPlans, saveBidPlan, type PlanKind } from "../lib/api";
import { onWatchChange, watchedCards } from "./WatchButton";
import { useSession } from "../lib/auth";
import { formatCents } from "../lib/roi";

// Buying prep marks for the Deals tabs: what's already on this Sunday's
// lists (and the watchlist), shown as a tinted row and tags under the card,
// and a bar to put a handful of selected rows on a list in one go.

export type PrepKind = "auction" | "min_bid" | "lowball";
export type PrepEntry = { kind: PrepKind; grade: string; max?: number; origin?: string; status: string };

export const PREP: Record<PrepKind | "watch", { label: string; chip: string; row: string }> = {
  auction: { label: "Late bids", chip: "bg-indigo-900/70 text-indigo-200 border-indigo-700/60", row: "border-l-indigo-500 bg-indigo-950/40" },
  min_bid: { label: "Early bids", chip: "bg-amber-900/60 text-amber-200 border-amber-700/60", row: "border-l-amber-500 bg-amber-950/30" },
  lowball: { label: "Lowball", chip: "bg-teal-900/60 text-teal-200 border-teal-700/60", row: "border-l-teal-500 bg-teal-950/30" },
  watch: { label: "Watchlist", chip: "bg-yellow-900/40 text-yellow-200 border-yellow-700/50", row: "border-l-yellow-500" },
};

const GRADE: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine", "cgc-9": "CGC 9" };
const gradeLabel = (g: string) => GRADE[g] ?? g.toUpperCase().replace("-", " ");

export function usePrepMarks() {
  const session = useSession();
  const [plans, setPlans] = useState<Map<string, PrepEntry[]>>(new Map());
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    let live = true;
    Promise.all((["auction", "min_bid"] as PlanKind[]).map((k) => fetchBidPlans(undefined, k).catch(() => null))).then((rs) => {
      if (!live) return;
      const m = new Map<string, PrepEntry[]>();
      for (const r of rs) {
        if (!r) continue;
        setDay(r.auction_date);
        for (const p of r.plans) {
          if (p.status === "skipped") continue;
          const e: PrepEntry = { kind: r.kind as PrepKind, grade: p.grade, max: p.max_bid_cents, origin: p.origin, status: p.status };
          m.set(p.display_key, [...(m.get(p.display_key) ?? []), e]);
        }
      }
      setPlans(m);
    });
    return () => { live = false; };
  }, [session, tick]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () => watchedCards().then((m) => live && setWatched(new Set(m.keys())));
    load();
    const off = onWatchChange(load);
    return () => { live = false; off(); };
  }, [session]);
  const entries = (displayKey: string) => plans.get(displayKey) ?? [];
  const inPrep = (displayKey: string, grade: string) => entries(displayKey).some((e) => e.grade === grade);
  return { plans, watched, day, entries, inPrep, reload: () => setTick((t) => t + 1), on: !!session };
}

// Row style: tinted with the list's colour when this grade is in prep, a grey
// edge when another grade of the card is, yellow when only watched.
export function prepRowClass(entries: PrepEntry[], watched: boolean, grade: string): string {
  const same = entries.find((e) => e.grade === grade);
  if (same) return `border-l-4 ${PREP[same.kind].row}`;
  if (entries.length) return "border-l-4 border-l-gray-600";
  if (watched) return `border-l-4 ${PREP.watch.row}`;
  return "border-l-4 border-l-transparent";
}

// Tags under the card name: the lists it's on (grade shown when it differs
// from the row's).
export function PrepTags({ entries, watched, grade }: { entries: PrepEntry[]; watched: boolean; grade: string }) {
  if (!entries.length && !watched) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {entries.map((e, i) => (
        <span key={i} className={`px-1 rounded border text-[10px] leading-4 ${PREP[e.kind].chip} ${e.grade !== grade ? "opacity-70" : ""}`}
          title={`On this Sunday's ${PREP[e.kind].label} list${e.origin === "auto" ? " (added by auto-prep)" : ""} · ${e.status}${e.max != null ? ` · your max ${formatCents(e.max)}` : " · no max yet"}`}>
          {e.grade === grade ? "✓ " : ""}{PREP[e.kind].label}{e.grade !== grade ? ` · ${gradeLabel(e.grade)}` : ""}{e.max != null ? ` · ${formatCents(e.max)}` : ""}{e.origin === "auto" ? " · auto" : ""}
        </span>
      ))}
      {watched && <span className={`px-1 rounded border text-[10px] leading-4 ${PREP.watch.chip}`} title="On your watchlist">★ Watchlist</span>}
    </div>
  );
}

// The colour key, for above a table.
export function PrepLegend({ day }: { day: string | null }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
      {(["auction", "min_bid", "watch"] as const).map((k) => (
        <span key={k} className={`px-1 rounded border ${PREP[k].chip}`}>{k === "watch" ? "★ " : "✓ "}{PREP[k].label}</span>
      ))}
      <span>= tinted rows are on that list{day ? ` (Sunday ${day})` : ""}; grey edge = a different grade of the card is</span>
    </span>
  );
}

export interface PrepPick { display_key: string; grade: string; name: string; max_cents?: number | null }

// A row's checkbox. Clicks don't reach the row (rows often open a detail).
export function PickBox({ checked, onChange, disabled, title }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <input type="checkbox" checked={checked} disabled={disabled} title={title} onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.checked)} className="accent-indigo-500 disabled:opacity-30 print:hidden" />
  );
}

// Put the picked rows on this Sunday's late- or early-bid list, each with
// its suggested max (whole dollars). Rows already on a list in that grade are
// skipped, so a max you've set isn't overwritten.
export function PrepSelectBar({ picks, inPrep, onClear, onDone, maxLabel }: {
  picks: PrepPick[]; inPrep: (displayKey: string, grade: string) => boolean;
  onClear: () => void; onDone: () => void; maxLabel: string;
}) {
  const [kind, setKind] = useState<PlanKind>("auction");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (picks.length === 0 && !msg) return null;
  const add = async () => {
    setBusy(true);
    setMsg(null);
    let added = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const p of picks) {
      if (inPrep(p.display_key, p.grade)) {
        skipped++;
        continue;
      }
      try {
        await saveBidPlan({ display_key: p.display_key, grade: p.grade, kind,
          max_bid_cents: p.max_cents != null && p.max_cents > 0 ? Math.floor(p.max_cents / 100) * 100 : undefined });
        added++;
      } catch (e) {
        failed.push(`${p.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    const label = kind === "auction" ? "Late bids" : "Early bids";
    setMsg({ ok: failed.length === 0,
      text: `Added ${added} to ${label}${skipped ? `; ${skipped} already in prep (left as they are)` : ""}${failed.length ? `; failed: ${failed.join("; ")}` : ""}` });
    onDone();
    if (failed.length === 0) onClear();
  };
  return (
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-800/60 bg-gray-950/95 px-3 py-2 text-sm shadow-lg backdrop-blur print:hidden">
      {picks.length > 0 ? (
        <>
          <span className="text-gray-200">{picks.length} selected</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as PlanKind)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
            title="Late bids: set a max and bid near the close. Early bids: cheap cards bid now at a small max, hoping nobody pays more.">
            <option value="auction">Late bids (near the close)</option>
            <option value="min_bid">Early bids (bid now)</option>
          </select>
          <button onClick={add} disabled={busy} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? "Adding…" : `Add ${picks.length} to Buying prep`}
          </button>
          <span className="text-xs text-gray-500">max bid = {maxLabel} (edit it in Buying prep)</span>
          {msg && <span className={`text-xs ${msg.ok ? "text-green-300" : "text-red-300"}`}>{msg.text}</span>}
          <button onClick={onClear} className="ml-auto text-xs text-gray-400 hover:text-gray-200">Clear selection</button>
        </>
      ) : msg && (
        <>
          <span className={`text-xs ${msg.ok ? "text-green-300" : "text-red-300"}`}>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="ml-auto text-xs text-gray-500 hover:text-gray-300">✕</button>
        </>
      )}
    </div>
  );
}

// Selection state keyed by card + grade.
export function usePicks() {
  const [picks, setPicks] = useState<Map<string, PrepPick>>(new Map());
  const key = (p: { display_key: string; grade: string }) => `${p.display_key}|${p.grade}`;
  return {
    list: [...picks.values()],
    has: (p: { display_key: string; grade: string }) => picks.has(key(p)),
    toggle: (p: PrepPick, on: boolean) => setPicks((m) => {
      const n = new Map(m);
      if (on) n.set(key(p), p);
      else n.delete(key(p));
      return n;
    }),
    setAll: (ps: PrepPick[]) => setPicks(new Map(ps.map((p) => [key(p), p]))),
    clear: () => setPicks(new Map()),
  };
}
