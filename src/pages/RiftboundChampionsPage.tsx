import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRiftboundChampions, saveRiftboundChampions, type RbChampion, type RbChampionsReport } from "../lib/api";
import { Spinner } from "../components/Spinner";
import RbTierChip from "../components/RbTierChip";

// Riftbound champion tiers: Riftbound's answer to the Pokémon collectibility
// lists, seeded from prices (what a champion's chase cards sell for against
// others of the same rarity in the same set) and editable by hand.

const usd = (c: number) => (c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);
const KIND: Record<string, string> = { overnumbered: "ON", signature: "Sig", special_art: "SA" };
const CHOICES: [string, string][] = [["", "Auto"], ["s", "S"], ["a", "A"], ["b", "B"], ["c", "C"], ["none", "Unranked"]];

// what the select shows for a champion: its hand-set value, or "" (auto)
const editedValue = (c: RbChampion) => (c.edited ? (c.tier || "none") : "");

export default function RiftboundChampionsPage() {
  const [rep, setRep] = useState<RbChampionsReport | null>(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({}); // champion → "" | s | a | b | c | none
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const load = (r: RbChampionsReport) => {
    setRep(r);
    setDraft(Object.fromEntries(r.champions.map((c) => [c.name, editedValue(c)])));
  };
  useEffect(() => { fetchRiftboundChampions().then(load).catch((e) => setErr(String(e))); }, []);

  const dirty = useMemo(() => rep?.champions.some((c) => (draft[c.name] ?? "") !== editedValue(c)) ?? false, [rep, draft]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rep?.champions ?? []).filter((c) => !t || c.name.toLowerCase().includes(t));
  }, [rep, q]);

  const save = async () => {
    setBusy(true); setMsg(""); setErr("");
    try {
      const tiers: Record<string, string> = {};
      for (const [k, v] of Object.entries(draft)) if (v) tiers[k] = v;
      load(await saveRiftboundChampions(tiers));
      setMsg("Saved");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const sel = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-xs text-gray-200";
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound champions</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          How much collectors pay for each champion, read off prices: each of its overnumbered, signature and special-art cards against the
          median of the same rarity in the same set. 2× means its cards sell for twice their peers. Set a tier by hand where the prices
          don&apos;t tell the whole story (a new set, an Arcane or skin-line bump). Tiers show on Deals, Watchlist and Timing.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!rep ? <Spinner /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a champion" className={`${sel} w-44`} />
            <span>S ≥ {rep.thresholds.s}× · A ≥ {rep.thresholds.a}× · B ≥ {rep.thresholds.b}× · C below</span>
            {rep.edited > 0 && <span>{rep.edited} set by hand{rep.updated_by ? ` · last by ${rep.updated_by}` : ""}</span>}
            <button onClick={save} disabled={!dirty || busy}
              className="ml-auto rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
              {busy ? "Saving…" : "Save tiers"}
            </button>
            {msg && <span className="text-emerald-300">{msg}</span>}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-2 px-3 font-medium">Champion</th>
                  <th className="py-2 px-2 font-medium">Tier</th>
                  <th className="py-2 px-2 font-medium text-right" title="Geometric mean of its cards' price over same set + rarity median">Score</th>
                  <th className="py-2 px-2 font-medium text-right" title="Scored cards / tracked cards">Cards</th>
                  <th className="py-2 px-2 font-medium text-right" title="Median PSA 10 of its alt arts (PriceCharting). Not in the score: an independent check; often few sales">Alt-art PSA 10</th>
                  <th className="py-2 px-3 font-medium">Its cards vs peers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const v = draft[c.name] ?? "";
                  return (
                    <tr key={c.name} className="border-t border-gray-800 align-top">
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="text-gray-100">{c.name}</span>
                        <span className="ml-1.5"><RbTierChip tier={c.tier} champion={c.name} /></span>
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <select value={v} onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                          className={`${sel} ${v ? "border-indigo-600" : ""}`}>
                          {CHOICES.map(([val, label]) => (
                            <option key={val} value={val}>{val === "" ? `Auto (${c.auto_tier ? c.auto_tier.toUpperCase() : "unranked"})` : label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-200">{c.score != null ? `${c.score.toFixed(2)}×` : "–"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{c.scored_cards}/{c.cards}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">
                        {c.alt_art_psa10_cents != null ? usd(c.alt_art_psa10_cents) : "–"}
                        {c.alt_art_psa10_n > 0 && <div className="text-[10px] text-gray-500">{c.alt_art_psa10_n} alt art{c.alt_art_psa10_n === 1 ? "" : "s"}</div>}
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {c.top.map((t) => (
                            <Link key={t.display_key} to={`/cards/${t.display_key}`} className="text-gray-400 hover:text-indigo-300 whitespace-nowrap"
                              title={`${t.name} · ${usd(t.market_cents)}`}>
                              {t.set_code.toUpperCase()} {KIND[t.kind] ?? t.kind} <span className={t.multiple >= 1 ? "text-emerald-300" : "text-gray-500"}>{t.multiple.toFixed(1)}×</span>
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method} New-set champions are scored on their launch prices, which run high.</p>
        </>
      )}
    </div>
  );
}
