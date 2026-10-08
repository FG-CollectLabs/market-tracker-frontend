import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchTrackedSets, type BrowseSet } from "../lib/api";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { ago, isStale, shortDate } from "../lib/freshness";

const LANGS = [
  { key: "en", label: "English" },
  { key: "ja", label: "Japanese" },
] as const;

interface Era {
  id: string;
  name: string;
  sets: BrowseSet[];
}

// Eras newest first (by their newest set), sets newest first within an era.
function groupByEra(sets: BrowseSet[]): Era[] {
  const byId = new Map<string, Era>();
  for (const s of sets) {
    const id = s.era ?? "other";
    const era = byId.get(id) ?? { id, name: s.era_name ?? "Other", sets: [] };
    era.sets.push(s);
    byId.set(id, era);
  }
  const newest = (e: Era) => e.sets.reduce((m, s) => (s.release_date && s.release_date > m ? s.release_date : m), "");
  return [...byId.values()].sort((a, b) => newest(b).localeCompare(newest(a)));
}

function SetTile({ s }: { s: BrowseSet }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = s.logo_url && !logoFailed;
  const stale = isStale(s.pricecharting_at) || isStale(s.fanatics_at);
  return (
    <Link
      to={`/browse/${s.code}`}
      className="group rounded-lg border border-gray-800 bg-gray-900/40 hover:border-indigo-600 hover:bg-gray-900 transition-colors overflow-hidden flex flex-col"
      title={[
        `PriceCharting: ${s.pricecharting_at ? `${shortDate(s.pricecharting_at)} (${ago(s.pricecharting_at)})` : "never"}`,
        `Fanatics: ${s.fanatics_at ? `${shortDate(s.fanatics_at)} (${ago(s.fanatics_at)})` : "never"}`,
        `PSA gem rate: ${s.psa_pop_at ? `${shortDate(s.psa_pop_at)} (${ago(s.psa_pop_at)})` : "never"}`,
      ].join("\n")}
    >
      <div className="h-28 flex items-center justify-center bg-gradient-to-br from-gray-800/60 to-gray-900 overflow-hidden">
        {showLogo ? (
          <img
            src={s.logo_url!}
            alt={s.name}
            loading="lazy"
            onError={() => setLogoFailed(true)}
            className="max-h-20 max-w-[85%] object-contain drop-shadow group-hover:scale-105 transition-transform"
          />
        ) : s.cover_url ? (
          // Whole card, sharp, over a blurred copy of its own art.
          <div className="relative w-full h-full flex items-center justify-center">
            <img src={s.cover_url} alt="" aria-hidden loading="lazy" className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-110" />
            <img
              src={s.cover_url}
              alt={s.name}
              loading="lazy"
              className="relative h-[90%] rounded shadow-lg group-hover:scale-105 transition-transform"
            />
          </div>
        ) : (
          <span className="text-2xl font-bold text-gray-600">{s.code.replace(/^jp-/, "").toUpperCase()}</span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="text-sm text-gray-100 leading-tight">{s.name}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
          <span>{s.tracked} tracked</span>
          {s.lang === "ja" && <span className="font-mono">{s.code.slice(3).toUpperCase()}</span>}
          {s.release_date && <span>{s.release_date.slice(0, 4)}</span>}
          {stale && <span className="text-amber-500" title="Prices older than 8 days">• stale</span>}
        </div>
      </div>
    </Link>
  );
}

export default function BrowsePage() {
  const [sets, setSets] = useState<BrowseSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const lang = params.get("lang") === "ja" ? "ja" : "en";

  useEffect(() => {
    fetchTrackedSets()
      .then((r) => setSets(r.sets))
      .catch((e: Error) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sets ?? []) c[s.lang] = (c[s.lang] ?? 0) + 1;
    return c;
  }, [sets]);
  const eras = useMemo(() => groupByEra((sets ?? []).filter((s) => s.lang === lang)), [sets, lang]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Tracked sets</h1>
      <p className="text-sm text-gray-500 mb-4">Tracked cards by language, era and set. Hover a set for when its data was updated.</p>

      <div className="flex gap-6 border-b border-gray-800 mb-6">
        {LANGS.map((l) => (
          <button
            key={l.key}
            onClick={() => setParams(l.key === "en" ? {} : { lang: l.key })}
            className={`pb-2 -mb-px text-sm border-b-2 transition-colors ${
              lang === l.key ? "border-indigo-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {l.label}
            <span className="ml-1.5 text-xs text-gray-600">{counts[l.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <ErrorMsg msg={error} />}
      {!sets && !error && <Spinner />}

      <div className="space-y-8">
        {eras.map((era) => (
          <section key={era.id}>
            <h2 className="text-sm font-semibold text-gray-200 mb-3">
              {era.name}{" "}
              <span className="text-gray-600 font-normal">
                · {era.sets.length} set{era.sets.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {era.sets.map((s) => (
                <SetTile key={s.code} s={s} />
              ))}
            </div>
          </section>
        ))}
        {sets && eras.length === 0 && <p className="text-sm text-gray-500">No tracked sets in this language yet.</p>}
      </div>
    </div>
  );
}
