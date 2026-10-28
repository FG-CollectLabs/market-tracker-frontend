import { useState } from "react";
import { TRAINER_BUCKETS, type CurveLang, type ReleaseCurves } from "../lib/api";
import { CellLegend, MatrixTable, Toggle } from "./GroupMatrix";

// Pull difficulty: how hard a specific card is to pull against the other
// sets' cards of its tier (per language), and whether that changes how it
// bottoms and appreciates, overall and inside each Pokémon / artist /
// trainer tier.

const LEVELS = [{ key: "easy", label: "Easy to pull" }, { key: "medium", label: "Medium" }, { key: "hard", label: "Hard to pull" }];
const TIERS = [{ key: "ir", label: "IR tier" }, { key: "sir", label: "SIR tier" }, { key: "ultra", label: "Full art / UR" }, { key: "gold", label: "Gold / hyper" }, { key: "all", label: "Any tier" }];
const LANG_OPTS: { key: CurveLang; label: string }[] = [{ key: "en", label: "English" }, { key: "ja", label: "Japanese" }];
const GRADE_OPTS = [{ key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }];
const FACTORS: { key: string; label: string; rows: { key: string; label: string }[] }[] = [
  { key: "poke", label: "Pokémon tier", rows: ["top", "a", "b", "c", "unranked"].map((t) => ({ key: `poke:${t}`, label: t === "top" ? "Top" : t === "unranked" ? "Unranked" : t.toUpperCase() })) },
  { key: "artist", label: "Artist tier", rows: ["top", "a", "b", "c", "unranked"].map((t) => ({ key: `artist:${t}`, label: t === "top" ? "Top" : t === "unranked" ? "Unranked" : t.toUpperCase() })) },
  { key: "trainer", label: "Trainers", rows: TRAINER_BUCKETS.map((b) => ({ key: `trainer:${b.key}`, label: b.label })) },
];
const fmtPacks = (n: number) => Math.round(n).toLocaleString();

export default function PullDifficultyTab({ data }: { data: ReleaseCurves }) {
  const [lang, setLang] = useState<CurveLang>("en");
  const [grade, setGrade] = useState("psa-10");
  const [factor, setFactor] = useState("poke");
  const bands = (data.pull_bands ?? []).filter((b) => b.lang === lang);
  const f = FACTORS.find((x) => x.key === factor)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Toggle value={lang} options={LANG_OPTS} onChange={setLang} />
        <Toggle value={grade} options={GRADE_OPTS} onChange={setGrade} />
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">What easy, medium and hard mean</h2>
        <p className="text-xs text-gray-500 max-w-3xl">
          Packs to pull one <i>specific</i> card = packs per card of its rarity × cards of that rarity in the set. Each set's typical card is
          compared with the other sets of the same tier and language: <b className="text-gray-300">easy</b> = more than one standard deviation
          fewer packs than the sets' average, <b className="text-gray-300">hard</b> = more than one more, <b className="text-gray-300">medium</b> in
          between. Measured on a log scale (packs run from tens to thousands, so a few huge sets would otherwise drag the average). English and
          Japanese are separate: English sets often combine Japanese sets, which changes the counts.
        </p>
        {bands.length === 0 ? <p className="text-sm text-gray-500">No pull rates for this language yet.</p> : (
          <div className="overflow-x-auto">
            <table className="text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr>{["Tier", "Sets", "Typical packs", "Easy below", "Hard above", "Sets easy / medium / hard"].map((h) => <th key={h} className="text-left py-1 pr-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {bands.map((b) => (
                  <tr key={b.tier}>
                    <td className="py-1 pr-4">{TIERS.find((t) => t.key === b.tier)?.label ?? b.tier}</td>
                    <td className="py-1 pr-4">{b.sets}</td>
                    <td className="py-1 pr-4">{fmtPacks(b.typical_packs)}</td>
                    <td className="py-1 pr-4">{fmtPacks(b.easy_below)}</td>
                    <td className="py-1 pr-4">{fmtPacks(b.hard_above)}</td>
                    <td className="py-1 pr-4">{b.easy_sets} / {b.medium_sets} / {b.hard_sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">By rarity tier: returns and when to buy</h2>
        <CellLegend benchmark={data.benchmark} />
        <MatrixTable data={data} rows={TIERS} cols={LEVELS} grade={grade} lang={lang} cat={(t, l) => `pull:${t}:${l}`} />
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-100">Inside each {f.label.toLowerCase()}</h2>
          <Toggle value={factor} options={FACTORS.map((x) => ({ key: x.key, label: x.label }))} onChange={setFactor} />
        </div>
        <p className="text-xs text-gray-500 max-w-3xl">
          The same {f.label.toLowerCase()} at different pull difficulty (each card judged against its own rarity tier): does the harder-to-pull
          version of a top Pokémon or a waifu S trainer appreciate better, or bottom at a different time? Raw and PSA 10 only.
        </p>
        <MatrixTable data={data} rows={f.rows} cols={LEVELS} grade={grade} lang={lang} cat={(r, l) => `${r}|pull:${l}`} corner={f.label} />
      </section>
    </div>
  );
}
