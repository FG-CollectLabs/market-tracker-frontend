import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BUY_TARGETS, clearHitReview, fetchWatchlist, reviewHit, unwatchCard, type BuyTarget, type TargetHit, type WatchItem, type WatchIntent, type WatchTarget } from "../lib/api";
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
  const [hitKind, setHitKind] = useState<"all" | "auction" | "buy_now">("all");
  const [hitSource, setHitSource] = useState<"all" | "fanatics" | "ebay">("all");
  const [hitSort, setHitSort] = useState<"under" | "ending" | "cheapest">("under");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const [noteEditing, setNoteEditing] = useState<Record<string, string>>({});
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [undoHit, setUndoHit] = useState<{ source: string; listing_id: string; display_key: string } | null>(null);
  const [hitErrors, setHitErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeErr, setRemoveErr] = useState<{ key: string; msg: string } | null>(null);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const load = useCallback((passed = showPassed) => {
    fetchWatchlist(false, passed).then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, [showPassed]);
  // Refresh countdown timer for auction hits
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

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

  // Every live listing at or under a target price, with filters and sort.
  const hits = useMemo(() => {
    const out: { it: WatchItem; t: WatchTarget; h: TargetHit; under: number }[] = [];
    for (const it of filtered)
      for (const t of shownTargets(it))
        for (const h of t.hits ?? []) {
          if (hitKind !== "all" && h.kind !== hitKind) continue;
          if (hitSource !== "all" && h.source !== hitSource) continue;
          out.push({ it, t, h, under: h.max_cents ? 1 - h.all_in_cents / h.max_cents : 0 });
        }
    if (hitSort === "ending") {
      out.sort((a, b) => {
        if (a.h.ends_at && b.h.ends_at) {
          const da = new Date(a.h.ends_at).getTime();
          const db = new Date(b.h.ends_at).getTime();
          if (da !== db) return da - db;
        }
        if (a.h.ends_at && !b.h.ends_at) return -1;
        if (!a.h.ends_at && b.h.ends_at) return 1;
        return b.under - a.under;
      });
    } else if (hitSort === "cheapest") {
      out.sort((a, b) => a.h.all_in_cents - b.h.all_in_cents);
    } else {
      out.sort((a, b) => b.under - a.under);
    }
    return out;
  }, [filtered, shownTargets, hitKind, hitSource, hitSort, tick]);

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

      <PresetBar keys={[...picked]} onClear={() => setPicked(new Set())} onApplied={load}
        extra={<button onClick={() => setPicked(new Set(filtered.map((i) => i.display_key)))} className="text-xs text-gray-400 hover:text-gray-200">Select all {filtered.length} shown</button>} />

      <section className="rounded-lg border border-green-900/60 bg-gray-900 p-3 break-inside-avoid print:border-gray-300 print:bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-green-300 print:text-black">
            Hits <span className="font-normal text-gray-500">{hits.length} live listings at or under a target price</span>
          </h2>
          <button
            onClick={() => { const next = !showPassed; setShowPassed(next); load(next); }}
            className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white print:hidden"
          >
            {showPassed ? "Hide passed" : `Show passed (${filtered.reduce((sum, it) => sum + (it.targets_detail ?? []).reduce((s, t) => s + (t.passed_hits ?? 0), 0), 0)})`}
          </button>
          <span className="text-xs text-gray-400 ml-1">Kind:</span>
          {(["all", "buy_now", "auction"] as const).map((k) => (
            <button key={k} onClick={() => setHitKind(k)} className={`text-[11px] px-1.5 py-0.5 rounded border ${hitKind === k ? "bg-indigo-600 text-white border-indigo-500" : "bg-gray-950 border-gray-700 text-gray-300 hover:text-white"} print:hidden`}>{k === "all" ? "All" : k === "buy_now" ? "Buy Now" : "Auctions"}</button>
          ))}
          <span className="text-xs text-gray-400 ml-1">Source:</span>
          {(["all", "fanatics", "ebay"] as const).map((s) => (
            <button key={s} onClick={() => setHitSource(s)} className={`text-[11px] px-1.5 py-0.5 rounded border ${hitSource === s ? "bg-indigo-600 text-white border-indigo-500" : "bg-gray-950 border-gray-700 text-gray-300 hover:text-white"} print:hidden`}>{s === "all" ? "All" : s === "fanatics" ? "Fanatics" : "eBay"}</button>
          ))}
          <select value={hitSort} onChange={(e) => setHitSort(e.target.value as typeof hitSort)} className={`${sel} text-[11px] ml-1`}>
            <option value="under">Most under max</option>
            <option value="ending">Ending soonest</option>
            <option value="cheapest">Cheapest</option>
          </select>
        </div>
        {hits.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing listed under your prices right now. Targets without a price rule never hit; give them one.</p>
        ) : (
          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-2 font-medium sticky top-12 left-0 bg-gray-900 z-20 print:static">Card</th>
                  <th className="text-left py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Target</th>
                  <th className="text-left py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Listing</th>
                  <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="Ask, or current bid">Price</th>
                  <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static" title="What you'd pay now: auction bids plus the buyer's premium">All-in</th>
                  <th className="text-right py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static">Your max</th>
                  <th className="text-right py-1 font-medium sticky top-12 bg-gray-900 z-10 print:static">Under by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 print:divide-gray-200 text-gray-300 print:text-black">
                {hits.map(({ it, t, h, under }, i) => {
                  const hitId = `${h.source}:${h.listing_id}`;
                  const isPassed = h.review?.status === "pass";
                  const isNoted = h.review?.status === "note";
                  const noteKey = `${it.display_key}:${h.source}:${h.listing_id}`;
                  return (
                    <tr key={i} className={`align-top ${showPassed && isPassed ? "opacity-50" : ""}`}>
                      <td className="py-1 pr-2 sticky left-0 bg-gray-900 z-10 print:static">
                        <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-gray-100 hover:text-indigo-300 print:text-black block truncate">{it.name}</Link>
                        <span className="text-gray-500 text-[11px]">#{it.number} · {it.set_name}</span>
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        <span className="text-gray-200">{TARGET_LABEL[t.target]}</span>
                        {t.buy_all && <span className="text-yellow-300/90"> · every copy</span>}
                      </td>
                      <td className="py-1 pr-2 max-w-md">
                        <div className="flex items-center gap-1 text-[11px]">
                          <span className="text-[10px] px-1 rounded bg-gray-800 text-gray-300">{h.source === "fanatics" ? "Fanatics" : "eBay"}</span>
                          <span className={`text-[10px] px-1 rounded ${h.kind === "auction" ? "bg-amber-900/40 text-amber-200" : "bg-emerald-900/40 text-emerald-200"}`}>{h.kind === "auction" ? `auction${h.ends_at ? ` · ${endsIn(h.ends_at)}` : ""}` : "Buy Now"}</span>
                          <span className="text-gray-500">· {h.grade_key.toUpperCase()}</span>
                        </div>
                        {h.url ? <a href={h.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 text-xs block truncate">{h.title}</a> : <span className="text-xs block truncate">{h.title}</span>}
                        {h.kind === "auction" && (
                          <div className={`text-[10px] mt-0.5 ${(() => {
                            if (!h.ends_at) return "text-gray-400";
                            const mins = (new Date(h.ends_at).getTime() - Date.now()) / 60000;
                            return mins < 5 ? "text-red-400" : "text-gray-400";
                          })()}`}>
                            {h.bids != null ? `${h.bids} bid${h.bids === 1 ? "" : "s"}` : "No bids"} · ends in {endsIn(h.ends_at) || "—"}
                          </div>
                        )}
                        {isNoted && h.review?.note && <div className="text-[11px] text-amber-200/80">{h.review.note}</div>}
                        {showPassed && isPassed && <span className="text-[10px] text-gray-400">passed</span>}
                      </td>
                      <td className="py-1 pr-2 text-right text-xs">{usd(h.price_cents)}</td>
                      <td className="py-1 pr-2 text-right font-medium text-xs">{usd(h.all_in_cents)}</td>
                      <td className="py-1 pr-2 text-right text-xs">{usd(h.max_cents)}</td>
                      <td className="py-1 text-right text-xs">{Math.round(under * 100)}%</td>
                      <td className="py-1 text-xs">
                        <div className="flex gap-1 print:hidden">
                          {!showPassed && (
                            <button
                              onClick={async () => {
                                try {
                                  await reviewHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key, status: "pass", price_cents: h.all_in_cents });
                                  setUndoHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key });
                                  setTimeout(() => setUndoHit(null), 5000);
                                  load();
                                } catch (e) {
                                  setHitErrors({ ...hitErrors, [hitId]: (e as Error).message });
                                }
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
                            >Pass</button>
                          )}
                          {!showPassed && !isNoted && (
                            <button
                              onClick={() => { setNoteEditing({ ...noteEditing, [noteKey]: "editing" }); setNoteText({ ...noteText, [noteKey]: h.review?.note ?? "" }); }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 text-amber-200 hover:text-amber-100"
                            >Note</button>
                          )}
                          {!showPassed && isNoted && (
                            <button
                              onClick={() => { setNoteEditing({ ...noteEditing, [noteKey]: "editing" }); setNoteText({ ...noteText, [noteKey]: h.review?.note ?? "" }); }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-200 border border-amber-700/40 hover:border-amber-500"
                            >Edit note</button>
                          )}
                        </div>
                        {!showPassed && noteEditing[noteKey] === "editing" && (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={noteText[noteKey] ?? ""}
                              onChange={(e) => setNoteText({ ...noteText, [noteKey]: e.target.value })}
                              maxLength={2000}
                              className="w-full text-[11px] bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
                            />
                            <button
                              onClick={async () => {
                                const text = (noteText[noteKey] ?? "").trim();
                                try {
                                  if (text) {
                                    await reviewHit({ source: h.source, listing_id: h.listing_id, display_key: it.display_key, status: "note", note: text, price_cents: h.all_in_cents });
                                  } else {
                                    await clearHitReview(h.source, h.listing_id);
                                  }
                                  setNoteEditing({ ...noteEditing, [noteKey]: "" });
                                  load();
                                } catch (e) {
                                  setHitErrors({ ...hitErrors, [hitId]: (e as Error).message });
                                }
                              }}
                              className="text-[10px] px-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                            >Save</button>
                            <button
                              onClick={() => { setNoteEditing({ ...noteEditing, [noteKey]: "" }); }}
                              className="text-[10px] px-1 rounded text-gray-400 hover:text-gray-200"
                            >Cancel</button>
                          </div>
                        )}
                        {showPassed && isPassed && (
                          <button
                            onClick={async () => {
                              try {
                                await clearHitReview(h.source, h.listing_id);
                                load(showPassed);
                              } catch (e) {
                                setHitErrors({ ...hitErrors, [hitId]: (e as Error).message });
                              }
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
                          >Undo pass</button>
                        )}
                        {undoHit && undoHit.source === h.source && undoHit.listing_id === h.listing_id && undoHit.display_key === it.display_key && (
                          <div className="text-[10px] text-amber-200/80 mt-0.5">
                            Passed. <button
                              onClick={async () => {
                                try {
                                  await clearHitReview(h.source, h.listing_id);
                                  setUndoHit(null);
                                  load();
                                } catch (e) {
                                  setHitErrors({ ...hitErrors, [hitId]: (e as Error).message });
                                }
                              }}
                              className="underline hover:text-white"
                            >Undo</button>
                          </div>
                        )}
                        {hitErrors[hitId] && <div className="text-[10px] text-red-400 mt-0.5">{hitErrors[hitId]}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                        {ts.length === 0 ? (
                          <span className="text-gray-600">Watching only</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {ts.map((t) => (
                              <button
                                key={t.target}
                                onClick={() => setEditing(it.display_key)}
                                title={t.rule_text}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] bg-gray-950 border border-gray-700 text-gray-200 hover:border-indigo-400 hover:text-white print:hidden"
                              >
                                <span className="font-medium">{TARGET_LABEL[t.target]}</span>
                                {t.max_cents != null ? (
                                  <span className="text-yellow-300/90">≤ {usd(t.max_cents)}</span>
                                ) : (
                                  <span className="text-gray-500">no rule</span>
                                )}
                              </button>
                            ))}
                            <button
                              onClick={() => setEditing(it.display_key)}
                              title="Add or edit strategies"
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] bg-gray-950 border border-dashed border-gray-600 text-gray-400 hover:border-indigo-400 hover:text-white print:hidden"
                            >
                              + strategy
                            </button>
                          </div>
                        )}
                        <button onClick={() => setEditing(it.display_key)}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 print:hidden mt-1">
                          {ts.length === 0 ? "Add targets" : "Edit targets"}
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      ))}

      {/* Drawer for editing a card's strategies */}
      {editing && (() => {
        const ed = items?.find((i) => i.display_key === editing);
        if (!ed) return null;
        const edTs = ed.targets_detail ?? [];
        const edHits = edTs.flatMap((t) => (t.hits ?? []).map((h) => h));
        return (
          <>
            <div className="fixed inset-0 bg-black/60 z-30 print:hidden" onClick={() => setEditing(null)} />
            <aside className="fixed inset-y-0 right-0 w-[32rem] max-w-full z-40 bg-gray-900 border-l border-gray-800 overflow-y-auto print:hidden shadow-2xl">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  {ed.image_url && <img src={cardThumb(ed.image_url)} alt="" className="w-12 h-16 object-cover rounded-sm shrink-0" />}
                  <div className="min-w-0">
                    <Link to={`/cards/${encodeURIComponent(ed.display_key)}`} className="text-sm font-semibold text-gray-100 hover:text-indigo-300 block truncate">{ed.name}</Link>
                    <div className="text-xs text-gray-500">#{ed.number} · {ed.set_name}</div>
                  </div>
                  <button onClick={() => setEditing(null)} className="ml-auto text-gray-400 hover:text-white text-sm">✕</button>
                </div>
                <TargetEditor displayKey={ed.display_key} initial={edTs} onSaved={load} onClose={() => setEditing(null)} />
                <div>
                  <h3 className="text-xs font-semibold text-gray-300 mb-2">Current hits ({edHits.length})</h3>
                  {edHits.length === 0 ? (
                    <p className="text-xs text-gray-500">No hits on this card's targets right now.</p>
                  ) : (
                    <div className="divide-y divide-gray-800">
                      {edHits.map((h, idx) => (
                        <div key={idx} className="py-2 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] px-1 rounded bg-gray-800 text-gray-300">{h.source}</span>
                            <span className="text-[10px] text-gray-500">{h.kind === "auction" ? "auction" : "Buy Now"}</span>
                            <span className="text-[10px] text-gray-500">· {h.grade_key.toUpperCase()}</span>
                          </div>
                          <a href={h.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 block truncate">{h.title}</a>
                          <div className="text-[11px] text-gray-400">
                            {usd(h.price_cents)} price · {usd(h.all_in_cents)} all-in · max {usd(h.max_cents)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </>
        );
      })()}
    </div>
  );
}
