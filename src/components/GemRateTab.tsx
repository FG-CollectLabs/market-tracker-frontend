import { useState } from "react";
import type { CurveLang, ReleaseCurves } from "../lib/api";
import { CellLegend, MatrixTable, Toggle, findRow, pct } from "./GroupMatrix";

// PSA 10 investability by gem rate: does a PSA 10 of a card that rarely
// gems beat a PSA 10 of the set's hyped top chase?

const LANG_OPTS: { key: CurveLang; label: string }[] = [{ key: "en", label: "English" }, { key: "ja", label: "Japanese" }];
const GRADE_OPTS = [{ key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }];
const GEMS = [{ key: "low", label: "Low gem rate" }, { key: "mid", label: "Mid" }, { key: "high", label: "High gem rate" }, { key: "any", label: "Any gem rate" }];
const CHASE = [{ key: "top", label: "Top chase (set's 3 priciest)" }, { key: "rest", label: "Not the chase" }, { key: "any", label: "All cards" }];
const pctRate = (v: number) => `${Math.round(v * 100)}%`;

export default function GemRateTab({ data }: { data: ReleaseCurves }) {
  const [lang, setLang] = useState<CurveLang>("en");
  const [grade, setGrade] = useState("psa-10");
  const band = data.gem_bands?.find((b) => b.lang === lang);
  const cat = (chase: string, gem: string) =>
    chase === "any" ? (gem === "any" ? "all" : `gem:${gem}`) : gem === "any" ? `chase:${chase}` : `gem:${gem}|chase:${chase}`;
  const lowRest = findRow(data, "gem:low|chase:rest", grade, lang)?.trailing;
  const top = findRow(data, "chase:top", grade, lang)?.trailing;
  const highTop = findRow(data, "gem:high|chase:top", grade, lang)?.trailing;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Toggle value={lang} options={LANG_OPTS} onChange={setLang} />
        <Toggle value={grade} options={GRADE_OPTS} onChange={setGrade} />
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Does a low-gem-rate {grade === "raw" ? "card" : "PSA 10"} beat the hyped top chase?</h2>
        {lowRest && top ? (
          <p className="text-sm text-gray-300 max-w-3xl">
            Past their hype (month 12+), {grade === "raw" ? "raw copies" : "PSA 10s"} of <b>low-gem-rate cards that aren't the chase</b> have
            moved <b className={lowRest.median > top.median ? "text-green-400" : "text-gray-100"}>{pct(lowRest.median)}/yr</b> (median of{" "}
            {lowRest.cards}), against <b className={top.median >= lowRest.median ? "text-green-400" : "text-gray-100"}>{pct(top.median)}/yr</b> for
            sets' <b>top chase cards</b> ({top.cards})
            {highTop && <>; top chases that gem easily (high gem rate): <b>{pct(highTop.median)}/yr</b> ({highTop.cards})</>}.{" "}
            {lowRest.median > top.median ? "Scarce 10s have been the better hold." : "The chase has held up better."}
          </p>
        ) : (
          <p className="text-sm text-gray-500">Not enough cards with both a gem rate and trailing history in this language yet.</p>
        )}
        <p className="text-xs text-gray-500 max-w-3xl">
          Gem rate = PSA 10s ÷ all PSA-graded copies (GemRate), cards with 50+ graded, split in thirds per language
          {band && <> ({lang === "ja" ? "Japanese" : "English"}: low under {pctRate(band.low_below)}, high from {pctRate(band.high_from)}, median {pctRate(band.median)}, {band.cards.toLocaleString()} cards)</>}.
          Japanese cards gem far more often, so each language has its own thirds. Caveats: gem rates are today's, not at the time of the
          returns; older sets gem less, so the low third leans older and its curve mixes in era effects. Use the cells' card lists to check.
        </p>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Gem rate × chase</h2>
        <CellLegend benchmark={data.benchmark} />
        <MatrixTable data={data} rows={CHASE} cols={GEMS} grade={grade} lang={lang} cat={cat} />
      </section>
    </div>
  );
}
