import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBeatSP, type BeatGroup, type BeatSP as BeatData, type CurveLang } from "../lib/api";
import { cardThumb } from "../lib/thumb";
import WatchButton from "./WatchButton";
import { HelpDot } from "./HelpTip";

const pct = (v?: number) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const tone = (v?: number) => (v == null ? "text-gray-500" : v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "");
const SHOWN = 12;

// Which set × tier groups beat the S&P if bought today, S and A, each
// opening to its cards with a watchlist button.
export default function BeatSP({ lang, catLabel }: { lang: CurveLang; catLabel: (k: string) => string }) {
  const [grade, setGrade] = useState<"raw" | "psa-10">("psa-10");
  const [data, setData] = useState<BeatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState<Record<string, boolean>>({});
  const [why, setWhy] = useState<string | null>(null); // card whose reasons are open

  useEffect(() => {
    setData(null);
    setError(null);
    fetchBeatSP(grade, lang).then(setData).catch((e: Error) => setError(e.message));
  }, [grade, lang]);

  const key = (g: BeatGroup) => `${g.set_code}|${g.category}`;
  const tierList = (t: "S" | "A") => (data?.groups ?? []).filter((g) => g.tier === t);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">
            Outperforming the S&amp;P, by set and tier
            <HelpDot width="w-[28rem]" help={
              <>
                <p>Each card scores the <b>lower</b> of two yearly returns: its projected price two years out (its tier's release curve from where it is now, blended with its own trend, after the selling fee), and its own change over the last year. The curve alone is the same for every set of a tier; requiring the card's own year to agree is what separates sets.</p>
                <p className="mt-1"><b>S</b>: the median card scores {data ? Math.round(data.s_threshold * 100) : 20}%+/yr. <b>A</b>: out of print, past the buy window, beating the S&amp;P ({data ? Math.round(data.benchmark * 100) : 10}%/yr), and not pumped. <b>Pumped</b>: at 85%+ of its high and up 30%+ over the year.</p>
                <p className="mt-1">Past performance and a fitted curve, not a forecast.</p>
              </>
            } />
          </h2>
          <p className="text-xs text-gray-500">
            A forecast, not a scoreboard: groups expected to beat the S&amp;P if bought today. Click a set for its cards, and "why" on a card for
            what backs it (each group it belongs to against the whole market) and whether a card that's already run is momentum.
          </p>
        </div>
        <span className="inline-flex rounded border border-gray-700 overflow-hidden text-xs">
          {(["psa-10", "raw"] as const).map((g) => (
            <button key={g} onClick={() => setGrade(g)} className={`px-2 py-0.5 ${grade === g ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>{g === "raw" ? "Raw" : "PSA 10"}</button>
          ))}
        </span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!data && !error && <p className="text-xs text-gray-500">Loading…</p>}
      {data && (["S", "A"] as const).map((t) => {
        const list = tierList(t);
        const shown = all[t] ? list : list.slice(0, SHOWN);
        return (
          <div key={t} className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-200">
              <span className={`inline-block w-5 text-center rounded mr-1.5 ${t === "S" ? "bg-amber-500 text-black" : "bg-sky-700 text-white"}`}>{t}</span>
              {t === "S" ? "Highest expected return if bought today" : "Out of print, past the window, not pumped yet"}
              <span className="font-normal text-gray-500"> · {list.length} groups</span>
            </h3>
            {list.length === 0 ? <p className="text-xs text-gray-500 pl-7">None right now.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-1 pr-2 font-medium">Set · tier</th>
                      <th className="text-right py-1 px-2 font-medium" title="The median card's score: the lower of the curve and its own year">Score/yr</th>
                      <th className="text-right py-1 px-2 font-medium" title="Projected yearly return, held two years, after the selling fee">Curve/yr</th>
                      <th className="text-right py-1 px-2 font-medium" title="The cards' own change over the last ~12 months">Last year</th>
                      <th className="text-right py-1 px-2 font-medium" title="Today vs its highest monthly price">Of high</th>
                      <th className="text-right py-1 px-2 font-medium">Month</th>
                      <th className="text-right py-1 pl-2 font-medium">Cards</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-gray-300">
                    {shown.map((g) => {
                      const isOpen = open === key(g);
                      return (
                        <Fragment key={key(g)}>
                          <tr className={`cursor-pointer ${isOpen ? "bg-gray-800/40" : "hover:bg-gray-800/20"}`} onClick={() => setOpen(isOpen ? null : key(g))} title={g.why}>
                            <td className="py-1 pr-2 whitespace-nowrap">
                              <span className="text-gray-500 mr-1">{isOpen ? "▾" : "▸"}</span>
                              <span className="text-gray-100">{g.set_name}</span> <span className="text-gray-400">· {catLabel(g.category)}</span>
                              {g.lang !== "en" && <span className="ml-1 text-gray-500">{g.lang.toUpperCase()}</span>}
                              {!g.in_print && <span className="ml-1.5 text-sky-300">OOP</span>}
                              {g.pumped && <span className="ml-1.5 px-1 rounded bg-red-950/60 text-red-300" title="At 85%+ of its high and up 30%+ over the year">pumped</span>}
                              {g.basis === "curve" && <span className="ml-1.5 text-amber-300" title="No year of history yet: scored on the curve alone">curve only</span>}
                            </td>
                            <td className={`py-1 px-2 text-right font-medium ${tone(g.score)}`}>{pct(g.score)}</td>
                            <td className="py-1 px-2 text-right">{pct(g.exp_yearly_net)}</td>
                            <td className={`py-1 px-2 text-right ${tone(g.trailing_12m)}`}>{pct(g.trailing_12m)}</td>
                            <td className="py-1 px-2 text-right">{Math.round(g.now_vs_peak * 100)}%</td>
                            <td className="py-1 px-2 text-right">M{g.months_since_release}</td>
                            <td className="py-1 pl-2 text-right">{g.cards.length}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={7} className="pb-2 pl-5">
                                <div className="text-[11px] text-gray-500 py-1">{g.why}</div>
                                <table className="w-full text-xs">
                                  <tbody className="divide-y divide-gray-800/60">
                                    {g.cards.map((c) => (
                                      <Fragment key={c.display_key}>
                                      <tr className={c.stretched && !c.supported ? "opacity-70" : ""}>
                                        <td className="py-1 pr-2 w-8">{c.image_url && <img src={cardThumb(c.image_url)} alt="" loading="lazy" className="w-7 h-10 object-cover rounded-sm" />}</td>
                                        <td className="py-1 pr-2">
                                          <Link to={`/cards/${encodeURIComponent(c.display_key)}`} className="text-gray-100 hover:text-indigo-300">{c.name}</Link>
                                          <span className="text-gray-500"> #{c.number}</span>
                                          {c.stretched && (
                                            <span className={`ml-1.5 px-1 rounded text-[10px] ${c.supported ? "bg-emerald-950/60 text-emerald-300" : "bg-red-950/60 text-red-300"}`}
                                              title={c.verdict}>{c.supported ? "ran, with a record" : "momentum"}</span>
                                          )}
                                          {c.why && (
                                            <button onClick={(e) => { e.stopPropagation(); setWhy(why === c.display_key ? null : c.display_key); }}
                                              className="ml-1.5 text-[11px] text-indigo-300 hover:text-indigo-200">{why === c.display_key ? "hide why" : "why"}</button>
                                          )}
                                        </td>
                                        <td className="py-1 px-2 text-right" title={`Expected ${usd(c.exp_cents_24m)} in two years (${c.confidence} confidence)`}>
                                          {usd(c.price_cents)} <span className="text-gray-500">→ {usd(c.exp_cents_24m)}</span>
                                        </td>
                                        <td className={`py-1 px-2 text-right font-medium ${tone(c.score)}`} title="Score: the lower of curve and last year">{pct(c.score)}/yr</td>
                                        <td className="py-1 px-2 text-right text-gray-400" title="Curve / last year">{pct(c.exp_yearly_net)} · <span className={tone(c.trailing_12m)}>{pct(c.trailing_12m)}</span></td>
                                        <td className="py-1 px-2 text-right text-gray-400" title="Of its high · of its release price">
                                          {Math.round(c.now_vs_peak * 100)}% of high{c.now_vs_release != null && <> · {Math.round(c.now_vs_release * 100)}% of release</>}
                                        </td>
                                        <td className="py-1 pl-2 text-right"><WatchButton displayKey={c.display_key} compact /></td>
                                      </tr>
                                      {why === c.display_key && c.why && (
                                        <tr>
                                          <td colSpan={7} className="pb-2 pl-9">
                                            {c.verdict && <p className="text-xs text-gray-200 py-1">{c.verdict}</p>}
                                            <ul className="space-y-0.5">
                                              {c.why.map((f) => (
                                                <li key={f.label} className="text-[11px] text-gray-400 flex gap-2">
                                                  <span className={`shrink-0 w-4 text-center ${f.effect === "for" ? "text-green-400" : f.effect === "against" ? "text-red-400" : "text-gray-500"}`}>
                                                    {f.effect === "for" ? "✓" : f.effect === "against" ? "✗" : "·"}
                                                  </span>
                                                  <span><b className="text-gray-300 font-medium">{f.label}</b>: {f.detail}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </td>
                                        </tr>
                                      )}
                                      </Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {list.length > SHOWN && (
                  <button onClick={() => setAll({ ...all, [t]: !all[t] })} className="text-xs text-indigo-300 hover:text-indigo-200 mt-1">
                    {all[t] ? "Show fewer" : `Show all ${list.length}`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {data && <p className="text-[11px] text-gray-600">{data.scored_cards} cards scored · selling fee {Math.round(data.sell_fee_pct * 100)}% · built {new Date(data.built_at).toLocaleString()}</p>}
    </section>
  );
}
