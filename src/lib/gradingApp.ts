// The grading predictor (grading-predictor-frontend / -backend) owns graded
// copies, their grades and photos for the centering backtest. The market
// tracker only links to its intake page and reads its public copy counts;
// it never stores photos and never sends a token.

export const GRADING_URL = (import.meta.env.VITE_GRADING_URL as string | undefined) ?? "https://grading.futuregadgetlabs.com";
export const GRADING_API_URL = (import.meta.env.VITE_GRADING_API_URL as string | undefined) ?? "https://grading-api.futuregadgetlabs.com";

export interface IntakeCard {
  display_key: string;
  name: string;
  set_name?: string;
  set_code?: string; // pokemontcg.io-style when known (sv3pt5), else ours
  number: string;
  image_url?: string | null;
}

// pokemontcg.io set code from a TCGdex card id: "sv03.5-199" -> "sv3pt5",
// "me01-005" -> "me1", "swsh12.5-160" -> "swsh12pt5". Undefined when the id
// doesn't look like a modern series code (older sets differ between the two).
export function ptcgioSetCode(tcgdexId?: unknown): string | undefined {
  if (typeof tcgdexId !== "string") return undefined;
  const set = tcgdexId.slice(0, tcgdexId.lastIndexOf("-"));
  const m = /^(sv|swsh|me)0*(\d+)(?:\.(\d+))?$/.exec(set);
  if (!m) return undefined;
  return `${m[1]}${m[2]}${m[3] ? `pt${m[3]}` : ""}`;
}

// The intake page for a card, filled in from the market tracker's card.
export function gradingIntakeUrl(c: IntakeCard): string {
  const q = new URLSearchParams({ display_key: c.display_key, name: c.name, number: c.number });
  if (c.set_name) q.set("set_name", c.set_name);
  if (c.set_code) q.set("set_code", c.set_code);
  if (c.image_url) q.set("image_url", c.image_url);
  return `${GRADING_URL}/#/intake?${q.toString()}`;
}

export interface GradedCopies {
  card_id: string;
  copies: number;
  both_photos: number; // usable for the backtest: front and back photographed
  by_grade: { grader: string; grade: string | null; grade_label: "pristine" | "black_label" | null; copies: number; both_photos: number }[];
}

// The copies collected for a card: null when none yet (the predictor has no
// card for it: 404). Throws when the grading API can't be reached.
export async function fetchGradedCopies(displayKey: string): Promise<GradedCopies | null> {
  const card = await fetch(`${GRADING_API_URL}/v1/cards/by-market-key?key=${encodeURIComponent(displayKey)}`);
  if (card.status === 404) return null;
  if (!card.ok) throw new Error(`grading API ${card.status}`);
  const { id } = (await card.json()) as { id: string };
  const res = await fetch(`${GRADING_API_URL}/v1/cards/${encodeURIComponent(id)}/copies`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`grading API ${res.status}`);
  return (await res.json()) as GradedCopies;
}

export function gradeLabel(g: GradedCopies["by_grade"][number]): string {
  if (g.grade == null) return "Raw";
  const label = g.grade_label === "pristine" ? " Pristine" : g.grade_label === "black_label" ? " Black Label" : "";
  return `${g.grader.toUpperCase()} ${g.grade}${label}`;
}
