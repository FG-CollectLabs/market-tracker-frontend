import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPcgAnalysis, fetchSettings, type PcgAnalysis, type PcgSale, type PcgSummary, type RatioStat } from "../lib/api";
import type { GraderCfg } from "../lib/gradeEv";
import { Spinner } from "../components/Spinner";

// PCG (Premier Card Grading) analytics: how PCG grades (its population
// report) and how PCG slabs sell next to the same card in PSA / CGC, to put
// PCG into the which-grader decision.

const GRADES: { key: string; label: string; pop: "pcg_flawless" | "pcg_pristine" | "pcg_10" | "pcg_9_5" | "pcg_9" }[] = [
  { key: "pcg-10-flawless", label: "Flawless 10", pop: "pcg_flawless" },
  { key: "pcg-10-pristine", label: "Pristine 10", pop: "pcg_pristine" },
  { key: "pcg-10", label: "Gem Mint 10", pop: "pcg_10" },
  { key: "pcg-9.5", label: "Gem Mint 9.5", pop: "pcg_9_5" },
  { key: "pcg-9", label: "Mint 9", pop: "pcg_9" },
];
const BANDS = ["PSA 10 under $50", "PSA 10 $50–200", "PSA 10 $200–1,000", "PSA 10 $1,000+"];

const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const x = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`);
const usd = (c: number | null | undefined) => (c == null ? "—" : c >= 100000 ? `$${Math.round(c / 100).toLocaleString()}` : `$${(c / 100).toFixed(2)}`);

function cheapest(g: GraderCfg | undefined) {
  if (!g?.tiers?.length) return null;
  const t = g.tiers.reduce((a, b) => (b.fee_cents < a.fee_cents ? b : a));
  return { name: t.name, fee: t.fee_cents + g.ship_cents, days: t.turnaround_days, cap: t.max_value_cents };
}

export default function PcgPage({ game }: { game: "pokemon" | "riftbound" }) {
  const [a, setA] = useState<PcgAnalysis | null>(null);
  const [graders, setGraders] = useState<Record<string, GraderCfg>>({});
  const [err, setErr] = useState("");
  const [view, setView] = useState<"sales" | "asks">("sales");
  const [bands, setBands] = useState(false);

  useEffect(() => {
    setA(null);
    fetchPcgAnalysis(game).then(setA).catch((e) => setErr(String(e)));
    fetchSettings().then(({ settings }) => setGraders(settings.graders as unknown as Record<string, GraderCfg>)).catch(() => {});
  }, [game]);

  const totals = useMemo(() => {
    const t = { total: 0, pcg_9: 0, pcg_9_5: 0, pcg_10: 0, pcg_pristine: 0, pcg_flawless: 0, psa_gem: 0, psa_total: 0, cgc_gem: 0, cgc_total: 0 };
    for (const m of a?.grade_mix ?? []) {
      t.total += m.pcg_total; t.pcg_9 += m.pcg_9; t.pcg_9_5 += m.pcg_9_5; t.pcg_10 += m.pcg_10;
      t.pcg_pristine += m.pcg_pristine; t.pcg_flawless += m.pcg_flawless;
      t.psa_gem += m.psa_gem; t.psa_total += m.psa_total; t.cgc_gem += m.cgc_gem; t.cgc_total += m.cgc_total;
    }
    return t;
  }, [a]);

  const summary = view === "sales" ? a?.sales_summary ?? [] : a?.asks_summary ?? [];
  const row = (gk: string, band = "all") => summary.find((s) => s.grade_key === gk && s.band === band);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">PCG grading{game === "riftbound" ? ": Riftbound" : ""}</h1>
        <p className="text-sm text-gray-400">
          Premier Card Grading: how it grades (its population report) and how its slabs sell next to the same card in PSA and CGC.
          Ratios compare each PCG sale with that card's PSA 10 / PSA 9 / CGC 10 at the time.
        </p>
      </header>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      {!a ? <Spinner /> : (
        <>
          <Findings a={a} totals={totals} graders={graders} game={game} />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-gray-200">Price vs the same card in PSA / CGC</h2>
              {(["sales", "asks"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2 py-1 rounded text-xs ${view === v ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400"}`}>
                  {v === "sales" ? `Sales (${a.sales.length})` : `Live asks (${a.asks.length})`}
                </button>
              ))}
              <label className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                <input type="checkbox" checked={bands} onChange={(e) => setBands(e.target.checked)} /> By PSA 10 price
              </label>
            </div>
            {view === "asks" && <p className="text-xs text-amber-400/80">Asks are what sellers want, an upper bound on what PCG slabs sell for.</p>}
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="text-sm min-w-full">
                <thead className="bg-gray-900 text-xs text-gray-400">
                  <tr>
                    <th className="text-left font-normal px-3 py-2">PCG grade</th>
                    {bands && <th className="text-left font-normal px-2">PSA 10 price</th>}
                    <th className="text-right font-normal px-2">{view === "sales" ? "Sales" : "Asks"}</th>
                    <th className="text-right font-normal px-2" title="median (middle half)">÷ PSA 10</th>
                    <th className="text-right font-normal px-2">÷ PSA 9</th>
                    <th className="text-right font-normal px-2">÷ CGC 10</th>
                    <th className="text-right font-normal px-2">÷ raw</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADES.flatMap((g) => (bands ? BANDS : ["all"]).map((b) => ({ g, b, s: row(g.key, b) })))
                    .filter((r) => r.s || r.b === "all")
                    .map(({ g, b, s }) => (
                      <tr key={g.key + b} className="border-t border-gray-900">
                        <td className="px-3 py-1.5 text-gray-200 whitespace-nowrap">{g.label}</td>
                        {bands && <td className="px-2 text-gray-400 whitespace-nowrap">{b === "all" ? "all" : b.replace("PSA 10 ", "")}</td>}
                        <td className="text-right px-2 tabular-nums text-gray-400">{s?.count ?? 0}</td>
                        <RatioCell s={s?.vs_psa_10} />
                        <RatioCell s={s?.vs_psa_9} />
                        <RatioCell s={s?.vs_cgc_10} />
                        <RatioCell s={s?.vs_raw} />
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <GradeMix a={a} totals={totals} />
          <SalesList rows={view === "sales" ? a.sales : a.asks} asks={view === "asks"} />
        </>
      )}
    </div>
  );
}

function RatioCell({ s }: { s?: RatioStat }) {
  if (!s || s.n === 0 || s.median == null) return <td className="text-right px-2 text-gray-700">—</td>;
  return (
    <td className="text-right px-2 tabular-nums whitespace-nowrap" title={`${s.n} with a price · middle half ${x(s.p25)}–${x(s.p75)}`}>
      <span className={s.median >= 1 ? "text-emerald-400" : "text-gray-200"}>{x(s.median)}</span>
      <span className="text-[11px] text-gray-500"> {x(s.p25)}–{x(s.p75)}</span>
    </td>
  );
}

// The questions: is it a Flawless hunt, is PCG worth it on cheaper cards,
// are 9.5s undervalued. Each answer says how much data it stands on.
function Findings({ a, totals, graders, game }: {
  a: PcgAnalysis; graders: Record<string, GraderCfg>; game: string;
  totals: { total: number; pcg_9: number; pcg_9_5: number; pcg_10: number; pcg_pristine: number; pcg_flawless: number; psa_gem: number; psa_total: number; cgc_gem: number; cgc_total: number };
}) {
  const sum = (gk: string, band = "all"): PcgSummary | undefined => a.sales_summary.find((s) => s.grade_key === gk && s.band === band);
  const ask = (gk: string): PcgSummary | undefined => a.asks_summary.find((s) => s.grade_key === gk && s.band === "all");
  const share = (n: number) => (totals.total > 0 ? n / totals.total : null);
  const tenUp = share(totals.pcg_10 + totals.pcg_pristine + totals.pcg_flawless);
  const psaGem = totals.psa_total > 0 ? totals.psa_gem / totals.psa_total : null;
  const pcgFee = cheapest(graders.pcg), psaFee = cheapest(graders.psa), cgcFee = cheapest(graders.cgc);
  const enough = (s?: PcgSummary) => !!s && s.vs_psa_10.n >= 3 && s.vs_psa_10.median != null;
  const ratioText = (gk: string) => {
    const s = sum(gk);
    if (enough(s)) return `${x(s!.vs_psa_10.median)} PSA 10 (${s!.vs_psa_10.n} sales)`;
    const k = ask(gk);
    if (k && k.vs_psa_10.n >= 3) return `no sales to go on; asks ${x(k.vs_psa_10.median)} PSA 10 (${k.vs_psa_10.n})`;
    return "too few sales or asks yet";
  };

  const fl = sum("pcg-10-flawless");
  const flRate = share(totals.pcg_flawless);
  const gemBands = BANDS.map((b) => ({ b, s: sum("pcg-10", b) })).filter((r) => enough(r.s));
  const nine5 = sum("pcg-9.5");

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-3 text-sm">
      <h2 className="text-sm font-medium text-gray-200">What the data says so far</h2>
      <div className="grid sm:grid-cols-5 gap-3">
        {GRADES.map((g) => (
          <div key={g.key} className="rounded border border-gray-800 px-3 py-2">
            <div className="text-[11px] text-gray-500">{g.label}</div>
            <div className="text-lg text-white tabular-nums">{pct(share(totals[g.pop]), g.key === "pcg-10-flawless" ? 1 : 0)}</div>
            <div className="text-[11px] text-gray-500">of {totals.total.toLocaleString()} graded</div>
          </div>
        ))}
      </div>
      <ul className="space-y-2 text-gray-300 list-disc pl-5">
        <li>
          <b className="text-gray-100">Grading odds.</b> PCG gives a 10 (Gem Mint or better) to {pct(tenUp)} of these cards
          {psaGem != null ? `; PSA gives a 10 to ${pct(psaGem)} of the same cards` : ""}. PCG is the stricter grader: most of its
          copies land at 9 or 9.5.
        </li>
        <li>
          <b className="text-gray-100">Black-label hunting.</b> Flawless is {pct(flRate, 1)} of PCG grades and sells for {ratioText("pcg-10-flawless")}.
          {enough(fl) && flRate != null
            ? ` Per card sent in, Flawless alone adds about ${pct(flRate * (fl!.vs_psa_10.median! - 1), 1)} of a PSA 10's price: only worth chasing on cards whose centering and surface already look perfect.`
            : " Not enough Flawless sales to price the hunt yet."}
        </li>
        <li>
          <b className="text-gray-100">Cheaper cards.</b> A Gem Mint 10 sells for {ratioText("pcg-10")}
          {pcgFee && psaFee ? `. PCG's cheapest tier is ${usd(pcgFee.fee)} with shipping (${pcgFee.days} days) vs PSA's ${usd(psaFee.fee)} (${psaFee.days} days)` : ""}.
          {gemBands.length > 0
            ? " By PSA 10 price: " + gemBands.map((r) => `${r.b.replace("PSA 10 ", "")} ${x(r.s!.vs_psa_10.median)} (${r.s!.vs_psa_10.n})`).join(", ") + "."
            : " Not enough sales per price band yet to say where the fee saving beats the lower resale."}
        </li>
        <li>
          <b className="text-gray-100">9.5s.</b> A PCG 9.5 sells for {ratioText("pcg-9.5")}
          {nine5 && nine5.vs_psa_9.n >= 3 ? `, ${x(nine5.vs_psa_9.median)} a PSA 9` : ""}
          {nine5 && nine5.vs_cgc_10.n >= 3 ? ` and ${x(nine5.vs_cgc_10.median)} a CGC 10` : ""}.
          {cgcFee ? ` Cracking one for CGC costs ~${usd(cgcFee.fee)} and ${cgcFee.days} days.` : ""} Whether 9.5s cross to CGC 10 / PSA 10 can't be
          read from prices: it needs logged crack outcomes (pre-grader regrade tracking).
        </li>
      </ul>
      <p className="text-xs text-gray-500">
        Populations: {a.grade_mix.length} sets with PCG data. Ratios use the median of the same card's sales within 60 days, else
        PriceCharting's price that week. {game === "pokemon" && "English sets only."}
      </p>
    </section>
  );
}

function GradeMix({ a, totals }: { a: PcgAnalysis; totals: { total: number } }) {
  const rows = a.grade_mix.filter((m) => m.pcg_total > 0);
  if (rows.length === 0) return <p className="text-sm text-gray-500">No PCG population yet: it arrives with the weekly ingest-pcg-pop run.</p>;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-200">Grade mix by set <span className="text-gray-500 font-normal">({totals.total.toLocaleString()} PCG copies)</span></h2>
      <div className="overflow-x-auto rounded-lg border border-gray-800 max-h-[28rem]">
        <table className="text-sm min-w-full tabular-nums">
          <thead className="bg-gray-900 text-xs text-gray-400 sticky top-0">
            <tr>
              <th className="text-left font-normal px-3 py-2">Set</th>
              <th className="text-right font-normal px-2">PCG graded</th>
              <th className="text-right font-normal px-2">9</th>
              <th className="text-right font-normal px-2">9.5</th>
              <th className="text-right font-normal px-2">Gem 10</th>
              <th className="text-right font-normal px-2">Pristine</th>
              <th className="text-right font-normal px-2">Flawless</th>
              <th className="text-right font-normal px-2">PCG 10+</th>
              <th className="text-right font-normal px-2">PSA 10 rate</th>
              <th className="text-right font-normal px-2">CGC 10 rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const f = (n: number) => pct(n / m.pcg_total);
              return (
                <tr key={m.set_code} className="border-t border-gray-900">
                  <td className="px-3 py-1 text-gray-200">{m.set_name}</td>
                  <td className="text-right px-2 text-gray-300">{m.pcg_total}</td>
                  <td className="text-right px-2 text-gray-400">{f(m.pcg_9)}</td>
                  <td className="text-right px-2 text-gray-400">{f(m.pcg_9_5)}</td>
                  <td className="text-right px-2 text-gray-300">{f(m.pcg_10)}</td>
                  <td className="text-right px-2 text-gray-300">{f(m.pcg_pristine)}</td>
                  <td className="text-right px-2 text-gray-300">{m.pcg_flawless ? pct(m.pcg_flawless / m.pcg_total, 1) : "—"}</td>
                  <td className="text-right px-2 text-gray-100">{f(m.pcg_10 + m.pcg_pristine + m.pcg_flawless)}</td>
                  <td className="text-right px-2 text-gray-400">{m.psa_total ? pct(m.psa_gem / m.psa_total) : "—"}</td>
                  <td className="text-right px-2 text-gray-400">{m.cgc_total ? pct(m.cgc_gem / m.cgc_total) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SalesList({ rows, asks }: { rows: PcgSale[]; asks: boolean }) {
  const [n, setN] = useState(50);
  if (rows.length === 0) return <p className="text-sm text-gray-500">No PCG {asks ? "listings" : "sales"} recorded yet.</p>;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-200">{asks ? "Live PCG listings" : "PCG sales"}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="text-sm min-w-full tabular-nums">
          <thead className="bg-gray-900 text-xs text-gray-400">
            <tr>
              <th className="text-left font-normal px-3 py-2">Card</th>
              <th className="text-left font-normal px-2">Grade</th>
              <th className="text-right font-normal px-2">{asks ? "Ask" : "Sold"}</th>
              <th className="text-right font-normal px-2">PSA 10 then</th>
              <th className="text-right font-normal px-2">÷ PSA 10</th>
              <th className="text-right font-normal px-2">{asks ? "" : "Date"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, n).map((s, i) => (
              <tr key={i} className="border-t border-gray-900">
                <td className="px-3 py-1">
                  <Link to={`/cards/${s.display_key}`} className="text-gray-200 hover:text-white">{s.name}</Link>
                  <span className="ml-1 text-xs text-gray-500 uppercase">{s.set_code}</span>
                  {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-gray-500 hover:text-gray-300">{s.source} ↗</a>}
                </td>
                <td className="px-2 text-gray-300 whitespace-nowrap">{GRADES.find((g) => g.key === s.grade_key)?.label ?? s.grade_key}</td>
                <td className="text-right px-2 text-gray-100">{usd(s.cents)}</td>
                <td className="text-right px-2 text-gray-400">{usd(s.psa_10_cents)}</td>
                <td className="text-right px-2 text-gray-200">{s.psa_10_cents ? x(s.cents / s.psa_10_cents) : "—"}</td>
                <td className="text-right px-2 text-gray-500">{asks ? "" : s.at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > n && <button onClick={() => setN(n + 100)} className="text-sm text-sky-400 hover:text-sky-300">Show more</button>}
    </section>
  );
}
