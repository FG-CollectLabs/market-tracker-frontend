import { useCallback, useState } from "react";

export interface GamePrefs {
  marketSortKey: "number" | "name" | "market_price" | "lowest_price";
  marketSortDir: "asc" | "desc";
  hiddenRarities: string[];
}

const DEFAULTS: Record<string, GamePrefs> = {
  pokemon: {
    marketSortKey: "market_price",
    marketSortDir: "desc",
    hiddenRarities: ["Common", "Uncommon"],
  },
};

const FALLBACK: GamePrefs = {
  marketSortKey: "number",
  marketSortDir: "asc",
  hiddenRarities: [],
};

const STORAGE_KEY = "fg:market-prefs-v1";

function loadAll(): Record<string, GamePrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GamePrefs>) : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, GamePrefs>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function getGamePrefs(game: string): GamePrefs {
  const stored = loadAll()[game];
  if (stored) return stored;
  return DEFAULTS[game] ?? FALLBACK;
}

export function useGamePrefs(
  game: string,
): [GamePrefs, (p: Partial<GamePrefs>) => void] {
  const [prefs, setPrefs] = useState<GamePrefs>(() => getGamePrefs(game));

  const update = useCallback(
    (p: Partial<GamePrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...p };
        const all = loadAll();
        all[game] = next;
        saveAll(all);
        return next;
      });
    },
    [game],
  );

  return [prefs, update];
}
