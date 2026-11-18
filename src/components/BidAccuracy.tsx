import { useEffect, useState } from "react";
import { fetchBidAccuracy, type BidAccuracy as Acc, type MissRow } from "../lib/api";
import { Spinner } from "./Spinner";

// Buying accuracy: the funnel from bid to 10 by month, copies that weren't
// gradable on arrival (did the listing show it?), by defect and by seller,
// and the grading EV you bid on against what the in-hand check says.

const pc = (v?: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const usd = (c?: number | null) => (c == null ? "–" : `${c < 0 ? "−" : ""}$${Math.round(Math.abs(c) / 100).toLocaleString()}`);
const th = "py-1.5 px-2 font-medium", thr = `${th} text-right`, td = "py-1 px-2", tdr = `${td} text-right tabular-nums`;
const DEFECT: Record<string, string> = {
  whitening: "Whitening", silvering: "Silvering", print_line: "Print line", dent: "Dent", scratch: "Scratch",
  crease: "Crease", edge_chip: "Edge chip", stain: "Stain", other: "Other",
};

function MissTable({ title, rows, label, seller }: { title: string; rows: MissRow[]; label: (k: string) => string; seller?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-gray-600">Nothing yet.</div> : (
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-left"><tr>
            <th className={th}>{seller ? "Seller" : "Defect"}</th>
            {seller && <th className={thr}>Checked</th>}
            <th className={thr}>Not gradable</th>
            <th className={thr} title="A reported defect was visible in the listing: we should have caught it">Missed</th>
            <th className={thr} title="No reported defect was visible in the listing">Hidden</th>
            <th className={thr}>Unclear</th>
            {seller && <th className={thr}>Rate</th>}
          </tr></thead>
          <tbody>{rows.slice(0, 15).map((r) => (
            <tr key={r.key} className="border-t border-gray-800">
              <td className={`${td} text-gray-200`}>{label(r.key) || "—"}</td>
              {seller && <td className={tdr}>{r.checked ?? 0}</td>}
              <td className={tdr}>{r.not_gradable}</td>
              <td className={`${tdr} ${r.missed ? "text-amber-300" : ""}`}>{r.missed}</td>
              <td className={tdr}>{r.hidden}</td>
              <td className={`${tdr} text-gray-500`}>{r.unclear}</td>
              {seller && <td className={`${tdr} ${(r.not_gradable_rate ?? 0) >= 0.3 ? "text-rose-300" : ""}`}>{pc(r.not_gradable_rate)}</td>}
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export default function BidAccuracy() {
  const [a, setA] = useState<Acc | null>(null);
  const [err, setErr] = useState("");
  const [months, setMonths] = useState(12);
  useEffect(() => { setA(null); fetchBidAccuracy(months).then(setA).catch((e) => setErr(String(e))); }, [months]);
  if (err) return <div className="text-xs text-rose-400 break-all">{err}</div>;
  if (!a) return <div className="text-xs text-gray-500 flex items-center gap-2"><Spinner /> Loading accuracy…</div>;
  const ng = a.not_gradable;
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-200">Buying accuracy</span>
        <span className="text-xs text-gray-500">from the admin app&apos;s in-hand checks</span>
        <span className="ml-auto flex gap-1 text-xs">{[6, 12, 24].map((m) => (
          <button key={m} onClick={() => setMonths(m)} className={`rounded px-2 py-0.5 ${months === m ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>{m} mo</button>
        ))}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="text-xs text-gray-400 mb-1">Funnel by the month you bid</div>
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-left"><tr>
            <th className={th}>Month</th><th className={thr}>Bids</th><th className={thr}>Won</th><th className={thr}>Win rate</th>
            <th className={thr}>Checked in hand</th><th className={thr}>Gradable</th><th className={thr}>Graded</th><th className={thr}>10s</th>
            <th className={thr} title="10s / graded, against the PSA 10 odds shown when you bid">10 rate (expected)</th>
          </tr></thead>
          <tbody>{a.funnel.map((f) => (
            <tr key={f.month} className="border-t border-gray-800">
              <td className={`${td} text-gray-200`}>{f.month}</td>
              <td className={tdr}>{f.bids}{f.open ? <span className="text-gray-500"> ({f.open} open)</span> : null}</td>
              <td className={tdr}>{f.won}</td><td className={tdr}>{pc(f.win_rate)}</td>
              <td className={tdr}>{f.checked_in_hand}</td>
              <td className={tdr}>{f.gradable} <span className="text-gray-500">{pc(f.gradable_rate)}</span></td>
              <td className={tdr}>{f.graded}</td><td className={tdr}>{f.tens}</td>
              <td className={`${tdr} ${f.ten_rate != null && f.expected_ten_rate != null ? (f.ten_rate >= f.expected_ten_rate ? "text-emerald-300" : "text-rose-300") : ""}`}>
                {pc(f.ten_rate)} <span className="text-gray-500">({pc(f.expected_ten_rate)})</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-300">
          Not gradable on arrival: <b>{ng.not_gradable}</b> of {ng.checked ?? 0} checked ({pc(ng.not_gradable_rate)})
          {ng.not_gradable > 0 && <> · <span className="text-amber-300">{ng.missed} missed</span> (visible in the listing) · {ng.hidden} hidden · <span className="text-gray-500">{ng.unclear} unclear</span></>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <MissTable title="By defect (a copy counts once per type)" rows={a.not_gradable_by_defect} label={(k) => DEFECT[k] ?? k} />
          <MissTable title="By seller" rows={a.not_gradable_by_seller.filter((r) => (r.checked ?? 0) > 0)} label={(k) => k} seller />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="text-xs text-gray-400 mb-1">Grading EV when you bid vs after the in-hand check</div>
        {a.ev.length === 0 ? <div className="text-xs text-gray-600">No in-hand checks with an EV at bid yet.</div> : (
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-left"><tr>
              <th className={th}>Month</th><th className={thr}>Copies</th><th className={thr}>EV at bid</th><th className={thr}>EV after check</th>
              <th className={thr}>Drift</th><th className={thr}>PSA 10 odds at bid → after</th>
            </tr></thead>
            <tbody>{a.ev.map((e) => (
              <tr key={e.month} className="border-t border-gray-800">
                <td className={`${td} text-gray-200`}>{e.month}</td>
                <td className={tdr}>{e.n}<span className="text-gray-500"> ({e.after_from_check} with an in-hand EV)</span></td>
                <td className={tdr}>{usd(e.ev_at_bid_cents)}</td><td className={tdr}>{usd(e.ev_after_cents)}</td>
                <td className={`${tdr} ${(e.drift ?? 0) < -0.1 ? "text-rose-300" : (e.drift ?? 0) > 0.1 ? "text-emerald-300" : ""}`}>{e.drift != null ? `${e.drift >= 0 ? "+" : ""}${Math.round(e.drift * 100)}%` : "–"}</td>
                <td className={tdr}>{pc(e.p10_at_bid)} → {pc(e.p10_after)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-gray-500">{a.method}</p>
    </section>
  );
}
