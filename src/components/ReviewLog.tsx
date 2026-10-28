import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HIT_REASONS, clearHitReview, fetchHitReviews, reviewHit, type HitReason, type ReviewLogRow } from "../lib/api";

// Everything set aside, noted or marked interested, newest first: find a
// wrong call and change it (or restore the listing). Reviews of listings
// that ended over 30 days ago are cleaned up by the server.

const usd = (c?: number) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS_FILTERS: [string, string][] = [["", "All"], ["pass", "Set aside"], ["interested", "Interested"], ["note", "Notes"]];

function label(r: ReviewLogRow): string {
  if (r.status === "interested") return `★ Interested${r.max_bid_cents != null ? ` · max ${usd(r.max_bid_cents)}` : ""}`;
  if (r.status === "note") return "Note";
  if (r.reason === "no_back_photo") return "Set aside · No back photo (auto)";
  return `Set aside · ${HIT_REASONS.find((x) => x.key === r.reason)?.label ?? "no reason"}`;
}

export default function ReviewLog() {
  const [rows, setRows] = useState<ReviewLogRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pruned, setPruned] = useState(0);

  const load = useCallback(() => {
    fetchHitReviews(days, status).then((r) => { setRows(r.reviews); setPruned(r.pruned); }).catch((e: Error) => setError(e.message));
  }, [days, status]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !f || `${r.card_name ?? ""} ${r.title ?? ""} ${r.note ?? ""}`.toLowerCase().includes(f));
  }, [rows, q]);

  const act = async (r: ReviewLogRow, f: () => Promise<unknown>) => {
    const k = `${r.source}:${r.listing_id}`;
    setBusy(k);
    setError(null);
    try {
      await f();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Change a review: to interested, to another set-aside reason, or restore.
  const change = (r: ReviewLogRow, to: string) => {
    if (to === "restore") return act(r, () => clearHitReview(r.source, r.listing_id));
    const base = { source: r.source, listing_id: r.listing_id, display_key: r.display_key ?? "", note: r.note, price_cents: r.price_cents };
    if (to === "interested") return act(r, () => reviewHit({ ...base, status: "interested", max_bid_cents: r.max_bid_cents }));
    return act(r, () => reviewHit({ ...base, status: "pass", reason: to as HitReason }));
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded border border-gray-700 overflow-hidden">
          {STATUS_FILTERS.map(([k, l]) => (
            <button key={k || "all"} onClick={() => setStatus(k)}
              className={`px-2 py-0.5 ${status === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>
          ))}
        </span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="flex-1 min-w-[8rem] bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" />
      </div>
      <p className="text-gray-500">
        {rows ? `${shown.length} of ${rows.length}` : "…"} · reviews of listings that ended over 30 days ago are cleaned up{pruned ? ` (${pruned} just now)` : ""}.
      </p>
      {error && <p className="text-red-400">{error}</p>}
      <div className="divide-y divide-gray-800">
        {shown.map((r) => {
          const k = `${r.source}:${r.listing_id}`;
          return (
            <div key={k} className={`py-2 flex gap-2 ${r.live ? "" : "opacity-60"}`}>
              {r.image_url ? <img src={r.image_url} alt="" loading="lazy" className="w-10 h-10 object-cover rounded-sm shrink-0 bg-gray-800" /> : <div className="w-10 h-10 rounded-sm shrink-0 bg-gray-800" />}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`px-1 rounded ${r.status === "interested" ? "bg-amber-500/90 text-black" : r.status === "note" ? "bg-gray-800 text-gray-300" : "border border-gray-600 text-gray-300"}`}>{label(r)}</span>
                  <span className="text-gray-500">{when(r.reviewed_at)}</span>
                  {!r.live && <span className="text-gray-500">· ended</span>}
                </div>
                {r.display_key
                  ? <Link to={`/cards/${encodeURIComponent(r.display_key)}`} className="text-gray-100 hover:text-indigo-300">{r.card_name} <span className="text-gray-500">#{r.card_number} · {r.set_name}</span></Link>
                  : <span className="text-gray-400">Unknown card</span>}
                <div className="truncate">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">{r.title ?? r.listing_id}</a> : <span className="text-gray-400">{r.title ?? r.listing_id}</span>}
                </div>
                <div className="text-gray-500">
                  {r.source === "fanatics" ? "Fanatics" : "eBay"}{r.kind ? ` · ${r.kind === "auction" ? "auction" : "Buy Now"}` : ""}{r.grade_key ? ` · ${r.grade_key.toUpperCase()}` : ""}
                  {" · "}{usd(r.price_cents)} when reviewed{r.now_cents != null && r.now_cents !== r.price_cents ? `, ${usd(r.now_cents)} now` : ""}
                </div>
                {r.note && <div className="text-amber-200/80">{r.note}</div>}
              </div>
              <select value="" disabled={busy === k} onChange={(e) => e.target.value && change(r, e.target.value)}
                className="self-start bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-gray-200 disabled:opacity-40">
                <option value="">Change…</option>
                <option value="restore">Restore (clear the review)</option>
                {r.status !== "interested" && <option value="interested">★ Interested</option>}
                {HIT_REASONS.filter((x) => !(r.status === "pass" && r.reason === x.key)).map((x) => <option key={x.key} value={x.key}>Set aside: {x.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      {rows && rows.length === 0 && <p className="text-gray-500">Nothing reviewed in this window.</p>}
    </div>
  );
}
