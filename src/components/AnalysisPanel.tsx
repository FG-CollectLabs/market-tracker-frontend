import { useCallback, useEffect, useState } from "react";
import { fetchTimingNotes, runTimingAnalysis, type AnalysisTopic, type TimingNotes } from "../lib/api";
import { useSession } from "../lib/auth";

// An agent's dated write-up of this tab: each thesis question answered from
// the tab's own tables (verdict, evidence, caveats), so the numbers come
// with a reading. Earlier runs stay, to compare as more data comes in.

const VERDICT: Record<string, { label: string; cls: string }> = {
  yes: { label: "Yes", cls: "bg-green-950/60 text-green-300 border-green-900" },
  no: { label: "No", cls: "bg-red-950/50 text-red-300 border-red-900" },
  mixed: { label: "Mixed", cls: "bg-amber-950/50 text-amber-300 border-amber-900" },
  not_enough_data: { label: "Not enough data", cls: "bg-gray-900 text-gray-400 border-gray-700" },
};

export default function AnalysisPanel({ topic }: { topic: AnalysisTopic }) {
  const session = useSession();
  const [notes, setNotes] = useState<TimingNotes | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback((id?: number) => {
    fetchTimingNotes(topic, id).then(setNotes).catch((e: Error) => setErr(e.message));
  }, [topic]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!notes?.running) return;
    const t = setInterval(() => load(), 20_000);
    return () => clearInterval(t);
  }, [notes?.running, load]);

  const run = () => {
    setErr("");
    runTimingAnalysis(topic).then(() => load()).catch((e: Error) => setErr(e.message));
  };
  const l = notes?.latest;
  return (
    <section className="rounded-lg border border-indigo-900/60 bg-indigo-950/10 p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-100">
          AI analysis
          {l && <span className="ml-2 font-normal text-xs text-gray-500">{new Date(l.created_at).toLocaleDateString()} · {l.model}</span>}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {notes && notes.history.length > 1 && (
            <select value={l?.id ?? ""} onChange={(e) => load(Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
              {notes.history.map((h) => <option key={h.id} value={h.id}>{new Date(h.created_at).toLocaleString()}</option>)}
            </select>
          )}
          {session && (
            <button onClick={run} disabled={notes?.running} className="px-2 py-0.5 rounded border border-indigo-700 text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-50">
              {notes?.running ? "Running…" : l ? "Run again" : "Run analysis"}
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {!notes ? <p className="text-xs text-gray-500">Loading…</p> : !l ? (
        <p className="text-xs text-gray-500">
          No analysis yet. {session ? "Run one: an agent answers this tab's questions from its tables (a few minutes)." : "Sign in to run one."}
          {notes.questions.length > 0 && <span className="block mt-1">Questions: {notes.questions.map((q, i) => `${i + 1}. ${q}`).join(" ")}</span>}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-200">{l.summary}</p>
          <button onClick={() => setOpen(!open)} className="text-xs text-indigo-300 hover:text-indigo-200">{open ? "▾ Hide" : "▸ Show"} the {l.findings.length} questions, evidence and caveats</button>
          {open && (
            <div className="space-y-3">
              {l.findings.map((f, i) => (
                <div key={i} className="rounded border border-gray-800 bg-gray-950/40 p-3 space-y-1">
                  <div className="flex gap-2 items-start">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[11px] ${VERDICT[f.verdict]?.cls ?? ""}`}>{VERDICT[f.verdict]?.label ?? f.verdict}</span>
                    <span className="text-xs text-gray-100 font-medium">{f.question}</span>
                  </div>
                  <p className="text-xs text-gray-300">{f.answer}</p>
                  {f.evidence.length > 0 && (
                    <ul className="text-[11px] text-gray-400 list-disc pl-4 space-y-0.5">{f.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul>
                  )}
                  {f.caveats.length > 0 && (
                    <ul className="text-[11px] text-amber-300/80 list-disc pl-4 space-y-0.5">{f.caveats.map((c, j) => <li key={j}>{c}</li>)}</ul>
                  )}
                </div>
              ))}
              {l.data_built && <p className="text-[11px] text-gray-600">From the tables built {new Date(l.data_built).toLocaleString()}; the agent reads only these numbers.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
