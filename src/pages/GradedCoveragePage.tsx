import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGradedCoverage, type CoverageSet } from "../lib/api";
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
                  <div className="flex items-center justify-end gap-3">
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
