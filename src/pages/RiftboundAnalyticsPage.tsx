import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRiftboundCards, fetchRiftboundSets, type RbCard, type RbSet } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { KindBadge, KindTable } from "./RiftboundPage";

// Riftbound analytics, kept apart from Pokémon's: no Pokémon timing rules
// (release windows, tiers) are assumed to carry over. For now: price by
// card type across sets, and the biggest movers on TCGplayer.

const usd = (c: number | null) => (c == null ? "—" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);

function change(now: number | null, then: number | null) {
  return now != null && then != null && then > 0 ? (now - then) / then : null;
}

export default function RiftboundAnalyticsPage() {
  const [sets, setSets] = useState<RbSet[] | null>(null);
  const [cards, setCards] = useState<RbCard[] | null>(null);
  const [span, setSpan] = useState<"4w" | "12w">("4w");
  const [minPrice, setMinPrice] = useState(10);

  useEffect(() => {
    fetchRiftboundSets().then((r) => setSets(r.sets)).catch(() => setSets([]));
    fetchRiftboundCards().then((r) => setCards(r.cards)).catch(() => setCards([]));
  }, []);

  const movers = useMemo(() => {
    if (!cards) return { up: [], down: [] };
    const list = cards
      .map((c) => ({ c, chg: change(c.market_cents, span === "4w" ? c.cents_4w_ago : c.cents_12w_ago) }))
      .filter((x): x is { c: RbCard; chg: number } => x.chg != null && (x.c.market_cents ?? 0) >= minPrice * 100);
    list.sort((a, b) => b.chg - a.chg);
    return { up: list.slice(0, 15), down: list.slice(-15).reverse() };
  }, [cards, span, minPrice]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound analytics</h1>
        <p className="text-sm text-gray-400">
          Separate from Pokémon's: buy timing and tiers aren't assumed to work the same way. Release curves come next, once the
          price history has been checked against Riftbound's release cadence.
        </p>
      </header>
      {!sets ? <Spinner /> : <KindTable sets={sets.filter((s) => s.kind === "main")} />}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-gray-300">Biggest moves (TCGplayer market)</h2>
          <div className="flex gap-1 text-xs">
            {(["4w", "12w"] as const).map((s) => (
              <button key={s} onClick={() => setSpan(s)}
                className={`px-2 py-1 rounded ${span === s ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400"}`}>{s === "4w" ? "4 weeks" : "12 weeks"}</button>
            ))}
          </div>
          <label className="text-xs text-gray-400 flex items-center gap-1">Cards over $
            <input type="number" min={0} value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))}
              className="w-16 bg-gray-900 border border-gray-800 rounded px-1 py-0.5 text-gray-200" />
          </label>
        </div>
        {!cards ? <Spinner /> : (
          <div className="grid md:grid-cols-2 gap-4">
            <MoverList title="Up" rows={movers.up} />
            <MoverList title="Down" rows={movers.down} />
          </div>
        )}
      </section>
    </div>
  );
}

function MoverList({ title, rows }: { title: string; rows: { c: RbCard; chg: number }[] }) {
  return (
    <div className="rounded-lg border border-gray-800">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-800">{title}</div>
      {rows.length === 0 && <div className="px-3 py-3 text-xs text-gray-600">Nothing yet.</div>}
      {rows.map(({ c, chg }) => (
        <div key={c.display_key} className="flex items-center gap-2 px-3 py-1.5 text-sm border-t border-gray-900">
          <KindBadge kind={c.kind} />
          <Link to={`/cards/${c.display_key}`} className="text-gray-200 hover:text-white truncate flex-1">{c.name}</Link>
          <span className="text-xs text-gray-500 uppercase">{c.set_code}</span>
          <span className="tabular-nums text-gray-300 w-20 text-right">{usd(c.market_cents)}</span>
          <span className={`tabular-nums w-14 text-right ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{chg >= 0 ? "+" : ""}{Math.round(chg * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
