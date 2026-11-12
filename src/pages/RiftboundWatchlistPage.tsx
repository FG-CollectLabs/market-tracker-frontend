import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRiftboundCards, fetchRiftboundListings, fetchSettings, fetchWatchlist, type RbCard, type RbListing, type WatchItem } from "../lib/api";
import type { GraderCfg } from "../lib/gradeEv";
import { RB_GRADERS, loadRates, rbEv } from "../lib/rbEv";
import { useSession } from "../lib/auth";
import { Spinner } from "../components/Spinner";
import WatchButton, { onWatchChange } from "../components/WatchButton";
import { KindBadge } from "./RiftboundPage";

// The Riftbound watchlist: its own list (the Pokémon one is separate), each
// card with its market and its live eBay / Fanatics copies: the cheapest raw
// and slab, and the raw copy with the best grading EV at its price.

const usd = (c: number | null | undefined) =>
  c == null ? "—" : Math.abs(c) >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`;

export default function RiftboundWatchlistPage() {
  const session = useSession();
  const [watch, setWatch] = useState<WatchItem[] | null>(null);
  const [cards, setCards] = useState<RbCard[] | null>(null);
  const [listings, setListings] = useState<RbListing[]>([]);
  const [graders, setGraders] = useState<Record<string, GraderCfg>>({});
  const [sellFee, setSellFee] = useState(0.1325);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    fetchWatchlist(true, false, "riftbound").then((r) => setWatch(r.items)).catch((e) => setErr(String(e)));
    fetchRiftboundListings().then((r) => setListings(r.listings)).catch(() => {});
  };
  useEffect(() => {
    if (!session) return;
    load();
    fetchRiftboundCards({ all: true }).then((r) => setCards(r.cards)).catch(() => setCards([]));
    fetchSettings().then(({ settings }) => {
      setGraders(settings.graders as unknown as Record<string, GraderCfg>);
      const s = settings as unknown as { exit_fee_pct?: number };
      if (s.exit_fee_pct != null) setSellFee(s.exit_fee_pct);
    }).catch(() => {});
    return onWatchChange(load);
  }, [session]);

  const byKey = useMemo(() => new Map((cards ?? []).map((c) => [c.display_key, c])), [cards]);
  const live = useMemo(() => {
    const m = new Map<string, RbListing[]>();
    for (const l of listings) m.set(l.display_key, [...(m.get(l.display_key) ?? []), l]);
    return m;
  }, [listings]);
  const opts = useMemo(() => ({ graders, sellFee, businessDays: true, buffer: 0.1, rates: loadRates() }), [graders, sellFee]);

  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2 || !cards) return [];
    return cards.filter((c) => c.name.toLowerCase().includes(t) || (c.printed_number ?? "").toLowerCase().includes(t)).slice(0, 12);
  }, [q, cards]);

  if (!session) {
    return <div className="max-w-2xl mx-auto py-8 text-sm text-gray-400">Sign in to see the Riftbound watchlist.</div>;
  }
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Riftbound watchlist</h1>
        <p className="text-sm text-gray-400">
          Separate from the Pokémon watchlist. Watched cards get eBay auction scans every 3 hours; their live copies show here and
          on <Link to="/rb/deals" className="text-sky-400 hover:text-sky-300">Deals</Link>.
        </p>
      </header>

      <section className="space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a card: search name or number"
          className="w-full sm:w-96 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-sm text-gray-200" />
        {found.length > 0 && (
          <div className="rounded-lg border border-gray-800 divide-y divide-gray-900 max-w-2xl">
            {found.map((c) => (
              <div key={c.display_key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <WatchButton displayKey={c.display_key} compact />
                <KindBadge kind={c.kind} />
                <span className="text-gray-200 truncate flex-1">{c.name}</span>
                <span className="text-xs text-gray-500 uppercase">{c.set_code} {c.printed_number}</span>
                <span className="tabular-nums text-gray-400 w-20 text-right">{usd(c.market_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!watch ? <Spinner /> : watch.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing watched yet: star cards here, on a set page or on Deals.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="text-sm min-w-full">
            <thead className="bg-gray-900 text-xs text-gray-400">
              <tr>
                <th className="text-left font-normal px-3 py-2">Card</th>
                <th className="text-right font-normal px-2">TCGplayer</th>
                <th className="text-right font-normal px-2">4 wk</th>
                <th className="text-right font-normal px-2">Live copies</th>
                <th className="text-right font-normal px-2">Cheapest raw</th>
                <th className="text-right font-normal px-2">Cheapest slab</th>
                <th className="text-right font-normal px-2">Best raw to grade</th>
              </tr>
            </thead>
            <tbody>
              {watch.map((w) => {
                const c = byKey.get(w.display_key);
                const ls = live.get(w.display_key) ?? [];
                const raws = ls.filter((l) => l.grade_key === "raw");
                const slabs = ls.filter((l) => l.grade_key !== "raw");
                const cheapest = (xs: RbListing[]) => xs.reduce<RbListing | null>((a, b) => (!a || b.price_cents + b.shipping_cents < a.price_cents + a.shipping_cents ? b : a), null);
                const cr = cheapest(raws), cs = cheapest(slabs);
                let best: { l: RbListing; ev: number; g: string } | null = null;
                for (const l of raws) {
                  const allIn = l.price_cents + l.shipping_cents;
                  const g = l.graded;
                  const card = {
                    raw_price_cents: l.pc_raw_cents ?? l.tcgplayer_cents ?? allIn, psa_9_cents: g["psa 9"] ?? null, psa_10_cents: g["psa 10"] ?? null,
                    cgc_10_cents: g["cgc 10"] ?? null, cgc_pristine_cents: g["cgc Pristine 10"] ?? null, bgs_9_5_cents: g["bgs 9.5"] ?? null,
                    bgs_10_cents: g["bgs 10"] ?? null, bgs_10_black_cents: g["bgs 10 Black"] ?? null,
                  };
                  const ev = rbEv(card as never, opts, allIn);
                  for (const gr of RB_GRADERS) if (ev[gr] && (!best || ev[gr]!.evCents > best.ev)) best = { l, ev: ev[gr]!.evCents, g: gr };
                }
                const chg = c && c.market_cents != null && c.cents_4w_ago ? (c.market_cents - c.cents_4w_ago) / c.cents_4w_ago : null;
                return (
                  <tr key={w.display_key} className="border-t border-gray-900">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-[16rem]">
                        {(c?.image_url || w.image_url) && <img src={c?.image_url || w.image_url} alt="" loading="lazy" className="w-9 rounded" />}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Link to={`/cards/${w.display_key}`} className="text-gray-100 hover:text-white">{w.name}</Link>
                            <WatchButton displayKey={w.display_key} compact />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            {c && <KindBadge kind={c.kind} />}
                            <span className="uppercase">{w.set_code}</span><span>{c?.printed_number ?? w.number}</span>
                            <span>· {w.intent}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-2 tabular-nums text-gray-200">{usd(c?.market_cents)}</td>
                    <td className={`text-right px-2 tabular-nums ${chg == null ? "text-gray-600" : chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${Math.round(chg * 100)}%`}
                    </td>
                    <td className="text-right px-2 text-gray-400">{ls.length || "—"}</td>
                    <td className="text-right px-2 tabular-nums">{cr ? <ListingLink l={cr} /> : <span className="text-gray-700">—</span>}</td>
                    <td className="text-right px-2 tabular-nums">{cs ? <ListingLink l={cs} grade /> : <span className="text-gray-700">—</span>}</td>
                    <td className="text-right px-2 tabular-nums">
                      {best ? (
                        <span className={best.ev > 0 ? "text-emerald-400" : "text-rose-400"}>
                          {best.ev >= 0 ? "+" : "−"}{usd(Math.abs(best.ev))} <span className="text-[11px] text-gray-500">{best.g.toUpperCase()}</span>
                        </span>
                      ) : <span className="text-gray-700">—</span>}
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

function ListingLink({ l, grade }: { l: RbListing; grade?: boolean }) {
  const text = `${usd(l.price_cents + l.shipping_cents)}${grade ? ` ${l.grade_key.toUpperCase()}` : ""}${l.marketplace !== "fixed" ? " bid" : ""}`;
  return l.url
    ? <a href={l.url} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-white">{text} ↗</a>
    : <span className="text-gray-300">{text}</span>;
}
