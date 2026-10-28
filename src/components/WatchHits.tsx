import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HIT_REASONS, clearHitReview, reviewHit, type HitReason, type TargetHit, type WatchTarget } from "../lib/api";
import { TARGET_LABEL } from "./WatchTargets";

// The watchlist's live listings ("hits"): filters, one listing row with its
// set-aside / note actions, the photo overlay and the strategies drawer.

const usd = (c?: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

export type HitSort = "under" | "ending" | "cheapest";

export interface HitFilters {
  kind: "all" | "auction" | "buy_now";
  source: "all" | "fanatics" | "ebay";
  hideOnePhoto: boolean;
  sort: HitSort;
}

export const DEFAULT_HIT_FILTERS: HitFilters = { kind: "all", source: "all", hideOnePhoto: false, sort: "under" };

const FILTERS_KEY = "watchlist.filters";

export function loadHitFilters(): HitFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return { ...DEFAULT_HIT_FILTERS, ...JSON.parse(raw) };
  } catch {
    // private window or blocked storage: defaults
  }
  return DEFAULT_HIT_FILTERS;
}

export function saveHitFilters(f: HitFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    // not remembered; fine
  }
}

// A raw listing with a single photo can't be showing the back.
export const onePhotoRaw = (h: TargetHit) => h.grade_key === "raw" && h.image_count === 1;

const passed = (h: TargetHit) => h.review?.status === "pass";
const interested = (h: TargetHit) => h.review?.status === "interested";

// One listing under a card, with every strategy it matched.
export interface CardHit {
  key: string; // source:listing_id
  h: TargetHit;
  targets: WatchTarget[];
  under: number; // 1 - all-in / max (the max for this copy's grade)
}

export const hitKey = (h: { source: string; listing_id: string }) => `${h.source}:${h.listing_id}`;

// A card's listings under its shown targets that pass the filters, one per
// listing. Set-aside ones only when includePassed; `hidden` are set aside
// locally while the save is in flight.
export function cardHits(targets: WatchTarget[], f: HitFilters, includePassed: boolean, hidden: Set<string>): CardHit[] {
  const m = new Map<string, CardHit>();
  for (const t of targets)
    for (const h of t.hits ?? []) {
      const k = hitKey(h);
      if (hidden.has(k) || (!includePassed && passed(h))) continue;
      if (f.kind !== "all" && h.kind !== f.kind) continue;
      if (f.source !== "all" && h.source !== f.source) continue;
      if (f.hideOnePhoto && onePhotoRaw(h)) continue;
      const under = h.max_cents ? 1 - h.all_in_cents / h.max_cents : 0;
      const cur = m.get(k);
      if (!cur) m.set(k, { key: k, h, targets: [t], under });
      else {
        cur.targets.push(t);
        if (under > cur.under) Object.assign(cur, { h, under });
      }
    }
  return sortHits([...m.values()], f.sort);
}

export function sortHits(list: CardHit[], sort: HitSort): CardHit[] {
  const end = (x: CardHit) => (x.h.kind === "auction" && x.h.ends_at ? new Date(x.h.ends_at).getTime() : Infinity);
  return [...list].sort((a, b) => {
    // Interested first; set-aside rows (Show set-aside) last.
    if (interested(a.h) !== interested(b.h)) return interested(a.h) ? -1 : 1;
    if (passed(a.h) !== passed(b.h)) return passed(a.h) ? 1 : -1;
    if (sort === "ending") return end(a) - end(b) || b.under - a.under;
    if (sort === "cheapest") return a.h.all_in_cents - b.h.all_in_cents;
    return b.under - a.under;
  });
}

// Time left on an auction: 2d 4h, 3h 12m, or mm:ss under an hour.
export function timeLeft(iso: string | undefined, now: number): { text: string; urgent: boolean; soon: boolean } | null {
  if (!iso) return null;
  const s = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return { text: "ended", urgent: true, soon: true };
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return { text, urgent: s < 300, soon: s < 3600 };
}

// The page's clock: every 30 s, every second while the soonest auction shown
// (soonest: its end, ms) ends within the hour.
export function useNow(soonest: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const fast = soonest != null && soonest - now < 3600_000 && soonest > now - 60_000;
    const t = setTimeout(() => setNow(Date.now()), fast ? 1000 : 30000);
    return () => clearTimeout(t);
  }, [now, soonest]);
  return now;
}

const reasonLabel = (r?: HitReason) =>
  r === "no_back_photo" ? "No back photo · auto" : HIT_REASONS.find((x) => x.key === r)?.label ?? "Set aside";

// eBay photo URLs carry their size (s-l225); ask for a large one.
export const largePhoto = (url: string) => url.replace(/\/s-l\d+\./, "/s-l1600.");

export interface Photo {
  url: string;
  title: string;
  href?: string;
}

export function HitRow({ ch, displayKey, now, error, onOpen, onSetAside, onChanged }: {
  ch: CardHit;
  displayKey: string;
  now: number;
  error?: string;
  onOpen: () => void; // the quick-review viewer, at this listing
  onSetAside: (ch: CardHit, reason: HitReason, note: string) => void;
  onChanged: () => void;
}) {
  const { h } = ch;
  const [menu, setMenu] = useState(false);
  const [asideNote, setAsideNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(h.review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);
  const [maxBid, setMaxBid] = useState(h.review?.max_bid_cents != null ? (h.review.max_bid_cents / 100).toFixed(2) : "");
  const [likeNote, setLikeNote] = useState(h.review?.note ?? "");
  const isPassed = passed(h);
  const isLiked = interested(h);
  const left = h.kind === "auction" ? timeLeft(h.ends_at, now) : null;

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await f();
      onChanged();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    const text = note.trim();
    const ok = await run(() => (text
      ? reviewHit({ source: h.source, listing_id: h.listing_id, display_key: displayKey, status: "note", note: text, price_cents: h.all_in_cents })
      : clearHitReview(h.source, h.listing_id)));
    if (ok) setEditing(false);
  };

  const saveLike = async () => {
    const dollars = Number(maxBid);
    const ok = await run(() => reviewHit({
      source: h.source, listing_id: h.listing_id, display_key: displayKey, status: "interested", price_cents: h.all_in_cents,
      note: likeNote.trim() || undefined, max_bid_cents: maxBid.trim() && dollars >= 0 ? Math.round(dollars * 100) : undefined,
    }));
    if (ok) setLiking(false);
  };

  return (
    <div className={`py-2 text-xs flex items-start gap-2 break-inside-avoid ${isPassed ? "opacity-50" : ""} ${isLiked ? "bg-amber-950/20 -mx-2 px-2 rounded" : ""}`}>
      {h.image_url ? (
        <button onClick={onOpen} className="shrink-0 print:pointer-events-none" title="Review: every photo, ★ Interested / ✕ Not interested, next listing">
          <img src={h.image_url} alt="" loading="lazy" className="w-12 h-12 object-cover rounded-sm bg-gray-800" />
        </button>
      ) : (
        <div className="w-12 h-12 rounded-sm bg-gray-800 shrink-0" title="No photo" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className="px-1 rounded bg-gray-800 text-gray-300 print:border print:border-gray-400 print:text-black">{h.source === "fanatics" ? "Fanatics" : "eBay"}</span>
          <span className={`px-1 rounded ${h.kind === "auction" ? "bg-amber-900/40 text-amber-200" : "bg-emerald-900/40 text-emerald-200"} print:border print:border-gray-400 print:text-black`}>
            {h.kind === "auction" ? "Auction" : "Buy Now"}
          </span>
          <span className="text-gray-300 font-medium print:text-black">{h.grade_key.toUpperCase()}</span>
          <span className="text-gray-500">· {ch.targets.map((t) => TARGET_LABEL[t.target]).join(", ")}</span>
          {onePhotoRaw(h) && <span className="px-1 rounded bg-amber-900/50 text-amber-200" title="Only one photo: the back isn't shown">1 photo</span>}
          {isPassed && <span className="px-1 rounded border border-gray-600 text-gray-300">{reasonLabel(h.review?.reason)}</span>}
          {isLiked && (
            <span className="px-1 rounded bg-amber-500/90 text-black font-medium print:border print:border-gray-400">
              ★ Interested{h.review?.max_bid_cents != null ? ` · max ${usd(h.review.max_bid_cents)}` : ""}
            </span>
          )}
          {h.seller && <span className="text-gray-600" title="eBay seller">· {h.seller}</span>}
        </div>
        {h.url
          ? <a href={h.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 print:text-black block truncate">{h.title}</a>
          : <span className="text-gray-200 block truncate">{h.title}</span>}
        {h.review?.note && !editing && <div className="text-[11px] text-amber-200/80 print:text-black">{h.review.note}</div>}
        <div className="text-[11px] text-gray-400 tabular-nums print:text-black">
          {h.kind === "auction" ? "Bid" : "Ask"} {h.shipping_cents ? <>{usd(h.price_cents - h.shipping_cents)} + {usd(h.shipping_cents)} ship</> : usd(h.price_cents)}
          {h.all_in_cents !== h.price_cents && <> · all-in <span className="text-gray-200 print:text-black">{usd(h.all_in_cents)}</span></>}
          {" "}· max {usd(h.max_cents)} ·{" "}
          <span className={ch.under >= 0 ? "text-green-300 print:text-black" : "text-red-300"}>{Math.round(ch.under * 100)}% under</span>
          {h.kind === "auction" && (
            <>
              {" "}· {h.bids ?? 0} bid{h.bids === 1 ? "" : "s"}
              {left && <> · <span className={left.urgent ? "text-red-400 font-medium" : "text-gray-200"}>{left.text}</span></>}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 pt-0.5 print:hidden">
          {isPassed ? (
            <button disabled={busy} onClick={() => run(() => clearHitReview(h.source, h.listing_id))}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40">Restore</button>
          ) : (
            <span className="relative">
              <button onClick={() => setMenu(!menu)} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-white" title="Set aside with a reason">Set aside ▾</button>
              {menu && (
                <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded border border-gray-700 bg-gray-950 p-2 space-y-1 shadow-lg"
                  onKeyDown={(e) => { if (e.key === "Escape") setMenu(false); }}>
                  <input value={asideNote} onChange={(e) => setAsideNote(e.target.value)} maxLength={2000} placeholder="Note (optional)"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200" />
                  {HIT_REASONS.map((r) => (
                    <button key={r.key} title={r.hint} onClick={() => { setMenu(false); onSetAside(ch, r.key, asideNote.trim()); }}
                      className="block w-full text-left px-1.5 py-1 rounded text-[11px] text-gray-200 hover:bg-gray-800">
                      {r.label} <span className="text-gray-500">· {r.hint}</span>
                    </button>
                  ))}
                  <button onClick={() => setMenu(false)} className="text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
              )}
            </span>
          )}
          {!isPassed && !isLiked && (
            <button disabled={busy} title="Keep it at the top of this card's listings (add a max bid with Edit ★)"
              onClick={() => run(() => reviewHit({ source: h.source, listing_id: h.listing_id, display_key: displayKey, status: "interested", price_cents: h.all_in_cents, note: h.review?.note }))}
              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/70 text-amber-200 hover:text-amber-100 disabled:opacity-40">★ Interested</button>
          )}
          {!isPassed && (
            <button title="Set aside (not interested); pick a reason with Set aside ▾ if you want one"
              onClick={() => onSetAside(ch, "not_interested", "")}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 hover:text-white">✕ Not interested</button>
          )}
          {isLiked && !liking && (
            <button onClick={() => setLiking(true)} title="Max bid and note"
              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/70 text-amber-200 hover:text-amber-100">Edit ★</button>
          )}
          {isLiked && !liking && (
            <button disabled={busy} onClick={() => run(() => clearHitReview(h.source, h.listing_id))}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40">Unmark</button>
          )}
          {!editing && !isLiked && (
            <button onClick={() => { setEditing(true); setNote(h.review?.note ?? ""); }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white">{h.review?.note ? "Edit note" : "Note"}</button>
          )}
        </div>
        {liking && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5 print:hidden">
            <span className="text-[11px] text-gray-400">Max bid $</span>
            <input autoFocus type="number" min={0} step={0.01} value={maxBid} onChange={(e) => setMaxBid(e.target.value)} placeholder="optional"
              className="w-20 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200 text-right" />
            <input value={likeNote} onChange={(e) => setLikeNote(e.target.value)} maxLength={2000} placeholder="Note (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") saveLike(); if (e.key === "Escape") setLiking(false); }}
              className="flex-1 min-w-[10rem] bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200" />
            <button disabled={busy} onClick={saveLike} className="text-[10px] px-1.5 rounded bg-amber-600 text-black hover:bg-amber-500 disabled:opacity-40">Save</button>
            <button onClick={() => setLiking(false)} className="text-[10px] px-1 text-gray-400 hover:text-gray-200">Cancel</button>
          </div>
        )}
        {editing && (
          <div className="flex gap-1 pt-0.5 print:hidden">
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setEditing(false); }}
              className="flex-1 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200" />
            <button disabled={busy} onClick={saveNote} className="text-[10px] px-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40">Save</button>
            <button onClick={() => setEditing(false)} className="text-[10px] px-1 text-gray-400 hover:text-gray-200">Cancel</button>
          </div>
        )}
        {(err || error) && <div className="text-[11px] text-red-400">{err || error}</div>}
      </div>
    </div>
  );
}

// Every photo of a listing, large (eBay's own URLs; s-l1600 is the full size).
export const photosOf = (h: TargetHit) => {
  const xs = h.image_urls?.length ? h.image_urls : h.image_url ? [h.image_url] : [];
  return xs.map(largePhoto);
};

// Quick review: a card's listings one at a time with every photo. Click the
// photo (or →) for the next photo, then the next listing; ← back; I marks
// interested, N sets it aside as not interested and moves on; ↓ skips to the
// next listing; Escape closes.
export function Reviewer({ title, hits, start, displayKey, now, onClose, onNotInterested, onChanged }: {
  title: string;
  hits: CardHit[];
  start: number;
  displayKey: string;
  now: number;
  onClose: () => void;
  onNotInterested: (ch: CardHit) => void;
  onChanged: () => void;
}) {
  const [i, setI] = useState(start);
  const [p, setP] = useState(0);
  const [marks, setMarks] = useState<Record<string, "interested" | "pass">>({});
  const [err, setErr] = useState<string | null>(null);
  const ch = hits[Math.min(i, hits.length - 1)];
  const h = ch?.h;
  const photos = h ? photosOf(h) : [];
  const mark = h ? marks[ch.key] ?? (h.review?.status === "interested" ? "interested" : h.review?.status === "pass" ? "pass" : undefined) : undefined;

  const go = useCallback((di: number) => {
    setI((x) => Math.max(0, Math.min(hits.length - 1, x + di)));
    setP(0);
  }, [hits.length]);
  const nextPhoto = useCallback(() => {
    if (p + 1 < photos.length) setP(p + 1);
    else if (i + 1 < hits.length) go(1);
  }, [p, photos.length, i, hits.length, go]);
  const prevPhoto = useCallback(() => {
    if (p > 0) setP(p - 1);
    else if (i > 0) go(-1);
  }, [p, i, go]);
  const like = useCallback(async () => {
    if (!h) return;
    setErr(null);
    try {
      await reviewHit({ source: h.source, listing_id: h.listing_id, display_key: displayKey, status: "interested", price_cents: h.all_in_cents, note: h.review?.note });
      setMarks((m) => ({ ...m, [ch.key]: "interested" }));
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [h, ch, displayKey, onChanged]);
  const nope = useCallback(() => {
    if (!h) return;
    onNotInterested(ch);
    setMarks((m) => ({ ...m, [ch.key]: "pass" }));
    if (i + 1 < hits.length) go(1);
  }, [h, ch, i, hits.length, go, onNotInterested]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      switch (e.key) {
        case "Escape": onClose(); break;
        case "ArrowRight": nextPhoto(); break;
        case "ArrowLeft": prevPhoto(); break;
        case "ArrowDown": case "j": go(1); break;
        case "ArrowUp": case "k": go(-1); break;
        case "i": case "I": like(); break;
        case "n": case "N": nope(); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, nextPhoto, prevPhoto, go, like, nope]);

  if (!h) return null;
  const left = h.kind === "auction" ? timeLeft(h.ends_at, now) : null;
  const btn = "px-3 py-1.5 rounded text-sm font-medium disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-40 bg-black/90 flex flex-col print:hidden" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300" onClick={(e) => e.stopPropagation()}>
        <span className="font-semibold text-white truncate">{title}</span>
        <span className="text-gray-500">listing {i + 1} of {hits.length}</span>
        <span className="flex-1" />
        <span className="hidden md:inline text-xs text-gray-500">click photo / → next · ← back · ↓ next listing · I interested · N not interested · Esc close</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
          {photos.length > 0
            ? <img src={photos[p]} alt={h.title} onClick={nextPhoto} className="max-h-[72vh] max-w-full object-contain rounded cursor-pointer select-none" title="Next photo" />
            : <div className="text-gray-500 text-sm">No photos for this listing</div>}
          {photos.length > 1 && (
            <div className="flex gap-1 overflow-x-auto max-w-full">
              {photos.map((u, k) => (
                <img key={u} src={u} alt="" loading="lazy" onClick={() => setP(k)}
                  className={`h-14 w-14 object-cover rounded cursor-pointer ${k === p ? "ring-2 ring-indigo-400" : "opacity-60 hover:opacity-100"}`} />
              ))}
            </div>
          )}
          <span className="text-xs text-gray-500">
            photo {photos.length ? p + 1 : 0} of {photos.length}
            {(h.image_count ?? 0) > photos.length && <> · eBay lists {h.image_count}; the rest load after the next eBay check of this listing</>}
          </span>
        </div>
        <div className="lg:w-80 shrink-0 space-y-2 text-sm text-gray-300">
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="px-1 rounded bg-gray-800">{h.source === "fanatics" ? "Fanatics" : "eBay"}</span>
            <span className="px-1 rounded bg-gray-800">{h.kind === "auction" ? "Auction" : "Buy Now"}</span>
            <span className="px-1 rounded bg-gray-800 font-medium">{h.grade_key.toUpperCase()}</span>
            {onePhotoRaw(h) && <span className="px-1 rounded bg-amber-900/50 text-amber-200">1 photo</span>}
            {h.seller && <span className="text-gray-500">{h.seller}</span>}
          </div>
          <div className="text-gray-100">{h.title}</div>
          <div className="tabular-nums space-y-0.5">
            <div>{h.kind === "auction" ? "Bid" : "Ask"} <span className="text-white">{usd(h.shipping_cents ? h.price_cents - h.shipping_cents : h.price_cents)}</span>
              {h.shipping_cents ? <> + {usd(h.shipping_cents)} shipping</> : h.source === "ebay" ? <span className="text-gray-500"> (free or unknown shipping)</span> : null}</div>
            {h.all_in_cents !== h.price_cents && <div>All-in {usd(h.all_in_cents)} <span className="text-gray-500">(buyer's premium)</span></div>}
            <div>Max {usd(h.max_cents)} · <span className={ch.under >= 0 ? "text-green-300" : "text-red-300"}>{Math.round(ch.under * 100)}% under</span></div>
            {h.kind === "auction" && <div>{h.bids ?? 0} bid{h.bids === 1 ? "" : "s"}{left && <> · <span className={left.urgent ? "text-red-400" : ""}>{left.text} left</span></>}</div>}
            <div className="text-gray-500 text-xs">{ch.targets.map((t) => TARGET_LABEL[t.target]).join(", ")}</div>
          </div>
          {mark && <div className={`text-xs ${mark === "interested" ? "text-amber-300" : "text-gray-400"}`}>{mark === "interested" ? "★ Marked interested" : "Set aside"}</div>}
          {err && <div className="text-xs text-red-400">{err}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={like} disabled={mark === "interested"} className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>★ Interested <span className="text-xs opacity-70">I</span></button>
            <button onClick={nope} disabled={mark === "pass"} className={`${btn} bg-gray-700 text-white hover:bg-gray-600`}>✕ Not interested <span className="text-xs opacity-70">N</span></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => go(-1)} disabled={i === 0} className={`${btn} border border-gray-700 text-gray-300 hover:text-white`}>↑ Previous</button>
            <button onClick={() => go(1)} disabled={i >= hits.length - 1} className={`${btn} border border-gray-700 text-gray-300 hover:text-white`}>Next listing ↓</button>
            {h.url && <a href={h.url} target="_blank" rel="noreferrer" className={`${btn} text-indigo-300 hover:text-indigo-200`}>Open listing ↗</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A panel on the right over a backdrop; Escape or the backdrop closes it.
export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 print:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 w-[32rem] max-w-full bg-gray-950 border-l border-gray-800 overflow-y-auto p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-sm" title="Close (Esc)">✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}
