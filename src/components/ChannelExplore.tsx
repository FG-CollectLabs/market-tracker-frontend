import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchChannelExplore, type ChannelDist, type ExploreChannel, type ExploreDim, type ExploreFilter, type ExploreGroup, type ExploreReport } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import RatioStrip, { StripAxis, fmtX } from "./RatioStrip";

// Sell-channel explorer: the overview's placed sales cut by grader, grade,
// rarity, language and price band, compared across up to three channels in
// charts (three: the most a categorical palette keeps apart for every
// reader once marks overlap).

// Categorical slots (dark steps), fixed per slot: a channel keeps its color
// while the other slots change.
const SLOT_COLORS = ["#3987e5", "#d95926", "#199e70"];
const DEFAULT_SLOTS = ["fanatics_auction", "fanatics_bin", "ebay_unknown"];
const INK = { primary: "#e5e7eb", secondary: "#9ca3af", muted: "#6b7280", grid: "#1f2937", axis: "#374151", surface: "#111827" };

const DIMS: { key: ExploreDim; label: string }[] = [
  { key: "grade", label: "Grade" }, { key: "grader", label: "Grader" }, { key: "rarity", label: "Rarity" },
  { key: "band", label: "Market value" }, { key: "lang", label: "Language" },
];

type Measure = "seller" | "buyer";
const pick = (x: { seller_ratio: ChannelDist; buyer_ratio: ChannelDist }, m: Measure) => (m === "seller" ? x.seller_ratio : x.buyer_ratio);

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export default function ChannelExplore({ days }: { days: number }) {
  const [basis, setBasis] = useState<"all" | "ebay">("ebay");
  const [measure, setMeasure] = useState<Measure>("seller");
  const [by, setBy] = useState<ExploreDim>("grade");
  const [f, setF] = useState<ExploreFilter>({});
  const [slots, setSlots] = useState<(string | null)[]>(DEFAULT_SLOTS);
  const [rep, setRep] = useState<ExploreReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetchChannelExplore(days, basis, by, f, [])
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [days, basis, by, f]);

  const setFilter = (k: keyof ExploreFilter, v: string) => setF((o) => ({ ...o, [k]: v || undefined, ...(k === "grader" && v ? { grade: undefined } : {}) }));
  const chosen = useMemo(() => slots.map((k) => (k ? rep?.channels.find((c) => c.channel === k) ?? null : null)), [slots, rep]);
  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-200";
  const opts = rep?.options;
  const grades = (opts?.grade ?? []).filter((o) => o.n >= 50 && (!f.grader || o.key.startsWith(f.grader + "-")));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Toggle value={basis} onChange={setBasis} options={[["ebay", "vs eBay market"], ["all", "vs all-source market"]]}
            title="Market basis: what each sale is compared against" />
          <Toggle value={measure} onChange={setMeasure} options={[["seller", "Seller gets"], ["buyer", "Buyer pays"]]}
            title="Fanatics weekly auction: seller gets = the hammer; buyer pays = hammer + 20% premium" />
          <select value={f.grader ?? ""} onChange={(e) => setFilter("grader", e.target.value)} className={sel}>
            <option value="">Every grader</option>
            {(opts?.grader ?? []).map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n.toLocaleString()})</option>)}
          </select>
          <select value={f.grade ?? ""} onChange={(e) => setFilter("grade", e.target.value)} className={sel}>
            <option value="">Every grade</option>
            {grades.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n.toLocaleString()})</option>)}
          </select>
          <select value={f.rarity ?? ""} onChange={(e) => setFilter("rarity", e.target.value)} className={sel}>
            <option value="">Every rarity</option>
            {(opts?.rarity ?? []).filter((o) => o.n >= 20).map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n.toLocaleString()})</option>)}
          </select>
          <select value={f.band ?? ""} onChange={(e) => setFilter("band", e.target.value)} className={sel}>
            <option value="">Any market value</option>
            {(opts?.band ?? []).map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n.toLocaleString()})</option>)}
          </select>
          <select value={f.lang ?? ""} onChange={(e) => setFilter("lang", e.target.value)} className={sel}>
            <option value="">Every language</option>
            {(opts?.lang ?? []).map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n.toLocaleString()})</option>)}
          </select>
          {Object.values(f).some(Boolean) && (
            <button onClick={() => setF({})} className="text-xs text-gray-400 hover:text-white underline">Clear filters</button>
          )}
          {loading && <span className="text-xs text-gray-500">Loading…</span>}
        </div>
        <p className="text-xs text-gray-500 max-w-4xl">
          {basis === "ebay"
            ? "Each sale against what the same card and grade sells for on eBay. Use this to compare platforms: on the all-source basis, a channel that makes up a big share of a grade's sales (Fanatics auctions are about 40% of CGC 10 sales) drags that grade's market down with it and looks closer to market than it is."
            : "Each sale against the market from every source, the same as the overview."}
          {" "}Market value bands are the card's market for that grade at the time of the sale.
        </p>
      </section>

      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <Spinner />}
      {rep && (
        <>
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-100">Every channel, with these filters</h2>
              <span className="text-xs text-gray-500 tabular-nums">{rep.sales_placed.toLocaleString()} sales over {rep.days} days</span>
            </div>
            <table className="w-full">
              <thead className="max-lg:!static">
                <tr className="text-[11px] text-gray-500 text-left">
                  <th className="pb-1 pr-3 font-medium">Channel</th>
                  <th className="pb-1 px-2 font-medium hidden sm:table-cell"><StripAxis /></th>
                  <th className="pb-1 pl-3 font-medium text-right">Median</th>
                  <th className="pb-1 pl-3 font-medium text-right hidden sm:table-cell">Middle half</th>
                  <th className="pb-1 pl-3 font-medium text-right">Compare</th>
                </tr>
              </thead>
              <tbody>
                {rep.channels.map((c) => {
                  const d = pick(c, measure);
                  const slot = slots.indexOf(c.channel);
                  return (
                    <tr key={c.channel} className="border-t border-gray-800">
                      <td className="py-1.5 pr-3">
                        <div className="text-sm text-gray-100 flex items-center gap-1.5">
                          {slot >= 0 && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SLOT_COLORS[slot] }} />}
                          {c.label}
                        </div>
                        <div className="text-[11px] text-gray-500 tabular-nums">
                          {d.n.toLocaleString()} sales
                          {c.channel === "fanatics_auction" && (
                            <> · hammer <span className="text-gray-300">{fmtX(c.seller_ratio.p50)}</span>, with the 20% premium <span className="text-gray-300">{fmtX(c.buyer_ratio.p50)}</span></>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 w-[45%] min-w-[11rem] hidden sm:table-cell"><RatioStrip d={d} title={c.label} /></td>
                      <td className={`py-1.5 pl-3 text-right tabular-nums text-sm whitespace-nowrap ${d.n < rep.min_group_n ? "text-gray-500" : "text-gray-100"}`}>{fmtX(d.p50)}</td>
                      <td className="py-1.5 pl-3 text-right tabular-nums text-xs text-gray-400 whitespace-nowrap hidden sm:table-cell">{fmtX(d.p25)}–{fmtX(d.p75)}</td>
                      <td className="py-1.5 pl-3 text-right">
                        <SlotPicker slot={slot} onPick={(i) => setSlots((s) => s.map((k, j) => (j === i ? c.channel : k === c.channel ? null : k)))}
                          onClear={() => setSlots((s) => s.map((k) => (k === c.channel ? null : k)))} />
                      </td>
                    </tr>
                  );
                })}
                {rep.channels.length === 0 && <tr><td colSpan={5} className="py-3 text-sm text-gray-500">No sales match these filters.</td></tr>}
              </tbody>
            </table>
          </section>

          <Legend chosen={chosen} />

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Median by {DIMS.find((d) => d.key === by)?.label.toLowerCase()}</h2>
              <Toggle value={by} onChange={setBy} options={DIMS.map((d) => [d.key, d.label] as [ExploreDim, string])} title="Split by" />
            </div>
            <p className="text-xs text-gray-500">
              Dot: median {measure === "seller" ? "seller gets" : "buyer pays"} ÷ market. Line: the middle half of sales. Hollow dots: under {rep.min_group_n} sales.
            </p>
            <DotPlot chosen={chosen} measure={measure} by={by} minN={rep.min_group_n} />
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-100">Month by month</h2>
            <p className="text-xs text-gray-500">Median ÷ market of the sales in each month. The latest month is partial.</p>
            <TrendChart chosen={chosen} measure={measure} minN={rep.min_group_n} />
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-100">How the sales spread</h2>
            <p className="text-xs text-gray-500">Share of each channel's sales at each multiple of market. The ends collect everything beyond 0.3× and 2.0×.</p>
            <div className="grid gap-3 md:grid-cols-3 [&>*]:min-w-0">
              {chosen.map((c, i) => c && <Histogram key={c.channel} c={c} color={SLOT_COLORS[i]} measure={measure} bins={rep.hist_bins} />)}
            </div>
          </section>

          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method}</p>
        </>
      )}
    </div>
  );
}

function Toggle<T extends string>({ value, onChange, options, title }: { value: T; onChange: (v: T) => void; options: [T, string][]; title: string }) {
  return (
    <div className="inline-flex flex-wrap rounded border border-gray-700 overflow-hidden text-xs" title={title} role="group" aria-label={title}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`px-2.5 py-1 ${value === k ? "bg-indigo-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>{l}</button>
      ))}
    </div>
  );
}

function SlotPicker({ slot, onPick, onClear }: { slot: number; onPick: (i: number) => void; onClear: () => void }) {
  return (
    <div className="inline-flex items-center gap-1" aria-label="Compare slot">
      {SLOT_COLORS.map((c, i) => (
        <button key={i} onClick={() => (slot === i ? onClear() : onPick(i))} title={slot === i ? "Remove from the charts" : `Chart in slot ${i + 1}`}
          className={`w-4 h-4 rounded-full border-2 ${slot === i ? "" : "opacity-30 hover:opacity-80"}`}
          style={{ background: slot === i ? c : "transparent", borderColor: c }} />
      ))}
    </div>
  );
}

function Legend({ chosen }: { chosen: (ExploreChannel | null)[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300 px-1">
      <span className="text-gray-500">Charted:</span>
      {chosen.map((c, i) => c && (
        <span key={i} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SLOT_COLORS[i] }} />{c.label}</span>
      ))}
      {chosen.every((c) => !c) && <span className="text-gray-500">pick up to three channels with the dots in the Compare column</span>}
    </div>
  );
}

// ---- dot plot: median and middle half per group, one row per group ------------------

const X_MIN = 0.4;
const X_MAX = 1.8;
const X_TICKS = [0.5, 0.75, 1, 1.25, 1.5];

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 110), w - 110);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-200 shadow-lg tabular-nums whitespace-nowrap"
      style={{ left, top: y - 6 }}>{children}</div>
  );
}

function DotPlot({ chosen, measure, by, minN }: { chosen: (ExploreChannel | null)[]; measure: Measure; by: ExploreDim; minN: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; slot: number; g: ExploreGroup } | null>(null);
  const live = chosen.map((c, i) => ({ c, i })).filter((x) => x.c) as { c: ExploreChannel; i: number }[];
  // Rows: the groups with the most sales across the charted channels (bands in order).
  const rows = useMemo(() => {
    const tot = new Map<string, { label: string; n: number; first: number }>();
    live.forEach(({ c }) => c.groups.forEach((g, gi) => {
      const t = tot.get(g.key) ?? { label: g.label, n: 0, first: gi };
      t.n += g.seller_ratio.n;
      tot.set(g.key, t);
    }));
    const all = [...tot.entries()].map(([key, t]) => ({ key, ...t }));
    if (by === "band") return all.sort((a, b) => a.first - b.first);
    return all.sort((a, b) => b.n - a.n).slice(0, 12);
  }, [live, by]);
  if (!live.length) return <p className="text-xs text-gray-500">No channels charted.</p>;
  if (!rows.length) return <p className="text-xs text-gray-500">No sales.</p>;
  const labelW = w < 480 ? 104 : 150;
  const plotW = w - labelW - 12;
  const sub = 12;
  const rowH = live.length * sub + 12;
  const top = 18;
  const h = top + rows.length * rowH + 4;
  const x = (v: number) => labelW + ((Math.min(Math.max(v, X_MIN), X_MAX) - X_MIN) / (X_MAX - X_MIN)) * plotW;
  return (
    <div ref={ref} className="relative min-w-0 w-full" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Median sale ÷ market per group and channel">
        {X_TICKS.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 4} y2={h} stroke={t === 1 ? INK.muted : INK.grid} strokeDasharray={t === 1 ? "3 3" : undefined} />
            <text x={x(t)} y={10} textAnchor="middle" fontSize={10} fill={INK.muted}>{t === 1 ? "market" : fmtX(t)}</text>
          </g>
        ))}
        {rows.map((r, ri) => {
          const y0 = top + ri * rowH;
          return (
            <g key={r.key}>
              {ri > 0 && <line x1={0} x2={w} y1={y0} y2={y0} stroke={INK.grid} />}
              <text x={labelW - 8} y={y0 + rowH / 2 + 3} textAnchor="end" fontSize={11} fill={INK.secondary}>
                {r.label.length > (w < 480 ? 15 : 22) ? r.label.slice(0, w < 480 ? 14 : 21) + "…" : r.label}
              </text>
              {live.map(({ c, i }, si) => {
                const g = c.groups.find((x) => x.key === r.key);
                if (!g) return null;
                const d = pick(g, measure);
                const cy = y0 + 6 + si * sub + sub / 2;
                const thin = d.n < minN;
                return (
                  <g key={c.channel} onMouseEnter={() => setHover({ x: x(d.p50), y: cy, slot: i, g })}>
                    <rect x={labelW} y={cy - sub / 2} width={plotW} height={sub} fill="transparent" />
                    <line x1={x(d.p25)} x2={x(d.p75)} y1={cy} y2={cy} stroke={SLOT_COLORS[i]} strokeWidth={2} strokeLinecap="round" opacity={thin ? 0.45 : 0.9} />
                    <circle cx={x(d.p50)} cy={cy} r={4.5} fill={thin ? INK.surface : SLOT_COLORS[i]} stroke={thin ? SLOT_COLORS[i] : INK.surface} strokeWidth={thin ? 1.5 : 2} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tip x={hover.x} y={hover.y} w={w}>
          <div className="text-gray-400">{chosen[hover.slot]?.label} · {hover.g.label}</div>
          {(() => { const d = pick(hover.g, measure); return <>median <b>{fmtX(d.p50)}</b> · middle half {fmtX(d.p25)}–{fmtX(d.p75)} · {d.n.toLocaleString()} sales</>; })()}
          {chosen[hover.slot]?.channel === "fanatics_auction" && <div className="text-gray-400">hammer {fmtX(hover.g.seller_ratio.p50)} · with premium {fmtX(hover.g.buyer_ratio.p50)}</div>}
        </Tip>
      )}
    </div>
  );
}

// ---- trend: monthly medians, one line per channel ------------------------------------

function TrendChart({ chosen, measure, minN }: { chosen: (ExploreChannel | null)[]; measure: Measure; minN: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const live = chosen.map((c, i) => ({ c, i })).filter((x) => x.c) as { c: ExploreChannel; i: number }[];
  const months = useMemo(() => [...new Set(live.flatMap(({ c }) => c.months.map((m) => m.key)))].sort(), [live]);
  if (!live.length || months.length === 0) return <p className="text-xs text-gray-500">No months to chart.</p>;
  const h = 200;
  const pad = { l: 40, r: 12, t: 10, b: 22 };
  const vals = live.flatMap(({ c }) => c.months.filter((m) => pick(m, measure).n >= 5).map((m) => pick(m, measure).p50));
  const lo = Math.min(0.6, Math.floor((Math.min(...vals, 1) - 0.05) * 10) / 10);
  const hiV = Math.max(1.2, Math.ceil((Math.max(...vals, 1) + 0.05) * 10) / 10);
  const x = (i: number) => pad.l + (months.length === 1 ? (w - pad.l - pad.r) / 2 : (i / (months.length - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hiV - lo)) * (h - pad.t - pad.b);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 10) / 10; t <= hiV + 1e-9; t += hiV - lo > 0.8 ? 0.2 : 0.1) ticks.push(Math.round(t * 10) / 10);
  const label = (k: string) => new Date(k + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    months.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHi(best);
  };
  return (
    <div ref={ref} className="relative min-w-0 w-full">
      <svg width={w} height={h} onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="Monthly median sale ÷ market per channel">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 1 ? INK.muted : INK.grid} strokeDasharray={t === 1 ? "3 3" : undefined} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK.muted}>{t === 1 ? "mkt" : fmtX(t)}</text>
          </g>
        ))}
        {months.map((m, i) => (i % Math.ceil(months.length / 8) === 0 || i === months.length - 1) && (
          <text key={m} x={x(i)} y={h - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>{label(m)}</text>
        ))}
        {hi != null && <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={h - pad.b} stroke={INK.axis} />}
        {live.map(({ c, i }) => {
          const pts = months.map((m, mi) => {
            const g = c.months.find((x) => x.key === m);
            return g && pick(g, measure).n >= 5 ? { mi, v: pick(g, measure).p50, n: pick(g, measure).n } : null;
          });
          let d = "";
          pts.forEach((p, k) => { if (p) d += `${d && pts[k - 1] ? "L" : "M"}${x(p.mi)},${y(p.v)}`; });
          return (
            <g key={c.channel}>
              <path d={d} fill="none" stroke={SLOT_COLORS[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => p && (
                <circle key={p.mi} cx={x(p.mi)} cy={y(p.v)} r={hi === p.mi ? 4.5 : 3} fill={p.n < minN ? INK.surface : SLOT_COLORS[i]} stroke={p.n < minN ? SLOT_COLORS[i] : INK.surface} strokeWidth={p.n < minN ? 1.5 : 2} />
              ))}
            </g>
          );
        })}
      </svg>
      {hi != null && (
        <Tip x={x(hi)} y={pad.t + 8} w={w}>
          <div className="text-gray-400">{new Date(months[hi] + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</div>
          {live.map(({ c, i }) => {
            const g = c.months.find((x) => x.key === months[hi]);
            const d = g && pick(g, measure);
            return (
              <div key={c.channel} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                {c.label}: {d && d.n >= 5 ? <><b>{fmtX(d.p50)}</b> <span className="text-gray-500">({d.n.toLocaleString()})</span></> : <span className="text-gray-500">too few</span>}
              </div>
            );
          })}
        </Tip>
      )}
    </div>
  );
}

// ---- histogram: share of a channel's sales per 0.05× bin --------------------------------

function Histogram({ c, color, measure, bins }: { c: ExploreChannel; color: string; measure: Measure; bins: { lo: number; step: number; n: number } }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const counts = measure === "seller" ? c.hist : c.hist_buyer;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const h = 130;
  const pad = { l: 4, r: 4, t: 8, b: 18 };
  const bw = (w - pad.l - pad.r) / bins.n;
  const max = Math.max(...counts) / total || 1;
  const xv = (v: number) => pad.l + ((v - bins.lo) / (bins.step * bins.n)) * (w - pad.l - pad.r);
  const d = pick(c, measure);
  return (
    <div ref={ref} className="relative min-w-0 w-full" onMouseLeave={() => setHi(null)}>
      <div className="text-xs text-gray-300 flex items-center gap-1.5 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />{c.label}
        <span className="text-gray-500 tabular-nums">median {fmtX(d.p50)}</span>
      </div>
      <svg width={w} height={h} role="img" aria-label={`${c.label}: spread of sale ÷ market`}>
        {counts.map((n, i) => {
          const bh = ((n / total) / max) * (h - pad.t - pad.b);
          return (
            <g key={i} onMouseEnter={() => setHi(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={h - pad.t - pad.b} fill="transparent" />
              {bh > 0 && <rect x={pad.l + i * bw + 1} y={h - pad.b - bh} width={Math.max(bw - 2, 1)} height={bh} rx={Math.min(2, bw / 4)} fill={color} opacity={hi == null || hi === i ? 0.9 : 0.5} />}
            </g>
          );
        })}
        <line x1={xv(1)} x2={xv(1)} y1={pad.t} y2={h - pad.b} stroke={INK.secondary} strokeDasharray="3 3" />
        <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke={INK.axis} />
        {[0.5, 1, 1.5].map((t) => <text key={t} x={xv(t)} y={h - 5} textAnchor="middle" fontSize={10} fill={INK.muted}>{t === 1 ? "market" : fmtX(t)}</text>)}
      </svg>
      {hi != null && (
        <Tip x={pad.l + (hi + 0.5) * bw} y={pad.t + 20} w={w}>
          {hi === 0 ? `under ${fmtX(bins.lo + bins.step)}` : hi === bins.n - 1 ? `${fmtX(bins.lo + hi * bins.step)} and up` : `${fmtX(bins.lo + hi * bins.step)}–${fmtX(bins.lo + (hi + 1) * bins.step)}`}
          {": "}<b>{((counts[hi] / total) * 100).toFixed(1)}%</b> <span className="text-gray-500">({counts[hi].toLocaleString()} sales)</span>
        </Tip>
      )}
    </div>
  );
}
