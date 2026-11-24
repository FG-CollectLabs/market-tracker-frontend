import { Fragment, useEffect, useState } from "react";
import { fetchBestChannels, fetchChannels, fetchEbaySellers, saveEbaySeller, type ChannelKind, type ChannelReport, type ChannelStats, type EbaySellerRow } from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";
import RatioStrip, { StripAxis, fmtX } from "../components/RatioStrip";
import ChannelExplore from "../components/ChannelExplore";
import { useSearchParams } from "react-router-dom";

const GROUPS: { kind: ChannelKind; title: string; hint: string }[] = [
  { kind: "consigner", title: "Consigners", hint: "Tracked eBay consigners, each on its own line." },
  { kind: "platform", title: "Fanatics", hint: "Weekly auction: the hammer, before the 20% buyer's premium. Buy Now: the sale price." },
  { kind: "tier", title: "Other eBay sellers, by feedback", hint: "Every eBay seller who isn't a tracked consigner, grouped by feedback score (eBay doesn't expose followers)." },
  { kind: "baseline", title: "Baseline", hint: "eBay sales whose seller we never saw: most eBay sales, so roughly the eBay average." },
];

const GRADE_LABEL: Record<string, string> = {
  "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine 10", "bgs-9.5": "BGS 9.5", "tag-10": "TAG 10", other: "Other grades",
};

function Row({ c }: { c: ChannelStats }) {
  const [open, setOpen] = useState(false);
  const d = c.seller_ratio;
  // the seven price bands (sale and net spread) when present, else the four
  const fine = c.by_fine_band ?? [];
  const cells = [
    ...(fine.length ? fine.map((x) => ({ key: x.key, seller_ratio: x.seller_ratio, net: x.net_ratio, group: "Price band", label: x.label }))
      : (c.by_price_band ?? []).map((x) => ({ ...x, net: undefined, group: "Price band", label: x.label ?? x.key }))),
    ...(c.by_grade ?? []).map((x) => ({ ...x, net: undefined, group: "Grade", label: GRADE_LABEL[x.key] ?? x.key })),
  ];
  return (
    <Fragment>
      <tr className="border-t border-gray-800 hover:bg-gray-900/60 cursor-pointer" onClick={() => setOpen(!open)}>
        <td className="py-2 pr-3 align-middle">
          <div className="text-sm text-gray-100 flex items-center gap-1.5">
            <span className={`text-gray-600 text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            {c.label}
          </div>
          <div className="text-[11px] text-gray-500 pl-4 tabular-nums">
            {c.sales.toLocaleString()} sales · {c.cards.toLocaleString()} cards
            {c.approx > 0 && <> · {c.approx} pre-close bids</>}
            {c.channel === "fanatics_auction" && c.buyer_ratio && <> · buyer pays {fmtX(c.buyer_ratio.p50)} with the 20% premium</>}
          </div>
          <div className="text-[11px] pl-4 tabular-nums" title={c.net_basis}>
            {c.net_ratio ? <span className="text-emerald-300">you net {fmtX(c.net_ratio.p50)} <span className="text-gray-500">({fmtX(c.net_ratio.p25)}–{fmtX(c.net_ratio.p75)})</span></span>
              : c.kind === "consigner" ? <span className="text-amber-400/80">payout schedule not entered: net unknown</span> : null}
          </div>
        </td>
        <td className="py-2 px-2 w-[45%] min-w-[11rem]"><RatioStrip d={d} approx={c.approx > 0 && c.approx === c.sales} title={c.label} /></td>
        <td className="py-2 pl-3 text-right tabular-nums text-sm text-gray-100 whitespace-nowrap">{d ? fmtX(d.p50) : "–"}</td>
        <td className="py-2 pl-3 text-right tabular-nums text-xs text-gray-400 whitespace-nowrap hidden sm:table-cell">{d ? `${fmtX(d.p25)}–${fmtX(d.p75)}` : ""}</td>
        <td className="py-2 pl-3 text-right tabular-nums text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">{d ? `${fmtX(d.p10)}–${fmtX(d.p90)}` : ""}</td>
      </tr>
      {open && cells.map((x) => (
        <tr key={x.group + x.key} className="bg-gray-950/40">
          <td className="py-1 pr-3 pl-8 text-xs text-gray-400">
            <span className="text-gray-600">{x.group}:</span> {x.label}
            {x.net && <span className="ml-1.5 tabular-nums text-emerald-400/80" title={`what you net, ${fmtX(x.net.p25)}–${fmtX(x.net.p75)} middle half`}>net {fmtX(x.net.p50)}</span>}
            <span className={`ml-1.5 tabular-nums ${x.seller_ratio.n < 20 ? "text-amber-400/80" : "text-gray-600"}`} title={x.seller_ratio.n < 20 ? "Under 20 sales: not used for card estimates" : undefined}>
              n={x.seller_ratio.n}
            </span>
          </td>
          <td className="py-1 px-2"><RatioStrip d={x.seller_ratio} title={`${c.label} · ${x.label}`} /></td>
          <td className="py-1 pl-3 text-right tabular-nums text-xs text-gray-200">{fmtX(x.seller_ratio.p50)}</td>
          <td className="py-1 pl-3 text-right tabular-nums text-[11px] text-gray-500 hidden sm:table-cell">{fmtX(x.seller_ratio.p25)}–{fmtX(x.seller_ratio.p75)}</td>
          <td className="py-1 pl-3 text-right tabular-nums text-[11px] text-gray-600 hidden md:table-cell">{fmtX(x.seller_ratio.p10)}–{fmtX(x.seller_ratio.p90)}</td>
        </tr>
      ))}
      {open && (c.by_card?.length ?? 0) > 0 && (
        <tr className="bg-gray-950/40">
          <td colSpan={5} className="py-2 pl-8 pr-3">
            <div className="text-[11px] text-gray-500 mb-1">Cards it sold most (3+ sales): median sale ÷ market{c.net_ratio ? ", and what you net" : ""}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">{c.by_card!.map((x) => (
              <a key={x.display_key} href={`#/cards/${x.display_key}`} className="text-gray-300 hover:text-indigo-300 tabular-nums">
                {x.name} <span className="text-gray-500">{x.display_key.replace(/^pokemon-/, "")}</span>{" "}
                <span className={x.median_seller_ratio >= 0.9 ? "text-emerald-300" : x.median_seller_ratio >= 0.75 ? "text-gray-200" : "text-rose-300"}>{fmtX(x.median_seller_ratio)}</span>
                {x.median_net_ratio != null && <span className="text-emerald-400/80"> net {fmtX(x.median_net_ratio)}</span>}
                <span className="text-gray-600"> ×{x.sales} · ~${Math.round(x.median_market_cents / 100)}</span>
              </a>
            ))}</div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function Sellers() {
  const [rows, setRows] = useState<EbaySellerRow[] | null>(null);
  const [presets, setPresets] = useState<{ key: string; name: string; source: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const load = (query = q) => fetchEbaySellers(60, query).then((r) => { setRows(r.sellers); setPresets(r.payout_presets ?? []); }).catch((e) => setErr(String(e)));
  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setPayout = async (s: EbaySellerRow, preset: string) => {
    setBusy(s.username);
    try { await saveEbaySeller(s.username, preset ? { payout_preset: preset } : { clear_payout: true }); await load(); }
    catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };
  const toggle = async (s: EbaySellerRow) => {
    setBusy(s.username);
    try {
      await saveEbaySeller(s.username, s.tracked ? { tracked: false } : { tracked: true, kind: "consigner", label: s.label || s.username });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };
  if (err) return <ErrorMsg msg={err} />;
  if (!rows) return <Spinner />;
  return (
    <div className="overflow-x-auto space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); load(q.trim().toLowerCase()); }} className="flex flex-wrap items-center gap-2 text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a seller by eBay username (e.g. retrospecs)"
          className="w-72 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-200" />
        <button type="submit" className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:text-white">Search</button>
        {q && <button type="button" onClick={() => { setQ(""); load(""); }} className="text-gray-500 hover:text-gray-300">clear</button>}
        <span className="text-gray-600">Searches every seller we've seen on a listing or sale.</span>
      </form>
      <table className="w-full text-xs">
        <thead className="text-gray-500 text-left max-lg:!static">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Seller</th>
            <th className="py-1.5 px-2 font-medium text-right">Feedback</th>
            <th className="py-1.5 px-2 font-medium text-right">Listings 60d</th>
            <th className="py-1.5 px-2 font-medium text-right">Auctions</th>
            <th className="py-1.5 px-2 font-medium text-right">Cards</th>
            <th className="py-1.5 px-2 font-medium text-right">Sales matched</th>
            <th className="py-1.5 px-2 font-medium" title="What the consigner pays you, by sale price tier: sets the net ratio">Payout schedule</th>
            <th className="py-1.5 pl-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.username} className="border-t border-gray-800">
              <td className="py-1.5 pr-3">
                <a href={`https://www.ebay.com/usr/${encodeURIComponent(s.username)}`} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-indigo-300">{s.label || s.username}</a>
                {s.label && <span className="ml-1.5 text-gray-600">{s.username}</span>}
                {s.tracked && <span className="ml-1.5 px-1.5 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-[10px] text-indigo-200">tracked</span>}
                {s.consigner_candidate && <span className="ml-1.5 px-1.5 py-0.5 rounded border border-amber-900 bg-amber-950/40 text-[10px] text-amber-200" title="Auction-heavy across many cards, or 50k+ feedback across 100+ cards">possible consigner</span>}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">
                {s.feedback_score != null ? s.feedback_score.toLocaleString() : <span className="text-gray-600">–</span>}
                {s.feedback_pct != null && <span className="text-gray-600"> · {s.feedback_pct}%</span>}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{s.listings_60d.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{s.auctions_60d.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{s.cards_60d.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{s.sales_matched.toLocaleString()}</td>
              <td className="py-1.5 px-2">
                {s.tracked ? (
                  <select value={presets.find((p) => p.name === s.payout?.name)?.key ?? (s.payout ? "custom" : "")} disabled={busy === s.username}
                    onChange={(e) => e.target.value !== "custom" && setPayout(s, e.target.value)}
                    className="rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-200" title={s.payout?.source}>
                    <option value="">not entered</option>
                    {presets.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                    {s.payout && !presets.some((p) => p.name === s.payout?.name) && <option value="custom">custom</option>}
                  </select>
                ) : <span className="text-gray-600">–</span>}
              </td>
              <td className="py-1.5 pl-2 text-right">
                <button disabled={busy === s.username} onClick={() => toggle(s)}
                  className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50">
                  {s.tracked ? "Untrack" : "Track"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Where to sell one slab: every channel's expected net payout at a market price.
function BestChannels() {
  const [price, setPrice] = useState("250");
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchBestChannels>> | null>(null);
  const [err, setErr] = useState("");
  const run = (v = price) => {
    const c = Math.round(parseFloat(v) * 100);
    if (!(c > 0)) return;
    setErr("");
    fetchBestChannels({ market_cents: c }).then(setD).catch((e) => setErr(String(e)));
  };
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: c >= 10000 ? 0 : 2 })}`;
  return (
    <section className="rounded-lg border border-emerald-900/60 bg-gray-900 p-4 space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-100">Best place to sell a slab worth</h2>
        <span className="text-gray-400">$</span>
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-24 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-100" />
        <button type="submit" className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:text-white">Rank</button>
        {d && <span className="text-xs text-gray-500">{d.price_band} band · last {d.days} days</span>}
      </form>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {d && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr>
              <th className="py-1 pr-3 font-medium">Channel</th><th className="py-1 px-2 text-right font-medium">You net</th>
              <th className="py-1 px-2 text-right font-medium">Middle half</th><th className="py-1 px-2 text-right font-medium">Sells at</th>
              <th className="py-1 pl-2 font-medium">Based on</th>
            </tr></thead>
            <tbody>{d.channels.map((c, i) => (
              <tr key={c.channel} className="border-t border-gray-800">
                <td className={`py-1 pr-3 ${i === 0 ? "text-emerald-300 font-medium" : "text-gray-200"}`} title={c.net_basis}>{c.label}</td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-100">{usd(c.expected_net_cents)} <span className="text-gray-500">({fmtX(c.median_net_ratio)})</span></td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-400">{usd(c.net_p25_cents)}–{usd(c.net_p75_cents)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-gray-400">{fmtX(c.median_sale_ratio)}</td>
                <td className="py-1 pl-2 text-gray-500">{c.sales} sales, {c.basis}{c.approx_share ? ` · ${Math.round(c.approx_share * 100)}% pre-close bids` : ""}</td>
              </tr>
            ))}</tbody>
          </table>
          {d.unpriced.length > 0 && <p className="mt-1 text-[11px] text-amber-400/80">Not ranked (no payout schedule entered): {d.unpriced.map((u) => `${u.label} sells at ${fmtX(u.median_sale_ratio)} (${u.sales})`).join(" · ")}. Set one under eBay sellers below.</p>}
        </div>
      )}
    </section>
  );
}

export default function ChannelsPage() {
  const [days, setDays] = useState(180);
  const [rep, setRep] = useState<ChannelReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "explore" ? "explore" : "overview";
  const setView = (v: string) => { const n = new URLSearchParams(params); if (v === "overview") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); };
  useEffect(() => {
    if (view !== "overview") return;
    setRep(null);
    setErr(null);
    fetchChannels(days).then(setRep).catch((e) => setErr(String(e)));
  }, [days, view]);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Sell channels</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            What graded cards actually sell for through each platform and consigner, as a multiple of the card's market.
            Read a row as "selling here, you typically get this much of market"; the bar is the range to expect.
          </p>
        </div>
        <div className="text-right">
          <div className="inline-flex rounded border border-gray-700 overflow-hidden text-sm" title="Which sales are counted: only those from the last 90, 180 or 365 days">
            {[90, 180, 365].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 ${days === d ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
                {d} days
              </button>
            ))}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">Counts only sales from the last {days} days</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-1 border-b border-gray-800 text-sm">
        {[["overview", "Overview"], ["explore", "Explore by category"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-3 py-1.5 -mb-px border-b-2 ${view === k ? "border-indigo-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>{l}</button>
        ))}
      </div>

      {view === "explore" && <ChannelExplore days={days} />}

      {view === "overview" && err && <ErrorMsg msg={err} />}
      {view === "overview" && !rep && !err && <Spinner />}
      {view === "overview" && rep && (
        <>
          <BestChannels />
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 overflow-x-auto">
            <table className="w-full">
              <thead className="max-lg:!static">
                <tr className="text-[11px] text-gray-500 text-left">
                  <th className="pb-1 pr-3 font-medium">Channel</th>
                  <th className="pb-1 px-2 font-medium"><StripAxis /></th>
                  <th className="pb-1 pl-3 font-medium text-right">Median</th>
                  <th className="pb-1 pl-3 font-medium text-right hidden sm:table-cell">Middle half</th>
                  <th className="pb-1 pl-3 font-medium text-right hidden md:table-cell">10–90%</th>
                </tr>
              </thead>
              {GROUPS.map((g) => {
                const rows = rep.channels.filter((c) => c.kind === g.kind);
                return (
                  <tbody key={g.kind}>
                    <tr>
                      <td colSpan={5} className="pt-4 pb-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{g.title}</div>
                        <div className="text-[11px] text-gray-600 max-w-[22rem] sm:max-w-none">{g.hint}</div>
                      </td>
                    </tr>
                    {rows.length ? rows.map((c) => <Row key={c.channel} c={c} />) : (
                      <tr><td colSpan={5} className="py-2 text-xs text-gray-600">
                        {g.kind === "tier" ? "Filling in: seller feedback is recorded from each eBay search, so tiers appear over the next day." : "No sales placed yet."}
                      </td></tr>
                    )}
                  </tbody>
                );
              })}
            </table>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-2.5 rounded bg-indigo-500/80" /> middle half of sales</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-indigo-400/50" /> 10–90%</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-white" /> median</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-gray-500" /> market (1.0×)</span>
              <span>Click a row for price bands and grades.</span>
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400 space-y-1">
            <h2 className="text-sm font-semibold text-gray-100">How it's measured</h2>
            <p>{rep.method}</p>
            <p className="text-gray-500 tabular-nums">
              {rep.sales_placed.toLocaleString()} sales placed over {rep.days} days; {rep.sales_no_market.toLocaleString()} left out (too few other sales of
              that card and grade around them to set a market). Updated {new Date(rep.generated_at).toLocaleString()}.
            </p>
            <p className="text-gray-500">
              Seller-side, before each channel's fees. eBay sellers we know come from listings we scanned, so consigner lines grow as their auctions close.
            </p>
          </section>

          {session && (
            <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-100">eBay sellers</h2>
              <p className="text-xs text-gray-500">
                Tracked sellers get their own line above, and their auctions are checked about 2 minutes before they close. "Possible consigner"
                flags auction-heavy sellers across many cards. Changes show on the next report refresh.
              </p>
              <Sellers />
            </section>
          )}
        </>
      )}
    </div>
  );
}
