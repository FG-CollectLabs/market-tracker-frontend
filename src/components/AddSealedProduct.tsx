import { useEffect, useMemo, useState } from "react";
import { fetchSealedProducts, watchSealed, SEALED_KIND_LABEL, type SealedProduct } from "../lib/api";
import { usd } from "../pages/SealedTimingPage";

// Search every sealed product in the catalog (Build & Battle, collections,
// tins: not just the plan's kinds) and add it to the watchlist, with an
// optional price to buy below.

export default function AddSealedProduct({ watched, onAdded }: { watched: Set<number>; onAdded: () => void }) {
  const [all, setAll] = useState<SealedProduct[] | null>(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  useEffect(() => { fetchSealedProducts().then((r) => setAll(r.products)).catch((e) => setErr(String(e))); }, []);

  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!all || words.length === 0) return [];
    return all.filter((p) => {
      const hay = `${p.set_name} ${p.set_code} ${SEALED_KIND_LABEL[p.kind] ?? p.kind} ${p.name} ${p.variant ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 15);
  }, [all, q]);

  const add = async (p: SealedProduct) => {
    setErr("");
    setBusy((b) => ({ ...b, [p.id]: "…" }));
    try {
      const t = target[p.id] ? Math.round(parseFloat(target[p.id]) * 100) : null;
      await watchSealed(p.id, t && t > 0 ? t : null, "added by hand");
      setBusy((b) => ({ ...b, [p.id]: "added" }));
      onAdded();
    } catch (e) {
      setBusy((b) => { const n = { ...b }; delete n[p.id]; return n; });
      setErr(String(e));
    }
  };

  const inp = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">Add a product</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: set, product type or name (e.g. surging sparks build battle, 151 upc)"
          className={`${inp} w-full sm:w-[28rem]`} />
        {!all && !err && <span className="text-xs text-gray-500">loading the catalog…</span>}
        {all && q && <span className="text-xs text-gray-500">{hits.length === 15 ? "first 15 matches" : `${hits.length} match${hits.length === 1 ? "" : "es"}`}</span>}
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-gray-800 text-xs">{hits.map((p) => {
          const on = watched.has(p.id) || busy[p.id] === "added";
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-gray-200 hover:text-indigo-300">
                {p.set_name} · {SEALED_KIND_LABEL[p.kind] ?? p.kind}{p.variant ? ` · ${p.variant}` : ""}
                <span className="ml-2 text-[10px] text-gray-500">{p.name}</span>
              </a>
              <span className="tabular-nums text-gray-400">{p.latest_cents != null ? usd(p.latest_cents) : "no price"}</span>
              {on ? <span className="text-emerald-400">watched</span> : <>
                <input value={target[p.id] ?? ""} onChange={(e) => setTarget((t) => ({ ...t, [p.id]: e.target.value }))} placeholder="buy below $ (optional)"
                  className={`${inp} w-36`} inputMode="decimal" />
                <button onClick={() => add(p)} disabled={busy[p.id] === "…"} className="rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500 disabled:opacity-50">
                  {busy[p.id] === "…" ? "…" : "Watch"}
                </button>
              </>}
            </li>
          );
        })}</ul>
      )}
    </section>
  );
}
