import { useState } from "react";
import type { BidSuggestion } from "../lib/api";

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // clipboard blocked
  }
}

// eBay item number from a Browse listing id ("v1|287714708212|0").
export const ebayItemNumber = (listingId?: string) => listingId?.split("|")[1] ?? (listingId && /^\d+$/.test(listingId) ? listingId : undefined);

// The eBay item number, one click to copy (for Gixen).
export function ItemNumber({ n }: { n?: string }) {
  const [copied, setCopied] = useState(false);
  if (!n) return null;
  return (
    <button type="button" title="Copy the eBay item number (for Gixen)"
      onClick={async () => {
        if (await copy(n)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="mt-0.5 inline-flex items-center gap-1 rounded border border-gray-700 px-1 text-[10px] font-mono text-gray-300 hover:border-indigo-700 hover:text-indigo-200">
      #{n} <span className="font-sans text-gray-500">{copied ? "copied" : "copy"}</span>
    </button>
  );
}

// The suggested max bid (the item bid to enter in Gixen); click to copy.
export function SuggestedBid({ b }: { b?: BidSuggestion }) {
  const [copied, setCopied] = useState(false);
  if (!b) return <span className="text-gray-600">–</span>;
  const tip = [
    `Enter ${usd(b.item_cents)} (before shipping and tax); it costs you ${usd(b.all_in_cents)} in an order from this seller.`,
    b.win_cents != null ? `Win price ${usd(b.win_cents)}: beats ${Math.round(b.win_share * 100)}% of ${b.win_basis ?? "recent finals"}` : "",
    b.value_cap_cents != null ? `Value cap ${usd(b.value_cap_cents)}: ${b.value_basis ?? ""}` : "",
    b.note,
  ].filter(Boolean).join("\n");
  const cls = b.over_max ? "text-gray-500 line-through" : b.limited_by === "value" ? "text-amber-300" : "text-green-300";
  const sub = b.limited_by === "value" ? "worth less than wins"
    : b.limited_by === "market" ? `wins ~${Math.round(b.win_share * 100)}%`
    : b.limited_by === "value_only" ? "value cap" : "market only";
  return (
    <span className="inline-flex flex-col items-end tabular-nums" title={tip}>
      <button type="button" className={`font-semibold ${cls} hover:underline`}
        onClick={async () => {
          if (await copy((b.item_cents / 100).toFixed(2))) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}>
        {usd(b.item_cents)}
      </button>
      <span className="text-[10px] text-gray-500">{copied ? "copied" : sub}</span>
      {b.over_max && <span className="text-[10px] text-red-300">bid already past it</span>}
    </span>
  );
}
