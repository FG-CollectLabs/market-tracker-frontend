import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteBidPlan, fetchBidPlans, runAutoPrep, saveBidPlan, type AutoPrepResult, type BidPlan, type BidStatus, type MakeTen, type PlanKind, type SinglePrep } from "../lib/api";
import { useSession } from "../lib/auth";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import { MarketLinkRow } from "../components/MarketLinks";
import { Spinner, ErrorMsg } from "../components/Spinner";

// Buying prep: the Fanatics weekly auctions you've decided to bid on for one
// Sunday, with everything needed on the day in one place. Add cards from
// Deals → This week's auctions.

const GRADE: Record<string, string> = { "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine", raw: "Raw" };
const gradeLabel = (g: string) => GRADE[g] ?? g.replace(/^(psa|cgc)-/, (_, x: string) => `${x.toUpperCase()} `);
type AuctionKind = "auction" | "min_bid" | "lowball";
const KIND_LABEL: Record<AuctionKind, string> = { auction: "Fanatics weekly auctions", min_bid: "Min-bid (bid early)", lowball: "Lowball (bid late)" };

// Why auto-prep added a row, and what to check.
function AutoReasons({ p }: { p: BidPlan }) {
  if (!p.auto_reasons?.length && !p.auto_notes?.length) return null;
  return (
    <div className="mt-1 max-w-xs space-y-0.5 text-[11px]">
      {p.origin === "auto" && <span className="px-1 rounded bg-indigo-900/60 text-indigo-200 text-[10px]">auto</span>}
      {p.auto_reasons?.map((r) => <div key={r} className="text-gray-400">• {r}</div>)}
      {p.auto_notes?.map((r) => <div key={r} className="text-amber-300/80">! {r}</div>)}
    </div>
  );
}

// Run the auto-prep rules: preview (nothing saved) or fill this Sunday's lists.
function AutoPrepBar({ onApplied }: { onApplied: () => void }) {
  const [res, setRes] = useState<AutoPrepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const run = async (dry: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await runAutoPrep(dry);
      setRes(r);
      if (!dry) onApplied();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const r = res?.rules;
  return (
    <section className="rounded-lg border border-indigo-900/60 bg-gray-900/40 p-3 text-sm space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-100">Auto-prep</span>
        <span className="text-xs text-gray-500">Fills this Sunday's lists from live auctions by your rules; you set floors and max bids after.</span>
        <span className="flex-1" />
        <button disabled={busy} onClick={() => run(true)} className="px-3 py-1 rounded border border-gray-700 text-gray-200 hover:text-white disabled:opacity-50">Preview</button>
        <button disabled={busy} onClick={() => run(false)} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? "Running…" : "Run auto-prep"}</button>
      </div>
      {err && <ErrorMsg msg={err} />}
      {res && (
        <div className="space-y-1 text-xs">
          <div className="text-gray-300">
            {res.dry_run ? "Preview" : "Done"} for Sunday {res.auction_date}:{" "}
            {(["auction", "min_bid", "lowball"] as AuctionKind[]).map((k) => {
              const c = res.counts[k] ?? {};
              return (
                <span key={k} className="mr-3">
                  <span className="text-gray-100">{KIND_LABEL[k]}</span> {c.picked ?? 0} picked
                  {!res.dry_run && <span className="text-gray-500"> ({c.added ?? 0} new, {c.updated ?? 0} refreshed{c.removed ? `, ${c.removed} dropped` : ""})</span>}
                </span>
              );
            })}
          </div>
          {r && (
            <div className="text-gray-500">
              Rules: weekly = pressure ≥ {r.pressure_min}× or weighted edge ≥ {Math.round(r.edge_min * 100)}% or auctions ≥ {Math.round(r.auction_discount_min * 100)}% under eBay / Buy Now sold
              {r.require_window ? ", grade in its buy window" : ""}. Min-bid = {r.nm_min_grade}+ grades of {formatCents(r.min_bid_raw_min_cents)}–{formatCents(r.min_bid_raw_max_cents)} raw cards at ≤ {Math.round(r.min_bid_pct * 100)}% of raw all-in.
              Lowball = the same for {formatCents(r.lowball_raw_min_cents)}–{formatCents(r.lowball_raw_max_cents)} at ≤ {Math.round(r.lowball_pct * 100)}%{r.require_window ? "; both in the raw window (post hype)" : ""}. Change them on the Settings page.
            </div>
          )}
          {res.skipped.length > 0 && (
            <div>
              <button onClick={() => setShowSkipped((v) => !v)} className="text-indigo-300 hover:underline">
                {showSkipped ? "Hide" : "Show"} {res.skipped.length} that matched a rule but were left out
              </button>
              {showSkipped && (
                <table className="mt-1 w-full">
                  <tbody className="divide-y divide-gray-800/70">
                    {res.skipped.map((x, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1 pr-2 whitespace-nowrap"><Link to={`/cards/${encodeURIComponent(x.display_key)}`} className="text-gray-200 hover:text-indigo-300">{x.name}</Link> <span className="text-gray-500">{gradeLabel(x.grade)}</span></td>
                        <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{KIND_LABEL[x.kind as AuctionKind] ?? x.kind}</td>
                        <td className="py-1 pr-2 text-amber-300/80">{x.why}</td>
                        <td className="py-1 text-gray-500">{x.reasons?.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Min-bid / lowball row: a low-grade slab against the raw card.
function LowRow({ p, premium, kind, onChange, onRemove }: { p: BidPlan; premium: number; kind: AuctionKind; onChange: () => void; onRemove: () => void }) {
  const lp = p.low;
  const [max, setMax] = useState(dollars(p.max_bid_cents));
  const [note, setNote] = useState(p.note ?? "");
  const [won, setWon] = useState(dollars(p.won_cents));
  const save = (patch: Parameters<typeof saveBidPlan>[0]) => saveBidPlan(patch).then(onChange).catch(() => undefined);
  const base = { display_key: p.display_key, grade: p.grade, auction_date: p.auction_date, kind };
  const maxNum = Math.floor(Number(max) || 0);
  const raw = lp?.raw_cents;
  const sug = p.suggested_max_cents;
  const ofRaw = (hammer: number) => (raw ? `${Math.round((hammer * (1 + premium)) / raw * 100)}% of raw` : "");
  return (
    <tr className="align-top">
      <td className="py-2 pr-2 w-12">
        {p.deal?.image_url ? <img src={cardThumb(p.deal.image_url)} alt="" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
      </td>
      <td className="py-2 pr-3">
        <Link to={`/cards/${encodeURIComponent(p.display_key)}`} className="text-gray-100 hover:text-indigo-300">{p.deal?.name ?? p.display_key}</Link>
        <div className="text-[11px] text-gray-500">
          <span className="font-mono">{(p.deal?.set_code ?? "").replace(/^jp-/, "JP ").toUpperCase()}</span>
          <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{gradeLabel(p.grade)}</span>
        </div>
        <AutoReasons p={p} />
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap">
        <div className="text-gray-100">{formatCents(raw ?? null)}</div>
        <div className="text-gray-500">{lp?.raw_source ?? "no raw price"}</div>
        {lp?.links && (
          <div className="space-x-2">
            <a href={lp.links.ebay_sold} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">eBay sold ↗</a>
            <a href={lp.links.fanatics_sold} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">Fanatics sold ↗</a>
          </div>
        )}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums">
        {(lp?.copies ?? []).length === 0 ? <span className="text-gray-600">none up this week</span> : (
          <div className="space-y-0.5">
            {lp!.copies.slice(0, 5).map((c, i) => (
              <div key={i} className="whitespace-nowrap">
                <span className="text-gray-200">{formatCents(c.price_cents)}</span>{" "}
                {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-indigo-300">{c.title.match(/\(\d+ bids?\)$/)?.[0] ?? "0 bids"} ↗</a> : null}
              </div>
            ))}
            {lp!.copies.length > 5 && <div className="text-gray-600">+{lp!.copies.length - 5} more</div>}
          </div>
        )}
        {lp?.links && <a href={lp.links.fanatics_auctions} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">this week's auction ↗</a>}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title="The rule's max: the bid whose all-in (with buyer's premium) stays at the rule's share of raw">
        {sug != null ? (
          <>
            <div className="text-green-400 font-medium">{formatCents(sug)}</div>
            <div className="text-gray-500">{formatCents(Math.round(sug * (1 + premium)))} all-in · {ofRaw(sug)}</div>
          </>
        ) : <span className="text-gray-600">—</span>}
      </td>
      <td className="py-2 pr-3 text-xs">
        <label className="flex items-center gap-1 text-gray-400">$
          <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)}
            onBlur={() => maxNum * 100 !== (p.max_bid_cents ?? -1) && save({ ...base, max_bid_cents: maxNum * 100 })}
            className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 font-mono print:border-0" />
        </label>
        {maxNum > 0 && <div className="text-gray-500 tabular-nums mt-0.5">{formatCents(Math.round(maxNum * 100 * (1 + premium)))} all-in · {ofRaw(maxNum * 100)}</div>}
      </td>
      <td className="py-2 pr-3 text-xs">
        <select value={p.status} onChange={(e) => save({ ...base, status: e.target.value as BidStatus })}
          className={`bg-gray-900 border border-gray-700 rounded px-1 py-0.5 ${STATUS_STYLE[p.status]}`}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {p.status === "won" && (
          <label className="flex items-center gap-1 mt-1 text-gray-400">won at $
            <input type="number" min={0} step={1} value={won} onChange={(e) => setWon(e.target.value)}
              onBlur={() => save({ ...base, won_cents: Math.floor(Number(won) || 0) * 100 })}
              className="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-100 font-mono" />
          </label>
        )}
      </td>
      <td className="py-2 pr-2 text-xs">
        <input value={note} placeholder="note" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.note ?? "") && save({ ...base, note })}
          className="w-40 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 print:border-0" />
        <button onClick={onRemove} className="ml-2 text-gray-500 hover:text-red-400 print:hidden" title="Remove from this Sunday">✕</button>
      </td>
    </tr>
  );
}
const STATUSES: BidStatus[] = ["planned", "bid", "won", "lost", "skipped"];
const STATUS_STYLE: Record<BidStatus, string> = {
  planned: "text-gray-200", bid: "text-sky-300", won: "text-green-400", lost: "text-red-400", skipped: "text-gray-500",
};

function shiftDate(d: string, days: number): string {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

const dollars = (c?: number) => (c == null ? "" : String(Math.floor(c / 100)));

const SCENARIO_LABEL: Record<string, string> = { release: "At release", now: "Now", projected_low: "Projected low" };

// How the cost to make a 10 was worked out, and how it moves with the raw price.
function CostBreakdown({ m }: { m: MakeTen }) {
  const keep = 1 - m.sell_fee_pct;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="text-gray-200 font-medium mb-1">Cost to make a 10: {formatCents(m.breakeven_10_cents)}</div>
        <table className="tabular-nums">
          <tbody>
            <tr><td className="pr-4">Raw (ungraded) price</td><td className="text-right text-gray-200">{formatCents(m.raw_cents)}</td></tr>
            <tr><td className="pr-4">Grading fee ({m.route})</td><td className="text-right text-gray-200">{formatCents(m.grading_fee_cents)}</td></tr>
            <tr><td className="pr-4">Shipping and insurance</td><td className="text-right text-gray-200">{formatCents(m.shipping_cents)}</td></tr>
            <tr><td className="pr-4 text-gray-200">One submission</td><td className="text-right text-gray-100">{formatCents(m.submission_cents)}</td></tr>
            <tr><td className="pr-4" title={m.gem_scope}>Gem rate (10 or better, {m.gem_source} pop)</td><td className="text-right text-gray-200">{Math.round(m.p10 * 100)}%</td></tr>
            <tr><td className="pr-4">A miss ({m.miss_grade}) is worth</td><td className="text-right text-gray-200">{formatCents(m.miss_value_cents)} <span className="text-gray-500">({m.miss_value_source})</span></td></tr>
            <tr><td className="pr-4">Lost on each miss</td><td className="text-right text-gray-200">{formatCents(m.loss_per_miss_cents)}</td></tr>
            {m.sell_fee_pct > 0 && <tr><td className="pr-4">Selling fee</td><td className="text-right text-gray-200">{Math.round(m.sell_fee_pct * 100)}%</td></tr>}
          </tbody>
        </table>
        <div className="text-gray-500 mt-1">
          = ({formatCents(m.submission_cents)} − {Math.round(m.p_miss * 100)}% × {formatCents(Math.round(m.miss_value_cents * keep))}) ÷ {Math.round(m.p10 * 100)}%{m.sell_fee_pct > 0 ? ` ÷ ${keep.toFixed(2)}` : ""}
        </div>
      </div>
      {m.scenarios.length > 0 && (
        <div>
          <div className="text-gray-200 font-medium mb-1">As the raw price moves</div>
          <table className="tabular-nums">
            <thead className="text-gray-500"><tr><th className="text-left font-normal pr-4" /><th className="text-right font-normal pr-4">Raw</th><th className="text-right font-normal pr-4">Submission</th><th className="text-right font-normal">Cost to make a 10</th></tr></thead>
            <tbody>
              {m.scenarios.map((sc) => (
                <tr key={sc.label} title={sc.note}>
                  <td className="pr-4">{SCENARIO_LABEL[sc.label] ?? sc.label}</td>
                  <td className="text-right pr-4">{formatCents(sc.raw_cents)}</td>
                  <td className="text-right pr-4">{formatCents(sc.submission_cents)}</td>
                  <td className="text-right text-gray-100">{formatCents(sc.breakeven_10_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-gray-500 mt-1">Same gem rate, fee and miss value; only the raw price changes. Release = its first two months; projected low = the release curve's bottom.</div>
        </div>
      )}
    </div>
  );
}

function PlanRow({ p, premium, kind, onChange, onRemove }: { p: BidPlan; premium: number; kind: PlanKind; onChange: () => void; onRemove: () => void }) {
  const d = p.deal;
  const [max, setMax] = useState(dollars(p.max_bid_cents));
  // Floor: prefilled with the suggested max until you set your own.
  const [floor, setFloor] = useState(dollars(p.floor_bid_cents ?? d?.snipe_hammer_cents));
  const [note, setNote] = useState(p.note ?? "");
  const [won, setWon] = useState(dollars(p.won_cents));
  const [open, setOpen] = useState(false);
  const save = (patch: Parameters<typeof saveBidPlan>[0]) => saveBidPlan(patch).then(onChange).catch(() => undefined);
  const base = { display_key: p.display_key, grade: p.grade, auction_date: p.auction_date, kind };
  const minBid = kind === "min_bid";
  const maxNum = Math.floor(Number(max) || 0);
  const closes = (d?.weeks ?? []).filter((w) => w.closed > 0);
  return (
    <Fragment>
      <tr className="align-top">
        <td className="py-2 pr-2 w-12">
          {d?.image_url ? <img src={cardThumb(d.image_url)} alt="" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
        </td>
        <td className="py-2 pr-3">
          <Link to={`/cards/${encodeURIComponent(p.display_key)}`} className="text-gray-100 hover:text-indigo-300">{d?.name ?? p.display_key}</Link>
          <div className="text-[11px] text-gray-500">
            <span className="font-mono">{(d?.set_code ?? "").replace(/^jp-/, "JP ").toUpperCase()}</span>
            <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{GRADE[p.grade] ?? p.grade}</span>
          </div>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-indigo-300 hover:underline print:hidden">{open ? "hide" : "history & links"}</button>
          <AutoReasons p={p} />
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title="The most recent week it closed on Fanatics">
          {p.last_week ? (
            <>
              <div className="text-gray-200">{formatCents(p.last_week.avg_hammer_cents)} <span className="text-gray-500">avg bid</span></div>
              <div className="text-gray-500">{p.last_week.closed} closed · {formatCents(p.last_week.avg_all_in_cents)} all-in</div>
              <div className="text-gray-600">week of {p.last_week.week}</div>
            </>
          ) : <span className="text-gray-600">no closes in 12 weeks</span>}
        </td>
        <td className="py-2 pr-3 text-xs whitespace-nowrap">
          <div className="text-gray-200 tabular-nums">{d?.live_auctions ?? 0} closing <span className="text-gray-500">({d?.usual_fanatics_auctions_per_week?.toFixed(1) ?? "0"}/wk usual)</span></div>
          {(d?.listings ?? []).length > 0 && (
            <div className="text-gray-500 tabular-nums">
              bids {formatCents(Math.min(...d!.listings!.map((l) => l.price_cents)))}–{formatCents(Math.max(...d!.listings!.map((l) => l.price_cents)))}
            </div>
          )}
          {d?.links && (
            <a href={d.links.fanatics_auctions} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline"
              title={d.links.weekly_auction_id ? "This week's Fanatics weekly auction, filtered to this card" : "Fanatics weekly auctions, searched for this card"}>
              {d.links.weekly_auction_id ? "this week's auction ↗" : "weekly auctions ↗"}
            </a>
          )}
        </td>
        {!minBid && <td className="py-2 pr-3 text-xs">
          <label className="flex items-center gap-1 text-gray-400" title="The price you'd take every copy at if nobody else bids (prefilled with the suggested max)">$
            <input type="number" min={0} step={1} value={floor} onChange={(e) => setFloor(e.target.value)}
              onBlur={() => { const v = Math.floor(Number(floor) || 0) * 100; if (v !== (p.floor_bid_cents ?? -1)) save({ ...base, floor_bid_cents: v }); }}
              className={`w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 font-mono print:border-0 ${p.floor_bid_cents == null ? "text-gray-500" : "text-gray-100"}`} />
          </label>
          {p.floor_bid_cents == null && <div className="text-[10px] text-gray-600 mt-0.5">suggested</div>}
        </td>}
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title={d?.auction_low ? `Cheapest of ${d.auction_low.auctions} Fanatics auction closes in 180 days` : undefined}>
          {d?.auction_low ? (
            <>
              <div className="text-gray-200">{d.auction_low.url ? <a href={d.auction_low.url} target="_blank" rel="noreferrer" className="hover:text-indigo-300">{formatCents(d.auction_low.hammer_cents)}</a> : formatCents(d.auction_low.hammer_cents)}</div>
              <div className="text-gray-500">{formatCents(d.auction_low.all_in_cents)} all-in</div>
              <div className="text-gray-600">{d.auction_low.sold_at.slice(0, 10)}</div>
            </>
          ) : <span className="text-gray-600">—</span>}
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap">
          <div className="text-gray-200" title="Cheapest live Fanatics Buy Now">{d?.fanatics_bin_low_cents != null ? `${formatCents(d.fanatics_bin_low_cents)} ask` : <span className="text-gray-600">none listed</span>}</div>
          {d?.fanatics_bin_sold_median_cents != null && <div className="text-gray-500">{formatCents(d.fanatics_bin_sold_median_cents)} sold ({d.fanatics_bin_sold_n})</div>}
          {d?.value && (
            <div className="text-gray-400 mt-0.5" title={d.value.basis?.note}>
              market {formatCents(d.value.cents)} <span className="text-gray-600">({d.value.source})</span>
            </div>
          )}
          <div className="text-gray-500" title={p.grade.startsWith("cgc") ? "PriceCharting doesn't price CGC slabs separately" : undefined}>
            PC {d?.value?.basis?.pricecharting_cents != null ? formatCents(d.value.basis.pricecharting_cents) : p.grade.startsWith("cgc") ? "n/a for CGC" : "—"}
          </div>
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title="What it costs to make one by grading (for 10s: every miss counted as a 9)">
          {d?.breakeven_cents != null ? <span className="text-gray-200">{formatCents(d.breakeven_cents)}</span> : <span className="text-gray-600">—</span>}
          {d?.make_ten ? (
            <>
              <div className="text-gray-500">{Math.round(d.make_ten.p10 * 100)}% gem · raw {formatCents(d.make_ten.raw_cents)}</div>
              {d.make_ten.scenarios.length > 1 && (
                <div className="text-gray-500">{d.make_ten.scenarios.map((sc) => formatCents(sc.breakeven_10_cents)).join(" → ")}</div>
              )}
            </>
          ) : d?.gem_rate_source && <div className="text-gray-500">{d.gem_rate_source} pop</div>}
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap" title={d?.edge_calc?.why.join("\n")}>
          <div className="text-green-400 font-medium">{formatCents(d?.snipe_hammer_cents)}</div>
          {d?.edge_calc?.edge_pct != null && <div className="text-gray-500">edge {Math.round(d.edge_calc.edge_pct * 100)}% · {d.edge_calc.confidence}</div>}
          {d?.our_value_cents != null && <div className="text-gray-500">resale {formatCents(d.our_value_cents)}</div>}
        </td>
        <td className="py-2 pr-3 text-xs">
          <label className="flex items-center gap-1 text-gray-400">$
            <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)}
              onBlur={() => maxNum * 100 !== (p.max_bid_cents ?? -1) && save({ ...base, max_bid_cents: maxNum * 100 })}
              className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 font-mono print:border-0" />
          </label>
          {maxNum > 0 && <div className="text-gray-500 tabular-nums mt-0.5">{formatCents(Math.round(maxNum * 100 * (1 + premium)))} all-in</div>}
        </td>
        <td className="py-2 pr-3 text-xs">
          <select value={p.status} onChange={(e) => save({ ...base, status: e.target.value as BidStatus })}
            className={`bg-gray-900 border border-gray-700 rounded px-1 py-0.5 ${STATUS_STYLE[p.status]}`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {p.status === "won" && (
            <label className="flex items-center gap-1 mt-1 text-gray-400">won at $
              <input type="number" min={0} step={1} value={won} onChange={(e) => setWon(e.target.value)}
                onBlur={() => save({ ...base, won_cents: Math.floor(Number(won) || 0) * 100 })}
                className="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-100 font-mono" />
            </label>
          )}
        </td>
        <td className="py-2 pr-2 text-xs">
          <input value={note} placeholder="note" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.note ?? "") && save({ ...base, note })}
            className="w-40 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 print:border-0" />
          <button onClick={onRemove} className="ml-2 text-gray-500 hover:text-red-400 print:hidden" title="Remove from this Sunday">✕</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={minBid ? 10 : 11} className="pb-3 text-xs text-gray-400 space-y-2">
            <MarketLinkRow links={d?.links} />
            {d?.make_ten && <CostBreakdown m={d.make_ten} />}
            {closes.length > 0 ? (
              <table className="tabular-nums">
                <thead className="text-gray-500"><tr><th className="text-left font-normal pr-4">Week of</th><th className="text-right font-normal pr-4">Closed</th><th className="text-right font-normal pr-4">Avg bid</th><th className="text-right font-normal">Avg all-in</th></tr></thead>
                <tbody>
                  {[...closes].reverse().map((w) => (
                    <tr key={w.week}>
                      <td className="pr-4">{w.week}</td>
                      <td className="text-right pr-4">{w.closed}</td>
                      <td className="text-right pr-4 text-gray-200">{w.avg_cents != null ? formatCents(Math.round(w.avg_cents / (1 + premium))) : "—"}</td>
                      <td className="text-right">{w.avg_cents != null ? formatCents(w.avg_cents) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div>No Fanatics auction closes in the last 12 weeks.</div>}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function AuctionsPrep({ kind, tick: outer }: { kind: AuctionKind; tick: number }) {
  const minBid = kind === "min_bid";
  const low = kind !== "auction";
  const session = useSession();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchBidPlans>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    fetchBidPlans(date, kind).then((r) => { setData(r); setError(null); }).catch((e: Error) => setError(e.message));
  }, [session, date, tick, outer, kind]);
  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your buying prep.</p>;
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const day = data.auction_date;
  const refresh = () => setTick((t) => t + 1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 max-w-3xl">
            {minBid
              ? <>Min-bid auctions closing Sunday {day}: near-mint low grades of cheap cards, bid early at a small max ($5–6) because $1 can decide them. Priced against the raw card.</>
              : kind === "lowball"
              ? <>Lowball auctions closing Sunday {day}: near-mint low grades bid late at a discount to raw (a PSA 8 of a $15 card for $10–11 all-in), to resell around raw or crack.</>
              : <>Fanatics weekly auctions you've decided to bid on, closing Sunday {day}, with a floor you'll bid near the close. Add cards from Deals → This week's auctions (open a row, "Add to Sunday's bids").</>}
            Max bids are whole dollars: Fanatics bids go in $1 steps. Suggested max clears your target margin on the resale; hover it for the working.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm print:hidden">
          <button onClick={() => setDate(shiftDate(day, -7))} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">← prev Sunday</button>
          <span className="text-gray-200 font-mono">{day}</span>
          <button onClick={() => setDate(shiftDate(day, 7))} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">next Sunday →</button>
          {day !== data.next_auction_date && <button onClick={() => setDate(undefined)} className="px-2 py-1 rounded border border-gray-700 text-indigo-300">this Sunday</button>}
          <button onClick={() => window.print()} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500">Print</button>
        </div>
      </div>
      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-100">{KIND_LABEL[kind]} · {data.plans.length} card{data.plans.length === 1 ? "" : "s"}</h2>
          <div className="text-xs text-gray-400 tabular-nums">
            If every max hits: <span className="text-gray-100">{formatCents(data.totals.max_bids_cents)}</span> in bids,{" "}
            <span className="text-gray-100">{formatCents(data.totals.max_all_in_cents)}</span> all-in ({Math.round(data.buyers_premium_pct * 100)}% buyer's premium)
          </div>
        </div>
        {data.plans.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing on this Sunday's {kind === "auction" ? "" : KIND_LABEL[kind] + " "}list yet. Run auto-prep above, or add cards from Deals → This week's auctions.</p>
        ) : low ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left font-medium py-1" colSpan={2}>Card</th>
                  <th className="text-left font-medium py-1 pr-3">Raw price</th>
                  <th className="text-left font-medium py-1 pr-3" title="This week's Fanatics auctions of this grade: current bid, bids">Up this week</th>
                  <th className="text-left font-medium py-1 pr-3" title="The rule's max bid">Rule max</th>
                  <th className="text-left font-medium py-1 pr-3">Your max</th>
                  <th className="text-left font-medium py-1 pr-3">Status</th>
                  <th className="text-left font-medium py-1">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70">
                {data.plans.map((p) => (
                  <LowRow key={p.id + p.updated_at} p={p} premium={data.buyers_premium_pct} kind={kind} onChange={refresh}
                    onRemove={() => deleteBidPlan(p.id).then(refresh).catch(() => undefined)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left font-medium py-1" colSpan={2}>Card</th>
                  <th className="text-left font-medium py-1 pr-3" title="The most recent week it closed: average winning bid, copies, all-in">Last week</th>
                  <th className="text-left font-medium py-1 pr-3">Up this week</th>
                  {!minBid && <th className="text-left font-medium py-1 pr-3" title="The price you'd take every copy at if nobody else bids">Floor</th>}
                  <th className="text-left font-medium py-1 pr-3" title="Cheapest Fanatics auction close, 180 days">Auction low</th>
                  <th className="text-left font-medium py-1 pr-3" title="Cheapest live Fanatics Buy Now, and the Buy Now sold median">Fanatics BIN</th>
                  <th className="text-left font-medium py-1 pr-3" title="Cost to obtain one by grading it yourself">Cost to grade</th>
                  <th className="text-left font-medium py-1 pr-3" title="Most to bid and still clear your target margin reselling at the best channel">Suggested max</th>
                  <th className="text-left font-medium py-1 pr-3">Your max</th>
                  <th className="text-left font-medium py-1 pr-3">Status</th>
                  <th className="text-left font-medium py-1">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70">
                {data.plans.map((p) => (
                  <PlanRow key={p.id + p.updated_at} p={p} premium={data.buyers_premium_pct} kind={kind} onChange={refresh}
                    onRemove={() => deleteBidPlan(p.id).then(refresh).catch(() => undefined)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---- singles ---------------------------------------------------------------------

const pct = (v?: number) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const MARKET_GRADES: [string, string][] = [["raw", "Raw"], ["psa-10", "PSA 10"], ["psa-9", "PSA 9"], ["cgc-10", "CGC 10"], ["cgc-10-pristine", "Pristine"]];

function SingleRow({ p, onChange, onRemove }: { p: BidPlan; onChange: () => void; onRemove: () => void }) {
  const sp: SinglePrep | undefined = p.single;
  const [max, setMax] = useState(dollars(p.max_bid_cents));
  const [note, setNote] = useState(p.note ?? "");
  const [paid, setPaid] = useState(dollars(p.won_cents));
  const base = { display_key: p.display_key, grade: p.grade, auction_date: p.auction_date, kind: "single" as const };
  const save = (patch: Parameters<typeof saveBidPlan>[0]) => saveBidPlan(patch).then(onChange).catch(() => undefined);
  const name = sp?.name ?? p.display_key;
  return (
    <tr className="align-top">
      <td className="py-2 pr-3">
        <div className="flex gap-2">
          {sp?.image_url ? <img src={cardThumb(sp.image_url)} alt="" className="w-10 h-14 object-cover rounded-sm bg-gray-800 shrink-0" /> : null}
          <div>
        <Link to={`/cards/${encodeURIComponent(p.display_key)}`} className="text-gray-100 hover:text-indigo-300">{name}</Link>
        <span className="ml-1.5 text-[11px] text-gray-500 font-mono">{(sp?.set_code ?? "").replace(/^jp-/, "JP ").toUpperCase()}</span>
        <div className="text-[11px]"><span className="px-1 rounded bg-gray-800 text-gray-300">{GRADE[p.grade] ?? p.grade}</span>
          {sp && !sp.in_print && <span className="ml-1.5 text-amber-300/80">out of print</span>}</div>
        <div className="mt-1"><MarketLinkRow links={sp?.links} compact /></div>
          </div>
        </div>
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums">
        {MARKET_GRADES.filter(([g]) => sp?.markets[g] != null).map(([g, label]) => (
          <div key={g} className={g === p.grade ? "text-gray-100 font-medium" : "text-gray-400"} title={sp?.sources[g]}>{label} {formatCents(sp!.markets[g])}</div>
        ))}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums" title={sp?.floor_note}>
        {sp?.floor_cents != null ? <div className="text-gray-200">{formatCents(sp.floor_cents)}</div> : <span className="text-gray-600">—</span>}
        <div className="text-gray-500 max-w-[12rem]">{sp?.floor_note}</div>
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums">
        {(sp?.grading ?? []).map((g) => (
          <div key={g.grader} className="mb-1" title={`${g.grader.toUpperCase()} ${g.tier ?? ""}: ${pct(g.roi)} expected after fees (${formatCents(g.ev_cents ?? null)} on ${formatCents(g.cost_cents ?? null)}), gem rate ${g.p10 != null ? Math.round(g.p10 * 100) + "%" : "—"}`}>
            <span className="text-gray-300">{g.grader.toUpperCase()}</span>{" "}
            <span className={(g.roi ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{pct(g.roi)}</span>
            <span className="text-gray-500"> · 10 costs {formatCents(g.breakeven_10_cents ?? null)}</span>
            <div className="text-gray-500">raw breakeven {formatCents(g.breakeven_raw_cents ?? null)} · grade ≤ {formatCents(g.max_raw_cents ?? null)}</div>
          </div>
        ))}
        {(sp?.grading ?? []).length === 0 && <span className="text-gray-600">—</span>}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums" title={sp?.buy_note}>
        {sp?.buy_low_cents != null || sp?.buy_high_cents != null ? (
          <div className="text-green-400 font-medium whitespace-nowrap">{formatCents(sp?.buy_low_cents ?? null)} – {formatCents(sp?.buy_high_cents ?? null)}</div>
        ) : <span className="text-gray-600">—</span>}
        <div className="text-gray-500 max-w-[14rem]">{sp?.buy_note}</div>
      </td>
      <td className="py-2 pr-3 text-xs">
        <label className="flex items-center gap-1 text-gray-400">$
          <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)}
            onBlur={() => { const v = Math.round((Number(max) || 0) * 100); if (v !== (p.max_bid_cents ?? -1)) save({ ...base, max_bid_cents: v }); }}
            className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 font-mono print:border-0" />
        </label>
      </td>
      <td className="py-2 pr-3 text-xs">
        <select value={p.status} onChange={(e) => save({ ...base, status: e.target.value as BidStatus })}
          className={`bg-gray-900 border border-gray-700 rounded px-1 py-0.5 ${STATUS_STYLE[p.status]}`}>
          {(["planned", "bid", "won", "skipped"] as BidStatus[]).map((st) => <option key={st} value={st}>{st === "won" ? "bought" : st === "bid" ? "offered" : st}</option>)}
        </select>
        {p.status === "won" && (
          <label className="flex items-center gap-1 mt-1 text-gray-400">paid $
            <input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)}
              onBlur={() => save({ ...base, won_cents: Math.round((Number(paid) || 0) * 100) })}
              className="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-100 font-mono" />
          </label>
        )}
      </td>
      <td className="py-2 text-xs">
        <input value={note} placeholder="note" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.note ?? "") && save({ ...base, note })}
          className="w-36 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 print:border-0" />
        <button onClick={onRemove} className="ml-2 text-gray-500 hover:text-red-400 print:hidden" title="Remove">✕</button>
      </td>
    </tr>
  );
}

function SinglesPrep() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchBidPlans>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    fetchBidPlans(undefined, "single").then((r) => { setData(r); setError(null); }).catch((e: Error) => setError(e.message));
  }, [tick]);
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const refresh = () => setTick((t) => t + 1);
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 max-w-3xl">
        Singles to buy at a card show or as one-off buys. Add them from a card's page ("Add to singles prep"). Each shows market prices by grade, the
        projected floor for the grade you're after, what grading pays (PSA / CGC), and a buy range: from the projected floor up to the most that still makes
        sense (raw: the most you can pay and still clear your grading return bar; a 10: what one costs to make by grading, capped at market).
      </p>
      <div className="flex justify-end print:hidden">
        <button onClick={() => window.print()} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500">Print</button>
      </div>
      {data.plans.length === 0 ? <p className="text-sm text-gray-500">No singles yet.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40 p-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left font-medium py-1 pr-3">Card</th>
                <th className="text-left font-medium py-1 pr-3">Market</th>
                <th className="text-left font-medium py-1 pr-3" title="Where the release curve says this grade bottoms out">Projected floor</th>
                <th className="text-left font-medium py-1 pr-3" title="Expected return grading a raw copy after fees; what a 10 costs to make; raw breakeven and the most to pay raw to grade">Grading</th>
                <th className="text-left font-medium py-1 pr-3">Buy range</th>
                <th className="text-left font-medium py-1 pr-3">Your max</th>
                <th className="text-left font-medium py-1 pr-3">Status</th>
                <th className="text-left font-medium py-1">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {data.plans.map((p) => (
                <SingleRow key={p.id + p.updated_at} p={p} onChange={refresh} onRemove={() => deleteBidPlan(p.id).then(refresh).catch(() => undefined)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BuyingPrepPage() {
  const session = useSession();
  const [tab, setTab] = useState<PlanKind>("auction");
  const [tick, setTick] = useState(0);
  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your buying prep.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Buying prep</h1>
      <AutoPrepBar onApplied={() => setTick((t) => t + 1)} />
      <nav className="flex gap-1 border-b border-gray-800 text-sm print:hidden">
        {([["auction", "Fanatics auctions"], ["min_bid", "Min-bid (bid early)"], ["lowball", "Lowball (bid late)"], ["single", "Singles / card show"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 -mb-px border-b-2 ${tab === k ? "border-indigo-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>{label}</button>
        ))}
      </nav>
      {tab === "single" ? <SinglesPrep /> : <AuctionsPrep key={tab} kind={tab} tick={tick} />}
    </div>
  );
}
