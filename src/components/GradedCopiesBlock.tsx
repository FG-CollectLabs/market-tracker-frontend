import { useEffect, useState } from "react";
import { fetchGradedCopies, gradeLabel, gradingIntakeUrl, type GradedCopies, type IntakeCard } from "../lib/gradingApp";

// On a card's Graded tab: a link to add a photographed graded copy in the
// grading predictor, and how many the centering backtest has so far (front
// and back photographed = usable). Loaded only when the tab is open; if the
// grading API is down it says so quietly and the page carries on.

export default function GradedCopiesBlock({ card }: { card: IntakeCard }) {
  const [copies, setCopies] = useState<GradedCopies | null | undefined>(undefined);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let live = true;
    setCopies(undefined);
    setDown(false);
    fetchGradedCopies(card.display_key)
      .then((c) => live && setCopies(c))
      .catch(() => live && setDown(true));
    return () => {
      live = false;
    };
  }, [card.display_key]);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 mb-4 space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100">Centering backtest copies</h3>
        <a href={gradingIntakeUrl(card)} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200">
          Add graded copy →
        </a>
      </div>
      <p className="text-xs text-gray-400">
        {down ? (
          <span className="text-gray-500">Copy counts unavailable (the grading app didn't answer).</span>
        ) : copies === undefined ? (
          "Loading…"
        ) : copies === null || copies.copies === 0 ? (
          "None collected yet."
        ) : (
          <>
            <b className="text-gray-200">{copies.both_photos}</b> usable ({copies.copies} collected; usable = front and back photographed)
            {copies.by_grade.length > 0 && (
              <span className="text-gray-300">
                {" · "}
                {copies.by_grade.map((g) => `${gradeLabel(g)}: ${g.both_photos}`).join(" · ")}
              </span>
            )}
          </>
        )}
      </p>
    </section>
  );
}
