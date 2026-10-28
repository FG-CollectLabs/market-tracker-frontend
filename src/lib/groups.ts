import { CLASS_LABELS, TRAINER_BUCKETS } from "./api";

// Labels for every curve group: rarity tiers, promo classes and the
// Compare-by buckets (poke:a, artist:top, trainer:waifu_s, scarcity:4,
// pull:sir:hard).
const TIERS: Record<string, string> = {
  all: "All tracked", ir: "IR tier", sir: "SIR tier", ultra: "Full art / UR", gold: "Gold / hyper", gallery: "TG / GG", promo: "Promos (untagged)",
};
const SCARCITY: Record<string, string> = { "1": "Most common", "2": "Common", "3": "Scarce", "4": "Scarcest" };
const PULL_TIER: Record<string, string> = { ir: "IR", sir: "SIR", ultra: "Full art", gold: "Gold" };

const LEVEL: Record<string, string> = { easy: "easy", medium: "medium", hard: "hard" };

export function groupLabel(key: string): string {
  if (key.includes("|")) return key.split("|").map(groupLabel).join(" · ");
  if (TIERS[key]) return TIERS[key];
  if (CLASS_LABELS[key]) return CLASS_LABELS[key];
  const [dim, a, b] = key.split(":");
  switch (dim) {
    case "poke": return `Pokémon tier ${a === "top" ? "Top" : a === "unranked" ? "unranked" : a.toUpperCase()}`;
    case "artist": return `Artist tier ${a === "top" ? "Top" : a === "unranked" ? "unranked" : a.toUpperCase()}`;
    case "trainer": return TRAINER_BUCKETS.find((x) => x.key === a)?.label ?? key;
    case "scarcity": return `Scarcity: ${SCARCITY[a] ?? a}`;
    case "pull":
      if (b === undefined) return `${LEVEL[a] ?? a} to pull`; // crossed: "pull:hard"
      return a === "all" ? `${LEVEL[b] ?? b} to pull (any tier)` : `${PULL_TIER[a] ?? a} · ${LEVEL[b] ?? b} to pull`;
    case "gem": return `${a === "low" ? "Low" : a === "high" ? "High" : "Mid"} gem rate`;
    case "chase": return a === "top" ? "Top chase" : "Not the chase";
  }
  return key;
}

export const groupPath = (key: string, grade: string, lang: string) =>
  `/timing/group/${encodeURIComponent(key)}?grade=${encodeURIComponent(grade)}&lang=${encodeURIComponent(lang)}`;
