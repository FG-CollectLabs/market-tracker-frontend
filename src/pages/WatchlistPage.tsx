import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BUY_TARGETS, HIT_REASONS, clearHitReview, fetchWatchlist, putTargets, reviewHit, unwatchCard, type BuyTarget, type TargetHit, type WatchItem, type WatchIntent, type WatchTarget } from "../lib/api";
import { useSession } from "../lib/auth";
import { STANCE } from "../components/BuyingGuide";
import { CardPrepButtons, PresetBar, TARGET_LABEL, TargetEditor, usePresets } from "../components/WatchTargets";
import { cardThumb } from "../lib/thumb";
import { Spinner, ErrorMsg } from "../components/Spinner";
import WatchSuggestions from "../components/WatchSuggestions";
import { watchChanged } from "../components/WatchButton";

const usd = (c?: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const INTENT_LABEL: Record<WatchIntent, string> = { grade: "Grade", invest: "Invest", flip: "Flip", watch: "Watch" };
const sel = "bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200";

const endsIn = (iso?: string) => {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 36e5;
  if (h <= 0) return "ending";
  return h < 48 ? `${Math.round(h)}h left` : `${Math.round(h / 24)}d left`;
};

// The buy list, by set, with each card's buy targets and the live listings
// under them. Prints cleanly (Ctrl+P / the Print button).
export default function WatchlistPage() {
  const session = useSession();
  const presets = usePresets();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<WatchIntent | "">("");
  const [target, setTarget] = useState<BuyTarget | "" | "none" | "unpriced">("");
  const [preset, setPreset] = useState("");
  const [setCode, setSetCode] = useState("");
  const [onlyHits, setOnlyHits] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeErr, setRemoveErr] = useState<{ key: string; msg: string } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPassed, setShowPassed] = useState(false);
  const [noteEditing, setNoteEditing] = useState<Record<string, boolean>>({});
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [asideReason, setAsideReason] = useState<Record<string, string>>({});
  const [undoHit, setUndoHit] = useState<{ source: string; listing_id: string; display_key: string } | null>(null);
  const [hitErrors, setHitErrors] = useState<Record<string, string>>({});

  const load = useCallback((passed?: boolean) => {
    fetchWatchlist(false, passed ?? showPassed).then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, [showPassed]);
  useEffect(() => {
    if (session) load();
  }, [session, load]);

  // Run one action on every selected card, one at a time; a failure doesn't
  // stop the rest. The confirm says when some selected cards aren't shown by
  // the current filters (selected before a filter changed).
  const runBulk = async (doing: string, done: string, note: string, act: (key: string) => Promise<unknown>) => {
    const list = [...picked];
    const shownKeys = new Set(filtered.map((i) => i.display_key));
    const hidden = list.filter((k) => !shownKeys.has(k)).length;
    const verb = doing === "Removing" ? "Remove" : "Clear strategies on";
    if (!window.confirm(`${verb} ${list.length} cards${hidden ? ` (${hidden} not shown by the current filters)` : ""}? ${note}`)) return;
    setBulkRunning(true);
    setBulkResult(null);
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBulkProgress(`${doing} ${i + 1} / ${list.length}…`);
      try {
        await act(list[i]);
      } catch {
        failed.push(items?.find((it) => it.display_key === list[i])?.name ?? list[i]);
      }
    }
    watchChanged();
    setPicked(new Set());
    load();
    setBulkRunning(false);
    setBulkProgress(null);
    setBulkResult(failed.length === 0
      ? { ok: true, text: `${done} ${list.length}` }
      : { ok: false, text: `${done} ${list.length - failed.length}; ${failed.length} failed: ${failed.join(", ")}` });
  };

  // Targets a card keeps under the target / strategy filters.
  const shownTargets = useCallback((it: WatchItem): WatchTarget[] => {
    let ts = it.targets_detail ?? [];
    if (target && target !== "none" && target !== "unpriced") ts = ts.filter((t) => t.target === target);
    if (target === "unpriced") ts = ts.filter((t) => t.max_cents == null);
    if (preset) ts = ts.filter((t) => (preset === "custom" ? !t.preset : t.preset === preset));
    return ts;
  }, [target, preset]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (intent && it.intent !== intent) return false;
      if (setCode && it.set_code !== setCode) return false;
      if (needle && !`${it.name} ${it.number} ${it.set_name}`.toLowerCase().includes(needle)) return false;
      const all = it.targets_detail ?? [];
      if (target === "none") return all.length === 0;
      const ts = shownTargets(it);
      if ((target || preset) && ts.length === 0) return false;
      if (onlyHits && !ts.some((t) => (t.hits ?? []).length > 0)) return false;
      return true;
    });
  }, [items, intent, setCode, q, target, preset, onlyHits, shownTargets]);

  const bySet = useMemo(() => {
    const m = new Map<string, { name: string; code: string; items: WatchItem[] }>();
    for (const it of filtered) {
      const g = m.get(it.set_code) ?? { name: it.set_name, code: it.set_code, items: [] };
      g.items.push(it);
      m.set(it.set_code, g);
    }
    return [...m.values()];
  }, [filtered]);

  // Every live listing at or under a target price, best discount first.
  const hits = useMemo(() => {
    const out: { it: WatchItem; t: WatchTarget; h: TargetHit; under: number }[] = [];
    for (const it of filtered)
      for (const t of shownTargets(it))
        for (const h of t.hits ?? []) out.push({ it, t, h, under: h.max_cents ? 1 - h.all_in_cents / h.max_cents : 0 }); // each hit's max is for its own grade
    return out.sort((a, b) => b.under - a.under);
  }, [filtered, shownTargets]);

  const bestHits = useMemo(() => hits.slice(0, 8), [hits]);

  const sets = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items ?? []) m.set(it.set_code, it.set_name);
    return [...m.entries()];
  }, [items]);
  const targetCount = (k: BuyTarget) => (items ?? []).filter((it) => it.targets?.includes(k)).length;

  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your watchlist.</p>;
  if (error) return <ErrorMsg msg={error} />;
  if (!items) return <Spinner />;

  const toggle = (k: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  // Not a hook: this runs after the early returns above, and hooks there
  // would change the hook count between renders (React throws).
  const removeCard = async (it: WatchItem) => {
    if (!window.confirm(`Remove ${it.name} from the watchlist? Its buy targets are removed too.`)) return;
    setRemoving(it.display_key);
    setRemoveErr(null);
    try {
      await unwatchCard(it.display_key);
      watchChanged();
      setPicked((s) => { const n = new Set(s); n.delete(it.display_key); return n; });
      load();
    } catch (e) {
      setRemoveErr({ key: it.display_key, msg: (e as Error).message });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5 print:space-y-3 print:text-black">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white print:text-black">Watchlist</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {items.length} cards. Each card's buy targets say which grades to buy and at what price;
            hits are live listings at or under it (auction bids counted with the buyer's premium). Printed {new Date().toLocaleDateString()}.
          </p>
        </div>
        <button onClick={() => window.print()} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500 print:hidden">Print</button>
      </div>

      <WatchSuggestions onAccepted={load} />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} className={sel}>
          <option value="">Every target</option>
          {BUY_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label} ({targetCount(t.key)})</option>)}
          <option value="unpriced">Targets without a price</option>
          <option value="none">No targets yet</option>
        </select>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={sel}>
          <option value="">Every strategy</option>
          {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="custom">Custom (no preset)</option>
        </select>
        <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className={sel}>
          <option value="">Every set</option>
          {sets.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <select value={intent} onChange={(e) => setIntent(e.target.value as WatchIntent | "")} className={sel}>
          <option value="">Every intent</option>
          {(Object.keys(INTENT_LABEL) as WatchIntent[]).map((k) => <option key={k} value={k}>{INTENT_LABEL[k]}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards" className={`${sel} w-44`} />
        <label className="flex items-center gap-1 text-sm text-gray-300">
          <input type="checkbox" className="accent-indigo-500" checked={onlyHits} onChange={(e) => setOnlyHits(e.target.checked)} /> Only cards with hits
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={filtered.length > 0 && filtered.every((i) => picked.has(i.display_key))}
            onChange={(e) => {
              if (e.target.checked) setPicked(new Set(filtered.map((i) => i.display_key)));
              else setPicked(new Set());
            }}
          />
          {filtered.length > 0 && filtered.every((i) => picked.has(i.display_key)) ? "Clear selection" : `Select all ${filtered.length} shown`}
        </label>
      </div>

      <PresetBar keys={[...picked]} onClear={() => setPicked(new Set())} onApplied={load}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={picked.size === 0 || bulkRunning}
              onClick={() => runBulk("Removing", "Removed", "Their strategies are removed too.", unwatchCard)}
              className="text-xs px-2 py-1 rounded bg-red-800/60 text-red-200 hover:bg-red-800 border border-red-700/40 disabled:opacity-40 disabled:cursor-default"
            >
              Remove {picked.size} from watchlist
            </button>
            <button
              disabled={picked.size === 0 || bulkRunning}
              onClick={() => runBulk("Clearing", "Cleared strategies on", "Keeps the cards watched, with no strategies.", (k) => putTargets(k, []))}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 disabled:cursor-default"
            >
              Clear strategies
            </button>
          </div>
        }
      />

      {bulkProgress && <div className="text-xs text-gray-400 print:hidden">{bulkProgress}</div>}
      {bulkResult && <div className={`text-xs print:hidden ${bulkResult.ok ? "text-green-300" : "text-amber-300"}`}>{bulkResult.text}</div>}

      <section className="rounded-lg border border-green-900/60 bg-gray-900 p-3 break-inside-avoid print:border-gray-300 print:bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-green-300 print:text-black">
            Best hits <span className="font-normal text-gray-500">{bestHits.length} of {hits.length} listings most under their max</span>
          </h2>
          <button
            onClick={() => { const next = !showPassed; setShowPassed(next); load(next); }}
            className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white print:hidden"
          >
            {showPassed ? "Hide set-aside" : `Show set-aside (${filtered.reduce((sum, it) => sum + (it.targets_detail ?? []).reduce((s, t) => s + (t.passed_hits ?? 0), 0), 0)})`}
          </button>
        </div>
        {bestHits.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing listed under your prices right now. Targets without a price rule never hit; give them one.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {bestHits.map(({ it, h, under }, i) => (
              <button key={i} onClick={() => setExpanded((s) => { const n = new Set(s); n.has(it.display_key) ? n.delete(it.display_key) : n.add(it.display_key); return n; })} className="text-left rounded border border-gray-800 bg-gray-950 p-2 hover:border-indigo-500 hover:bg-gray-900 transition-colors print:hidden">
                <div className="flex gap-2 items-start">
                  <img src={h.image_url ? cardThumb(h.image_url) : undefined} alt="" className="w-10 h-14 object-cover rounded-sm shrink-0 bg-gray-800" />
                  <div className="min-w-0">
                    <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-xs font-semibold text-gray-100 hover:text-indigo-300 block truncate">{it.name}</Link>
                    <div className="text-[10px] text-gray-500">{h.source === "fanatics" ? "Fanatics" : "eBay"} · {h.kind === "auction" ? "auction" : "Buy Now"} · {h.grade_key.toUpperCase()}</div>
                    <div className="text-[10px] text-gray-300 mt-0.5">{usd(h.all_in_cents)} / max {usd(h.max_cents)} · <span className="text-green-300">{Math.round(under * 100)}% under</span></div>
                  </div>
                </div>
                <div className="text-[10px] text-amber-300/80 mt-1">{expanded.has(it.display_key) ? "Click to close" : "Click to expand"}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {items.length === 0 && <p className="text-sm text-gray-500">Star cards on a set page or a card page to add them, or tick several on a set page and apply a strategy.</p>}
      {bySet.map((g) => (
        <section key={g.code} className="rounded-lg border border-gray-800 bg-gray-900 p-3 break-inside-avoid print:border-gray-300 print:bg-white">
          <h2 className="text-sm font-semibold text-gray-100 print:text-black mb-2">
            {g.name} <span className="text-gray-500 font-mono text-xs">{g.code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</span>
          </h2>
          <div className="overflow-x-auto lg:overflow-visible">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-gray-500">
              <tr>
                <th className="w-5 print:hidden sticky top-12 bg-gray-900 z-10 print:static">
                  <input type="checkbox" className="accent-indigo-500" title="Select this set's cards"
                    checked={g.items.every((it) => picked.has(it.display_key))}
                    onChange={(e) => setPicked((s) => {
                      const n = new Set(s);
                      g.items.forEach((it) => (e.target.checked ? n.add(it.display_key) : n.delete(it.display_key)));
                      return n;
                    })} />
                </th>
                <th className="text-left py-1 pr-2 font-medium sticky top-12 left-0 bg-gray-900 z-20 print:static" colSpan={2}>Card</th>
                <th className="text-left py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Buy targets</th>
                <th className="text-left py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Play</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Raw now</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="Expected raw low (release curve)">Exp. low</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="Most to pay raw to grade (your return bar)">Grade ≤</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="Grading nets $0 at this raw price: never pay more">Break-even</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">PSA 10</th>
                <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="PSA 10 auction ceiling (hammer)">10 bid ≤</th>
                <th className="text-right py-1 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="Similar cards' yearly appreciation after fees (PSA 10)">Held/yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 print:divide-gray-200 text-gray-300 print:text-black">
              {g.items.map((it) => {
                const p = it.play;
                const over = p?.raw_cents != null && p.break_even_cents != null && p.raw_cents >= p.break_even_cents;
                const ts = shownTargets(it);
                return (
                  <Fragment key={it.display_key}>
                    <tr className="align-top">
                      <td className="py-1.5 print:hidden">
                        <input type="checkbox" className="accent-indigo-500" checked={picked.has(it.display_key)} onChange={() => toggle(it.display_key)} />
                      </td>
                      <td className="py-1.5 pr-2 w-9 sticky left-0 bg-gray-900 z-10 print:static">
                        {it.image_url && <img src={cardThumb(it.image_url)} alt="" className="w-8 h-11 object-cover rounded-sm print:hidden" loading="lazy" />}
                      </td>
                      <td className="py-1.5 pr-2 sticky left-9 bg-gray-900 z-10 print:static">
                        <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-gray-100 hover:text-indigo-300 print:text-black">{it.name}</Link>
                        <div className="text-gray-500">#{it.number} · {INTENT_LABEL[it.intent]}</div>
                        <div className="mt-0.5"><CardPrepButtons displayKey={it.display_key} /></div>
                        {it.note && <div className="text-gray-400 italic">{it.note}</div>}
                      </td>
                      <td className="py-1.5 pr-2 min-w-[16rem]">
                        {ts.length === 0 && <span className="text-gray-600">Watching only</span>}
                        <div className="flex flex-wrap gap-1 items-center">
                          {ts.map((t) => (
                            <button
                              key={t.target}
                              onClick={() => setExpanded((s) => { const n = new Set(s); n.has(it.display_key) ? n.delete(it.display_key) : n.add(it.display_key); return n; })}
                              title={t.gate ? t.gate : t.rule_text}
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] ${t.gate ? "bg-amber-900/40 text-amber-200 border border-amber-700/40" : "bg-gray-950 border border-gray-700 text-gray-200 hover:border-indigo-400 hover:text-white"} print:hidden`}
                            >
                              <span className="font-medium">{TARGET_LABEL[t.target]}</span>
                              {t.gate ? <span>paused</span> : t.max_cents != null ? <span className="text-yellow-300/90">≤ {usd(t.max_cents)}</span> : <span className="text-gray-500">no price</span>}
                            </button>
                          ))}
                          {(ts.some((t) => (t.hits?.length ?? 0) > 0) || ts.length === 0) && (
                            <span className={`text-[10px] px-1 rounded ${ts.some((t) => (t.hits?.length ?? 0) > 0) ? "bg-green-900/60 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                              {ts.reduce((sum, t) => sum + (t.hits?.length ?? 0), 0)} listings
                            </span>
                          )}
                        </div>
                        <button onClick={() => setEditing(editing === it.display_key ? null : it.display_key)}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 print:hidden">
                          {editing === it.display_key ? "Close" : "Edit targets"}
                        </button>
                        <button onClick={() => removeCard(it)}
                          disabled={removing === it.display_key}
                          className="ml-2 text-xs text-gray-500 hover:text-red-400 print:hidden">
                          Remove
                        </button>
                        {removeErr?.key === it.display_key && (
                          <div className="text-red-400 text-[11px] mt-1">{removeErr.msg}</div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 max-w-xs">
                        {p && <span className={`px-1 rounded border text-[10px] mr-1 ${STANCE[p.stance].cls}`}>{STANCE[p.stance].label}</span>}
                        <span className="text-gray-400 print:text-black">{p?.headline}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{usd(p?.raw_cents)}</td>
                      <td className="py-1.5 pr-2 text-right">{usd(p?.bottom_cents)}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{usd(p?.target_cents)}</td>
                      <td className={`py-1.5 pr-2 text-right ${over ? "text-red-400" : ""}`}>{usd(p?.break_even_cents)}</td>
                      <td className="py-1.5 pr-2 text-right">{usd(it.psa10_cents)}</td>
                      <td className="py-1.5 pr-2 text-right">{usd(p?.bid_cents)}</td>
                      <td className="py-1.5 text-right">{p?.projection != null ? `${p.projection >= 0 ? "+" : ""}${Math.round(p.projection * 100)}%` : "—"}</td>
                    </tr>
                    {editing === it.display_key && (
                      <tr className="print:hidden">
                        <td colSpan={12} className="py-2">
                          <TargetEditor displayKey={it.display_key} initial={it.targets_detail ?? []} onSaved={load} onClose={() => setEditing(null)} />
                        </td>
                      </tr>
                    )}
                    {expanded.has(it.display_key) && (
                      <tr className="print:hidden">
                        <td colSpan={12} className="py-2 bg-gray-850">
                          <div className="rounded-lg border border-gray-700 bg-gray-900 p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-semibold text-gray-200">This card's listings</h3>
                              <button onClick={() => setExpanded((s) => { const n = new Set(s); n.delete(it.display_key); return n; })} className="text-xs text-gray-400 hover:text-white">Close</button>
                            </div>
                            <div className="divide-y divide-gray-800">
                              {(it.targets_detail ?? []).flatMap((t) => (t.hits ?? []).map((h) => ({ ...h, target: t, it }))).sort((a, b) => (b.max_cents ? 1 - b.all_in_cents / b.max_cents : 0) - (a.max_cents ? 1 - a.all_in_cents / a.max_cents : 0)).map((h, idx) => (
                                <div key={idx} className="py-2 text-xs flex items-start gap-2">
                                  <img src={h.image_url ? cardThumb(h.image_url) : undefined} alt="" className="w-12 h-16 object-cover rounded-sm shrink-0 bg-gray-800" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1 text-[11px]">
                                      <span className="text-[10px] px-1 rounded bg-gray-800 text-gray-300">{h.source === "fanatics" ? "Fanatics" : "eBay"}</span>
                                      <span className={`text-[10px] px-1 rounded ${h.kind === "auction" ? "bg-amber-900/40 text-amber-200" : "bg-emerald-900/40 text-emerald-200"}`}>{h.kind === "auction" ? `auction${h.ends_at ? ` · ${endsIn(h.ends_at)}` : ""}` : "Buy Now"}</span>
                                      <span className="text-gray-500">· {h.grade_key.toUpperCase()}</span>
                                    </div>
                                    <a href={h.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 text-xs block truncate">{h.title}</a>
                                     <div className="text-[11px] text-gray-400 mt-0.5">
                                       {usd(h.price_cents)} price · {usd(h.all_in_cents)} all-in · max {usd(h.max_cents)} · <span className="text-green-300">{Math.round((h.max_cents ? 1 - h.all_in_cents / h.max_cents : 0) * 100)}% under</span>
                                     </div>
                                     {h.kind === "auction" && (
                                       <div className="text-[10px] text-gray-500 mt-0.5">
                                         {h.bids != null ? `${h.bids} bid${h.bids === 1 ? "" : "s"}` : "No bids"} · ends in {endsIn(h.ends_at) || "—"}
                                       </div>
                                     )}
                                     <div className="flex gap-1 mt-1 print:hidden">
                                        <button
                                          onClick={() => {
                                            const hitKey = `${h.source}:${h.listing_id}`;
                                            const choice = window.prompt(`Set aside reason (Not this card / Damaged / Wrong variant / Not interested / Other) or note:`);
                                            if (!choice) return;
                                            const matched = HIT_REASONS.find((r) => r.label.toLowerCase().includes(choice.toLowerCase()) || r.key === choice);
                                            const reason = matched ? matched.key : choice;
                                            setAsideReason({ ...asideReason, [hitKey]: reason });
                                            reviewHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key, status: "pass", reason: reason as any, price_cents: h.all_in_cents }).then(() => load()).catch((e) => setHitErrors({ ...hitErrors, [hitKey]: (e as Error).message }));
                                          }}
                                         className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
                                       >Set aside ▾</button>
                                        {!noteEditing[`${h.source}:${h.listing_id}`] && (
                                          <button onClick={() => { setNoteEditing({ ...noteEditing, [`${h.source}:${h.listing_id}`]: true }); setNoteText({ ...noteText, [`${h.source}:${h.listing_id}`]: h.review?.note ?? "" }); }} className="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 text-amber-200 hover:text-amber-100">Note</button>
                                        )}
                                     </div>
                                      {noteEditing[`${h.source}:${h.listing_id}`] && (
                                        <div className="flex gap-1 mt-1 print:hidden">
                                          <input
                                            autoFocus
                                            value={noteText[`${h.source}:${h.listing_id}`] ?? ""}
                                            onChange={(e) => setNoteText({ ...noteText, [`${h.source}:${h.listing_id}`]: e.target.value })}
                                            maxLength={2000}
                                            className="w-full text-[11px] bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
                                          />
                                          <button onClick={async () => {
                                            const text = (noteText[`${h.source}:${h.listing_id}`] ?? "").trim();
                                            const hitKeyStr = `${h.source}:${h.listing_id}`;
                                            try {
                                              if (text) {
                                                await reviewHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key, status: "note", note: text, price_cents: h.all_in_cents });
                                              } else {
                                                await clearHitReview(h.source, h.listing_id);
                                              }
                                              setNoteEditing({ ...noteEditing, [`${h.source}:${h.listing_id}`]: false });
                                              load();
                                            } catch (e) {
                                              setHitErrors({ ...hitErrors, [hitKeyStr]: (e as Error).message });
                                            }
                                          }} className="text-[10px] px-1 rounded bg-indigo-600 text-white hover:bg-indigo-500">Save</button>
                                          <button onClick={() => setNoteEditing({ ...noteEditing, [`${h.source}:${h.listing_id}`]: false })} className="text-[10px] px-1 rounded text-gray-400 hover:text-gray-200">Cancel</button>
                                        </div>
                                      )}
                                     {h.review?.status === "pass" && (
                                       <div className="text-[10px] text-amber-200/80 mt-1">
                                         Set aside ({asideReason[`${h.source}:${h.listing_id}`] || "—"}).
                                         <button
                                           onClick={async () => {
                                             const keyStr = `${h.source}:${h.listing_id}`;
                                             try {
                                               await clearHitReview(h.source, h.listing_id);
                                               setUndoHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key });
                                               setTimeout(() => setUndoHit(null), 5000);
                                               load();
                                             } catch (e) {
                                               setHitErrors({ ...hitErrors, [keyStr]: (e as Error).message });
                                             }
                                           }}
                                           className="underline hover:text-white ml-1"
                                         >Restore</button>
                                       </div>
                                     )}
                                     {undoHit && undoHit.source === h.source && undoHit.listing_id === h.listing_id && undoHit.display_key === it.display_key && (
                                       <div className="text-[10px] text-amber-200/80 mt-0.5">
                                         Set aside. <button onClick={async () => {
                                           try {
                                             await clearHitReview(h.source, h.listing_id);
                                             setUndoHit(null);
                                             load();
                                           } catch (e) {
                                             setHitErrors({ ...hitErrors, [`${h.source}:${h.listing_id}`]: (e as Error).message });
                                           }
                                         }} className="underline hover:text-white">Undo</button>
                                       </div>
                                     )}
                                     {hitErrors[`${h.source}:${h.listing_id}`] && <div className="text-[10px] text-red-400 mt-0.5">{hitErrors[`${h.source}:${h.listing_id}`]}</div>}
                                  </div>
                                </div>
                              ))}
                              {it.targets_detail?.flatMap((t) => (t.hits ?? [])).length === 0 && <p className="text-xs text-gray-500">No live listings for this card.</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      ))}
    </div>
  );
}
