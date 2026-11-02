import { useState } from "react";
import type { CurveLang } from "../lib/api";
import GroupChart, { BuyMonthSlider } from "./GroupChart";
import { Toggle } from "./GroupMatrix";

// The chosen tier split by pull difficulty, PSA gem rate or both, one chart
// per part side by side, every card behind each as a faint line, all re-based
// on the same buy month: why the matrices say what they say.

type Split = "pull" | "gem" | "both";
const LEVELS = [["easy", "Easy to pull"], ["medium", "Medium"], ["hard", "Hard to pull"]] as const;
const GEMS = [["low", "Low gem rate"], ["mid", "Mid gem rate"], ["high", "High gem rate"]] as const;
const SPLITTABLE = ["ir", "sir", "ultra", "gold", "all"];

export default function SplitCharts({ cat, catLabel, lang, start, setStart }: {
  cat: string;
  catLabel: string;
  lang: CurveLang;
  start: number;
  setStart: (m: number) => void;
}) {
  const [split, setSplit] = useState<Split>("pull");
  const [grade, setGrade] = useState("psa-10");
  if (!SPLITTABLE.includes(cat)) return null;
  const pullCat = (l: string) => `pull:${cat}:${l}`;
  const gemCat = (g: string) => (cat === "all" ? `gem:${g}` : `${cat}|gem:${g}`);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-100">Split {catLabel} by…</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Toggle value={split} options={[{ key: "pull", label: "Pull difficulty" }, { key: "gem", label: "PSA gem rate" }, { key: "both", label: "Both" }]} onChange={setSplit} />
          <Toggle value={grade} options={[{ key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }]} onChange={setGrade} />
        </div>
      </div>
      <p className="text-xs text-gray-500 max-w-3xl">
        Each chart: the part's average path (bold) and every card in it (faint; hover to name one, click to open it), re-based on buying at the
        month below. If hard-to-grade or hard-to-pull cards appreciate differently, it shows here as different paths, and as the spread of
        the cards around them.
      </p>
      <BuyMonthSlider start={start} onChange={setStart} />
      {split !== "both" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {(split === "pull" ? LEVELS : GEMS).map(([k, label]) => (
            <div key={k} className="rounded border border-gray-800 bg-gray-950/40 p-2">
              <GroupChart category={split === "pull" ? pullCat(k) : gemCat(k)} grade={grade} lang={lang} start={start} compact title={label} />
            </div>
          ))}
        </div>
      ) : (
        GEMS.map(([g, glabel]) => (
          <div key={g} className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-300">{glabel}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {LEVELS.map(([l, label]) => (
                <div key={l} className="rounded border border-gray-800 bg-gray-950/40 p-2">
                  <GroupChart category={`${pullCat(l)}|gem:${g}`} grade={grade} lang={lang} start={start} compact title={label} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
