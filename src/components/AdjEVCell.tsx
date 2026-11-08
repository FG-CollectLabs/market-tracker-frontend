import { useEffect, useRef, useState } from "react";
import { sendOddsFeedback, type AdjEV, type GradeOdds, type OddsIssue, type OddsVerdict } from "../lib/api";

// The grading EV with odds tailored to the copy: the predictor's measured
// odds when it has looked at the photos, else the card's no-photo baseline.
// One line, the working and caveats in the tooltip.

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString(undefined, { maximumFractionDigits: Math.abs(c) >= 10000 ? 0 : 2 })}`;

const SOURCE: Record<AdjEV["ev_source"], { label: string; cls: string; hint: string }> = {
  measured: { label: "measured", cls: "border-green-900 text-green-300", hint: "Odds from this copy's photos (centering and corners)" },
  card_baseline: { label: "baseline", cls: "border-gray-700 text-gray-400", hint: "Not measured yet: the card's odds at typical centering, anchored to its PSA gem rate" },
  listing_based: { label: "optimistic", cls: "border-amber-900 text-amber-300", hint: "No PSA gem rate to anchor to: odds from listings, which over-represent 10s" },
  what_if: { label: "what-if", cls: "border-indigo-900 text-indigo-300", hint: "Odds at the centering you set" },
  population: { label: "gem rate", cls: "border-gray-700 text-gray-500", hint: "No pre-grader odds for this card yet: its own PSA gem rate and CGC population" },
};

export default function AdjEVCell({ ev }: { ev?: AdjEV }) {
  if (!ev) return <span className="text-gray-600">–</span>;
  const s = SOURCE[ev.ev_source];
  const tip = [
    ev.note,
    `PSA 10 odds used: ${(ev.p10 * 100).toFixed(0)}%${ev.population_p10 ? ` (population ${(ev.population_p10 * 100).toFixed(0)}%)` : ""}`,
    ev.centering_cap ? `Centering caps PSA at ${ev.centering_cap}` : "",
    ev.basis ? `Pre-grader ${ev.basis}` : "",
    ev.pop_note ? `At the public gem rate: ${ev.pop_note}` : "",
    ev.caveat,
  ].filter(Boolean).join("\n");
  return (
    <span className="inline-flex flex-col items-end gap-0.5" title={tip}>
      {ev.ev_cents != null
        ? <span className={`tabular-nums font-semibold ${ev.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`} title="EV with the adjusted odds">{usd(ev.ev_cents)}</span>
        : <span className="text-gray-500">no tier</span>}
      {ev.pop_ev_cents != null && (
        <span className="text-[10px] text-gray-500 tabular-nums" title={`At the public gem rate${ev.population_p10 ? ` (${(ev.population_p10 * 100).toFixed(0)}%)` : ""}: ${ev.pop_note ?? ""}`}>
          gem rate {usd(ev.pop_ev_cents)}
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className={`px-1 rounded border text-[10px] ${s.cls}`} title={s.hint}>{s.label}{ev.pending ? " · measuring" : ""}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{(ev.p10 * 100).toFixed(0)}%</span>
      </span>
      {ev.centering_cap && <span className="text-[10px] text-amber-300">cap PSA {ev.centering_cap}</span>}
    </span>
  );
}

const VERDICTS: [OddsVerdict, string, string][] = [
  ["false_positive", "Odds too high", "The copy has flaws the odds missed"],
  ["false_negative", "Odds too low", "The copy looks better than the odds say"],
  ["bad_measurement", "Measurement wrong", "Outline or centering mismeasured"],
  ["wrong_card", "Wrong card", "Not this card, or a different variant"],
  ["unusable_photos", "Photos unusable", "Glare, sleeve, stock photo, no back"],
  ["looks_right", "Looks right", "The odds match what you see"],
];
const ISSUES: [OddsIssue, string][] = [
  ["corner_whitening", "Corner whitening"], ["corner_ding", "Corner ding"], ["edge_wear", "Edge wear"], ["surface_scratch", "Surface scratch"],
  ["print_line", "Print line"], ["dent_or_crease", "Dent / crease"], ["centering_mismeasured", "Centering mismeasured"], ["outline_wrong", "Outline wrong"],
  ["sleeve_or_glare", "Sleeve / glare"], ["back_not_shown", "Back not shown"], ["stock_photo", "Stock photo"], ["other", "Other"],
];
const VERDICT_LABEL = Object.fromEntries(VERDICTS.map(([k, l]) => [k, l])) as Record<OddsVerdict, string>;

// Flag a measured copy's odds for the grading predictor to review.
export function OddsFlag({ odds, shown }: { odds: GradeOdds; shown?: AdjEV }) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<OddsVerdict>("false_positive");
  const [issues, setIssues] = useState<OddsIssue[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OddsVerdict | undefined>(odds.feedback);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (odds.status !== "ready" && odds.status !== "unmeasurable") return null;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await sendOddsFeedback(odds.id, { verdict, issues, note: note.trim() || undefined,
        odds_shown: { psa10_p: odds.psa10_p, psa10_prior: odds.psa10_prior, summary: odds.summary, adj_ev: shown,
          snapshot_version: odds.snapshot_version, model_version: odds.model_version } });
      setDone(verdict); setOpen(false);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <span ref={ref} className="relative inline-block text-[11px]">
      <button onClick={() => setOpen(!open)} title="Tell the grading predictor what it got wrong (or right) on this copy"
        className={`px-1 rounded border ${done ? "border-indigo-900 text-indigo-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
        {done ? `flagged: ${VERDICT_LABEL[done]}` : "flag"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl space-y-2 text-left">
          <div className="text-gray-300 font-medium">Feedback for the pre-grader</div>
          <div className="space-y-1">
            {VERDICTS.map(([k, l, h]) => (
              <label key={k} className="flex items-start gap-1.5 text-gray-300" title={h}>
                <input type="radio" name={`v-${odds.id}`} checked={verdict === k} onChange={() => setVerdict(k)} className="mt-0.5" />
                <span>{l} <span className="text-gray-500">· {h}</span></span>
              </label>
            ))}
          </div>
          {verdict !== "looks_right" && (
            <div className="flex flex-wrap gap-1">
              {ISSUES.map(([k, l]) => (
                <button key={k} onClick={() => setIssues((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}
                  className={`px-1.5 py-0.5 rounded border ${issues.includes(k) ? "border-indigo-700 bg-indigo-950 text-indigo-200" : "border-gray-700 text-gray-400"}`}>{l}</button>
              ))}
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you see (optional)"
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-200 placeholder:text-gray-600" />
          <div className="flex items-center justify-between">
            {odds.review_url ? <a href={odds.review_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">open in the pre-grader ↗</a> : <span />}
            <button disabled={busy} onClick={submit} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "sending…" : "Send"}</button>
          </div>
          {err && <div className="text-red-300">{err}</div>}
        </div>
      )}
    </span>
  );
}

const pc = (p?: number) => (p == null ? "–" : `${(p * 100).toFixed(0)}%`);

// PSA 10 odds two ways: the public gem rate and the adjusted (this copy's
// measured odds, or the card's baseline until it's measured).
export function PSAOddsCell({ ev, popFallback }: { ev?: AdjEV; popFallback?: number }) {
  const pop = ev?.population_p10 ?? popFallback;
  return (
    <span className="inline-flex flex-col items-end tabular-nums" title="Gem rate: the card's PSA population 10 rate. Adjusted: the pre-grader's odds for this copy (the gem rate until its photos are measured).">
      <span className="text-gray-300"><span className="text-[10px] text-gray-500">gem </span>{pc(pop)}</span>
      {ev && (
        <span className={ev.ev_source === "measured" ? "text-green-300" : "text-gray-400"}>
          <span className="text-[10px] text-gray-500">adj </span>{pc(ev.p10)}
        </span>
      )}
    </span>
  );
}

const CGC_GRADES: [string, string][] = [["10 pristine", "Pristine"], ["10", "10"], ["9", "9"]];

// CGC: Pristine / 10 / 9 odds (adjusted, population on hover) and the EV at
// adjusted and population odds.
export function CGCCell({ ev }: { ev?: AdjEV }) {
  const g = ev?.cgc;
  if (!g) return <span className="text-gray-600">–</span>;
  const tip = [
    g.source === "listing_based" ? "No CGC population for this card: listing-based odds (optimistic)."
      : g.source === "population" ? "No pre-grader odds yet: the card's CGC population (gem rates)."
      : "Odds: the card's CGC population, adjusted by the pre-grader's centering effect for this copy.",
    `Population: ${CGC_GRADES.map(([k, l]) => `${l} ${pc(g.population?.[k])}`).join(" · ")}`,
    g.note ? `Adjusted: ${g.note}` : "",
    g.pop_note ? `At population odds: ${g.pop_note}` : "",
  ].filter(Boolean).join("\n");
  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums" title={tip}>
      {g.population && (
        <span className="text-[11px] text-gray-400 whitespace-nowrap" title="CGC gem rates: the card's CGC population">
          <span className="text-[10px] text-gray-500">gem </span>{CGC_GRADES.map(([k, l]) => `${l} ${pc(g.population?.[k])}`).join(" · ")}
        </span>
      )}
      {g.source !== "population" && (
        <span className={`text-[11px] whitespace-nowrap ${ev?.ev_source === "measured" ? "text-green-300" : "text-gray-300"}`} title="Adjusted for this copy by the pre-grader (the card's baseline until its photos are measured)">
          <span className="text-[10px] text-gray-500">adj </span>{CGC_GRADES.map(([k, l]) => `${l} ${pc(g.odds[k])}`).join(" · ")}
        </span>
      )}
      {g.ev_cents != null
        ? <span className={`font-semibold ${g.ev_cents >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(g.ev_cents)}</span>
        : <span className="text-gray-500 text-[11px]">no tier</span>}
      {g.pop_ev_cents != null && <span className="text-[10px] text-gray-500">gem rate {usd(g.pop_ev_cents)}</span>}
      {g.source === "listing_based" && <span className="text-[10px] text-amber-300">optimistic</span>}
    </span>
  );
}
