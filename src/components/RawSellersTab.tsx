import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRawSellerCandidates, fetchRawSellers, saveRawSeller, type RawSeller, type RawSellerCandidate } from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "./Spinner";
import GradeOddsBadge from "./GradeOddsBadge";

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const storeURL = (u: string) => `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(u)}&_sacat=183454`;

// Big raw sellers with combined shipping: their gradable copies (at or under
// the most to pay raw to grade), costed as basket items, and the basket.
export default function RawSellersTab() {
  const session = useSession();
  const [sellers, setSellers] = useState<RawSeller[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const load = () => fetchRawSellers().then((r) => setSellers(r.sellers)).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Big raw sellers whose combined shipping makes it cheaper to source several gradable copies at once. Each listing is costed as
        a basket item (its price plus what it adds to the order's shipping) and kept when that's at or under the most you'd pay
        raw to grade.
      </p>
      {err && <ErrorMsg msg={err} />}
      {!sellers && !err && <Spinner />}
      {sellers && sellers.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
          No raw sellers tracked yet. {session ? "Pick them under Manage raw sellers below." : "Sign in to pick them."}
        </div>
      )}
      {sellers?.map((s) => (
        <section key={s.username} className="rounded-lg border border-gray-800 bg-gray-900">
          <button onClick={() => setOpen(open === s.username ? null : s.username)} className="w-full text-left p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-gray-100 font-semibold flex items-center gap-2">
                <span className={`text-gray-600 text-[10px] transition-transform ${open === s.username ? "rotate-90" : ""}`}>▸</span>
                {s.label || s.username}
                {s.label && <span className="text-xs text-gray-500 font-normal">{s.username}</span>}
                {s.feedback_score != null && <span className="text-xs text-gray-500 font-normal tabular-nums">{s.feedback_score.toLocaleString()} feedback{s.feedback_pct != null ? ` · ${s.feedback_pct}%` : ""}</span>}
              </div>
              <div className="text-xs text-gray-500 pl-4">{s.ship_rule.text}{s.ship_rule.note ? ` · ${s.ship_rule.note}` : ""}</div>
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="text-gray-200"><span className="text-white font-semibold">{s.under_max}</span> gradable under max · {s.live_raw.toLocaleString()} raw listed</div>
              {s.basket && (
                <div className="text-gray-400">
                  All {s.basket.items}: {usd(s.basket.items_cents)} + {usd(s.basket.ship_cents)} ship = <span className="text-gray-100">{usd(s.basket.total_cents)}</span>
                  {" "}({usd(s.basket.per_card_cents)}/card) · <span className="text-green-300">{usd(s.basket.headroom_cents)} under max</span>
                </div>
              )}
            </div>
          </button>
          {open === s.username && (
            <div className="border-t border-gray-800 p-4 space-y-2">
              <div className="flex flex-wrap gap-3 text-xs">
                <a href={storeURL(s.username)} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">Their Pokémon singles on eBay ↗</a>
                {s.basket && <span className="text-gray-500">{s.basket.note}</span>}
              </div>
              {s.listings.length === 0 ? <p className="text-xs text-gray-500">Nothing at or under max right now.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 text-left max-lg:!static">
                      <tr>
                        <th className="py-1.5 pr-2 font-medium">Card</th>
                        <th className="py-1.5 px-2 font-medium text-right">Item</th>
                        <th className="py-1.5 px-2 font-medium text-right" title="What it adds to the order: item + additional-item shipping">In a basket</th>
                        <th className="py-1.5 px-2 font-medium text-right">Max to grade</th>
                        <th className="py-1.5 px-2 font-medium text-right">Under</th>
                        <th className="py-1.5 px-2 font-medium text-right">PSA 10</th>
                        <th className="py-1.5 px-2 font-medium text-right" title="Population 10 rate for the better grader">10 rate</th>
                        <th className="py-1.5 pl-2 font-medium">Odds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.listings.map((l) => (
                        <tr key={l.listing_id} className="border-t border-gray-800 align-top">
                          <td className="py-1.5 pr-2">
                            <div className="flex gap-2 items-start min-w-[16rem]">
                              {l.image_url && <img src={l.image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
                              <div className="min-w-0">
                                <Link to={`/cards/${l.display_key}`} className="text-gray-100 hover:text-indigo-300">{l.name}</Link>
                                <span className="text-gray-500"> #{l.number} · {l.set_code}</span>
                                {l.image_count === 1 && <span className="ml-1.5 px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
                                {l.url
                                  ? <a href={l.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{l.title}</a>
                                  : <div className="truncate max-w-[22rem] text-gray-500">{l.title}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(l.item_cents)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-100">{usd(l.add_cents)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(l.max_raw_cents)} <span className="text-gray-600 uppercase">{l.max_grader}</span></td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-green-300">{Math.round(l.under * 100)}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(l.psa10_cents)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{l.p10 != null ? `${Math.round(l.p10 * 100)}%` : "–"}</td>
                          <td className="py-1.5 pl-2">{l.grade_odds ? <GradeOddsBadge o={l.grade_odds} compact /> : <span className="text-gray-600">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {s.under_max > s.listings.length && <p className="text-[11px] text-gray-500 mt-1">Showing the best {s.listings.length} of {s.under_max}.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      ))}

      {session && (
        <section className="rounded-lg border border-gray-800 bg-gray-900">
          <button onClick={() => setManage(!manage)} className="w-full text-left p-4 text-sm text-gray-200 flex items-center gap-2">
            <span className={`text-gray-600 text-[10px] transition-transform ${manage ? "rotate-90" : ""}`}>▸</span>
            Manage raw sellers
            <span className="text-xs text-gray-500">pick sellers and enter their combined-shipping rules (eBay doesn't publish them)</span>
          </button>
          {manage && <Manage onSaved={load} />}
        </section>
      )}
    </div>
  );
}

function Manage({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<RawSellerCandidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [add, setAdd] = useState("");
  const load = () => fetchRawSellerCandidates(40).then((r) => setRows(r.sellers)).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  const saved = () => { load(); onSaved(); };
  return (
    <div className="border-t border-gray-800 p-4 space-y-3">
      {err && <ErrorMsg msg={err} />}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="eBay username to add"
          className="rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-gray-200 placeholder:text-gray-600" />
        <button disabled={!add.trim()} onClick={() => saveRawSeller(add.trim().toLowerCase(), { raw_tracked: true }).then(() => { setAdd(""); saved(); }).catch((e) => setErr(String(e)))}
          className="px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 disabled:opacity-40">Track</button>
        <span className="text-gray-500">Or pick from the sellers with the most raw listings of tracked cards:</span>
      </div>
      {!rows ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left max-lg:!static">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Seller</th>
                <th className="py-1.5 px-2 font-medium text-right">Feedback</th>
                <th className="py-1.5 px-2 font-medium text-right">Raw listed</th>
                <th className="py-1.5 px-2 font-medium text-right">Cards</th>
                <th className="py-1.5 px-2 font-medium text-right">Median</th>
                <th className="py-1.5 px-2 font-medium text-right">Listed ship</th>
                <th className="py-1.5 pl-2 font-medium">Combined shipping: first · each additional · free over · note</th>
              </tr>
            </thead>
            <tbody>{rows.map((r) => <ManageRow key={r.username} r={r} onSaved={saved} onErr={setErr} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const toCents = (v: string) => (v.trim() === "" ? undefined : Math.round(parseFloat(v) * 100));
const fromCents = (c?: number) => (c == null ? "" : (c / 100).toFixed(2));

function ManageRow({ r, onSaved, onErr }: { r: RawSellerCandidate; onSaved: () => void; onErr: (e: string) => void }) {
  const [first, setFirst] = useState(fromCents(r.ship_rule.first_cents));
  const [each, setEach] = useState(fromCents(r.ship_rule.each_add_cents));
  const [free, setFree] = useState(fromCents(r.ship_rule.free_over_cents));
  const [note, setNote] = useState(r.ship_rule.note ?? "");
  const [busy, setBusy] = useState(false);
  const run = (body: Parameters<typeof saveRawSeller>[1]) => {
    setBusy(true);
    saveRawSeller(r.username, body).then(onSaved).catch((e) => onErr(String(e))).finally(() => setBusy(false));
  };
  const bad = [first, each, free].some((v) => v.trim() !== "" && !(parseFloat(v) >= 0));
  const inp = "w-16 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 tabular-nums";
  return (
    <tr className="border-t border-gray-800 align-middle">
      <td className="py-1.5 pr-2 whitespace-nowrap">
        <a href={storeURL(r.username)} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-indigo-300">{r.label || r.username}</a>
        {r.raw_tracked && <span className="ml-1.5 px-1.5 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-[10px] text-indigo-200">tracked</span>}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{r.feedback_score?.toLocaleString() ?? "–"}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{r.live_raw.toLocaleString()}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{r.cards.toLocaleString()}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{usd(r.median_cents)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400" title={`${Math.round(r.free_ship_pct * 100)}% of their listings ship free`}>
        {r.free_ship_pct >= 0.9 ? "free" : usd(r.median_ship_cents)}
      </td>
      <td className="py-1.5 pl-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="first $" className={inp} />
          <input value={each} onChange={(e) => setEach(e.target.value)} placeholder="each +$" className={inp} />
          <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="free over $" className={`${inp} w-20`} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" className="w-36 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200" />
          <button disabled={busy || bad} onClick={() => run({ raw_tracked: true, ship_first_cents: toCents(first), ship_each_add_cents: toCents(each), free_ship_over_cents: toCents(free), ship_note: note })}
            className="px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 disabled:opacity-40">{r.raw_tracked ? "Save" : "Track"}</button>
          {r.raw_tracked && (
            <button disabled={busy} onClick={() => run({ raw_tracked: false })}
              className="px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40">Untrack</button>
          )}
        </div>
      </td>
    </tr>
  );
}
