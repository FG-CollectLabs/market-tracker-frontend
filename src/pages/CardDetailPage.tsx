import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  fetchCard,
  fetchCardSnapshots,
  fetchCardGraded,
  type CardRow,
  type SnapshotRow,
  type GradedSnapshot,
} from "../lib/api";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { PriceCell, SourceBadge } from "../components/PriceCell";
import { formatCents, formatPct } from "../lib/roi";

// ---- Snapshots tab ---------------------------------------------------------

function SnapshotsTab({ displayKey }: { displayKey: string }) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCardSnapshots(displayKey, source ? { source } : undefined)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [displayKey, source]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All sources</option>
          <option value="tcgplayer">TCGPlayer</option>
          <option value="ebay">eBay</option>
          <option value="manapool">Manapool</option>
          <option value="pricecharting">PriceCharting</option>
        </select>
        <span className="text-xs text-gray-500">{snapshots.length} weeks</span>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">Week</th>
              <th className="text-left px-3 py-2.5 font-medium">Source</th>
              <th className="text-right px-3 py-2.5 font-medium">Market</th>
              <th className="text-right px-3 py-2.5 font-medium">Lowest</th>
              <th className="text-right px-3 py-2.5 font-medium">Lowest legit</th>
              <th className="text-right px-3 py-2.5 font-medium">Median</th>
              <th className="text-right px-3 py-2.5 font-medium">Listings</th>
              <th className="text-right px-3 py-2.5 font-medium">Sold/wk</th>
              <th className="text-right px-3 py-2.5 font-medium">Sellthrough</th>
              <th className="text-right px-3 py-2.5 font-medium">Days supply</th>
              <th className="text-right px-3 py-2.5 font-medium">52w %ile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {snapshots.map((s) => (
              <tr key={`${s.source}-${s.week_start_date}`} className="hover:bg-gray-900/30">
                <td className="px-3 py-2.5 text-gray-400 tabular-nums">{s.week_start_date}</td>
                <td className="px-3 py-2.5"><SourceBadge source={s.source} /></td>
                <td className="px-3 py-2.5 text-right">
                  <PriceCell cents={s.market_price_cents} className="text-gray-200" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <PriceCell cents={s.lowest_price_cents} className="text-gray-400" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <PriceCell cents={s.lowest_legit_cents} className="text-gray-400" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <PriceCell cents={s.median_price_cents} className="text-gray-400" />
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                  {s.listing_count ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                  {s.units_sold_week ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {s.sellthrough_ratio != null ? (
                    <span className={
                      s.sellthrough_ratio >= 0.20 ? "text-green-400" :
                      s.sellthrough_ratio >= 0.08 ? "text-yellow-400" :
                      "text-red-400"
                    }>
                      {(s.sellthrough_ratio * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                  {s.days_of_supply != null ? s.days_of_supply.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                  {s.price_percentile_52w != null ? `${s.price_percentile_52w.toFixed(0)}th` : "—"}
                </td>
              </tr>
            ))}
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                  No snapshot data yet for this card.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Graded tab ------------------------------------------------------------

type GroupedSnaps = Record<string, Record<string, GradedSnapshot[]>>;

function groupSnapshots(snaps: GradedSnapshot[]): GroupedSnaps {
  const g: GroupedSnaps = {};
  for (const s of snaps) {
    g[s.company] ??= {};
    g[s.company][s.grade] ??= [];
    g[s.company][s.grade].push(s);
  }
  return g;
}

const SOURCE_COLORS: Record<string, string> = {
  pricecharting: "bg-blue-900/60 text-blue-300",
  gemrate: "bg-purple-900/60 text-purple-300",
  psa_marketplace: "bg-orange-900/60 text-orange-300",
  cgc_marketplace: "bg-teal-900/60 text-teal-300",
  ebay_sold: "bg-yellow-900/60 text-yellow-300",
};

function GradedTab({ displayKey }: { displayKey: string }) {
  const [snapshots, setSnapshots] = useState<GradedSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCardGraded(displayKey)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [displayKey]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  const grouped = groupSnapshots(snapshots);

  if (snapshots.length === 0) {
    return <p className="text-gray-500 text-sm py-4">No graded data for this card.</p>;
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([company, grades]) => (
        <section key={company}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            {company.toUpperCase()}
          </h2>
          <div className="space-y-3">
            {Object.entries(grades)
              .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
              .map(([grade, snaps]) => (
                <div key={grade} className="rounded-lg border border-gray-800 overflow-hidden">
                  <div className="bg-gray-900 px-4 py-2 text-xs font-semibold text-gray-300">
                    Grade {grade}
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-900/50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2">Week</th>
                        <th className="text-left px-4 py-2">Source</th>
                        <th className="text-right px-4 py-2">Market</th>
                        <th className="text-right px-4 py-2">Last sale</th>
                        <th className="text-right px-4 py-2">Pop</th>
                        <th className="text-right px-4 py-2">Total</th>
                        <th className="text-right px-4 py-2">Gem rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {snaps.map((s, i) => (
                        <tr key={i} className="hover:bg-gray-900/30">
                          <td className="px-4 py-2 text-gray-400 tabular-nums">{s.week_start_date}</td>
                          <td className="px-4 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${SOURCE_COLORS[s.data_source] ?? "bg-gray-800 text-gray-400"}`}>
                              {s.data_source.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-200 tabular-nums font-mono">
                            {formatCents(s.market_price_cents)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 tabular-nums font-mono">
                            {formatCents(s.last_sale_cents)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 tabular-nums">
                            {s.pop_count ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 tabular-nums">
                            {s.pop_total ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {s.gem_rate_pct != null ? (
                              <span className="text-indigo-300">{formatPct(s.gem_rate_pct / 100)}</span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- Page ------------------------------------------------------------------

type Tab = "snapshots" | "graded";

export default function CardDetailPage() {
  const { displayKey } = useParams<{ displayKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) ?? "snapshots";

  const [card, setCard] = useState<CardRow | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    if (!displayKey) return;
    fetchCard(displayKey)
      .then(setCard)
      .catch((e: unknown) => setCardError(String(e)));
  }, [displayKey]);

  if (!displayKey) return null;

  return (
    <div className="space-y-4">
      <div>
        <button
          onClick={() => history.back()}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          ← Back
        </button>
        {cardError ? (
          <h1 className="text-xl font-semibold text-white mt-1">{displayKey}</h1>
        ) : card ? (
          <div className="mt-1">
            <h1 className="text-xl font-semibold text-white">
              {card.name}
              {card.finish && <span className="ml-2 text-sm text-gray-400 font-normal">{card.finish}</span>}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              #{card.number}
              {card.rarity && ` · ${card.rarity}`}
              <span className="ml-2 font-mono text-gray-600">{card.display_key}</span>
            </p>
          </div>
        ) : (
          <h1 className="text-xl font-semibold text-white mt-1">{displayKey}</h1>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {([["snapshots", "Price History"], ["graded", "Graded"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSearchParams({ tab: id }, { replace: true })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "snapshots" && <SnapshotsTab displayKey={displayKey} />}
      {tab === "graded" && <GradedTab displayKey={displayKey} />}
    </div>
  );
}
