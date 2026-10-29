import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchReleaseCurves, type ReleaseCurves } from "../lib/api";
import { groupLabel } from "../lib/groups";
import GroupDetail from "../components/GroupDetail";
import { Spinner, ErrorMsg } from "../components/Spinner";

// One curve group in depth, on its own page (see GroupDetail).

const GRADES: [string, string][] = [["raw", "Raw"], ["psa-10", "PSA 10"], ["psa-9", "PSA 9"], ["cgc-10", "CGC 10"], ["cgc-10-pristine", "Pristine"]];
const LANGS: [string, string][] = [["en", "English"], ["ja", "Japanese"], ["all", "All"]];

export default function GroupPage() {
  const { category = "all" } = useParams();
  const [sp, setSp] = useSearchParams();
  const grade = sp.get("grade") ?? "raw";
  const lang = sp.get("lang") ?? "en";
  const [data, setData] = useState<ReleaseCurves | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchReleaseCurves().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/timing" className="text-xs text-indigo-300 hover:text-indigo-200">← Timing</Link>
          <h1 className="text-xl font-semibold text-white">{groupLabel(category)}</h1>
          <p className="text-sm text-gray-500">The release curve, lows and appreciation of this group against the group it splits, and the cards behind it.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex rounded border border-gray-700 overflow-hidden">
            {GRADES.map(([k, l]) => <button key={k} onClick={() => set("grade", k)} className={`px-2 py-1 ${grade === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>)}
          </span>
          <span className="inline-flex rounded border border-gray-700 overflow-hidden">
            {LANGS.map(([k, l]) => <button key={k} onClick={() => set("lang", k)} className={`px-2 py-1 ${lang === k ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{l}</button>)}
          </span>
        </div>
      </div>
      <GroupDetail data={data} category={category} grade={grade} lang={lang} />
    </div>
  );
}
