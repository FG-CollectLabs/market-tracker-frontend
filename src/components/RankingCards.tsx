import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRankingCards, type RankingCard } from "../lib/api";
import { cardThumb } from "../lib/thumb";
import WatchButton from "./WatchButton";

const usd = (c?: number) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

// The tracked cards behind one Rankings entry, dearest first.
export default function RankingCards({ kind, name }: { kind: "pokemon" | "artist" | "trainer"; name: string }) {
  const [cards, setCards] = useState<RankingCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCards(null);
    setError(null);
    fetchRankingCards(kind, name).then((r) => setCards(r.cards)).catch((e: Error) => setError(e.message));
  }, [kind, name]);
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!cards) return <p className="text-xs text-gray-500">Loading cards…</p>;
  if (cards.length === 0) return <p className="text-xs text-gray-500">No tracked cards.</p>;
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-xs tabular-nums">
        <tbody className="divide-y divide-gray-800 text-gray-300">
          {cards.map((c) => (
            <tr key={c.display_key}>
              <td className="py-1 pr-2 w-8">{c.image_url && <img src={cardThumb(c.image_url)} alt="" loading="lazy" className="w-7 h-10 object-cover rounded-sm" />}</td>
              <td className="py-1 pr-2">
                <Link to={`/cards/${encodeURIComponent(c.display_key)}`} className="text-gray-100 hover:text-indigo-300">{c.name}</Link>
                <div className="text-gray-500">#{c.number} · {c.set_name}{c.rarity ? ` · ${c.rarity}` : ""}{kind !== "artist" && c.artist ? ` · ${c.artist}` : ""}</div>
              </td>
              <td className="py-1 px-2 text-right">{usd(c.raw_cents)}<div className="text-[10px] text-gray-500">raw</div></td>
              <td className="py-1 pl-2 text-right"><WatchButton displayKey={c.display_key} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
