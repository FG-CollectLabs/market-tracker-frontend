import { useState } from "react";
import { TRAINER_BUCKETS, type CurveLang, type GemBand, type PullBand, type ReleaseCurves } from "../lib/api";
import { CellLegend, MatrixTable, Toggle } from "./GroupMatrix";
import GroupDetail from "./GroupDetail";

// Pull difficulty and gem rate: how hard a specific card is to pull against
// the other sets' cards of its tier (per language), how often it gems, and
// whether either changes how it bottoms and appreciates, by rarity tier and
// inside each Pokémon / artist / trainer tier. Click a cell to open its
// curve (against the group it splits) and its cards below the table.

const LEVELS = [{ key: "easy", label: "Easy to pull" }, { key: "medium", label: "Medium" }, { key: "hard", label: "Hard to pull" }];
const GEMS = [{ key: "low", label: "Low gem rate" }, { key: "mid", label: "Mid gem rate" }, { key: "high", label: "High gem rate" }];
const TIERS = [{ key: "ir", label: "IR tier" }, { key: "sir", label: "SIR tier" }, { key: "ultra", label: "Full art / UR" }, { key: "gold", label: "Gold / hyper" }, { key: "all", label: "Any tier" }];
const LANG_OPTS: { key: CurveLang; label: string }[] = [{ key: "en", label: "English" }, { key: "ja", label: "Japanese" }];
const GRADE_OPTS = [{ key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }];
type Split = "pull" | "gem" | "both";
const SPLITS: { key: Split; label: string }[] = [{ key: "pull", label: "By pull difficulty" }, { key: "gem", label: "By gem rate" }, { key: "both", label: "Pull difficulty × gem rate" }];
const tierRows = (dim: string) => ["s", "top", "a", "b", "c", "unranked"].map((t) => ({ key: `${dim}:${t}`, label: t === "top" ? "Top" : t === "unranked" ? "Unranked" : t.toUpperCase() }));
const FACTORS: { key: string; label: string; rows: { key: string; label: string }[] }[] = [
  { key: "poke", label: "Pokémon tier", rows: tierRows("poke") },
  { key: "artist", label: "Artist tier", rows: tierRows("artist") },
  { key: "trainer", label: "Trainers", rows: TRAINER_BUCKETS.map((b) => ({ key: `trainer:${b.key}`, label: b.label })) },
];
const packs = (n: number) => Math.round(n).toLocaleString();
const rate = (v: number) => `${Math.round(v * 100)}%`;
const LANG_NAME: Record<string, string> = { en: "English", ja: "Japanese" };

// What puts a card in a group, in words: the pack and gem-rate thresholds.
function definition(cat: string, lang: string, bands: PullBand[], gem?: GemBand): string {
  const parts: string[] = [];
  for (const seg of cat.split("|")) {
    const [dim, a, b] = seg.split(":");
    if (dim === "pull") {
      const level = b ?? a, tier = b ? a : "";
      const band = bands.find((x) => x.tier === tier);
      const what = level === "easy" ? "easy to pull" : level === "hard" ? "hard to pull" : "medium to pull";
      if (band) {
        const range = level === "easy" ? `under ${packs(band.easy_below)} packs` : level === "hard" ? `over ${packs(band.hard_above)} packs` : `${packs(band.easy_below)}–${packs(band.hard_above)} packs`;
        parts.push(`${what}: ${range} to pull that exact card (${LANG_NAME[lang] ?? lang} ${tier.toUpperCase()} sets: typical ${packs(band.typical_packs)})`);
      } else {
        parts.push(`${what} against its own rarity tier's sets (more than 1 SD fewer / more packs than the sets' average)`);
      }
    } else if (dim === "gem" && gem) {
      parts.push(a === "low" ? `PSA gem rate under ${rate(gem.low_below)}` : a === "high" ? `PSA gem rate ${rate(gem.high_from)} or more` : `PSA gem rate ${rate(gem.low_below)}–${rate(gem.high_from)}`);
    }
  }
  return parts.length ? `Cards here: ${parts.join("; ")}. Each card's packs and gem rate are in the list below.` : "";
}

type Sel = { section: string; cat: string } | null;

export default function PullDifficultyTab({ data }: { data: ReleaseCurves }) {
  const [lang, setLang] = useState<CurveLang>("en");
  const [grade, setGrade] = useState("psa-10");
  const [split, setSplit] = useState<Split>("pull");
  const [fsplit, setFsplit] = useState<Record<string, "pull" | "gem">>({});
  const [sel, setSel] = useState<Sel>(null);
  const bands = (data.pull_bands ?? []).filter((b) => b.lang === lang);
  const gem = data.gem_bands?.find((b) => b.lang === lang);
  const bandOf = (t: string) => bands.find((b) => b.tier === t);
  const pick = (section: string) => (cat: string) => setSel((s) => (s?.section === section && s.cat === cat ? null : { section, cat }));
  const detail = (section: string) => sel?.section === section && (
    <div className="rounded border border-indigo-800/60 bg-gray-950/40 p-3">
      <GroupDetail data={data} category={sel.cat} grade={grade} lang={lang} definition={definition(sel.cat, lang, bands, gem)} onClose={() => setSel(null)} />
    </div>
  );
  const pullNote = (t: string) => {
    const b = bandOf(t);
    return b ? `easy < ${packs(b.easy_below)} · hard > ${packs(b.hard_above)} packs` : t === "all" ? "each card vs its own tier" : "";
  };
  const gemNote = gem ? `low < ${rate(gem.low_below)} · high ≥ ${rate(gem.high_from)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Toggle value={lang} options={LANG_OPTS} onChange={(v) => { setLang(v); setSel(null); }} />
        <Toggle value={grade} options={GRADE_OPTS} onChange={setGrade} />
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">What easy, medium and hard mean</h2>
        <p className="text-xs text-gray-500 max-w-3xl">
          <b className="text-gray-300">Packs to pull</b> one <i>specific</i> card = packs per card of its rarity × cards of that rarity in the set
          (measured pull rates where we have them, else the era's estimate). Each set's typical card is compared with the other sets of the same
          tier and language: <b className="text-gray-300">easy</b> = more than one standard deviation fewer packs than the sets' average,{" "}
          <b className="text-gray-300">hard</b> = more than one more, <b className="text-gray-300">medium</b> in between (log scale, so a few huge
          sets don't drag the average). English and Japanese are separate: English sets often combine Japanese sets.{" "}
          <b className="text-gray-300">Gem rate</b>: PSA 10s ÷ PSA-graded copies (50+ graded), split in thirds per language{gem ? ` (${gemNote})` : ""}.
        </p>
        {bands.length === 0 ? <p className="text-sm text-gray-500">No pull rates for this language yet.</p> : (
          <div className="overflow-x-auto">
            <table className="text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr>{["Tier", "Sets", "Typical packs", "Easy: under", "Medium", "Hard: over", "Sets easy / medium / hard"].map((h) => <th key={h} className="text-left py-1 pr-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {bands.map((b) => (
                  <tr key={b.tier}>
                    <td className="py-1 pr-4">{TIERS.find((t) => t.key === b.tier)?.label ?? b.tier}</td>
                    <td className="py-1 pr-4">{b.sets}</td>
                    <td className="py-1 pr-4">{packs(b.typical_packs)}</td>
                    <td className="py-1 pr-4">{packs(b.easy_below)}</td>
                    <td className="py-1 pr-4">{packs(b.easy_below)}–{packs(b.hard_above)}</td>
                    <td className="py-1 pr-4">{packs(b.hard_above)}</td>
                    <td className="py-1 pr-4">{b.easy_sets} / {b.medium_sets} / {b.hard_sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-100">By rarity tier: returns and when to buy</h2>
          <Toggle value={split} options={SPLITS} onChange={(v) => { setSplit(v); setSel(null); }} />
        </div>
        <CellLegend benchmark={data.benchmark} />
        {split === "pull" && (
          <MatrixTable data={data} rows={TIERS} cols={LEVELS} grade={grade} lang={lang} cat={(t, l) => `pull:${t}:${l}`}
            rowNote={pullNote} selected={sel?.section === "tier" ? sel.cat : undefined} onSelect={pick("tier")} />
        )}
        {split === "gem" && (
          <MatrixTable data={data} rows={TIERS} cols={GEMS} grade={grade} lang={lang} cat={(t, g) => (t === "all" ? `gem:${g}` : `${t}|gem:${g}`)}
            rowNote={() => gemNote} selected={sel?.section === "tier" ? sel.cat : undefined} onSelect={pick("tier")} />
        )}
        {split === "both" && GEMS.map((g) => (
          <div key={g.key} className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-300">{g.label}{gem && <span className="text-gray-500 font-normal"> · {g.key === "low" ? `under ${rate(gem.low_below)}` : g.key === "high" ? `${rate(gem.high_from)}+` : `${rate(gem.low_below)}–${rate(gem.high_from)}`}</span>}</h3>
            <MatrixTable data={data} rows={TIERS} cols={LEVELS} grade={grade} lang={lang} cat={(t, l) => `pull:${t}:${l}|gem:${g.key}`}
              rowNote={pullNote} selected={sel?.section === "tier" ? sel.cat : undefined} onSelect={pick("tier")} />
          </div>
        ))}
        {detail("tier")}
      </section>

      {FACTORS.map((f) => {
        const fs = fsplit[f.key] ?? "pull";
        return (
          <section key={f.key} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Inside each {f.label.toLowerCase()}</h2>
              <Toggle value={fs} options={[{ key: "pull", label: "By pull difficulty" }, { key: "gem", label: "By gem rate" }]}
                onChange={(v) => { setFsplit((x) => ({ ...x, [f.key]: v })); setSel(null); }} />
            </div>
            <p className="text-xs text-gray-500 max-w-3xl">
              {fs === "pull"
                ? `The same ${f.label.toLowerCase()} at different pull difficulty (each card judged against its own rarity tier): does the harder-to-pull version appreciate better, or bottom at a different time?`
                : `The same ${f.label.toLowerCase()} by PSA gem rate (${gemNote}): do the ones that rarely gem hold or grow better?`} Raw and PSA 10 only.
            </p>
            <MatrixTable data={data} rows={f.rows} cols={fs === "pull" ? LEVELS : GEMS} grade={grade} lang={lang} corner={f.label}
              cat={(r, x) => `${r}|${fs}:${x}`} selected={sel?.section === f.key ? sel.cat : undefined} onSelect={pick(f.key)} />
            {detail(f.key)}
          </section>
        );
      })}
    </div>
  );
}
