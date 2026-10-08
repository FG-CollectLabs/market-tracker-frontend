import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchCardSales,
  fetchSet,
  fetchTracked,
  type CardSale,
  type CardSalesWeek,
  type CardSupplySnapshot,
  type PcPrice,
  type PopSummary,
  type SalesSummary,
  type SourceFreshness,
  type TrackedCard,
  type TrackedResponse,
} from "../lib/api";
import { formatCents } from "../lib/roi";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { AsOf } from "../components/AsOf";
import { STALE_DAYS, ago, daysAgo, shortDate } from "../lib/freshness";
import { DEFAULT_GRADING, gradingMath, type GradingMath, type GradingSettings } from "../lib/grading";

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

type SortKey = "number" | "pc-psa-10" | "sold" | "supply" | "grade-roi" | "ten-value" | "gem";
type View = "market" | "grading";
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

function cardMath(c: TrackedCard, gs: GradingSettings, src: PriceSource): GradingMath | null {
  const pop = c.pop?.psa;
  if (!pop) return null;
  return gradingMath({
    rawCents: c.pricecharting.raw?.cents ?? null,
    nineCents: gradedPrice(c, "psa-9", src),
    tenCents: gradedPrice(c, "psa-10", src),
    gem: pop.gem,
    nine: pop.nine,
    total: pop.total,
  }, gs);
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
  const stale = (daysAgo(price.captured_at) ?? 0) > STALE_DAYS;
  return (
    <span
      className={`tabular-nums font-mono ${stale ? "text-gray-500" : "text-gray-200"}`}
      title={`PriceCharting · week of ${price.week_start_date} · captured ${ago(price.captured_at)}`}
    >
      {formatCents(price.cents)}
      {stale && <span className="text-amber-600 ml-0.5">•</span>}
    </span>
  );
}

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
  return (
    <td className="px-3 py-2">
      <div className="flex items-center gap-2 min-w-[14rem]">
        <span className="text-gray-500 tabular-nums text-xs w-8">#{c.number}</span>
        {c.set_code.startsWith("jp-") && (
          <span className="text-[10px] px-1 rounded bg-rose-900/50 text-rose-300" title={c.set_code}>
            {c.set_code.slice(3).toUpperCase()}
          </span>
        )}
        <span className="text-gray-100">{c.name}</span>
        {c.finish === "rh" && (
          <span className="text-[10px] px-1 rounded bg-cyan-900/50 text-cyan-300">RH</span>
        )}
        <ReasonBadge reason={c.reason} pinned={c.pinned} />
      </div>
      <div className="text-[11px] text-gray-600 ml-10">
        {c.rarity}
        {c.artist && <> · {c.artist}</>}
      </div>
    </td>
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

function GradingCells({ c, m, src }: { c: TrackedCard; m: GradingMath | null; src: PriceSource }) {
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
      <td className={`${td} border-l border-gray-800/70`} title={m?.roi != null ? `Expected ROI ${(m.roi * 100).toFixed(0)}% on ${formatCents(m.costCents)}` : undefined}>
        <Money cents={m?.evCents ?? null} signed />
        <div className="text-[10px]"><Pct v={m?.roi ?? null} signed /></div>
      </td>
      <td className={td} title="Expected spend to end up with one PSA 10, after selling the 9s and lower slabs">
        <Money cents={m?.costPer10Cents ?? null} />
        {m?.tenValue != null && (
          <div className={`text-[10px] tabular-nums ${m.tenValue < 1 ? "text-amber-300" : "text-gray-500"}`}>
            10 sells {m.tenValue.toFixed(1)}× cost
          </div>
        )}
      </td>
      <td className="px-2 py-2 border-l border-gray-800/70"><SignalBadge m={m} /></td>
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
        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom border-l border-gray-800">Signal</th>
      </tr>
      <tr>
        <th className={`${th} border-l border-gray-800`}>Raw</th>
        <th className={th}>PSA 9</th>
        <th className={th}>PSA 10</th>
        <th className={`${th} border-l border-gray-800`}>10</th>
        <th className={th}>9</th>
        <th className={`${th} border-l border-gray-800`}>If 9</th>
        <th className={th}>If 10</th>
        <th className={`${th} border-l border-gray-800`}>EV / ROI</th>
        <th className={th} title="Expected spend to end up with one PSA 10">Cost per 10</th>
      </tr>
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

function SalesCells({ s, windowDays }: { s: SalesSummary | undefined; windowDays: number }) {
  if (!s) {
    return (
      <>
        <td className="px-2 py-2 text-right text-gray-700">—</td>
        <td className="px-2 py-2 text-right text-gray-700">—</td>
        <td className="px-2 py-2 text-right text-gray-700">—</td>
      </>
    );
  }
  return (
    <>
      <td
        className="px-2 py-2 text-right tabular-nums font-mono text-gray-200"
        title={`Median all-in over ${windowDays}d · low ${formatCents(s.min_all_in_cents)}`}
      >
        {formatCents(s.median_all_in_cents)}
      </td>
      <td
        className="px-2 py-2 text-right tabular-nums text-gray-300"
        title={`${s.sold_7d} in the last 7 days · ${s.sold_window} in ${windowDays} days · ${s.sold_total} recorded`}
      >
        {s.sold_7d}
        <span className="text-gray-600">/{s.sold_window}</span>
      </td>
      <td
        className="px-2 py-2 text-right text-xs text-gray-400 whitespace-nowrap"
        title={`Last sale ${formatCents(s.last_all_in_cents)} all-in`}
      >
        {shortDate(s.last_sold_at)}
      </td>
    </>
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
  const [gs, setGs] = useState<GradingSettings>(DEFAULT_GRADING);
  const [priceSrc, setPriceSrc] = useState<PriceSource>("pricecharting");
  const [signalFilter, setSignalFilter] = useState<"" | "grade" | "buy10">("");

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

  const gradedKeys = useMemo(() => (data?.grades ?? []).filter((g) => g !== "raw"), [data]);

  const math = useMemo(() => {
    const m = new Map<string, GradingMath | null>();
    for (const c of data?.cards ?? []) m.set(c.card_id, cardMath(c, gs, priceSrc));
    return m;
  }, [data, gs, priceSrc]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const out = data.cards.filter(
      (c) =>
        (!reason || c.reason.startsWith(reason)) &&
        matchesSet(c.set_code, setFilter) &&
        (!signalFilter || math.get(c.card_id)?.signal === signalFilter) &&
        (!q || c.name.toLowerCase().includes(q) || c.number.includes(q) || (c.artist ?? "").toLowerCase().includes(q)),
    );
    const mv = (c: TrackedCard, f: (m: GradingMath) => number | null) => {
      const m = math.get(c.card_id);
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
      // Cheapest 10s relative to what they cost to make come first; cards
      // without the numbers go last.
      "ten-value": (a, b) => {
        const x = math.get(a.card_id)?.tenValue ?? null;
        const y = math.get(b.card_id)?.tenValue ?? null;
        if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
        return x - y;
      },
      gem: (a, b) => mv(b, (m) => m.p10) - mv(a, (m) => m.p10),
    };
    return [...out].sort(by[sort]);
  }, [data, reason, query, sort, grade, setFilter, signalFilter, math]);

  const setCodes = useMemo(
    () => [...new Set((data?.cards ?? []).map((c) => c.set_code))].sort(),
    [data],
  );

  const colCount = view === "grading"
    ? 1 + 3 + 2 + 2 + 2 + 1
    : 1 + (data?.grades.length ?? 0) + 2 + SALES_SOURCES.length * 3 + 1;

  return (
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

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {(["market", "grading"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "grading" && sort === "number") setSort("grade-roi");
              }}
              className={`px-3 py-1 ${view === v ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}
            >
              {v === "market" ? "Market" : "Grading (PSA)"}
            </button>
          ))}
        </div>
        {view === "grading" && (
          <>
            <MoneyInput label="Fee" cents={gs.feeCents} onChange={(v) => setGs({ ...gs, feeCents: v })} title="PSA grading fee per card" />
            <MoneyInput label="Ship/handling" cents={gs.extraCents} onChange={(v) => setGs({ ...gs, extraCents: v })} title="Per-card shipping, insurance and handling" />
            <label className="flex items-center gap-1.5 text-gray-400" title="Show 'Grade raw' when expected ROI is at least this">
              Min ROI
              <input
                type="number" min={0} step={5} value={Math.round(gs.minRoi * 100)}
                onChange={(e) => setGs({ ...gs, minRoi: (Number(e.target.value) || 0) / 100 })}
                className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono"
              />%
            </label>
            <MoneyInput label="Min profit" cents={gs.minProfitCents} onChange={(v) => setGs({ ...gs, minProfitCents: v })} title="Show 'Grade raw' only when expected profit is at least this" />
            <select
              value={priceSrc}
              onChange={(e) => setPriceSrc(e.target.value as PriceSource)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
              title="Where PSA 9 / 10 prices come from; raw is always PriceCharting"
            >
              <option value="pricecharting">Prices: PriceCharting</option>
              <option value="fanatics">Prices: Fanatics median, else PriceCharting</option>
            </select>
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
          <option value="grade-roi">Sort: grading ROI</option>
          <option value="ten-value">Sort: cheapest 10s vs cost to make</option>
          <option value="gem">Sort: PSA gem rate</option>
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

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              {view === "grading" ? <GradingHead /> : (
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
                {SALES_SOURCES.map((s) => (
                  <th key={s.key} colSpan={3} className="px-2 pt-2 font-medium text-yellow-200/80 border-l border-gray-800">
                    {s.label} · {GRADE_LABELS[grade] ?? grade}
                  </th>
                ))}
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
                {SALES_SOURCES.map((s) => (
                  <Fragment key={s.key}>
                    <th className="px-2 pb-2 text-right font-normal border-l border-gray-800">Median</th>
                    <th className="px-2 pb-2 text-right font-normal" title={`7 days / ${windowDays} days`}>
                      Sold 7d/{windowDays}d
                    </th>
                    <th className="px-2 pb-2 text-right font-normal">Last</th>
                  </Fragment>
                ))}
              </tr>
                </>
              )}
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((c) => {
                const supply = Object.entries(c.supply)
                  .map(([src, byGrade]) => [src, byGrade[grade]] as const)
                  .filter(([, s]) => s);
                return (
                  <Fragment key={c.card_id}>
                    <tr
                      className="hover:bg-gray-900/40 cursor-pointer"
                      onClick={() => setOpen(open === c.card_id ? null : c.card_id)}
                    >
                      <CardCell c={c} />
                      {view === "grading" ? <GradingCells c={c} m={math.get(c.card_id) ?? null} src={priceSrc} /> : (
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
                      {SALES_SOURCES.map((s) => (
                        <SalesCells key={s.key} s={c.sales[s.key]?.[grade]} windowDays={windowDays} />
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
        Prices and gem rates marked • are more than {STALE_DAYS} days old; hover any value for its date.
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
  );
}
