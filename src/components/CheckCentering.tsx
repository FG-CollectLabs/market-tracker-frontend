import { useState } from "react";
import { checkListingGradeOdds, type GradeOdds } from "../lib/api";
import GradeOddsBadge from "./GradeOddsBadge";

// Not sent yet: send this one listing's photos to the grading predictor.
export function CheckCentering({ listingId, photos, source = "ebay" }: { listingId: string; photos?: number; source?: "ebay" | "cc" }) {
  const [busy, setBusy] = useState(false);
  const [odds, setOdds] = useState<GradeOdds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (odds) return <GradeOddsBadge o={odds} compact />;
  if (photos != null && photos < 2) return <span className="text-gray-600 text-[11px]" title="Needs a front and a back photo">1 photo</span>;
  return (
    <span className="text-[11px]">
      <button disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try { setOdds(await checkListingGradeOdds(listingId, source)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
        }}
        title="Send this listing's first two photos (front, back) to the grading predictor; the odds show here in a few minutes"
        className="px-1.5 py-0.5 rounded border border-gray-700 text-indigo-300 hover:text-indigo-200 hover:border-indigo-700 disabled:opacity-50">
        {busy ? "sending…" : "check centering"}
      </button>
      {err && <span className="block text-red-300" title={err}>couldn't send</span>}
    </span>
  );
}
