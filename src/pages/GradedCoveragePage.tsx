import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGradedCoverage, updateSetPsaPopUrl, type CoverageSet } from "../lib/api";
import { Spinner, ErrorMsg } from "../components/Spinner";

function CoverageBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">
        {value}/{total}
      </span>
    </div>
  );
}

function PsaPopButton({ s, apiKey }: { s: CoverageSet; apiKey: string }) {
  const [open, setOpen] = useState(false);
  if (!s.psa_pop_url) return null;

  const cmd = [
    "sellthrough graded psa-pop",
    `"${s.psa_pop_url}"`,
    `--game ${s.game}`,
    `--set-code ${s.set_code}`,
    "--output api",
    "--api-url https://market.futuregadgetlabs.com",
    `--api-key ${apiKey}`,
  ].join(" \\\n  ");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
      >
        Fetch gem rates
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-[520px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 font-medium">
              Gem rates don't change often — run this once per week:
            </p>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300 text-lg leading-none">
              ×
            </button>
          </div>
          <a
            href={s.psa_pop_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 underline block mb-3"
          >
            PSA Pop Report &rarr;
          </a>
          <pre className="text-xs bg-gray-950 rounded p-3 overflow-x-auto text-green-400 select-all whitespace-pre-wrap">
            {cmd}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            This scrapes the PSA pop table, creates any missing cards in the DB,
            and uploads gem rates.
          </p>
        </div>
      )}
    </div>
  );
}

const ADMIN_API_KEY =
  import.meta.env.VITE_ADMIN_API_KEY ?? "<your-admin-api-key>";

function EditPopUrl({ s, onSaved }: { s: CoverageSet; onSaved: (url: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(s.psa_pop_url ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = val.trim() || null;
      await updateSetPsaPopUrl(s.game, s.set_code, s.set_name, next);
      onSaved(next);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { setVal(s.psa_pop_url ?? ""); setErr(null); setOpen(true); }}
        title={s.psa_pop_url ?? "Set PSA pop report URL"}
        className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-300 transition-colors whitespace-nowrap"
      >
        {s.psa_pop_url ? "Edit URL" : "+ PSA URL"}
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-8 z-30 w-[460px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">PSA pop report URL for {s.set_name}</p>
        <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300 text-lg leading-none">×</button>
      </div>
      <input
        type="url"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="https://www.psacard.com/pop/tcg-cards/..."
        className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2 justify-end">
        {s.psa_pop_url && (
          <button
            onClick={() => { setVal(""); }}
            className="text-xs px-2 py-1 rounded text-gray-500 hover:text-red-400 transition-colors"
            disabled={busy}
          >
            Clear
          </button>
        )}
        <button
          onClick={save}
          disabled={busy}
          className="text-xs px-3 py-1 rounded bg-indigo-700 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function GradedCoveragePage() {
  const [sets, setSets] = useState<CoverageSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGradedCoverage("pokemon")
      .then((r) => setSets(r.sets))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Graded Coverage</h1>
        <p className="text-sm text-gray-400 mt-1">
          Pokemon sets with graded price and pop report data. Click a set to see the full ROI breakdown.
        </p>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Set</th>
              <th className="text-left px-4 py-2.5 font-medium">Release</th>
              <th className="text-left px-4 py-2.5 font-medium">Prices</th>
              <th className="text-left px-4 py-2.5 font-medium">Gem rates</th>
              <th className="text-left px-4 py-2.5 font-medium">Updated</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {sets.map((s) => (
              <tr key={s.set_code} className="hover:bg-gray-900/40 transition-colors">
                <td className="px-4 py-3 font-medium text-white">
                  {s.set_name}
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    {s.set_code.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">
                  {s.release_date ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {s.cards_with_graded_data > 0 ? (
                    <CoverageBar value={s.cards_with_prices} total={s.cards_with_graded_data} />
                  ) : (
                    <span className="text-gray-600 text-xs">no data</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.cards_with_graded_data > 0 ? (
                    <CoverageBar value={s.cards_with_gem_rates} total={s.cards_with_graded_data} />
                  ) : (
                    <span className="text-gray-600 text-xs">no data</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">
                  {s.last_updated ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3 relative">
                    <EditPopUrl
                      s={s}
                      onSaved={(url) => setSets((prev) =>
                        prev.map((x) => (x.set_code === s.set_code && x.game === s.game ? { ...x, psa_pop_url: url } : x))
                      )}
                    />
                    <PsaPopButton s={s} apiKey={ADMIN_API_KEY} />
                    <Link
                      to={`/sets/${s.game}/${s.set_code}?tab=graded`}
                      className="text-indigo-400 hover:text-indigo-300 text-xs font-medium whitespace-nowrap"
                    >
                      ROI &rarr;
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sets.length === 0 && (
        <p className="text-gray-500 text-sm">
          No graded data yet. Run the graded scraper to populate.
        </p>
      )}
    </div>
  );
}
