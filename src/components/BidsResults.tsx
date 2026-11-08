import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBids, saveBidResult, type BidRow, type BidStage, type BidStats } from "../lib/api";
import { Spinner, ErrorMsg } from "./Spinner";

// Every bid and what came of it: report won / lost, check the copy in hand,
// record its grade and its sale. The totals compare what happened with what
// the board predicted when you bid: how many were truly gradable, the 10
// rate against the odds shown, and the realized profit.

const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`);
const pc = (v?: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const toCents = (v: string) => {
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

const TABS: [string, string, BidStage[]][] = [
  ["todo", "To do", ["report", "in_transit", "to_grade", "graded", "not_gradable"]],
  ["bidding", "Bidding", ["bidding"]],
  ["report", "Report result", ["report"]],
  ["in_transit", "Won, not in hand", ["in_transit"]],
  ["to_grade", "To grade", ["to_grade"]],
  ["graded", "Graded, not sold", ["graded", "not_gradable"]],
  ["sold", "Sold", ["sold"]],
  ["closed", "Lost / skipped", ["lost", "no_bid"]],
  ["all", "All", []],
];

const STAGE: Record<BidStage, string> = {
  bidding: "Bidding", report: "Ended: report it", in_transit: "Won: check it in hand", to_grade: "Gradable: grade it",
  not_gradable: "Not gradable", graded: "Graded: sell it", sold: "Sold", lost: "Lost", no_bid: "Didn't bid",
};

export default function BidsResults() {
  const [data, setData] = useState<{ bids: BidRow[]; stats: BidStats } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState("todo");
  const load = useCallback(() => {
    fetchBids().then(setData).catch((e) => setErr(String(e)));
  }, []);
  useEffect(load, [load]);
  const rows = useMemo(() => {
    const t = TABS.find((x) => x[0] === tab)!;
    return (data?.bids ?? []).filter((b) => t[2].length === 0 || t[2].includes(b.stage));
  }, [data, tab]);
  if (err) return <ErrorMsg msg={err} />;
  if (!data) return <div className="text-sm text-gray-500 flex items-center gap-2"><Spinner /> Loading bids…</div>;
  const s = data.stats;
  const count = (stages: BidStage[]) => data.bids.filter((b) => stages.length === 0 || stages.includes(b.stage)).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 max-w-4xl">
        Mark a listing <span className="text-indigo-200">Bid</span> with your max on any board, then report here what came of it: won or lost,
        whether the copy in hand was truly gradable, the grade it came back with, and what it sold for. Pre-graded copies you win are sent
        to the pre-grader as bought, and their grades as outcomes, so its odds learn from your real results.
      </p>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Win rate" value={pc(s.win_rate)} sub={`${s.won} won · ${s.lost} lost · ${s.no_bid} skipped of ${s.bids} bids`} />
        <Tile label="Paid vs max" value={pc(s.paid_vs_max)} sub="won copies: paid ÷ your max" />
        <Tile label="Gradable in hand" value={pc(s.gradable_rate)} sub={`${s.gradable} of ${s.checked_in_hand} checked`} />
        <Tile label="Came back a 10" value={pc(s.ten_rate)} sub={`${s.tens} of ${s.graded} graded · expected ${pc(s.expected_ten_rate)}`}
          tone={s.ten_rate != null && s.expected_ten_rate != null ? (s.ten_rate >= s.expected_ten_rate ? "good" : "bad") : undefined} />
        <Tile label="Realized profit" value={usd(s.profit_cents)} sub={`${s.sold} sold · ${usd(s.invested_sold_cents)} in`} tone={s.sold ? (s.profit_cents >= 0 ? "good" : "bad") : undefined} />
        <Tile label="ROI (sold)" value={pc(s.roi)} sub="profit ÷ paid + grading" />
      </div>

      <div className="flex flex-wrap items-end gap-1 border-b border-gray-800">
        {TABS.map(([k, l, st]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-sm rounded-t border-x border-t -mb-px ${tab === k ? "border-gray-700 bg-gray-900 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
            {l} <span className="text-xs text-gray-500 tabular-nums">{count(st)}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing here.</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 px-3 font-medium">Card</th>
                <th className="py-2 px-2 font-medium">Stage</th>
                <th className="py-2 px-2 font-medium text-right">Max bid</th>
                <th className="py-2 px-2 font-medium text-right" title="Won: what you paid; lost: what it went for">Result</th>
                <th className="py-2 px-2 font-medium text-right" title="Top-grade chance the board showed when you bid">Expected</th>
                <th className="py-2 px-2 font-medium">In hand · grade · sale</th>
                <th className="py-2 px-3 font-medium text-right">Profit</th>
              </tr>
            </thead>
            <tbody>{rows.map((b) => <Row key={`${b.source}|${b.listing_id}`} b={b} onSaved={load} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-green-300" : tone === "bad" ? "text-red-300" : "text-white"}`}>{value}</div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}

function Row({ b, onSaved }: { b: BidRow; onSaved: () => void }) {
  const slab = b.grade_key && b.grade_key !== "raw";
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-1.5 px-3">
        <div className="flex gap-2 items-start min-w-[15rem]">
          {(b.image_url || b.card_image_url) && <img src={b.image_url || b.card_image_url} alt="" loading="lazy" className="w-9 h-12 object-cover rounded border border-gray-800" />}
          <div className="min-w-0">
            {b.display_key ? <Link to={`/cards/${b.display_key}`} className="text-gray-100 hover:text-indigo-300">{b.card_name}</Link> : <span className="text-gray-300">{b.card_name ?? "Unknown card"}</span>}
            <span className="text-gray-500"> #{b.card_number} · {b.set_code}</span>
            {slab && <span className="ml-1.5 px-1 rounded border border-gray-700 text-gray-300">{b.grade_key!.toUpperCase().replace("-", " ")}</span>}
            {b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="block truncate max-w-[22rem] text-indigo-300/80 hover:text-indigo-200">{b.title}</a>
              : <div className="truncate max-w-[22rem] text-gray-500">{b.title}</div>}
            <div className="text-[10px] text-gray-500">{b.seller}{b.ends_at && ` · ends ${when(b.ends_at)}`}{b.live && b.now_cents != null && ` · now ${usd(b.now_cents)}`}</div>
          </div>
        </div>
      </td>
      <td className="py-1.5 px-2 whitespace-nowrap text-gray-300">{STAGE[b.stage]}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{usd(b.max_bid_cents)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
        {b.result ? <span className={b.result === "won" ? "text-green-300" : "text-gray-400"}>{b.result === "won" ? `won ${usd(b.result_cents)}` : b.result === "lost" ? `lost${b.result_cents != null ? ` ${usd(b.result_cents)}` : ""}` : "skipped"}</span>
          : <ResultForm b={b} onSaved={onSaved} />}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400" title={slab ? "Best regrade play's top-grade chance" : "Adjusted PSA 10 odds"}>{pc(b.expected_top)}</td>
      <td className="py-1.5 px-2"><Steps b={b} slab={!!slab} onSaved={onSaved} /></td>
      <td className={`py-1.5 px-3 text-right tabular-nums font-semibold ${b.profit_cents == null ? "text-gray-600" : b.profit_cents >= 0 ? "text-green-300" : "text-red-300"}`}>{usd(b.profit_cents)}</td>
    </tr>
  );
}

function useSave(b: BidRow, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (body: Omit<Parameters<typeof saveBidResult>[0], "source" | "listing_id">) => {
    setBusy(true); setErr(null);
    try {
      const r = await saveBidResult({ source: b.source, listing_id: b.listing_id, display_key: b.display_key, ...body });
      setMsg(r.predictor ?? null);
      onSaved();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return { busy, err, msg, save };
}

const inp = "rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[11px] text-gray-200 tabular-nums";
const btn = "px-1.5 py-0.5 rounded border text-[11px] disabled:opacity-40";

function ResultForm({ b, onSaved }: { b: BidRow; onSaved: () => void }) {
  const [v, setV] = useState("");
  const { busy, err, save } = useSave(b, onSaved);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="$ paid / went for" className={`${inp} w-24`} />
      <button disabled={busy || toCents(v) == null} className={`${btn} border-green-900 text-green-300`} onClick={() => save({ step: "result", result: "won", cents: toCents(v) })}>Won</button>
      <button disabled={busy} className={`${btn} border-gray-700 text-gray-300`} onClick={() => save({ step: "result", result: "lost", cents: toCents(v) })}>Lost</button>
      <button disabled={busy} className={`${btn} border-gray-800 text-gray-500`} onClick={() => save({ step: "result", result: "no_bid" })}>Skipped</button>
      {err && <span className="text-red-400" title={err}>!</span>}
    </span>
  );
}

function Steps({ b, slab, onSaved }: { b: BidRow; slab: boolean; onSaved: () => void }) {
  const { busy, err, msg, save } = useSave(b, onSaved);
  const [note, setNote] = useState("");
  const [grader, setGrader] = useState("PSA");
  const [grade, setGrade] = useState("10");
  const [fee, setFee] = useState("");
  const [sold, setSold] = useState("");
  const [fees, setFees] = useState("");
  const [channel, setChannel] = useState("");
  if (b.result !== "won") return <span className="text-gray-600">–</span>;
  const undo = (step: "clear_in_hand" | "clear_graded" | "clear_sold") => (
    <button disabled={busy} onClick={() => save({ step })} className="ml-1 text-[10px] text-gray-500 hover:text-gray-300" title="Undo this step">undo</button>
  );
  return (
    <div className="space-y-1 text-[11px]">
      {b.in_hand ? (
        <div className={b.in_hand === "gradable" ? "text-green-300" : "text-amber-300"}>
          {b.in_hand === "gradable" ? (slab ? "Worth cracking" : "Gradable") : (slab ? "Not worth cracking" : "Not gradable")}
          {b.in_hand_note && <span className="text-gray-500"> · {b.in_hand_note}</span>}{undo("clear_in_hand")}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-gray-500">In hand:</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (whitening, dent…)" className={`${inp} w-36`} />
          <button disabled={busy} className={`${btn} border-green-900 text-green-300`} onClick={() => save({ step: "in_hand", in_hand: "gradable", note })}>{slab ? "Worth cracking" : "Gradable"}</button>
          <button disabled={busy} className={`${btn} border-amber-900 text-amber-300`} onClick={() => save({ step: "in_hand", in_hand: "not_gradable", note })}>Not</button>
        </div>
      )}
      {b.in_hand && (b.graded_grade ? (
        <div className="text-gray-200">{b.graded_grader} {b.graded_grade}{b.graded_fee_cents != null && <span className="text-gray-500"> · fee {usd(b.graded_fee_cents)}</span>}{undo("clear_graded")}</div>
      ) : b.in_hand === "gradable" && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Graded:</span>
          <select value={grader} onChange={(e) => setGrader(e.target.value)} className={inp}>{["PSA", "CGC", "BGS", "TAG"].map((g) => <option key={g}>{g}</option>)}</select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inp}>
            {["10 pristine", "10 black", "10", "9.5", "9", "8.5", "8", "7"].map((g) => <option key={g}>{g}</option>)}
          </select>
          <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="$ fee" className={`${inp} w-16`} />
          <button disabled={busy} className={`${btn} border-indigo-800 text-indigo-200`} onClick={() => save({ step: "graded", grader, grade, fee_cents: toCents(fee) })}>Save</button>
        </div>
      ))}
      {(b.graded_grade || b.in_hand === "not_gradable") && (b.sold_cents != null ? (
        <div className="text-gray-200">Sold {usd(b.sold_cents)}{b.sold_fees_cents != null && <span className="text-gray-500"> − {usd(b.sold_fees_cents)} fees</span>}{b.sold_channel && <span className="text-gray-500"> · {b.sold_channel}</span>}{undo("clear_sold")}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Sold:</span>
          <input value={sold} onChange={(e) => setSold(e.target.value)} placeholder="$ sold" className={`${inp} w-16`} />
          <input value={fees} onChange={(e) => setFees(e.target.value)} placeholder="$ fees" className={`${inp} w-16`} />
          <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="where (eBay, Fanatics…)" className={`${inp} w-28`} />
          <button disabled={busy || toCents(sold) == null} className={`${btn} border-indigo-800 text-indigo-200`} onClick={() => save({ step: "sold", sold_cents: toCents(sold), sold_fees_cents: toCents(fees), sold_channel: channel })}>Save</button>
        </div>
      ))}
      {msg && <div className="text-[10px] text-indigo-300/80">{msg}</div>}
      {err && <div className="text-[10px] text-red-400" title={err}>couldn't save</div>}
    </div>
  );
}
