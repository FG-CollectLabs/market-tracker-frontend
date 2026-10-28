import { useEffect, useState } from "react";
import { fetchSealedLinks, saveSealedLink, type SealedLink, type SealedLinkStatus } from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";

// Sealed products the admin app asked history for, by TCGplayer product id.
// Ones we couldn't match to a PriceCharting page on our own wait here for a
// person to paste the right page (or mark them not on PriceCharting).
const FILTERS: { id: "" | SealedLinkStatus; label: string }[] = [
  { id: "unmatched", label: "To do" },
  { id: "pending", label: "Looking up" },
  { id: "linked", label: "Linked" },
  { id: "none", label: "Not on PriceCharting" },
  { id: "", label: "All" },
];
const STATUS_CLS: Record<SealedLinkStatus, string> = {
  unmatched: "text-amber-300", pending: "text-sky-300", linked: "text-green-400", none: "text-gray-500",
};
const tcgURL = (id: number) => `https://www.tcgplayer.com/product/${id}`;
const pcPath = (u: string) => u.replace(/^https?:\/\/www\.pricecharting\.com\/game\//, "");

function Row({ l, onSaved }: { l: SealedLink; onSaved: () => void }) {
  const [url, setURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (body: Parameters<typeof saveSealedLink>[1]) => {
    setBusy(true);
    setErr("");
    try {
      await saveSealedLink(l.tcgplayer_product_id, body);
      setURL("");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className="border-t border-gray-800 align-top">
      <td className="py-2 pr-3">
        <a href={tcgURL(l.tcgplayer_product_id)} target="_blank" rel="noreferrer" className="text-gray-100 hover:underline">
          {l.name || `TCGplayer ${l.tcgplayer_product_id}`}
        </a>
        <div className="text-xs text-gray-500">
          {[l.set_name, l.product_type, l.game].filter(Boolean).join(" · ")} · #{l.tcgplayer_product_id}
        </div>
      </td>
      <td className={`py-2 pr-3 text-xs ${STATUS_CLS[l.status]}`}>
        {l.status}
        {l.status === "linked" && <div className="text-gray-500">{l.months} months</div>}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-400 max-w-md">
        {l.pricecharting_url && (
          <a href={l.pricecharting_url} target="_blank" rel="noreferrer" className="block text-sky-300 hover:underline font-mono">
            {pcPath(l.pricecharting_url)}
          </a>
        )}
        {l.note && <div>{l.note}</div>}
        {l.status === "unmatched" && l.candidates.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {l.candidates.map((c) => (
              <li key={c.url} className="flex items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => save({ pricecharting_url: c.url })}
                  className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  Use
                </button>
                <a href={c.url} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                  {pcPath(c.url)}
                </a>
                {c.tcgplayer_id && <span className="text-gray-600">(TCGplayer {c.tcgplayer_id})</span>}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-2 text-xs">
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) save({ pricecharting_url: url.trim() });
          }}
        >
          <input
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="https://www.pricecharting.com/game/…"
            className="w-72 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono"
          />
          <button disabled={busy || !url.trim()} className="px-2 py-0.5 rounded bg-sky-700 text-white disabled:opacity-50">
            Link
          </button>
        </form>
        <div className="mt-1 flex gap-2 text-gray-400">
          {l.status !== "none" && (
            <button disabled={busy} onClick={() => save({ status: "none" })} className="hover:text-gray-200 disabled:opacity-50">
              Not on PriceCharting
            </button>
          )}
          {l.status !== "pending" && (
            <button disabled={busy} onClick={() => save({ status: "pending" })} className="hover:text-gray-200 disabled:opacity-50">
              Look up again
            </button>
          )}
          {busy && <span className="text-gray-500">saving…</span>}
        </div>
        {err && <div className="mt-1 text-red-400">{err}</div>}
      </td>
    </tr>
  );
}

export default function SealedTodoPage() {
  const session = useSession();
  const [filter, setFilter] = useState<"" | SealedLinkStatus>("unmatched");
  const [links, setLinks] = useState<SealedLink[] | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    let live = true;
    setErr("");
    fetchSealedLinks(filter)
      .then((r) => live && setLinks(r.links))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [session, filter, tick]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-lg font-semibold text-white">Sealed TODO</h1>
      <p className="mt-1 text-sm text-gray-400">
        Sealed products the admin app asked price history for. Each is linked to its PriceCharting page on its own when the page shows the
        same TCGplayer id. The rest need a person: pick a candidate or paste the PriceCharting page, and its monthly prices load right away.
      </p>
      {!session ? (
        <p className="mt-4 text-sm text-gray-400">Sign in to see the list.</p>
      ) : (
        <>
          <div className="mt-4 flex gap-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setLinks(null);
                  setFilter(f.id);
                }}
                className={`px-2 py-1 rounded ${filter === f.id ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {err && <ErrorMsg msg={err} />}
          {!links && !err && <Spinner />}
          {links && links.length === 0 && <p className="mt-4 text-sm text-gray-500">Nothing here.</p>}
          {links && links.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="pb-1 pr-3 font-normal">Product</th>
                    <th className="pb-1 pr-3 font-normal">Status</th>
                    <th className="pb-1 pr-3 font-normal">PriceCharting</th>
                    <th className="pb-1 font-normal">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <Row key={l.tcgplayer_product_id} l={l} onSaved={() => setTick((t) => t + 1)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
