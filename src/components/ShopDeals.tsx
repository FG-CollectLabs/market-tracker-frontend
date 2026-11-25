import { useEffect, useMemo, useState } from "react";
import { fetchSealedDeals, refreshSealedDeals, watchSealed, type ShopDeal } from "../lib/api";
import { Spinner } from "./Spinner";
import ReturnCell from "./ReturnCell";
import { usd } from "../pages/SealedTimingPage";

// Deals: in-stock sealed items in any shop's whole catalog (not just the
// watched products), 15%+ under the shop's own was price or under our market
// price for the product they match. One place to review fire sales.

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  return h < 1 ? "just now" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};
const off = (v?: number | null) => (v == null || v <= 0 ? "" : `${Math.round(v * 100)}% off`);

// Categories filtered out, remembered in this browser.
const HIDDEN_KEY = "sealed.deals.hidden_categories";
const loadHidden = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as string[]); } catch { return new Set(); }
};
const saveHidden = (s: Set<string>) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s])); } catch { /* private window */ } };

export default function ShopDeals({ onWatched }: { onWatched?: () => void }) {
  const [game, setGame] = useState("");
  const [minOff, setMinOff] = useState(0.15);
  const [suspect, setSuspect] = useState(false);
  const [shop, setShop] = useState("");
  const [sort, setSort] = useState<"off" | "return" | "gain">("off");
  const [d, setD] = useState<{ deals: ShopDeal[]; last_refresh: string | null; method: string; categories?: { key: string; label: string }[] } | null>(null);
  const [hidden, setHiddenState] = useState<Set<string>>(loadHidden);
  const setHidden = (s: Set<string>) => { setHiddenState(s); saveHidden(s); };
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setD(null);
    fetchSealedDeals({ game, minOff, suspect }).then(setD).catch((e) => setErr(String(e)));
  }, [game, minOff, suspect]);
  const shops = useMemo(() => [...new Set((d?.deals ?? []).map((x) => x.shop_name))].sort(), [d]);
  const byShop = useMemo(() => (d?.deals ?? []).filter((x) => !shop || x.shop_name === shop), [d, shop]);
  const catCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of byShop) m.set(x.category ?? "other", (m.get(x.category ?? "other") ?? 0) + 1);
    return m;
  }, [byShop]);
  const cats = (d?.categories ?? []).filter((c) => catCount.has(c.key) || hidden.has(c.key));
  const rows = useMemo(() => {
    const out = byShop.filter((x) => !hidden.has(x.category ?? "other"));
    if (sort === "off") return out; // the server's order: biggest discount first
    const v = (x: ShopDeal) => (sort === "return" ? x.returns?.irr_at_offer : x.returns?.irr_gain_pts) ?? -Infinity;
    return [...out].sort((a, b) => v(b) - v(a));
  }, [byShop, hidden, sort]);
  const toggle = (k: string) => { const s = new Set(hidden); if (s.has(k)) s.delete(k); else s.add(k); setHidden(s); };
  // only: show just this category (alt-click a chip)
  const only = (k: string) => setHidden(new Set((d?.categories ?? []).map((c) => c.key).filter((c) => c !== k)));
  const refresh = async () => {
    setMsg("");
    try { const r = await refreshSealedDeals(); setMsg(`Scan queued (job ${r.job_id}): every shop's catalog, ~20-30 minutes.`); } catch (e) { setErr(String(e)); }
  };
  const watch = async (x: ShopDeal) => {
    if (!x.product_id) return;
    try { await watchSealed(x.product_id, null, `deal: ${x.shop_name}`); setDone((m) => ({ ...m, [x.id]: true })); onWatched?.(); } catch (e) { setErr(String(e)); }
  };
  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-200";

  return (
    <section className="rounded-lg border border-emerald-900/60 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-white">Deals</h2>
        <span className="text-xs text-gray-400">any shop&apos;s catalog, beyond your watched products · last scan {ago(d?.last_refresh ?? null)} · daily</span>
        <button onClick={refresh} className="ml-auto rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:text-white">Scan now</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={game} onChange={(e) => setGame(e.target.value)} className={sel}>
          <option value="">Pokémon + Magic</option><option value="pokemon">Pokémon</option><option value="mtg">Magic</option>
        </select>
        <select value={minOff} onChange={(e) => setMinOff(parseFloat(e.target.value))} className={sel}>
          {[0.15, 0.2, 0.3, 0.4].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%+ off</option>)}
        </select>
        <select value={shop} onChange={(e) => setShop(e.target.value)} className={sel}>
          <option value="">every shop</option>{shops.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={sel} title="Return: held to the sealed plan's exit, at this deal's landed price">
          <option value="off">biggest discount</option><option value="return">best return / yr</option><option value="gain">most return the discount adds</option>
        </select>
        <label className="flex items-center gap-1 text-gray-400" title="60%+ under market: usually a different product (a pack, a single, another set)">
          <input type="checkbox" checked={suspect} onChange={(e) => setSuspect(e.target.checked)} /> show suspect
        </label>
        {msg && <span className="text-emerald-300">{msg}</span>}
      </div>
      {cats.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Categories">
          <span className="text-gray-500 mr-0.5" title="Click to filter a category in or out; alt-click (or double-click) to show only it. Remembered in this browser.">Categories</span>
          {cats.map((c) => {
            const on = !hidden.has(c.key);
            return (
              <button key={c.key} type="button" aria-pressed={on}
                onClick={(e) => (e.altKey ? only(c.key) : toggle(c.key))} onDoubleClick={() => only(c.key)}
                title={on ? `Hide ${c.label} (alt-click: only this)` : `Show ${c.label}`}
                className={`rounded-full border px-2 py-0.5 ${on ? "border-emerald-800 bg-emerald-950/50 text-emerald-200" : "border-gray-800 text-gray-500 line-through"}`}>
                {c.label} <span className="tabular-nums text-gray-400">{catCount.get(c.key) ?? 0}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setHidden(new Set())} className="ml-1 text-gray-400 hover:text-white">all</button>
          <span className="text-gray-700">·</span>
          <button type="button" onClick={() => setHidden(new Set((d?.categories ?? []).map((c) => c.key)))} className="text-gray-400 hover:text-white">none</button>
          {hidden.size > 0 && <span className="text-gray-500">· {byShop.length - rows.length} hidden</span>}
        </div>
      )}
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!d && !err && <Spinner />}
      {d && (rows.length === 0 ? <p className="text-xs text-gray-500">No deals at this cut. The first scan runs daily at 12:00 UTC, or press Scan now.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr>
              <th className="py-1 pr-3 font-medium">Item</th><th className="py-1 pr-3 font-medium">Shop</th>
              <th className="py-1 pr-3 text-right font-medium" title="price; landed = with the shop's shipping and tax settings">Price</th>
              <th className="py-1 pr-3 text-right font-medium" title="our market price for the matched product (PriceCharting)">Market</th>
              <th className="py-1 pr-3 text-right font-medium">Deal</th>
              <th className="py-1 pr-3 text-right font-medium" title="A year, held to the sealed plan's exit (12 months after rotation, else the projected best month) and sold net of fees: bought at market → at this deal, and the points the discount adds. Below: the same with the whole market flat. Matched products only.">Return / yr</th>
              <th className="py-1 font-medium"></th>
            </tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.id} className={`border-t border-gray-800 align-top ${x.suspect ? "opacity-60" : ""}`}>
                <td className="py-1.5 pr-3 max-w-md">
                  <a href={x.url} target="_blank" rel="noreferrer" className="text-gray-100 hover:text-indigo-300">{x.title} ↗</a>
                  <div className="text-[10px] text-gray-500">{x.product ? `matches ${x.product}` : "not in our catalog: the shop's own markdown"}{x.suspect ? " · suspect: likely another product" : ""}</div>
                </td>
                <td className="py-1.5 pr-3 text-gray-300 whitespace-nowrap">{x.shop_name}<div className="text-[10px] text-gray-500">seen {ago(x.first_seen)}</div></td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-100">{usd(x.price_cents)}
                  <div className="text-[10px] text-gray-500">{x.landed_cents !== x.price_cents ? `${usd(x.landed_cents)} landed` : x.free_ship_assumed ? `free ship at ${usd(x.free_ship_min_cents ?? 0)}+` : x.shipping_known ? "free ship" : "+ ship?"}</div></td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{x.market_cents ? usd(x.market_cents) : "–"}
                  {x.was_cents ? <div className="text-[10px] text-gray-500">was {usd(x.was_cents)}</div> : null}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">
                  {x.market_off > 0 && <div className="text-emerald-300" title="price under market">{off(x.landed_off ?? x.market_off)} market</div>}
                  {x.was_off > 0 && <div className="text-sky-300" title="the shop's own markdown">{off(x.was_off)} shop sale</div>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{x.product_id ? <ReturnCell x={x.returns} /> : <span className="text-gray-600" title="Not matched to a catalog product: no price history to project">–</span>}</td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {x.product_id && (x.watched || done[x.id] ? <span className="text-emerald-400">watched</span>
                    : <button onClick={() => watch(x)} className="rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:text-white">Watch</button>)}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {d && <p className="text-[11px] text-gray-500">{d.method}</p>}
    </section>
  );
}
