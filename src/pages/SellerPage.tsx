import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchSellerPage, saveRawSeller, startSellerSweep,
  type SellerListing, type SellerPage as Page, type ShipRule, type SweepUnmatch,
} from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";
import GradeOddsBadge from "../components/GradeOddsBadge";
import { ItemNumber, ebayItemNumber } from "../components/BidCells";
import WatchButton from "../components/WatchButton";
import { CheckCentering } from "../components/HuntListings";
import { CheckAll } from "../components/BoardTools";

// Seller page (Deals → from a raw finder hit): one eBay seller's store,
// priced for a single combined-shipping order. Sweep the store to find every
// single they list, then build the order: the hit plus the other copies at
// or under the most to pay to grade them.

const usd = (c?: number | null) => (c == null ? "–" : `$${(c / 100).toFixed(2)}`);
const pct = (v?: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const storeURL = (u: string) => `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(u)}&_sacat=183454`;
const toCents = (v: string) => (v.trim() === "" ? undefined : Math.round(parseFloat(v) * 100));
const known = (r: ShipRule) => r.first_cents != null || r.each_add_cents != null || r.free_over_cents != null;

// The order's shipping under the seller's rule (same as the backend's
// basketShip): with no rule, each listing's own shipping.
function orderShip(r: ShipRule, xs: SellerListing[], items: number) {
  if (xs.length === 0) return 0;
  const listed = xs.reduce((s, x) => s + x.listed_ship_cents, 0);
  if (!known(r)) return listed;
  if (r.free_over_cents != null && items >= r.free_over_cents) return 0;
  const first = r.first_cents ?? 0, add = r.each_add_cents ?? first;
  const ship = first + add * (xs.length - 1);
  return r.cap_cents != null ? Math.min(ship, r.cap_cents) : ship;
}

function endsIn(iso?: string) {
  if (!iso) return "";
  const h = (new Date(iso).getTime() - Date.now()) / 3.6e6;
  if (h <= 0) return "ending";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

export default function SellerPage() {
  const { username = "" } = useParams();
  const [sp] = useSearchParams();
  const from = sp.get("from") ?? undefined;
  const session = useSession();
  const [p, setP] = useState<Page | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetchSellerPage(username, from).then(setP).catch((e) => setErr(String(e)));
  useEffect(() => { setP(null); setPicked(null); load(); }, [username, from]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while a sweep is queued or running; reload the listings when it ends.
  const sweeping = p?.sweep?.status === "queued" || p?.sweep?.status === "running";
  useEffect(() => {
    if (!sweeping) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [sweeping]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default order: the hit and every Buy Now gradable not passed on.
  useEffect(() => {
    if (!p || picked) return;
    const s = new Set<string>();
    if (p.origin) s.add(p.origin.listing_id);
    p.gradable.forEach((x) => { if (!x.auction && !x.passed) s.add(x.listing_id); });
    setPicked(s);
  }, [p, picked]);

  const order = useMemo(() => {
    if (!p || !picked) return null;
    const all = [...(p.origin ? [p.origin] : []), ...p.gradable, ...p.over, ...p.unpriced];
    const xs = all.filter((x) => picked.has(x.listing_id));
    const items = xs.reduce((s, x) => s + x.item_cents, 0);
    const ship = orderShip(p.ship_rule, xs, items);
    const listed = xs.reduce((s, x) => s + x.listed_ship_cents, 0);
    const maxSum = xs.reduce((s, x) => s + (x.max_raw_cents ?? x.add_cents), 0);
    const unpriced = xs.filter((x) => x.max_raw_cents == null).length;
    return { n: xs.length, items, ship, listed, total: items + ship, headroom: maxSum - items - ship, unpriced, auctions: xs.filter((x) => x.auction).length };
  }, [p, picked]);

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s ?? []);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const sweep = async () => {
    setBusy(true); setErr(null);
    try { await startSellerSweep(username, from); await load(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  if (err && !p) return <div className="p-4"><ErrorMsg msg={err} /></div>;
  if (!p) return <div className="p-4"><Spinner /></div>;
  const res = p.sweep?.result;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      <div className="text-xs text-gray-500"><Link to="/deals" className="hover:text-gray-300">Deals</Link> › Seller</div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex flex-wrap items-baseline gap-2">
            {p.label || p.username}
            {p.label && <span className="text-sm text-gray-500 font-normal">{p.username}</span>}
            <a href={storeURL(p.username)} target="_blank" rel="noreferrer" className="text-xs font-normal text-indigo-300/80 hover:text-indigo-200">eBay store ↗</a>
          </h1>
          <div className="text-xs text-gray-500 tabular-nums">
            {p.feedback_score != null && <>{p.feedback_score.toLocaleString()} feedback{p.feedback_pct != null ? ` · ${p.feedback_pct}%` : ""} · </>}
            {p.live.toLocaleString()} live listings stored ({p.graded.toLocaleString()} slabs)
            {p.raw_tracked && " · on Raw sellers"}{p.consigner && " · tracked consigner"}
          </div>
        </div>
        <SweepStatus p={p} busy={busy} canRun={!!session} onRun={sweep} />
      </header>
      {err && <ErrorMsg msg={err} />}

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="text-sm text-gray-200">Combined shipping: <span className="text-gray-100">{p.ship_rule.text}</span>{p.ship_rule.note ? <span className="text-gray-500"> · {p.ship_rule.note}</span> : null}</div>
        {!known(p.ship_rule) && (
          <p className="text-xs text-amber-300/80">
            eBay doesn't publish combined-shipping rules. Check the hit's Shipping and returns section (or the seller's store page) for
            "combined shipping" and enter it here. Until then each listing keeps its own shipping, so the order shows no savings.
          </p>
        )}
        {session && <RuleEditor p={p} onSaved={load} onErr={setErr} />}
      </section>

      {order && (
        <section className="rounded-lg border border-indigo-900/60 bg-indigo-950/20 p-4 text-sm flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="text-gray-100 font-semibold">Order: {order.n} card{order.n === 1 ? "" : "s"}</div>
          <div className="tabular-nums text-gray-300">{usd(order.items)} + {usd(order.ship)} ship = <span className="text-white font-semibold">{usd(order.total)}</span>
            {order.n > 0 && <span className="text-gray-500"> ({usd(Math.round(order.total / order.n))}/card)</span>}</div>
          {order.ship < order.listed && <div className="text-green-300 tabular-nums">saves {usd(order.listed - order.ship)} shipping vs separate</div>}
          <div className={`tabular-nums ${order.headroom >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(Math.abs(order.headroom))} {order.headroom >= 0 ? "under" : "over"} max to grade</div>
          {order.auctions > 0 && <div className="text-xs text-amber-300/80">{order.auctions} auction{order.auctions === 1 ? "" : "s"} at the current bid</div>}
          {order.unpriced > 0 && <div className="text-xs text-gray-500">{order.unpriced} without grading prices counted at cost</div>}
        </section>
      )}

      <CheckAllBar p={p} picked={picked} />

      {p.origin ? (
        <Bucket title="The hit" note="The listing you came from." rows={[p.origin]} picked={picked} toggle={toggle} />
      ) : from ? (
        <p className="text-xs text-gray-500">The hit ({from}) isn't stored for this seller: it may have ended, or the listing is from another seller.</p>
      ) : null}

      <Bucket title={`Gradable (${p.gradable.length})`} open
        note="Raw copies at or under the most to pay to grade them (better of PSA and CGC), costed as they add to this order."
        rows={p.gradable} picked={picked} toggle={toggle}
        empty={res ? "No other raw copies at or under max." : "Sweep the store to find the seller's other singles."} />
      <Bucket title={`Over max (${p.over.length})`} note="Priced, but costing more than the most to pay to grade. Closest first."
        rows={p.over} picked={picked} toggle={toggle} />
      <Bucket title={`No grading prices (${p.unpriced.length})`} note="Matched to cards with no graded prices yet, mostly untracked. Highest raw market first; watch one to start pricing it."
        rows={p.unpriced} picked={picked} toggle={toggle} watch />
      {res?.unmatched_items && res.unmatched_items.length > 0 && <Unmatched xs={res.unmatched_items} total={res.unmatched} />}
    </div>
  );
}

// Check centering for every raw copy on the page that has no odds yet or
// whose check failed (resent), the order's picks or everything.
function CheckAllBar({ p, picked }: { p: Page; picked: Set<string> | null }) {
  const session = useSession();
  const [scope, setScope] = useState<"all" | "gradable" | "order">("all");
  if (!session) return null;
  const all = [...(p.origin ? [p.origin] : []), ...p.gradable, ...p.over, ...p.unpriced];
  const rows = scope === "order" ? all.filter((x) => picked?.has(x.listing_id))
    : scope === "gradable" ? [...(p.origin ? [p.origin] : []), ...p.gradable] : all;
  const ids = rows.filter((x) => !x.grade_odds || x.grade_odds.status === "failed").map((x) => x.listing_id);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      <span>Centering:</span>
      <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}
        className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200">
        <option value="all">every raw copy</option>
        <option value="gradable">the hit + gradable</option>
        <option value="order">the order</option>
      </select>
      {ids.length > 0 ? <CheckAll listingIds={ids} /> : <span className="text-gray-500">all checked</span>}
    </div>
  );
}

function SweepStatus({ p, busy, canRun, onRun }: { p: Page; busy: boolean; canRun: boolean; onRun: () => void }) {
  const s = p.sweep, r = s?.result;
  const running = s?.status === "queued" || s?.status === "running";
  return (
    <div className="text-right text-xs space-y-1">
      {canRun ? (
        <button disabled={busy || running} onClick={onRun}
          className="px-3 py-1 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 text-sm disabled:opacity-40">
          {running ? (s?.status === "queued" ? "Sweep queued…" : "Sweeping…") : s ? "Sweep again" : "Sweep store"}
        </button>
      ) : <span className="text-gray-500">Sign in to sweep the store.</span>}
      {s && !running && (
        <div className="text-gray-500 tabular-nums">
          {s.status === "done" && r ? (
            <>Swept {new Date(s.finished_at ?? s.created_at).toLocaleString()}: {r.items.toLocaleString()} listings, {r.matched.toLocaleString()} matched ({r.raw.toLocaleString()} raw)
              {!r.complete && <span className="text-amber-300/80"> · partial ({r.stopped_by})</span>}</>
          ) : <span className="text-red-300">Sweep {s.status}{s.error ? `: ${s.error}` : ""}</span>}
        </div>
      )}
      {running && <div className="text-gray-500">US singles only; a big store takes a few minutes.</div>}
    </div>
  );
}

function RuleEditor({ p, onSaved, onErr }: { p: Page; onSaved: () => void; onErr: (e: string) => void }) {
  const c = (v?: number) => (v == null ? "" : (v / 100).toFixed(2));
  const [first, setFirst] = useState(c(p.ship_rule.first_cents));
  const [each, setEach] = useState(c(p.ship_rule.each_add_cents));
  const [free, setFree] = useState(c(p.ship_rule.free_over_cents));
  const [cap, setCap] = useState(c(p.ship_rule.cap_cents));
  const [note, setNote] = useState(p.ship_rule.note ?? "");
  const [busy, setBusy] = useState(false);
  const inp = "w-20 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 tabular-nums placeholder:text-gray-600";
  const bad = [first, each, free, cap].some((v) => v.trim() !== "" && !(parseFloat(v) >= 0));
  const run = (body: Parameters<typeof saveRawSeller>[1]) => {
    setBusy(true);
    saveRawSeller(p.username, body).then(onSaved).catch((e) => onErr(String(e))).finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="first $" className={inp} />
      <input value={each} onChange={(e) => setEach(e.target.value)} placeholder="each +$" className={inp} />
      <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="free over $" className={inp} />
      <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="max ship $" className={inp} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" className="w-48 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-gray-200 placeholder:text-gray-600" />
      <button disabled={busy || bad} onClick={() => run({ ship_first_cents: toCents(first), ship_each_add_cents: toCents(each), free_ship_over_cents: toCents(free), ship_cap_cents: toCents(cap), ship_note: note })}
        className="px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 disabled:opacity-40">Save rule</button>
      {known(p.ship_rule) && (
        <button disabled={busy} onClick={() => run({ clear_ship_rule: true })} className="px-2 py-0.5 rounded border border-gray-700 text-gray-400">Clear</button>
      )}
      <label className="flex items-center gap-1 text-gray-400 ml-2">
        <input type="checkbox" checked={p.raw_tracked} disabled={busy} onChange={(e) => run({ raw_tracked: e.target.checked })} />
        Keep on the Raw sellers tab
      </label>
    </div>
  );
}

function Bucket({ title, note, rows, picked, toggle, open: startOpen, watch, empty }: {
  title: string; note: string; rows: SellerListing[]; picked: Set<string> | null; toggle: (id: string) => void;
  open?: boolean; watch?: boolean; empty?: string;
}) {
  const [open, setOpen] = useState(!!startOpen || rows.length <= 3);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 text-sm text-gray-200 flex flex-wrap items-baseline gap-2">
        <span className={`text-gray-600 text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        {title}<span className="text-xs text-gray-500">{note}</span>
      </button>
      {open && (rows.length === 0 ? (
        <div className="border-t border-gray-800 px-4 py-3 text-xs text-gray-500">{empty ?? "None."}</div>
      ) : (
        <div className="border-t border-gray-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-1.5 pl-4 pr-1 font-medium">Order</th>
                <th className="py-1.5 px-2 font-medium">Card</th>
                <th className="py-1.5 px-2 font-medium">Listing</th>
                <th className="py-1.5 px-2 font-medium text-right">Item</th>
                <th className="py-1.5 px-2 font-medium text-right" title="Item plus what it adds to this order's shipping">Adds</th>
                <th className="py-1.5 px-2 font-medium text-right">Raw mkt</th>
                <th className="py-1.5 px-2 font-medium text-right" title="The most to pay raw to grade (better grader)">Max</th>
                <th className="py-1.5 px-2 font-medium text-right">Under</th>
                <th className="py-1.5 px-2 font-medium text-right" title="The better grader's gem rate">P10</th>
                <th className="py-1.5 px-2 font-medium">Centering</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.listing_id} className={`border-t border-gray-800/60 ${x.passed ? "opacity-50" : ""}`}>
                  <td className="py-1.5 pl-4 pr-1"><input type="checkbox" checked={picked?.has(x.listing_id) ?? false} onChange={() => toggle(x.listing_id)} /></td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <Link to={`/cards/${x.display_key}`} className="text-gray-100 hover:text-indigo-300">{x.name}</Link>
                    <span className="text-gray-500"> · {x.set_code.toUpperCase()} {x.number}</span>
                    {!x.tracked && <span className="ml-1 text-[10px] text-gray-500 border border-gray-700 rounded px-1">untracked</span>}
                    {watch && <span className="ml-1"><WatchButton displayKey={x.display_key} compact /></span>}
                  </td>
                  <td className="py-1.5 px-2 max-w-[22rem]">
                    {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="block truncate text-indigo-300/80 hover:text-indigo-200">{x.title}</a> : <span className="block truncate">{x.title}</span>}
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="text-gray-500">{x.auction ? <>Auction · {endsIn(x.ends_at)}{x.bids != null && ` · ${x.bids} bids`}</> : "Buy Now"}{x.passed && " · passed"}</span>
                      <ItemNumber n={ebayItemNumber(x.listing_id)} />
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(x.item_cents)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-100">{usd(x.add_cents)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{usd(x.raw_market_cents)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(x.max_raw_cents)}{x.max_grader && <span className="text-gray-600"> {x.max_grader.toUpperCase()}</span>}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${x.under == null ? "text-gray-600" : x.under >= 0 ? "text-green-300" : "text-red-300"}`}>{pct(x.under)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{pct(x.p10)}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    {x.grade_odds && x.grade_odds.status !== "failed" ? <GradeOddsBadge o={x.grade_odds} compact /> : (
                      <span title={x.grade_odds?.error ? `Last check failed: ${x.grade_odds.error}` : undefined}>
                        {x.grade_odds && <span className="text-red-300/70 mr-1">failed ·</span>}
                        <CheckCentering listingId={x.listing_id} photos={x.image_count} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function Unmatched({ xs, total }: { xs: SweepUnmatch[]; total: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 text-sm text-gray-200 flex flex-wrap items-baseline gap-2">
        <span className={`text-gray-600 text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        Not matched ({total.toLocaleString()})
        <span className="text-xs text-gray-500">Titles the sweep couldn't tie to one catalog card (lots, other games, missing numbers). Priciest {xs.length} shown; check by eye.</span>
      </button>
      {open && (
        <ul className="border-t border-gray-800 px-4 py-2 text-xs space-y-1">
          {xs.map((x) => (
            <li key={x.listing_id} className="flex gap-3">
              <span className="tabular-nums text-gray-300 w-16 text-right shrink-0">{usd(x.price_cents)}</span>
              {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="truncate text-indigo-300/80 hover:text-indigo-200">{x.title}</a> : <span className="truncate">{x.title}</span>}
              {x.auction && <span className="text-gray-500 shrink-0">auction</span>}
              <span className="shrink-0 -mt-0.5"><ItemNumber n={ebayItemNumber(x.listing_id)} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
