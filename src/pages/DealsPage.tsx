import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuctionDealsTab from "../components/AuctionDealsTab";
import MakeVsMarketTab from "../components/MakeVsMarketTab";
import EndingSoonTab from "../components/EndingSoonTab";
import { fetchDeals, fetchFindings, type AgentFinding, type AnalysisSettings, type Deal } from "../lib/api";
import { HelpDot } from "../components/HelpTip";
import { PrepLegend, PrepTags, prepRowClass, usePrepMarks } from "../components/PrepMarks";
import { formatCents } from "../lib/roi";
import { ACTION_STYLE } from "../components/BuyingGuide";
import { Spinner, ErrorMsg } from "../components/Spinner";
import { cardThumb } from "../lib/thumb";
import { FairBar, PHASE_STYLE, PHASE_LABEL } from "../components/BuyingGuide";

// Sub-tabs: this week's auctions first, then the other buying plays.
const TABS = [
  { key: "auctions", label: "This week's auctions" },
  { key: "ending", label: "Ending soon" },
  { key: "make", label: "Market vs cost to make" },
  { key: "buy_now", label: "Buy Now under max" },
  { key: "buy_raw_to_grade", label: "Grade raw · PSA" },
  { key: "buy_raw_to_grade_cgc", label: "Grade raw · CGC" },
  { key: "buy_psa10", label: "Buy PSA 10s" },
] as const;

const TAB_BLURB: Record<string, string> = {
  buy_now: "Buy Nows listed under the most you could pay and still clear your margin.",
  buy_raw_to_grade: "Raw cards worth grading with PSA: EV after fees at the public gem rate.",
  buy_raw_to_grade_cgc: "Raw cards worth grading with CGC (Pristine upside counted): EV after fees at the public gem rate.",
  buy_psa10: "PSA 10s that cost less than grading for one.",
};

// What "Max" and "Margin" mean on each tab, and how they're worked out.
function maxHelp(kind: string, st: AnalysisSettings | null) {
  const fee = st ? `${(st.exit_fee_pct * 100).toFixed(2).replace(/\.?0+$/, "")}%` : "the selling fee";
  const m = st ? `${Math.round(st.target_margin * 100)}%` : "your target margin";
  switch (kind) {
    case "buy_now":
      return (
        <>
          <div className="font-semibold text-gray-100">Max: the most to pay for the Buy Now and still make your {m} margin reselling it</div>
          <div className="my-1.5 rounded bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-200">max = market × (1 − {fee} selling fee) ÷ (1 + {m} margin)</div>
          <p>It's a resale cap, <span className="text-gray-100">not</span> the cost to make one by grading. Market is the card's value from recent sold prices (the Market column); the fee is the resale fee (eBay's, in Settings as exit fee).</p>
          <p className="mt-1">A listing shows here when its price (the ask) is at or under the max. For a 10, the cost to make one by grading is shown under the max to compare: an ask under both is cheaper than reselling needs and cheaper than grading for it.</p>
        </>
      );
    case "buy_raw_to_grade":
    case "buy_raw_to_grade_cgc":
      return <><div className="font-semibold text-gray-100">Max: the most to pay for a raw copy and still clear your minimum grading return</div><p>From the grading EV at the public gem rate: fees, shipping, sourcing and time included. Break-even below it is where grading nets $0.</p></>;
    case "buy_psa10":
      return <><div className="font-semibold text-gray-100">Max: the highest Fanatics hammer bid that keeps your {m} margin</div><p>max all-in = market × (1 − {fee}) ÷ (1 + {m}), then ÷ (1 + buyer's premium) and rounded down to whole dollars.</p></>;
    default:
      return <><div className="font-semibold text-gray-100">Max: the most to pay that keeps your {m} margin</div></>;
  }
}

function marginHelp(kind: string) {
  if (kind === "buy_now") return <><div className="font-semibold text-gray-100">Margin at the ask</div><div className="my-1.5 rounded bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-200">margin = market × (1 − selling fee) ÷ ask − 1</div><p>What you'd make buying at the listed price and reselling at market.</p></>;
  if (kind === "buy_psa10") return <><div className="font-semibold text-gray-100">How much cheaper the 10 is than grading for one</div><p>The grading return turned around: the more grading loses, the better buying the slab is.</p></>;
  if (kind.startsWith("buy_raw")) return <><div className="font-semibold text-gray-100">Grading return</div><p>Expected profit after every cost ÷ the cost of a graded copy, at the public gem rate.</p></>;
  return <><div className="font-semibold text-gray-100">Margin</div><p>Resale after fees ÷ what you'd pay − 1.</p></>;
}

const KIND_LABEL: Record<string, string> = {
  bid_auction: "Bid",
  buy_now: "Buy Now",
  buy_raw_to_grade: "Grade · PSA",
  buy_raw_to_grade_cgc: "Grade · CGC",
  buy_psa10: "Buy PSA 10",
};

export default function DealsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "auctions";
  const lang = (["en", "ja", "zh"].includes(params.get("lang") ?? "") ? params.get("lang") : "") as "" | "en" | "ja" | "zh";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Deals</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex rounded border border-gray-700 overflow-hidden">
          {([["", "All languages"], ["en", "English"], ["ja", "Japanese"], ["zh", "Chinese"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => set("lang", k)}
              className={`px-3 py-1 ${lang === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-gray-800 text-sm">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => set("tab", t.key === "auctions" ? "" : t.key)}
            className={`px-3 py-1.5 -mb-px border-b-2 ${tab === t.key ? "border-indigo-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "auctions" ? <AuctionDealsTab lang={lang} /> : tab === "make" ? <MakeVsMarketTab lang={lang} /> : tab === "ending" ? <EndingSoonTab lang={lang} /> : <OpportunitiesTab kind={tab} lang={lang} />}
    </div>
  );
}

// One kind of live buying opportunity, ranked. The same list the agent's
// find_deals tool returns.
function OpportunitiesTab({ kind, lang }: { kind: string; lang: "" | "en" | "ja" | "zh" }) {
  const [afterHype, setAfterHype] = useState(false);
  const [vetted, setVetted] = useState<Map<string, AgentFinding[]>>(new Map());
  useEffect(() => {
    fetchFindings({ kind: "agent_deal_vetting", limit: 500 })
      .then((r) => {
        const m = new Map<string, AgentFinding[]>();
        for (const f of r.findings) {
          if (!f.display_key || Date.now() - new Date(f.created_at).getTime() > 7 * 86400e3) continue;
          m.set(f.display_key, [...(m.get(f.display_key) ?? []), f]);
        }
        setVetted(m);
      })
      .catch(() => undefined);
  }, []);
  const [target, setTarget] = useState<number | null>(null); // null = saved setting
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [st, setSt] = useState<AnalysisSettings | null>(null);
  const marks = usePrepMarks();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeals(null);
    setError(null);
    fetchDeals({ kind, afterHype, lang: lang || undefined, targetMargin: target == null ? undefined : target / 100, limit: 200 })
      .then((r) => {
        setDeals(r.deals);
        setSt(r.settings);
        if (target == null) setTarget(Math.round(r.settings.target_margin * 100));
      })
      .catch((e: Error) => setError(e.message));
  }, [kind, target, afterHype, lang]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{TAB_BLURB[kind]} Margin is after the resale fee (grading: EV after fees).</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-gray-400"
          title="Only cards at or past their typical post-release bottom (release curves; provisional until more sets are tracked)">
          <input type="checkbox" checked={afterHype} onChange={(e) => setAfterHype(e.target.checked)} className="accent-indigo-500" />
          Past hype cycle only
        </label>
        <label className="flex items-center gap-1.5 text-gray-400">
          Target margin
          <input type="number" min={0} max={200} step={5} value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value) || 0)}
            className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />%
        </label>
        {marks.on && <PrepLegend day={marks.day} />}
      </div>
      {error && <ErrorMsg msg={error} />}
      {!deals && !error && <Spinner />}
      {deals && deals.length === 0 && <p className="text-sm text-gray-500">Nothing clears your margin right now.</p>}
      {deals && deals.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium" colSpan={2}>Card</th>
                <th className="text-left px-3 py-2 font-medium">Do</th>
                <th className="text-left px-3 py-2 font-medium">Why</th>
                <th className="text-right px-3 py-2 font-medium">Max<HelpDot help={maxHelp(kind, st)} /></th>
                <th className="text-right px-3 py-2 font-medium">Market</th>
                <th className="text-left px-3 py-2 font-medium" title="Fair range of the 10: cost to make one by grading x how cards of the same desirability trade">Fair range</th>
                <th className="text-right px-3 py-2 font-medium">{kind === "buy_now" ? "Margin at ask" : "Margin"}<HelpDot help={marginHelp(kind)} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {deals.map((d, i) => (
                <tr key={i} className={`align-top hover:bg-gray-900/40 ${marks.on ? prepRowClass(marks.entries(d.display_key), marks.watched.has(d.display_key), d.action.grade ?? "") : ""}`}>
                  <td className="pl-3 py-2 w-14">
                    <Link to={`/cards/${encodeURIComponent(d.display_key)}`} className="group relative block">
                      {d.image_url ? (
                        <>
                          <img src={cardThumb(d.image_url)} alt={d.name} loading="lazy" className="w-12 h-[67px] object-cover rounded-sm bg-gray-800" />
                          <img src={d.image_url} alt="" loading="lazy"
                            className="pointer-events-none absolute left-14 top-0 z-20 hidden w-56 max-w-none rounded-lg shadow-2xl ring-1 ring-gray-700 group-hover:block" />
                        </>
                      ) : (
                        <span className="block w-12 h-[67px] rounded-sm bg-gray-800/60" />
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link to={`/cards/${encodeURIComponent(d.display_key)}`} className="text-gray-100 hover:text-indigo-300">{d.name}</Link>
                    <div className="text-[11px] text-gray-500 font-mono">{d.set_code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</div>
                    {marks.on && <PrepTags entries={marks.entries(d.display_key)} watched={marks.watched.has(d.display_key)} grade={d.action.grade ?? ""} />}
                    {d.months_since_release != null && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        month {Math.floor(d.months_since_release)}
                        {d.phase && d.phase !== "unknown" && (
                          <span className={`ml-1.5 px-1 rounded text-[10px] ${PHASE_STYLE[d.phase]}`}
                            title={d.timing_provisional ? "Provisional: the release curve rests on few sets so far" : undefined}>
                            {d.post_hype ? "past hype" : PHASE_LABEL[d.phase]}{d.timing_provisional ? "*" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[11px] font-medium ${ACTION_STYLE[d.action.kind]}`}>{KIND_LABEL[d.action.kind] ?? d.action.kind}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400 max-w-xl">
                    <div className="text-gray-200">{d.action.headline}</div>
                    {d.action.why}
                    {vetted.get(d.display_key)?.map((f) => (
                      <div key={f.id} className={`mt-1 ${f.verdict === "flag" ? "text-amber-300" : "text-green-400/90"}`} title={f.details?.title}>
                        {f.verdict === "flag" ? "⚑ Agent flagged a listing" : "✓ Agent vetted a listing"}
                        {f.details?.issues?.length ? `: ${f.details.issues.join(", ").replace(/_/g, " ")}` : ""} — {f.summary}
                        {f.details?.url && <> <a href={f.details.url} target="_blank" rel="noreferrer" className="text-indigo-300">listing</a></>}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-100">
                    <span title={kind === "buy_now" && st && d.action.max_cents != null && d.market_cents
                      ? `${formatCents(d.market_cents)} market × (1 − ${(st.exit_fee_pct * 100).toFixed(2)}% fee) ÷ (1 + ${Math.round(st.target_margin * 100)}% margin) = ${formatCents(d.action.max_cents)}`
                      : undefined} className={kind === "buy_now" ? "cursor-help border-b border-dotted border-gray-500" : ""}>
                      {d.action.max_cents != null ? formatCents(d.action.max_cents) : "—"}
                    </span>
                    {d.ask_cents != null && <div className="text-[10px] text-gray-300" title="The listed Buy Now price">ask {formatCents(d.ask_cents)}</div>}
                    {d.cost_to_make_cents != null && (
                      <div className={`text-[10px] ${d.ask_cents != null && d.ask_cents < d.cost_to_make_cents ? "text-green-400" : "text-gray-500"}`}
                        title="What it costs to make this 10 by grading raw copies (Market vs cost to make tab)">
                        cost to make {formatCents(d.cost_to_make_cents)}{d.ask_cents != null && d.ask_cents < d.cost_to_make_cents ? " · ask under it" : ""}
                      </div>
                    )}
                    {d.action.metrics?.break_even_cents != null && (
                      <div className="text-[10px] text-gray-500" title="Never pay this much: grading nets $0 here">break-even {formatCents(d.action.metrics.break_even_cents)}</div>
                    )}
                    {d.action.metrics?.bottom_cents != null && d.action.metrics.phase === "falling" && (
                      <div className="text-[10px] text-gray-500" title={`Expected bottom in ~${Math.round(d.action.metrics.months_to_bottom)} months`}>bottom ~{formatCents(d.action.metrics.bottom_cents)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">{d.market_cents ? formatCents(d.market_cents) : "—"}</td>
                  <td className="px-3 py-2 min-w-[9rem]">{d.fair?.high_cents ? <FairBar f={d.fair} compact /> : <span className="text-gray-600">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-400">{`${d.margin > 0 ? "+" : ""}${(d.margin * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
