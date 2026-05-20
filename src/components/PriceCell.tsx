import { formatCents } from "../lib/roi";

interface Props {
  cents: number | null | undefined;
  className?: string;
}

export function PriceCell({ cents, className = "" }: Props) {
  if (cents == null) {
    return <span className={`text-gray-600 ${className}`}>—</span>;
  }
  return (
    <span className={`tabular-nums font-mono ${className}`}>
      {formatCents(cents)}
    </span>
  );
}

export function SellthroughBadge({ ratio }: { ratio: number | null | undefined }) {
  if (ratio == null) return <span className="text-gray-600">—</span>;
  const pct = ratio * 100;
  const color =
    pct >= 20 ? "text-green-400" : pct >= 8 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`tabular-nums font-mono text-xs ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    tcgplayer: "bg-blue-900/60 text-blue-300",
    ebay: "bg-yellow-900/60 text-yellow-300",
    manapool: "bg-green-900/60 text-green-300",
    pricecharting: "bg-purple-900/60 text-purple-300",
    retailer: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${colors[source] ?? "bg-gray-800 text-gray-400"}`}>
      {source}
    </span>
  );
}
