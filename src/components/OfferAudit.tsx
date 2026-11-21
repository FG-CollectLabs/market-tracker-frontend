import { useEffect, useState } from "react";
import { fetchOfferAudit, setOfferVerdict, SEALED_KIND_LABEL, type OfferAudit as Audit } from "../lib/api";
import { usd } from "../pages/SealedTimingPage";

// The sealed offer audit: what the refresh dropped (another set, a single
// card, a TCGplayer product of another kind), offers far under market waiting
// to be confirmed, and markets that disagree with TCGplayer's.

const REJECT_LABEL: Record<string, string> = {
  "names another set": "named another set",
  "tcgplayer product is another kind": "TCGplayer product was another kind",
  "marked wrong item": "marked wrong item",
};

export default function OfferAudit({ onChange }: { onChange?: () => void }) {
  const [a, setA] = useState<Audit | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const load = () => { fetchOfferAudit().then(setA).catch((e) => setErr(String(e))); };
  useEffect(load, []);
  if (err) return <p className="text-xs text-rose-400">Offer audit: {err}</p>;
  if (!a) return null;
  const todo = a.offers.filter((o) => !done[`${o.product_id} ${o.offer.url}`]);
  const rej = Object.entries(a.rejected_last_refresh);
  const decide = async (pid: number, url: string, v: "ok" | "wrong") => {
    const k = `${pid} ${url}`;
    setDone((d) => ({ ...d, [k]: "…" }));
    try { await setOfferVerdict(pid, url, v); setDone((d) => ({ ...d, [k]: v })); onChange?.(); }
    catch (e) { setDone((d) => { const n = { ...d }; delete n[k]; return n; }); setErr(String(e)); }
  };
  const n = todo.length + a.markets.length;
  return (
    <section className={`rounded-lg border p-4 space-y-2 ${n ? "border-amber-900/70 bg-amber-950/10" : "border-gray-800 bg-gray-900"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-white">Offer audit</h2>
        <span className="text-xs text-gray-400">
          {todo.length} offer{todo.length === 1 ? "" : "s"} to confirm · {a.markets.length} market price{a.markets.length === 1 ? "" : "s"} to check
          {rej.length > 0 && <> · last refresh dropped {rej.map(([k, v]) => `${v} that ${REJECT_LABEL[k] ?? k}`).join(", ")}</>}
        </span>
        {n > 0 && <button onClick={() => setOpen(!open)} className="text-xs text-indigo-300 hover:underline">{open ? "hide" : "review"}</button>}
      </div>
      {open && (
        <>
          {todo.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-gray-500"><tr>
                  <th className="py-1 pr-3 font-medium">Product</th><th className="py-1 pr-3 font-medium">Listing</th>
                  <th className="py-1 pr-3 text-right font-medium">Offer</th><th className="py-1 pr-3 text-right font-medium">Market</th><th className="py-1 font-medium"></th>
                </tr></thead>
                <tbody>{todo.map((o) => {
                  const k = `${o.product_id} ${o.offer.url}`;
                  return (
                    <tr key={k} className="border-t border-gray-800 align-top">
                      <td className="py-1.5 pr-3"><a href={o.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{o.set_name} · {SEALED_KIND_LABEL[o.kind] ?? o.name}</a>
                        <div className="text-[10px] text-gray-500">{[o.on_watchlist && "watchlist", o.on_plan && "plan"].filter(Boolean).join(" · ")}</div></td>
                      <td className="py-1.5 pr-3 max-w-md"><a href={o.offer.url} target="_blank" rel="noreferrer" className="text-gray-300 hover:underline">{o.offer.retailer}: {o.offer.title || "(no title: open the link)"} ↗</a>
                        <div className={`text-[10px] ${o.offer.suspect ? "text-rose-300" : "text-amber-300"}`}>{o.offer.check}</div></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-200">{usd(o.offer.landed_cents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{usd(o.market_cents)}</td>
                      <td className="py-1.5 whitespace-nowrap text-right">
                        {done[k] === "…" ? <span className="text-gray-500">…</span> : <>
                          <button onClick={() => decide(o.product_id, o.offer.url, "ok")} className="rounded border border-emerald-800 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950">It&apos;s this product</button>{" "}
                          <button onClick={() => decide(o.product_id, o.offer.url, "wrong")} className="rounded border border-rose-800 px-2 py-0.5 text-rose-300 hover:bg-rose-950">Wrong item</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          {a.markets.length > 0 && (
            <div>
              <h3 className="mt-2 text-xs font-semibold text-gray-300">Market prices to check</h3>
              <ul className="mt-1 space-y-0.5 text-[11px] text-gray-400">{a.markets.map((m) => (
                <li key={m.product_id}><span className="text-gray-200">{m.set_name} · {SEALED_KIND_LABEL[m.kind] ?? m.name}</span>: {m.why}.{" "}
                  <a href={m.pricecharting_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">PriceCharting ↗</a>
                  {m.tcgplayer_url && <> · <a href={m.tcgplayer_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">TCGplayer ↗</a></>}</li>
              ))}</ul>
            </div>
          )}
          <p className="text-[11px] text-gray-500">{a.method}</p>
        </>
      )}
    </section>
  );
}
