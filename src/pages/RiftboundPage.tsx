import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchRiftboundCards, fetchRiftboundSets, type RbCard, type RbSet } from "../lib/api";
import { Spinner } from "../components/Spinner";

// Riftbound singles: alt art and better from the main sets, and promos.
// Data: import-riftbound (TCGplayer via TCGCSV, weekly).

const KINDS: { key: string; label: string; cls: string }[] = [
  { key: "signature", label: "Signature", cls: "bg-amber-900/60 text-amber-300" },
  { key: "ultimate", label: "Ultimate", cls: "bg-fuchsia-900/60 text-fuchsia-300" },
  { key: "special_art", label: "Special Art", cls: "bg-pink-900/60 text-pink-300" },
  { key: "overnumbered", label: "Overnumbered", cls: "bg-violet-900/60 text-violet-300" },
  { key: "alt_art", label: "Alt Art", cls: "bg-sky-900/60 text-sky-300" },
  { key: "showcase", label: "Bundle", cls: "bg-teal-900/60 text-teal-300" },
  { key: "promo", label: "Promo", cls: "bg-emerald-900/60 text-emerald-300" },
  { key: "base", label: "Base", cls: "bg-gray-800 text-gray-400" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

const usd = (c: number | null | undefined) =>
  c == null ? "—" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`;

function pct(now: number | null, then: number | null) {
  if (now == null || then == null || then === 0) return null;
  return (now - then) / then;
}

function Change({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-600">—</span>;
  const cls = v > 0.005 ? "text-emerald-400" : v < -0.005 ? "text-rose-400" : "text-gray-400";
  return <span className={cls}>{v > 0 ? "+" : ""}{(v * 100).toFixed(0)}%</span>;
}

function KindBadge({ kind }: { kind: string }) {
  const k = KIND[kind] ?? { label: kind, cls: "bg-gray-800 text-gray-400" };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${k.cls}`}>{k.label}</span>;
}

type Sort = "price" | "chg4" | "chg12" | "name";

export default function RiftboundPage() {
  const [params, setParams] = useSearchParams();
  const set = params.get("set") ?? "";
  const kind = params.get("kind") ?? "";
  const sort = (params.get("sort") as Sort) || "price";
  const [sets, setSets] = useState<RbSet[] | null>(null);
  const [cards, setCards] = useState<RbCard[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(120);

  const update = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
    setLimit(120);
  };

  useEffect(() => {
    fetchRiftboundSets().then((r) => setSets(r.sets)).catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => {
    setCards(null);
    fetchRiftboundCards({ set: set || undefined, kind: kind || undefined, all: kind === "base" })
      .then((r) => setCards(r.cards))
      .catch((e) => setErr(String(e)));
  }, [set, kind]);

  const shown = useMemo(() => {
    if (!cards) return [];
    const term = q.trim().toLowerCase();
    const list = term ? cards.filter((c) => c.name.toLowerCase().includes(term)) : [...cards];
    const by = (f: (c: RbCard) => number | null) => (a: RbCard, b: RbCard) => (f(b) ?? -Infinity) - (f(a) ?? -Infinity);
    if (sort === "chg4") list.sort(by((c) => pct(c.market_cents, c.cents_4w_ago)));
    else if (sort === "chg12") list.sort(by((c) => pct(c.market_cents, c.cents_12w_ago)));
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [cards, q, sort]);

  const main = sets?.filter((s) => s.kind === "main") ?? [];
  const promo = sets?.filter((s) => s.kind !== "main") ?? [];
  const hasHistory = cards?.some((c) => c.weeks > 1);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound</h1>
        <p className="text-sm text-gray-400">
          Alt art and better from the main sets, plus promos. TCGplayer market prices, refreshed weekly.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}

      {!sets ? <Spinner /> : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-gray-300">Sets</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {main.map((s) => <SetTile key={s.code} s={s} active={set === s.code} onClick={() => update("set", set === s.code ? "" : s.code)} />)}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {promo.map((s) => (
                <button key={s.code} onClick={() => update("set", set === s.code ? "" : s.code)}
                  className={`px-2 py-1 rounded text-xs border ${set === s.code ? "border-sky-500 text-white bg-sky-950" : "border-gray-800 text-gray-300 hover:border-gray-600"}`}>
                  {s.name.replace(/^Riftbound /, "")} <span className="text-gray-500">{s.tracked || s.cards}</span>
                </button>
              ))}
            </div>
          </section>
          <KindTable sets={main} />
        </>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => update("kind", "")}
            className={`px-2 py-1 rounded text-xs ${!kind ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>All tracked</button>
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => update("kind", kind === k.key ? "" : k.key)}
              className={`px-2 py-1 rounded text-xs ${kind === k.key ? k.cls + " ring-1 ring-current" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{k.label}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name"
            className="ml-auto bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-gray-200 w-40" />
          <select value={sort} onChange={(e) => update("sort", e.target.value === "price" ? "" : e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-gray-200">
            <option value="price">Priciest</option>
            <option value="chg4">4-week change</option>
            <option value="chg12">12-week change</option>
            <option value="name">Name</option>
          </select>
        </div>
        {cards && !hasHistory && (
          <p className="text-xs text-gray-500">Price changes fill in as weekly history builds (first snapshot {cards[0]?.price_week ?? "pending"}).</p>
        )}
        {!cards ? <Spinner /> : (
          <>
            <div className="text-xs text-gray-500">{shown.length} cards</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {shown.slice(0, limit).map((c) => <CardTile key={c.display_key} c={c} />)}
            </div>
            {shown.length > limit && (
              <button onClick={() => setLimit(limit + 120)} className="text-sm text-sky-400 hover:text-sky-300">
                Show more ({shown.length - limit} left)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SetTile({ s, active, onClick }: { s: RbSet; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-lg border overflow-hidden bg-gray-900 ${active ? "border-sky-500" : "border-gray-800 hover:border-gray-600"}`}>
      <div className="aspect-[5/3] bg-gray-950 overflow-hidden">
        {s.cover_url && <img src={s.cover_url} alt="" loading="lazy" className="w-full h-full object-cover object-top opacity-80" />}
      </div>
      <div className="p-2">
        <div className="text-sm text-white truncate">{s.name}</div>
        <div className="text-[11px] text-gray-500">
          {s.release_date?.slice(0, 10) ?? "TBA"} · {s.tracked} tracked
        </div>
        <div className="text-[11px] text-gray-400">{s.tracked ? `${usd(s.tracked_value_cents)} tracked value` : "not on TCGplayer yet"}</div>
      </div>
    </button>
  );
}

// Median TCGplayer price of each kind by set: how a set's chase compares
// with the others, the Riftbound take on Pokémon's set tiers.
function KindTable({ sets }: { sets: RbSet[] }) {
  const cols = sets.filter((s) => s.cards > 0);
  const kinds = KINDS.filter((k) => cols.some((s) => s.kinds.some((x) => x.kind === k.key)));
  if (!cols.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-300">Median price by type <span className="text-gray-500 font-normal">(top in grey)</span></h2>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-left font-normal py-1 pr-4">Type</th>
              {cols.map((s) => <th key={s.code} className="text-right font-normal py-1 px-3 uppercase">{s.code}</th>)}
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.key} className="border-t border-gray-900">
                <td className="py-1 pr-4"><KindBadge kind={k.key} /></td>
                {cols.map((s) => {
                  const x = s.kinds.find((y) => y.kind === k.key);
                  return (
                    <td key={s.code} className="text-right py-1 px-3 tabular-nums whitespace-nowrap">
                      {x ? (
                        <span title={`${x.count} cards, ${x.priced} priced`}>
                          <span className="text-gray-200">{usd(x.median_cents)}</span>
                          <span className="text-gray-600 text-xs ml-1">{usd(x.max_cents)}</span>
                        </span>
                      ) : <span className="text-gray-700">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CardTile({ c }: { c: RbCard }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden flex flex-col">
      <Link to={`/cards/${c.display_key}`} className="block aspect-[5/7] bg-gray-950">
        {c.image_url && <img src={c.image_url} alt={c.name} loading="lazy" className="w-full h-full object-contain" />}
      </Link>
      <div className="p-2 space-y-1 text-xs flex-1 flex flex-col">
        <Link to={`/cards/${c.display_key}`} className="text-gray-100 hover:text-white leading-tight line-clamp-2">{c.name}</Link>
        <div className="flex items-center gap-1 text-gray-500">
          <KindBadge kind={c.kind} />
          <span className="uppercase">{c.set_code}</span>
          <span>{c.printed_number ?? c.number}</span>
        </div>
        <div className="mt-auto flex items-baseline justify-between pt-1">
          <span className="text-sm text-white tabular-nums">{usd(c.market_cents)}</span>
          <span className="tabular-nums space-x-1">
            <span title="4-week change"><Change v={pct(c.market_cents, c.cents_4w_ago)} /></span>
          </span>
        </div>
        {c.tcgplayer_url && (
          <a href={c.tcgplayer_url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-500 hover:text-gray-300">
            TCGplayer{c.low_cents != null ? ` · low ${usd(c.low_cents)}` : ""} ↗
          </a>
        )}
      </div>
    </div>
  );
}
