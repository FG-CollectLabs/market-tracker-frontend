import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWatchConsigners, saveRawSeller, type ConsignerListing, type ConsignerTab, type RawBasket } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";

// Watchlist by consigner: one tab per tracked eBay consigner (DC Sports, PSA
// Consignment, ...) with its live listings of watchlist cards. Copies are
// costed as one more item in an order from that consigner (item + its
// each-additional shipping), so a copy a little over its max still shows
// ("stretch") when shared shipping makes it worth adding.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const storeURL = (u: string) => `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(u)}&_sacat=183454`;
const GRADE: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine 10" };
const gradeLabel = (g: string) => GRADE[g] ?? g.replace(/^([a-z]+)-/, (_, p: string) => p.toUpperCase() + " ").replace("-", " ");
const TARGET: Record<string, string> = { raw_grade: "Raw to grade", raw_invest: "Raw to hold", psa_10: "PSA 10", cgc_10: "CGC 10", regrade: "Crack & regrade" };
const STRETCHES = [0, 0.1, 0.15, 0.25];

function endsIn(iso?: string) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ending";
  const h = ms / 3.6e6;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export default function ConsignerWatch({ seller, setSeller }: { seller: string; setSeller: (s: string) => void }) {
  const [stretch, setStretch] = useState(0.15);
  const [data, setData] = useState<ConsignerTab[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<"" | "auction" | "buy_now">("");
  const [show, setShow] = useState<"targets" | "market" | "all">("targets");

  const load = () => {
    setLoading(true);
    setErr(null);
    return fetchWatchConsigners(seller, stretch)
      .then((r) => setData(r.consigners))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [seller, stretch]); // eslint-disable-line react-hooks/exhaustive-deps

  const tab = data?.find((t) => t.listings) ?? null;
  const rows = (tab?.listings ?? []).filter((l) =>
    (!kind || l.kind === kind) && (show === "all" || (show === "market" ? l.status === "market" : l.status !== "market")));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Live listings of your watchlist cards from each tracked consigner. Each copy is costed as one more item in an order from
        that consigner (its price plus their each-additional shipping), and auctions at what they're expected to close for, not
        the current bid. <span className="text-gray-300">Under</span> = at or under the card's target max; <span className="text-gray-300">stretch</span> = up
        to {Math.round(stretch * 100)}% over it, worth a look when you're already ordering; <span className="text-gray-300">at market</span> = a grade
        none of the card's targets buys, at or under that grade's market.
      </p>

      {err && <ErrorMsg msg={err} />}
      {!data && !err && <Spinner />}
      {data && data.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
          No consigners tracked yet. Track them under <Link to="/channels" className="text-indigo-300 hover:text-indigo-200">Sell channels → eBay sellers</Link>.
        </div>
      )}
      {data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
            {data.map((t) => (
              <button key={t.username} onClick={() => setSeller(t.username)}
                className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${tab?.username === t.username ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                {t.label}{" "}
                <span className="text-xs text-gray-500 tabular-nums" title="under max · stretch · at market">
                  <span className="text-green-400/90">{t.under}</span> · {t.stretch} · {t.at_market}
                </span>
              </button>
            ))}
            {loading && <span className="text-xs text-gray-500 px-2 pb-2">Loading…</span>}
          </div>

          {tab && (
            <>
              <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="text-sm text-gray-100 font-semibold">{tab.label} <span className="text-xs text-gray-500 font-normal">{tab.username}</span></div>
                    <div className="text-gray-400">{tab.ship_rule.text}{tab.ship_rule.note ? ` · ${tab.ship_rule.note}` : ""}</div>
                    {tab.channel_p50 != null && (
                      <div className="text-gray-400">
                        Their sales close at <span className="text-gray-200">{tab.channel_p50.toFixed(2)}×</span> market (median of {tab.channel_n} graded sales,{" "}
                        <Link to="/channels" className="text-indigo-300 hover:text-indigo-200">Sell channels</Link>)
                      </div>
                    )}
                    <a href={storeURL(tab.username)} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">Their Pokémon listings on eBay ↗</a>
                  </div>
                  <div className="space-y-1 text-xs text-right">
                    <BasketLine label="Under max" b={tab.basket} />
                    {tab.stretch > 0 && <BasketLine label={`With stretch (+${Math.round(stretch * 100)}%)`} b={tab.stretch_basket} />}
                    {(tab.basket ?? tab.stretch_basket) && <div className="text-gray-500 max-w-sm ml-auto">{(tab.basket ?? tab.stretch_basket)!.note}</div>}
                    {tab.passed > 0 && <div className="text-gray-500">{tab.passed} you passed on are hidden</div>}
                  </div>
                </div>
                <RuleEditor tab={tab} onSaved={load} />
              </section>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Seg value={show} onChange={setShow} options={[["targets", `Under + stretch (${tab.under + tab.stretch})`], ["market", `At market (${tab.at_market})`], ["all", "All"]]} />
                <Seg value={kind} onChange={setKind} options={[["", "Auctions + Buy Now"], ["auction", "Auctions"], ["buy_now", "Buy Now"]]} />
                <label className="flex items-center gap-1.5 text-gray-400">
                  Stretch
                  <select value={stretch} onChange={(e) => setStretch(Number(e.target.value))} className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200">
                    {STRETCHES.map((s) => <option key={s} value={s}>{s === 0 ? "none" : `+${Math.round(s * 100)}%`}</option>)}
                  </select>
                </label>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing here right now.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 text-left max-lg:!static">
                      <tr>
                        <th className="py-2 px-3 font-medium">Card</th>
                        <th className="py-2 px-2 font-medium">Grade</th>
                        <th className="py-2 px-2 font-medium">Type</th>
                        <th className="py-2 px-2 font-medium text-right" title="Ask or current bid, with its listed shipping">Now</th>
                        <th className="py-2 px-2 font-medium text-right" title="The price without shipping; auctions: what it's expected to close for">Item</th>
                        <th className="py-2 px-2 font-medium text-right" title="What it adds to an order: item + their each-additional shipping">In an order</th>
                        <th className="py-2 px-2 font-medium text-right">Max</th>
                        <th className="py-2 px-3 font-medium text-right">vs max</th>
                      </tr>
                    </thead>
                    <tbody>{rows.map((l) => <Row key={l.listing_id} l={l} />)}</tbody>
                  </table>
                  {rows.length >= 300 && <p className="text-[11px] text-gray-500 p-2">Showing the best 300.</p>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function BasketLine({ label, b }: { label: string; b?: RawBasket }) {
  if (!b) return <div className="text-gray-500">{label}: nothing</div>;
  return (
    <div className="text-gray-400 tabular-nums">
      {label}: {b.items} for {usd(b.items_cents)} + {usd(b.ship_cents)} ship = <span className="text-gray-100">{usd(b.total_cents)}</span>{" "}
      ({usd(b.per_card_cents)}/card) · <span className={b.headroom_cents >= 0 ? "text-green-300" : "text-amber-300"}>{usd(Math.abs(b.headroom_cents))} {b.headroom_cents >= 0 ? "under" : "over"} max</span>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded border border-gray-700 overflow-hidden" role="group">
      {options.map(([k, l]) => (
        <button key={k || "any"} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`px-2.5 py-1 ${value === k ? "bg-indigo-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>{l}</button>
      ))}
    </div>
  );
}

const STATUS: Record<ConsignerListing["status"], string> = {
  under: "text-green-300", stretch: "text-amber-300", market: "text-gray-300",
};

function Row({ l }: { l: ConsignerListing }) {
  const pct = Math.round((l.vs_max - 1) * 100);
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-1.5 px-3">
        <div className="flex gap-2 items-start min-w-[16rem]">
          {(l.image_url || l.card_image_url) && <img src={l.image_url || l.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
          <div className="min-w-0">
            <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
            <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
            {l.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
            {l.review?.status === "interested" && <span className="ml-1.5 px-1 rounded bg-indigo-900/50 text-indigo-200">interested</span>}
            {l.url
              ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
              : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
          </div>
        </div>
      </td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{gradeLabel(l.grade_key)}</td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">
        {l.kind === "auction" ? <>Auction · {endsIn(l.ends_at)}{l.bids != null && <span className="text-gray-600"> · {l.bids} bids</span>}</> : "Buy Now"}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{usd(l.price_cents)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300" title={l.expected_note}>
        {usd(l.item_cents)}
        {l.expected && <div className="text-[10px] text-gray-500">expected close</div>}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-100">{usd(l.add_cents)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300 whitespace-nowrap">
        {usd(l.max_cents)}
        <div className="text-[10px] text-gray-500">{l.max_kind === "market" ? "grade's market" : TARGET[l.target] ?? l.target}</div>
      </td>
      <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap ${STATUS[l.status]}`}>
        {pct === 0 ? "at max" : pct < 0 ? `${-pct}% under` : `${pct}% over`}
        <div className="text-[10px] text-gray-500">{l.status === "market" ? "at market" : l.status}</div>
      </td>
    </tr>
  );
}

const toCents = (v: string) => (v.trim() === "" ? undefined : Math.round(parseFloat(v) * 100));
const fromCents = (c?: number) => (c == null ? "" : (c / 100).toFixed(2));

function RuleEditor({ tab, onSaved }: { tab: ConsignerTab; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(fromCents(tab.ship_rule.first_cents));
  const [each, setEach] = useState(fromCents(tab.ship_rule.each_add_cents));
  const [free, setFree] = useState(fromCents(tab.ship_rule.free_over_cents));
  const [cap, setCap] = useState(fromCents(tab.ship_rule.cap_cents));
  const [note, setNote] = useState(tab.ship_rule.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setFirst(fromCents(tab.ship_rule.first_cents));
    setEach(fromCents(tab.ship_rule.each_add_cents));
    setFree(fromCents(tab.ship_rule.free_over_cents));
    setCap(fromCents(tab.ship_rule.cap_cents));
    setNote(tab.ship_rule.note ?? "");
  }, [tab.username, tab.ship_rule]);
  const bad = [first, each, free, cap].some((v) => v.trim() !== "" && !(parseFloat(v) >= 0));
  const inp = "w-20 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 tabular-nums";
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-indigo-300 hover:text-indigo-200">Edit combined-shipping rule</button>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-gray-500">Combined shipping:</span>
      <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="first $" className={inp} aria-label="First item shipping" />
      <input value={each} onChange={(e) => setEach(e.target.value)} placeholder="each +$" className={inp} aria-label="Each additional item" />
      <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="free over $" className={inp} aria-label="Free shipping over" />
      <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="max $/order" className={inp} aria-label="Most an order's shipping costs" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (e.g. auctions won the same week)" className="w-64 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200" />
      <button disabled={busy || bad} onClick={() => {
        setBusy(true);
        saveRawSeller(tab.username, { ship_first_cents: toCents(first), ship_each_add_cents: toCents(each), free_ship_over_cents: toCents(free), ship_cap_cents: toCents(cap), ship_note: note })
          .then(() => { setOpen(false); onSaved(); }).catch((e) => setErr(String(e))).finally(() => setBusy(false));
      }} className="px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 disabled:opacity-40">Save</button>
      <button disabled={busy} onClick={() => {
        setBusy(true);
        saveRawSeller(tab.username, { clear_ship_rule: true }).then(() => { setOpen(false); onSaved(); }).catch((e) => setErr(String(e))).finally(() => setBusy(false));
      }} className="px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40">Clear</button>
      <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">Cancel</button>
      {err && <span className="text-red-400">{err}</span>}
    </div>
  );
}
