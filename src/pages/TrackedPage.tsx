import { Fragment, createContext, useContext, useEffect, useMemo, useState } from "react";
import WatchButton from "../components/WatchButton";
import { CardMarketLinks } from "../components/MarketLinks";
import { SetTimingSummary, TargetChips, tierOf } from "../components/BuyWindows";
import { PresetBar } from "../components/WatchTargets";
import { CardGlance, WeeklyVsPc } from "../components/CardGlance";
import { useSession } from "../lib/auth";
import { SCORE_KINDS, fetchLiveListings, fetchScores, fetchSetWindows, setPrintStatus, type CardListing, type CardScore, type ScoreKind, type SetWindows } from "../lib/api";

// Buy windows by set code, for the per-card target chips.
const WindowsCtx = createContext<Map<string, SetWindows>>(new Map());
// Cards ticked to apply a watchlist strategy to (signed in only).
const PickCtx = createContext<{ on: boolean; picked: Set<string>; toggle: (keys: string[], on: boolean) => void }>({ on: false, picked: new Set(), toggle: () => {} });
import { STANCE } from "../components/BuyingGuide";
import type { PlaySummary } from "../lib/api";
import { cardThumb } from "../lib/thumb";
import { Link, useParams } from "react-router-dom";
import {
  fetchCardSales,
  fetchSet,
  fetchSettings,
  fetchTracked,
  type CardSale,
  type CardSalesWeek,
  type CardSupplySnapshot,
  type PcPrice,
  type CollectRank,
  type PopSummary,
  type SalesSummary,
  type SourceFreshness,
  type TrackedCard,
  type TrackedResponse,
} from "../lib/api";
import { formatCents } from "../lib/roi";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { AsOf } from "../components/AsOf";
import { FRESH_TEXT, OLD_DAYS, STALE_DAYS, ago, freshness, shortDate } from "../lib/freshness";
import {
  DEFAULT_GRADING, cgcMath, gradeScore, gradingMath, monthsSince,
  type CgcMath, type GradeScore, type GradingMath, type GradingSettings,
} from "../lib/grading";

// Sources shown as column groups, in order. PriceCharting is a weekly index;
// eBay and Fanatics are built from individual sales entered via the MCP server.
const SALES_SOURCES = [
  { key: "ebay", label: "eBay sold" },
  { key: "fanatics", label: "Fanatics sold" },
] as const;

const GRADE_LABELS: Record<string, string> = {
  raw: "Raw",
  "psa-9": "PSA 9",
  "psa-10": "PSA 10",
  "cgc-10": "CGC 10",
  "cgc-10-pristine": "CGC Pristine",
};

const REASON_FILTERS = [
  { key: "", label: "All reasons" },
  { key: "rarity:", label: "Rarity" },
  { key: "artist:", label: "Artist" },
  { key: "pokemon:", label: "Pokémon" },
  { key: "manual", label: "Manual" },
];

type SortKey = "number" | "pc-psa-10" | "sold" | "supply" | "grade-roi" | "grade-score" | "ten-value" | "gem" | "pokemon-rank" | "artist-rank";
type GroupBy = "" | "rarity" | "pokemon" | "artist";

function rankLabel(r: CollectRank | undefined): string | null {
  if (!r?.tier) return null;
  return r.tier === "top" ? `#${r.position}` : r.tier.toUpperCase();
}

// Small badge for a Pokémon / artist rank: "#3" for the ordered top list,
// "A" / "B" / "C" for tiers, nothing when unranked.
function RankBadge({ r, what }: { r: CollectRank | undefined; what: string }) {
  const label = rankLabel(r);
  if (!label) return null;
  const color =
    r!.tier === "top" ? "bg-amber-900/60 text-amber-300"
    : r!.tier === "a" ? "bg-emerald-900/50 text-emerald-300"
    : r!.tier === "b" ? "bg-sky-900/50 text-sky-300"
    : "bg-gray-800 text-gray-400";
  return (
    <span className={`ml-1 px-1 rounded text-[10px] font-medium ${color}`} title={`${what} collectibility: ${label} (score ${r!.score})`}>
      {label}
    </span>
  );
}

function groupKey(c: TrackedCard, g: GroupBy): string {
  if (g === "rarity") return c.rarity || "Unknown rarity";
  if (g === "pokemon") return c.pokemon?.name ?? "No Pokémon (Trainers, items, energy)";
  if (g === "artist") return c.artist || "Unknown artist";
  return "";
}

// Group order: best-ranked Pokémon / artist first, rarities alphabetical.
function groupScore(c: TrackedCard, g: GroupBy): number {
  if (g === "pokemon") return c.pokemon ? c.pokemon.score : -1;
  if (g === "artist") return c.artist_rank?.score ?? -1;
  return 0;
}
type View = "market" | "scores" | "grading" | "grading-cgc";
// Where the grading math takes PSA 9 / 10 prices from. Raw is always
// PriceCharting's ungraded price.
type PriceSource = "pricecharting" | "fanatics";

function gradedPrice(c: TrackedCard, key: "psa-9" | "psa-10", src: PriceSource): number | null {
  if (src === "fanatics") {
    const m = c.sales.fanatics?.[key]?.median_all_in_cents;
    if (m != null) return m;
  }
  return c.pricecharting[key]?.cents ?? null;
}

interface CardGrading {
  m: GradingMath;
  score: GradeScore | null;
}

function cardMath(c: TrackedCard, gs: GradingSettings, src: PriceSource): CardGrading | null {
  const pop = c.pop?.psa;
  if (!pop) return null;
  const m = gradingMath({
    rawCents: c.pricecharting.raw?.cents ?? null,
    nineCents: gradedPrice(c, "psa-9", src),
    tenCents: gradedPrice(c, "psa-10", src),
    gem: pop.gem,
    nine: pop.nine,
    total: pop.total,
  }, gs);
  return {
    m,
    score: gradeScore(m, {
      monthsSinceRelease: monthsSince(c.set_release_date),
      psa10Sold30d: c.sales_groups?.fanatics?.["psa-10"]?.sold_window ?? 0,
      pokemonScore: c.pokemon?.score ?? null,
      artistScore: c.artist_rank?.score ?? null,
    }),
  };
}

// CGC prices: recent Fanatics, then eBay, sales (all-in), else PriceCharting.
// Where cgcPrice's number comes from, for the tag next to it.
function cgcPriceSrc(c: TrackedCard, key: string): { tag: string; title: string } | null {
  const n = (x?: { sold_window?: number }) => (x?.sold_window != null ? `, ${x.sold_window} sold in the window` : "");
  if (c.sales_groups?.fanatics?.[key]?.median_all_in_cents != null || c.sales?.fanatics?.[key]?.median_all_in_cents != null)
    return { tag: "F", title: `Fanatics sales median, all-in${n(c.sales_groups?.fanatics?.[key] ?? c.sales?.fanatics?.[key])}` };
  if (c.sales_groups?.ebay?.[key]?.median_all_in_cents != null || c.sales?.ebay?.[key]?.median_all_in_cents != null)
    return { tag: "E", title: `eBay sales median${n(c.sales_groups?.ebay?.[key] ?? c.sales?.ebay?.[key])}` };
  if (c.pricecharting[key]?.cents != null) return { tag: "PC", title: "PriceCharting (no Fanatics or eBay sales in the window)" };
  return null;
}

function SrcTag({ c, k }: { c: TrackedCard; k: string }) {
  const s = cgcPriceSrc(c, k);
  return s ? <sup className="ml-0.5 text-[9px] text-gray-500" title={s.title}>{s.tag}</sup> : null;
}

function cgcPrice(c: TrackedCard, key: string): number | null {
  return c.sales_groups?.fanatics?.[key]?.median_all_in_cents ?? c.sales?.fanatics?.[key]?.median_all_in_cents
    ?? c.sales_groups?.ebay?.[key]?.median_all_in_cents ?? c.sales?.ebay?.[key]?.median_all_in_cents
    ?? c.pricecharting[key]?.cents ?? null;
}

function cardMathCgc(c: TrackedCard, gs: GradingSettings, nineFloorCents: number): CardGrading | null {
  const pop = c.pop?.cgc;
  if (!pop) return null;
  const nineMarket = c.sales?.fanatics?.["cgc-9"]?.median_all_in_cents ?? c.sales?.ebay?.["cgc-9"]?.median_all_in_cents ?? null;
  const m = cgcMath({
    rawCents: c.pricecharting.raw?.cents ?? null,
    tenCents: cgcPrice(c, "cgc-10"),
    pristineCents: cgcPrice(c, "cgc-10-pristine"),
    nineCents: nineMarket ?? nineFloorCents,
    nineFromFloor: nineMarket == null,
    gem: pop.gem,
    pristine: pop.pristine ?? null,
    nine: pop.nine != null ? pop.nine + (pop.nine_five ?? 0) : null,
    total: pop.total,
  }, gs);
  return {
    m,
    score: gradeScore(m, {
      monthsSinceRelease: monthsSince(c.set_release_date),
      psa10Sold30d: c.sales_groups?.fanatics?.["cgc-10"]?.sold_window ?? 0,
      pokemonScore: c.pokemon?.score ?? null,
      artistScore: c.artist_rank?.score ?? null,
    }),
  };
}

// Score badge: green 70+, amber 50-69, gray below; hover for the breakdown.
function ScoreBadge({ s }: { s: GradeScore | null }) {
  if (!s) return <span className="text-gray-700">—</span>;
  const color = s.score >= 70 ? "bg-green-900/60 text-green-300" : s.score >= 50 ? "bg-amber-900/50 text-amber-300" : "bg-gray-800 text-gray-400";
  const why = s.parts.map((p) => `${p.points >= 0 ? "+" : ""}${Math.round(p.points)}  ${p.label}: ${p.why}`).join("\n");
  return (
    <span className={`inline-block min-w-[2.25rem] text-center px-1.5 py-0.5 rounded font-mono text-xs font-semibold ${color}`} title={`Buy-raw-to-grade score ${s.score}/100\n${why}`}>
      {s.score}
    </span>
  );
}

function matchesSet(code: string, filter: string): boolean {
  if (!filter) return true;
  if (filter === "jp") return code.startsWith("jp-");
  if (filter === "en") return !code.startsWith("jp-");
  return code === filter;
}

// ---- freshness ------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  pricecharting: "PriceCharting",
  ebay: "eBay",
  fanatics: "Fanatics",
  psa_pop: "PSA gem rate",
  cgc_pop: "CGC gem rate",
};

function FreshnessStrip({ sources }: { sources: Record<string, SourceFreshness> }) {
  const order = ["pricecharting", "psa_pop", "cgc_pop", "ebay", "fanatics"];
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {order.map((src) => {
        const f = sources[src];
        if (!f) return null;
        return (
          <div
            key={src}
            className={`rounded-lg border px-3 py-2 text-xs ${
              f.stale ? "border-red-900/70 bg-red-950/30" : "border-gray-800 bg-gray-900/40"
            }`}
            title={
              f.last_run_at
                ? `Last run ${new Date(f.last_run_at).toLocaleString()} (${f.last_run_status})`
                : "No ingest runs recorded"
            }
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-200">{SOURCE_LABELS[src] ?? src}</span>
              {f.stale && <span className="text-red-400 font-semibold">stale</span>}
              {f.last_run_status === "failed" && <span className="text-red-400">last run failed</span>}
            </div>
            <div className="text-gray-500 mt-0.5">newest data: {ago(f.latest_data_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- cells ------------------------------------------------------------------------

function PcCell({ price }: { price: PcPrice | undefined }) {
  if (!price) return <span className="text-gray-700">—</span>;
  const f = freshness(price.captured_at);
  return (
    <span
      className={`tabular-nums font-mono ${FRESH_TEXT[f]}`}
      title={`PriceCharting · week of ${price.week_start_date} · captured ${shortDate(price.captured_at)} (${ago(price.captured_at)})`}
    >
      {formatCents(price.cents)}
      {f === "late" && <span className="text-amber-600 ml-0.5">•</span>}
    </span>
  );
}

// Fanatics sold in one grade group: the window's median all-in price and how
// many sold; with nothing in the window, the last sale (red past 30 days).
function GroupSoldCell({ s, windowDays }: { s: SalesSummary | undefined; windowDays: number }) {
  if (!s || s.sold_total === 0) return <span className="text-gray-700">—</span>;
  if (s.sold_window > 0 && s.median_all_in_cents != null) {
    return (
      <span
        title={`${s.sold_window} sold in ${windowDays} days (${s.sold_7d} in 7) · median ${formatCents(s.median_all_in_cents)} · low ${formatCents(s.min_all_in_cents)} · last sold ${shortDate(s.last_sold_at)}`}
      >
        <span className="tabular-nums font-mono text-gray-100">{formatCents(s.median_all_in_cents)}</span>
        <span className="block text-[10px] text-gray-500 tabular-nums">{s.sold_window} sold</span>
      </span>
    );
  }
  const f = freshness(s.last_sold_at);
  return (
    <span title={`None sold in ${windowDays} days · last sale ${formatCents(s.last_all_in_cents)} on ${shortDate(s.last_sold_at)} (${ago(s.last_sold_at)})`}>
      <span className={`tabular-nums font-mono ${f === "old" ? FRESH_TEXT.old : "text-gray-400"}`}>{formatCents(s.last_all_in_cents)}</span>
      <span className={`block text-[10px] tabular-nums ${f === "old" ? "text-red-400/80" : "text-gray-500"}`}>last {shortDate(s.last_sold_at)}</span>
    </span>
  );
}

// Grade groups shown as sold columns in the market table (the history page
// shows all of them, including CGC 7-9).
const SOLD_GROUPS = ["psa-10", "psa-9", "cgc-10-pristine", "cgc-10", "any-6-8"];
const SOLD_GROUP_LABELS: Record<string, string> = {
  "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10-pristine": "CGC Pristine", "cgc-10": "CGC 10", "any-6-8": "6–8",
};

function MoneyInput({ label, cents, onChange, title }: { label: string; cents: number; onChange: (c: number) => void; title?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-gray-400" title={title}>
      {label} $
      <input
        type="number" min={0} step={1} value={cents / 100}
        onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))}
        className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono"
      />
    </label>
  );
}

function CardCell({ c }: { c: TrackedCard }) {
  const windows = useContext(WindowsCtx);
  const pick = useContext(PickCtx);
  return (
    <td className="px-3 py-2">
      <div className="flex items-start gap-2 min-w-[18rem]">
        {pick.on && (
          <input type="checkbox" className="accent-indigo-500 mt-1 shrink-0" title="Select to apply a watchlist strategy"
            checked={pick.picked.has(c.display_key)} onClick={(e) => e.stopPropagation()}
            onChange={(e) => pick.toggle([c.display_key], e.target.checked)} />
        )}
        {c.image_url ? (
          <img
            src={cardThumb(c.image_url)}
            alt=""
            loading="lazy"
            className="w-9 h-[50px] object-cover rounded-sm shrink-0 bg-gray-800"
          />
        ) : (
          <span className="w-9 h-[50px] rounded-sm shrink-0 bg-gray-800/60" />
        )}
        <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 tabular-nums text-xs w-8">#{c.number}</span>
        {c.set_code.startsWith("jp-") && (
          <span className="text-[10px] px-1 rounded bg-rose-900/50 text-rose-300" title={c.set_code}>
            {c.set_code.slice(3).toUpperCase()}
          </span>
        )}
        <span className="text-gray-100">{c.name}</span>
        <WatchButton displayKey={c.display_key} compact />
        <TargetChips displayKey={c.display_key} set={windows.get(c.set_code)} tier={tierOf(c.rarity, c.number, c.set_code)} />
        {c.finish === "rh" && (
          <span className="text-[10px] px-1 rounded bg-cyan-900/50 text-cyan-300">RH</span>
        )}
        <ReasonBadge reason={c.reason} pinned={c.pinned} />
      </div>
      <div className="text-[11px] text-gray-600 ml-10">
        {c.rarity}
        {c.pokemon && (
          <>
            {" · "}
            {c.pokemon.name}
            <RankBadge r={c.pokemon} what={c.pokemon.name} />
          </>
        )}
        {c.artist && (
          <>
            {" · "}
            {c.artist}
            <RankBadge r={c.artist_rank} what={c.artist} />
          </>
        )}
      </div>
      {c.play && <PlayLine p={c.play} />}
        </div>
      </div>
    </td>
  );
}

// The card's play in one line: stance, and the prices to buy by.
function PlayLine({ p }: { p: PlaySummary }) {
  const st = STANCE[p.stance];
  const usd = (c?: number) => (c == null ? null : `$${(c / 100).toFixed(2)}`);
  const parts = [
    p.target_cents != null && `grade ≤ ${usd(p.target_cents)}${p.grader ? ` (${p.grader})` : ""}`,
    p.break_even_cents != null && `break-even ${usd(p.break_even_cents)}`,
    p.bottom_cents != null && `raw low ~${usd(p.bottom_cents)}`,
    p.bid_cents != null && `PSA 10 bid ≤ ${usd(p.bid_cents)}`,
    p.projection != null && `${p.projection >= 0 ? "+" : ""}${Math.round(p.projection * 100)}%/yr held`,
  ].filter(Boolean);
  return (
    <div className="ml-10 mt-0.5 text-[11px] text-gray-400" title={p.headline}>
      <span className={`mr-1.5 px-1 rounded border text-[10px] ${st.cls}`}>{st.label}</span>
      {parts.join(" · ")}
    </div>
  );
}

function Money({ cents, signed }: { cents: number | null; signed?: boolean }) {
  if (cents == null) return <span className="text-gray-700">—</span>;
  const color = !signed ? "text-gray-200" : cents > 0 ? "text-green-400" : cents < 0 ? "text-red-400" : "text-gray-400";
  return (
    <span className={`tabular-nums font-mono ${color}`}>
      {signed && cents > 0 ? "+" : ""}
      {formatCents(cents)}
    </span>
  );
}

function Pct({ v, signed }: { v: number | null; signed?: boolean }) {
  if (v == null) return <span className="text-gray-700">—</span>;
  const color = !signed ? "text-gray-200" : v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-gray-400";
  return <span className={`tabular-nums font-mono ${color}`}>{signed && v > 0 ? "+" : ""}{(v * 100).toFixed(0)}%</span>;
}

function SignalBadge({ m }: { m: GradingMath | null }) {
  if (!m?.signal) return <span className="text-gray-700">—</span>;
  return m.signal === "grade" ? (
    <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-900/60 text-green-300" title="Expected grading profit clears your ROI and profit bars: buy raw copies to grade">
      Grade raw
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-900/60 text-amber-300" title="A PSA 10 sells for less than it costs to make one at this gem rate: buy 10s">
      Buy 10s
    </span>
  );
}

function PriceCell({ c, k, src }: { c: TrackedCard; k: "raw" | "psa-9" | "psa-10"; src: PriceSource }) {
  const fan = k !== "raw" && src === "fanatics" ? c.sales.fanatics?.[k] : undefined;
  if (fan?.median_all_in_cents != null) {
    return (
      <AsOf at={fan.last_recorded_at} label={`Fanatics median all-in (${fan.sold_window} sold in window)`}>
        <span className="tabular-nums font-mono text-yellow-200/90">{formatCents(fan.median_all_in_cents)}</span>
      </AsOf>
    );
  }
  return <PcCell price={c.pricecharting[k]} />;
}

function GradingCells({ c, g, src }: { c: TrackedCard; g: CardGrading | null; src: PriceSource }) {
  const m = g?.m ?? null;
  const pop = c.pop?.psa;
  const td = "px-2 py-2 text-right";
  return (
    <>
      <td className={`${td} border-l border-gray-800/70`}><PriceCell c={c} k="raw" src={src} /></td>
      <td className={td}><PriceCell c={c} k="psa-9" src={src} /></td>
      <td className={td}><PriceCell c={c} k="psa-10" src={src} /></td>
      <td className={`${td} border-l border-gray-800/70`}><GemCell pop={pop} grader="PSA" /></td>
      <td className={td}>
        {m?.p9 != null && pop ? (
          <AsOf at={pop.captured_at} label={`PSA ${pop.nine?.toLocaleString()} nines of ${pop.total.toLocaleString()} graded`}>
            <span className="tabular-nums font-mono text-gray-300">{(m.p9 * 100).toFixed(1)}%</span>
          </AsOf>
        ) : <span className="text-gray-700" title="9 count arrives with the next GemRate run">—</span>}
      </td>
      <td className={`${td} border-l border-gray-800/70`} title={m?.costCents != null ? `Cost to grade one copy: ${formatCents(m.costCents)}` : undefined}>
        <Money cents={m?.prem9Cents ?? null} signed />
      </td>
      <td className={td} title={m?.costCents != null ? `Cost to grade one copy: ${formatCents(m.costCents)}` : undefined}>
        <Money cents={m?.prem10Cents ?? null} signed />
      </td>
      <td className={`${td} border-l border-gray-800/70`} title={m?.roi != null ? `Expected value of grading one raw copy, after grading fee, shipping and the selling fee: ${formatCents(m.evCents)} on ${formatCents(m.costCents)}` : undefined}>
        <Pct v={m?.roi ?? null} signed />
        <div className="text-[10px]"><Money cents={m?.evCents ?? null} signed /></div>
      </td>
      <td className={td} title="Expected spend to end up with one PSA 10, after selling the 9s and lower slabs">
        <Money cents={m?.costPer10Cents ?? null} />
        {m?.tenValue != null && (
          <div className={`text-[10px] tabular-nums ${m.tenValue < 1 ? "text-amber-300" : "text-gray-500"}`}>
            10 sells {m.tenValue.toFixed(1)}× cost
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-center border-l border-gray-800/70"><ScoreBadge s={g?.score ?? null} /></td>
      <td className="px-2 py-2"><SignalBadge m={m} /></td>
    </>
  );
}

function GradingHead() {
  const th = "px-2 pb-2 text-right font-normal";
  return (
    <>
      <tr>
        <th rowSpan={2} className="text-left px-3 py-2 font-medium align-bottom">Card</th>
        <th colSpan={3} className="px-2 pt-2 font-medium text-purple-300 border-l border-gray-800">Prices</th>
        <th colSpan={2} className="px-2 pt-2 font-medium text-emerald-300 border-l border-gray-800" title="PSA population odds from GemRate">PSA odds</th>
        <th colSpan={2} className="px-2 pt-2 font-medium text-sky-300 border-l border-gray-800" title="Graded price minus raw + fee + shipping">Premium over cost</th>
        <th colSpan={2} className="px-2 pt-2 font-medium text-sky-300 border-l border-gray-800">Grading one raw copy</th>
        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom border-l border-gray-800" title="Buy-raw-to-grade score 0-100: EV after fees, adjusted for release age, liquidity, profit size and collectibility. Hover a score for its breakdown.">Score</th>
        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom">Signal</th>
      </tr>
      <tr>
        <th className={`${th} border-l border-gray-800`}>Raw</th>
        <th className={th}>PSA 9</th>
        <th className={th}>PSA 10</th>
        <th className={`${th} border-l border-gray-800`}>10</th>
        <th className={th}>9</th>
        <th className={`${th} border-l border-gray-800`}>If 9</th>
        <th className={th}>If 10</th>
        <th className={`${th} border-l border-gray-800`} title="Expected return after grading fee, shipping and selling fee">EV after fees</th>
        <th className={th} title="Expected spend to end up with one PSA 10">Cost per 10</th>
      </tr>
    </>
  );
}

function CgcGradingHead() {
  const th = "px-2 pb-2 text-right font-normal";
  return (
    <>
      <tr>
        <th rowSpan={2} className="text-left px-3 py-2 font-medium align-bottom">Card</th>
        <th colSpan={4} className="px-2 pt-2 font-medium text-purple-300 border-l border-gray-800">Prices</th>
        <th colSpan={3} className="px-2 pt-2 font-medium text-emerald-300 border-l border-gray-800" title="CGC population odds">CGC odds</th>
        <th colSpan={2} className="px-2 pt-2 font-medium text-sky-300 border-l border-gray-800" title="Graded price minus raw + fee + shipping">Premium over cost</th>
        <th colSpan={3} className="px-2 pt-2 font-medium text-sky-300 border-l border-gray-800">Grading one raw copy</th>
        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom border-l border-gray-800" title="Buy-raw-to-grade score 0-100 on the CGC numbers">Score</th>
        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom">Signal</th>
      </tr>
      <tr>
        <th className={`${th} border-l border-gray-800`} title="PriceCharting ungraded">Raw</th>
        <th className={th} title="CGC 9 sales median (Fanatics, else eBay), or the 9 floor (grey) when it has none">CGC 9</th>
        <th className={th} title="Fanatics sales median (F), else eBay (E), else PriceCharting (PC). Hover the tag.">CGC 10</th>
        <th className={th} title="Fanatics sales median (F), else eBay (E), else PriceCharting (PC). Hover the tag.">Pristine</th>
        <th className={`${th} border-l border-gray-800`}>Pristine</th>
        <th className={th} title="Any 10, Pristine included">10</th>
        <th className={th} title="9s and 9.5s">9</th>
        <th className={`${th} border-l border-gray-800`}>If 9</th>
        <th className={th}>If 10</th>
        <th className={`${th} border-l border-gray-800`} title="Expected return after grading fee, shipping and selling fee">EV after fees</th>
        <th className={th} title="Expected spend to end up with one CGC 10 (any)">Cost per 10</th>
        <th className={th} title="Every miss counted as a 9: what a CGC 10 must sell for so an average submission nets zero">Breakeven 10</th>
      </tr>
    </>
  );
}

function CgcGradingCells({ c, g }: { c: TrackedCard; g: CardGrading | null }) {
  const m = (g?.m ?? null) as CgcMath | null;
  const pop = c.pop?.cgc;
  const td = "px-2 py-2 text-right";
  const pctCell = (v: number | null | undefined, label: string) =>
    v != null && pop ? (
      <AsOf at={pop.captured_at} label={label}><span className="tabular-nums font-mono text-gray-300">{(v * 100).toFixed(1)}%</span></AsOf>
    ) : <span className="text-gray-700">—</span>;
  const ten = cgcPrice(c, "cgc-10");
  return (
    <>
      <td className={`${td} border-l border-gray-800/70`}><PcCell price={c.pricecharting.raw} /></td>
      <td className={td}>
        {m ? <span className={`tabular-nums font-mono ${m.nineFromFloor ? "text-gray-500" : "text-gray-200"}`}
          title={m.nineFromFloor ? "No CGC 9 sales: the 9 floor from Settings" : "CGC 9 sales median, all-in"}>{formatCents(m.nineCents)}</span>
          : <span className="text-gray-700">—</span>}
      </td>
      <td className={td}>{ten != null ? <span className="tabular-nums font-mono text-gray-200">{formatCents(ten)}<SrcTag c={c} k="cgc-10" /></span> : <span className="text-gray-700">—</span>}</td>
      <td className={td}>{cgcPrice(c, "cgc-10-pristine") != null ? <span className="tabular-nums font-mono text-gray-200">{formatCents(cgcPrice(c, "cgc-10-pristine"))}<SrcTag c={c} k="cgc-10-pristine" /></span> : <span className="text-gray-700" title="No Pristine sales: valued as a 10">—</span>}</td>
      <td className={`${td} border-l border-gray-800/70`}>{pctCell(m?.pPristine, `CGC ${pop?.pristine ?? "?"} Pristine of ${pop?.total.toLocaleString()} graded`)}</td>
      <td className={td}>{pctCell(m?.pGem, `CGC ${pop?.gem.toLocaleString()} 10s of ${pop?.total.toLocaleString()} graded`)}</td>
      <td className={td}>{pctCell(m?.p9, `CGC ${pop?.nine ?? "?"} 9s + ${pop?.nine_five ?? 0} 9.5s of ${pop?.total.toLocaleString()} graded`)}</td>
      <td className={`${td} border-l border-gray-800/70`} title={m?.costCents != null ? `Cost to grade one copy: ${formatCents(m.costCents)}` : undefined}>
        <Money cents={m?.prem9Cents ?? null} signed />
      </td>
      <td className={td} title={m?.costCents != null ? `Cost to grade one copy: ${formatCents(m.costCents)}` : undefined}>
        <Money cents={m?.prem10Cents ?? null} signed />
      </td>
      <td className={`${td} border-l border-gray-800/70`} title={m?.roi != null ? `Expected value of grading one raw copy after every fee: ${formatCents(m.evCents)} on ${formatCents(m.costCents)}` : undefined}>
        <Pct v={m?.roi ?? null} signed />
        <div className="text-[10px]"><Money cents={m?.evCents ?? null} signed /></div>
      </td>
      <td className={td}>
        <Money cents={m?.costPer10Cents ?? null} />
        {m?.tenValue != null && (
          <div className={`text-[10px] tabular-nums ${m.tenValue < 1 ? "text-amber-300" : "text-gray-500"}`}>10 sells {m.tenValue.toFixed(1)}× cost</div>
        )}
      </td>
      <td className={td} title={m?.lossPerMissCents != null ? `Each 9 ${m.lossPerMissCents >= 0 ? `loses ${formatCents(m.lossPerMissCents)}` : `makes ${formatCents(-m.lossPerMissCents)}`}` : undefined}>
        <Money cents={m?.breakEven10Cents ?? null} />
        {m?.breakEven10Cents != null && ten != null && (
          <div className={`text-[10px] tabular-nums ${ten >= m.breakEven10Cents ? "text-green-400" : "text-red-400"}`}>
            {ten >= m.breakEven10Cents ? "+" : ""}{Math.round((ten / m.breakEven10Cents - 1) * 100)}% now
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-center border-l border-gray-800/70"><ScoreBadge s={g?.score ?? null} /></td>
      <td className="px-2 py-2"><SignalBadge m={m} /></td>
    </>
  );
}

function GemCell({ pop, grader }: { pop: PopSummary | undefined; grader: string }) {
  if (!pop || pop.total <= 0) return <span className="text-gray-700">—</span>;
  return (
    <AsOf at={pop.captured_at} label={`${grader} ${pop.gem.toLocaleString()} gem of ${pop.total.toLocaleString()} graded`}>
      <span className="tabular-nums font-mono text-gray-200">{((pop.gem / pop.total) * 100).toFixed(1)}%</span>
    </AsOf>
  );
}

function ReasonBadge({ reason, pinned }: { reason: string; pinned: boolean }) {
  const [kind, value] = reason.includes(":") ? reason.split(":", 2) : [reason, ""];
  const color =
    kind === "rarity"
      ? "bg-indigo-900/50 text-indigo-300"
      : kind === "artist"
        ? "bg-pink-900/50 text-pink-300"
        : kind === "pokemon"
          ? "bg-amber-900/50 text-amber-300"
          : "bg-gray-800 text-gray-300";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${color}`} title={reason}>
      {pinned && "📌 "}
      {kind === "rarity" ? "rarity" : value || kind}
    </span>
  );
}

// ---- drill-down ---------------------------------------------------------------------

function WeeklyBars({ weekly, source, grade }: { weekly: CardSalesWeek[]; source: string; grade: string }) {
  const rows = weekly
    .filter((w) => w.source === source && w.grade_key === grade)
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
    .slice(-12);
  if (rows.length === 0) return <p className="text-xs text-gray-600">No {source} sales at this grade.</p>;
  const max = Math.max(...rows.map((r) => r.sold_count));
  return (
    <div className="flex items-end gap-1.5 h-24">
      {rows.map((r) => (
        <div
          key={r.week_start_date}
          className="flex flex-col items-center justify-end h-full"
          title={`Week of ${r.week_start_date}: ${r.sold_count} sold · median ${formatCents(r.median_all_in_cents)} · ${formatCents(r.min_all_in_cents)}–${formatCents(r.max_all_in_cents)}`}
        >
          <span className="text-[10px] text-gray-400 tabular-nums">{r.sold_count}</span>
          <div
            className="w-6 bg-indigo-500/80 rounded-t"
            style={{ height: `${Math.max(4, (r.sold_count / max) * 64)}px` }}
          />
          <span className="text-[9px] text-gray-600 mt-0.5">{r.week_start_date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- scores ---------------------------------------------------------------------

function scoreColor(n: number): string {
  return n >= 70 ? "bg-green-900/60 text-green-300" : n >= 55 ? "bg-amber-900/50 text-amber-300" : "bg-gray-800 text-gray-400";
}

function scoreTitle(k: ScoreKind, sc: CardScore): string {
  const head = `${SCORE_KINDS.find((x) => x.key === k)?.label}: ${sc.score}/100`;
  const money = sc.roi != null ? `\nExpected ${Math.round(sc.roi * 100)}% after fees (${formatCents(sc.ev_cents ?? null)} on ${formatCents(sc.cost_cents ?? null)})` : "";
  const parts = sc.parts.map((p) => `${p.points >= 0 ? "+" : ""}${Math.round(p.points)}  ${p.label}: ${p.why}`).join("\n");
  return `${head}${money}\n${parts}${sc.note ? `\n(${sc.note})` : ""}`;
}

function ScoresHead({ kind, onKind }: { kind: ScoreKind; onKind: (k: ScoreKind) => void }) {
  return (
    <tr>
      <th className="text-left px-3 py-2 font-medium">Card</th>
      {SCORE_KINDS.map((k, i) => (
        <th key={k.key} title={`${k.hint}. Click to sort.`} onClick={() => onKind(k.key)}
          className={`px-2 py-2 font-medium text-center cursor-pointer select-none ${i === 0 ? "border-l border-gray-800" : ""} ${kind === k.key ? "text-white" : "hover:text-gray-200"}`}>
          {k.label}{kind === k.key ? " ↓" : ""}
        </th>
      ))}
    </tr>
  );
}

function ScoresCells({ scores }: { scores: Partial<Record<ScoreKind, CardScore>> | undefined }) {
  return (
    <>
      {SCORE_KINDS.map((k, i) => {
        const sc = scores?.[k.key];
        return (
          <td key={k.key} className={`px-2 py-2 text-center ${i === 0 ? "border-l border-gray-800/70" : ""}`}>
            {sc ? (
              <span title={scoreTitle(k.key, sc)} className={`inline-block min-w-[2.25rem] px-1.5 py-0.5 rounded font-mono text-xs font-semibold ${scoreColor(sc.score)}`}>
                {sc.score}
              </span>
            ) : <span className="text-gray-700" title="Not enough prices or population data for this play">—</span>}
            {sc?.roi != null && <div className={`text-[10px] tabular-nums ${sc.roi >= 0 ? "text-green-400/80" : "text-red-400/80"}`}>{sc.roi >= 0 ? "+" : ""}{Math.round(sc.roi * 100)}%</div>}
          </td>
        );
      })}
    </>
  );
}

function ScoreBreakdown({ scores }: { scores: Partial<Record<ScoreKind, CardScore>> | undefined }) {
  if (!scores) return null;
  return (
    <div className="grid gap-3 md:grid-cols-4 px-4 pt-4 text-xs">
      {SCORE_KINDS.map((k) => {
        const sc = scores[k.key];
        return (
          <div key={k.key} className="rounded border border-gray-800 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-200 font-medium" title={k.hint}>{k.label}</span>
              {sc ? <span className={`px-1.5 rounded font-mono font-semibold ${scoreColor(sc.score)}`}>{sc.score}</span> : <span className="text-gray-600">—</span>}
            </div>
            {sc?.roi != null && (
              <div className="text-gray-400">{Math.round(sc.roi * 100)}% after fees: {formatCents(sc.ev_cents ?? null)} on {formatCents(sc.cost_cents ?? null)}</div>
            )}
            {sc?.parts.map((p) => (
              <div key={p.label} className="text-gray-500">
                <span className={p.points >= 0 ? "text-green-400/80" : "text-red-400/80"}>{p.points >= 0 ? "+" : ""}{Math.round(p.points)}</span> {p.label}: {p.why}
              </div>
            ))}
            {sc?.note && <div className="text-amber-300/80">{sc.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

// Live Buy Nows and auctions, every grade, with links to check prices by eye.
function LiveListings({ displayKey }: { displayKey: string }) {
  const [rows, setRows] = useState<CardListing[] | null>(null);
  useEffect(() => {
    fetchLiveListings(displayKey).then((r) => setRows(r.listings)).catch(() => setRows([]));
  }, [displayKey]);
  if (!rows) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-300 mb-1">Listed now <span className="text-gray-600 font-normal">({rows.length}, cheapest first per grade)</span></h3>
      {rows.length === 0 ? <p className="text-xs text-gray-500">No live Buy Nows or auctions tracked.</p> : (
        <table className="w-full text-xs tabular-nums">
          <tbody className="divide-y divide-gray-800/60">
            {rows.slice(0, 25).map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2 text-gray-400 whitespace-nowrap">{l.grade_key}</td>
                <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{l.source} · {l.kind === "buy_now" ? "Buy Now" : `auction${l.bids != null ? ` · ${l.bids} bids` : ""}`}</td>
                <td className="py-1 pr-2 text-right text-gray-200">{formatCents(l.price_cents)}</td>
                <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{l.ends_at ? `ends ${new Date(l.ends_at).toLocaleDateString()}` : ""}</td>
                <td className="py-1 text-gray-300 truncate max-w-md">
                  {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="hover:text-indigo-300">{l.title}</a> : l.title}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CardPanel({ card, grade }: { card: TrackedCard; grade: string }) {
  const [data, setData] = useState<{
    sales: CardSale[];
    weekly: CardSalesWeek[];
    supply: CardSupplySnapshot[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCardSales(card.display_key)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [card.display_key]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;

  const sales = data.sales.filter((s) => s.grade_key === grade);
  const supply = data.supply.filter((s) => s.grade_key === grade);

  return (
    <div className="grid md:grid-cols-[auto_1fr] gap-6 p-4">
      {card.image_url && (
        <img src={card.image_url} alt={card.name} className="w-40 rounded-lg hidden md:block" loading="lazy" />
      )}
      <div className="space-y-5 min-w-0">
        <CardGlance displayKey={card.display_key} />
        <WeeklyVsPc displayKey={card.display_key} initial={grade} />
        <CardMarketLinks displayKey={card.display_key} grade={grade} />
        <LiveListings displayKey={card.display_key} />
        <Link
          to={`/cards/${encodeURIComponent(card.display_key)}`}
          className="inline-block text-xs text-indigo-400 hover:text-indigo-300"
        >
          Weekly history: prices, Fanatics sold vs listed by grade, gem rate →
        </Link>
        <div className="grid sm:grid-cols-2 gap-6">
          {SALES_SOURCES.map((src) => (
            <div key={src.key}>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                {src.label} per week · {GRADE_LABELS[grade] ?? grade}
              </h4>
              <WeeklyBars weekly={data.weekly} source={src.key} grade={grade} />
            </div>
          ))}
        </div>

        {supply.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Supply counts</h4>
            <ul className="text-xs text-gray-300 space-y-0.5">
              {supply.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <span className="tabular-nums font-semibold">{s.active_count}</span> up on {s.source} ·{" "}
                  counted {shortDate(s.observed_at)}
                  {s.closes_at && <> · closes {shortDate(s.closes_at)}</>}
                  {s.note && <span className="text-gray-500"> · {s.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Individual sales · {GRADE_LABELS[grade] ?? grade}
          </h4>
          {sales.length === 0 ? (
            <p className="text-xs text-gray-600">None recorded at this grade yet.</p>
          ) : (
            <table className="text-xs w-full">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-3 font-medium">Sold</th>
                  <th className="text-left py-1 pr-3 font-medium">Source</th>
                  <th className="text-right py-1 pr-3 font-medium">Price</th>
                  <th className="text-right py-1 pr-3 font-medium">Premium / ship</th>
                  <th className="text-right py-1 pr-3 font-medium">All-in</th>
                  <th className="text-left py-1 font-medium">Listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1 pr-3 whitespace-nowrap text-gray-300">{shortDate(s.sold_at)}</td>
                    <td className="py-1 pr-3 text-gray-400">
                      {s.source}
                      {s.sale_type && <span className="text-gray-600"> · {s.sale_type}</span>}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums font-mono">{formatCents(s.price_cents)}</td>
                    <td className="py-1 pr-3 text-right text-gray-500 tabular-nums">
                      {s.buyers_premium_pct != null ? `${s.buyers_premium_pct}%` : ""}
                      {s.shipping_cents != null ? ` +${formatCents(s.shipping_cents)}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums font-mono text-gray-100">
                      {formatCents(s.all_in_cents)}
                    </td>
                    <td className="py-1 text-gray-500 truncate max-w-xs">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-indigo-300">
                          {s.external_id ?? "link"} ↗
                        </a>
                      ) : (
                        (s.external_id ?? s.title_raw ?? "")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[11px] text-gray-600">
          Tracked because: {card.reason}
          {card.note && <> · note: {card.note}</>} ·{" "}
          <Link to={`/cards/${card.display_key}`} className="hover:text-indigo-300">
            full card page
          </Link>
        </p>
      </div>
    </div>
  );
}

// ---- page ------------------------------------------------------------------------------

export default function TrackedPage() {
  // /browse/:code shows one set; /tracked shows every tracked card.
  const { code } = useParams<{ code?: string }>();
  const [setName, setSetName] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<TrackedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState("psa-10");
  const [reason, setReason] = useState("");
  // "" = all, "en" = English sets, "jp" = Japanese sets, else one set code.
  const [setFilter, setSetFilter] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("number");
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>("market");
  const [gsPsa, setGsPsa] = useState<GradingSettings>(DEFAULT_GRADING);
  const [gsCgc, setGsCgc] = useState<GradingSettings>({ ...DEFAULT_GRADING, feeCents: 11_00, extraCents: 50, sellFeePct: 0 });
  const [nineFloor, setNineFloor] = useState(6_00);
  // Start from the Settings page: cheapest tier per grader, shipping, selling fee, 9 floor.
  useEffect(() => {
    fetchSettings()
      .then(({ settings: st }) => {
        const tier = (g: string) => Math.min(...(st.graders?.[g]?.tiers ?? []).map((t) => t.fee_cents));
        const ship = (g: string) => st.graders?.[g]?.ship_cents;
        setGsPsa((x) => ({ ...x, feeCents: Number.isFinite(tier("psa")) ? tier("psa") : x.feeCents, extraCents: ship("psa") ?? x.extraCents, sellFeePct: st.sell_fee_pct }));
        setGsCgc((x) => ({ ...x, feeCents: Number.isFinite(tier("cgc")) ? tier("cgc") : x.feeCents, extraCents: ship("cgc") ?? x.extraCents, sellFeePct: st.sell_fee_pct }));
        if (st.miss_floor_cgc_cents != null) setNineFloor(st.miss_floor_cgc_cents);
      })
      .catch(() => undefined);
  }, []);
  const isCgc = view === "grading-cgc";
  const isGrading = view === "grading" || view === "grading-cgc";
  const isScores = view === "scores";
  const [scoreKind, setScoreKind] = useState<ScoreKind>("grade_cgc");
  const [scores, setScores] = useState<Map<string, Partial<Record<ScoreKind, CardScore>>> | null>(null);
  useEffect(() => {
    if (!isScores || scores) return;
    fetchScores({ set: code })
      .then((r) => setScores(new Map(r.cards.map((x) => [x.display_key, x.scores]))))
      .catch(() => setScores(new Map()));
  }, [isScores, code, scores]);
  useEffect(() => setScores(null), [code]);
  const gs = isCgc ? gsCgc : gsPsa;
  const setGs = isCgc ? setGsCgc : setGsPsa;
  const [priceSrc, setPriceSrc] = useState<PriceSource>("pricecharting");
  const [signalFilter, setSignalFilter] = useState<"" | "grade" | "buy10">("");
  const [groupBy, setGroupBy] = useState<GroupBy>("");

  useEffect(() => {
    setError(null);
    fetchTracked({ windowDays, set: code })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [windowDays, code]);

  useEffect(() => {
    setSetName(null);
    if (code) fetchSet("pokemon", code).then((s) => setSetName(s.name)).catch(() => setSetName(code));
  }, [code]);

  // Buy windows: this set's (or every set's, on /tracked).
  const [windows, setWindows] = useState<Map<string, SetWindows>>(new Map());
  const session = useSession();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = useMemo(() => ({
    on: !!session, picked,
    toggle: (keys: string[], on: boolean) => setPicked((s) => {
      const n = new Set(s);
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
      return n;
    }),
  }), [session, picked]);
  const [winTick, setWinTick] = useState(0);
  useEffect(() => {
    const lang = code ? (code.startsWith("jp-") ? "ja" : "en") : undefined;
    fetchSetWindows(lang)
      .then((r) => setWindows(new Map(r.sets.map((x) => [x.code, x]))))
      .catch(() => setWindows(new Map()));
  }, [code, winTick]);
  const setWin = code ? windows.get(code) : undefined;

  const gradedKeys = useMemo(() => (data?.grades ?? []).filter((g) => g !== "raw"), [data]);

  const math = useMemo(() => {
    const m = new Map<string, CardGrading | null>();
    for (const c of data?.cards ?? []) m.set(c.card_id, isCgc ? cardMathCgc(c, gs, nineFloor) : cardMath(c, gs, priceSrc));
    return m;
  }, [data, gs, priceSrc, isCgc, nineFloor]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const out = data.cards.filter(
      (c) =>
        (!reason || c.reason.startsWith(reason)) &&
        matchesSet(c.set_code, setFilter) &&
        (!signalFilter || math.get(c.card_id)?.m.signal === signalFilter) &&
        (!q || c.name.toLowerCase().includes(q) || c.number.includes(q) || (c.artist ?? "").toLowerCase().includes(q)),
    );
    const mv = (c: TrackedCard, f: (m: GradingMath) => number | null) => {
      const m = math.get(c.card_id)?.m;
      return (m && f(m)) ?? -Infinity;
    };
    const soldCount = (c: TrackedCard) =>
      SALES_SOURCES.reduce((n, s) => n + (c.sales[s.key]?.[grade]?.sold_window ?? 0), 0);
    const supplyCount = (c: TrackedCard) =>
      Object.values(c.supply).reduce((n, byGrade) => n + (byGrade[grade]?.active_count ?? 0), 0);
    const by: Record<SortKey, (a: TrackedCard, b: TrackedCard) => number> = {
      number: (a, b) =>
        a.set_code.localeCompare(b.set_code) ||
        a.number.localeCompare(b.number) ||
        (a.finish ?? "").localeCompare(b.finish ?? ""),
      "pc-psa-10": (a, b) => (b.pricecharting["psa-10"]?.cents ?? -1) - (a.pricecharting["psa-10"]?.cents ?? -1),
      sold: (a, b) => soldCount(b) - soldCount(a),
      supply: (a, b) => supplyCount(b) - supplyCount(a),
      "grade-roi": (a, b) => mv(b, (m) => m.roi) - mv(a, (m) => m.roi),
      "grade-score": (a, b) => (math.get(b.card_id)?.score?.score ?? -1) - (math.get(a.card_id)?.score?.score ?? -1),
      // Cheapest 10s relative to what they cost to make come first; cards
      // without the numbers go last.
      "ten-value": (a, b) => {
        const x = math.get(a.card_id)?.m.tenValue ?? null;
        const y = math.get(b.card_id)?.m.tenValue ?? null;
        if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
        return x - y;
      },
      gem: (a, b) => mv(b, (m) => m.p10) - mv(a, (m) => m.p10),
      "pokemon-rank": (a, b) => (b.pokemon?.score ?? -1) - (a.pokemon?.score ?? -1),
      "artist-rank": (a, b) => (b.artist_rank?.score ?? -1) - (a.artist_rank?.score ?? -1),
    };
    const sk = (c: TrackedCard) => scores?.get(c.display_key)?.[scoreKind]?.score ?? -1;
    const sorted = isScores ? [...out].sort((a, b) => sk(b) - sk(a)) : [...out].sort(by[sort]);
    if (!groupBy) return sorted;
    // Keep the chosen sort inside each group; order groups by rank, then name.
    return sorted
      .map((c, i) => ({ c, i, k: groupKey(c, groupBy), s: groupScore(c, groupBy) }))
      .sort((x, y) => {
        const gx = groupBy === "rarity" ? 0 : y.s - x.s;
        return gx || x.k.localeCompare(y.k) || x.i - y.i;
      })
      .map((x) => x.c);
  }, [data, reason, query, sort, grade, setFilter, signalFilter, math, groupBy, isScores, scores, scoreKind]);

  // Cards per group, for the group header rows.
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (groupBy) for (const c of rows) m.set(groupKey(c, groupBy), (m.get(groupKey(c, groupBy)) ?? 0) + 1);
    return m;
  }, [rows, groupBy]);

  const setCodes = useMemo(
    () => [...new Set((data?.cards ?? []).map((c) => c.set_code))].sort(),
    [data],
  );

  const colCount = isScores
    ? 1 + SCORE_KINDS.length
    : isCgc
    ? 1 + 4 + 3 + 2 + 3 + 2
    : view === "grading"
    ? 1 + 3 + 2 + 2 + 2 + 2
    : 1 + (data?.grades.length ?? 0) + 2 + SOLD_GROUPS.length + 1;

  return (
    <WindowsCtx.Provider value={windows}>
    <PickCtx.Provider value={pick}>
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          {code && (
            <Link
              to={code.startsWith("jp-") ? "/?lang=ja" : "/"}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ← Sets
            </Link>
          )}
          <h1 className="text-xl font-semibold text-white">
            {code ? (setName ?? code) : "Tracked Cards"}
            {code?.startsWith("jp-") && (
              <span className="ml-2 align-middle text-xs px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300">
                {code.slice(3).toUpperCase()}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.cards.length} tracked cards${code ? "" : ` · ${data.sets.join(", ")}`}` : "Loading…"}
            {code && (
              <>
                {" · "}
                <Link to={`/sets/pokemon/${code}?tab=graded`} className="text-indigo-400 hover:text-indigo-300">
                  Graded ROI
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {data && <FreshnessStrip sources={data.sources} />}

      {setWin && (
        <div className="mb-4">
          <SetTimingSummary set={setWin} onPrint={(v) => setPrintStatus(setWin.code, v).then(() => setWinTick((t) => t + 1))} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {(["market", "scores", "grading", "grading-cgc"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if ((v === "grading" || v === "grading-cgc") && sort === "number") setSort("grade-score");
              }}
              className={`px-3 py-1 ${view === v ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}
            >
              {v === "market" ? "Market" : v === "scores" ? "Scores" : v === "grading" ? "Grading (PSA)" : "Grading (CGC)"}
            </button>
          ))}
        </div>
        {isGrading && (
          <>
            <MoneyInput label="Fee" cents={gs.feeCents} onChange={(v) => setGs({ ...gs, feeCents: v })} title={`${isCgc ? "CGC" : "PSA"} grading fee per card`} />
            <MoneyInput label="Ship/handling" cents={gs.extraCents} onChange={(v) => setGs({ ...gs, extraCents: v })} title="Per-card shipping, insurance and handling" />
            <label className="flex items-center gap-1.5 text-gray-400" title="Selling fee on every sale: ~6% Fanatics cash payout, 0% FanCash, ~13% eBay">
              Sell fee
              <input
                type="number" min={0} max={30} step={0.5} value={Math.round(gs.sellFeePct * 1000) / 10}
                onChange={(e) => setGs({ ...gs, sellFeePct: (Number(e.target.value) || 0) / 100 })}
                className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono"
              />%
            </label>
            <label className="flex items-center gap-1.5 text-gray-400" title="Show 'Grade raw' when expected ROI is at least this">
              Min ROI
              <input
                type="number" min={0} step={5} value={Math.round(gs.minRoi * 100)}
                onChange={(e) => setGs({ ...gs, minRoi: (Number(e.target.value) || 0) / 100 })}
                className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono"
              />%
            </label>
            <MoneyInput label="Min profit" cents={gs.minProfitCents} onChange={(v) => setGs({ ...gs, minProfitCents: v })} title="Show 'Grade raw' only when expected profit is at least this" />
            {isCgc && (
              <MoneyInput label="CGC 9 floor" cents={nineFloor} onChange={setNineFloor}
                title="What a CGC 9 is worth when it has no sales of its own (Settings: A CGC 9 is worth at least)" />
            )}
            {!isCgc && <select
              value={priceSrc}
              onChange={(e) => setPriceSrc(e.target.value as PriceSource)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
              title="Where PSA 9 / 10 prices come from; raw is always PriceCharting"
            >
              <option value="pricecharting">Prices: PriceCharting</option>
              <option value="fanatics">Prices: Fanatics median, else PriceCharting</option>
            </select>}
            <select
              value={signalFilter}
              onChange={(e) => setSignalFilter(e.target.value as "" | "grade" | "buy10")}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
            >
              <option value="">All signals</option>
              <option value="grade">Grade raw</option>
              <option value="buy10">Buy 10s</option>
            </select>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <label className="flex items-center gap-2 text-gray-400">
          Sales grade
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
          >
            {gradedKeys.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g] ?? g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-gray-400">
          Window
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        {!code && <select
          value={setFilter}
          onChange={(e) => setSetFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="">All sets</option>
          <option value="en">English sets</option>
          <option value="jp">Japanese sets</option>
          {setCodes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>}
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          {REASON_FILTERS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="number">Sort: card #</option>
          <option value="pc-psa-10">Sort: PriceCharting PSA 10</option>
          <option value="sold">Sort: copies sold (grade)</option>
          <option value="supply">Sort: copies up for sale (grade)</option>
          <option value="grade-score">Sort: buy-raw score</option>
          <option value="grade-roi">Sort: EV after fees</option>
          <option value="ten-value">Sort: cheapest 10s vs cost to make</option>
          <option value="gem">Sort: PSA gem rate</option>
          <option value="pokemon-rank">Sort: Pokémon rank</option>
          <option value="artist-rank">Sort: artist rank</option>
        </select>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          <option value="">No grouping</option>
          <option value="pokemon">Group: Pokémon</option>
          <option value="artist">Group: artist</option>
          <option value="rarity">Group: rarity</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter name, #, artist"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600 w-52"
        />
      </div>

      {error && <ErrorMsg msg={error} />}
      {!data && !error && <Spinner />}

      {data && pick.on && (
        <div className="mb-2">
          <PresetBar keys={[...picked]} onClear={() => setPicked(new Set())}
            extra={<button onClick={() => pick.toggle(rows.map((c) => c.display_key), true)} className="text-xs text-gray-400 hover:text-gray-200">Select all {rows.length} shown</button>} />
          {picked.size === 0 && (
            <p className="text-[11px] text-gray-600">Tick cards (or a whole group) to watch them with a strategy, e.g. an artist's commons as slabs only.</p>
          )}
        </div>
      )}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              {isScores ? <ScoresHead kind={scoreKind} onKind={setScoreKind} /> : isCgc ? <CgcGradingHead /> : view === "grading" ? <GradingHead /> : (
                <>
              <tr>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium align-bottom">
                  Card
                </th>
                <th colSpan={data.grades.length} className="px-2 pt-2 font-medium text-purple-300 border-l border-gray-800">
                  PriceCharting
                </th>
                <th colSpan={2} className="px-2 pt-2 font-medium text-emerald-300 border-l border-gray-800" title="Share of graded copies at the top grade (PSA 10 / any CGC 10)">
                  Gem rate
                </th>
                <th colSpan={SOLD_GROUPS.length} className="px-2 pt-2 font-medium text-yellow-200/80 border-l border-gray-800" title="Median all-in price and copies sold in the window; with none, the last sale">
                  Fanatics sold · {windowDays}d
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium align-bottom border-l border-gray-800" title="Latest count of copies for sale at this grade">
                  Up now
                </th>
              </tr>
              <tr>
                {data.grades.map((g, i) => (
                  <th key={g} className={`px-2 pb-2 text-right font-normal ${i === 0 ? "border-l border-gray-800" : ""}`}>
                    {GRADE_LABELS[g] ?? g}
                  </th>
                ))}
                <th className="px-2 pb-2 text-right font-normal border-l border-gray-800">PSA</th>
                <th className="px-2 pb-2 text-right font-normal">CGC</th>
                {SOLD_GROUPS.map((g, i) => (
                  <th
                    key={g}
                    className={`px-2 pb-2 text-right font-normal ${i === 0 ? "border-l border-gray-800" : ""}`}
                    title={data.sales_groups?.find((x) => x.key === g)?.grades.join(", ")}
                  >
                    {SOLD_GROUP_LABELS[g]}
                  </th>
                ))}
              </tr>
                </>
              )}
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((c, i) => {
                const gk = groupBy ? groupKey(c, groupBy) : "";
                const newGroup = groupBy && (i === 0 || groupKey(rows[i - 1], groupBy) !== gk);
                const supply = Object.entries(c.supply)
                  .map(([src, byGrade]) => [src, byGrade[grade]] as const)
                  .filter(([, s]) => s);
                return (
                  <Fragment key={c.card_id}>
                    {newGroup && (
                      <tr className="bg-gray-900/80">
                        <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-gray-300">
                          {pick.on && (() => {
                            const keys = rows.filter((x) => groupKey(x, groupBy) === gk).map((x) => x.display_key);
                            return (
                              <input type="checkbox" className="accent-indigo-500 mr-2 align-middle" title="Select this group"
                                checked={keys.every((k) => picked.has(k))} onChange={(e) => pick.toggle(keys, e.target.checked)} />
                            );
                          })()}
                          {gk}
                          {groupBy === "pokemon" && <RankBadge r={c.pokemon} what={gk} />}
                          {groupBy === "artist" && <RankBadge r={c.artist_rank} what={gk} />}
                          <span className="ml-2 font-normal text-gray-500">{groupCounts.get(gk)} cards</span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className="hover:bg-gray-900/40 cursor-pointer"
                      onClick={() => setOpen(open === c.card_id ? null : c.card_id)}
                    >
                      <CardCell c={c} />
                      {isScores ? <ScoresCells scores={scores?.get(c.display_key)} /> : isCgc ? <CgcGradingCells c={c} g={math.get(c.card_id) ?? null} /> : view === "grading" ? <GradingCells c={c} g={math.get(c.card_id) ?? null} src={priceSrc} /> : (
                        <>
                      {data.grades.map((g, i) => (
                        <td key={g} className={`px-2 py-2 text-right ${i === 0 ? "border-l border-gray-800/70" : ""}`}>
                          <PcCell price={c.pricecharting[g]} />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right border-l border-gray-800/70">
                        <GemCell pop={c.pop?.psa} grader="PSA" />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <GemCell pop={c.pop?.cgc} grader="CGC" />
                      </td>
                      {SOLD_GROUPS.map((g, i) => (
                        <td key={g} className={`px-2 py-2 text-right ${i === 0 ? "border-l border-gray-800/70" : ""}`}>
                          <GroupSoldCell s={c.sales_groups?.fanatics?.[g]} windowDays={windowDays} />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right text-xs border-l border-gray-800/70 whitespace-nowrap">
                        {supply.length === 0 ? (
                          <span className="text-gray-700">—</span>
                        ) : (
                          supply.map(([src, s]) => (
                            <div key={src} title={`${src}: counted ${ago(s!.observed_at)}`}>
                              <span className="tabular-nums font-semibold text-gray-200">{s!.active_count}</span>{" "}
                              <span className="text-gray-500">{src}</span>
                            </div>
                          ))
                        )}
                      </td>
                        </>
                      )}
                    </tr>
                    {open === c.card_id && (
                      <tr className="bg-gray-900/30">
                        <td colSpan={colCount}>
                          {isScores && <ScoreBreakdown scores={scores?.get(c.display_key)} />}
                          <CardPanel card={c} grade={grade} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-gray-500 p-4">No cards match.</p>}
        </div>
      )}
      <p className="text-[11px] text-gray-600 mt-3">
        Hover any value for its date. • = missed a weekly update (over {STALE_DAYS} days); red = over {OLD_DAYS} days old.
        {isScores && (
          <>
            {" "}{scores ? "" : "Scoring the set… "}Scores are 0-100 per play (green 70+, amber 55+): money plays start from expected return after fees
            (break-even = 40, +100% = 80), adjusted for release age, how fast the slab sells, profit size and collectibility; out-of-print sets lose 15 on
            grading raw. Keep raw is how low today's raw price sits in the card's own history, plus the release curve. Crossover rates (PSA 9 → CGC 10,
            CGC 10 → PSA 10) are on the Settings page. Hover a score or open a card for its breakdown and live listings.
          </>
        )}
        {isCgc && (
          <>
            {" "}CGC grading math uses the CGC population: Pristine 10s sell at the Pristine price, Gem Mint 10s at the CGC 10 price, 9s and 9.5s
            at the CGC 9 price (or the 9 floor when it has no sales), lower at raw. "Breakeven 10" counts every miss as a 9: what a CGC 10 must sell
            for so an average submission nets zero. CGC prices are Fanatics then eBay sales medians.
          </>
        )}
        {view === "grading" && (
          <>
            {" "}Grading math uses the PSA population: a 9 sells at the PSA 9 price, 8 and lower at raw. "Grade raw" means
            expected profit clears your bars; "Buy 10s" means a 10 sells for less than it costs to make one at this gem
            rate. PriceCharting's "PSA 9" is any-grader 9 for now.
          </>
        )} eBay/Fanatics medians are all-in
        (Fanatics hammer + buyer's premium; eBay price + shipping).
      </p>
    </div>
    </PickCtx.Provider>
    </WindowsCtx.Provider>
  );
}
