import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWatchlist, type WatchItem, type WatchIntent } from "../lib/api";
import { useSession } from "../lib/auth";
import { STANCE } from "../components/BuyingGuide";
import { cardThumb } from "../lib/thumb";
import { Spinner, ErrorMsg } from "../components/Spinner";

const usd = (c?: number) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const INTENT_LABEL: Record<WatchIntent, string> = { grade: "Grade", invest: "Invest", flip: "Flip", watch: "Watch" };

// The buy list, by set, with the prices to buy by. Prints cleanly
// (Ctrl+P / the Print button): one table per set, no nav.
export default function WatchlistPage() {
  const session = useSession();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<WatchIntent | "">("");

  useEffect(() => {
    if (!session) return;
    fetchWatchlist().then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, [session]);

  const bySet = useMemo(() => {
    const m = new Map<string, { name: string; code: string; items: WatchItem[] }>();
    for (const it of items ?? []) {
      if (intent && it.intent !== intent) continue;
      const g = m.get(it.set_code) ?? { name: it.set_name, code: it.set_code, items: [] };
      g.items.push(it);
      m.set(it.set_code, g);
    }
    return [...m.values()];
  }, [items, intent]);

  if (!session) return <p className="text-sm text-gray-400">Sign in with Google to see your watchlist.</p>;
  if (error) return <ErrorMsg msg={error} />;
  if (!items) return <Spinner />;

  return (
    <div className="space-y-5 print:space-y-3 print:text-black">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white print:text-black">Watchlist</h1>
          <p className="text-sm text-gray-500">
            {items.length} cards, by set. Buy-by prices assume you grade as well as the general public (published gem rates).
            Printed {new Date().toLocaleDateString()}.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <select value={intent} onChange={(e) => setIntent(e.target.value as WatchIntent | "")}
            className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
            <option value="">Every intent</option>
            {(Object.keys(INTENT_LABEL) as WatchIntent[]).map((k) => <option key={k} value={k}>{INTENT_LABEL[k]}</option>)}
          </select>
          <button onClick={() => window.print()} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500">Print</button>
        </div>
      </div>
      {items.length === 0 && <p className="text-sm text-gray-500">Star cards on a set page or a card page to add them.</p>}
      {bySet.map((g) => (
        <section key={g.code} className="rounded-lg border border-gray-800 bg-gray-900 p-3 break-inside-avoid print:border-gray-300 print:bg-white">
          <h2 className="text-sm font-semibold text-gray-100 print:text-black mb-2">
            {g.name} <span className="text-gray-500 font-mono text-xs">{g.code.replace(/^jp-/, "JP ").toUpperCase()}</span>
          </h2>
          <table className="w-full text-xs tabular-nums">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1 pr-2 font-medium" colSpan={2}>Card</th>
                <th className="text-left py-1 pr-2 font-medium">Why</th>
                <th className="text-left py-1 pr-2 font-medium">Play</th>
                <th className="text-right py-1 pr-2 font-medium">Raw now</th>
                <th className="text-right py-1 pr-2 font-medium" title="Expected raw low (release curve)">Exp. low</th>
                <th className="text-right py-1 pr-2 font-medium" title="Most to pay raw to grade (your return bar)">Grade ≤</th>
                <th className="text-right py-1 pr-2 font-medium" title="Grading nets $0 at this raw price: never pay more">Break-even</th>
                <th className="text-right py-1 pr-2 font-medium">PSA 10</th>
                <th className="text-right py-1 pr-2 font-medium" title="PSA 10 auction ceiling (hammer)">10 bid ≤</th>
                <th className="text-right py-1 font-medium" title="Similar cards' yearly appreciation after fees (PSA 10)">Held/yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 print:divide-gray-200 text-gray-300 print:text-black">
              {g.items.map((it) => {
                const p = it.play;
                const over = p?.raw_cents != null && p.break_even_cents != null && p.raw_cents >= p.break_even_cents;
                return (
                  <tr key={it.display_key} className="align-top">
                    <td className="py-1.5 pr-2 w-9">
                      {it.image_url && <img src={cardThumb(it.image_url)} alt="" className="w-8 h-11 object-cover rounded-sm print:hidden" loading="lazy" />}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Link to={`/cards/${encodeURIComponent(it.display_key)}`} className="text-gray-100 hover:text-indigo-300 print:text-black">{it.name}</Link>
                      <div className="text-gray-500">#{it.number}</div>
                      {it.note && <div className="text-gray-400 italic">{it.note}</div>}
                    </td>
                    <td className="py-1.5 pr-2">
                      {INTENT_LABEL[it.intent]}
                      {it.targets && it.targets.length > 0 && (
                        <div className="text-[11px] text-yellow-300/90">
                          buy as {it.targets.map((t) => ({ raw: "raw", "psa-10": "PSA 10", "cgc-10": "CGC 10" })[t]).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 max-w-xs">
                      {p && <span className={`px-1 rounded border text-[10px] mr-1 ${STANCE[p.stance].cls}`}>{STANCE[p.stance].label}</span>}
                      <span className="text-gray-400 print:text-black">{p?.headline}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{usd(p?.raw_cents)}</td>
                    <td className="py-1.5 pr-2 text-right">{usd(p?.bottom_cents)}</td>
                    <td className="py-1.5 pr-2 text-right font-medium">{usd(p?.target_cents)}</td>
                    <td className={`py-1.5 pr-2 text-right ${over ? "text-red-400" : ""}`}>{usd(p?.break_even_cents)}</td>
                    <td className="py-1.5 pr-2 text-right">{usd(it.psa10_cents)}</td>
                    <td className="py-1.5 pr-2 text-right">{usd(p?.bid_cents)}</td>
                    <td className="py-1.5 text-right">{p?.projection != null ? `${p.projection >= 0 ? "+" : ""}${Math.round(p.projection * 100)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
