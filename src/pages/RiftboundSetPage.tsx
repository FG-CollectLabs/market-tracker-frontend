import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchPcgAnalysis, fetchRiftboundCards, fetchRiftboundSets, fetchSetGraded, fetchSettings,
  type PcgAnalysis, type RbCard, type RbSet, type ROICard,
} from "../lib/api";
import type { GraderCfg } from "../lib/gradeEv";
import { DEFAULT_RATES, RB_GRADERS, graderCfg, loadRates, pcgRatiosFrom, rbEv, saveRates, type RbEv, type RbGrader, type RbRates } from "../lib/rbEv";
import { Spinner } from "../components/Spinner";
import WatchButton from "../components/WatchButton";
import { KindBadge } from "./RiftboundPage";

// One Riftbound set: every tracked card's raw and graded prices
// (PriceCharting) and the EV of grading a raw copy with PSA, CGC or Beckett.


const usd = (c: number | null | undefined) =>
  c == null ? "—" : Math.abs(c) >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const NAMES: Record<RbGrader, string> = { psa: "PSA", cgc: "CGC", bgs: "BGS", pcg: "PCG" };

type Row = { c: ROICard; rb?: RbCard; ev: Record<RbGrader, RbEv | null>; best: RbGrader | null };
type SortKey = "best" | RbGrader | "raw" | "name";

export default function RiftboundSetPage() {
  const { code = "" } = useParams();
  const [set, setSet] = useState<RbSet | null>(null);
  const [cards, setCards] = useState<ROICard[] | null>(null);
  const [rb, setRb] = useState<Record<string, RbCard>>({});
  const [graders, setGraders] = useState<Record<string, GraderCfg>>({});
  const [sellFee, setSellFee] = useState(0.1325);
  const [businessDays, setBusinessDays] = useState(true);
  const [rates, setRates] = useState<RbRates>(loadRates);
  const [pcgA, setPcgA] = useState<PcgAnalysis | null>(null);
  useEffect(() => { fetchPcgAnalysis("riftbound").then(setPcgA).catch(() => {}); }, []);
  const pcg = useMemo(() => pcgRatiosFrom(pcgA), [pcgA]);
  const [sort, setSort] = useState<SortKey>("best");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchSettings().then(({ settings }) => {
      setGraders(settings.graders as unknown as Record<string, GraderCfg>);
      const s = settings as unknown as { exit_fee_pct?: number };
      if (s.exit_fee_pct != null) setSellFee(s.exit_fee_pct);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    setCards(null);
    fetchRiftboundSets().then((r) => setSet(r.sets.find((s) => s.code === code) ?? null)).catch(() => {});
    fetchRiftboundCards({ set: code })
      .then((r) => setRb(Object.fromEntries(r.cards.map((c) => [c.display_key, c]))))
      .catch(() => {});
    fetchSetGraded("riftbound", code, { tracked: true })
      .then((r) => setCards(r.cards))
      .catch((e) => setErr(String(e)));
  }, [code]);
  useEffect(() => saveRates(rates), [rates]);

  const rows: Row[] = useMemo(() => {
    if (!cards) return [];
    const opts = { graders, sellFee, businessDays, buffer: 0.1, rates, pcgRatios: pcg.ratios };
    const list = cards.map((c) => {
      const ev = rbEv(c, opts);
      let best: RbGrader | null = null;
      for (const g of RB_GRADERS) if (ev[g] && (!best || ev[g]!.evCents > ev[best]!.evCents)) best = g;
      return { c, rb: rb[c.display_key], ev, best };
    });
    const evOf = (r: Row, g: RbGrader | null) => (g && r.ev[g] ? r.ev[g]!.evCents : -Infinity);
    if (sort === "name") list.sort((a, b) => a.c.name.localeCompare(b.c.name));
    else if (sort === "raw") list.sort((a, b) => (b.c.raw_price_cents ?? -1) - (a.c.raw_price_cents ?? -1));
    else if (sort === "best") list.sort((a, b) => evOf(b, b.best) - evOf(a, a.best));
    else list.sort((a, b) => evOf(b, sort) - evOf(a, sort));
    return list;
  }, [cards, rb, graders, sellFee, businessDays, rates, sort, pcg]);

  const priced = rows.filter((r) => r.c.psa_10_cents != null || r.c.bgs_10_cents != null || r.c.cgc_10_cents != null).length;
  const anyPop = rows.some((r) => RB_GRADERS.some((g) => r.ev[g]?.source === "population"));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="text-xs text-gray-500"><Link to="/rb" className="hover:text-gray-300">Riftbound</Link> / {code.toUpperCase()}</div>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{set?.name ?? code.toUpperCase()}</h1>
        <p className="text-sm text-gray-400">
          {set ? `${set.tracked} tracked cards · released ${set.release_date?.slice(0, 10) ?? "TBA"} · ` : ""}
          Grading EV of a raw copy at its market price, by grader. Graded prices from PriceCharting, weekly.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}

      <RatesPanel rates={rates} setRates={setRates} anyPop={anyPop} graders={graders}
        sellFee={sellFee} setSellFee={setSellFee} businessDays={businessDays} setBusinessDays={setBusinessDays} />

      {!cards ? <Spinner /> : (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{rows.length} cards, {priced} with graded prices</span>
            {priced === 0 && <span className="text-amber-400">No graded prices yet: they arrive with the weekly ingest-riftbound-graded run.</span>}
            <label className="ml-auto">Sort{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-gray-200">
                <option value="best">Best EV</option>
                <option value="psa">PSA EV</option>
                <option value="cgc">CGC EV</option>
                <option value="bgs">BGS EV</option>
                <option value="raw">Raw price</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="text-sm min-w-full">
              <thead className="bg-gray-900 text-xs text-gray-400">
                <tr>
                  <th className="text-left font-normal px-3 py-2">Card</th>
                  <th className="text-right font-normal px-2">Raw</th>
                  <th className="text-right font-normal px-2">PSA 9 / 10</th>
                  <th className="text-right font-normal px-2">CGC 10 / Pristine</th>
                  <th className="text-right font-normal px-2">BGS 9.5 / 10 / Black</th>
                  {RB_GRADERS.map((g) => <th key={g} className="text-right font-normal px-2">{NAMES[g]} EV</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <CardRow key={r.c.display_key} r={r} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CardRow({ r }: { r: Row }) {
  const c = r.c;
  return (
    <tr className="border-t border-gray-900 align-top">
      <td className="px-3 py-2">
        <div className="flex gap-2 items-start min-w-[14rem]">
          {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="w-9 rounded" />}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <Link to={`/cards/${c.display_key}`} className="text-gray-100 hover:text-white">{c.name}</Link>
              <WatchButton displayKey={c.display_key} compact />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {r.rb && <KindBadge kind={r.rb.kind} />}
              <span>{r.rb?.printed_number ?? c.number}</span>
              {c.pc_url && <a href={c.pc_url} target="_blank" rel="noreferrer" className="hover:text-gray-300">PC ↗</a>}
            </div>
          </div>
        </div>
      </td>
      <td className="text-right px-2 py-2 tabular-nums text-gray-200">{usd(c.raw_price_cents)}</td>
      <td className="text-right px-2 py-2 tabular-nums text-gray-400 whitespace-nowrap">{usd(c.psa_9_cents)} / <span className="text-gray-200">{usd(c.psa_10_cents)}</span></td>
      <td className="text-right px-2 py-2 tabular-nums text-gray-400 whitespace-nowrap"><span className="text-gray-200">{usd(c.cgc_10_cents)}</span> / {usd(c.cgc_pristine_cents)}</td>
      <td className="text-right px-2 py-2 tabular-nums text-gray-400 whitespace-nowrap">{usd(c.bgs_9_5_cents)} / <span className="text-gray-200">{usd(c.bgs_10_cents)}</span> / {usd(c.bgs_10_black_cents)}</td>
      {RB_GRADERS.map((g) => <EvCell key={g} ev={r.ev[g]} best={r.best === g} priced={hasTop(c, g)} />)}
    </tr>
  );
}

function hasTop(c: ROICard, g: RbGrader): boolean {
  if (c.raw_price_cents == null) return false;
  if (g === "pcg") return c.psa_10_cents != null || c.pcg_cents?.["pcg-10"] != null;
  return g === "psa" ? c.psa_10_cents != null : g === "cgc" ? c.cgc_10_cents != null : c.bgs_10_cents != null || c.bgs_9_5_cents != null;
}

export function EvCell({ ev, best, priced }: { ev: RbEv | null; best: boolean; priced: boolean }) {
  if (!ev && priced) {
    return (
      <td className="text-right px-2 py-2 text-xs text-amber-500/80" title="No service tier in Settings covers this card's value: add a higher tier on the Settings page">
        no tier
      </td>
    );
  }
  if (!ev) return <td className="text-right px-2 py-2 text-gray-700">—</td>;
  const cls = ev.evCents > 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <td className={`text-right px-2 py-2 tabular-nums whitespace-nowrap ${best ? "bg-emerald-950/30" : ""}`} title={ev.note}>
      <div className={cls}>{ev.evCents >= 0 ? "+" : "−"}{usd(Math.abs(ev.evCents))}</div>
      <div className="text-[11px] text-gray-500">
        {pct(ev.roi)} ROI · {ev.annualized > 9.99 ? ">999%" : pct(ev.annualized)}/yr
        {ev.source === "assumed" && <span className="text-gray-600"> · assumed</span>}
      </div>
    </td>
  );
}

export function RatesPanel(p: {
  rates: RbRates; setRates: (r: RbRates) => void; anyPop: boolean; graders: Record<string, GraderCfg>;
  sellFee: number; setSellFee: (v: number) => void; businessDays: boolean; setBusinessDays: (v: boolean) => void;
}) {
  const field = (g: RbGrader, k: string, label: string) => {
    const v = (p.rates[g] as Record<string, number>)[k];
    return (
      <label className="flex items-center gap-1 text-xs text-gray-400">
        {label}
        <input type="number" min={0} max={100} step={1} value={Math.round(v * 100)}
          onChange={(e) => p.setRates({ ...p.rates, [g]: { ...p.rates[g], [k]: Math.max(0, Math.min(100, Number(e.target.value))) / 100 } })}
          className="w-14 bg-gray-950 border border-gray-800 rounded px-1 py-0.5 text-gray-200 text-right" />%
      </label>
    );
  };
  const tierText = (g: RbGrader) => {
    const cfg = graderCfg(p.graders, g);
    if (!cfg) return "not in Settings";
    const t = cfg.tiers.reduce((a, b) => (b.fee_cents < a.fee_cents ? b : a));
    return `${t.name} $${(t.fee_cents / 100).toFixed(0)} · ${t.turnaround_days}d`;
  };
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
      <div className="text-sm text-gray-200">Grade odds {p.anyPop ? "(cards with a population use it)" : "(assumed: no Riftbound population data yet)"}</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-gray-300">PSA <span className="text-gray-500">· {tierText("psa")}</span></div>
          <div className="flex flex-wrap gap-2">{field("psa", "p10", "10")}{field("psa", "p9", "9")}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-300">CGC <span className="text-gray-500">· {tierText("cgc")}</span></div>
          <div className="flex flex-wrap gap-2">{field("cgc", "pristine", "Pristine")}{field("cgc", "p10", "10")}{field("cgc", "p95", "9.5")}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-300">BGS <span className="text-gray-500">· {tierText("bgs")}{!p.graders.bgs && " (add BGS in Settings)"}</span></div>
          <div className="flex flex-wrap gap-2">{field("bgs", "black", "Black")}{field("bgs", "p10", "10")}{field("bgs", "p95", "9.5")}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-300">PCG <span className="text-gray-500">· {tierText("pcg")} · cards with 10+ PCG copies use their population</span></div>
          <div className="flex flex-wrap gap-2">
            {field("pcg", "flawless", "Flawless")}{field("pcg", "pristine", "Pristine")}{field("pcg", "p10", "Gem 10")}{field("pcg", "p95", "9.5")}{field("pcg", "p9", "9")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <label className="flex items-center gap-1">Selling fee
          <input type="number" min={0} max={50} step={0.25} value={Math.round(p.sellFee * 10000) / 100}
            onChange={(e) => p.setSellFee(Number(e.target.value) / 100)}
            className="w-16 bg-gray-950 border border-gray-800 rounded px-1 py-0.5 text-gray-200 text-right" />%
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={p.businessDays} onChange={(e) => p.setBusinessDays(e.target.checked)} />
          Turnarounds are business days
        </label>
        <button onClick={() => p.setRates(DEFAULT_RATES)} className="text-sky-400 hover:text-sky-300">Reset odds</button>
        <span className="text-gray-600">Misses sell at raw. Hover an EV for the working.</span>
      </div>
    </section>
  );
}
