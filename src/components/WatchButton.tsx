import { useEffect, useState } from "react";
import { fetchWatchlist, unwatchCard, watchCard, type BuyTarget, type WatchIntent } from "../lib/api";
import { useSession } from "../lib/auth";

const INTENTS: WatchIntent[] = ["grade", "invest", "flip", "watch"];

export interface Watched {
  intent: WatchIntent;
  targets: BuyTarget[];
  autoFanatics: boolean;
}

// Watched cards, shared by every star and target chip on the page (one fetch).
let cache: Promise<Map<string, Watched>> | null = null;
const listeners = new Set<() => void>();
export function watchedCards(force = false): Promise<Map<string, Watched>> {
  if (!cache || force) {
    cache = fetchWatchlist(true)
      .then((r) => new Map(r.items.map((i) => [i.display_key, { intent: i.intent, targets: i.targets ?? [], autoFanatics: !!i.auto_fanatics }] as [string, Watched])))
      .catch(() => new Map());
  }
  return cache;
}
export function onWatchChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export function watchChanged() {
  cache = null;
  listeners.forEach((f) => f());
}
const changed = watchChanged;

// A star to put a card on the watchlist, with why (grade / invest / flip /
// watch). Only shown when signed in: the watchlist is the buy list.
export default function WatchButton({ displayKey, compact }: { displayKey: string; compact?: boolean }) {
  const session = useSession();
  const [intent, setIntent] = useState<WatchIntent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () => watchedCards().then((m) => live && setIntent(m.get(displayKey)?.intent ?? null));
    load();
    listeners.add(load);
    return () => {
      live = false;
      listeners.delete(load);
    };
  }, [session, displayKey]);

  if (!session) return null;
  const toggle = async (next: WatchIntent | null) => {
    setBusy(true);
    try {
      if (next) await watchCard(displayKey, next);
      else await unwatchCard(displayKey);
      setIntent(next);
      changed();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1 print:hidden">
      <button disabled={busy} onClick={() => toggle(intent ? null : "grade")}
        title={intent ? "On your watchlist: click to remove" : "Add to your watchlist"}
        className={`leading-none ${intent ? "text-yellow-300" : "text-gray-600 hover:text-yellow-300"} ${compact ? "text-sm" : "text-lg"}`}>
        {intent ? "★" : "☆"}
      </button>
      {intent && !compact && (
        <select value={intent} disabled={busy} onChange={(e) => toggle(e.target.value as WatchIntent)}
          className="bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-200">
          {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      )}
    </span>
  );
}
