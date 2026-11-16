import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addSealedOffer, fetchSealedWatch, refreshSealedWatch, removeSealedOffer, unwatchSealed, watchSealed,
  type SealedWatchRow,
} from "../lib/api";
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

  const load = () => fetchSealedWatch().then((r) => { setRows(r.products); setMeta({ last: r.last_refresh, sources: r.sources }); }).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const refresh = async (ids: number[] = []) => {
    setMsg("");
    try { const r = await refreshSealedWatch(ids); setMsg(`Refresh queued (job ${r.job_id}); prices update in a few minutes.`); } catch (e) { setErr(String(e)); }
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
        <p className="text-sm text-gray-400 max-w-4xl">
          Sealed products you&apos;re keeping an eye on, their market price and the cheapest reliable place to buy each right now.
          Add products from <Link to="/sealed/timing" className="text-indigo-300 hover:underline">Sealed timing</Link> (Watch on the priority list or by-set table).
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        <button onClick={() => refresh()} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500">Refresh prices now</button>
        <span>last refresh {ago(meta.last)} · automatic twice a week</span>
        {msg && <span className="text-emerald-300">{msg}</span>}
      </div>
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
                          <a href={b.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-300 hover:underline">{usd(b.price_cents)} at {b.retailer} ↗</a>
                          {b.seller_note && <div className="text-[10px] text-gray-500">{b.seller ? `${b.seller} · ` : ""}{b.seller_note}</div>}
                          {r.below_target && <div className="text-[10px] text-emerald-300">below your target</div>}
                        </span>
                      ) : <span className="text-gray-600">no offers yet</span>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <button onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} className="text-gray-400 hover:text-gray-200">{open[p.id] ? "hide" : `all ${r.offers.length}`}</button>
                      <button onClick={() => refresh([p.id])} className="ml-2 text-gray-500 hover:text-gray-300">refresh</button>
                      <button onClick={async () => { await unwatchSealed(p.id); load(); }} className="ml-2 text-gray-600 hover:text-rose-300">remove</button>
                    </td>
                  </tr>,
                  open[p.id] && (
                    <tr key={`${p.id}-o`} className="bg-gray-950/50">
                      <td colSpan={6} className="px-4 py-2 space-y-1.5">
                        <table className="w-full text-xs">
                          <tbody>
                            {r.offers.map((o) => (
                              <tr key={o.id} className={o.stale ? "opacity-50" : ""}>
                                <td className="py-0.5 pr-3 whitespace-nowrap text-gray-300">{o.retailer}{o.reference_only && <span className="text-gray-500"> (reference)</span>}</td>
                                <td className="py-0.5 pr-3 tabular-nums text-gray-100">{usd(o.price_cents)}{o.shipping_cents ? <span className="text-gray-500"> incl. {usd(o.shipping_cents)} ship</span> : ""}</td>
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
      <p className="text-[11px] text-gray-500 max-w-4xl">{meta.sources}</p>
    </div>
  );
}
