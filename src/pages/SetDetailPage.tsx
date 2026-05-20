import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchMarket,
  fetchCards,
  fetchSealed,
  fetchSet,
  fetchSetGraded,
  toggleGradedWatch,
  type CardMarketRow,
  type SealedMarketRow,
  type CardRow,
  type SealedRow,
  type SetRow,
  type ROICard,
} from "../lib/api";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { PriceCell, SourceBadge } from "../components/PriceCell";
import { formatCents, formatPct, computeROI, evColor, GRADING_FEES, type ROIResult } from "../lib/roi";

// ---- shared ----------------------------------------------------------------

type Tab = "market" | "cards" | "sealed" | "graded";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "market", label: "Market" },
    { id: "cards", label: "Cards" },
    { id: "sealed", label: "Sealed" },
    { id: "graded", label: "Graded ROI" },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-800 mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            active === t.id
              ? "border-indigo-500 text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---- Market tab ------------------------------------------------------------

function MarketTab({ game, code }: { game: string; code: string }) {
  const [data, setData] = useState<{ cards: CardMarketRow[]; sealed: SealedMarketRow[] } | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchMarket(game, code, source || undefined)
      .then((r) => setData({ cards: r.cards, sealed: r.sealed }))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [game, code, source]);

  const filteredCards = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.cards.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.number.includes(q),
    );
  }, [data, search]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-60"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Any source</option>
          <option value="tcgplayer">TCGPlayer</option>
          <option value="ebay">eBay</option>
          <option value="manapool">Manapool</option>
          <option value="pricecharting">PriceCharting</option>
        </select>
      </div>

      {/* Cards table */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
          Cards ({filteredCards.length})
        </h2>
        <div className="rounded-lg border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-900 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Card</th>
                <th className="text-left px-3 py-2.5 font-medium">Rarity</th>
                <th className="text-right px-3 py-2.5 font-medium">Market</th>
                <th className="text-right px-3 py-2.5 font-medium">Lowest</th>
                <th className="text-left px-3 py-2.5 font-medium">Source</th>
                <th className="text-left px-3 py-2.5 font-medium">Week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredCards.map((c) => (
                <tr key={c.id} className="hover:bg-gray-900/40 transition-colors">
                  <td className="px-3 py-2.5 text-gray-500 tabular-nums text-xs">{c.number}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/cards/${encodeURIComponent(c.display_key)}`}
                      className="font-medium text-white hover:text-indigo-300 transition-colors"
                    >
                      {c.name}
                      {c.finish && (
                        <span className="ml-1.5 text-xs text-gray-500">{c.finish}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{c.rarity ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <PriceCell cents={c.latest_price?.market_price_cents} className="text-gray-200 text-xs" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <PriceCell cents={c.latest_price?.lowest_price_cents} className="text-gray-400 text-xs" />
                  </td>
                  <td className="px-3 py-2.5">
                    {c.latest_price ? <SourceBadge source={c.latest_price.source} /> : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 tabular-nums text-xs">
                    {c.latest_price?.week_start_date ?? "—"}
                  </td>
                </tr>
              ))}
              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500 text-sm">
                    {search ? "No cards match your search." : "No cards found for this set."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sealed table */}
      {data.sealed.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
            Sealed ({data.sealed.length})
          </h2>
          <div className="rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-900 text-gray-400 text-xs">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium">Product</th>
                  <th className="text-left px-3 py-2.5 font-medium">Type</th>
                  <th className="text-right px-3 py-2.5 font-medium">MSRP</th>
                  <th className="text-right px-3 py-2.5 font-medium">Market</th>
                  <th className="text-right px-3 py-2.5 font-medium">Lowest</th>
                  <th className="text-left px-3 py-2.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {data.sealed.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-white">
                      {s.name}
                      {s.qualifier && (
                        <span className="ml-1.5 text-xs text-gray-500">{s.qualifier}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{s.product_type.replace("_", " ")}</td>
                    <td className="px-3 py-2.5 text-right">
                      <PriceCell cents={s.msrp_cents} className="text-gray-500 text-xs" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <PriceCell cents={s.latest_price?.market_price_cents} className="text-gray-200 text-xs" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <PriceCell cents={s.latest_price?.lowest_price_cents} className="text-gray-400 text-xs" />
                    </td>
                    <td className="px-3 py-2.5">
                      {s.latest_price ? <SourceBadge source={s.latest_price.source} /> : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Cards tab -------------------------------------------------------------

function CardsTab({ game, code }: { game: string; code: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCards(game, code)
      .then((r) => setCards(r.cards))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [game, code]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cards.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.number.includes(q),
    );
  }, [cards, search]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="search"
          placeholder="Search by name or number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-72"
        />
        <span className="text-xs text-gray-500 self-center">{filtered.length} cards</span>
      </div>
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">#</th>
              <th className="text-left px-3 py-2.5 font-medium">Card</th>
              <th className="text-left px-3 py-2.5 font-medium">Rarity</th>
              <th className="text-left px-3 py-2.5 font-medium">Finish</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-900/40 transition-colors">
                <td className="px-3 py-2.5 text-gray-500 tabular-nums text-xs">{c.number}</td>
                <td className="px-3 py-2.5 font-medium text-white">
                  <Link
                    to={`/cards/${encodeURIComponent(c.display_key)}`}
                    className="hover:text-indigo-300 transition-colors"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{c.rarity ?? "—"}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{c.finish ?? "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    to={`/cards/${encodeURIComponent(c.display_key)}`}
                    className="text-indigo-400 hover:text-indigo-300 text-xs"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500 text-sm">
                  {search ? "No cards match." : "No cards in this set."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Sealed tab ------------------------------------------------------------

function SealedTab({ game, code }: { game: string; code: string }) {
  const [products, setProducts] = useState<SealedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSealed(game, code)
      .then((r) => setProducts(r.sealed))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [game, code]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="rounded-lg border border-gray-800 overflow-x-auto">
      <table className="w-full text-sm min-w-[500px]">
        <thead className="bg-gray-900 text-gray-400 text-xs">
          <tr>
            <th className="text-left px-3 py-2.5 font-medium">Product</th>
            <th className="text-left px-3 py-2.5 font-medium">Type</th>
            <th className="text-right px-3 py-2.5 font-medium">MSRP</th>
            <th className="text-left px-3 py-2.5 font-medium">In print</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {products.map((s) => (
            <tr key={s.id} className="hover:bg-gray-900/40 transition-colors">
              <td className="px-3 py-2.5 font-medium text-white">
                {s.name}
                {s.qualifier && (
                  <span className="ml-1.5 text-xs text-gray-500">{s.qualifier}</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-gray-400 text-xs">{s.product_type.replace(/_/g, " ")}</td>
              <td className="px-3 py-2.5 text-right">
                <PriceCell cents={s.msrp_cents} className="text-gray-300 text-xs" />
              </td>
              <td className="px-3 py-2.5 text-xs">
                {s.in_print == null ? (
                  <span className="text-gray-600">—</span>
                ) : s.in_print ? (
                  <span className="text-green-400">Yes</span>
                ) : (
                  <span className="text-red-400">No</span>
                )}
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-gray-500 text-sm">
                No sealed products for this set.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Watch toggle ----------------------------------------------------------

function WatchToggle({ displayKey, watched, onChange }: {
  displayKey: string;
  watched: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = !watched;
  return (
    <button
      title={err ?? (watched ? "Stop watching" : "Watch (scrapes graded prices when you run console-prices)")}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        setErr(null);
        toggleGradedWatch(displayKey, next)
          .then(() => onChange(next))
          .catch((e) => setErr(String(e)))
          .finally(() => setBusy(false));
      }}
      className={`text-base leading-none transition-opacity ${busy ? "opacity-40" : "opacity-80 hover:opacity-100"}`}
    >
      {err ? <span className="text-red-400 text-xs">!</span> : watched ? "👁" : "○"}
    </button>
  );
}

// ---- Fetch prices panel ----------------------------------------------------

const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "<your-admin-api-key>";

function FetchPricesPanel({ game, code, set }: { game: string; code: string; set: SetRow | null }) {
  const [open, setOpen] = useState(false);
  const [consoleUrl, setConsoleUrl] = useState(
    () => (set?.external_ids?.pricecharting_console_url as string | undefined) ?? ""
  );

  const cmd = consoleUrl
    ? [
        "sellthrough graded console-prices",
        `"${consoleUrl}"`,
        `--game ${game}`,
        `--set-code ${code}`,
        "--output api",
        "--api-url https://market.futuregadgetlabs.com",
        `--api-key ${ADMIN_API_KEY}`,
      ].join(" \\\n  ")
    : "";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
      >
        Fetch prices
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-[540px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              Scrapes raw prices for all cards + graded prices for watched cards (👁)
            </p>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300 text-lg leading-none ml-2">×</button>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">PriceCharting console URL</label>
            <input
              type="url"
              value={consoleUrl}
              onChange={(e) => setConsoleUrl(e.target.value)}
              placeholder="https://www.pricecharting.com/console/pokemon-journey-together"
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          {cmd ? (
            <>
              <pre className="text-xs bg-gray-950 rounded p-3 overflow-x-auto text-green-400 select-all whitespace-pre-wrap">
                {cmd}
              </pre>
              <p className="text-xs text-gray-500">
                Watch cards with 👁 to include their graded prices. Raw prices upload for all cards automatically.
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-600 italic">Enter the PriceCharting URL above to generate the command.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Graded ROI tab --------------------------------------------------------

type SortKey = "number" | "psa_gem" | "cgc_gem" | "psa_regrade_ev" | "cgc_auction_ev" | "cgc_takehome_ev" | "psa_10_uplift" | "psa_9_uplift";
type SortDir = "asc" | "desc";

interface CardWithROI {
  card: ROICard;
  roi: ROIResult;
}

function EvCell({ ev }: { ev: number | null }) {
  return (
    <span className={`tabular-nums font-mono text-xs ${evColor(ev)}`}>
      {ev != null ? (ev > 0 ? "+" : "") : ""}
      {formatCents(ev)}
    </span>
  );
}

function GemBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-gray-600">—</span>;
  const pct = rate * 100;
  const color = pct >= 15 ? "text-green-400" : pct >= 7 ? "text-yellow-400" : "text-red-400";
  return <span className={`tabular-nums font-mono text-xs ${color}`}>{pct.toFixed(1)}%</span>;
}

function StrategyBadge({ strategy }: { strategy: ROIResult["bestStrategy"] }) {
  if (!strategy) return <span className="text-gray-600">—</span>;
  const map: Record<NonNullable<ROIResult["bestStrategy"]>, string> = {
    psa_regrade: "bg-blue-900 text-blue-300",
    cgc_auction: "bg-purple-900 text-purple-300",
    cgc_takehome: "bg-violet-900 text-violet-300",
    hold: "bg-gray-800 text-gray-400",
  };
  const label: Record<NonNullable<ROIResult["bestStrategy"]>, string> = {
    psa_regrade: "PSA",
    cgc_auction: "CGC auction",
    cgc_takehome: "CGC takehome",
    hold: "hold",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[strategy]}`}>
      {label[strategy]}
    </span>
  );
}

// ---- Gem-rate sensitivity chart --------------------------------------------

function GemSensitivityChart({ card, marketGemRate }: { card: ROICard; marketGemRate: number | null }) {
  const psa10 = card.psa_10_cents;
  const psa9 = card.psa_9_cents;
  const raw = card.raw_price_cents;
  const [yourGr, setYourGr] = useState(() => Math.min(marketGemRate ?? 0.15, 0.8));

  if (psa10 == null || psa9 == null || raw == null) {
    return <p className="text-xs text-gray-500 py-3">Insufficient price data to chart ROI curve.</p>;
  }

  const fee = GRADING_FEES.psa;
  const ev = (gr: number) => gr * psa10 + (1 - gr) * psa9 - raw - fee;
  const yourEv = ev(yourGr);
  const marketEv = marketGemRate != null ? ev(Math.min(marketGemRate, 0.8)) : null;

  // Break-even: ev(gr) = 0 → gr = (raw + fee − psa9) / (psa10 − psa9)
  const delta = psa10 - psa9;
  const breakEvenGr = Math.abs(delta) < 1 ? null : (raw + fee - psa9) / delta;
  const showBreakEven = breakEvenGr != null && breakEvenGr >= 0 && breakEvenGr <= 0.8;

  // Curve: 0% → 80% in 161 steps
  const pts = Array.from({ length: 161 }, (_, i) => {
    const gr = (i / 160) * 0.8;
    return { gr, ev: ev(gr) };
  });

  // Nice Y-axis ticks
  const evMin = Math.min(...pts.map(p => p.ev));
  const evMax = Math.max(...pts.map(p => p.ev));
  const rawRange = Math.max(evMax - evMin, 1);
  const stepCents = [500, 1000, 2500, 5000, 10000, 25000, 50000].find(s => rawRange / s <= 8) ?? 50000;
  const yMin = Math.floor(evMin / stepCents) * stepCents - stepCents;
  const yMax = Math.ceil(evMax / stepCents) * stepCents + stepCents;
  const yRange = Math.max(yMax - yMin, 1);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += stepCents) yTicks.push(v);

  // SVG layout
  const W = 560, H = 160, L = 58, R = 16, T = 12, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const sx = (gr: number) => L + (gr / 0.8) * pw;
  const sy = (v: number) => T + ph - ((v - yMin) / yRange) * ph;
  const polyline = pts.map(p => `${sx(p.gr).toFixed(1)},${sy(p.ev).toFixed(1)}`).join(" ");
  const fmtY = (c: number) => `${c >= 0 ? "+" : ""}$${Math.round(Math.abs(c) / 100)}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
        <span className="font-medium text-white text-sm">
          {card.name}{card.finish ? ` · ${card.finish}` : ""}
        </span>
        <span>PSA 10 <span className="text-gray-200">{formatCents(psa10)}</span></span>
        <span>PSA 9 <span className="text-gray-200">{formatCents(psa9)}</span></span>
        <span>Raw <span className="text-gray-200">{formatCents(raw)}</span></span>
        {marketGemRate != null && (
          <span>Market gem <span className="text-green-400">{formatPct(marketGemRate)}</span></span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Y grid + labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={L} y1={sy(v)} x2={W - R} y2={sy(v)} stroke="#1f2937" strokeWidth="1" />
            <text x={L - 4} y={sy(v) + 3.5} textAnchor="end" fill="#6b7280" fontSize="9">{fmtY(v)}</text>
          </g>
        ))}
        {/* Zero (break-even) horizontal */}
        {sy(0) >= T && sy(0) <= H - B && (
          <line x1={L} y1={sy(0)} x2={W - R} y2={sy(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {/* EV curve */}
        <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="2" />
        {/* Break-even gem rate */}
        {showBreakEven && (
          <line x1={sx(breakEvenGr!)} y1={T} x2={sx(breakEvenGr!)} y2={H - B}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
        )}
        {/* Market gem rate */}
        {marketGemRate != null && marketEv != null && (
          <>
            <line x1={sx(Math.min(marketGemRate, 0.8))} y1={T}
              x2={sx(Math.min(marketGemRate, 0.8))} y2={H - B}
              stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx={sx(Math.min(marketGemRate, 0.8))} cy={sy(marketEv)}
              r="4" fill="#34d399" stroke="#030712" strokeWidth="1" />
          </>
        )}
        {/* Your gem rate */}
        <line x1={sx(yourGr)} y1={T} x2={sx(yourGr)} y2={H - B}
          stroke="#f9fafb" strokeWidth="1.5" opacity="0.55" />
        <circle cx={sx(yourGr)} cy={sy(yourEv)} r="5"
          fill={yourEv >= 0 ? "#4ade80" : "#f87171"} stroke="#030712" strokeWidth="1.5" />
        {/* X ticks */}
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(v => (
          <g key={v}>
            <line x1={sx(v)} y1={H - B} x2={sx(v)} y2={H - B + 3} stroke="#4b5563" strokeWidth="1" />
            <text x={sx(v)} y={H - B + 12} textAnchor="middle" fill="#6b7280" fontSize="9">
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* Axes */}
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#374151" />
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#374151" />
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fill="#4b5563" fontSize="9">
          Gem rate (% of graded population that scores PSA 10)
        </text>
      </svg>

      {/* Slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 shrink-0 w-24">Your gem rate</span>
        <input
          type="range" min="0" max="80" step="1"
          value={Math.round(yourGr * 100)}
          onChange={e => setYourGr(Number(e.target.value) / 100)}
          className="flex-1 accent-indigo-500"
        />
        <span className="text-xs font-mono text-white w-9 text-right">{Math.round(yourGr * 100)}%</span>
        <span className={`text-xs font-mono w-20 text-right font-semibold ${yourEv >= 0 ? "text-green-400" : "text-red-400"}`}>
          {yourEv >= 0 ? "+" : ""}{formatCents(Math.round(yourEv))}
        </span>
      </div>

      {/* Legend row */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#6366f1" strokeWidth="2" /></svg>
          EV curve (PSA, grade from raw · $25 fee)
        </span>
        {marketGemRate != null && marketEv != null && (
          <span className="flex items-center gap-1.5">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            Market {formatPct(marketGemRate)}
            {" → "}
            <span className={marketEv >= 0 ? "text-green-400" : "text-red-400"}>
              {marketEv >= 0 ? "+" : ""}{formatCents(Math.round(marketEv))}
            </span>
          </span>
        )}
        {showBreakEven ? (
          <span className="flex items-center gap-1.5">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            Break-even {formatPct(breakEvenGr)}
          </span>
        ) : (
          <span className="text-gray-600">
            {ev(0) >= 0 ? "Profitable at any gem rate" : "No break-even below 80%"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Graded ROI tab --------------------------------------------------------

function GradedTab({ game, code }: { game: string; code: string }) {
  const [cards, setCards] = useState<ROICard[]>([]);
  const [set, setSet] = useState<SetRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("psa_regrade_ev");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterPositive, setFilterPositive] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [watchOverrides, setWatchOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetchSetGraded(game, code),
      fetchSet(game, code).catch(() => null),
    ])
      .then(([graded, setRow]) => {
        setCards(graded.cards);
        setSet(setRow);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [game, code]);

  const rows = useMemo<CardWithROI[]>(() => {
    const enriched = cards.map((c) => ({ card: c, roi: computeROI(c) }));
    if (filterPositive) {
      return enriched.filter(
        ({ roi }) =>
          (roi.psaRegradePsa9Ev != null && roi.psaRegradePsa9Ev > 0) ||
          (roi.cgcRegradePsa9AuctionEv != null && roi.cgcRegradePsa9AuctionEv > 0),
      );
    }
    return enriched;
  }, [cards, filterPositive]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const getVal = ({ card, roi }: CardWithROI): number => {
        if (sortKey === "number") return parseFloat(card.number) || 0;
        if (sortKey === "psa_gem") return roi.psaGemRate ?? -Infinity;
        if (sortKey === "cgc_gem") return roi.cgcGemRate ?? -Infinity;
        if (sortKey === "psa_regrade_ev") return roi.psaRegradePsa9Ev ?? -Infinity;
        if (sortKey === "cgc_auction_ev") return roi.cgcRegradePsa9AuctionEv ?? -Infinity;
        if (sortKey === "cgc_takehome_ev") return roi.cgcRegradePsa9TakehomeEv ?? -Infinity;
        if (sortKey === "psa_10_uplift") {
          return card.psa_10_cents != null && card.raw_price_cents != null
            ? card.psa_10_cents - card.raw_price_cents : -Infinity;
        }
        if (sortKey === "psa_9_uplift") {
          return card.psa_9_cents != null && card.raw_price_cents != null
            ? card.psa_9_cents - card.raw_price_cents : -Infinity;
        }
        return -Infinity;
      };
      return sortDir === "desc" ? getVal(b) - getVal(a) : getVal(a) - getVal(b);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortTh({ label, col, right }: { label: string; col: SortKey; right?: boolean }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap
          ${right ? "text-right" : "text-left"}
          ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
        onClick={() => toggleSort(col)}
      >
        {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
      </th>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <p className="text-xs text-gray-400">
          Fees: PSA $25 · CGC $8.50 (auction) / $10 (takehome)
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer ml-auto">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={filterPositive}
            onChange={(e) => setFilterPositive(e.target.checked)}
          />
          Positive EV only
        </label>
        <FetchPricesPanel game={game} code={code} set={set} />
      </div>
      <div className="rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full text-xs min-w-[1200px]">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="px-2 py-2.5 w-6" title="Watch — include in graded price scrape">👁</th>
              <SortTh label="#" col="number" />
              <th className="text-left px-3 py-2.5 font-medium">Card</th>
              <th className="text-right px-3 py-2.5 font-medium">Raw</th>
              <th className="text-right px-3 py-2.5 font-medium">PSA 9</th>
              <th className="text-right px-3 py-2.5 font-medium">PSA 10</th>
              <th className="text-right px-3 py-2.5 font-medium">CGC 10</th>
              <SortTh label="PSA gem%" col="psa_gem" right />
              <SortTh label="CGC gem%" col="cgc_gem" right />
              <SortTh label="10↑raw" col="psa_10_uplift" right />
              <SortTh label="9↑raw" col="psa_9_uplift" right />
              <SortTh label="PSA EV" col="psa_regrade_ev" right />
              <SortTh label="CGC EV" col="cgc_auction_ev" right />
              <th className="text-left px-3 py-2.5 font-medium">Best</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {sorted.map(({ card, roi }) => {
              const isExpanded = selectedKey === card.card_id;
              const isWatched = watchOverrides[card.display_key] ?? card.graded_watch;
              const psa10Uplift = card.psa_10_cents != null && card.raw_price_cents != null
                ? card.psa_10_cents - card.raw_price_cents : null;
              const psa9Uplift = card.psa_9_cents != null && card.raw_price_cents != null
                ? card.psa_9_cents - card.raw_price_cents : null;
              return (
                <Fragment key={card.card_id}>
                  <tr
                    className={`transition-colors cursor-pointer select-none ${isExpanded ? "bg-gray-900/70" : "hover:bg-gray-900/40"}`}
                    onClick={() => setSelectedKey(isExpanded ? null : card.card_id)}
                  >
                    <td className="px-2 py-2.5 text-center">
                      <WatchToggle
                        displayKey={card.display_key}
                        watched={isWatched}
                        onChange={(next) => setWatchOverrides((prev) => ({ ...prev, [card.display_key]: next }))}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 tabular-nums">{card.number}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/cards/${encodeURIComponent(card.display_key)}`}
                        className="font-medium text-white hover:text-indigo-300"
                        onClick={e => e.stopPropagation()}
                      >
                        {card.name}
                        {card.finish && <span className="ml-1 text-gray-500">{card.finish}</span>}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums font-mono">{formatCents(card.raw_price_cents)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums font-mono">{formatCents(card.psa_9_cents)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums font-mono">{formatCents(card.psa_10_cents)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums font-mono">{formatCents(card.cgc_10_cents)}</td>
                    <td className="px-3 py-2.5 text-right"><GemBadge rate={roi.psaGemRate} /></td>
                    <td className="px-3 py-2.5 text-right"><GemBadge rate={roi.cgcGemRate} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono">
                      {psa10Uplift != null
                        ? <span className={psa10Uplift > 0 ? "text-green-400" : "text-gray-500"}>{formatCents(psa10Uplift)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono">
                      {psa9Uplift != null
                        ? <span className="text-gray-400">{formatCents(psa9Uplift)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right"><EvCell ev={roi.psaRegradePsa9Ev} /></td>
                    <td className="px-3 py-2.5 text-right"><EvCell ev={roi.cgcRegradePsa9AuctionEv} /></td>
                    <td className="px-3 py-2.5"><StrategyBadge strategy={roi.bestStrategy} /></td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={14} className="px-6 py-5 bg-gray-950 border-b border-gray-800">
                        <GemSensitivityChart card={card} marketGemRate={roi.psaGemRate} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-gray-500">
                  No graded data. Run the graded scraper to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Page ------------------------------------------------------------------

export default function SetDetailPage() {
  const { game, code } = useParams<{ game: string; code: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) ?? "market";

  function setTab(t: Tab) {
    setSearchParams({ tab: t }, { replace: true });
  }

  if (!game || !code) return null;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/" className="text-xs text-gray-500 hover:text-gray-300">
          ← Sets
        </Link>
        <h1 className="text-xl font-semibold text-white mt-1">
          {code.toUpperCase()}
          <span className="ml-2 text-sm text-gray-400 font-normal">{game}</span>
        </h1>
      </div>
      <TabBar active={tab} onChange={setTab} />
      {tab === "market" && <MarketTab game={game} code={code} />}
      {tab === "cards" && <CardsTab game={game} code={code} />}
      {tab === "sealed" && <SealedTab game={game} code={code} />}
      {tab === "graded" && <GradedTab game={game} code={code} />}
    </div>
  );
}
