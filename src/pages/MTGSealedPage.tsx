import { useEffect, useMemo, useState } from "react";
import { fetchMTGSealedSets, fetchSealedProducts, MTG_SEALED_KINDS, SEALED_KIND_LABEL, type MTGSealedKind, type SealedProduct, type SealedSetChart } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { SEALED_COLORS, pct, usd } from "./SealedTimingPage";

// Magic: The Gathering sealed: every set with collector boosters, its play /
// collector booster boxes, collector omega packs, bundles and loose packs,
// with today's price, the 12-month change and each product's monthly chart
// (PriceCharting).

const tone = (v: number | null | undefined) => (v == null ? "text-gray-600" : v >= 0.15 ? "text-emerald-300" : v >= 0 ? "text-emerald-200/70" : "text-rose-300");

// one product's monthly prices since release, as a small line
function Line({ points, color, w = 260, h = 70 }: { points: { m: number; cents: number }[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return <span className="text-[10px] text-gray-600">not enough history</span>;
  const xs = points.map((p) => p.m), ys = points.map((p) => p.cents);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (m: number) => 4 + ((m - x0) / Math.max(1, x1 - x0)) * (w - 8);
  const Y = (c: number) => h - 4 - ((c - y0) / Math.max(1, y1 - y0)) * (h - 8);
  return (
    <svg width={w} height={h} className="overflow-visible" role="img" aria-label="monthly price">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points.map((p) => `${X(p.m)},${Y(p.cents)}`).join(" ")} />
      <text x={2} y={10} className="fill-gray-500 text-[9px]">{usd(y1)}</text>
      <text x={2} y={h - 2} className="fill-gray-500 text-[9px]">{usd(y0)}</text>
    </svg>
  );
}

export default function MTGSealedPage() {
  const [products, setProducts] = useState<SealedProduct[] | null>(null);
  const [sets, setSets] = useState<SealedSetChart[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<Record<string, boolean>>(Object.fromEntries(MTG_SEALED_KINDS.map((k) => [k, true])));
  useEffect(() => {
    fetchSealedProducts("", "mtg").then((r) => setProducts(r.products)).catch((e) => setErr(String(e)));
    fetchMTGSealedSets().then((r) => setSets(r.sets)).catch(() => { /* charts are optional */ });
  }, []);

  // sets (newest first) × kinds; a kind with several products (two omega
  // packs, say) shows the first and counts the rest
  const grid = useMemo(() => {
    const by = new Map<string, { code: string; name: string; release: string | null; months: number | null; cells: Partial<Record<MTGSealedKind, SealedProduct[]>> }>();
    for (const p of products ?? []) {
      let row = by.get(p.set_code);
      if (!row) by.set(p.set_code, (row = { code: p.set_code, name: p.set_name, release: p.release_date, months: p.months_since_release, cells: {} }));
      (row.cells[p.kind as MTGSealedKind] ??= []).push(p);
    }
    return [...by.values()].sort((a, b) => (b.release ?? "").localeCompare(a.release ?? ""));
  }, [products]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of products ?? []) c[p.kind] = (c[p.kind] ?? 0) + 1;
    return c;
  }, [products]);
  const kinds = MTG_SEALED_KINDS.filter((k) => show[k]);
  const charts = useMemo(() => new Map(sets.map((s) => [s.set_code, s])), [sets]);

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-white">Magic sealed</h1>
        <p className="max-w-4xl text-xs text-gray-400">
          Every Magic set with collector boosters (Throne of Eldraine onward): play and collector booster boxes, collector omega packs,
          play booster bundles and loose play / collector packs, at today&apos;s PriceCharting price with the 12-month change. Open a set for each product&apos;s monthly chart.
          Play boosters started with Murders at Karlov Manor (2024); earlier sets have collector boosters only here.
        </p>
      </header>
      <div className="flex flex-wrap gap-2 text-xs">
        {MTG_SEALED_KINDS.map((k) => (
          <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
            className={`rounded border px-2 py-0.5 ${show[k] ? "border-gray-600 bg-gray-800 text-gray-100" : "border-gray-800 text-gray-500"}`}>
            <span style={{ color: SEALED_COLORS[k] }}>●</span> {SEALED_KIND_LABEL[k]} {counts[k] ?? 0}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!products && !err && <Spinner />}
      {products && products.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400 space-y-1">
          <p>No Magic sealed products yet. They load from three jobs in the Ingest workflow, in order:</p>
          <ol className="list-decimal pl-5 text-xs">
            <li><code>import-mtg-check</code>: lists what each set&apos;s PriceCharting page has (read only); fix any set that finds nothing</li>
            <li><code>import-mtg</code>: loads the sets (Scryfall) and links their PriceCharting pages</li>
            <li><code>import-sealed-mtg</code>: the sealed products and their monthly charts (then monthly on its own)</li>
          </ol>
        </div>
      )}
      {grid.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr>
              <th className="px-3 py-2 font-medium">Set</th>
              {kinds.map((k) => <th key={k} className="px-2 py-2 text-right font-medium"><span style={{ color: SEALED_COLORS[k] }}>●</span> {SEALED_KIND_LABEL[k]}</th>)}
            </tr></thead>
            <tbody>{grid.map((row) => [
              <tr key={row.code} className="border-t border-gray-800 align-top">
                <td className="px-3 py-1.5">
                  <button onClick={() => setOpen((o) => ({ ...o, [row.code]: !o[row.code] }))} className="text-left text-gray-100 hover:text-indigo-300">
                    {row.name} <span className="text-[10px] text-gray-500">{open[row.code] ? "▾" : "▸"}</span>
                  </button>
                  <div className="text-[10px] text-gray-500">{row.code.toUpperCase()}{row.release ? ` · ${row.release.slice(0, 7)}` : ""}{row.months != null ? ` · month ${row.months}` : ""}</div>
                </td>
                {kinds.map((k) => {
                  const ps = row.cells[k];
                  if (!ps?.length) return <td key={k} className="px-2 py-1.5 text-right text-gray-700">–</td>;
                  const p = ps[0];
                  return (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      <a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-100 hover:underline" title={p.name}>{usd(p.latest_cents)}</a>
                      <div className={`text-[10px] ${tone(p.change_12m)}`}>{p.change_12m != null ? `${pct(p.change_12m)} 12m` : `${p.history_months} mo history`}</div>
                      {ps.length > 1 && <div className="text-[10px] text-gray-500">+{ps.length - 1} more</div>}
                    </td>
                  );
                })}
              </tr>,
              open[row.code] && (
                <tr key={`${row.code}-c`} className="bg-gray-950/50">
                  <td colSpan={kinds.length + 1} className="px-3 py-2">
                    <div className="flex flex-wrap gap-4">{(charts.get(row.code)?.products ?? []).filter((p) => show[p.kind]).map((p) => (
                      <div key={p.id} className="space-y-0.5">
                        <div className="text-[11px] text-gray-300"><span style={{ color: SEALED_COLORS[p.kind] }}>●</span> {p.name}</div>
                        <Line points={p.points} color={SEALED_COLORS[p.kind] ?? "#e5e7eb"} />
                      </div>
                    ))}</div>
                    {!charts.get(row.code) && <p className="text-[11px] text-gray-500">No charts yet for this set.</p>}
                  </td>
                </tr>
              ),
            ])}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
