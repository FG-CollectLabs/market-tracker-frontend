import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addCustomCard, fetchCardClasses, removeCardClass, saveCardClasses, searchCards,
  type CardClassInfo, type CardSearchHit, type ClassedCard, type ClassEdit,
} from "../lib/api";
import { useSession } from "../lib/auth";
import { cardThumb } from "../lib/thumb";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { HelpDot } from "../components/HelpTip";

const usd = (c?: number) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const inp = "bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200";
const LANGS: [string, string][] = [["en", "English"], ["ja", "Japanese"], ["zh", "Chinese"]];

// The fields a class edit shares: class, subtype, release date, price link.
function ClassFields({ classes, v, onChange }: { classes: CardClassInfo[]; v: Partial<ClassEdit>; onChange: (v: Partial<ClassEdit>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      <select value={v.class ?? ""} onChange={(e) => onChange({ ...v, class: e.target.value })} className={inp}>
        <option value="">Class…</option>
        {(["promo", "exotic"] as const).map((g) => (
          <optgroup key={g} label={g === "promo" ? "Promos" : "Exotics"}>
            {classes.filter((c) => c.group === g).map((c) => <option key={c.key} value={c.key} title={c.hint}>{c.label}</option>)}
          </optgroup>
        ))}
      </select>
      <input value={v.subtype ?? ""} onChange={(e) => onChange({ ...v, subtype: e.target.value })} placeholder="Subtype (etb, jumbo, museum…)" className={`${inp} w-48`} list="class-subtypes" />
      <label className="flex items-center gap-1" title="When this card came out, if not its set's date (promos in Black Star sets, event cards). The timing curves count from it.">
        Released <input type="date" value={v.release_date ?? ""} onChange={(e) => onChange({ ...v, release_date: e.target.value })} className={inp} />
      </label>
      <input value={v.price_link ?? ""} onChange={(e) => onChange({ ...v, price_link: e.target.value })} placeholder="PriceCharting card link (optional)" className={`${inp} w-72`}
        title="A pricecharting.com/game/... card page: its monthly price history fills in on the next weekly backfill" />
      <datalist id="class-subtypes">
        {["etb", "collection_box", "precon", "jumbo", "blister", "tin", "tournament", "prerelease", "museum", "pokemon_center", "world_championships"].map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

// Promo and exotic cards: each class gets its own release curve on the
// Timing page. Tag cards from the catalog, or add ones it doesn't have.
export default function CardClassesPage() {
  const session = useSession();
  const [classes, setClasses] = useState<CardClassInfo[] | null>(null);
  const [cards, setCards] = useState<ClassedCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  // Tag from the catalog.
  const [q, setQ] = useState("");
  const [set, setSet] = useState("");
  const [hits, setHits] = useState<CardSearchHit[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState<Partial<ClassEdit>>({});

  // Add by hand.
  const [custom, setCustom] = useState<Partial<ClassEdit> & { name?: string; lang?: string; number?: string; image_url?: string }>({ lang: "en" });

  // Edit one.
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<ClassEdit>>({});

  const apply = (r: { classes: CardClassInfo[]; cards: ClassedCard[] }) => { setClasses(r.classes); setCards(r.cards); };
  useEffect(() => {
    fetchCardClasses().then(apply).catch((e: Error) => setError(e.message));
  }, []);

  const byClass = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const m = new Map<string, ClassedCard[]>();
    for (const c of cards) {
      if (f && !`${c.name} ${c.number} ${c.set_name} ${c.subtype ?? ""}`.toLowerCase().includes(f)) continue;
      m.set(c.class, [...(m.get(c.class) ?? []), c]);
    }
    return m;
  }, [cards, filter]);

  if (error && !classes) return <ErrorMsg msg={error} />;
  if (!classes) return <Spinner />;
  const label = (k: string) => classes.find((c) => c.key === k)?.label ?? k;

  const run = async (f: () => Promise<string | void>, done: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const m = await f();
      setMsg(m || done || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const search = () => run(async () => {
    const r = await searchCards(q.trim(), set.trim());
    setHits(r.cards);
    setPicked(new Set());
  }, "");

  const tagPicked = () => run(async () => {
    const list = [...picked].map((k) => ({ ...tag, display_key: k }) as ClassEdit);
    apply(await saveCardClasses(list));
    setPicked(new Set());
  }, `Tagged ${picked.size} card${picked.size === 1 ? "" : "s"} as ${label(tag.class ?? "")}`);

  const addCustom = () => run(async () => {
    const r = await addCustomCard({ ...custom, name: custom.name ?? "", lang: custom.lang ?? "en", class: custom.class ?? "" });
    apply(await fetchCardClasses());
    setCustom({ lang: custom.lang, class: custom.class, subtype: custom.subtype });
    return `Added ${r.display_key}`;
  }, "Added");

  const saveEdit = (c: ClassedCard) => run(async () => {
    apply(await saveCardClasses([{ ...edit, display_key: c.display_key } as ClassEdit]));
    setEditing(null);
  }, `Saved ${c.name}`);

  const remove = (c: ClassedCard) => {
    if (!window.confirm(`Take ${c.name} out of ${label(c.class)}? It stays tracked.`)) return;
    run(async () => {
      await removeCardClass(c.display_key);
      apply(await fetchCardClasses());
    }, `Removed ${c.name}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">
          Promos &amp; exotics
          <HelpDot width="w-96" help="Each class gets its own release curve, bottoms and buy windows on the Timing page once enough cards are tagged (8+ with prices in a month). A card's own release date wins over its set's: promos sit in Black Star sets that span years." />
        </h1>
        <p className="text-sm text-gray-500">{cards.length} cards in {byClass.size} classes. Tag cards from the catalog, or add ones it doesn't have.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-2 text-xs">
        {(["promo", "exotic"] as const).map((g) => (
          <div key={g} className="rounded border border-gray-800 bg-gray-900 p-2 space-y-0.5">
            <div className="text-gray-200 font-medium">{g === "promo" ? "Promos" : "Exotics"}</div>
            {classes.filter((c) => c.group === g).map((c) => (
              <div key={c.key}><span className="text-gray-300">{c.label}</span> <span className="text-gray-500">· {c.hint}</span> <span className="text-gray-600">({cards.filter((x) => x.class === c.key).length})</span></div>
            ))}
          </div>
        ))}
      </div>

      {session && (
        <>
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-gray-100">Tag cards from the catalog</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="Name or number (pikachu 150)" className={`${inp} w-64`} />
              <input value={set} onChange={(e) => setSet(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="Set code (svp, swshp…)" className={`${inp} w-40`} />
              <button onClick={search} disabled={busy} className="px-2 py-1 rounded border border-gray-700 text-xs text-gray-200 hover:text-white disabled:opacity-40">Search</button>
              <span className="text-xs text-gray-500">Up to 50 results; a set code alone lists its cards.</span>
            </div>
            {hits && (
              <div className="max-h-72 overflow-y-auto rounded border border-gray-800">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-800 text-gray-300">
                    {hits.length === 0 && <tr><td className="p-2 text-gray-500">No cards.</td></tr>}
                    {hits.map((h) => {
                      const cls = cards.find((c) => c.display_key === h.display_key)?.class;
                      return (
                        <tr key={h.display_key} className="hover:bg-gray-800/40">
                          <td className="p-1 w-6">
                            <input type="checkbox" className="accent-indigo-500" checked={picked.has(h.display_key)}
                              onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(h.display_key)) n.delete(h.display_key); else n.add(h.display_key); return n; })} />
                          </td>
                          <td className="p-1"><Link to={`/cards/${encodeURIComponent(h.display_key)}`} className="text-gray-100 hover:text-indigo-300">{h.name}</Link> <span className="text-gray-500">#{h.number}</span></td>
                          <td className="p-1 text-gray-500">{h.set_name}</td>
                          <td className="p-1 text-gray-500">{h.rarity}</td>
                          <td className="p-1 text-gray-400">{cls ? label(cls) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {hits && hits.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setPicked(picked.size === hits.length ? new Set() : new Set(hits.map((h) => h.display_key)))} className="text-xs text-indigo-300 hover:text-indigo-200">
                  {picked.size === hits.length ? "Clear" : `Select all ${hits.length}`}
                </button>
                <ClassFields classes={classes} v={tag} onChange={setTag} />
                <button onClick={tagPicked} disabled={busy || picked.size === 0 || !tag.class}
                  className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-500 disabled:opacity-40">Tag {picked.size}</button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-gray-100">
              Add a card by hand
              <HelpDot help="For cards the catalog doesn't have (museum promos, Chinese exclusives). The release date is required: the curves count from it. A PriceCharting link gives it price history." />
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input value={custom.name ?? ""} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Name as printed" className={`${inp} w-64`} />
              <select value={custom.lang} onChange={(e) => setCustom({ ...custom, lang: e.target.value })} className={inp}>
                {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input value={custom.number ?? ""} onChange={(e) => setCustom({ ...custom, number: e.target.value })} placeholder="Number (optional)" className={`${inp} w-32`} />
              <input value={custom.image_url ?? ""} onChange={(e) => setCustom({ ...custom, image_url: e.target.value })} placeholder="Image URL (optional)" className={`${inp} w-56`} />
              <input value={custom.source_url ?? ""} onChange={(e) => setCustom({ ...custom, source_url: e.target.value })} placeholder="Source link (optional)" className={`${inp} w-56`} />
            </div>
            <ClassFields classes={classes} v={custom} onChange={(v) => setCustom({ ...custom, ...v })} />
            <button onClick={addCustom} disabled={busy || !custom.name?.trim() || !custom.class || !custom.release_date}
              className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-500 disabled:opacity-40">Add card</button>
          </section>
        </>
      )}
      {!session && <p className="text-xs text-amber-300">Sign in with Google to tag or add cards.</p>}
      {error && <ErrorMsg msg={error} />}
      {msg && <p className="text-xs text-green-400">{msg}</p>}

      <div className="flex items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a tagged card…" className={`${inp} w-64`} />
      </div>
      {classes.filter((c) => byClass.has(c.key)).map((c) => (
        <section key={c.key} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
          <h2 className="text-sm font-semibold text-gray-100">{c.label} <span className="font-normal text-gray-500">{byClass.get(c.key)!.length} cards · {c.hint}</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1 pr-2 font-medium" colSpan={2}>Card</th>
                  <th className="text-left py-1 pr-2 font-medium">Subtype</th>
                  <th className="text-left py-1 pr-2 font-medium" title="The card's own release date, else its set's (grey)">Released</th>
                  <th className="text-left py-1 pr-2 font-medium" title="Has a PriceCharting link: monthly price history fills in">Prices</th>
                  <th className="text-right py-1 pr-2 font-medium">Raw</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {byClass.get(c.key)!.map((x) => (
                  <tr key={x.display_key} className="align-top">
                    <td className="py-1 pr-2 w-8">{x.image_url && <img src={cardThumb(x.image_url)} alt="" loading="lazy" className="w-7 h-10 object-cover rounded-sm" />}</td>
                    <td className="py-1 pr-2">
                      <Link to={`/cards/${encodeURIComponent(x.display_key)}`} className="text-gray-100 hover:text-indigo-300">{x.name}</Link>
                      <div className="text-gray-500">#{x.number} · {x.set_name}{x.manual ? " · added by hand" : ""} · {x.lang.toUpperCase()}</div>
                      {x.note && <div className="text-gray-400 italic">{x.note}</div>}
                      {editing === x.display_key && (
                        <div className="mt-1 space-y-1">
                          <ClassFields classes={classes} v={edit} onChange={setEdit} />
                          <input value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Note" className={`${inp} w-72`} />
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(x)} disabled={busy || !edit.class} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40">Save</button>
                            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-200">Cancel</button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-gray-400">{x.subtype ?? ""}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{x.release_date ?? <span className="text-gray-500">{x.set_release_date ?? "—"} (set)</span>}</td>
                    <td className="py-1 pr-2">{x.price_link ? <span className="text-green-400">linked</span> : <span className="text-amber-300" title="No PriceCharting link: no price history">none</span>}</td>
                    <td className="py-1 pr-2 text-right">{usd(x.raw_cents)}</td>
                    <td className="py-1 text-right whitespace-nowrap">
                      {session && editing !== x.display_key && (
                        <>
                          <button onClick={() => { setEditing(x.display_key); setEdit({ class: x.class, subtype: x.subtype, note: x.note, source_url: x.source_url, release_date: x.release_date ?? "" }); }}
                            className="text-indigo-300 hover:text-indigo-200">Edit</button>
                          <button onClick={() => remove(x)} className="ml-2 text-gray-500 hover:text-red-400">Remove</button>
                        </>
                      )}
                      {x.source_url && <a href={x.source_url} target="_blank" rel="noreferrer" className="ml-2 text-gray-500 hover:text-gray-300">source ↗</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
