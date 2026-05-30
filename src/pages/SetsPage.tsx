import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSets, type SetRow } from "../lib/api";
import { GameBadge } from "../components/GameBadge";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { getPokemonSetLogo } from "../lib/ptcgio";

function SetLogo({ set }: { set: SetRow }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(set.image_url);

  useEffect(() => {
    if (set.image_url || set.game !== "pokemon") return;
    getPokemonSetLogo(set.name).then((url) => {
      if (url) setLogoUrl(url);
    });
  }, [set]);

  if (!logoUrl) return null;
  return (
    <img
      src={logoUrl}
      alt={set.name}
      className="h-6 object-contain opacity-80"
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function groupByGame(sets: SetRow[]): Map<string, SetRow[]> {
  const map = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = map.get(s.game) ?? [];
    list.push(s);
    map.set(s.game, list);
  }
  return map;
}

const GAME_ORDER = ["mtg", "pokemon", "lorcana", "one_piece", "yugioh", "other"];

export default function SetsPage() {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSets()
      .then((r) => setSets(r.sets))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  const byGame = groupByGame(sets);
  const orderedGames = [
    ...GAME_ORDER.filter((g) => byGame.has(g)),
    ...[...byGame.keys()].filter((g) => !GAME_ORDER.includes(g)),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Sets</h1>
        <p className="text-sm text-gray-400 mt-1">
          All tracked sets. Click a set to browse cards, sealed products, and market prices.
        </p>
      </div>

      {orderedGames.map((game) => {
        const gameSets = byGame.get(game)!;
        return (
          <section key={game}>
            <div className="flex items-center gap-2 mb-3">
              <GameBadge game={game} />
              <span className="text-xs text-gray-500">{gameSets.length} set{gameSets.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Set</th>
                    <th className="text-left px-4 py-2.5 font-medium">Code</th>
                    <th className="text-left px-4 py-2.5 font-medium">Release</th>
                    <th className="text-left px-4 py-2.5 font-medium">Cards</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {gameSets.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">
                        <Link
                          to={`/sets/${s.game}/${s.code}`}
                          className="flex items-center gap-2 hover:text-indigo-300 transition-colors"
                        >
                          <SetLogo set={s} />
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {s.code.toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">
                        {s.release_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">
                        {s.card_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/sets/${s.game}/${s.code}`}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {sets.length === 0 && (
        <p className="text-gray-500 text-sm">No sets found. Seed the database to get started.</p>
      )}
    </div>
  );
}
