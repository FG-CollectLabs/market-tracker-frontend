import { useEffect, useMemo, useState } from "react";
import { bulkAICheck, bulkCheckGradeOdds, bulkRefreshOdds, GRADE_ODDS_REFRESHED, type AIState, type TargetHit } from "../lib/api";

// Bulk actions on the listings a board's filters are showing: pre-grade every
// unchecked raw copy, run the full AI check on all of them, refresh all, and
// a progress bar while sends and AI checks are still in the queue.

type Kind = "pregrade" | "ai";
interface Run { kind: Kind; keys: string[]; at: number }
const RUN_KEY = "watchlist.bulkRuns";
const loadRuns = (): Run[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RUN_KEY) ?? "[]") as Run[];
    return v.filter((r) => Date.now() - r.at < 6 * 3600e3); // a run older than 6h is over
  } catch {
    return [];
  }
};
const saveRuns = (r: Run[]) => {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(r)); } catch { /* private window */ }
};

const keyOf = (h: TargetHit) => `${h.source}|${h.listing_id}`;
const aiOf = (h: TargetHit) => (h.grade_key === "raw" ? h.grade_odds?.ai : h.ai);
const AI_DONE: AIState[] = ["clean", "issues", "removed", "failed", "partial"];
const AI_BUSY: AIState[] = ["sending", "queued", "checking"];
const oddsBusy = (h: TargetHit) => h.grade_odds != null && (h.grade_odds.status === "pending" || h.grade_odds.status === "measuring");
const hasPhotos = (h: TargetHit) => h.image_count == null || h.image_count >= 2;

export default function FilterActions({ hits, onReload, label }: { hits: TargetHit[]; onReload: () => void; label: string }) {
  const [runs, setRuns] = useState<Run[]>(loadRuns);
  const [busy, setBusy] = useState<"" | Kind | "refresh">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const byKey = useMemo(() => new Map(hits.map((h) => [keyOf(h), h])), [hits]);
  const toPregrade = useMemo(() => hits.filter((h) => h.source === "ebay" && h.grade_key === "raw" && hasPhotos(h)
    && (!h.grade_odds || (h.grade_odds.status === "failed" && h.grade_odds.copy_id == null))), [hits]);
  const toAI = useMemo(() => hits.filter((h) => {
    const s = aiOf(h)?.state;
    if (s && s !== "not_checked" && s !== "failed") return false;
    return h.grade_key === "raw" ? h.source === "ebay" && hasPhotos(h) : h.source === "ebay" || h.source === "fanatics";
  }), [hits]);
  const toRefresh = useMemo(() => [...new Set(hits.map((h) => h.grade_odds?.copy_id != null ? h.grade_odds.id : 0).filter(Boolean))], [hits]);

  // progress: every key in a run, plus anything shown that's still in flight
  const prog = useMemo(() => {
    const keys = new Map<string, Kind>();
    for (const r of runs) for (const k of r.keys) keys.set(k, r.kind);
    for (const h of hits) {
      if (AI_BUSY.includes(aiOf(h)?.state as AIState)) keys.set(keyOf(h), "ai");
      else if (oddsBusy(h) && !keys.has(keyOf(h))) keys.set(keyOf(h), "pregrade");
    }
    let done = 0, sending = 0, queued = 0, checking = 0, gone = 0, ahead = 0;
    for (const [k, kind] of keys) {
      const h = byKey.get(k);
      if (!h) { gone++; done++; continue; } // ended or filtered out
      if (kind === "pregrade") {
        if (!h.grade_odds) sending++;
        else if (oddsBusy(h)) checking++;
        else done++;
        continue;
      }
      const a = aiOf(h);
      const s = a?.state;
      if (s && AI_DONE.includes(s)) done++;
      else if (s === "checking") checking++;
      else if (s === "queued") { queued++; ahead = Math.max(ahead, a?.ahead ?? 0); }
      else sending++;
    }
    return { total: keys.size, done, sending, queued, checking, gone, ahead };
  }, [runs, hits, byKey]);
  const active = prog.total > 0 && prog.done < prog.total;

  // follow the queue while something's in it; forget runs once they finish
  useEffect(() => {
    if (!active) return; // a finished run stays up until dismissed
    const t = window.setInterval(onReload, 20000);
    return () => window.clearInterval(t);
  }, [active, onReload]);

  const addRun = (kind: Kind, keys: string[]) => {
    const n = [...runs, { kind, keys, at: Date.now() }];
    setRuns(n); saveRuns(n);
  };

  const pregrade = async () => {
    if (!window.confirm(`Pre-grade ${toPregrade.length} raw copies shown in ${label}? Sent to the grading predictor in the background (300 a click).`)) return;
    setBusy("pregrade"); setMsg(null);
    try {
      const r = await bulkCheckGradeOdds(toPregrade.map((h) => h.listing_id));
      addRun("pregrade", toPregrade.slice(0, r.queued + r.already_checked).map(keyOf));
      const parts = [`${r.queued} sent`];
      if (r.already_checked) parts.push(`${r.already_checked} already checked`);
      if (r.no_photos) parts.push(`${r.no_photos} without front + back photos`);
      if (r.over_limit) parts.push(`${r.over_limit} over the ${r.limit} limit: click again later`);
      setMsg({ ok: true, text: `Pre-grade: ${parts.join(" · ")}.` });
      onReload();
    } catch (e) {
      setMsg({ ok: false, text: `Pre-grade failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(""); }
  };

  const ai = async () => {
    const n = Math.min(50, toAI.length);
    if (!window.confirm(`Run the full AI check on ${n} cop${n === 1 ? "y" : "ies"} shown in ${label}${toAI.length > 50 ? ` (the first 50 of ${toAI.length}; 50 a click)` : ""}? Each is a model run on the pre-grader; the rush queue takes about 3 a minute.`)) return;
    setBusy("ai"); setMsg(null);
    try {
      const r = await bulkAICheck(toAI.map((h) => ({ source: h.source, listing_id: h.listing_id })));
      addRun("ai", r.results.filter((x) => !x.error).map((x) => `${x.source}|${x.listing_id}`));
      const parts = [`${r.sent} queued`];
      if (r.skipped) parts.push(`${r.skipped} already checked or queued`);
      if (r.over_limit) parts.push(`${r.over_limit} over the ${r.limit} a click: click again after these`);
      if (r.failed) parts.push(`${r.failed} couldn't be sent (${[...new Set(r.results.filter((x) => x.error).map((x) => x.error))].slice(0, 2).join("; ")})`);
      setMsg({ ok: r.failed === 0, text: `AI check: ${parts.join(" · ")}.` });
      onReload();
    } catch (e) {
      setMsg({ ok: false, text: `AI check failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(""); }
  };

  const refresh = async () => {
    setBusy("refresh"); setMsg(null);
    try {
      const r = await bulkRefreshOdds(toRefresh);
      setMsg({ ok: r.failed === 0, text: `Refreshed ${r.refreshed} copies' odds and ${r.ai_statuses} AI statuses${r.failed ? ` · ${r.failed} failed` : ""}${r.over_limit ? ` · ${r.over_limit} over the ${r.limit} limit` : ""}.` });
      window.dispatchEvent(new Event(GRADE_ODDS_REFRESHED));
      onReload();
    } catch (e) {
      setMsg({ ok: false, text: `Refresh failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(""); }
  };

  const btn = "px-2 py-1 rounded border text-xs disabled:opacity-40 disabled:cursor-default";
  const pct = prog.total ? Math.round((100 * prog.done) / prog.total) : 0;
  return (
    <div className="space-y-1.5 print:hidden">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>Shown listings:</span>
        <button disabled={busy !== "" || toPregrade.length === 0} onClick={pregrade} className={`${btn} border-indigo-800 text-indigo-200 hover:bg-indigo-950/60`}
          title="Send every raw eBay copy shown that hasn't been pre-graded (front and back photos) to the grading predictor">
          {busy === "pregrade" ? "Sending…" : `Pre-grade all (${toPregrade.length})`}
        </button>
        <button disabled={busy !== "" || toAI.length === 0} onClick={ai} className={`${btn} border-violet-800 text-violet-200 hover:bg-violet-950/60`}
          title="The pre-grader's full AI check (label, outline, corners & edges) on every copy shown that hasn't had one: raw copies are pre-graded first if needed. 50 a click.">
          {busy === "ai" ? "Queuing…" : `AI check all (${toAI.length})`}
        </button>
        <button disabled={busy !== "" || toRefresh.length === 0} onClick={refresh} className={`${btn} border-gray-700 text-gray-200 hover:bg-gray-800`}
          title="Re-read every shown copy's odds and AI status from the pre-grader now">
          {busy === "refresh" ? "Refreshing…" : `Refresh all (${toRefresh.length})`}
        </button>
        {msg && <span className={msg.ok ? "text-green-300" : "text-amber-300"}>{msg.text}</span>}
      </div>
      {prog.total > 0 && (active || runs.length > 0) && (
        <div className="max-w-xl space-y-0.5">
          <div className="h-2 rounded bg-gray-800 overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${pct}%` }} />
            <div className="bg-sky-500/70" style={{ width: `${(100 * prog.checking) / prog.total}%` }} />
            <div className="bg-amber-500/50" style={{ width: `${(100 * prog.queued) / prog.total}%` }} />
          </div>
          <div className="text-[11px] text-gray-400 tabular-nums">
            {prog.done} of {prog.total} done ({pct}%)
            {prog.checking > 0 && <span className="text-sky-300"> · {prog.checking} checking</span>}
            {prog.queued > 0 && <span className="text-amber-300"> · {prog.queued} queued{prog.ahead ? ` (${prog.ahead} ahead in the rush queue)` : ""}</span>}
            {prog.sending > 0 && <span> · {prog.sending} sending</span>}
            {prog.gone > 0 && <span className="text-gray-500"> · {prog.gone} no longer shown</span>}
            {active ? <span className="text-gray-500"> · updates every 20s</span>
              : <button onClick={() => { setRuns([]); saveRuns([]); }} className="ml-2 text-gray-500 hover:text-gray-300">dismiss</button>}
          </div>
        </div>
      )}
    </div>
  );
}
