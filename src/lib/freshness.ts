// How old a weekly value may get before the UI flags it. Every scraper runs
// weekly, so anything older than a week plus a day of slack missed a run.
export const STALE_DAYS = 8;

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ago(iso: string | null | undefined): string {
  const d = daysAgo(iso);
  if (d == null) return "never";
  if (d <= 0) return "today";
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isStale(iso: string | null | undefined): boolean {
  return (daysAgo(iso) ?? 0) > STALE_DAYS;
}

// Newest timestamp in a list, ignoring missing ones.
export function newest(isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const t of isos) if (t && (!best || t > best)) best = t;
  return best;
}
