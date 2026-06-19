import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchGradedCoverage,
  fetchGradedJob,
  triggerGradedRefresh,
  updateSetExternalIds,
  type CoverageSet,
  type RefreshSource,
} from "../lib/api";
import { Spinner, ErrorMsg } from "../components/Spinner";

const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "<your-admin-api-key>";
const API_URL = "https://market.futuregadgetlabs.com";

const SCRAPER_API_ARGS = [
  "--output api",
  `--api-url ${API_URL}`,
  `--api-key ${ADMIN_API_KEY}`,
].join(" \\\n  ");

function buildCmd(subcommand: string, url: string, game: string, code: string): string {
  return [
    `sellthrough graded ${subcommand}`,
    `"${url}"`,
    `--game ${game}`,
    `--set-code ${code}`,
    SCRAPER_API_ARGS,
  ].join(" \\\n  ");
}

function CoverageBar({
  label,
  value,
  total,
  updated,
  color = "bg-indigo-500",
  labelColor = "text-gray-500",
  refreshState,
  onRefresh,
}: {
  label: string;
  value: number;
  total: number;
  updated: string | null;
  color?: string;
  labelColor?: string;
  // null = no refresh hook (URL not configured); otherwise current state.
  refreshState?: { status: "idle" | "running" | "failed"; error: string | null } | null;
  onRefresh?: () => void;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const tooltip = updated
    ? `${label}: ${value}/${total} (${pct}%) · updated ${updated}`
    : `${label}: ${value}/${total} (${pct}%) · never updated`;
  const running = refreshState?.status === "running";
  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <span className={`text-xs uppercase tracking-wide w-9 ${labelColor}`}>{label}</span>
      <div className="w-32 h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">
        {value}/{total}
      </span>
      {refreshState !== undefined && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={!onRefresh || running}
          className="text-[11px] text-gray-500 hover:text-indigo-300 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
          title={
            !onRefresh
              ? "Set a URL in the Configure panel to enable refresh"
              : running
                ? "Refresh in progress…"
                : refreshState?.error
                  ? `Last refresh failed: ${refreshState.error}`
                  : "Re-scrape from source"
          }
        >
          {running ? "⟳" : refreshState?.status === "failed" ? "⚠" : "↻"}
        </button>
      )}
    </div>
  );
}

type UrlFieldKey = "pricecharting_console_url" | "psa_pop_url" | "cgc_pop_url";

interface UrlField {
  key: UrlFieldKey;
  label: string;
  subcommand: string;
  placeholder: string;
  accent: string; // tailwind text color for the command pre
  blurb: string;
}

const URL_FIELDS: UrlField[] = [
  {
    key: "pricecharting_console_url",
    label: "PriceCharting console (raw + PSA prices · CGC 10 for watched)",
    subcommand: "console-prices",
    placeholder: "https://www.pricecharting.com/console/pokemon-evolving-skies",
    accent: "text-green-400",
    blurb: "Scrapes raw + PSA 9/10 for every card and CGC 10 for cards marked 👁.",
  },
  {
    key: "psa_pop_url",
    label: "PSA pop report (gem rates from PSA population)",
    subcommand: "psa-pop",
    placeholder: "https://www.psacard.com/pop/tcg-cards/...",
    accent: "text-yellow-300",
    blurb: "Scrapes the PSA pop table; gem rates rarely change so run weekly.",
  },
  {
    key: "cgc_pop_url",
    label: "CGC pop report (gem rates from CGC population)",
    subcommand: "cgc-pop",
    placeholder: "https://www.cgccards.com/population-report/tcg/pok%C3%A9mon/2/...",
    accent: "text-purple-300",
    blurb: "Scrapes the CGC pop report (Playwright); paginates automatically.",
  },
];

function ConfigurePanel({
  s,
  onSaved,
  onClose,
}: {
  s: CoverageSet;
  onSaved: (patch: Partial<CoverageSet>) => void;
  onClose: () => void;
}) {
  const [vals, setVals] = useState<Record<UrlFieldKey, string>>({
    pricecharting_console_url: s.pricecharting_console_url ?? "",
    psa_pop_url: s.psa_pop_url ?? "",
    cgc_pop_url: s.cgc_pop_url ?? "",
  });
  const [savingKey, setSavingKey] = useState<UrlFieldKey | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async (field: UrlField) => {
    setSavingKey(field.key);
    setErr(null);
    try {
      const next = vals[field.key].trim() || null;
      await updateSetExternalIds(s.game, s.set_code, s.set_name, { [field.key]: next });
      onSaved({ [field.key]: next });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="absolute right-0 top-8 z-30 w-[640px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white font-medium">URLs & scrapers · {s.set_name}</p>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none">×</button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {URL_FIELDS.map((f) => {
        const url = vals[f.key].trim();
        const cmd = url ? buildCmd(f.subcommand, url, s.game, s.set_code) : "";
        const dirty = (vals[f.key] || "") !== (s[f.key] ?? "");
        return (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400 font-medium">{f.label}</p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                  open ↗
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => save(f)}
                disabled={savingKey !== null || !dirty}
                className="text-xs px-3 py-1 rounded bg-indigo-700 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
              >
                {savingKey === f.key ? "…" : "Save"}
              </button>
            </div>
            {cmd ? (
              <>
                <pre className={`text-xs bg-gray-950 rounded p-2.5 overflow-x-auto ${f.accent} select-all whitespace-pre-wrap`}>
                  {cmd}
                </pre>
                <p className="text-[11px] text-gray-600 italic">{f.blurb}</p>
              </>
            ) : (
              <p className="text-[11px] text-gray-600 italic">Save a URL above to generate the {f.subcommand} command.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfigureButton({ s, onSaved }: { s: CoverageSet; onSaved: (patch: Partial<CoverageSet>) => void }) {
  const [open, setOpen] = useState(false);
  const configured =
    (s.pricecharting_console_url ? 1 : 0) +
    (s.psa_pop_url ? 1 : 0) +
    (s.cgc_pop_url ? 1 : 0);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors whitespace-nowrap"
        title="Configure URLs and view scrape commands"
      >
        URLs <span className="text-gray-500">{configured}/3</span>
      </button>
      {open && <ConfigurePanel s={s} onSaved={onSaved} onClose={() => setOpen(false)} />}
    </div>
  );
}

type RefreshKey = string; // `${game}:${set_code}:${source}`
type RefreshState = { status: "idle" | "running" | "failed"; error: string | null };

// Era grouping. Order here is the display order (top to bottom).
const ERAS = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield", "Other"] as const;
type Era = (typeof ERAS)[number];

const SV_CODES = new Set([
  "svi", "pal", "obf", "mew", "par", "paf", "tef", "twm",
  "sfa", "scr", "ssp", "pre", "jtg", "dri", "blk", "wht",
]);

function eraOf(setCode: string): Era {
  const code = setCode.toLowerCase();
  if (/^me\d/.test(code)) return "Mega Evolution";
  if (SV_CODES.has(code)) return "Scarlet & Violet";
  if (code.startsWith("swsh") || code === "cel25" || code === "pgo") return "Sword & Shield";
  return "Other";
}

function refreshKey(game: string, setCode: string, source: RefreshSource): RefreshKey {
  return `${game}:${setCode}:${source}`;
}

export default function GradedCoveragePage() {
  const [sets, setSets] = useState<CoverageSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshState, setRefreshState] = useState<Record<RefreshKey, RefreshState>>({});
  const pollers = useRef<Record<string, number>>({});

  const reloadCoverage = () => {
    fetchGradedCoverage("pokemon")
      .then((r) => setSets(r.sets))
      .catch((e: unknown) => setError(String(e)));
  };

  useEffect(() => {
    fetchGradedCoverage("pokemon")
      .then((r) => setSets(r.sets))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
    const refs = pollers.current;
    return () => {
      for (const id of Object.values(refs)) window.clearInterval(id);
    };
  }, []);

  const startRefresh = (set: CoverageSet, source: RefreshSource, url: string) => {
    const key = refreshKey(set.game, set.set_code, source);
    setRefreshState((prev) => ({ ...prev, [key]: { status: "running", error: null } }));
    triggerGradedRefresh(set.game, set.set_code, source, url)
      .then(({ job_id }) => {
        const intervalId = window.setInterval(() => {
          fetchGradedJob(job_id)
            .then((job) => {
              if (job.status === "succeeded") {
                window.clearInterval(intervalId);
                delete pollers.current[key];
                setRefreshState((prev) => ({ ...prev, [key]: { status: "idle", error: null } }));
                reloadCoverage();
              } else if (job.status === "failed") {
                window.clearInterval(intervalId);
                delete pollers.current[key];
                setRefreshState((prev) => ({
                  ...prev,
                  [key]: { status: "failed", error: job.error ?? "unknown error" },
                }));
              }
            })
            .catch((e: unknown) => {
              window.clearInterval(intervalId);
              delete pollers.current[key];
              setRefreshState((prev) => ({
                ...prev,
                [key]: { status: "failed", error: String(e) },
              }));
            });
        }, 2500);
        pollers.current[key] = intervalId;
      })
      .catch((e: unknown) => {
        setRefreshState((prev) => ({
          ...prev,
          [key]: { status: "failed", error: String(e) },
        }));
      });
  };

  const buildBarRefresh = (set: CoverageSet, source: RefreshSource, url: string | null) => {
    if (!url) return { refreshState: null, onRefresh: undefined };
    const key = refreshKey(set.game, set.set_code, source);
    return {
      refreshState: refreshState[key] ?? { status: "idle" as const, error: null },
      onRefresh: () => startRefresh(set, source, url),
    };
  };

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

      <div className="rounded-lg border border-gray-800 overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Set</th>
              <th className="text-left px-4 py-2.5 font-medium">Released</th>
              <th className="text-left px-4 py-2.5 font-medium">Prices</th>
              <th className="text-left px-4 py-2.5 font-medium">Gem rates</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {ERAS.flatMap((era) => {
              const eraSets = sets
                .filter((s) => eraOf(s.set_code) === era)
                .sort((a, b) => {
                  if (a.release_date && b.release_date) return b.release_date.localeCompare(a.release_date);
                  if (a.release_date) return -1;
                  if (b.release_date) return 1;
                  return a.set_code.localeCompare(b.set_code);
                });
              if (eraSets.length === 0) return [];
              return [
                <tr key={`era:${era}`} className="bg-gray-950/80">
                  <td colSpan={5} className="px-4 py-2 text-xs uppercase tracking-wider text-indigo-300 font-semibold border-t border-gray-800">
                    {era} <span className="text-gray-600 font-normal normal-case">· {eraSets.length} set{eraSets.length === 1 ? "" : "s"}</span>
                  </td>
                </tr>,
                ...eraSets.map((s) => {
                  const priceTotal = s.total_cards;
                  const gemTotal = s.cards_with_graded_data;
                  return (
                    <tr key={`${s.game}:${s.set_code}`} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-white align-top">
                        {s.set_name}
                        <span className="ml-2 text-xs text-gray-500 font-normal">
                          {s.set_code.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-400 tabular-nums text-xs">
                        {s.release_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {priceTotal > 0 ? (
                          <div className="space-y-1">
                            <CoverageBar
                              label="Raw"
                              value={s.cards_with_raw_prices}
                              total={priceTotal}
                              updated={s.raw_prices_updated}
                              color="bg-green-500"
                              labelColor="text-green-500/70"
                              {...buildBarRefresh(s, "console-prices", s.pricecharting_console_url)}
                            />
                            <CoverageBar
                              label="PSA"
                              value={s.cards_with_psa_prices}
                              total={priceTotal}
                              updated={s.psa_prices_updated}
                              color="bg-yellow-400"
                              labelColor="text-yellow-400/70"
                              {...buildBarRefresh(s, "console-prices", s.pricecharting_console_url)}
                            />
                            <CoverageBar
                              label="CGC"
                              value={s.cards_with_cgc_prices}
                              total={priceTotal}
                              updated={s.cgc_prices_updated}
                              color="bg-purple-400"
                              labelColor="text-purple-400/70"
                              {...buildBarRefresh(s, "console-prices", s.pricecharting_console_url)}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-600 text-xs">no data</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {gemTotal > 0 ? (
                          <div className="space-y-1">
                            <CoverageBar
                              label="PSA"
                              value={s.cards_with_psa_gem_rate}
                              total={gemTotal}
                              updated={s.psa_gem_rate_updated}
                              color="bg-yellow-400"
                              labelColor="text-yellow-400/70"
                              {...buildBarRefresh(s, "psa-pop", s.psa_pop_url)}
                            />
                            <CoverageBar
                              label="CGC"
                              value={s.cards_with_cgc_gem_rate}
                              total={gemTotal}
                              updated={s.cgc_gem_rate_updated}
                              color="bg-purple-400"
                              labelColor="text-purple-400/70"
                              {...buildBarRefresh(s, "cgc-pop", s.cgc_pop_url)}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-600 text-xs">no data</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-3">
                          <ConfigureButton
                            s={s}
                            onSaved={(patch) =>
                              setSets((prev) =>
                                prev.map((x) =>
                                  x.set_code === s.set_code && x.game === s.game ? { ...x, ...patch } : x
                                )
                              )
                            }
                          />
                          <Link
                            to={`/sets/${s.game}/${s.set_code}?tab=graded`}
                            className="text-indigo-400 hover:text-indigo-300 text-xs font-medium whitespace-nowrap"
                          >
                            ROI &rarr;
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
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
