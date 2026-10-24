import { useEffect, useState } from "react";
import {
  BUY_TARGETS, RULES_FOR, RULE_KINDS, applyPreset, fetchWatchPresets, putTargets, saveBidPlan, setAutoFanatics,
  type BuyTarget, type Channels, type RuleKind, type WatchPreset, type WatchTarget,
} from "../lib/api";
import { onWatchChange, watchChanged, watchedCards } from "./WatchButton";
import { useSession } from "../lib/auth";

// Watchlist buy strategies: per watched card, each strategy you'd buy it for
// (raw to grade, raw to invest, CGC 10, PSA 10, regrade 9s) and its price
// rule, plus presets you can apply to many cards.

export const TARGET_LABEL = Object.fromEntries(BUY_TARGETS.map((t) => [t.key, t.label])) as Record<BuyTarget, string>;
const CHANNEL_LABEL: Record<Channels, string> = { any: "Auctions + Buy Now", auction: "Auctions only", buy_now: "Buy Now only" };

let presetCache: Promise<WatchPreset[]> | null = null;
export function usePresets(): WatchPreset[] {
  const [p, setP] = useState<WatchPreset[]>([]);
  useEffect(() => {
    presetCache ??= fetchWatchPresets().then((r) => r.presets).catch(() => { presetCache = null; return []; });
    let live = true;
    presetCache.then((x) => live && setP(x));
    return () => { live = false; };
  }, []);
  return p;
}

const input = "bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-200";

// A new strategy's starting rule.
function defaultTarget(t: BuyTarget): WatchTarget {
  const kind = RULES_FOR[t][0];
  return { target: t, rule_kind: kind, rule_value: kind === "pct_market" ? 0.8 : null, buy_all: false, channels: "any" };
}

// Edit one card's buy strategies: all five listed, each switched on or off,
// with its price rule, channels and "every copy".
export function TargetEditor({ displayKey, initial, onSaved, onClose }: {
  displayKey: string; initial: WatchTarget[]; onSaved?: () => void; onClose: () => void;
}) {
  const presets = usePresets();
  const [rows, setRows] = useState<Partial<Record<BuyTarget, WatchTarget>>>(() =>
    Object.fromEntries(initial.map((t) => [t.target, { ...t }])) as Partial<Record<BuyTarget, WatchTarget>>);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: BuyTarget, patch: Partial<WatchTarget>) => setRows((rs) => ({ ...rs, [k]: { ...(rs[k] ?? defaultTarget(k)), ...patch } }));
  const toggle = (k: BuyTarget, on: boolean) => setRows((rs) => {
    const next = { ...rs };
    if (on) next[k] = initial.find((t) => t.target === k) ?? defaultTarget(k);
    else delete next[k];
    return next;
  });
  const addPreset = (p: WatchPreset) => setRows((rs) => {
    const next = { ...rs };
    for (const t of p.targets) next[t.target] = { ...t, rule_value: t.rule_value ?? null, preset: p.key };
    return next;
  });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await putTargets(displayKey, BUY_TARGETS.map((t) => rows[t.key]).filter((t): t is WatchTarget => !!t));
      watchChanged();
      onSaved?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-800/60 bg-gray-950 p-3 space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-gray-500">Presets:</span>
        {presets.map((p) => (
          <button key={p.key} onClick={() => addPreset(p)} title={p.description}
            className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-white">+ {p.label}</button>
        ))}
      </div>
      <div className="divide-y divide-gray-800/80">
        {BUY_TARGETS.map((bt) => {
          const r = rows[bt.key];
          const kinds = RULES_FOR[bt.key];
          return (
            <div key={bt.key} className={`flex flex-wrap items-center gap-2 py-1.5 ${r ? "" : "opacity-60"}`}>
              <label className="flex items-center gap-1.5 w-44 shrink-0 cursor-pointer" title={bt.hint}>
                <input type="checkbox" className="accent-indigo-500" checked={!!r} onChange={(e) => toggle(bt.key, e.target.checked)} />
                <span className="font-medium text-gray-200">{bt.label}</span>
                <span className="text-[10px] text-gray-500">{bt.grades}</span>
              </label>
              {r && (
                <>
                  <select className={input} value={r.rule_kind ?? ""} title={RULE_KINDS.find((k) => k.key === r.rule_kind)?.hint}
                    onChange={(e) => {
                      const k = (e.target.value || null) as RuleKind | null;
                      set(bt.key, { rule_kind: k, rule_value: k === "pct_market" ? 0.8 : k === "fixed" ? r.max_cents ?? null : null });
                    }}>
                    <option value="">No price rule</option>
                    {RULE_KINDS.filter((k) => kinds.includes(k.key)).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                  {r.rule_kind === "pct_market" && (
                    <label className="flex items-center gap-0.5">
                      <input type="number" min={1} max={200} step={5} className={`${input} w-14 text-right`}
                        value={Math.round((r.rule_value ?? 0) * 100)} onChange={(e) => set(bt.key, { rule_value: Number(e.target.value) / 100 })} />%
                    </label>
                  )}
                  {r.rule_kind === "fixed" && (
                    <label className="flex items-center gap-0.5">$
                      <input type="number" min={0} step={1} className={`${input} w-20 text-right`}
                        value={r.rule_value != null ? r.rule_value / 100 : ""} onChange={(e) => set(bt.key, { rule_value: Math.round(Number(e.target.value) * 100) })} />
                    </label>
                  )}
                  <select className={input} value={r.channels} onChange={(e) => set(bt.key, { channels: e.target.value as Channels })}>
                    {(Object.keys(CHANNEL_LABEL) as Channels[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-gray-300" title="Buy every copy at or under the price, not just one">
                    <input type="checkbox" className="accent-indigo-500" checked={r.buy_all} onChange={(e) => set(bt.key, { buy_all: e.target.checked })} /> every copy
                  </label>
                  {r.preset && <span className="text-[10px] text-indigo-300/80">{presets.find((p) => p.key === r.preset)?.label ?? r.preset}</span>}
                  {r.rule_text && <span className="text-gray-500 basis-full pl-6">now: {r.rule_text}</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-gray-500">Each copy is priced against its own grade's market: a PSA 8 against PSA 8 sales.</span>
        <span className="flex-1" />
        {err && <span className="text-red-400">{err}</span>}
        <button onClick={onClose} className="px-2 py-1 rounded text-gray-400 hover:text-gray-200">Cancel</button>
        <button onClick={save} disabled={busy} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Apply a preset to a selection of cards (set page, watchlist).
export function PresetBar({ keys, onClear, onApplied, extra }: {
  keys: string[]; onClear: () => void; onApplied?: () => void; extra?: React.ReactNode;
}) {
  const presets = usePresets();
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (keys.length === 0 && !msg) return null;
  const apply = async () => {
    if (!preset) return;
    setBusy(true);
    try {
      const r = await applyPreset(keys, preset);
      setMsg(`${presets.find((p) => p.key === preset)?.label}: set on ${r.cards} cards (${r.newly_watched} newly watched)`);
      watchChanged();
      onApplied?.();
      onClear();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-800/60 bg-gray-950/95 px-3 py-2 text-sm shadow-lg backdrop-blur print:hidden">
      {keys.length > 0 ? (
        <>
          <span className="text-gray-200">{keys.length} selected</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
            <option value="">Choose a strategy…</option>
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button onClick={apply} disabled={!preset || busy} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? "Applying…" : "Watch with this strategy"}
          </button>
          {preset && <span className="text-xs text-gray-500">{presets.find((p) => p.key === preset)?.description}</span>}
          {extra}
          <button onClick={onClear} className="ml-auto text-xs text-gray-400 hover:text-gray-200">Clear selection</button>
        </>
      ) : (
        <>
          <span className="text-green-300 text-xs">{msg}</span>
          <button onClick={() => setMsg(null)} className="ml-auto text-xs text-gray-500 hover:text-gray-300">✕</button>
        </>
      )}
    </div>
  );
}

// Two quick actions on a card: "any Fanatics copy" (auto-prep adds every
// live Fanatics auction of it, any grade; watches the card) and "singles"
// (onto the Singles / card show list to look at and pre-grade in person).
export function CardPrepButtons({ displayKey }: { displayKey: string }) {
  const session = useSession();
  const [anyCopy, setAnyCopy] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState<"idle" | "done" | "error">("idle");
  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () => watchedCards().then((m) => live && setAnyCopy(!!m.get(displayKey)?.autoFanatics));
    load();
    const off = onWatchChange(load);
    return () => { live = false; off(); };
  }, [session, displayKey]);
  if (!session || anyCopy == null) return null;
  const btn = "px-1 rounded border text-[10px] leading-4 print:hidden";
  return (
    <span className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button disabled={busy} title={anyCopy ? "Any Fanatics copy: on. Auto-prep adds every live Fanatics auction of this card, any grade. Click to turn off." : "Any Fanatics copy: auto-prep adds every live Fanatics auction of this card, any grade, to Buying prep (and watches the card)."}
        onClick={async () => {
          setBusy(true);
          try {
            await setAutoFanatics(displayKey, !anyCopy);
            setAnyCopy(!anyCopy);
            watchChanged();
          } finally {
            setBusy(false);
          }
        }}
        className={`${btn} ${anyCopy ? "bg-indigo-800 text-white border-indigo-500 font-semibold" : "border-gray-700/60 text-gray-500 hover:text-gray-200"}`}>
        {anyCopy ? "✓ " : ""}Any Fanatics
      </button>
      <button title={single === "done" ? "On your Singles / card show list" : "Add to the Singles / card show list: look at it and pre-grade it when you see it raw"}
        onClick={() => saveBidPlan({ display_key: displayKey, grade: "raw", kind: "single" }).then(() => setSingle("done")).catch(() => setSingle("error"))}
        className={`${btn} ${single === "done" ? "bg-emerald-900/70 text-emerald-200 border-emerald-700" : single === "error" ? "border-red-700 text-red-300" : "border-gray-700/60 text-gray-500 hover:text-gray-200"}`}>
        {single === "done" ? "✓ Singles" : "+ Singles"}
      </button>
    </span>
  );
}
