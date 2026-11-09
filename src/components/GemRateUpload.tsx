import { useEffect, useRef, useState } from "react";
import { fetchGradedJob, uploadGemRatePage, type RefreshJob } from "../lib/api";

// GemRate's Cloudflare check blocks the worker's browser, so a set's gem
// rates are refreshed from its GemRate page saved in your own browser:
// open the page, wait for the card table, save it (Ctrl+S), upload it here.

export default function GemRateUpload({ game, code, psaUrl, cgcUrl }: { game: string; code: string; psaUrl?: string; cgcUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"psa-pop" | "cgc-pop">("psa-pop");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<RefreshJob | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const poll = (id: string) => {
    fetchGradedJob(id)
      .then((j) => {
        setJob(j);
        if (j.status === "pending" || j.status === "running") timer.current = window.setTimeout(() => poll(id), 3000);
      })
      .catch((e) => setErr(String(e)));
  };

  const pageUrl = source === "psa-pop" ? psaUrl : cgcUrl;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
        title="Refresh this set's gem rates from its GemRate page, saved in your browser">
        Upload GemRate page
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[26rem] rounded-lg border border-gray-700 bg-gray-950 p-3 text-xs text-gray-300 shadow-xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Gem rates for</span>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5">
              <option value="psa-pop">PSA</option><option value="cgc-pop">CGC</option>
            </select>
          </div>
          <ol className="list-decimal pl-4 space-y-0.5 text-gray-400">
            <li>
              {pageUrl
                ? <a href={pageUrl} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">Open this set's GemRate page</a>
                : <span>Open this set's page on gemrate.com (no GemRate page is mapped for it yet)</span>}{" "}
              and wait for the card table to load.
            </li>
            <li>Save it: Ctrl+S (Cmd+S on a Mac), "Webpage, HTML only" is enough.</li>
            <li>Upload the saved file:</li>
          </ol>
          <input type="file" accept=".html,.htm,text/html" disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true); setErr(null); setJob(null);
              try {
                const r = await uploadGemRatePage(game, code, source, f);
                poll(r.job_id);
              } catch (x) {
                setErr(x instanceof Error ? x.message : String(x));
              } finally {
                setBusy(false);
              }
            }}
            className="block w-full text-[11px] text-gray-400 file:mr-2 file:rounded file:border file:border-gray-700 file:bg-gray-900 file:px-2 file:py-0.5 file:text-gray-200" />
          {busy && <div className="text-gray-500">Uploading…</div>}
          {err && <div className="text-red-300">{err}</div>}
          {job && (
            <div className={job.status === "succeeded" ? "text-green-300" : job.status === "failed" ? "text-red-300" : "text-gray-400"}>
              {job.status === "succeeded" ? "Gem rates updated. Reload the page to see them."
                : job.status === "failed" ? `Failed: ${job.error ?? ""}` : "Updating gem rates…"}
              {(job.status === "succeeded" || job.status === "failed") && job.log_tail && (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-gray-500">{job.log_tail.replace(/\u001b\[[0-9;]*m/g, "").slice(-1200)}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
