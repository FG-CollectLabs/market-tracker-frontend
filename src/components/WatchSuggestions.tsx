import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { decideWatchSuggestion, fetchWatchSuggestions, runWatchSuggestions, type WatchSuggestion } from "../lib/api";
import { cardThumb } from "../lib/thumb";

// Weekly watchlist suggestions (the suggest-watch job): accept to watch the
// card with the suggested targets, dismiss to hide it for 60 days.

const RULE: Record<WatchSuggestion["rule"], { label: string; cls: string }> = {
  raw_window: { label: "Raw copies", cls: "bg-green-900/50 text-green-200" },
  under_make: { label: "Slab under cost", cls: "bg-sky-900/50 text-sky-200" },
  auction_discount: { label: "Auction discount", cls: "bg-amber-900/50 text-amber-200" },
};

export default function WatchSuggestions({ onAccepted }: { onAccepted: () => void }) {
  const [xs, setXs] = useState<WatchSuggestion[] | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<number | "run" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => fetchWatchSuggestions().then((r) => setXs(r.suggestions)).catch(() => setXs([]));
  useEffect(() => { load(); }, []);
  if (xs == null) return null;

  const decide = async (x: WatchSuggestion, action: "accept" | "dismiss") => {
    setBusy(x.id);
    try {
      await decideWatchSuggestion(x.id, action);
      setXs((cur) => (cur ?? []).filter((y) => y.id !== x.id));
      if (action === "accept") onAccepted();
    } finally {
      setBusy(null);
    }
  };
  const run = async () => {
    setBusy("run");
    setMsg(null);
    try {
      const r = await runWatchSuggestions();
      setMsg(`${r.added} new, ${r.updated} refreshed${r.skipped_recently_dismissed ? `, ${r.skipped_recently_dismissed} recently dismissed skipped` : ""}`);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-indigo-900/60 bg-gray-900 p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-indigo-200">
          {open ? "▾" : "▸"} Suggestions <span className="font-normal text-gray-500">{xs.length} to review</span>
        </button>
        <span className="text-xs text-gray-500">Proposed every Monday from tracked cards you aren't watching.</span>
        <span className="flex-1" />
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
        <button onClick={run} disabled={busy === "run"} className="px-2 py-0.5 rounded border border-gray-700 text-xs text-gray-300 hover:text-white disabled:opacity-50">
          {busy === "run" ? "Running… (a minute or two)" : "Run now"}
        </button>
      </div>
      {open && (xs.length === 0 ? <p className="mt-2 text-xs text-gray-500">Nothing to review.</p> : (
        <table className="mt-2 w-full text-xs">
          <tbody className="divide-y divide-gray-800">
            {xs.map((x) => (
              <tr key={x.id} className="align-top">
                <td className="py-1.5 pr-2 w-9">{x.image_url && <img src={cardThumb(x.image_url)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded-sm" />}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <Link to={`/cards/${encodeURIComponent(x.display_key)}`} className="text-gray-100 hover:text-indigo-300">{x.name}</Link>
                  <div className="text-gray-500 font-mono">{x.set_code.replace(/^jp-/, "JP ").replace(/^cn-/, "CN ").toUpperCase()}</div>
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap"><span className={`px-1.5 rounded ${RULE[x.rule]?.cls ?? ""}`}>{RULE[x.rule]?.label ?? x.rule}</span></td>
                <td className="py-1.5 pr-3 text-gray-300">{x.summary}</td>
                <td className="py-1.5 whitespace-nowrap text-right">
                  <button disabled={busy === x.id} onClick={() => decide(x, "accept")}
                    title={`Watch it with: ${x.targets.map((t) => `${t.target} ${t.rule_kind}${t.rule_value ? ` ${Math.round(t.rule_value * 100)}%` : ""}${t.channels !== "any" ? ` (${t.channels})` : ""}`).join(", ")}`}
                    className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">Watch</button>
                  <button disabled={busy === x.id} onClick={() => decide(x, "dismiss")} title="Hide for 60 days"
                    className="ml-1 px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50">Dismiss</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}
