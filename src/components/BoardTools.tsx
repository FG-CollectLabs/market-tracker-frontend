import { useEffect, useRef, useState } from "react";
import { bulkCheckGradeOdds } from "../lib/api";

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
export function CheckAll({ listingIds }: { listingIds: string[] }) {
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
              const r = await bulkCheckGradeOdds(listingIds);
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
