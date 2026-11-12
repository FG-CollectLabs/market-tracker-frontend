import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchRiftboundListings, fetchSettings, type RbListing, type ROICard } from "../lib/api";
import type { GraderCfg } from "../lib/gradeEv";
import { RB_GRADERS, loadRates, maxBuy, rbEv, saveRates, type RbEv, type RbGrader, type RbRates } from "../lib/rbEv";
import { Spinner } from "../components/Spinner";
import WatchButton from "../components/WatchButton";
import { KindBadge } from "./RiftboundPage";
import { EvCell, RatesPanel } from "./RiftboundSetPage";

// Riftbound deals: live eBay and Fanatics listings of tracked or watched
// Riftbound cards (eBay Buy Nows of tracked cards every few days; auctions
// of watched cards and of tracked cards worth $100+ every 3 hours).
//
//   Raw to grade: each raw copy's grading EV at its price (+ shipping), per
//   grader, and the most to pay for it to still return the minimum ROI.
//   Graded under market: slabs listed under their grade's PriceCharting price.

const usd = (c: number | null | undefined) =>
  c == null ? "—" : Math.abs(c) >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

const GRADED_KEY: Record<string, string> = {
  "psa-10": "psa 10", "psa-9": "psa 9", "cgc-10": "cgc 10", "cgc-10-pristine": "cgc Pristine 10",
  "bgs-10": "bgs 10", "bgs-10-black": "bgs 10 Black", "bgs-9.5": "bgs 9.5", "sgc-10": "sgc 10",
};
const GRADE_LABEL = (g: string) => g.replace(/-/g, " ").toUpperCase().replace("PRISTINE", "Pristine").replace("BLACK", "Black Label");

function asCard(l: RbListing): ROICard {
  const g = l.graded;
  return {
    card_id: "", display_key: l.display_key, name: l.name, number: l.printed_number ?? "",
    raw_price_cents: l.pc_raw_cents ?? l.tcgplayer_cents,
    psa_9_cents: g["psa 9"] ?? null, psa_10_cents: g["psa 10"] ?? null, cgc_10_cents: g["cgc 10"] ?? null,
    cgc_pristine_cents: g["cgc Pristine 10"] ?? null,
    bgs_9_5_cents: g["bgs 9.5"] ?? null, bgs_10_cents: g["bgs 10"] ?? null, bgs_10_black_cents: g["bgs 10 Black"] ?? null,
    psa_gem_pop: null, psa_total_pop: null, cgc_gem_pop: null, cgc_total_pop: null,
  } as unknown as ROICard;
}

function timeLeft(at: string | null): string {
  if (!at) return "Buy Now";
  const ms = new Date(at).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const h = ms / 3.6e6;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

type Tab = "raw" | "graded";
type Row = { l: RbListing; allIn: number; ev: Record<RbGrader, RbEv | null>; best: RbGrader | null; max: number | null; vsMarket: number | null };

export default function RiftboundDealsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "graded" ? "graded" : "raw";
  const [listings, setListings] = useState<RbListing[] | null>(null);
  const [err, setErr] = useState("");
  const [graders, setGraders] = useState<Record<string, GraderCfg>>({});
  const [sellFee, setSellFee] = useState(0.1325);
  const [minRoi, setMinRoi] = useState(0.3);
  const [businessDays, setBusinessDays] = useState(true);
  const [rates, setRates] = useState<RbRates>(loadRates);
  const [kind, setKind] = useState<"all" | "auction" | "fixed">("all");
  const [onlyPositive, setOnlyPositive] = useState(true);

  useEffect(() => {
    fetchSettings().then(({ settings }) => {
      setGraders(settings.graders as unknown as Record<string, GraderCfg>);
      const s = settings as unknown as { exit_fee_pct?: number; min_roi?: number };
      if (s.exit_fee_pct != null) setSellFee(s.exit_fee_pct);
      if (s.min_roi != null) setMinRoi(s.min_roi);
    }).catch(() => {});
    fetchRiftboundListings().then((r) => setListings(r.listings)).catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => saveRates(rates), [rates]);

  const rows: Row[] = useMemo(() => {
    if (!listings) return [];
    const opts = { graders, sellFee, businessDays, buffer: 0.1, rates };
    const isAuction = (l: RbListing) => l.marketplace !== "fixed";
    return listings
      .filter((l) => (tab === "raw" ? l.grade_key === "raw" : l.grade_key !== "raw"))
      .filter((l) => kind === "all" || (kind === "auction") === isAuction(l))
      .map((l) => {
        const allIn = l.price_cents + l.shipping_cents;
        if (tab === "graded") {
          const mkt = l.graded[GRADED_KEY[l.grade_key] ?? ""] ?? null;
          return { l, allIn, ev: { psa: null, cgc: null, bgs: null }, best: null, max: null, vsMarket: mkt ? 1 - allIn / mkt : null };
        }
        const card = asCard(l);
        if (card.raw_price_cents == null) card.raw_price_cents = allIn;
        const ev = rbEv(card, opts, allIn);
        let best: RbGrader | null = null;
        for (const g of RB_GRADERS) if (ev[g] && (!best || ev[g]!.evCents > ev[best]!.evCents)) best = g;
        const market = l.pc_raw_cents ?? l.tcgplayer_cents;
        return { l, allIn, ev, best, max: best ? maxBuy(ev[best]!, minRoi) : null, vsMarket: market ? 1 - allIn / market : null };
      })
      .filter((r) => !onlyPositive || (tab === "raw" ? (r.best != null && r.ev[r.best]!.roi >= minRoi) : (r.vsMarket ?? -1) > 0))
      .sort((a, b) => tab === "raw"
        ? (b.best ? b.ev[b.best]!.evCents : -Infinity) - (a.best ? a.ev[a.best]!.evCents : -Infinity)
        : (b.vsMarket ?? -1) - (a.vsMarket ?? -1));
  }, [listings, tab, kind, onlyPositive, graders, sellFee, businessDays, rates, minRoi]);

  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    if (t === "raw") p.delete("tab");
    else p.set("tab", t);
    setParams(p, { replace: true });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound deals</h1>
        <p className="text-sm text-gray-400">
          Live eBay and Fanatics listings of tracked and watched Riftbound cards. Auctions show the current bid: the max is what to
          bid up to.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {(["raw", "graded"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm ${tab === t ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
            {t === "raw" ? "Raw to grade" : "Graded under market"}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-gray-800" />
        {(["all", "auction", "fixed"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-2 py-1 rounded text-xs ${kind === k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400"}`}>
            {k === "all" ? "All" : k === "auction" ? "Auctions" : "Buy Now"}
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-gray-400 ml-2">
          <input type="checkbox" checked={onlyPositive} onChange={(e) => setOnlyPositive(e.target.checked)} />
          {tab === "raw" ? "Only ≥ min ROI" : "Only under market"}
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-400">Min ROI
          <input type="number" min={0} max={500} step={5} value={Math.round(minRoi * 100)} onChange={(e) => setMinRoi(Number(e.target.value) / 100)}
            className="w-14 bg-gray-900 border border-gray-800 rounded px-1 py-0.5 text-gray-200 text-right" />%
        </label>
      </div>
      {tab === "raw" && (
        <RatesPanel rates={rates} setRates={setRates} anyPop={false} graders={graders}
          sellFee={sellFee} setSellFee={setSellFee} businessDays={businessDays} setBusinessDays={setBusinessDays} />
      )}
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!listings ? <Spinner /> : (
        <>
          <div className="text-xs text-gray-500">
            {rows.length} listings{listings.length === 0 && " · none yet: eBay scans pick up Riftbound cards over the next runs"}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="text-sm min-w-full">
              <thead className="bg-gray-900 text-xs text-gray-400">
                <tr>
                  <th className="text-left font-normal px-3 py-2">Listing</th>
                  <th className="text-right font-normal px-2">Price + ship</th>
                  <th className="text-right font-normal px-2">Ends</th>
                  {tab === "raw" ? (
                    <>
                      <th className="text-right font-normal px-2">Raw market</th>
                      {RB_GRADERS.map((g) => <th key={g} className="text-right font-normal px-2">{g.toUpperCase()} EV</th>)}
                      <th className="text-right font-normal px-2" title={`Most to pay (all in) for the best grader to still return ${pct(minRoi)}`}>Max all-in</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right font-normal px-2">Grade</th>
                      <th className="text-right font-normal px-2">PriceCharting</th>
                      <th className="text-right font-normal px-2">Under market</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.l.source + r.l.listing_id} className="border-t border-gray-900 align-top">
                    <td className="px-3 py-2">
                      <div className="flex gap-2 items-start min-w-[16rem]">
                        {(r.l.image_url || r.l.card_image_url) && (
                          <img src={r.l.image_url || r.l.card_image_url || ""} alt="" loading="lazy" className="w-10 rounded" />
                        )}
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1">
                            <Link to={`/cards/${r.l.display_key}`} className="text-gray-100 hover:text-white">{r.l.name}</Link>
                            <WatchButton displayKey={r.l.display_key} compact />
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                            <KindBadge kind={r.l.kind} />
                            <span className="uppercase">{r.l.set_code}</span>
                            <span>{r.l.printed_number}</span>
                            <span>· {r.l.source === "ebay" ? "eBay" : "Fanatics"}{r.l.seller ? ` ${r.l.seller}` : ""}</span>
                          </div>
                          {r.l.url
                            ? <a href={r.l.url} target="_blank" rel="noreferrer" className="block text-[11px] text-gray-500 hover:text-gray-300 truncate max-w-md">{r.l.title} ↗</a>
                            : <div className="text-[11px] text-gray-600 truncate max-w-md">{r.l.title}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums text-gray-200 whitespace-nowrap">
                      {usd(r.allIn)}
                      {r.l.bid_count != null && r.l.marketplace !== "fixed" && <div className="text-[11px] text-gray-500">{r.l.bid_count} bids</div>}
                    </td>
                    <td className="text-right px-2 py-2 text-gray-400 whitespace-nowrap">{timeLeft(r.l.ends_at)}</td>
                    {tab === "raw" ? (
                      <>
                        <td className="text-right px-2 py-2 tabular-nums text-gray-400 whitespace-nowrap">
                          {usd(r.l.pc_raw_cents ?? r.l.tcgplayer_cents)}
                          {r.vsMarket != null && <div className={`text-[11px] ${r.vsMarket > 0 ? "text-emerald-500" : "text-gray-600"}`}>{r.vsMarket > 0 ? `${pct(r.vsMarket)} under` : `${pct(-r.vsMarket)} over`}</div>}
                        </td>
                        {RB_GRADERS.map((g) => <EvCell key={g} ev={r.ev[g]} best={r.best === g} priced={false} />)}
                        <td className="text-right px-2 py-2 tabular-nums whitespace-nowrap">
                          {r.max == null ? <span className="text-gray-700">—</span>
                            : <span className={r.max >= r.allIn ? "text-emerald-400" : "text-gray-400"}>{usd(Math.max(0, r.max))}</span>}
                          {r.best && <div className="text-[11px] text-gray-500">{r.best.toUpperCase()}</div>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-right px-2 py-2 text-gray-300 whitespace-nowrap">{GRADE_LABEL(r.l.grade_key)}</td>
                        <td className="text-right px-2 py-2 tabular-nums text-gray-400">{usd(r.l.graded[GRADED_KEY[r.l.grade_key] ?? ""])}</td>
                        <td className="text-right px-2 py-2 tabular-nums">
                          {r.vsMarket == null ? <span className="text-gray-700">—</span>
                            : <span className={r.vsMarket > 0 ? "text-emerald-400" : "text-rose-400"}>{r.vsMarket > 0 ? `${pct(r.vsMarket)} under` : `${pct(-r.vsMarket)} over`}</span>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
