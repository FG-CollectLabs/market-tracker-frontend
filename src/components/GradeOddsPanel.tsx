import { useCallback, useEffect, useState } from "react";
import { fetchGradeOdds, uploadGradeOdds, type GradeOdds } from "../lib/api";
import { useSession } from "../lib/auth";
import { ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";
import { OddsFlag } from "./AdjEVCell";

// Grade odds for raw copies of this card from the grading predictor: raw
// eBay listings sent automatically (Raw to grade hits) and photos you upload.
// Refreshes every 30 seconds while a copy is measuring.
export default function GradeOddsPanel({ displayKey }: { displayKey: string }) {
  const session = useSession();
  const [odds, setOdds] = useState<GradeOdds[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchGradeOdds(displayKey)
      .then((r) => { setOdds(r.odds); setNotes(r.notes); setEnabled(r.enabled); })
      .catch((e) => setErr(String(e)));
  }, [displayKey]);
  useEffect(() => { load(); }, [load]);
  const open = odds?.some((o) => o.status === "pending" || o.status === "measuring");
  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [open, load]);

  const submit = async () => {
    if (!front || !back) return;
    setBusy(true);
    setErr(null);
    try {
      await uploadGradeOdds(displayKey, front, back, note.trim() || undefined);
      setFront(null);
      setBack(null);
      setNote("");
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3 mb-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-100">Grade odds for raw copies</h2>
        <p className="text-xs text-gray-500">
          From the grading predictor, which measures centering on a front and back photo. Raw eBay listings that hit a
          "Raw to grade" target are sent automatically.
        </p>
      </div>

      {err && <ErrorMsg msg={err} />}
      {!enabled && <p className="text-xs text-amber-300/80">Not set up on the tracker yet (no grading predictor token).</p>}

      {odds && odds.length > 0 ? (
        <ul className="divide-y divide-gray-800">
          {odds.map((o) => (
            <li key={o.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[11px] text-gray-500 w-28 shrink-0 tabular-nums">
                {new Date(o.created_at).toLocaleDateString()} · {o.source === "ebay" ? "eBay" : "upload"}
              </span>
              <GradeOddsBadge o={o} /> {session && <OddsFlag odds={o} />}
              {o.source === "ebay" && o.source_ref && (
                <a href={o.source_ref} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-300 hover:text-indigo-200">listing</a>
              )}
              {o.source === "upload" && o.source_ref && <span className="text-[11px] text-gray-500">{o.source_ref}</span>}
            </li>
          ))}
        </ul>
      ) : odds ? (
        <p className="text-xs text-gray-600">No raw copies of this card sent yet.</p>
      ) : null}

      {session && enabled && (
        <div className="rounded border border-gray-800 bg-gray-950/50 p-3 space-y-2">
          <div className="text-xs text-gray-300">Check a raw copy: a clear, straight-on photo of the whole front and back.</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <label className="flex items-center gap-1.5">Front
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFront(e.target.files?.[0] ?? null)}
                className="text-[11px] file:mr-2 file:rounded file:border file:border-gray-700 file:bg-gray-900 file:px-2 file:py-0.5 file:text-gray-300" />
            </label>
            <label className="flex items-center gap-1.5">Back
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setBack(e.target.files?.[0] ?? null)}
                className="text-[11px] file:mr-2 file:rounded file:border file:border-gray-700 file:bg-gray-900 file:px-2 file:py-0.5 file:text-gray-300" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
              className="rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-gray-200 placeholder:text-gray-600" />
            <button disabled={!front || !back || busy} onClick={submit}
              className="px-2.5 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 hover:bg-indigo-900/60 disabled:opacity-40">
              {busy ? "Sending…" : "Get odds"}
            </button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </section>
  );
}
