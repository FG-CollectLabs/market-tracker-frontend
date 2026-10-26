import { useEffect, useMemo, useState } from "react";
import { fetchRankings, saveRankings, resetRankings, type RankingLists, type RankingsResponse } from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { HelpDot } from "../components/HelpTip";

type Kind = "pokemon" | "artists" | "trainers";

interface Col {
  id: string; // top, a, b, c; trainers: waifu.s ... aura.b
  label: string;
  hint: string;
  ordered?: boolean;
}

const COLS: Record<Kind, Col[]> = {
  pokemon: [
    { id: "top", label: "Top", hint: "Ordered, #1 = most collectible (score 100 sliding to 75)", ordered: true },
    { id: "a", label: "A", hint: "Score 65" },
    { id: "b", label: "B", hint: "Score 45" },
    { id: "c", label: "C", hint: "Score 25; unlisted Pokémon score 10" },
  ],
  artists: [
    { id: "top", label: "Top", hint: "Ordered, #1 = most collectible (score 100 sliding to 75)", ordered: true },
    { id: "a", label: "A", hint: "Score 65" },
    { id: "b", label: "B", hint: "Score 45, the same as unlisted (neutral)" },
    { id: "c", label: "C", hint: "Score 25" },
  ],
  trainers: [
    { id: "waifu.s", label: "Waifu S", hint: "The trainers collectors chase most as characters" },
    { id: "waifu.a", label: "Waifu A", hint: "" },
    { id: "waifu.b", label: "Waifu B", hint: "" },
    { id: "aura.s", label: "Aura S", hint: "Cool / villain / rival / champion energy, most chased" },
    { id: "aura.a", label: "Aura A", hint: "" },
    { id: "aura.b", label: "Aura B", hint: "" },
  ],
};

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "pokemon", label: "Pokémon", hint: "Matched on the species a card shows. Unlisted species count as little demand." },
  { key: "artists", label: "Artists", hint: "Matched on the card's illustrator, ignoring case. Unlisted artists are neutral." },
  { key: "trainers", label: "Trainers", hint: "Matched on the person a card without a Pokémon names (\"Lillie's Determination\" = Lillie, \"Boss's Orders (Giovanni)\" = Giovanni). Anyone unlisted is 'other'." },
];

function getCol(l: RankingLists, kind: Kind, id: string): string[] {
  if (kind === "trainers") {
    const [t, r] = id.split(".") as ["waifu" | "aura", "s" | "a" | "b"];
    return l.trainers[t][r] ?? [];
  }
  const list = l[kind];
  return (id === "top" ? list.top : list.tiers[id as "a" | "b" | "c"]) ?? [];
}

function setCol(l: RankingLists, kind: Kind, id: string, v: string[]): RankingLists {
  if (kind === "trainers") {
    const [t, r] = id.split(".") as ["waifu" | "aura", "s" | "a" | "b"];
    return { ...l, trainers: { ...l.trainers, [t]: { ...l.trainers[t], [r]: v } } };
  }
  const list = l[kind];
  return { ...l, [kind]: id === "top" ? { ...list, top: v } : { ...list, tiers: { ...list.tiers, [id]: v } } };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Where each entry sits: normalized name -> column id.
function placement(l: RankingLists, kind: Kind): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of COLS[kind]) for (const n of getCol(l, kind, c.id)) m.set(norm(n), c.id);
  return m;
}

export default function RankingsPage() {
  const session = useSession();
  const [resp, setResp] = useState<RankingsResponse | null>(null);
  const [draft, setDraft] = useState<RankingLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("trainers");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null); // "colId|name"
  const [addName, setAddName] = useState("");
  const [addCol, setAddCol] = useState("");

  useEffect(() => {
    fetchRankings().then((r) => { setResp(r); setDraft(r.lists); }).catch((e: Error) => setError(e.message));
  }, []);

  const speciesByName = useMemo(() => new Map((resp?.species ?? []).map((s) => [norm(s.name), s.slug])), [resp]);
  const speciesName = useMemo(() => new Map((resp?.species ?? []).map((s) => [s.slug, s.name])), [resp]);

  const changes = useMemo(() => {
    if (!resp || !draft) return 0;
    let n = 0;
    for (const k of ["pokemon", "artists", "trainers"] as Kind[]) {
      const a = placement(resp.lists, k), b = placement(draft, k);
      let moved = 0;
      for (const [name, col] of b) if (a.get(name) !== col) moved++;
      for (const name of a.keys()) if (!b.has(name)) moved++;
      // A reorder inside the top list alone still counts as a change.
      if (!moved && k !== "trainers" && JSON.stringify(getCol(resp.lists, k, "top")) !== JSON.stringify(getCol(draft, k, "top"))) moved = 1;
      n += moved;
    }
    return n;
  }, [resp, draft]);

  if (error && !resp) return <ErrorMsg msg={error} />;
  if (!resp || !draft) return <Spinner />;

  const cols = COLS[kind];
  const counts = kind === "pokemon" ? resp.cards.pokemon : kind === "artists" ? resp.cards.artists : resp.cards.trainers;
  const label = (n: string) => (kind === "pokemon" ? speciesName.get(n) ?? n : n);
  const countOf = (n: string) => counts[kind === "pokemon" ? n : norm(n)] ?? 0;
  const where = placement(draft, kind);
  const target = addCol || cols[cols.length - 1].id;
  const f = norm(filter);

  const update = (l: RankingLists) => { setDraft(l); setMsg(null); setError(null); };

  const remove = (colId: string, name: string) => {
    update(setCol(draft, kind, colId, getCol(draft, kind, colId).filter((x) => x !== name)));
    setPicked(null);
  };

  const move = (from: string, name: string, to: string) => {
    if (from === to) return;
    let l = setCol(draft, kind, from, getCol(draft, kind, from).filter((x) => x !== name));
    l = setCol(l, kind, to, [...getCol(l, kind, to), name]);
    update(l);
    setPicked(`${to}|${name}`);
  };

  const shift = (colId: string, name: string, d: -1 | 1) => {
    const v = [...getCol(draft, kind, colId)];
    const i = v.indexOf(name), j = i + d;
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    update(setCol(draft, kind, colId, v));
  };

  const add = (raw: string, to = target) => {
    const name = raw.trim();
    if (!name) return;
    let key = name;
    if (kind === "pokemon") {
      const slug = speciesByName.get(norm(name)) ?? (speciesName.has(norm(name)) ? norm(name) : undefined);
      if (!slug) { setError(`"${name}" isn't a Pokémon species.`); return; }
      key = slug;
    }
    const at = where.get(norm(key));
    if (at) {
      const existing = getCol(draft, kind, at).find((x) => norm(x) === norm(key))!;
      move(at, existing, to);
      setMsg(`${label(existing)} moved from ${cols.find((c) => c.id === at)?.label} to ${cols.find((c) => c.id === to)?.label}.`);
    } else {
      update(setCol(draft, kind, to, [...getCol(draft, kind, to), key]));
      setPicked(`${to}|${key}`);
    }
    setAddName("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await saveRankings(draft);
      setResp(r);
      setDraft(r.lists);
      setMsg("Saved. Curves and card analyses rebuild with the new tiers.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Throw away every edit and go back to the built-in rankings?")) return;
    setSaving(true);
    setError(null);
    try {
      const r = await resetRankings();
      setResp(r);
      setDraft(r.lists);
      setMsg("Back to the built-in rankings.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const unlisted = kind === "artists" ? resp.unlisted.artists : kind === "trainers" ? resp.unlisted.trainers : [];
  const options = kind === "pokemon" ? resp.species.map((s) => s.name) : unlisted.map((u) => u.name);
  const [pickCol, pickName] = picked ? (picked.split("|") as [string, string]) : [null, null];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-gray-100">
          Rankings
          <HelpDot width="w-96" help="Who counts as collectible: the Pokémon, artist and trainer tiers behind Compare by, the factor curves and each card's projection. Edits apply to the whole app once saved." />
        </h1>
        <span className="text-xs text-gray-500">
          {resp.edited ? <>Edited{resp.updated_by ? ` by ${resp.updated_by}` : ""}{resp.updated_at ? ` · ${new Date(resp.updated_at).toLocaleString()}` : ""}</> : "Built-in rankings (not edited)"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => { setKind(k.key); setPicked(null); setAddCol(""); setMsg(null); }}
            className={`px-3 py-1 rounded border ${kind === k.key ? "border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:text-gray-200"}`}>
            {k.label}
          </button>
        ))}
        <HelpDot help={KINDS.find((k) => k.key === kind)!.hint} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find…"
          className="ml-auto bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 w-48" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 print:hidden">
        <span>Add</span>
        <input list="rank-options" value={addName} onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(addName); }}
          placeholder={kind === "pokemon" ? "Pokémon name" : kind === "artists" ? "Illustrator" : "Trainer"}
          className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-gray-200 w-56" />
        <datalist id="rank-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
        <span>to</span>
        <select value={target} onChange={(e) => setAddCol(e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-gray-200">
          {cols.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button onClick={() => add(addName)} disabled={!addName.trim()}
          className="px-2 py-1 rounded border border-gray-700 text-gray-200 hover:text-white disabled:opacity-40">Add</button>
        <span className="text-gray-500">Adding something already listed moves it.</span>
      </div>

      {pickCol && pickName && (
        <div className="flex flex-wrap items-center gap-2 text-xs rounded border border-indigo-800 bg-indigo-950/30 px-3 py-2 print:hidden">
          <span className="text-gray-100 font-medium">{label(pickName)}</span>
          <span className="text-gray-500">{countOf(pickName)} tracked cards</span>
          <span className="text-gray-400 ml-2">Move to</span>
          <select value={pickCol} onChange={(e) => move(pickCol, pickName, e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
            {cols.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {cols.find((c) => c.id === pickCol)?.ordered && (
            <>
              <button onClick={() => shift(pickCol, pickName, -1)} className="px-1.5 rounded border border-gray-700 text-gray-300 hover:text-white" title="Rank higher">↑</button>
              <button onClick={() => shift(pickCol, pickName, 1)} className="px-1.5 rounded border border-gray-700 text-gray-300 hover:text-white" title="Rank lower">↓</button>
            </>
          )}
          <button onClick={() => remove(pickCol, pickName)} className="px-2 rounded border border-red-900 text-red-300 hover:text-red-200">
            Remove{kind === "trainers" ? " (becomes other)" : " (unlisted)"}
          </button>
          <button onClick={() => setPicked(null)} className="ml-auto text-gray-500 hover:text-gray-300">Close</button>
        </div>
      )}

      <div className={`grid gap-3 ${kind === "trainers" ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"}`}>
        {cols.map((c) => {
          const names = getCol(draft, kind, c.id);
          const cards = names.reduce((s, n) => s + countOf(n), 0);
          return (
            <section key={c.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-100">
                  {c.label}
                  {c.hint && <HelpDot help={c.hint} />}
                </h2>
                <span className="text-xs text-gray-500">{names.length} · {cards} cards</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {names.length === 0 && <span className="text-xs text-gray-600">Empty</span>}
                {names.map((n, i) => {
                  const hit = !f || norm(label(n)).includes(f) || norm(n).includes(f);
                  const sel = picked === `${c.id}|${n}`;
                  const k = countOf(n);
                  return (
                    <button key={n} onClick={() => setPicked(sel ? null : `${c.id}|${n}`)}
                      title={`${k} tracked card${k === 1 ? "" : "s"}`}
                      className={`px-1.5 py-0.5 rounded border text-xs ${sel ? "border-indigo-400 bg-indigo-950 text-white" : "border-gray-700 text-gray-300 hover:text-white"} ${hit ? "" : "opacity-25"}`}>
                      {c.ordered && <span className="text-gray-500 mr-1">{i + 1}</span>}
                      {label(n)}
                      <span className={`ml-1 ${k ? "text-gray-500" : "text-gray-700"}`}>{k}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {unlisted.length > 0 && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
          <h2 className="text-sm font-semibold text-gray-100">
            Unlisted, on the most tracked cards
            <HelpDot help={kind === "trainers"
              ? "Trainers on tracked cards who aren't on any list (they count as 'other'). Click one to add it to the column picked above."
              : "Illustrators of tracked cards who aren't on any list (neutral). Click one to add it to the column picked above."} />
          </h2>
          <div className="flex flex-wrap gap-1">
            {unlisted.filter((u) => !where.has(norm(u.name))).map((u) => (
              <button key={u.name} onClick={() => add(u.name)} title={`Add to ${cols.find((c) => c.id === target)?.label}`}
                className={`px-1.5 py-0.5 rounded border border-dashed border-gray-700 text-xs text-gray-400 hover:text-white ${!f || norm(u.name).includes(f) ? "" : "opacity-25"}`}>
                + {u.name} <span className="text-gray-600">{u.cards}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <ErrorMsg msg={error} />}
      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-gray-950/95 py-3 border-t border-gray-800 print:hidden">
        <button onClick={save} disabled={saving || !session || changes === 0}
          className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40">
          {saving ? "Saving…" : changes ? `Save ${changes} change${changes === 1 ? "" : "s"}` : "Save"}
        </button>
        {changes > 0 && (
          <button onClick={() => { setDraft(resp.lists); setPicked(null); setMsg(null); }}
            className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 text-sm hover:text-white">Discard changes</button>
        )}
        {resp.edited && (
          <button onClick={reset} disabled={saving || !session}
            className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 text-sm hover:text-white disabled:opacity-40">Reset to built-in</button>
        )}
        {!session && <span className="text-xs text-amber-300">Sign in with Google to save.</span>}
        {msg && <span className="text-xs text-green-400">{msg}</span>}
      </div>
    </div>
  );
}
