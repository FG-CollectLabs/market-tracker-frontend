// Where a price sits against the card's release price and its expected
// bottom: "36% of release · at the low". Green inside or under the tier's
// typical low band, amber within 15% above it.

export interface ReleaseFacts {
  release_cents?: number;
  release_estimated?: boolean;
  now_vs_release?: number; // today ÷ release
  now_vs_bottom?: number; // today ÷ expected bottom − 1
  low_range?: [number, number]; // the tier's typical low ÷ release, middle half
  bottom_cents?: number; // expected bottom
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;

export function releaseTone(f: ReleaseFacts): string {
  const r = f.now_vs_release, hi = f.low_range?.[1];
  if (r == null) return "text-gray-400";
  if (hi != null && r <= hi) return "text-green-400";
  if (hi != null && r <= hi * 1.15) return "text-amber-300";
  if (f.now_vs_bottom != null && f.now_vs_bottom <= 0.05) return "text-green-400";
  return "text-gray-400";
}

export function releaseTitle(f: ReleaseFacts): string {
  const parts: string[] = [];
  if (f.release_cents != null)
    parts.push(f.release_estimated
      ? `Release ~${money(f.release_cents)} (estimated: today's price carried back along the release curve)`
      : `Release ${money(f.release_cents)} (its price in the first two months)`);
  if (f.low_range) parts.push(`Cards like it typically bottom at ${pc(f.low_range[0])}–${pc(f.low_range[1])} of release`);
  if (f.bottom_cents != null) parts.push(`Expected bottom ${money(f.bottom_cents)}`);
  return parts.join(". ");
}

export function bottomText(v?: number): string | null {
  if (v == null) return null;
  if (Math.abs(v) <= 0.03) return "at the low";
  return v < 0 ? `${pc(-v)} under the low` : `+${pc(v)} vs low`;
}

export default function ReleaseVs({ f, className = "" }: { f: ReleaseFacts; className?: string }) {
  if (f.now_vs_release == null && f.now_vs_bottom == null) return null;
  const b = bottomText(f.now_vs_bottom);
  return (
    <span className={`tabular-nums ${releaseTone(f)} ${className}`} title={releaseTitle(f)}>
      {f.now_vs_release != null && <>{f.release_estimated ? "~" : ""}{pc(f.now_vs_release)} of release</>}
      {f.now_vs_release != null && b && " · "}
      {b}
    </span>
  );
}
