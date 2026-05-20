import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGradedCoverage, type CoverageSet } from "../lib/api";
import { GameBadge } from "../components/GameBadge";
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

function groupByGame(sets: CoverageSet[]): Map<string, CoverageSet[]> {
  const map = new Map<string, CoverageSet[]>();
  for (const s of sets) {
    const list = map.get(s.game) ?? [];
    list.push(s);
    map.set(s.game, list);
  }
  return map;
}

export default function GradedCoveragePage() {
  const [sets, setSets] = useState<CoverageSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGradedCoverage()
      .then((r) => setSets(r.sets))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  const byGame = groupByGame(sets);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Graded Coverage</h1>
        <p className="text-sm text-gray-400 mt-1">
          Sets with graded price and pop report data. Click a set to see the full ROI breakdown.
        </p>
      </div>

      {[...byGame.entries()].map(([game, gameSets]) => (
        <section key={game}>
          <div className="flex items-center gap-2 mb-3">
            <GameBadge game={game} />
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
                {gameSets.map((s) => (
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
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/sets/${s.game}/${s.set_code}?tab=graded`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                      >
                        ROI →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {sets.length === 0 && (
        <p className="text-gray-500 text-sm">
          No graded data yet. Run the graded scraper to populate.
        </p>
      )}
    </div>
  );
}
