const GAME_COLORS: Record<string, string> = {
  mtg: "bg-orange-900/60 text-orange-300",
  pokemon: "bg-yellow-900/60 text-yellow-300",
  lorcana: "bg-blue-900/60 text-blue-300",
  one_piece: "bg-red-900/60 text-red-300",
  yugioh: "bg-purple-900/60 text-purple-300",
  other: "bg-gray-800 text-gray-400",
};

const GAME_LABELS: Record<string, string> = {
  mtg: "MTG",
  pokemon: "Pokémon",
  lorcana: "Lorcana",
  one_piece: "One Piece",
  yugioh: "Yu-Gi-Oh",
  other: "Other",
};

export function GameBadge({ game }: { game: string }) {
  const cls = GAME_COLORS[game] ?? GAME_COLORS.other;
  const label = GAME_LABELS[game] ?? game;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
