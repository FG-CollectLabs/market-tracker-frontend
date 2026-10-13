import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSetWindows, type SetWindows } from "../lib/api";
import BuyWindowsPanel from "../components/BuyWindows";
import { Spinner, ErrorMsg } from "../components/Spinner";

// Every set tier whose prices sit in their release curve's bottom 10% now
// (or soon), per grade.
export default function BuyWindowsPage() {
  const [params, setParams] = useSearchParams();
  const lang = params.get("lang") === "ja" ? "ja" : "en";
  const [sets, setSets] = useState<SetWindows[] | null>(null);
  const [oop, setOop] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSets(null);
    fetchSetWindows(lang)
      .then((r) => { setSets(r.sets); setOop(r.out_of_print_months); })
      .catch((e: Error) => setError(e.message));
  }, [lang]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Buy windows</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Months since release when a tier's prices typically sit within 10% of their low, from the release curves by tier, grade and language.
          <span className="text-gray-300"> Prime</span> = buy now; <span className="text-gray-300">Watch only</span> = raw in an out-of-print set
          (copies left are unlikely to be pack fresh: don't buy raw to grade, watch for a gradable copy). Sets count as out of print
          {oop != null ? ` ${oop} months` : ""} after release unless marked on the set page. "Target all" puts the tier's cards on the watchlist with
          that grade as the target; to cherry-pick, open the set.
        </p>
      </div>
      <div className="flex gap-6 border-b border-gray-800">
        {(["en", "ja"] as const).map((l) => (
          <button key={l} onClick={() => setParams(l === "en" ? {} : { lang: l }, { replace: true })}
            className={`pb-2 -mb-px text-sm border-b-2 ${lang === l ? "border-indigo-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
            {l === "en" ? "English" : "Japanese"}
          </button>
        ))}
      </div>
      {error && <ErrorMsg msg={error} />}
      {!sets && !error && <Spinner />}
      {sets && <BuyWindowsPanel sets={sets} />}
    </div>
  );
}
