import AICheck from "./AICheck";
import ManualCenteringBadge from "./ManualCenteringBadge";
import { useEffect, useState } from "react";
import { GRADE_ODDS_REFRESHED, refreshGradeOdds, type CopyRank, type GradeOdds } from "../lib/api";

// "Top 8% of PSA 10s": where this copy's centering sits among measured graded
// copies of a grade (the card, else its set, else its rarity in its era,
// else all cards), each axis weighted by how much it moves that grader's
// odds. Chips: PSA 10, the best pristine grade measured (CGC 10 Pristine,
// else CGC 10, BGS Black Label, TAG 10), and every graded copy of the
// card's rarity in its era.
const topOf = (overall: number) => Math.max(1, 100 - overall);
const tone = (top: number) => top <= 10 ? "border-green-800 text-green-200" : top <= 25 ? "border-sky-800 text-sky-200"
  : top <= 50 ? "border-gray-700 text-gray-300" : "border-gray-800 text-gray-500";
const ofLabel = (r: CopyRank) => (r.of === "this card" ? "" : r.of === "all cards" ? " (all cards)" : ` (${r.of})`);
const PRISTINE = ["CGC 10 Pristine", "BGS 10 Black Label", "TAG 10", "CGC 10"];

export function RankChip({ rank, pop }: { rank?: CopyRank[]; pop?: CopyRank }) {
  const r = rank?.find((x) => x.grade === "PSA 10");
  const pr = PRISTINE.map((g) => rank?.find((x) => x.grade === g)).find(Boolean);
  if (!r && !pr && !pop) return null;
  const tip = [
    ...(rank ?? []).map((x) => `${x.grade}: top ${topOf(x.overall)}% of ${x.n} measured (${x.of}) · front top ${topOf(x.front)}% · back top ${topOf(x.back)}%`),
    pop ? `All graded copies (any grade) of ${pop.of}: top ${topOf(pop.overall)}% of ${pop.n}` : "",
    "Centering and corner shape only; surface and edges aren't measured.",
  ].filter(Boolean).join("\n");
  const chip = (x: CopyRank, label: string) => (
    <span key={label} className={`px-1.5 py-0.5 rounded border tabular-nums ${tone(topOf(x.overall))}`} title={tip}>Top {topOf(x.overall)}% of {label}</span>
  );
  return (
    <>
      {r && chip(r, `PSA 10s${ofLabel(r)}`)}
      {pr && chip(pr, `${pr.grade}s`)}
      {pop && chip(pop, pop.of === "all cards" ? "all graded" : `all graded ${pop.of}`)}
    </>
  );
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
  if (o.status === "needs_manual_centering") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[11px]">
        <ManualCenteringBadge reasons={o.centering_check?.reasons} url={o.review_url} compact={compact} />
        <RefreshOdds o={o} onDone={setO} />
      </span>
    );
  }
  if (o.status !== "ready") {
    return (
      <span className="text-[11px] text-gray-500" title={o.error}>
        Grade odds: {STATUS[o.status] ?? o.status}
        {o.review_url && <> · <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a></>}
        {" "}<RefreshOdds o={o} onDone={setO} />
        {(o.copy_id || o.listing_id) && <>{" "}<AICheck initial={o.ai} copyId={o.copy_id} source={o.listing_id ? o.source : undefined} listingId={o.listing_id} /></>}
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
      <RankChip rank={o.rank} pop={o.rank_population} />
      {o.ev_cents != null && (
        <span className={`tabular-nums ${o.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`} title={o.ev_note}>
          EV {usd(o.ev_cents)}
        </span>
      )}
      {(o.centering_check?.ai_outline === "" || o.centering_check?.ai_outline === "fixing") && (
        <span className="text-amber-300/80" title="The pre-grader's AI is still checking this copy's outline: the odds may change">AI checking outline…</span>
      )}
      {o.review_url && <a href={o.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">check</a>}
      <RefreshOdds o={o} onDone={setO} />
      {(o.copy_id || o.listing_id) && <AICheck initial={o.ai} copyId={o.copy_id} source={o.listing_id ? o.source : undefined} listingId={o.listing_id} />}
    </span>
  );
}
