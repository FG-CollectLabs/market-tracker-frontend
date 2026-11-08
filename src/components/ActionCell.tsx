import { useState } from "react";
import { Link } from "react-router-dom";
import { HIT_REASONS, clearHitReview, reviewHit, saveBidResult, type HitReason, type HitReview, type OddsExplain } from "../lib/api";

// The action on a listing: pass on it (it moves to the Passed view) or bid
// with a max, then report what happened (won and what you paid, lost, didn't
// bid). The rest (in hand, graded, sold) is on Watchlist → Bids & results.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const toCents = (v: string) => {
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

export type Show = "open" | "bidding" | "passed" | "all";
export function showOf(r?: HitReview): Exclude<Show, "all"> {
  if (r?.status === "pass") return "passed";
  if (r?.status === "interested" || r?.result) return "bidding";
  return "open";
}

export function ShowFilter({ show, setShow, counts }: { show: Show; setShow: (s: Show) => void; counts: Record<Exclude<Show, "all">, number> }) {
  const opts: [Show, string, string][] = [
    ["open", "To review", "Not passed or bid on yet"],
    ["bidding", "Bidding", "Marked to bid (with your max), and what came of it"],
    ["passed", "Passed", "Set aside: undo from here"],
    ["all", "All", ""],
  ];
  return (
    <div className="inline-flex rounded border border-gray-700 overflow-hidden text-xs" role="group" aria-label="Action">
      {opts.map(([k, l, hint]) => (
        <button key={k} onClick={() => setShow(k)} aria-pressed={show === k} title={hint}
          className={`px-2 py-1 ${show === k ? "bg-gray-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>
          {l}{k !== "all" && <span className="text-gray-500 tabular-nums"> {counts[k]}</span>}
        </button>
      ))}
    </div>
  );
}

export function countShows<T>(rows: T[], review: (r: T) => HitReview | undefined) {
  const c = { open: 0, bidding: 0, passed: 0 };
  for (const r of rows) c[showOf(review(r))]++;
  return c;
}

export default function ActionCell({ listingId, displayKey, priceCents, review, shown, onChange }: {
  listingId: string; displayKey: string; priceCents?: number; review?: HitReview; shown?: unknown;
  onChange: (r: HitReview | undefined) => void;
}) {
  const [mode, setMode] = useState<"" | "bid" | "pass" | "won" | "lost">("");
  const [val, setVal] = useState("");
  const [reason, setReason] = useState<HitReason>("not_interested");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = () => new Date().toISOString();
  const run = async (f: () => Promise<HitReview | undefined>) => {
    setBusy(true); setErr(null);
    try { onChange(await f()); setMode(""); setVal(""); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const btn = "px-1.5 py-0.5 rounded border text-[11px] disabled:opacity-40";
  const inp = "w-16 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-200 tabular-nums";

  const bidForm = (label: string, submit: () => void) => (
    <span className="inline-flex items-center gap-1">
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="$" className={inp} aria-label={label}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setMode(""); }} />
      <button disabled={busy} onClick={submit} className={`${btn} border-indigo-800 text-indigo-200`}>Save</button>
      <button onClick={() => setMode("")} className="text-[11px] text-gray-500">×</button>
    </span>
  );

  let body;
  if (mode === "bid") {
    body = bidForm("Max bid, all-in", () => run(async () => {
      const max = toCents(val);
      await reviewHit({ source: "ebay", listing_id: listingId, display_key: displayKey, status: "interested", max_bid_cents: max, price_cents: priceCents, shown });
      return { ...(review ?? {}), status: "interested", max_bid_cents: max, reviewed_at: now() } as HitReview;
    }));
  } else if (mode === "pass") {
    body = (
      <span className="inline-flex items-center gap-1">
        <select value={reason} onChange={(e) => setReason(e.target.value as HitReason)} className="rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-200">
          {HIT_REASONS.map((r) => <option key={r.key} value={r.key} title={r.hint}>{r.label}</option>)}
        </select>
        <button disabled={busy} className={`${btn} border-gray-600 text-gray-200`} onClick={() => run(async () => {
          await reviewHit({ source: "ebay", listing_id: listingId, display_key: displayKey, status: "pass", reason, price_cents: priceCents });
          return { status: "pass", reason, reviewed_at: now() } as HitReview;
        })}>Pass</button>
        <button onClick={() => setMode("")} className="text-[11px] text-gray-500">×</button>
      </span>
    );
  } else if (mode === "won" || mode === "lost") {
    const result = mode;
    body = bidForm(result === "won" ? "Paid, all-in" : "What it went for (optional)", () => run(async () => {
      const cents = toCents(val);
      await saveBidResult({ source: "ebay", listing_id: listingId, display_key: displayKey, step: "result", result, cents });
      return { ...(review ?? { reviewed_at: now() }), status: "interested", result, result_cents: cents } as HitReview;
    }));
  } else if (review?.status === "pass") {
    body = (
      <span className="inline-flex items-center gap-1 text-[11px]">
        <span className="text-gray-500">Passed{review.reason ? ` · ${HIT_REASONS.find((r) => r.key === review.reason)?.label ?? review.reason}` : ""}</span>
        <button disabled={busy} className="text-indigo-300 hover:text-indigo-200" onClick={() => run(async () => { await clearHitReview("ebay", listingId); return undefined; })}>undo</button>
      </span>
    );
  } else if (review?.result) {
    const r = review.result;
    body = (
      <span className="inline-flex flex-col text-[11px]">
        <span className={r === "won" ? "text-green-300" : "text-gray-400"}>
          {r === "won" ? `Won ${usd(review.result_cents)}` : r === "lost" ? `Lost${review.result_cents != null ? ` at ${usd(review.result_cents)}` : ""}` : "Didn't bid"}
          {review.max_bid_cents != null && <span className="text-gray-500"> · max {usd(review.max_bid_cents)}</span>}
        </span>
        {r === "won" && <Link to="/watchlist?view=bids" className="text-indigo-300/80 hover:text-indigo-200">in hand → grade → sold</Link>}
      </span>
    );
  } else if (review?.status === "interested") {
    body = (
      <span className="inline-flex flex-col gap-0.5 text-[11px]">
        <button onClick={() => { setVal(review.max_bid_cents != null ? (review.max_bid_cents / 100).toFixed(2) : ""); setMode("bid"); }}
          className="text-left text-indigo-200" title="Your max bid, all-in: click to change">Bid ≤ {usd(review.max_bid_cents)}</button>
        <span className="inline-flex gap-1">
          <button className={`${btn} border-green-900 text-green-300`} onClick={() => setMode("won")}>Won</button>
          <button className={`${btn} border-gray-700 text-gray-300`} onClick={() => setMode("lost")}>Lost</button>
          <button disabled={busy} className={`${btn} border-gray-800 text-gray-500`} title="Decided not to bid after all" onClick={() => run(async () => {
            await saveBidResult({ source: "ebay", listing_id: listingId, display_key: displayKey, step: "result", result: "no_bid" });
            return { ...review, result: "no_bid" } as HitReview;
          })}>Skip</button>
        </span>
      </span>
    );
  } else {
    body = (
      <span className="inline-flex gap-1">
        <button className={`${btn} border-indigo-800 text-indigo-200`} onClick={() => setMode("bid")} title="Plan to bid: set your max (all-in)">Bid</button>
        <button className={`${btn} border-gray-700 text-gray-400`} onClick={() => setMode("pass")} title="Set aside (moves to Passed)">Pass</button>
      </span>
    );
  }
  return (
    <div className="whitespace-nowrap">
      {body}
      {err && <div className="text-[10px] text-red-400" title={err}>couldn't save</div>}
    </div>
  );
}

// Why the odds are what they are: percentile chip, summary and per-axis
// effects on hover.
export function ExplainChip({ e }: { e?: OddsExplain }) {
  if (!e) return null;
  const tip = [e.summary, ...(e.axes ?? []).map((a) => `${a.axis.replace("_", " ")} ${a.measured}: ${a.effect_pp > 0 ? "+" : ""}${a.effect_pp.toFixed(1)} pts${a.typical ? ` (typical ${a.typical})` : ""}${a.note ? ` (${a.note})` : ""}`)].join("\n");
  return (
    <div className="mt-0.5 max-w-[16rem] text-[10px] leading-snug" title={tip}>
      {e.percentile != null && (
        <span className={`mr-1 px-1 rounded ${e.percentile >= 75 ? "bg-green-900/50 text-green-200" : e.percentile >= 40 ? "bg-gray-800 text-gray-300" : "bg-red-900/40 text-red-200"}`}>
          better centered than {Math.round(e.percentile)}%
        </span>
      )}
      <span className="text-gray-500">{e.summary.replace(/ · better centered than \d+% of [^·]+$/, "")}</span>
    </div>
  );
}
