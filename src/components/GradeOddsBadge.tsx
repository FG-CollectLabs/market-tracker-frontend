import { useEffect, useState } from "react";
import { GRADE_ODDS_REFRESHED, refreshGradeOdds, type CopyRank, type GradeOdds } from "../lib/api";

// "Top 8% of PSA 10s": where this copy's centering sits among measured PSA 10s
// of the card (else its set, else all cards), each axis weighted by how much
// it moves PSA's odds.
export function RankChip({ rank }: { rank?: CopyRank[] }) {
  const r = rank?.find((x) => x.grade === "PSA 10");
  if (!r) return null;
  const top = Math.max(1, 100 - r.overall);
  const of = r.of === "this card" ? "" : r.of === "all cards" ? " (all cards)" : ` (${r.of})`;
  const tone = top <= 10 ? "border-green-800 text-green-200" : top <= 25 ? "border-sky-800 text-sky-200"
    : top <= 50 ? "border-gray-700 text-gray-300" : "border-gray-800 text-gray-500";
  const r9 = rank?.find((x) => x.grade === "PSA 9");
  const tip = [
    `Better centered than ${r.overall}% of ${r.n} measured PSA 10s of ${r.of}.`,
    `Each axis is weighted by how much it moves PSA's odds of a 10.`,
    `Front alone: top ${Math.max(1, 100 - r.front)}% · back alone: top ${Math.max(1, 100 - r.back)}%.`,
    r9 ? `Among ${r9.n} PSA 9s of ${r9.of}: top ${Math.max(1, 100 - r9.overall)}%.` : "",
    "Centering and corner shape only; surface and edges aren't measured.",
  ].filter(Boolean).join("\n");
  return <span className={`px-1.5 py-0.5 rounded border tabular-nums ${tone}`} title={tip}>Top {top}% of PSA 10s{of}</span>;
}

// ↻: re-read this copy's odds from the grading predictor now (after fixing
// it there), then reload the board so adjusted odds and EV recompute.
function RefreshOdds({ o, onDone }: { o: GradeOdds; onDone: (n: GradeOdds) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (o.copy_id == null) return null;
  return (
    <button type="button" disabled={busy} title={err ?? "Get this copy's latest measurement from the grading predictor"}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true); setErr(null);
        try {
          const n = await refreshGradeOdds(o.id);
          onDone(n);
          window.dispatchEvent(new Event(GRADE_ODDS_REFRESHED));
        } catch (x) {
          setErr(String(x));
        } finally {
          setBusy(false);
        }
      }}
      className={`${err ? "text-red-400" : "text-gray-500 hover:text-indigo-300"} disabled:opacity-40`}>
      {busy ? "…" : "↻"}
    </button>
  );
}

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString(undefined, { maximumFractionDigits: Math.abs(c) >= 10000 ? 0 : 2 })}`;

const STATUS: Record<string, string> = {
  pending: "sending to the grading predictor",
  measuring: "measuring centering…",
  unmeasurable: "photos couldn't be measured",
  failed: "couldn't send",
  timeout: "no result after 30 minutes",
};

// A raw copy's grade odds, one line: "PSA 10 62% (prior 39%) · centering
// front 53/47 · back 58/42", the EV when there is one, and the review link.
export default function GradeOddsBadge({ o: given, compact }: { o: GradeOdds; compact?: boolean }) {
  const [o, setO] = useState(given);
  useEffect(() => setO(given), [given]);
  if (o.status !== "ready") {
    return (
      <span className="text-[11px] text-gray-500" title={o.error}>
        Grade odds: {STATUS[o.status] ?? o.status}
        {o.review_url && <> · <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a></>}
        {" "}<RefreshOdds o={o} onDone={setO} />
      </span>
    );
  }
  const p = o.psa10_p ?? 0;
  const tone = p >= 0.6 ? "border-green-900 bg-green-950/50 text-green-200"
    : p >= 0.35 ? "border-sky-900 bg-sky-950/50 text-sky-200"
    : "border-gray-700 bg-gray-900 text-gray-300";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
      <span className={`px-1.5 py-0.5 rounded border tabular-nums ${tone}`}
        title="Centering only: assumes clean corners, edges and surface">
        {compact ? `PSA 10 ${(p * 100).toFixed(0)}%` : o.summary ?? `PSA 10 ${(p * 100).toFixed(0)}%`}
      </span>
      {compact && o.psa10_prior != null && <span className="text-gray-500 tabular-nums">prior {(o.psa10_prior * 100).toFixed(0)}%</span>}
      <RankChip rank={o.rank} />
      {o.ev_cents != null && (
        <span className={`tabular-nums ${o.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`} title={o.ev_note}>
          EV {usd(o.ev_cents)}
        </span>
      )}
      {o.review_url && <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a>}
      <RefreshOdds o={o} onDone={setO} />
    </span>
  );
}
