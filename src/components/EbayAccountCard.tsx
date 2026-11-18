import { useEffect, useState } from "react";
import { connectEbay, disconnectEbay, fetchEbayAccount, syncEbayPurchases, type EbayAccount, type EbaySyncSummary } from "../lib/api";

// The buying account's eBay purchases: connect it once (eBay's consent
// page, signed in as the buying account), then purchases mark bids won
// every 6 hours; "Pull 60 days" backfills.

const when = (s?: string) => (s ? new Date(s).toLocaleString() : "never");

function Summary({ s }: { s: EbaySyncSummary }) {
  return (
    <span className="text-gray-400">
      {s.purchases} purchases in {s.days} days · {s.matched_bids} matched bids ({s.new_wins} newly won) · {s.no_bid_purchases} with no bid
      {s.marked_lost ? ` · ${s.marked_lost} bids marked lost` : ""}{s.cancelled_orders_skipped ? ` · ${s.cancelled_orders_skipped} cancelled skipped` : ""}
      {s.errors?.length ? <span className="text-amber-300"> · {s.errors.length} errors</span> : null}
    </span>
  );
}

export default function EbayAccountCard() {
  const [a, setA] = useState<EbayAccount | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => fetchEbayAccount().then(setA).catch((e) => setMsg({ ok: false, text: String(e) }));
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search).get("ebay");
    if (q) setMsg({ ok: q === "connected", text: q === "connected" ? "eBay account connected." : `eBay: ${q}` });
  }, []);
  const run = async (what: string, f: () => Promise<unknown>, ok: (r: unknown) => string) => {
    setBusy(what); setMsg(null);
    try { const r = await f(); setMsg({ ok: true, text: ok(r) }); await load(); }
    catch (e) { setMsg({ ok: false, text: String(e).replace(/^Error: /, "") }); }
    finally { setBusy(""); }
  };
  const btn = "rounded px-3 py-1 text-sm disabled:opacity-40";
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-200 font-medium">eBay buying account</span>
        <span className="text-xs text-gray-500">its purchases mark bids won (item, shipping, tax, order) for Bids &amp; results and the admin app</span>
      </div>
      {!a ? <div className="text-xs text-gray-500">Loading…</div> : (
        <>
          {a.config_error && <div className="text-xs text-amber-300">Not set up on the API yet: {a.config_error}</div>}
          {a.connected ? (
            <div className="space-y-1 text-xs">
              <div className="text-gray-200">Connected as <b>{a.username}</b> <span className="text-gray-500">since {when(a.connected_at)}{a.refresh_expires_at ? ` · reconnect by ${new Date(a.refresh_expires_at).toLocaleDateString()}` : ""}</span></div>
              <div className="text-gray-400">Last pull {when(a.last_sync_at)}{a.last_sync_error ? <span className="text-rose-300"> · failed: {a.last_sync_error}</span> : a.last_sync_ok_at ? " · ok" : ""}</div>
              {a.last_sync_summary && <div><Summary s={a.last_sync_summary} /></div>}
            </div>
          ) : <div className="text-xs text-gray-400">Not connected. Connect opens eBay: sign in there as the account you buy with and agree.</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={!!busy || !!a.config_error} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}
              onClick={() => run("connect", async () => { const r = await connectEbay(); window.location.href = r.url; return r; }, () => "Opening eBay…")}>
              {a.connected ? "Reconnect" : "Connect eBay account"}
            </button>
            {a.connected && <>
              <button disabled={!!busy} className={`${btn} border border-gray-700 text-gray-200 hover:bg-gray-800`}
                onClick={() => run("sync", () => syncEbayPurchases(60), (r) => { const s = r as EbaySyncSummary; return `Pulled: ${s.purchases} purchases, ${s.new_wins} bids newly won, ${s.no_bid_purchases} with no bid, ${s.marked_lost} marked lost.`; })}>
                {busy === "sync" ? "Pulling…" : "Pull the last 60 days now"}
              </button>
              <button disabled={!!busy} className={`${btn} text-gray-500 hover:text-rose-300`}
                onClick={() => { if (window.confirm("Forget the eBay account? Purchases stop marking bids won until you connect again.")) run("disconnect", disconnectEbay, () => "Disconnected."); }}>
                Disconnect
              </button>
            </>}
          </div>
        </>
      )}
      {msg && <div className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</div>}
    </section>
  );
}
