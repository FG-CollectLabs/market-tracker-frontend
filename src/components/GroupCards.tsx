import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGroupCards, type GroupCard } from "../lib/api";
import { cardThumb } from "../lib/thumb";
import WatchButton from "./WatchButton";

const pct = (v?: number) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);
const share = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const usd = (c?: number) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const PAGE = 40;

type Sort = "price" | "release" | "peak" | "year" | "packs" | "gem";

// The cards in one curve group, with a watch button each.
export default function GroupCards({ category, label, grade, lang, onClose }: { category: string; label: string; grade: string; lang: string; onClose?: () => void }) {
  const [cards, setCards] = useState<GroupCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("price");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const g = grade === "psa-10" ? "psa-10" : "raw";

  useEffect(() => {
    setCards(null);
    setError(null);
    setShown(PAGE);
    fetchGroupCards(category, g, lang).then((r) => setCards(r.cards)).catch((e: Error) => setError(e.message));
  }, [category, g, lang]);

  const list = useMemo(() => {
    const f = q.trim().toLowerCase();
    const xs = (cards ?? []).filter((c) => !f || `${c.name} ${c.number} ${c.set_name}`.toLowerCase().includes(f));
    const key = (c: GroupCard) => (sort === "price" ? -(c.price_cents ?? -1) : sort === "release" ? c.now_vs_release ?? 99 : sort === "peak" ? c.now_vs_peak ?? 99
      : sort === "packs" ? -(c.packs_per_copy ?? -1) : sort === "gem" ? c.gem_rate ?? 99 : -(c.trailing_12m ?? -99));
    return [...xs].sort((a, b) => key(a) - key(b));
  }, [cards, q, sort]);

  return (
    <div className="rounded border border-gray-700 bg-gray-950/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sm font-semibold text-gray-100">{label}</span>
        <span className="text-gray-500">{cards ? `${cards.length} cards` : "…"} · {g === "raw" ? "raw" : "PSA 10"} prices</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="ml-auto bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 w-40" />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
          <option value="price">Dearest</option>
          <option value="release">Lowest vs release</option>
          <option value="peak">Furthest under its high</option>
          <option value="year">Best last year</option>
          <option value="packs">Hardest to pull</option>
          <option value="gem">Lowest gem rate</option>
        </select>
        {onClose && <button onClick={onClose} className="text-gray-500 hover:text-gray-200">Close</button>}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {cards && (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-2 font-medium" colSpan={2}>Card</th>
              <th className="text-right py-1 px-2 font-medium">Month</th>
              <th className="text-right py-1 px-2 font-medium">Price</th>
              <th className="text-right py-1 px-2 font-medium" title="Today ÷ its price in the first two months">Of release</th>
              <th className="text-right py-1 px-2 font-medium" title="Today ÷ its highest monthly price">Of high</th>
              <th className="text-right py-1 px-2 font-medium" title="Change over the last ~12 months">Last year</th>
              <th className="text-right py-1 px-2 font-medium" title="Packs to open to pull this exact card: packs per card of its rarity × cards of that rarity in the set (measured pull rates; ~ = the era's estimate). Easy / medium / hard against its tier's sets in its language">Packs to pull</th>
              <th className="text-right py-1 px-2 font-medium" title="PSA gem rate: 10s ÷ all PSA-graded copies (cards with 50+ graded)">Gem rate</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300">
            {list.slice(0, shown).map((c) => (
              <tr key={c.display_key}>
                <td className="py-1 pr-2 w-8">{c.image_url && <img src={cardThumb(c.image_url)} alt="" loading="lazy" className="w-7 h-10 object-cover rounded-sm" />}</td>
                <td className="py-1 pr-2">
                  <Link to={`/cards/${encodeURIComponent(c.display_key)}`} className="text-gray-100 hover:text-indigo-300">{c.name}</Link>
                  <div className="text-gray-500">#{c.number} · {c.set_name}{c.lang !== "en" ? ` · ${c.lang.toUpperCase()}` : ""}</div>
                </td>
                <td className="py-1 px-2 text-right">M{c.months_since_release}</td>
                <td className="py-1 px-2 text-right">{usd(c.price_cents)}</td>
                <td className="py-1 px-2 text-right">{share(c.now_vs_release)}</td>
                <td className="py-1 px-2 text-right">{share(c.now_vs_peak)}</td>
                <td className={`py-1 px-2 text-right ${c.trailing_12m == null ? "" : c.trailing_12m > 0 ? "text-green-400" : "text-red-400"}`}>{pct(c.trailing_12m)}</td>
                <td className="py-1 px-2 text-right whitespace-nowrap">
                  {c.packs_per_copy != null ? `${c.packs_estimated ? "~" : ""}${Math.round(c.packs_per_copy).toLocaleString()}` : "—"}
                  {c.pull_level && <div className={`text-[10px] ${c.pull_level === "hard" ? "text-amber-300" : c.pull_level === "easy" ? "text-sky-300" : "text-gray-500"}`}>{c.pull_level}</div>}
                </td>
                <td className="py-1 px-2 text-right">{share(c.gem_rate)}</td>
                <td className="py-1 pl-2 text-right"><WatchButton displayKey={c.display_key} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > shown && (
        <button onClick={() => setShown(shown + PAGE)} className="text-xs text-indigo-300 hover:text-indigo-200">Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</button>
      )}
    </div>
  );
}
