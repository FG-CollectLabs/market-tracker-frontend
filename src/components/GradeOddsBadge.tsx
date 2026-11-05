import type { GradeOdds } from "../lib/api";

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
export default function GradeOddsBadge({ o, compact }: { o: GradeOdds; compact?: boolean }) {
  if (o.status !== "ready") {
    return (
      <span className="text-[11px] text-gray-500" title={o.error}>
        Grade odds: {STATUS[o.status] ?? o.status}
        {o.review_url && <> · <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a></>}
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
      {o.ev_cents != null && (
        <span className={`tabular-nums ${o.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`} title={o.ev_note}>
          EV {usd(o.ev_cents)}
        </span>
      )}
      {o.review_url && <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a>}
    </span>
  );
}
