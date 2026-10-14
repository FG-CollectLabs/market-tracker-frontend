import { useState } from "react";
import { saveBidPlan } from "../lib/api";
import { useSession } from "../lib/auth";
import { CardMarketLinks } from "./MarketLinks";

// On a card's page: marketplace searches for one grade (to check prices, or
// to screenshot for the import on the Graded market tab), and adding it to
// the singles prep list.

const GRADES: [string, string][] = [["raw", "Raw"], ["psa-10", "PSA 10"], ["psa-9", "PSA 9"], ["cgc-10", "CGC 10"], ["cgc-10-pristine", "CGC Pristine"]];

export default function CardBuyPanel({ displayKey }: { displayKey: string }) {
  const session = useSession();
  const [grade, setGrade] = useState("raw");
  const [max, setMax] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-200 font-medium">Check prices</span>
        <div className="inline-flex rounded border border-gray-700 overflow-hidden text-xs">
          {GRADES.map(([k, label]) => (
            <button key={k} onClick={() => { setGrade(k); setState("idle"); }}
              className={`px-2 py-0.5 ${grade === k ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{label}</button>
          ))}
        </div>
      </div>
      <CardMarketLinks displayKey={displayKey} grade={grade} />
      <p className="text-[11px] text-gray-500">
        Sold pages (Fanatics sold, eBay sold, PriceCharting) are what the screenshot import reads: screenshot one and upload it under Graded market → imports.
      </p>
      {session && (
        <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={(e) => {
          e.preventDefault();
          setState("busy");
          const cents = max ? Math.round(Number(max) * 100) : undefined;
          saveBidPlan({ display_key: displayKey, grade, kind: "single", max_bid_cents: cents })
            .then(() => { setState("done"); setMsg("added to Buying prep → Singles"); })
            .catch((err: Error) => { setState("error"); setMsg(err.message); });
        }}>
          <span className="text-gray-300">Singles prep:</span>
          <label className="flex items-center gap-1 text-gray-400">your max $
            <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="optional"
              className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono" />
          </label>
          <button type="submit" disabled={state === "busy"} className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60">
            Add {GRADES.find(([k]) => k === grade)?.[1]} to singles prep
          </button>
          {state === "done" && <span className="text-green-400">✓ {msg}</span>}
          {state === "error" && <span className="text-red-400">{msg}</span>}
        </form>
      )}
    </section>
  );
}
