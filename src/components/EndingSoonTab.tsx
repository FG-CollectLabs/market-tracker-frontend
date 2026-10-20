import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEndingSoon, runSnipePulse, type EndingAuction, type PulseStatus, type SnipeSignal } from "../lib/api";
import { useSession } from "../lib/auth";
import { formatCents } from "../lib/roi";
import { cardThumb } from "../lib/thumb";
import { HelpDot } from "./HelpTip";
import { Spinner, ErrorMsg } from "./Spinner";

// Ending soon: every live Fanatics auction closing in the next few hours,
// its current bid against what the card + grade is worth. For the last
// hour on the watchlist and for snipes on auctions nobody is watching.
// The snipe pulse sweeps the weekly auction 2 h before the close; in the
// last hour you scan by hand. Lots are flagged as three kinds of snipe:
// under the cost to make the slab, a deep discount to its value, and a Buy
// Now flip.

const money = (c?: number | null) => formatCents(c ?? null);
const GRADE: Record<string, string> = { raw: "Raw", "psa-10": "PSA 10", "psa-9": "PSA 9", "cgc-10": "CGC 10", "cgc-10-pristine": "CGC Pristine" };
const gradeLabel = (g: string) => GRADE[g] ?? g.toUpperCase().replace("-", " ");

function endsIn(iso: string, now: number): string {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return "ending";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ago(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

type Sort = "snipe" | "discount" | "ends" | "value";

const SIGNAL: Record<SnipeSignal, { label: string; cls: string; help: string }> = {
  under_mint: { label: "Under cost to make", cls: "bg-emerald-900/70 text-emerald-200 border-emerald-700", help: "All-in at the current bid is well under what it costs to make this slab by grading raw copies (raw price, grading fee and the odds of the grade)." },
  flip: { label: "Buy Now flip", cls: "bg-sky-900/70 text-sky-200 border-sky-700", help: "Win it and relist it as a Fanatics Buy Now at what Buy Nows sell for: the margin after the selling fee clears the snipe threshold." },
  deep_discount: { label: "Deep discount", cls: "bg-amber-900/60 text-amber-200 border-amber-700", help: "The current bid is far under what the card and grade is worth, whatever the supply or timing." },
};

const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function CopyBtn({ cents }: { cents: number }) {
  const [state, setState] = useState<"ok" | "err" | null>(null);
  const [msg, setMsg] = useState("");
  const copy = () => {
    navigator.clipboard
      .writeText(String(Math.round(cents / 100)))
      .then(() => {
        setState("ok");
        setTimeout(() => setState(null), 1500);
      })
      .catch((e: Error) => {
        setState("err");
        setMsg(e.message);
        setTimeout(() => setState(null), 1500);
      });
  };
  return (
    <>
      <button onClick={copy} className="print:hidden text-gray-500 hover:text-gray-200" title="Copy bid" aria-label="Copy bid">⧉</button>
      {state === "ok" && <span className="text-green-400 text-xs">✓</span>}
      {state === "err" && <span className="text-red-400 text-xs" title={msg}>✕</span>}
    </>
  );
}

function PulseBar({ pulse, now, onScanned }: { pulse?: PulseStatus; now: number; onScanned: () => void }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scan = async (sweep: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      await runSnipePulse(sweep);
      onScanned();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = pulse?.next_close;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs ${pulse?.active ? "border-emerald-700/70 bg-emerald-950/30" : "border-gray-800 bg-gray-900/40"}`}>
      <span className={`font-semibold ${pulse?.active ? "text-emerald-300" : "text-gray-400"}`}>
        {pulse?.active ? (pulse.swept ? "● Snipe window: swept, scan by hand" : "● Snipe window: sweeping") : "Snipe pulse idle"}
      </span>
      {!pulse?.active && pulse?.sweep_at && <span className="text-gray-400">auto sweep {new Date(pulse.sweep_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>}
      {close && <span className="text-gray-400">next close {new Date(close).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} ({endsIn(close, now)})</span>}
      {pulse?.at ? (
        <span className="text-gray-500">
          last scan {ago(pulse.at, now)} · {pulse.kind} · {pulse.cards} cards, {pulse.lots} lots, {pulse.requests} request{pulse.requests === 1 ? "" : "s"}, {(pulse.took_ms / 1000).toFixed(1)} s
          {pulse.error && <span className="ml-1.5 text-red-400">· {pulse.error}</span>}
        </span>
      ) : <span className="text-gray-500">no scan since the API started</span>}
      <HelpDot help="Weekly auction only (premier is left out). 2 hours before the close the API reads every tracked, watched and owned card's weekly lots once. After that it doesn't re-read on its own: press Scan now in the last hour (a few seconds; at most once a minute) to refresh the cards with lots closing. The window stays open 10 minutes past the close for extended bidding. Bids move between scans: open the auction before bidding." />
      <span className="flex-1" />
      {err && <span className="text-red-400">{err}</span>}
      {session && (
        <>
          <button disabled={busy || pulse?.running} onClick={() => scan(false)} title="Re-read the auctions of cards with lots closing next (a few seconds)"
            className="px-2 py-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50">{busy || pulse?.running ? "Scanning…" : "Scan now"}</button>
          <button disabled={busy || pulse?.running} onClick={() => scan(true)} title="Read every tracked card's auctions (about 2–3 minutes)"
            className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">Full sweep</button>
        </>
      )}
    </div>
  );
}

const HOURS = [1, 2, 3, 6, 24, 72];
const FILTERS_KEY = "endingSoon.filters";

interface SavedFilters {
  hours: number;
  snipesOnly: boolean;
  watchedOnly: boolean;
  noBids: boolean;
  minDisc: number;
  sort: Sort;
  alertMe?: boolean;
}

const DEFAULT_FILTERS: SavedFilters = { hours: 3, snipesOnly: false, watchedOnly: false, noBids: false, minDisc: 0, sort: "snipe" };

function loadFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const saved = JSON.parse(raw) as Partial<SavedFilters>;
    return {
      hours: HOURS.includes(saved.hours ?? 0) ? (saved.hours as number) : DEFAULT_FILTERS.hours,
      snipesOnly: saved.snipesOnly ?? DEFAULT_FILTERS.snipesOnly,
      watchedOnly: saved.watchedOnly ?? DEFAULT_FILTERS.watchedOnly,
      noBids: saved.noBids ?? DEFAULT_FILTERS.noBids,
      minDisc: typeof saved.minDisc === "number" && saved.minDisc >= 0 ? saved.minDisc : DEFAULT_FILTERS.minDisc,
      sort: ["snipe", "discount", "ends", "value"].includes(saved.sort as string) ? (saved.sort as Sort) : DEFAULT_FILTERS.sort,
      ...(saved.alertMe !== undefined ? { alertMe: saved.alertMe } : {}),
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function saveFilters(filters: SavedFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* private window or quota exceeded */
  }
}

export default function EndingSoonTab({ lang }: { lang: "" | "en" | "ja" | "zh" }) {
  const [hours, setHours] = useState(() => loadFilters().hours);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchEndingSoon>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedOnly, setWatchedOnly] = useState(() => loadFilters().watchedOnly);
  const [minDisc, setMinDisc] = useState(() => loadFilters().minDisc);
  const [noBids, setNoBids] = useState(() => loadFilters().noBids);
  const [sort, setSort] = useState<Sort>(() => loadFilters().sort);
  const [snipesOnly, setSnipesOnly] = useState(() => loadFilters().snipesOnly);
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(null);
    fetchEndingSoon(hours, snipesOnly).then(setData).catch((e: Error) => setError(e.message));
  }, [hours, snipesOnly, tick]);
  // Refresh every 2 minutes; the clock every 30 s.
  useEffect(() => {
    const a = setInterval(() => setTick((t) => t + 1), 120_000);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const filtersRef = useRef(false);
  useEffect(() => {
    if (filtersRef.current) saveFilters({ hours, snipesOnly, watchedOnly, noBids, minDisc, sort });
    else filtersRef.current = true;
  }, [hours, snipesOnly, watchedOnly, noBids, minDisc, sort]);

  const rows = useMemo(() => {
    const langOf = (code: string) => (code.startsWith("jp-") ? "ja" : code.startsWith("cn-") ? "zh" : "en");
    const xs = (data?.auctions ?? []).filter((a) =>
      (!lang || langOf(a.set_code) === lang) && (!watchedOnly || a.watched) && (!noBids || a.bids === 0) &&
      (minDisc <= 0 || (a.discount ?? -9) >= minDisc / 100));
    const key: Record<Sort, (a: EndingAuction) => number> = {
      snipe: (a) => -(a.strength ?? 0) * 10 - (a.discount ?? -9),
      discount: (a) => -(a.discount ?? -9),
      ends: (a) => new Date(a.ends_at).getTime(),
      value: (a) => -(a.value_cents ?? 0),
    };
    return [...xs].sort((a, b) => key[sort](a) - key[sort](b));
  }, [data, lang, watchedOnly, noBids, minDisc, sort]);

  if (error) return <ErrorMsg msg={error} />;
  if (!data) return <Spinner />;
  const premium = Math.round(data.settings.buyers_premium_pct * 100);
  const margin = Math.round(data.settings.target_margin * 100);
  const fee = Math.round((data.settings.sell_fee_pct ?? 0) * 100);
  const rules = data.settings.snipe;
  const oldest = data.auctions.reduce((m, a) => (a.bid_seen_at < m ? a.bid_seen_at : m), new Date().toISOString());

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 max-w-4xl">
        Every Fanatics auction closing soon, its current bid against what the card is worth (the Pricing API's estimate from recent sales, all-in).
        The weekly auction is swept 2 h before the close; in the last hour press Scan now for fresh bids. Snipes are flagged: under the cost to make the slab
        (by {pct(rules?.mint_gap)}+), {pct(rules?.discount)}+ under value, or a Buy Now flip clearing {pct(rules?.flip_margin)}. Bids can still move
        between scans, so check the listing before bidding. This page reloads every 2 minutes.
      </p>
      <PulseBar pulse={data.pulse} now={now} onScanned={() => setTick((t) => t + 1)} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {[1, 2, 3, 6, 24, 72].map((h) => (
            <button key={h} onClick={() => setHours(h)}
              className={`px-3 py-1 ${hours === h ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{h < 24 ? `${h} h` : `${h / 24} d`}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-emerald-300" title="Only auctions with a snipe signal">
          <input type="checkbox" checked={snipesOnly} onChange={(e) => setSnipesOnly(e.target.checked)} className="accent-emerald-500" /> Snipes only
        </label>
        <label className="flex items-center gap-1.5 text-gray-400">
          <input type="checkbox" checked={watchedOnly} onChange={(e) => setWatchedOnly(e.target.checked)} className="accent-indigo-500" /> Watchlist only
        </label>
        <label className="flex items-center gap-1.5 text-gray-400" title="Nobody has bid yet: the ones people aren't paying attention to">
          <input type="checkbox" checked={noBids} onChange={(e) => setNoBids(e.target.checked)} className="accent-indigo-500" /> No bids yet
        </label>
        <label className="flex items-center gap-1.5 text-gray-400">
          at least
          <input type="number" value={minDisc} onChange={(e) => setMinDisc(Number(e.target.value) || 0)}
            className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200" />% under value
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200">
          <option value="snipe">Strongest snipe</option>
          <option value="discount">Most under value</option>
          <option value="ends">Ending first</option>
          <option value="value">Highest value</option>
        </select>
        <button onClick={() => setTick((t) => t + 1)} className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white">Reload</button>
        <span className="text-gray-500">{rows.length} of {data.count} · oldest bid read {ago(oldest, now)}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">No auctions match in the next {hours} h.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-right px-3 py-2 font-medium">Ends in</th>
                <th className="text-right px-3 py-2 font-medium">Current bid<HelpDot help={`The highest bid when last read, and what you'd pay at it with the ${premium}% buyer's premium.`} /></th>
                <th className="text-right px-3 py-2 font-medium">Worth<HelpDot help="The Pricing API's estimate for this card and grade: a weighted median of recent sales (all-in), with PriceCharting when it agrees. Hover a value for its range." /></th>
                <th className="text-right px-3 py-2 font-medium">Under value<HelpDot help="1 − all-in at the current bid ÷ worth. Positive: you'd pay less than it's worth if the bidding stopped now." /></th>
                <th className="text-right px-3 py-2 font-medium">Vs. cost to make<HelpDot help={`What it costs to make this slab by grading raw copies (the grading break-even: raw price + fees ÷ the odds of the grade), and how the all-in bid compares. Flags at ${pct(rules?.mint_gap)} or more under.`} /></th>
                <th className="text-right px-3 py-2 font-medium">Buy Now flip<HelpDot help={`Relist it as a Fanatics Buy Now at the Buy Now sold median (or just under the cheapest live ask, if lower), minus the ${fee}% selling fee. Margin = net ÷ all-in − 1; flags at ${pct(rules?.flip_margin)}. Only when Buy Nows of it have sold.`} /></th>
                <th className="text-right px-3 py-2 font-medium">Bid up to<HelpDot help={`Whole-dollar bids, all including the ${premium}% premium: the most that leaves your ${margin}% margin on value, pays exactly the value, stays ${pct(rules?.mint_gap)} under the cost to make, and keeps the ${pct(rules?.flip_margin)} flip margin.`} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map((a, i) => {
                const d = a.discount;
                return (
                  <tr key={a.url ?? i} className={`align-top hover:bg-gray-900/40 ${a.signals?.length ? "bg-emerald-950/20 " : ""}${a.watched ? "border-l-4 border-l-yellow-500" : "border-l-4 border-l-transparent"}`}>
                    <td className="pl-3 py-2 w-12">
                      {a.image_url ? <img src={cardThumb(a.image_url)} alt="" loading="lazy" className="w-10 h-14 object-cover rounded-sm bg-gray-800" /> : <span className="block w-10 h-14 rounded-sm bg-gray-800/60" />}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/cards/${encodeURIComponent(a.display_key)}`} className="text-gray-100 hover:text-indigo-300">{a.name}</Link>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-mono">{a.set_code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</span>
                        <span className="ml-1.5 px-1 rounded bg-gray-800 text-gray-300">{gradeLabel(a.grade)}</span>
                        {a.watched && <span className="ml-1.5 text-yellow-300">★ watchlist</span>}
                        {a.in_prep && <span className="ml-1.5 text-indigo-300">{a.in_prep === "auction" ? "in late bids" : "in early bids"}</span>}
                        {a.marketplace === "premier" && <span className="ml-1.5 text-amber-300">premier</span>}
                      </div>
                      {a.signals?.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {a.signals.map((s) => (
                            <span key={s} title={SIGNAL[s]?.help} className={`px-1 rounded border text-[10px] leading-4 font-semibold ${SIGNAL[s]?.cls ?? "border-gray-700 text-gray-300"}`}>{SIGNAL[s]?.label ?? s}</span>
                          ))}
                        </div>
                      )}
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-300 hover:underline">open auction ↗</a>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-300 whitespace-nowrap">{endsIn(a.ends_at, now)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="text-gray-100">{money(a.bid_cents)} <span className="text-gray-500">· {a.bids} bid{a.bids === 1 ? "" : "s"}</span></div>
                      <div className="text-[10px] text-gray-500">{money(a.all_in_cents)} all-in · read {ago(a.bid_seen_at, now)}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={a.low_cents != null ? `Range ${money(a.low_cents)}–${money(a.high_cents)}` : undefined}>
                      <div className="text-gray-100">{money(a.value_cents)}</div>
                      <div className="text-[10px] text-gray-500">{a.value_source ?? "no value"}{a.confidence ? ` · ${a.confidence}` : ""}</div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${d == null ? "text-gray-600" : d >= 0.3 ? "text-green-400" : d >= 0.1 ? "text-green-300/80" : d >= 0 ? "text-gray-300" : "text-red-400"}`}>
                      {d == null ? "—" : `${Math.abs(Math.round(d * 100))}% ${d >= 0 ? "under" : "over"}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums"
                      title={a.mint_cents != null ? `Cost to make ${money(a.mint_cents)} vs ${money(a.all_in_cents)} all-in` : "No grading break-even for this card and grade"}>
                      {a.mint_cents != null ? (
                        <>
                          <div className="text-gray-100">{money(a.mint_cents)}</div>
                          <div className={`text-[10px] ${a.mint_gap == null ? "text-gray-500" : a.mint_gap <= -(rules?.mint_gap ?? 0.25) ? "text-emerald-300 font-semibold" : a.mint_gap < 0 ? "text-green-300/80" : "text-gray-500"}`}>
                            {a.mint_gap == null ? "" : `${Math.abs(Math.round(a.mint_gap * 100))}% ${a.mint_gap <= 0 ? "under" : "over"}`}
                          </div>
                        </>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums"
                      title={a.flip_list_cents != null ? `List at ${money(a.flip_list_cents)} (Buy Now sold median ${money(a.flip_sold_cents)}${a.flip_ask_cents != null ? `, cheapest ask ${money(a.flip_ask_cents)}` : ""}) → ${money(a.flip_net_cents)} after the ${fee}% fee, vs ${money(a.all_in_cents)} all-in` : "No Fanatics Buy Now sales of this card and grade"}>
                      {a.flip_list_cents != null ? (
                        <>
                          <div className="text-gray-100">{money(a.flip_list_cents)}</div>
                          <div className={`text-[10px] ${a.flip_margin == null ? "text-gray-500" : a.flip_margin >= (rules?.flip_margin ?? 0.3) ? "text-sky-300 font-semibold" : a.flip_margin >= 0 ? "text-gray-400" : "text-red-400/80"}`}>
                            {money(a.flip_net_cents)} net{a.flip_margin != null ? ` · ${a.flip_margin >= 0 ? "+" : ""}${Math.round(a.flip_margin * 100)}%` : ""}
                          </div>
                        </>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.max_bid_at_margin_cents != null && (
                        <>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-green-400 font-medium" title={`Keeps your ${margin}% margin`}>{money(a.max_bid_at_margin_cents)}</span>
                            <CopyBtn cents={a.max_bid_at_margin_cents} />
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px]">
                            <span className="text-gray-500" title="Pays exactly the value all-in">{money(a.max_bid_at_value_cents)} at value</span>
                            <CopyBtn cents={a.max_bid_at_value_cents ?? 0} />
                          </div>
                        </>
                      )}
                      {a.max_bid_for_mint_cents != null && (
                        <div className="flex items-center justify-end gap-1 text-[10px]">
                          <span className="text-emerald-300/90" title={`Stays ${pct(rules?.mint_gap)} under the cost to make`}>{money(a.max_bid_for_mint_cents)} vs make</span>
                          <CopyBtn cents={a.max_bid_for_mint_cents} />
                        </div>
                      )}
                      {a.max_bid_for_flip_cents != null && (
                        <div className="flex items-center justify-end gap-1 text-[10px]">
                          <span className="text-sky-300/90" title={`Keeps the ${pct(rules?.flip_margin)} flip margin`}>{money(a.max_bid_for_flip_cents)} to flip</span>
                          <CopyBtn cents={a.max_bid_for_flip_cents} />
                        </div>
                      )}
                      {a.max_bid_at_margin_cents == null && a.max_bid_for_mint_cents == null && a.max_bid_for_flip_cents == null && "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
