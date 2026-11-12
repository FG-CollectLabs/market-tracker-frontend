import { Link } from "react-router-dom";

// Riftbound buying pages that aren't built yet: what each will do, so the
// menu shows the plan instead of a dead link.

const PLANS: Record<string, { title: string; points: string[] }> = {
  watchlist: {
    title: "Riftbound watchlist",
    points: [
      "Your Riftbound cards with buy targets (raw, PSA 10, CGC 10, BGS), separate from the Pokémon watchlist.",
      "Hits from eBay and consigners when a copy lists under target.",
    ],
  },
  deals: {
    title: "Riftbound deals",
    points: [
      "eBay auctions and Buy It Now of tracked Riftbound cards, matched from listing titles.",
      "Raw copies screened for grading: the pre-grader's centering odds on the listing photos, and the grading EV for PSA, CGC and BGS.",
    ],
  },
};

export default function RiftboundComingPage({ page }: { page: "watchlist" | "deals" }) {
  const p = PLANS[page];
  return (
    <div className="max-w-2xl mx-auto space-y-3 py-6">
      <h1 className="text-xl font-semibold text-white">{p.title}</h1>
      <p className="text-sm text-amber-400">Coming next: it needs Riftbound eBay title matching first.</p>
      <ul className="list-disc pl-5 text-sm text-gray-300 space-y-1">
        {p.points.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <p className="text-sm text-gray-500">
        Meanwhile: <Link to="/rb" className="text-sky-400 hover:text-sky-300">Riftbound sets</Link> for prices and grading EV.
      </p>
    </div>
  );
}
