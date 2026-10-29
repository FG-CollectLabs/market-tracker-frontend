import { useState } from "react";
import { TRAINER_BUCKETS, type CurveLang, type ReleaseCurves } from "../lib/api";
import { CellLegend, MatrixTable, Toggle } from "./GroupMatrix";
import GroupDetail from "./GroupDetail";

// The art itself: who else is in it (cameos), its mood and its technique,
// read by an agent from each IR / SIR / full art / TG / GG image. Does a
// cameo, a star cameo, or a cozy scene change how a card holds and grows?

const LANG_OPTS: { key: CurveLang; label: string }[] = [{ key: "en", label: "English" }, { key: "ja", label: "Japanese" }];
const GRADE_OPTS = [{ key: "psa-10", label: "PSA 10" }, { key: "raw", label: "Raw" }];
const LEVELS = [
  { key: "none", label: "No cameo" }, { key: "hidden", label: "Hidden cameo" },
  { key: "noticeable", label: "Noticeable cameo" }, { key: "major", label: "Major cameo" },
];
const TIERS = [
  { key: "any", label: "Any card" },
  ...["s", "top", "a", "b", "c", "unranked"].map((t) => ({ key: `poke:${t}`, label: `Pokémon ${t === "top" ? "Top" : t === "unranked" ? "unranked" : t.toUpperCase()}` })),
  ...TRAINER_BUCKETS.map((b) => ({ key: `trainer:${b.key}`, label: `Trainer ${b.label}` })),
];
const MOODS = [
  ["cozy", "Cozy / slice of life"], ["cute_playful", "Cute / playful"], ["serene_scenic", "Serene / scenic"], ["action", "Action"],
  ["epic_majestic", "Epic / majestic"], ["dark_eerie", "Dark / eerie"], ["funny_quirky", "Funny / quirky"],
].map(([k, l]) => ({ key: `mood:${k}`, label: l }));
const TECHNIQUES = [
  ["painterly_watercolor", "Painterly / watercolor"], ["storybook_boldline", "Storybook / bold line"], ["anime_cel", "Anime / cel"],
  ["realistic", "Realistic"], ["cg_3d", "3D / CG"], ["retro_pixel", "Retro / pixel"],
].map(([k, l]) => ({ key: `technique:${k}`, label: l }));

export default function ArtTab({ data }: { data: ReleaseCurves }) {
  const [lang, setLang] = useState<CurveLang>("en");
  const [grade, setGrade] = useState("psa-10");
  const [sel, setSel] = useState<{ section: string; cat: string } | null>(null);
  const pick = (section: string) => (cat: string) => setSel((s) => (s?.section === section && s.cat === cat ? null : { section, cat }));
  const detail = (section: string) => sel?.section === section && (
    <div className="rounded border border-indigo-800/60 bg-gray-950/40 p-3">
      <GroupDetail data={data} category={sel.cat} grade={grade} lang={lang} onClose={() => setSel(null)} />
    </div>
  );
  const one = [{ key: "x", label: grade === "raw" ? "Raw" : "PSA 10" }];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Toggle value={lang} options={LANG_OPTS} onChange={(v) => { setLang(v); setSel(null); }} />
        <Toggle value={grade} options={GRADE_OPTS} onChange={setGrade} />
      </div>
      <p className="text-xs text-gray-500 max-w-3xl">
        An agent (Claude Sonnet) read every tracked IR, SIR, full art and Trainer / Galarian Gallery image: who else appears (a cameo is
        <b className="text-gray-300"> major</b> when it shares the spotlight or interacts with the subject, <b className="text-gray-300">noticeable</b>{" "}
        when clearly visible but secondary, <b className="text-gray-300">hidden</b> when you have to look for it), the mood and the technique. In a
        pilot it found most cameos but not all (9 of 12 on 151 Pikachu), so treat levels as good and counts as approximate.
      </p>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Cameos, inside each Pokémon and trainer tier</h2>
        <p className="text-xs text-gray-500 max-w-3xl">
          The card's strongest cameo, against the same tier without one: does a C-tier Pokémon with a major cameo hold up like a better card, and
          does a star sharing the spotlight help or dilute it?
        </p>
        <CellLegend benchmark={data.benchmark} />
        <MatrixTable data={data} rows={TIERS} cols={LEVELS} grade={grade} lang={lang} corner="Main subject"
          cat={(r, l) => (r === "any" ? `cameo:${l}` : `${r}|cameo:${l}`)} selected={sel?.section === "cameo" ? sel.cat : undefined} onSelect={pick("cameo")} />
        {detail("cameo")}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Who the cameo is</h2>
        <p className="text-xs text-gray-500 max-w-3xl">Cards with any cameo: is one of them a star (an S or Top Pokémon, or an S / A trainer) or not?</p>
        <MatrixTable data={data} rows={[{ key: "cameo:star", label: "Star cameo" }, { key: "cameo:plain", label: "Other cameos" }]} cols={one} grade={grade} lang={lang}
          cat={(r) => r} selected={sel?.section === "star" ? sel.cat : undefined} onSelect={pick("star")} />
        {detail("star")}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Mood</h2>
        <MatrixTable data={data} rows={MOODS} cols={one} grade={grade} lang={lang} cat={(r) => r}
          selected={sel?.section === "mood" ? sel.cat : undefined} onSelect={pick("mood")} />
        {detail("mood")}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Technique</h2>
        <p className="text-xs text-amber-300/90">A soft signal: in the pilot, two models disagreed on technique for the same card.</p>
        <MatrixTable data={data} rows={TECHNIQUES} cols={one} grade={grade} lang={lang} cat={(r) => r}
          selected={sel?.section === "tech" ? sel.cat : undefined} onSelect={pick("tech")} />
        {detail("tech")}
      </section>
    </div>
  );
}
