import { useEffect, useRef, useState } from "react";
import { fetchAIStatus, requestAICheck, type AIStatus } from "../lib/api";

// "Full AI check": asks the pre-grader to run every AI check on this copy now
// (photos, slab label, outline, condition; ~2-3 minutes), and the badge for
// its result. Raw listings go by listing (sent for odds first if they never
// were), graded listings by their feed id, anything else by copy id.

const LABEL: Record<string, string> = {
  not_checked: "not AI checked", waiting_pregrade: "AI after the pre-grade…", skipped: "AI skipped", sending: "sending photos…", queued: "AI queued", checking: "AI checking…",
  clean: "AI validated ✓", issues: "AI validated · issues", removed: "AI: removed", failed: "AI check failed", partial: "AI: partly checked",
};
const TONE: Record<string, string> = {
  clean: "border-emerald-800 bg-emerald-950/50 text-emerald-200", issues: "border-amber-800 bg-amber-950/40 text-amber-200",
  removed: "border-rose-900 bg-rose-950/40 text-rose-200", failed: "border-rose-900 bg-rose-950/30 text-rose-300",
  queued: "border-sky-900 bg-sky-950/40 text-sky-200", checking: "border-sky-900 bg-sky-950/40 text-sky-200",
  sending: "border-sky-900 bg-sky-950/40 text-sky-200", waiting_pregrade: "border-indigo-900 bg-indigo-950/40 text-indigo-200",
  skipped: "border-gray-700 text-gray-500",
};
const busyStates = new Set(["sending", "queued", "checking"]);

export default function AICheck({ initial, copyId, feedId, source, listingId }: {
  initial?: AIStatus | null; copyId?: number; feedId?: string; source?: string; listingId?: string;
}) {
  const [ai, setAi] = useState<AIStatus | null>(initial ?? null);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => setAi(initial ?? null), [initial]);
  const timer = useRef<number | null>(null);

  const ask = async () => {
    setAsking(true); setErr("");
    try {
      const body = listingId && source ? { source, listing_id: listingId } : copyId ? { copy_id: copyId } : feedId ? { feed_id: feedId } : null;
      if (!body) return;
      setAi((await requestAICheck(body)).ai);
    } catch (e) {
      setErr(String(e).replace(/^Error: /, ""));
    } finally {
      setAsking(false);
    }
  };

  // while it runs: ask the tracker (which asks the pre-grader) every 20 s;
  // while photos are still being sent, ask again to rush once there's a copy
  useEffect(() => {
    if (!ai || !busyStates.has(ai.state)) return;
    timer.current = window.setTimeout(async () => {
      try {
        if (ai.state === "sending") {
          await ask();
          return;
        }
        const cid = ai.copy_id ?? copyId, fid = ai.feed_id ?? feedId;
        const r = await fetchAIStatus(cid ? [cid] : [], fid ? [fid] : [], true);
        const next = (cid && r.statuses[`copy:${cid}`]) || (fid && r.statuses[`feed:${fid}`]);
        if (next) setAi(next);
      } catch { /* keep the last state */ }
    }, ai.state === "sending" ? 30000 : 20000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = ai?.state ?? "not_checked";
  const title = [
    ai?.issues?.length ? `Found: ${ai.issues.join(", ")}` : "",
    ai?.removed ? `Removed: ${ai.removed}` : "",
    ai?.error ? `Error: ${ai.error}` : "",
    ai?.checked_at ? `Checked ${new Date(ai.checked_at).toLocaleString()}` : "",
    "Full AI check: slab label (graded), outline, corners and edges",
  ].filter(Boolean).join("\n");
  const showButton = !busyStates.has(state) && state !== "waiting_pregrade";
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      {state !== "not_checked" && (
        ai?.review_url
          ? <a href={ai.review_url} target="_blank" rel="noreferrer" title={title} className={`px-1.5 py-0.5 rounded border ${TONE[state] ?? "border-gray-700 text-gray-400"}`}>
              {LABEL[state]}{state === "queued" && ai?.ahead ? ` (${ai.ahead} ahead)` : ""}
            </a>
          : <span title={title} className={`px-1.5 py-0.5 rounded border ${TONE[state] ?? "border-gray-700 text-gray-400"}`}>
              {LABEL[state]}{state === "queued" && ai?.ahead ? ` (${ai.ahead} ahead)` : ""}
            </span>
      )}
      {showButton && (
        <button onClick={ask} disabled={asking} title="Run every AI check on this copy now (~3 minutes)"
          className="text-indigo-300 hover:text-indigo-200 disabled:opacity-50">
          {asking ? "asking…" : state === "not_checked" ? "Full AI check" : state === "failed" ? "retry" : "re-check"}
        </button>
      )}
      {err && <span className="text-rose-400" title={err}>{err.includes("Sign in") ? "sign in" : err.length > 60 ? err.slice(0, 60) + "…" : err}</span>}
    </span>
  );
}
