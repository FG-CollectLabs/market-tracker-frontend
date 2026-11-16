import { useEffect, useState } from "react";
import { addShop, fetchShops, updateShop, type RetailShop } from "../lib/api";
import { Spinner } from "../components/Spinner";

// Shops the sealed watchlist and the MCP shop search check, and what buying
// at each costs on top of the price.

const GAME_LABEL: Record<string, string> = { pokemon: "Pokémon", riftbound: "Riftbound", mtg: "Magic", onepiece: "One Piece", gundam: "Gundam", weiss: "Weiss" };
const dollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

function Row({ s, games, onSaved }: { s: RetailShop; games: string[]; onSaved: () => void }) {
  const [f, setF] = useState({ free: dollars(s.free_ship_min_cents), ship: dollars(s.ship_cents), tax: s.tax_pct == null ? "" : String(+(s.tax_pct * 100).toFixed(3)), note: s.note ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = f.free !== dollars(s.free_ship_min_cents) || f.ship !== dollars(s.ship_cents) ||
    f.tax !== (s.tax_pct == null ? "" : String(+(s.tax_pct * 100).toFixed(3))) || f.note !== (s.note ?? "");
  const save = async (patch: Parameters<typeof updateShop>[1]) => {
    setBusy(true); setErr("");
    try { await updateShop(s.key, patch); onSaved(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const saveCosts = () => save({
    ...(f.free === "" ? { clear_free_ship: true } : { free_ship_min_cents: Math.round(parseFloat(f.free) * 100) }),
    ...(f.ship === "" ? { clear_ship: true } : { ship_cents: Math.round(parseFloat(f.ship) * 100) }),
    ...(f.tax === "" ? { clear_tax: true } : { tax_pct: parseFloat(f.tax) / 100 }),
    note: f.note,
  });
  const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200 w-20 text-right";
  return (
    <tr className={`border-t border-gray-800 align-top ${s.enabled ? "" : "opacity-50"}`}>
      <td className="px-3 py-2">
        <div className="text-gray-100">{s.name}</div>
        {s.domain && <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="text-[11px] text-gray-500 hover:text-indigo-300">{s.domain}</a>}
      </td>
      <td className="px-2 py-2">
        <label className="flex items-center gap-1 text-xs text-gray-300">
          <input type="checkbox" checked={s.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} /> on
        </label>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-400 max-w-[220px]">
          {games.map((g) => (
            <label key={g} className="flex items-center gap-1">
              <input type="checkbox" checked={s.games.includes(g)} disabled={busy}
                onChange={(e) => save({ games: e.target.checked ? [...s.games, g] : s.games.filter((x) => x !== g) })} />
              {GAME_LABEL[g] ?? g}
            </label>
          ))}
        </div>
      </td>
      <td className="px-2 py-2 text-right"><input className={inp} placeholder="none" value={f.free} onChange={(e) => setF({ ...f, free: e.target.value })} /></td>
      <td className="px-2 py-2 text-right"><input className={inp} placeholder="not set" value={f.ship} onChange={(e) => setF({ ...f, ship: e.target.value })} /></td>
      <td className="px-2 py-2 text-right"><input className={inp} placeholder="0" value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={`${inp} w-48 text-left`} placeholder="note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></td>
      <td className="px-2 py-2 whitespace-nowrap">
        <button disabled={!dirty || busy} onClick={saveCosts} className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white disabled:opacity-30">save</button>
        {err && <div className="text-[11px] text-rose-400">{err}</div>}
      </td>
    </tr>
  );
}

export default function ShopsPage() {
  const [d, setD] = useState<{ shops: RetailShop[]; games: string[] } | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState({ name: "", domain: "" });
  const [msg, setMsg] = useState("");
  const load = () => fetchShops().then(setD).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setMsg(""); setErr("");
    try { const r = await addShop(n.name, n.domain, ["pokemon"]); setMsg(`Added (${r.key}).`); setN({ name: "", domain: "" }); load(); } catch (e) { setErr(String(e)); }
  };
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Shops</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          The online shops the Sealed watchlist and the MCP shop search check, and what buying at each costs on top of the price.
          Offers are ranked by landed cost: price + shipping (free at or over the threshold, else the flat rate) + sales tax.
          Leave shipping empty if you don&apos;t know it yet; those offers count no shipping and say so. Only shops whose storefront
          search is public can be checked; shops that refuse automated requests are left out.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!d ? <Spinner /> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Shop</th>
                <th className="px-2 py-2 font-medium">Checked</th>
                <th className="px-2 py-2 font-medium">Games</th>
                <th className="px-2 py-2 font-medium text-right">Free ship at $</th>
                <th className="px-2 py-2 font-medium text-right">Shipping $</th>
                <th className="px-2 py-2 font-medium text-right">Tax %</th>
                <th className="px-2 py-2 font-medium">Note</th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>{d.shops.map((s) => <Row key={s.key + s.updated_at} s={s} games={d.games} onSaved={load} />)}</tbody>
          </table>
        </div>
      )}
      <section className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="text-gray-300">Add a shop:</span>
        <input placeholder="Name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 w-40" />
        <input placeholder="shop.com" value={n.domain} onChange={(e) => setN({ ...n, domain: e.target.value })} className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 w-56" />
        <button onClick={add} disabled={!n.name || !n.domain} className="rounded bg-indigo-600 px-2 py-0.5 text-white disabled:opacity-30">add</button>
        <span className="text-gray-500">checks the shop&apos;s storefront search answers before adding it</span>
        {msg && <span className="text-emerald-300">{msg}</span>}
      </section>
    </div>
  );
}
