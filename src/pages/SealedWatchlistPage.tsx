import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addSealedOffer, fetchSealedPriority, fetchSealedWatch, refreshSealedWatch, removeSealedOffer, unwatchSealed, watchSealed,
  type SealedWatchRow,
} from "../lib/api";
import PlanWatchlist from "../components/PlanWatchlist";
import OfferAudit from "../components/OfferAudit";
import AddSealedProduct from "../components/AddSealedProduct";
import ShopDeals from "../components/ShopDeals";
import ReturnCell from "../components/ReturnCell";
import { Spinner } from "../components/Spinner";
import { SEALED_COLORS, pct, usd } from "./SealedTimingPage";

// Sealed watchlist: what you're keeping an eye on, its market price, and the
// cheapest reliable place to buy it right now.

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  return h < 1 ? "just now" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

function AddOffer({ productId, onDone }: { productId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ retailer: "", url: "", price: "", ship: "" });
  const [err, setErr] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="text-[11px] text-indigo-300 hover:underline">+ add a retailer offer</button>;
  const save = async () => {
    setErr("");
    try {
      await addSealedOffer({ product_id: productId, retailer: f.retailer, url: f.url, price_cents: Math.round(parseFloat(f.price) * 100),
        shipping_cents: f.ship ? Math.round(parseFloat(f.ship) * 100) : undefined });
      setOpen(false); setF({ retailer: "", url: "", price: "", ship: "" }); onDone();
    } catch (e) { setErr(String(e)); }
  };
  const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <input placeholder="Retailer" value={f.retailer} onChange={(e) => setF({ ...f, retailer: e.target.value })} className={`${inp} w-32`} />
      <input placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className={`${inp} w-64`} />
      <input placeholder="Price" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={`${inp} w-20`} />
      <input placeholder="Shipping" value={f.ship} onChange={(e) => setF({ ...f, ship: e.target.value })} className={`${inp} w-20`} />
      <button onClick={save} className="rounded bg-indigo-600 px-2 py-0.5 text-white">save</button>
      <button onClick={() => setOpen(false)} className="text-gray-500">cancel</button>
      {err && <span className="text-rose-400">{err}</span>}
    </div>
  );
}

export default function SealedWatchlistPage() {
  const [rows, setRows] = useState<SealedWatchRow[] | null>(null);
  const [meta, setMeta] = useState<{ last: string | null; sources: string }>({ last: null, sources: "" });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => fetchSealedWatch().then((r) => {
    setRows(r.products); setMeta({ last: r.last_refresh, sources: r.sources });
  }).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const refresh = async (ids: number[] = []) => {
    setMsg("");
    try { const r = await refreshSealedWatch(ids); setMsg(`Refresh queued (job ${r.job_id}); prices update in a few minutes.`); } catch (e) { setErr(String(e)); }
  };
  // every product on Sealed timing's priority list that isn't watched yet
  const [adding, setAdding] = useState("");
  const [confirmRm, setConfirmRm] = useState<number | null>(null);
  const addPriority = async () => {
    setErr(""); setAdding("loading the priority list…");
    try {
      const pr = await fetchSealedPriority(36);
      const have = new Set((rows ?? []).map((r) => r.product.id));
      const todo = [...new Set(pr.products.map((p) => p.product_id))].filter((id) => !have.has(id));
      for (let i = 0; i < todo.length; i++) {
        setAdding(`adding ${i + 1} of ${todo.length}…`);
        await watchSealed(todo[i]);
      }
      setAdding("");
      setMsg(todo.length ? `Added ${todo.length} priority products. Refresh prices to fetch their offers.` : "Every priority product is already watched.");
      load();
    } catch (e) { setErr(String(e)); setAdding(""); }
  };
  const setTarget = async (r: SealedWatchRow) => {
    const v = window.prompt("Buy below ($)", r.target_cents ? String(r.target_cents / 100) : "");
    if (v === null) return;
    await watchSealed(r.product.id, v ? Math.round(parseFloat(v) * 100) : null, r.note ?? "").catch((e) => setErr(String(e)));
    load();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed watchlist</h1>
        <p className="text-xs text-gray-500">Your watched products first; the plan watchlist (what your rules say to buy, wait on or watch) is below the table.</p>
        <p className="text-sm text-gray-400 max-w-4xl">
          Sealed products you&apos;re keeping an eye on, their market price and the cheapest reliable place to buy each right now:
          TCGplayer (singles and cases per unit), the hobby shops on the <Link to="/shops" className="text-indigo-300 hover:underline">Shops</Link> page
          Fanatics Collect (Buy Now; auctions for reference) and any offer you add, ranked by landed cost (price + each shop&apos;s shipping and tax settings).
          Fanatics offers also show their FanCash cost: what that FanCash would have cashed out for after the cash seller fee.
          Add any product with the search below (Build &amp; Battle, collections, tins included), or from <Link to="/sealed/timing" className="text-indigo-300 hover:underline">Sealed timing</Link>.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        <button onClick={() => refresh()} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500">Refresh prices now</button>
        <button onClick={addPriority} disabled={adding !== ""} className="rounded border border-gray-700 px-3 py-1 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          title="Watch every product on Sealed timing's priority list (36-month hold) that isn't watched yet">{adding || "Watch the priority list"}</button>
        <span>last refresh {ago(meta.last)} · automatic twice a week</span>
        {msg && <span className="text-emerald-300">{msg}</span>}
      </div>
      <AddSealedProduct watched={new Set((rows ?? []).map((r) => r.product.id))} onAdded={load} />
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Nothing watched yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium text-right">Market</th>
                <th className="px-2 py-2 font-medium text-right">12m</th>
                <th className="px-2 py-2 font-medium text-right">Buy below</th>
                <th className="px-2 py-2 font-medium">Cheapest reliable offer</th>
                <th className="px-2 py-2 font-medium" title="The cheapest Fanatics Collect Buy Now, and what it costs paid in FanCash (valued at what that FanCash would cash out for, less the cash seller fee)">Fanatics / FanCash</th>
                <th className="px-2 py-2 font-medium text-right" title="A year, held to the sealed plan's exit (12 months after its set rotates) and sold net of the resale fee and shipping: bought at market vs at the cheapest offer. Second line: the same if the sealed market as a whole goes flat.">Return a year: market → offer</th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.product, b = r.best_offer;
                return [
                  <tr key={p.id} className={`border-t border-gray-800 align-top ${r.below_target ? "bg-emerald-950/30" : ""}`}>
                    <td className="px-3 py-2">
                      <span style={{ color: SEALED_COLORS[p.kind] ?? "#e5e7eb" }}>●</span>{" "}
                      <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{p.set_name} · {p.name}</a>
                      <div className="text-[10px] text-gray-500">{p.months_since_release != null ? `${p.months_since_release} months since release` : ""}</div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-200">{usd(p.latest_cents)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-400">{pct(p.change_12m)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <button onClick={() => setTarget(r)} className="text-gray-300 hover:text-indigo-300">{r.target_cents ? usd(r.target_cents) : "set"}</button>
                    </td>
                    <td className="px-2 py-2">
                      {b ? (
                        <span>
                          <a href={b.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-300 hover:underline">{usd(b.landed_cents)} at {b.retailer} ↗</a>
                          {b.landed_cents !== b.price_cents && <div className="text-[10px] text-gray-500">{usd(b.price_cents)} + {usd(b.add_ship_cents)} ship + {usd(b.tax_cents)} tax</div>}
                          {!b.shipping_known && <div className="text-[10px] text-amber-300">shipping not set for this shop</div>}
                          {b.free_ship_assumed && <div className="text-[10px] text-sky-300/80" title="Settings: orders are filled out to the shop's free-shipping minimum">free ship (assumes a {usd(b.free_ship_min_cents ?? 0)}+ order)</div>}
                          {b.seller_note && <div className="text-[10px] text-gray-500">{b.seller ? `${b.seller} · ` : ""}{b.seller_note}</div>}
                          {r.below_target && <div className="text-[10px] text-emerald-300">below your target</div>}
                          {r.market_check && <div className="text-[10px] text-amber-300" title={r.market_check}>market price to check</div>}
                        </span>
                      ) : <span className="text-gray-600">no offers yet</span>}
                    </td>
                    <td className="px-2 py-2">
                      {r.best_fancash ? (
                        <span>
                          <a href={r.best_fancash.url} target="_blank" rel="noreferrer" className="text-gray-200 hover:underline">{usd(r.best_fancash.landed_cents)} Buy Now ↗</a>
                          <div className={`text-[10px] ${r.fancash_wins ? "text-emerald-300" : "text-gray-500"}`}>
                            {usd(r.best_fancash.fancash_cents)} in FanCash{r.fancash_saves_cents != null && r.best_offer && r.best_offer.source !== r.best_fancash.source
                              ? r.fancash_wins ? ` · ${usd(r.fancash_saves_cents)} under cash` : ` · ${usd(-r.fancash_saves_cents)} over cash` : ""}
                          </div>
                          {!r.best_fancash.shipping_known && <div className="text-[10px] text-amber-300">set Fanatics shipping on Shops</div>}
                        </span>
                      ) : <span className="text-gray-600">none listed</span>}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap"><ReturnCell x={r.returns} /></td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <button onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} className="text-gray-400 hover:text-gray-200">{open[p.id] ? "hide" : `all ${r.offers.length}`}</button>
                      <button onClick={() => refresh([p.id])} className="ml-2 text-gray-500 hover:text-gray-300">refresh</button>
                      {confirmRm === p.id ? (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <button onClick={async () => { setConfirmRm(null); await unwatchSealed(p.id).catch((e) => setErr(String(e))); load(); }}
                            className="rounded bg-rose-700 px-2 py-0.5 text-white hover:bg-rose-600">Remove</button>
                          <button onClick={() => setConfirmRm(null)} className="text-gray-500 hover:text-gray-300">keep</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmRm(p.id)} className="ml-2 rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:border-rose-700 hover:text-rose-300"
                          title="Take it off the watchlist (its offers stop refreshing unless the plan covers it)">Remove</button>
                      )}
                    </td>
                  </tr>,
                  open[p.id] && (
                    <tr key={`${p.id}-o`} className="bg-gray-950/50">
                      <td colSpan={8} className="px-4 py-2 space-y-1.5">
                        <table className="w-full text-xs">
                          <tbody>
                            {r.offers.map((o) => (
                              <tr key={o.id} className={o.stale || !o.in_stock || o.suspect || o.needs_check ? "opacity-50" : ""}>
                                <td className="py-0.5 pr-3 whitespace-nowrap text-gray-300">{o.retailer}{o.reference_only && <span className="text-gray-500"> (reference)</span>}{!o.in_stock && <span className="text-rose-300"> sold out</span>}{o.suspect && <span className="text-amber-300" title="Under half the market price: almost always a mismatch (a graded promo card, one pack from a box, another set's product) or a junk listing. Left out of the cheapest offer and the return. Confirm or reject it in the Offer audit."> suspect</span>}{o.needs_check && <span className="text-amber-300" title={`${o.check}. Left out of the cheapest offer until confirmed in the Offer audit.`}> check</span>}{o.verified && <span className="text-emerald-400" title="confirmed as this product"> ✓</span>}</td>
                                <td className="py-0.5 pr-3 tabular-nums text-gray-100">{usd(o.landed_cents)}
                                  {o.landed_cents !== o.price_cents && <span className="text-gray-500"> ({usd(o.price_cents)} + {usd(o.add_ship_cents)} ship + {usd(o.tax_cents)} tax)</span>}
                                  {!o.shipping_known && <span className="text-amber-300"> no shipping set</span>}
                                  {o.free_ship_assumed && <span className="text-sky-300/80" title="Settings: orders are filled out to the shop's free-shipping minimum"> free ship at {usd(o.free_ship_min_cents ?? 0)}+</span>}
                                  {o.shipping_cents ? <span className="text-gray-500"> incl. {usd(o.shipping_cents)} ship</span> : ""}
                                  {o.premium_cents ? <span className="text-gray-500"> (bid {usd(o.price_cents)} + {usd(o.premium_cents)} premium)</span> : ""}
                                  {o.fancash_cents != null && <span className="text-emerald-300/80"> · {usd(o.fancash_cents)} in FanCash</span>}</td>
                                <td className="py-0.5 pr-3 text-gray-500 max-w-md truncate" title={o.title}>{o.title ?? o.seller_note ?? ""}{o.title && o.seller_note ? ` · ${o.seller_note}` : ""}</td>
                                <td className="py-0.5 pr-3 text-gray-600 whitespace-nowrap">{ago(o.checked_at)}</td>
                                <td className="py-0.5 whitespace-nowrap">
                                  <a href={o.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">open ↗</a>
                                  {o.source === "manual" && <button onClick={async () => { await removeSealedOffer(o.id); load(); }} className="ml-2 text-gray-600 hover:text-rose-300">remove</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <AddOffer productId={p.id} onDone={load} />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <ShopDeals onWatched={load} />
      <OfferAudit onChange={load} />
      <PlanWatchlist onWatched={load} />
      <p className="text-[11px] text-gray-500 max-w-4xl">{meta.sources}</p>
    </div>
  );
}
