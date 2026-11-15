import { useEffect, useMemo, useState } from "react";
import {
  fetchSealedProducts, fetchSealedReprints, fetchSealedTiming, markSealedReprint,
  type SealedKind, type SealedKindTiming, type SealedProduct, type SealedReprints, type SealedRet,
} from "../lib/api";
import { Spinner } from "../components/Spinner";

// Sealed timing: when after release each kind of sealed product is best
// bought, and how long to wait after a reprint's first signal.

const COLORS: Record<SealedKind, string> = {
  etb: "#818cf8", pc_etb: "#f472b6", booster_box: "#34d399", booster_bundle: "#fbbf24", booster_pack: "#60a5fa",
};
const HOLDS = ["12", "24", "36"];
const pct = (v: number | null | undefined, digits = 0) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
const usd = (c: number | null | undefined) => (c == null ? "–" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);
const tone = (v: number | null | undefined) => (v == null ? "text-gray-600" : v >= 0.25 ? "text-emerald-300" : v >= 0 ? "text-emerald-200/70" : "text-rose-300");

function Curves({ kinds, on }: { kinds: SealedKindTiming[]; on: Set<SealedKind> }) {
  const shown = kinds.filter((k) => on.has(k.kind) && k.curve.length > 1);
  const maxM = Math.max(12, ...shown.map((k) => k.curve[k.curve.length - 1].month));
  const vals = shown.flatMap((k) => k.curve.map((p) => p.change));
  const lo = Math.min(-0.2, ...vals), hi = Math.max(0.5, ...vals);
  const W = 720, H = 260, L = 44, B = 24;
  const x = (m: number) => L + (m / maxM) * (W - L - 8);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  const ticks = [lo, 0, hi / 2, hi].map((v) => Math.round(v * 10) / 10);
  if (!shown.length) return <div className="text-sm text-gray-500">No curves yet: run import-sealed.</div>;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-3xl">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#6b7280" : "#1f2937"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{pct(t)}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(maxM / 12) + 1 }, (_, i) => i * 12).map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">{m === 0 ? "release" : `${m / 12}y`}</text>
        ))}
        {shown.map((k) => (
          <polyline key={k.kind} fill="none" stroke={COLORS[k.kind]} strokeWidth={2}
            points={k.curve.map((p) => `${x(p.month)},${y(p.change)}`).join(" ")} />
        ))}
      </svg>
    </div>
  );
}

function RetCell({ r }: { r?: SealedRet }) {
  if (!r) return <td className="px-2 py-1 text-right text-gray-700">–</td>;
  return (
    <td className="px-2 py-1 text-right tabular-nums" title={`${r.n} products · middle half ${pct(r.p25)} to ${pct(r.p75)} · ${pct(r.annualized, 1)} a year`}>
      <span className={tone(r.median)}>{pct(r.median)}</span>
      <span className="ml-1 text-[10px] text-gray-500">{r.up_share != null ? `${Math.round(r.up_share * 100)}%↑` : ""}</span>
    </td>
  );
}

export default function SealedTimingPage() {
  const [kinds, setKinds] = useState<SealedKindTiming[] | null>(null);
  const [method, setMethod] = useState("");
  const [on, setOn] = useState<Set<SealedKind>>(new Set(["etb", "pc_etb", "booster_box", "booster_bundle", "booster_pack"]));
  const [kind, setKind] = useState<SealedKind>("etb");
  const [rp, setRp] = useState<SealedReprints | null>(null);
  const [products, setProducts] = useState<SealedProduct[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const [era, setEra] = useState("all");
  const [eras, setEras] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => {
    setKinds(null);
    fetchSealedTiming(era).then((r) => { setKinds(r.kinds); setMethod(r.method); setEras(r.eras ?? []); }).catch((e) => setErr(String(e)));
  }, [era]);
  const loadKind = (k: SealedKind) => {
    setRp(null); setProducts(null);
    fetchSealedReprints(k).then(setRp).catch((e) => setErr(String(e)));
    fetchSealedProducts(k).then((r) => setProducts(r.products)).catch((e) => setErr(String(e)));
  };
  useEffect(() => loadKind(kind), [kind]);
  const cur = useMemo(() => kinds?.find((k) => k.kind === kind), [kinds, kind]);

  const mark = async (pid: number, month: string, status: "confirmed" | "rejected" | "clear") => {
    setBusy(`${pid}-${month}`);
    try { await markSealedReprint(pid, month, status); loadKind(kind); } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  };

  const tab = (k: SealedKindTiming) => (
    <button key={k.kind} onClick={() => setKind(k.kind)}
      className={`rounded px-2.5 py-1 text-xs ${kind === k.kind ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
      {k.label} <span className="text-gray-500">{k.with_history}/{k.products}</span>
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Sealed timing</h1>
        <p className="text-sm text-gray-400 max-w-4xl">
          When English Pokémon sealed is best bought: the typical price path by months since the set&apos;s release, what buying at each
          month returned 12, 24 and 36 months later, and how long to wait after a reprint&apos;s first signal. From PriceCharting&apos;s monthly
          charts, so timing is to the month. Returns lean on the 2020-22 boom and on the products PriceCharting still lists: compare eras,
          and read the starred month as a range.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {eras.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-gray-500 mr-1" title="By the set's release date. The 2020-22 boom lifted everything bought before it, so compare eras before trusting a number.">Sets:</span>
          {eras.map((e) => (
            <button key={e.key} onClick={() => setEra(e.key)}
              className={`rounded px-2.5 py-1 ${era === e.key ? "bg-indigo-600 text-white" : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200"}`}>{e.label}</button>
          ))}
        </div>
      )}
      {!kinds ? <Spinner /> : (
        <>
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-300 font-medium">Price vs release month</span>
              {kinds.map((k) => (
                <label key={k.kind} className="flex items-center gap-1 text-gray-400">
                  <input type="checkbox" checked={on.has(k.kind)} onChange={() => setOn((s) => { const n = new Set(s); if (n.has(k.kind)) n.delete(k.kind); else n.add(k.kind); return n; })} />
                  <span style={{ color: COLORS[k.kind] }}>●</span> {k.label}
                </label>
              ))}
            </div>
            <Curves kinds={kinds} on={on} />
            <p className="text-[11px] text-gray-500 max-w-4xl">{method}</p>
          </section>

          <div className="flex flex-wrap gap-1">{kinds.map(tab)}</div>

          {cur && (
            <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <div className="flex flex-wrap items-baseline gap-4 text-sm">
                <span className="text-gray-200 font-medium">{cur.label}: when to buy</span>
                {HOLDS.map((h) => cur.best_buy_month[h] != null && (
                  <span key={h} className="text-xs text-gray-400">hold {h}m → buy at <span className="text-emerald-300 font-medium">month {cur.best_buy_month[h]}</span></span>
                ))}
              </div>
              {cur.buy.length === 0 ? <div className="text-sm text-gray-500">Not enough products with history yet.</div> : (
                <div className="overflow-x-auto max-h-[420px]">
                  <table className="text-xs">
                    <thead className="text-gray-500 sticky top-0 bg-gray-900">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">Buy at month</th>
                        {HOLDS.map((h) => <th key={h} className="px-2 py-1 text-right font-medium" title="Median return; share that went up">Hold {h}m</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cur.buy.map((b) => (
                        <tr key={b.buy_month} className="border-t border-gray-800">
                          <td className="px-2 py-1 text-gray-300">
                            {b.buy_month}
                            {HOLDS.some((h) => cur.best_buy_month[h] === b.buy_month) && <span className="ml-1 text-emerald-400">★</span>}
                          </td>
                          {HOLDS.map((h) => <RetCell key={h} r={b.returns[h]} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-4 text-sm">
              <span className="text-gray-200 font-medium">Reprints: how long to wait after the first signal</span>
              {rp && ["12", "24"].map((h) => rp.best_wait_months[h] != null && (
                <span key={h} className="text-xs text-gray-400">hold {h}m → buy <span className="text-emerald-300 font-medium">{rp.best_wait_months[h]} months</span> after the signal</span>
              ))}
            </div>
            {!rp ? <Spinner /> : (
              <>
                {rp.by_wait.some((w) => Object.keys(w.returns).length) ? (
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead className="text-gray-500">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Wait</th>
                          <th className="px-2 py-1 text-right font-medium">Hold 12m</th>
                          <th className="px-2 py-1 text-right font-medium">Hold 24m</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rp.by_wait.map((w) => (
                          <tr key={w.wait_months} className="border-t border-gray-800">
                            <td className="px-2 py-1 text-gray-300">{w.wait_months} mo</td>
                            <RetCell r={w.returns["12"]} />
                            <RetCell r={w.returns["24"]} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="text-sm text-gray-500">Not enough reprint events for this kind yet (needs 3+).</div>}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 text-left">
                      <tr>
                        <th className="px-2 py-1 font-medium">Product</th>
                        <th className="px-2 py-1 font-medium">Signal</th>
                        <th className="px-2 py-1 font-medium text-right">High → signal</th>
                        <th className="px-2 py-1 font-medium text-right">Trough</th>
                        <th className="px-2 py-1 font-medium text-right">Recovered</th>
                        <th className="px-2 py-1 font-medium">Reprint?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rp.events.map((e) => {
                        const k = `${e.product_id}-${e.signal_month}`;
                        return (
                          <tr key={k} className="border-t border-gray-800 align-top">
                            <td className="px-2 py-1 text-gray-200">{e.set_name} · {e.name}</td>
                            <td className="px-2 py-1 text-gray-300 whitespace-nowrap">{e.signal_month}
                              {e.months_since_release != null && <span className="text-gray-500"> (month {e.months_since_release})</span>}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-300">{usd(e.peak_cents)} → {usd(e.signal_cents)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              <span className="text-rose-300">{pct(e.drawdown)}</span>
                              <span className="text-gray-500"> {e.months_to_trough}mo</span>
                            </td>
                            <td className="px-2 py-1 text-right text-gray-400">{e.months_to_recover != null ? `${e.months_to_recover}mo` : "not yet"}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {e.status === "confirmed" ? (
                                <span className="text-emerald-300">confirmed <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "clear")} className="ml-1 text-gray-500 hover:text-gray-300">undo</button></span>
                              ) : (
                                <span className="flex gap-2">
                                  <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "confirmed")} className="text-emerald-300 hover:text-emerald-200">yes</button>
                                  <button disabled={busy === k} onClick={() => mark(e.product_id, e.signal_month, "rejected")} className="text-gray-500 hover:text-rose-300">no</button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rp.events.length === 0 && <div className="text-sm text-gray-500 py-2">No reprint signals found for this kind.</div>}
                </div>
                <p className="text-[11px] text-gray-500 max-w-4xl">{rp.method} &ldquo;Yes&rdquo; keeps a signal as a confirmed reprint; &ldquo;no&rdquo; drops it from the stats.</p>
              </>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <span className="text-sm text-gray-200 font-medium">{cur?.label} products</span>
            {!products ? <Spinner /> : (
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-xs">
                  <thead className="text-gray-500 text-left sticky top-0 bg-gray-900">
                    <tr>
                      <th className="px-2 py-1 font-medium">Set</th>
                      <th className="px-2 py-1 font-medium">Product</th>
                      <th className="px-2 py-1 font-medium text-right">Months out</th>
                      <th className="px-2 py-1 font-medium text-right">Price</th>
                      <th className="px-2 py-1 font-medium text-right">12m</th>
                      <th className="px-2 py-1 font-medium text-right">History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800">
                        <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{p.set_name}</td>
                        <td className="px-2 py-1"><a href={p.pricecharting_url} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-indigo-300">{p.name}</a></td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-400">{p.months_since_release ?? "–"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-200">{usd(p.latest_cents)}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${tone(p.change_12m)}`}>{pct(p.change_12m)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-500">{p.history_months}mo</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
