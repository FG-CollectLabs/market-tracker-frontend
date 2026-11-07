import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBought, markBought, recordOutcome, type AdjEV, type BoughtCopy, type BoughtReport, type GradeOdds } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";

// Bought to grade: raw copies you bought from a listing, the pre-grade odds
// they had, and the grade each came back with. Every purchase and grade
// goes to the grading predictor: raw copies measured before grading, with
// their real grade, are what teach it.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const GRADE_ORDER: Record<string, string[]> = {
  PSA: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "authentic"],
  CGC: ["10 pristine", "10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "authentic"],
  BGS: ["10 black label", "10", "9.5", "9", "8.5", "8", "7", "authentic"],
  TAG: ["10", "9.5", "9", "8.5", "8", "7", "authentic"],
};

// "Bought" on a raw listing (or a pre-graded copy): asks the price, then
// marks it. A listing never pre-graded is sent to the predictor first.
export function BoughtButton({ listingId, oddsId, priceCents, shown, initial }: {
  listingId?: string; oddsId?: number; priceCents?: number; shown?: { adj_ev?: AdjEV; odds?: GradeOdds }; initial?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(priceCents != null ? (priceCents / 100).toFixed(2) : "");
  const [done, setDone] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const send = async (bought: boolean) => {
    setBusy(true); setErr(null);
    try {
      const c = Math.round(parseFloat(price) * 100);
      await markBought({ listing_id: listingId, odds_id: oddsId, bought, price_cents: bought && c > 0 ? c : undefined,
        shown: bought ? { adj_ev: shown?.adj_ev, psa10_p: shown?.odds?.psa10_p, snapshot_version: shown?.odds?.snapshot_version } : undefined });
      setDone(bought); setOpen(false);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <span ref={ref} className="relative inline-block text-[11px]">
      <button onClick={() => setOpen(!open)} title="You bought this copy to grade: track its grade against the pre-grade"
        className={`px-1 rounded border ${done ? "border-green-900 text-green-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
        {done ? "bought ✓" : "bought"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl space-y-2 text-left">
          {done ? (
            <>
              <div className="text-gray-300">Marked bought. It's under Watchlist → Bought to grade.</div>
              <button disabled={busy} onClick={() => send(false)} className="px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-50">Not bought after all</button>
            </>
          ) : (
            <>
              <div className="text-gray-300">What you paid, all-in</div>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="price $"
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-200 tabular-nums" />
              <div className="text-gray-500">Not pre-graded yet? Its photos go to the pre-grader now, so its grade can be checked against the odds.</div>
              <button disabled={busy} onClick={() => send(true)} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "saving…" : "Mark bought"}</button>
            </>
          )}
          {err && <div className="text-red-300">{err}</div>}
        </div>
      )}
    </span>
  );
}

export default function BoughtToGrade() {
  const [rep, setRep] = useState<BoughtReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<"awaiting" | "graded" | "all">("awaiting");
  const load = () => fetchBought().then(setRep).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  if (err) return <ErrorMsg msg={err} />;
  if (!rep) return <Spinner />;
  const s = rep.summary;
  const rows = rep.copies.filter((c) => show === "all" || (show === "graded" ? !!c.outcome : !c.outcome));
  const tile = "rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs";
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Raw copies you bought to grade, the pre-grade odds they had when you bought them, and the grade each came back with. Mark a copy
        bought from the Hunt list, a watch hit or a card page; enter the grade here when it's back. Both go to the pre-grader: raw copies
        measured before grading, with their real grade, are what make its odds better.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={tile}><div className="text-gray-500">Bought</div><div className="text-lg text-white tabular-nums">{s.bought}</div><div className="text-gray-500">{s.bought - s.graded} awaiting a grade</div></div>
        <div className={tile}><div className="text-gray-500">Graded</div><div className="text-lg text-white tabular-nums">{s.graded}</div><div className="text-gray-500">{s.psa_graded} by PSA with measured odds</div></div>
        <div className={tile}>
          <div className="text-gray-500">PSA 10s: actual vs expected</div>
          <div className="text-lg text-white tabular-nums">{s.psa_tens} <span className="text-sm text-gray-500">vs {s.psa_expected_tens != null ? s.psa_expected_tens.toFixed(1) : "–"}</span></div>
          <div className="text-gray-500">expected = the sum of each copy's measured P(10)</div>
        </div>
        <div className={tile} title={rep.note}>
          <div className="text-gray-500">Brier score</div>
          <div className="text-lg text-white tabular-nums">{s.psa_brier != null ? s.psa_brier.toFixed(3) : "–"}</div>
          <div className="text-gray-500">lower is better; 0.25 is a coin flip</div>
        </div>
      </div>
      <div className="inline-flex rounded border border-gray-700 overflow-hidden text-xs" role="group">
        {([["awaiting", "Awaiting a grade"], ["graded", "Graded"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setShow(k)} aria-pressed={show === k}
            className={`px-2.5 py-1 ${show === k ? "bg-indigo-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>{l}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{rep.copies.length === 0 ? "Nothing bought yet. Use \"bought\" on a Hunt list row or a watch hit." : "Nothing here."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left max-lg:!static">
              <tr>
                <th className="py-2 px-3 font-medium">Card</th>
                <th className="py-2 px-2 font-medium">Bought</th>
                <th className="py-2 px-2 font-medium text-right">Paid</th>
                <th className="py-2 px-2 font-medium">Pre-grade</th>
                <th className="py-2 px-2 font-medium text-right" title="The adjusted EV you saw when you bought it">EV then</th>
                <th className="py-2 px-3 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>{rows.map((c) => <Row key={c.odds.id} c={c} grades={rep.grades} onSaved={load} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ c, grades, onSaved }: { c: BoughtCopy; grades: BoughtReport["grades"]; onSaved: () => void }) {
  const ev = c.shown?.adj_ev?.ev_cents;
  return (
    <Fragment>
      <tr className="border-t border-gray-800 align-top">
        <td className="py-1.5 px-3">
          <div className="flex gap-2 items-start min-w-[14rem]">
            {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="w-8 h-11 object-cover rounded border border-gray-800" />}
            <div className="min-w-0">
              <Link to={`/cards/${c.display_key}`} className="text-gray-100 hover:text-indigo-300">{c.name}</Link>
              <span className="text-gray-500"> #{c.number} · {c.set_code}</span>
              {c.odds.source_ref
                ? <a href={c.odds.source_ref} target="_blank" rel="noreferrer" className="block truncate max-w-[20rem] text-indigo-300/80 hover:text-indigo-200">{c.title || "listing"}</a>
                : <div className="truncate max-w-[20rem] text-gray-500">{c.title}</div>}
            </div>
          </div>
        </td>
        <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">
          {new Date(c.bought_at).toLocaleDateString()}
          {!c.bought_forwarded && <div className="text-[10px] text-gray-600" title="Retried hourly until the pre-grader takes it">not sent to the pre-grader yet</div>}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums text-gray-200">{usd(c.bought_cents)}</td>
        <td className="py-1.5 px-2"><GradeOddsBadge o={c.odds} compact /></td>
        <td className={`py-1.5 px-2 text-right tabular-nums ${ev == null ? "text-gray-600" : ev >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(ev)}</td>
        <td className="py-1.5 px-3">
          {c.outcome ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={`px-1.5 py-0.5 rounded border tabular-nums ${/^10/.test(c.outcome.grade) ? "border-green-900 bg-green-950/50 text-green-200" : "border-gray-700 text-gray-300"}`}>
                {c.outcome.grader} {c.outcome.grade}
              </span>
              {c.outcome.cert_number && <span className="text-gray-500">#{c.outcome.cert_number}</span>}
              {!c.outcome.forwarded && <span className="text-[10px] text-gray-600" title={c.outcome.forward_error}>not sent yet</span>}
            </span>
          ) : <OutcomeForm id={c.odds.id} grades={grades} onSaved={onSaved} />}
        </td>
      </tr>
    </Fragment>
  );
}

function OutcomeForm({ id, grades, onSaved }: { id: number; grades: BoughtReport["grades"]; onSaved: () => void }) {
  const [grader, setGrader] = useState("PSA");
  const [grade, setGrade] = useState("10");
  const [cert, setCert] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = (GRADE_ORDER[grader] ?? Object.keys(grades[grader] ?? {})).filter((g) => grades[grader]?.[g]);
  const sel = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select value={grader} onChange={(e) => { setGrader(e.target.value); setGrade((GRADE_ORDER[e.target.value] ?? ["10"])[0]); }} className={sel}>
        {Object.keys(grades).map((g) => <option key={g}>{g}</option>)}
      </select>
      <select value={grade} onChange={(e) => setGrade(e.target.value)} className={sel}>
        {list.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <input value={cert} onChange={(e) => setCert(e.target.value)} placeholder="cert # (optional)" className={`${sel} w-28`} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sel} title="Graded on (optional)" />
      <button disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await recordOutcome(id, { grader, grade, cert_number: cert.trim() || undefined, graded_at: date || undefined }); onSaved(); }
        catch (e) { setErr(String(e)); } finally { setBusy(false); }
      }} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "saving…" : "Save grade"}</button>
      {err && <span className="text-red-300">{err}</span>}
    </span>
  );
}
