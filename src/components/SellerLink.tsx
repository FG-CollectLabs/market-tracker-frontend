import { Link } from "react-router-dom";

// An eBay seller's name, linking to their Deals seller page (store sweep +
// combined-shipping order), started from this listing.
export default function SellerLink({ seller, from, className }: { seller?: string | null; from?: string; className?: string }) {
  if (!seller) return <>–</>;
  const q = from ? `?from=${encodeURIComponent(from)}` : "";
  return (
    <Link to={`/deals/seller/${encodeURIComponent(seller)}${q}`} title="Seller page: sweep their store for other gradables in one combined-shipping order"
      className={className ?? "text-gray-400 hover:text-indigo-300 underline decoration-dotted decoration-gray-600 underline-offset-2"}>
      {seller}
    </Link>
  );
}
