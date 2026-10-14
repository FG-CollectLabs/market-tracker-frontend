import { useEffect, useState } from "react";
import { fetchCardLinks, type MarketLinks } from "../lib/api";

// Marketplace searches for a card + grade, to check prices by hand: what's
// for sale and what sold, on Fanatics and eBay.
export function MarketLinkRow({ links, compact }: { links?: MarketLinks | null; compact?: boolean }) {
  if (!links) return null;
  const items: [string, string][] = [
    ["Fanatics auctions", links.fanatics_auctions],
    ["Fanatics Buy Now", links.fanatics_buy_now],
    ["Fanatics sold", links.fanatics_sold],
    ["eBay listings", links.ebay_listings],
    ["eBay sold", links.ebay_sold],
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
      {!compact && <span className="text-gray-500" title={`Searched as: ${links.title}`}>Check:</span>}
      {items.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 hover:underline">
          {label} ↗
        </a>
      ))}
    </div>
  );
}

// The same, fetched for a card + grade (set pages, where rows don't carry links).
export function CardMarketLinks({ displayKey, grade }: { displayKey: string; grade: string }) {
  const [links, setLinks] = useState<MarketLinks | null>(null);
  useEffect(() => {
    fetchCardLinks(displayKey, grade).then(setLinks).catch(() => setLinks(null));
  }, [displayKey, grade]);
  return <MarketLinkRow links={links} />;
}
