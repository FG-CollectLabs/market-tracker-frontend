import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCCTens, type CCLang, type CCTen, type CCTensReport } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";
import { AutoMore } from "./BoardTools";

// Cheap PSA 10s on Collector Crypt: live PSA 10s against the cost to mint
// one (what a PSA 10 is worth to someone who'd grade raw copies). Under 1×
// it's cheaper to buy the slab than to make it.

const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`);
const PAGE = 150;

type Sort = "vs_mint" | "under" | "profit" | "newest";

export default function CCTens({ lang }: { lang: CCLang }) {
  const [rep, setRep] = useState<CCTensReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [maxVs, setMaxVs] = useState(1);
  const [minMint, setMinMint] = useState(20);
  const [sort, setSort] = useState<Sort>("vs_mint");
  // Under mint alone isn't a buy: when making a 10 costs more than one sells
  // for, nobody grades it and the market is the real ceiling.
  const [underMarket, setUnderMarket] = useState(true);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    setRep(null); setErr(null);
    fetchCCTens(lang).then((r) => live && setRep(r)).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
  }, [lang]);

  const rows = useMemo(() => {
    const out = (rep?.tens ?? []).filter((t) => t.vs_mint <= maxVs && t.mint_cents >= minMint * 100 &&
      (!underMarket || (t.value_cents != null && t.cost_cents <= t.value_cents)));
    const key = (t: CCTen) => sort === "vs_mint" ? t.vs_mint : sort === "under" ? -t.under_mint_cents
      : sort === "profit" ? -(t.profit_cents ?? -1e9) : -new Date(t.listed_at).getTime();
    return [...out].sort((a, b) => key(a) - key(b));
  }, [rep, maxVs, minMint, sort, underMarket]);
  useEffect(() => setShown(PAGE), [maxVs, minMint, sort, lang, underMarket]);

  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200";
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Collector Crypt PSA 10s against the <span className="text-gray-200">cost to mint</span> one: what a PSA 10 of the card is worth to
        someone who&apos;d grade raw copies themselves (raw cost and grading fee, less what the misses sell for, over the gem rate). Under 1×
        it&apos;s cheaper to buy this slab than to make one. Cost is all-in to your door: ask, buyer fee and redemption.
      </p>
      {err && <ErrorMsg msg={err} />}
      {!rep && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Loading Collector Crypt PSA 10s…</div>}
      {rep && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="tabular-nums">{rep.live.toLocaleString()} PSA 10s live · <span className="text-green-300">{rep.under_mint.toLocaleString()} at or under mint</span>
              {rep.no_mint > 0 && <span className="text-gray-500"> · {rep.no_mint.toLocaleString()} without a cost to mint</span>}</span>
            <label className="flex items-center gap-1.5">At most
              <select value={maxVs} onChange={(e) => setMaxVs(Number(e.target.value))} className={sel}>
                {[0.7, 0.8, 0.9, 1, 1.1, 1.25, 99].map((v) => <option key={v} value={v}>{v === 99 ? "any" : `${v}×`} mint</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">Mint at least
              <select value={minMint} onChange={(e) => setMinMint(Number(e.target.value))} className={sel}>
                {[0, 20, 50, 100, 250].map((v) => <option key={v} value={v}>${v}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5" title="Your cost is also at or under the PSA 10's market price. When the cost to mint is above the market, nobody grades the card and the market is the real ceiling.">
              <input type="checkbox" checked={underMarket} onChange={(e) => setUnderMarket(e.target.checked)} /> Also under market</label>
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={sel}>
                <option value="vs_mint">Cheapest vs mint</option><option value="under">Most $ under mint</option>
                <option value="profit">Best eBay resale profit</option><option value="newest">Newest listing</option>
              </select>
            </label>
            <span className="tabular-nums text-gray-500">{rows.length} shown</span>
          </div>
          {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing matches right now.</p> : (
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left">
                  <tr>
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium text-right" title="Collector Crypt ask (USDC)">Ask</th>
                    <th className="py-2 px-2 font-medium text-right" title="Ask + buyer fee + redemption to your door">Your cost</th>
                    <th className="py-2 px-2 font-medium text-right" title="What a PSA 10 of this card is worth to a self-grader; below it, the allocated share of the grading cost">Cost to mint</th>
                    <th className="py-2 px-2 font-medium text-right">vs mint</th>
                    <th className="py-2 px-2 font-medium text-right" title="PSA 10 market (sales behind it)">PSA 10 market</th>
                    <th className="py-2 px-3 font-medium text-right" title="Resell on eBay after fees and shipping, minus your cost">Resale profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((t) => (
                    <tr key={t.nft_address} className="border-t border-gray-800 align-top">
                      <td className="py-1.5 px-3">
                        <div className="flex gap-2 items-start min-w-[15rem]">
                          {(t.image_url || t.card_image_url) && <img src={t.image_url || t.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
                          <div className="min-w-0">
                            <Link to={`/cards/${t.display_key}`} className="text-gray-100 hover:text-indigo-300">{t.name}</Link>
                            <span className="text-gray-500"> #{t.number} · {t.set_code}</span>
                            <a href={t.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{t.title}</a>
                            {t.cert_number && <span className="text-[10px] text-gray-500">cert {t.cert_number}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{usd(t.ask_cents)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-100">{usd(t.cost_cents)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">
                        {usd(t.mint_cents)}
                        {t.mint_allocated_cents != null && <div className="text-[10px] text-gray-500" title="Its share of the grading cost by sales value: a stricter floor">alloc {usd(t.mint_allocated_cents)}</div>}
                      </td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${t.vs_mint <= 0.9 ? "text-green-300" : t.vs_mint <= 1 ? "text-green-300/70" : "text-gray-400"}`}>
                        {t.vs_mint.toFixed(2)}×
                        <div className="text-[10px] font-normal text-gray-500">{t.under_mint_cents >= 0 ? `${usd(t.under_mint_cents)} under` : `${usd(-t.under_mint_cents)} over`}</div>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">
                        {usd(t.value_cents)}{t.value_sales != null && <div className="text-[10px] text-gray-500">{t.value_sales} sales</div>}
                      </td>
                      <td className={`py-1.5 px-3 text-right tabular-nums ${t.profit_cents == null ? "text-gray-600" : t.profit_cents >= 0 ? "text-green-300" : "text-red-300"}`}>
                        {usd(t.profit_cents)}{t.margin != null && <div className="text-[10px] text-gray-500">{(t.margin * 100).toFixed(0)}%</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AutoMore remaining={rows.length - shown} page={PAGE} onMore={() => setShown((v) => v + PAGE)} />
            </div>
          )}
          <p className="text-[11px] text-gray-500 max-w-4xl">{rep.method}</p>
        </>
      )}
    </div>
  );
}
