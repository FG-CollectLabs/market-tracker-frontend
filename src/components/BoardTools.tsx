import { useEffect, useRef, useState } from "react";
import { bulkCheckGradeOdds, chainAICheck, type ChainFilter } from "../lib/api";

// AutoMore: loads the next page when its row scrolls into view (infinite
// scroll), with the button kept for keyboards and as a fallback.
export function AutoMore({ remaining, page, onMore }: { remaining: number; page: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || remaining <= 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) onMore(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [remaining, onMore]);
  if (remaining <= 0) return null;
  return (
    <button ref={ref} onClick={onMore} className="w-full py-2 text-xs text-indigo-300 hover:text-indigo-200 border-t border-gray-800">
      Show {Math.min(page, remaining)} more of {remaining}
    </button>
  );
}

// CheckAll: "check centering for all" on the copies a board is showing:
// the never-checked ones with front and back photos go to the grading
// predictor (up to 300 a click, in the background).
export function CheckAll({ listingIds, source = "ebay" }: { listingIds: string[]; source?: "ebay" | "cc" }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (listingIds.length === 0 && !msg) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {listingIds.length > 0 && (
        <button type="button" disabled={busy}
          title="Send every copy in this view that hasn't been checked (front and back photos) to the grading predictor. Up to 300 a click; odds show in a few minutes."
          onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              const r = await bulkCheckGradeOdds(listingIds, source);
              const parts = [`${r.queued} sent`];
              if (r.already_checked) parts.push(`${r.already_checked} already checked`);
              if (r.no_photos) parts.push(`${r.no_photos} without front + back photos`);
              if (r.over_limit) parts.push(`${r.over_limit} over the ${r.limit} limit: click again later`);
              setMsg(`${parts.join(" · ")}. Odds show in a few minutes.`);
            } catch (e) {
              setMsg(`Couldn't send: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
          className="px-2 py-1 rounded border border-indigo-800 text-indigo-200 hover:bg-indigo-950/60 disabled:opacity-40">
          {busy ? "Sending…" : `Check centering for all (${listingIds.length})`}
        </button>
      )}
      {msg && <span className="text-gray-400">{msg}</span>}
    </span>
  );
}

// Pre-grade, then AI check: the programmatic pre-grade first, then the AI
// check on the copies that pass, each as its pre-grade lands (server-side;
// up to 300 copies and 50 AI checks a click).
export function ChainCheck({ listingIds, source = "ebay", label, compact }: { listingIds: string[]; source?: "ebay" | "cc"; label?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChainFilter>("ten_possible");
  const [minP, setMinP] = useState(25);
  if (listingIds.length === 0 && !msg) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      {listingIds.length > 0 && <>
        <button type="button" disabled={busy}
          title="The programmatic pre-grade first (centering, corners, edges), then the AI check on the copies that pass, each as soon as its pre-grade lands. Runs on the server."
          onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              const r = await chainAICheck(listingIds.map((id) => ({ source, listing_id: id })), filter, filter === "min_p" ? minP / 100 : undefined);
              const parts = [`${r.waiting_pregrade} pre-grading, AI next`];
              if (r.rushed) parts.push(`${r.rushed} AI-queued now`);
              if (r.skipped) parts.push(`${r.skipped} skipped`);
              if (r.failed) parts.push(`${r.failed} couldn't be sent`);
              if (r.over_limit) parts.push(`${r.over_limit} over the ${r.item_limit} limit`);
              setMsg(`${parts.join(" · ")}. Up to ${r.ai_limit} AI checks this run.`);
            } catch (e) {
              setMsg(`Couldn't start: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
          className="px-2 py-1 rounded border border-fuchsia-800 text-fuchsia-200 hover:bg-fuchsia-950/60 disabled:opacity-40">
          {busy ? "Starting…" : `${label ?? "Pre-grade → AI"} (${listingIds.length})`}
        </button>
        {!compact && <select value={filter} onChange={(e) => setFilter(e.target.value as ChainFilter)} title="Which pre-graded copies go on to the AI check"
          className="rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-200">
          <option value="ten_possible">if centering allows a 10</option>
          <option value="min_p">if PSA 10 odds ≥</option>
          <option value="all">all of them</option>
        </select>}
        {!compact && filter === "min_p" && <><input value={minP} onChange={(e) => setMinP(Math.max(1, Math.min(99, Number(e.target.value) || 0)))}
          className="w-10 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-200 tabular-nums" />%</>}
      </>}
      {msg && <span className="text-gray-400">{msg}</span>}
    </span>
  );
}
