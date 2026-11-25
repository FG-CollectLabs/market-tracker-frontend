import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CopyTiming, GradeOdds, HitReview, HuntListing } from "../lib/api";
import { GradedLinks, RawLinks } from "./PriceLinks";
import PCGCell from "./PCGCell";
import { MiniSpinner } from "./Spinner";
import type { ColMeta } from "../lib/useColumns";
import GradeOddsBadge from "./GradeOddsBadge";
import ManualCenteringBadge from "./ManualCenteringBadge";
import AdjEVCell, { AtSaleCell, CGCCell, OddsFlag, PSAOddsCell } from "./AdjEVCell";
import { BoughtButton } from "./BoughtToGrade";
import { CheckCentering } from "./CheckCentering";
import { ItemNumber, SuggestedBid } from "./BidCells";
import ActionCell, { ExplainChip } from "./ActionCell";

// The columns a raw-listing board can show (Consigner board, Hunt list),
// each table picking its default set and order; the Columns menu changes them.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null, digits = 0) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const NUM = "py-1.5 px-2 text-right tabular-nums whitespace-nowrap";

// updating: the copy's odds were just refreshed and the board is reloading
// (centering, odds and EV are recomputed server-side): those cells fade with
// a spinner until the new numbers land.
export interface RowCtx { bench: number; review?: HitReview; onReview: (r: HitReview | undefined) => void; updating?: boolean }

// The cells a refresh changes (the Pre-grade badge updates itself at once).
const RECOMPUTED = new Set(["p10_odds", "centering", "review", "psa_ev", "cgc", "pcg", "at_sale", "grade_later", "flip_now", "if_ten", "score", "max_bid"]);
interface ListingCol extends ColMeta { th?: string; td: (l: HuntListing, x: RowCtx) => ReactNode }

function endsAt(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso), h = (t.getTime() - Date.now()) / 3.6e6;
  const clock = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const left = h <= 0 ? "ending" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  return `${clock} · ${left}`;
}
function endsIn(iso?: string) {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3.6e6;
  if (h <= 0) return "ending";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

const WINDOW: Record<CopyTiming["window"], { label: string; cls: string; hint: string }> = {
  before: { label: "before low", cls: "text-amber-300", hint: "Still falling toward its expected low" },
  in: { label: "in window", cls: "text-green-300", hint: "In its tier's low window: the usual time to buy" },
  past: { label: "past window", cls: "text-gray-300", hint: "Recovering: past its low window" },
  well_past: { label: "well past", cls: "text-indigo-300", hint: "12+ months past its low window" },
  unknown: { label: "—", cls: "text-gray-600", hint: "Not enough release-curve data" },
};

function Timing({ t }: { t?: CopyTiming }) {
  if (!t) return <span className="text-gray-600">—</span>;
  const w = WINDOW[t.window] ?? WINDOW.unknown;
  return (
    <span className="inline-flex flex-col whitespace-nowrap" title={`${w.hint}. Month ${t.month} since release; low window M${t.window_from}–M${t.window_to}.`}>
      <span className={w.cls}>{w.label}{t.months_past_window != null && t.months_past_window > 0 && <span className="text-gray-500"> +{Math.round(t.months_past_window)}mo</span>}</span>
      {t.window === "before" && t.to_low != null && (
        <span className={`text-[10px] ${t.to_low <= -0.25 ? "text-red-400" : t.to_low <= -0.1 ? "text-amber-300" : "text-gray-500"}`}>
          {pct(t.to_low)} more{t.low_month != null && ` by M${t.low_month}`}
        </span>
      )}
      {t.after_low_yearly != null && (
        <span className={`text-[10px] ${t.after_low_yearly > 0.05 ? "text-green-400" : t.after_low_yearly < 0 ? "text-red-400" : "text-gray-500"}`} title="The tier's yearly change after its low">
          then {pct(t.after_low_yearly)}/yr
        </span>
      )}
    </span>
  );
}

// ---- Needs review: what's waiting on a person before the odds can be trusted.
export interface ReviewFlag { label: string; cls: string; title?: string }
const AMBER = "border-amber-700 bg-amber-950/40 text-amber-200";
const RED = "border-red-800 bg-red-950/40 text-red-200";
const GRAY = "border-gray-700 bg-gray-900 text-gray-300";

export function reviewFlags(l: HuntListing): ReviewFlag[] {
  const o = l.grade_odds, ev = l.adj_ev, out: ReviewFlag[] = [];
  const manual = ev?.needs_manual_centering || o?.status === "needs_manual_centering" || o?.centering_check?.status === "needs_manual_centering";
  if (manual) out.push({ label: "manual centering", cls: AMBER, title: ["The pre-grader held the odds until a person checks the centering.", ...(o?.centering_check?.reasons ?? ev?.centering_reasons ?? [])].join("\n") });
  if (o?.centering_check?.ai_outline === "needs_review") out.push({ label: "outline: review", cls: AMBER, title: "The AI couldn't confirm or fix the measured outline: check it by hand" });
  if (o?.status === "unmeasurable") out.push({ label: "can't measure", cls: GRAY, title: o.error ?? "The pre-grader couldn't measure the photos: adjust the outline by hand or skip" });
  if (o?.status === "failed" || o?.status === "timeout") out.push({ label: "pre-grade failed", cls: RED, title: o.error });
  const ai = o?.ai;
  if (ai?.state === "issues") out.push({ label: "AI: issues", cls: RED, title: (ai.issues ?? []).join("\n") || "The AI check found condition issues" });
  if (ai?.state === "removed") out.push({ label: "AI: removed", cls: RED, title: ai.removed });
  if (ai?.state === "failed") out.push({ label: "AI check failed", cls: GRAY, title: ai.error });
  if (o?.feedback && o.feedback !== "looks_right") out.push({ label: `flagged: ${String(o.feedback).replace(/_/g, " ")}`, cls: GRAY, title: "Your verdict on these odds" });
  return out;
}

function NeedsReview({ l }: { l: HuntListing }) {
  const o = l.grade_odds;
  const flags = reviewFlags(l);
  const url = o?.review_url ?? l.adj_ev?.review_url;
  if (flags.length === 0) {
    if (!o) return <span className="text-gray-600" title="Not pre-graded yet">—</span>;
    if (o.status === "pending" || o.status === "measuring") return <span className="text-gray-500">measuring…</span>;
    return <span className="text-gray-500" title={o.ai?.state === "clean" ? "Measured, and the AI check came back clean" : "Measured; nothing waiting on a person"}>none{o.ai?.state === "clean" && <span className="text-emerald-400"> ✓</span>}</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {flags.map((f) => (
        f.label === "manual centering"
          ? <ManualCenteringBadge key={f.label} reasons={o?.centering_check?.reasons ?? l.adj_ev?.centering_reasons} url={url} compact />
          : <span key={f.label} title={f.title} className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${f.cls}`}>{f.label}</span>
      ))}
      {url && !flags.some((f) => f.label === "manual centering") && <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-300 hover:text-indigo-200">open in pre-grader ↗</a>}
    </span>
  );
}

// ---- Centering: each axis's split, worse side first, colored by where PSA
// graders actually start deducting for a 10 (the pre-grader's centering
// analytics, ~74k PSA copies pooled, 2026-11-25; per-card bands later):
//   front (each axis): green to 52.5/47.5 (odds within ~2 points of a centered
//     copy), amber to 55/45 (noticed: down ~6-14 points), red past 55/45
//     (PSA's limit for a 10: reject).
//   back (each axis): green to 52.5/47.5, amber to 75/25 (a small dip, ~5-8
//     points, then flat), red past 75/25 (PSA's limit).
type Band = "green" | "amber" | "red";
const BANDS = { front: { green: 52.5, amber: 55 }, back: { green: 52.5, amber: 75 } };
const BAND_CLS: Record<Band, string> = { green: "text-green-300", amber: "text-amber-300", red: "text-red-300 font-semibold" };
const BAND_TIP: Record<Band, string> = {
  green: "not deducted: PSA 10 odds about the same as a centered copy",
  amber: "noticed: PSA 10 odds down, still gradable for a 10",
  red: "past PSA's limit for a 10: reject when aiming for a 10",
};
const worse = (v?: number) => (v == null ? undefined : Math.max(v, 100 - v));
const fmt = (w: number) => `${Math.round(w)}/${Math.round(100 - w)}`;
const exact = (w: number) => `${w.toFixed(1)}/${(100 - w).toFixed(1)}`;
function bandOf(side: "front" | "back", w: number): Band {
  const b = BANDS[side];
  return w <= b.green ? "green" : w <= b.amber ? "amber" : "red";
}
function Axis({ v, side, axis }: { v?: number; side: "front" | "back"; axis: string }) {
  const w = worse(v);
  if (w == null) return <span className="text-gray-600">–</span>;
  const band = bandOf(side, w);
  // near a band edge whole numbers would mislead (53.4 reads 53/47 but is amber)
  const nearEdge = Object.values(BANDS[side]).some((e) => w !== e && Math.abs(w - e) < 0.5);
  return <span className={BAND_CLS[band]} title={`${side} ${axis} ${exact(w)}: ${BAND_TIP[band]}`}>{nearEdge ? exact(w) : fmt(w)}</span>;
}
// CGC Pristine is stricter, mostly on front L/R (Pristine share falls from
// the first point off center: 32% at 50-51, 25% at 52-53, 9% past 55/45;
// ~47k CGC copies pooled, 2026-11-25). Per axis: [green to, amber to].
const PRISTINE: [number, number][] = [[51.5, 53.5], [53, 55], [52, 55], [52, 55]]; // front L/R, front T/B, back L/R, back T/B
export function pristineBand(o?: GradeOdds): Band | undefined {
  const vals = [o?.front?.lr, o?.front?.tb, o?.back?.lr, o?.back?.tb].map(worse);
  if (vals.every((w) => w == null)) return undefined;
  let band: Band = "green";
  vals.forEach((w, i) => {
    if (w == null) return;
    const [g, a] = PRISTINE[i];
    if (w > a) band = "red";
    else if (w > g && band === "green") band = "amber";
  });
  return band;
}

// The copy's centering verdict for a 10: red if any axis is past PSA's
// limit; amber "both front" when both front axes are noticed (they add up).
export function centeringVerdict(o?: GradeOdds): { band: Band; label: string } | undefined {
  if (!o?.front && !o?.back) return undefined;
  const ax: [("front" | "back"), number | undefined][] = [["front", o.front?.lr], ["front", o.front?.tb], ["back", o.back?.lr], ["back", o.back?.tb]];
  const bands = ax.map(([side, v]) => { const w = worse(v); return w == null ? undefined : bandOf(side, w); });
  if (bands.includes("red")) return { band: "red", label: "reject for 10" };
  if (bands[0] === "amber" && bands[1] === "amber") return { band: "amber", label: "both front noticed" };
  if (bands.includes("amber")) return { band: "amber", label: "noticed" };
  return { band: "green", label: "clean" };
}
export function CenteringCell({ o }: { o?: GradeOdds }) {
  if (!o?.front && !o?.back) {
    return <span className="text-gray-600" title={o ? "No centering measured" : "Not pre-graded yet"}>—</span>;
  }
  const v = centeringVerdict(o);
  const pr = pristineBand(o);
  const tip = "Left/right · top/bottom, the worse side first, colored by where PSA starts deducting for a 10 (all cards pooled):\n"
    + "Front: green to 52.5/47.5 (not deducted) · amber to 55/45 (noticed) · red past 55/45 (reject).\n"
    + "Back: green to 52.5/47.5 · amber to 75/25 (small, flat dip) · red past 75/25 (reject).\n"
    + "CGC Pristine is stricter: ✓ inside front L/R 51.5/48.5, front T/B 53/47, back 52/48; ~ to 53.5/46.5 front L/R and 55/45 otherwise."
    + (o.centering_check?.status === "needs_manual_centering" ? "\nHeld for manual centering: the outline may be wrong." : "");
  return (
    <span className="inline-flex flex-col tabular-nums whitespace-nowrap text-[11px]" title={tip}>
      <span><span className="text-gray-500">F </span><Axis v={o.front?.lr} side="front" axis="L/R" /><span className="text-gray-600"> · </span><Axis v={o.front?.tb} side="front" axis="T/B" /></span>
      <span><span className="text-gray-500">B </span><Axis v={o.back?.lr} side="back" axis="L/R" /><span className="text-gray-600"> · </span><Axis v={o.back?.tb} side="back" axis="T/B" /></span>
      {v && v.band !== "green" && <span className={`text-[10px] ${v.band === "red" ? "text-red-300" : "text-amber-300/80"}`}>{v.label}</span>}
      {pr === "green" && <span className="text-[10px] text-emerald-300" title="Centering inside CGC Pristine's bands (front L/R ≤51.5/48.5, front T/B ≤53/47, back ≤52/48): Pristine odds about as good as a centered copy">Pristine ✓</span>}
      {pr === "amber" && <span className="text-[10px] text-amber-300/80" title="Pristine possible but noticed (front L/R to 53.5/46.5, front T/B and back to 55/45): Pristine odds down">Pristine ~</span>}
      {o.psa_centering_cap && <span className="text-[10px] text-amber-300/80">caps at {o.psa_centering_cap}</span>}
    </span>
  );
}

export const LISTING_COLS: ListingCol[] = [
  {
    id: "card", label: "Card", locked: true, th: "px-3",
    td: (l) => (
      <div className="flex gap-2 items-start min-w-[15rem]">
        {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
        <div className="min-w-0">
          <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
          <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
          {l.watched && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200" title="On your watchlist">watching</span>}
          {l.slow && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="PSA 10s sell less than once a month">slow</span>}
          {l.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
          {l.review?.status === "interested" && !l.review.result && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">bidding</span>}
            {l.review?.status === "shortlist" && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200">interested</span>}
          {l.url
            ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
            : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
          <ItemNumber n={l.item_number} />
        </div>
      </div>
    ),
  },
  {
    id: "action", label: "Action", title: "Bid (with your max) or pass; then report won / lost",
    td: (l, x) => <ActionCell listingId={l.listing_id} displayKey={l.display_key} priceCents={l.price_cents} review={x.review} suggestCents={l.suggested_bid?.item_cents}
      shown={{ adj_ev: l.adj_ev, odds: l.grade_odds, add_cents: l.add_cents, raw_market_cents: l.raw_market_cents, grade_later: l.grade_later, timing: l.timing }} onChange={x.onReview} />,
  },
  { id: "seller", label: "Seller", td: (l) => <span className="whitespace-nowrap text-gray-400">{l.seller_label}</span> },
  {
    id: "ends", label: "Ends", title: "When the auction ends, and its bids",
    td: (l) => <span className="whitespace-nowrap text-gray-300">{l.kind === "auction" ? <>{endsAt(l.ends_at)}{l.bids != null && <div className="text-[10px] text-gray-500">{l.bids} bids</div>}</> : <span className="text-gray-400">Buy Now</span>}</span>,
  },
  {
    id: "type", label: "Type", title: "Auction (time left, bids) or Buy Now",
    td: (l) => <span className="whitespace-nowrap text-gray-400">{l.kind === "auction" ? <>Auction · {endsIn(l.ends_at)}{l.bids != null && <span className="text-gray-600"> · {l.bids} bids</span>}</> : "Buy Now"}</span>,
  },
  { id: "now", label: "Now", title: "Ask or current bid, with its listed shipping", th: "text-right", td: (l) => <span className="text-gray-400">{usd(l.price_cents)}</span> },
  {
    id: "cost", label: "Your cost", title: "Item (auctions: expected close, the raw market) + what it adds to an order's shipping", th: "text-right",
    td: (l) => <span className="text-gray-100" title={l.notes?.join("\n")}>{usd(l.add_cents)}{l.expected && <div className="text-[10px] text-gray-500">expected close</div>}</span>,
  },
  {
    id: "max_bid", label: "Max bid", th: "text-right",
    title: "Suggested max bid, the item price to enter in eBay or Gixen: beats most of this consigner's recent finals, never above what the copy is worth to you. Click to copy; hover for the working.",
    td: (l) => <SuggestedBid b={l.suggested_bid} />,
  },
  {
    id: "raw", label: "Raw market", title: "Raw market (eBay sold by default), and your cost against it", th: "text-right",
    td: (l) => (
      <span className="text-gray-300">{usd(l.raw_market_cents)}
        <div className={`text-[10px] ${l.vs_raw <= 1 ? "text-green-300/80" : "text-gray-500"}`}>{l.vs_raw <= 1 ? `${Math.round((1 - l.vs_raw) * 100)}% under` : `${Math.round((l.vs_raw - 1) * 100)}% over`}</div>
      </span>
    ),
  },
  { id: "psa10", label: "PSA 10", title: "PSA 10 market price", th: "text-right", td: (l) => <span className="text-gray-300">{usd(l.psa10_cents)}</span> },
  {
    id: "exp_low", label: "Exp. low", title: "The card's expected raw low (release curve), and this copy's cost against it", th: "text-right",
    td: (l) => {
      const v = l.timing?.copy_vs_low;
      return (
        <span className="text-gray-300">{usd(l.timing?.exp_low_cents)}
          {v != null && <div className={`text-[10px] ${v <= 0 ? "text-green-300" : v <= 0.1 ? "text-green-300/70" : v <= 0.25 ? "text-amber-300" : "text-gray-500"}`} title="This copy's cost vs the expected low">{v <= 0 ? `${Math.round(-v * 100)}% under` : `${Math.round(v * 100)}% over`}</div>}
        </span>
      );
    },
  },
  { id: "timing", label: "Timing", title: "Where the card is on its tier's raw release curve", td: (l) => <Timing t={l.timing} /> },
  { id: "p10_odds", label: "PSA 10 odds", title: "PSA 10 odds: the public gem rate, and adjusted for this copy by the pre-grader", th: "text-right", td: (l) => <PSAOddsCell ev={l.adj_ev} popFallback={l.p10 || undefined} /> },
  {
    id: "pregrade", label: "Pre-grade", title: "The pre-grader's odds for this copy (or send it to be checked), and Bought",
    td: (l) => (
      <>
        {l.grade_odds
          ? <><span className="inline-flex flex-wrap items-center gap-1"><GradeOddsBadge o={l.grade_odds} compact /><OddsFlag odds={l.grade_odds} shown={l.adj_ev} /></span>
              <ExplainChip e={l.grade_odds.explain?.PSA} /></>
          : <CheckCentering listingId={l.listing_id} photos={l.image_count} />}
        {(l.image_count == null || l.image_count >= 2 || l.grade_odds) && (
          <div className="mt-0.5"><BoughtButton listingId={l.listing_id} priceCents={l.price_cents} shown={{ adj_ev: l.adj_ev, odds: l.grade_odds }} initial={!!l.grade_odds?.bought_at} /></div>
        )}
      </>
    ),
  },
  {
    id: "review", label: "Needs review",
    title: "What's waiting on a person: centering held for a manual check, an outline the AI couldn't fix, unmeasurable photos, a failed pre-grade, AI-found issues, or odds you flagged",
    td: (l) => <NeedsReview l={l} />,
  },
  { id: "centering", label: "Centering", title: "Measured centering, front (F) and back (B): left/right · top/bottom, worse side first: green not deducted, amber noticed, red reject for a 10", td: (l) => <CenteringCell o={l.grade_odds} /> },
  {
    id: "raw_links", label: "Raw links",
    title: "Check the raw price yourself: the card on TCGplayer and PriceCharting, eBay sold raw copies, and its PokeData set page (copies the card name to paste)",
    td: (l) => <RawLinks c={l} />,
  },
  {
    id: "graded_links", label: "Graded links",
    title: "Check graded prices yourself: PriceCharting (graded prices on the card page), eBay sold PSA 10s, and 130point (copies the search to paste)",
    td: (l) => <GradedLinks c={l} />,
  },
  { id: "psa_ev", label: "PSA EV", title: "PSA grading EV at today's prices, with the adjusted odds and at the public gem rate. Hover for the working.", th: "text-right", td: (l) => <AdjEVCell ev={l.adj_ev} /> },
  {
    id: "pcg", label: "PCG EV", th: "text-right",
    title: "Grading with PCG (sold on eBay): profit after fees and this copy's cost, PCG 10+ / Pristine / Flawless odds, and whether the centering can get a Pristine (50/50 front). Hover for the working.",
    td: (l) => <PCGCell p={l.pcg} />,
  },
  { id: "cgc", label: "CGC", title: "CGC Pristine / 10 / 9: gem rates (the card's CGC population), adjusted for this copy, and the EV", th: "text-right", td: (l) => <CGCCell ev={l.adj_ev} /> },
  {
    id: "at_sale", label: "At sale", th: "text-right",
    title: "Projected: the EVs when the slab is back from the grader and sold, on the card's release curve (expected declines, plus the rises the forecast backtest backs: IR PSA grades from month 6). Today's are in PSA EV / CGC; suggested bids never count a rise.",
    td: (l) => <AtSaleCell ev={l.adj_ev} />,
  },
  {
    id: "grade_later", label: "Grade later", title: "Grade later (graded 6 months before selling) at this copy's cost: yearly return", th: "text-right",
    td: (l, x) => {
      const y = l.grade_later?.yearly;
      return <span className={`font-semibold ${y == null ? "text-gray-600" : y < 0 ? "text-red-300" : y >= x.bench ? "text-green-300" : "text-gray-300"}`}>{pct(y, 1)}</span>;
    },
  },
  { id: "flip_now", label: "Flip now", title: "Grade now, sell when it's back: ROI at this cost", th: "text-right", td: (l) => <span className={l.flip_now && l.flip_now.roi > 0 ? "text-gray-200" : "text-red-300"}>{l.flip_now ? pct(l.flip_now.roi) : "–"}</span> },
  { id: "if_ten", label: "If it 10s", title: "Grade later and it comes back a 10: profit", th: "text-right", td: (l) => <span className="text-gray-300">{usd(l.if_ten_profit_cents)}</span> },
  { id: "score", label: "Score", title: "Hunt score", th: "text-right", td: (l) => <span className="text-white">{pct(l.score, 1)}</span> },
];
const BY_ID = new Map(LISTING_COLS.map((c) => [c.id, c]));

export function ListingHead({ ids }: { ids: string[] }) {
  return (
    <tr>
      {ids.map((id) => {
        const c = BY_ID.get(id)!;
        return <th key={id} title={c.title} className={`py-2 font-medium whitespace-nowrap ${id === "card" ? "px-3" : "px-2"} ${c.th?.replace("px-3", "") ?? ""}`}>{c.label}</th>;
      })}
    </tr>
  );
}

export function ListingRow({ l, ids, ctx }: { l: HuntListing; ids: string[]; ctx: RowCtx }) {
  return (
    <tr className="border-t border-gray-800 align-top">
      {ids.map((id) => {
        const c = BY_ID.get(id)!;
        const right = c.th?.includes("text-right");
        const cell = c.td(l, ctx);
        return (
          <td key={id} className={right ? NUM : id === "card" ? "py-1.5 px-3" : "py-1.5 px-2"}>
            {ctx.updating && RECOMPUTED.has(id)
              ? <div className="relative" title="Updating: recomputing with the refreshed pre-grade…">
                  <div className="opacity-30">{cell}</div>
                  <span className="absolute inset-0 flex items-center justify-center"><MiniSpinner className="h-4 w-4" /></span>
                </div>
              : cell}
          </td>
        );
      })}
    </tr>
  );
}
