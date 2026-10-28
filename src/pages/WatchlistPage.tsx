import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BUY_TARGETS, clearHitReview, fetchWatchlist, putTargets, reviewHit, unwatchCard, type BuyTarget, type HitReason, type PlaySummary, type WatchItem, type WatchIntent, type WatchTarget } from "../lib/api";
import { useSession } from "../lib/auth";
import { STANCE } from "../components/BuyingGuide";
import { CardPrepButtons, PresetBar, TARGET_LABEL, TargetEditor, usePresets } from "../components/WatchTargets";
import { cardThumb } from "../lib/thumb";
import { Spinner, ErrorMsg } from "../components/Spinner";
import WatchSuggestions from "../components/WatchSuggestions";
import { watchChanged } from "../components/WatchButton";
import ReleaseVs from "../components/ReleaseVs";
import ReviewLog from "../components/ReviewLog";
import { Drawer, HitRow, PhotoOverlay, cardHits, loadHitFilters, saveHitFilters, sortHits, useNow, type CardHit, type HitFilters, type Photo } from "../components/WatchHits";

const usd = (c?: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const INTENT_LABEL: Record<WatchIntent, string> = { grade: "Grade", invest: "Invest", flip: "Flip", watch: "Watch" };
const sel = "bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200";

const BEST_HITS = 8;
const UNDO_MS = 5000;

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex rounded border border-gray-700 overflow-hidden">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-2 py-0.5 text-xs ${value === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{label}</button>
      ))}
    </span>
  );
}

// Tabs: one per buy target, each with the columns that decide it.
type Tab = BuyTarget | "" | "none";
type ColId = "play" | "raw" | "low" | "grade_le" | "be" | "be_psa" | "be_cgc" | "psa10" | "bid10" | "held10" | "held_raw";
const COLS: Record<ColId, { label: string; title?: string }> = {
  play: { label: "Play" },
  raw: { label: "Raw now", title: "Raw market price, and where it sits vs its release price and expected low" },
  low: { label: "Exp. low", title: "Expected raw low (release curve)" },
  grade_le: { label: "Grade ≤", title: "Most to pay raw to grade (your return bar, better grader)" },
  be: { label: "Break-even", title: "Grading nets $0 at this raw price (better grader): never pay more" },
  be_psa: { label: "PSA BE", title: "Highest raw price at which grading with PSA nets $0 at the public gem rate (sold at whatever grade it gets)" },
  be_cgc: { label: "CGC BE", title: "The same with CGC, Pristine 10s valued at their own price" },
  psa10: { label: "PSA 10" },
  bid10: { label: "10 bid ≤", title: "PSA 10 auction ceiling (hammer)" },
  held10: { label: "10 held/yr", title: "A PSA 10's projected yearly return held two years, after fees" },
  held_raw: { label: "Raw held/yr", title: "A raw copy's projected yearly return held two years, after fees (tier curve + its own trend)" },
};
const TAB_COLS: Record<Tab, ColId[]> = {
  "": ["play", "raw", "low", "grade_le", "be", "psa10", "bid10", "held10"],
  raw_grade: ["raw", "low", "be_psa", "be_cgc", "grade_le", "held_raw"],
  raw_invest: ["raw", "low", "held_raw", "play"],
  cgc_10: ["play", "raw", "held10"],
  psa_10: ["play", "psa10", "bid10", "held10"],
  regrade: ["play", "psa10", "held10"],
  none: ["play", "raw", "low", "held_raw"],
};
const TAB_KEY = "watchlist.tab";
const loadTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_KEY) ?? "";
    return (v in TAB_COLS ? v : "") as Tab;
  } catch {
    return "";
  }
};
const yearly = (v?: number) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);

function cell(c: ColId, it: WatchItem, p: PlaySummary | undefined) {
  const over = (be?: number) => p?.raw_cents != null && be != null && p.raw_cents >= be;
  switch (c) {
    case "play":
      return (
        <td key={c} className="py-1.5 pr-2 max-w-xs">
          {p && <span className={`px-1 rounded border text-[10px] mr-1 ${STANCE[p.stance].cls}`}>{STANCE[p.stance].label}</span>}
          <span className="text-gray-400 print:text-black">{p?.headline}</span>
        </td>
      );
    case "raw":
      return (
        <td key={c} className="py-1.5 pr-2 text-right">
          {usd(p?.raw_cents)}
          {p && <div className="text-[10px]"><ReleaseVs f={{ ...p, bottom_cents: p.exp_bottom_cents }} /></div>}
        </td>
      );
    case "low": return <td key={c} className="py-1.5 pr-2 text-right">{usd(p?.exp_bottom_cents ?? p?.bottom_cents)}</td>;
    case "grade_le": return <td key={c} className="py-1.5 pr-2 text-right font-medium">{usd(p?.target_cents)}</td>;
    case "be": return <td key={c} className={`py-1.5 pr-2 text-right ${over(p?.break_even_cents) ? "text-red-400" : ""}`}>{usd(p?.break_even_cents)}</td>;
    case "be_psa": return <td key={c} className={`py-1.5 pr-2 text-right ${over(p?.break_even_psa_cents) ? "text-red-400" : ""}`}>{usd(p?.break_even_psa_cents)}</td>;
    case "be_cgc": return <td key={c} className={`py-1.5 pr-2 text-right ${over(p?.break_even_cgc_cents) ? "text-red-400" : ""}`}>{usd(p?.break_even_cgc_cents)}</td>;
    case "psa10": return <td key={c} className="py-1.5 pr-2 text-right">{usd(it.psa10_cents)}</td>;
    case "bid10": return <td key={c} className="py-1.5 pr-2 text-right">{usd(p?.bid_cents)}</td>;
    case "held10": return <td key={c} className="py-1.5 pr-2 text-right">{yearly(p?.projection)}</td>;
    case "held_raw": return <td key={c} className="py-1.5 pr-2 text-right">{yearly(p?.projection_raw)}</td>;
  }
}

// The buy list, by set: each card's buy targets, and (click the row) the
// live listings under them, which can be set aside with a reason or noted.
// Prints cleanly (Ctrl+P / the Print button); open cards print their listings.
export default function WatchlistPage() {
  const session = useSession();
  const presets = usePresets();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<WatchIntent | "">("");
  const [target, setTargetState] = useState<Tab>(loadTab);
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [history, setHistory] = useState(false);
  const [preset, setPreset] = useState("");
  const [setCode, setSetCode] = useState("");
  const [onlyHits, setOnlyHits] = useState(false);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null); // display_key whose strategies are open
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFiltersState] = useState<HitFilters>(loadHitFilters);
  const [showPassed, setShowPassed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // set aside, save in flight
  const [undo, setUndo] = useState<{ key: string; displayKey: string; title: string; source: string; listing_id: string } | null>(null);
  const [hitErr, setHitErr] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeErr, setRemoveErr] = useState<{ key: string; msg: string } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetchWatchlist(false, showPassed).then((r) => { setItems(r.items); setHidden(new Set()); }).catch((e: Error) => setError(e.message));
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
    if (target && target !== "none") ts = ts.filter((t) => t.target === target);
    if (unpricedOnly) ts = ts.filter((t) => t.max_cents == null);
    if (preset) ts = ts.filter((t) => (preset === "custom" ? !t.preset : t.preset === preset));
    return ts;
  }, [target, preset, unpricedOnly]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (intent && it.intent !== intent) return false;
      if (setCode && it.set_code !== setCode) return false;
      if (needle && !`${it.name} ${it.number} ${it.set_name}`.toLowerCase().includes(needle)) return false;
      const all = it.targets_detail ?? [];
      if (target === "none") return all.length === 0;
      const ts = shownTargets(it);
      if ((target || preset || unpricedOnly) && ts.length === 0) return false;
      if (onlyHits && cardHits(ts, filters, false, hidden).length === 0) return false;
      return true;
    });
  }, [items, intent, setCode, q, target, preset, unpricedOnly, onlyHits, shownTargets, filters, hidden]);

  const bySet = useMemo(() => {
    const m = new Map<string, { name: string; code: string; items: WatchItem[] }>();
    for (const it of filtered) {
      const g = m.get(it.set_code) ?? { name: it.set_name, code: it.set_code, items: [] };
      g.items.push(it);
      m.set(it.set_code, g);
    }
    return [...m.values()];
  }, [filtered]);

  // Each shown card's listings under the filters (set-aside ones too with
  // Show set-aside), and the live ones not set aside, for counts and Best hits.
  const hitsByCard = useMemo(() => {
    const m = new Map<string, { all: CardHit[]; live: CardHit[] }>();
    for (const it of filtered) {
      const all = cardHits(shownTargets(it), filters, showPassed, hidden);
      m.set(it.display_key, { all, live: all.filter((x) => x.h.review?.status !== "pass") });
    }
    return m;
  }, [filtered, shownTargets, filters, showPassed, hidden]);

  const best = useMemo(() => {
    const out: { it: WatchItem; ch: CardHit }[] = [];
    for (const it of filtered) for (const ch of hitsByCard.get(it.display_key)?.live ?? []) out.push({ it, ch });
    const total = out.length;
    return { total, top: out.sort((a, b) => b.ch.under - a.ch.under).slice(0, BEST_HITS) };
  }, [filtered, hitsByCard]);

  const passedCount = useMemo(() => filtered.reduce((n, it) => n + shownTargets(it).reduce((s, t) => s + (t.passed_hits ?? 0), 0), 0), [filtered, shownTargets]);

  // The soonest-ending auction shown, for the clock's pace.
  const soonest = useMemo(() => {
    let min: number | null = null;
    for (const v of hitsByCard.values())
      for (const x of v.all)
        if (x.h.kind === "auction" && x.h.ends_at) {
          const t = new Date(x.h.ends_at).getTime();
          if (min == null || t < min) min = t;
        }
    return min;
  }, [hitsByCard]);
  const now = useNow(soonest);

  const sets = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items ?? []) m.set(it.set_code, it.set_name);
    return [...m.entries()];
  }, [items]);
  const targetCount = (k: BuyTarget) => (items ?? []).filter((it) => it.targets?.includes(k)).length;

  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your watchlist.</p>;
  if (error) return <ErrorMsg msg={error} />;
  if (!items) return <Spinner />;

  const setFilters = (f: Partial<HitFilters>) => {
    const n = { ...filters, ...f };
    setFiltersState(n);
    saveHitFilters(n);
  };

  const setTarget = (t: Tab) => {
    setTargetState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // not remembered; fine
    }
  };
  const cols = TAB_COLS[target];

  const toggleExpanded = (k: string) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  // Best hits: open the card and bring it into view.
  const showCard = (k: string) => {
    setExpanded((s) => new Set(s).add(k));
    requestAnimationFrame(() => document.getElementById(`watch-card-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Set a listing aside: it leaves the list at once, with Undo for a few
  // seconds; a failed save puts it back with the error.
  const setAside = async (displayKey: string, ch: CardHit, reason: HitReason, note: string) => {
    const k = ch.key;
    setHidden((s) => new Set(s).add(k));
    setHitErr((m) => { const n = { ...m }; delete n[k]; return n; });
    const u = { key: k, displayKey, title: ch.h.title, source: ch.h.source, listing_id: ch.h.listing_id };
    setUndo(u);
    setTimeout(() => setUndo((cur) => (cur?.key === k ? null : cur)), UNDO_MS);
    try {
      await reviewHit({ source: ch.h.source, listing_id: ch.h.listing_id, display_key: displayKey, status: "pass", reason, note: note || undefined, price_cents: ch.h.all_in_cents });
      load();
    } catch (e) {
      setHidden((s) => { const n = new Set(s); n.delete(k); return n; });
      setUndo((cur) => (cur?.key === k ? null : cur));
      setHitErr((m) => ({ ...m, [k]: (e as Error).message }));
    }
  };

  const undoAside = async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await clearHitReview(u.source, u.listing_id);
    } catch (e) {
      setHitErr((m) => ({ ...m, [u.key]: (e as Error).message }));
    }
    load();
  };

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

      <div className="flex flex-wrap items-end gap-1 border-b border-gray-800 print:hidden">
        {([["", "All", items.length] as const, ...BUY_TARGETS.map((t) => [t.key, t.label, targetCount(t.key)] as const),
          ["none", "No targets", items.filter((it) => (it.targets_detail ?? []).length === 0).length] as const]).map(([k, label, n]) => (
          <button key={k || "all"} onClick={() => setTarget(k as Tab)} title={BUY_TARGETS.find((t) => t.key === k)?.hint}
            className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${target === k ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
            {label} <span className="text-xs text-gray-500">{n}</span>
          </button>
        ))}
      </div>
      <h2 className="hidden print:block text-sm font-semibold">{target ? (BUY_TARGETS.find((t) => t.key === target)?.label ?? "No targets") : "Every target"}</h2>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
        <label className="flex items-center gap-1 text-sm text-gray-300" title="Only strategies with no price rule (they never hit)">
          <input type="checkbox" className="accent-indigo-500" checked={unpricedOnly} onChange={(e) => setUnpricedOnly(e.target.checked)} /> Without a price
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 print:hidden">
        <span>Listings</span>
        <Seg value={filters.kind} onChange={(kind) => setFilters({ kind })} options={[["all", "All"], ["auction", "Auctions"], ["buy_now", "Buy Now"]]} />
        <Seg value={filters.source} onChange={(source) => setFilters({ source })} options={[["all", "All"], ["fanatics", "Fanatics"], ["ebay", "eBay"]]} />
        <label className="flex items-center gap-1 text-gray-300" title="Raw listings with a single photo: the back isn't shown">
          <input type="checkbox" className="accent-indigo-500" checked={filters.hideOnePhoto} onChange={(e) => setFilters({ hideOnePhoto: e.target.checked })} /> Hide 1-photo raw listings
        </label>
        <span className="ml-2">Sort</span>
        <select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as HitFilters["sort"] })} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
          <option value="under">Most under max</option>
          <option value="ending">Ending soonest</option>
          <option value="cheapest">Cheapest</option>
        </select>
        <label className="flex items-center gap-1 text-gray-300 ml-2">
          <input type="checkbox" className="accent-indigo-500" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} /> Show set-aside ({passedCount})
        </label>
        <button onClick={() => setHistory(true)} className="ml-2 px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white"
          title="Everything you set aside, noted or marked interested: find a wrong call and change it">Review history</button>
      </div>

      <section className="rounded-lg border border-green-900/60 bg-gray-900 p-3 break-inside-avoid print:hidden">
        <h2 className="text-sm font-semibold text-green-300 mb-2">
          Best hits <span className="font-normal text-gray-500">{best.top.length} of {best.total} listings at or under a target price, most under first; click one to open its card</span>
        </h2>
        {best.top.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing listed under your prices right now (with these filters). Targets without a price rule never hit; give them one.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {best.top.map(({ it, ch }) => (
              <button key={`${it.display_key}|${ch.key}`} onClick={() => showCard(it.display_key)}
                className="text-left rounded border border-gray-800 bg-gray-950 p-2 hover:border-indigo-500 flex gap-2 items-start">
                {ch.h.image_url || it.image_url
                  ? <img src={ch.h.image_url ?? cardThumb(it.image_url!)} alt="" loading="lazy" className="w-10 h-12 object-cover rounded-sm shrink-0 bg-gray-800" />
                  : <div className="w-10 h-12 rounded-sm shrink-0 bg-gray-800" />}
                <div className="min-w-0 text-[11px] leading-tight space-y-0.5">
                  <div className="text-xs font-medium text-gray-100 truncate">{it.name} <span className="text-gray-500 font-normal">#{it.number}</span></div>
                  <div className="text-gray-500">{ch.h.source === "fanatics" ? "Fanatics" : "eBay"} · {ch.h.kind === "auction" ? "auction" : "Buy Now"} · {ch.h.grade_key.toUpperCase()}</div>
                  <div className="text-gray-300 tabular-nums">{usd(ch.h.all_in_cents)} vs {usd(ch.h.max_cents)} · <span className="text-green-300">{Math.round(ch.under * 100)}% under</span></div>
                </div>
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
                {cols.map((c) => (
                  <th key={c} title={COLS[c].title}
                    className={`${c === "play" ? "text-left" : "text-right"} py-1 pr-2 font-medium sticky top-12 bg-gray-900 z-10 print:static`}>{COLS[c].label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 print:divide-gray-200 text-gray-300 print:text-black">
              {g.items.map((it) => {
                const p = it.play;
                const ts = shownTargets(it);
                const ch = hitsByCard.get(it.display_key) ?? { all: [], live: [] };
                const open = expanded.has(it.display_key);
                return (
                  <Fragment key={it.display_key}>
                    <tr id={`watch-card-${it.display_key}`} className={`align-top cursor-pointer scroll-mt-14 ${open ? "bg-gray-800/40" : "hover:bg-gray-800/20"}`}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label,textarea")) toggleExpanded(it.display_key); }}
                      title={open ? "Click to hide its listings" : "Click to show its listings"}>
                      <td className="py-1.5 print:hidden">
                        <input type="checkbox" className="accent-indigo-500" checked={picked.has(it.display_key)} onChange={() => toggle(it.display_key)} />
                      </td>
                      <td className="py-1.5 pr-2 w-9 sticky left-0 bg-gray-900 z-10 print:static">
                        {it.image_url && <img src={cardThumb(it.image_url)} alt="" className="w-8 h-11 object-cover rounded-sm print:hidden" loading="lazy" />}
                      </td>
                      <td className="py-1.5 pr-2 sticky left-9 bg-gray-900 z-10 print:static">
                        <span className="text-gray-500 mr-1 print:hidden">{open ? "▾" : "▸"}</span>
                        <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-gray-100 hover:text-indigo-300 print:text-black">{it.name}</Link>
                        <div className="text-gray-500">#{it.number} · {INTENT_LABEL[it.intent]}</div>
                        <div className="mt-0.5"><CardPrepButtons displayKey={it.display_key} /></div>
                        {it.note && <div className="text-gray-400 italic">{it.note}</div>}
                      </td>
                      <td className="py-1.5 pr-2 min-w-[16rem]">
                        {ts.length === 0 && <span className="text-gray-600">Watching only</span>}
                        <div className="flex flex-wrap items-center gap-1">
                          {ts.map((t) => (
                            <span key={t.target}
                              title={t.gate ? `Paused: ${t.gate}` : `${t.rule_text}${t.buy_all ? " · every copy" : ""}${t.channels !== "any" ? ` · ${t.channels === "auction" ? "auctions only" : "Buy Now only"}` : ""}`}
                              className={`px-1.5 py-0.5 rounded border text-[11px] print:border-gray-400 print:text-black ${t.gate ? "border-amber-700/60 bg-amber-950/40 text-amber-200" : "border-gray-700 bg-gray-950 text-gray-200"}`}>
                              {TARGET_LABEL[t.target]}{" "}
                              {t.gate ? <span>paused</span> : t.max_cents != null ? <span className="text-yellow-300/90 print:text-black">≤ {usd(t.max_cents)}</span> : <span className="text-gray-500">no price</span>}
                            </span>
                          ))}
                          {ts.length > 0 && (
                            <span className={`px-1 rounded text-[10px] ${ch.live.length > 0 ? "bg-green-900/60 text-green-300" : "bg-gray-800 text-gray-500"} print:border print:border-gray-400 print:text-black`}>
                              {ch.live.length} listing{ch.live.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <button onClick={() => setDrawer(it.display_key)}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 print:hidden">
                          Edit strategies
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
                      {cols.map((c) => cell(c, it, p))}
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={4 + cols.length} className="pb-2 pl-6">
                          <div className="rounded border border-gray-800 bg-gray-950/60 px-3 py-1 print:border-gray-300 print:bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-gray-500">
                              <span>{ch.live.length} listing{ch.live.length === 1 ? "" : "s"} at or under a target price{ch.all.length > ch.live.length ? `, ${ch.all.length - ch.live.length} set aside` : ""}</span>
                              <button onClick={() => setDrawer(it.display_key)} className="text-indigo-300 hover:text-indigo-200 print:hidden">Edit strategies</button>
                            </div>
                            {undo?.displayKey === it.display_key && (
                              <div className="text-[11px] text-amber-200/90 py-1 print:hidden">
                                Set aside: <span className="text-gray-400">{undo.title}</span>{" "}
                                <button onClick={undoAside} className="underline hover:text-white">Undo</button>
                              </div>
                            )}
                            <div className="divide-y divide-gray-800 print:divide-gray-200">
                              {sortHits(ch.all, filters.sort).map((x) => (
                                <HitRow key={x.key} ch={x} displayKey={it.display_key} now={now} error={hitErr[x.key]} onPhoto={setPhoto}
                                  onSetAside={(c, reason, note) => setAside(it.display_key, c, reason, note)} onChanged={load} />
                              ))}
                            </div>
                            {ch.all.length === 0 && (
                              <p className="text-xs text-gray-500 py-2">
                                {ts.length === 0 ? "No strategies yet: add one to see listings." : "Nothing listed under its prices right now (with these filters)."}
                              </p>
                            )}
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

      {drawer && (() => {
        const it = items.find((x) => x.display_key === drawer);
        if (!it) return null;
        return (
          <Drawer onClose={() => setDrawer(null)} title={
            <div className="flex gap-3 items-start">
              {it.image_url && <img src={cardThumb(it.image_url)} alt="" className="w-12 h-16 object-cover rounded-sm" />}
              <div>
                <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-sm font-semibold text-gray-100 hover:text-indigo-300">{it.name}</Link>
                <div className="text-xs text-gray-500">#{it.number} · {it.set_name}</div>
              </div>
            </div>
          }>
            <TargetEditor key={it.display_key} displayKey={it.display_key} initial={it.targets_detail ?? []}
              onSaved={() => { setExpanded((s) => new Set(s).add(it.display_key)); load(); }} onClose={() => setDrawer(null)} />
          </Drawer>
        );
      })()}
      {photo && <PhotoOverlay photo={photo} onClose={() => setPhoto(null)} />}
      {history && (
        <Drawer onClose={() => { setHistory(false); load(); }} title={<h2 className="text-sm font-semibold text-gray-100">Review history</h2>}>
          <ReviewLog />
        </Drawer>
      )}
    </div>
  );
}
