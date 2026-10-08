import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHistoryImports, uploadHistoryImport, type HistoryImport, type ImportSource,
} from "../lib/api";
import { useSession } from "../lib/auth";
import { ago, shortDate } from "../lib/freshness";

const SOURCES: { key: ImportSource; label: string; hint: string }[] = [
  { key: "pricecharting", label: "PriceCharting chart", hint: "the price history chart; the agent reads monthly points off it" },
  { key: "fanatics", label: "Fanatics sold", hint: "sales history results; one sale per row" },
  { key: "130point", label: "130point sold", hint: "130point.com sold listings (eBay)" },
  { key: "ebay", label: "eBay sold", hint: "eBay sold / completed listings" },
  { key: "other", label: "Other", hint: "say what it is in the note" },
];

const GRADES = ["", "psa-10", "psa-9", "cgc-10-pristine", "cgc-10", "raw"];

const STATUS_STYLE: Record<HistoryImport["status"], string> = {
  pending: "bg-gray-800 text-gray-300",
  processing: "bg-sky-900/60 text-sky-300",
  done: "bg-green-900/60 text-green-300",
  failed: "bg-red-900/60 text-red-300",
  rejected: "bg-amber-900/60 text-amber-300",
};

// Drop a screenshot of a card's price chart or sold history; an agent reads
// it later (MCP list_history_imports / get_history_import) and records the
// sales or price points into this card's history.
export default function ImportsPanel({ displayKey }: { displayKey: string }) {
  const session = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource>("130point");
  const [grade, setGrade] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imports, setImports] = useState<HistoryImport[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!session) return;
    fetchHistoryImports(displayKey).then((r) => setImports(r.imports)).catch((e: Error) => setError(e.message));
  }, [displayKey, session]);

  useEffect(load, [load]);
  // While anything is queued or being read, check back every 30 s.
  useEffect(() => {
    if (!imports?.some((i) => i.status === "pending" || i.status === "processing")) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [imports, load]);

  const choose = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      setError("Use a PNG, JPEG or WebP screenshot.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("That image is over 8 MB.");
      return;
    }
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadHistoryImport({ displayKey, source, gradeHint: grade || undefined, note: note.trim() || undefined, image: file });
      setFile(null);
      setNote("");
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">Add history from a screenshot</h3>
        <p className="text-xs text-gray-500">
          Drop a screenshot of this card's PriceCharting chart or its Fanatics / 130point / eBay sold history. It's queued
          for the agent, which reads it and records the sales (or chart prices) into the history above.
        </p>
      </div>

      {!session ? (
        <p className="text-xs text-amber-300/90">Sign in with Google (top right) to upload and see the queue.</p>
      ) : (
        <>
          <div
            tabIndex={0}
            onClick={() => pick.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files?.[0]);
            }}
            onPaste={(e) => choose(Array.from(e.clipboardData.files)[0])}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm outline-none transition-colors focus:border-indigo-500 ${
              dragging ? "border-indigo-500 bg-indigo-950/30 text-indigo-200" : "border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {preview ? (
              <img src={preview} alt="screenshot to upload" className="mx-auto max-h-56 rounded" />
            ) : (
              <>Drop a screenshot here, click to choose one, or click here and paste (Ctrl+V)</>
            )}
            <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ImportSource)}
              className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200"
              title={SOURCES.find((s) => s.key === source)?.hint}
            >
              {SOURCES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200"
              title="If the screenshot is filtered to one grade"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>{g ? `Only ${g}` : "Any / mixed grades"}</option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the agent (optional)"
              className="flex-1 min-w-[12rem] bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
            />
            <button
              disabled={!file || busy}
              onClick={upload}
              className="px-3 py-1 rounded bg-indigo-700 text-white disabled:opacity-40 hover:bg-indigo-600"
            >
              {busy ? "Uploading…" : "Queue for the agent"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {session && imports && imports.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-3 font-medium">Uploaded</th>
              <th className="text-left py-1 pr-3 font-medium">Source</th>
              <th className="text-left py-1 pr-3 font-medium">Status</th>
              <th className="text-left py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300">
            {imports.map((i) => (
              <tr key={i.id}>
                <td className="py-1 pr-3 whitespace-nowrap" title={new Date(i.created_at).toLocaleString()}>
                  {shortDate(i.created_at)} <span className="text-gray-600">({ago(i.created_at)})</span>
                </td>
                <td className="py-1 pr-3 whitespace-nowrap">
                  {SOURCES.find((s) => s.key === i.source)?.label ?? i.source}
                  {i.grade_hint && <span className="text-gray-500"> · {i.grade_hint}</span>}
                </td>
                <td className="py-1 pr-3">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${STATUS_STYLE[i.status]}`}>{i.status}</span>
                </td>
                <td className="py-1 text-gray-400">
                  {i.error ?? (i.result ? summarize(i.result) : i.status === "pending" ? "waiting for the agent" : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// The agent's result is free-form JSON; show its summary line if it has one.
function summarize(r: Record<string, unknown>): string {
  for (const k of ["summary", "message", "note"]) if (typeof r[k] === "string") return r[k] as string;
  return Object.entries(r)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
