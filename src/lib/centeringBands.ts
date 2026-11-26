import { useEffect, useSyncExternalStore } from "react";
import { fetchCenteringBands, type CardBands } from "./api";

// Per-card centering bands, fetched in batches as cells ask for them: every
// key asked within a tick goes in one call. Cached for the page's life; a
// card the pre-grader doesn't know gets the whole-grader defaults.

const bands = new Map<string, CardBands | null>(); // null: asked, none (use defaults)
let defaults: CardBands | null = null;
const queued = new Set<string>();
const inflight = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };

function flush() {
  timer = undefined;
  const keys = [...queued];
  queued.clear();
  for (let i = 0; i < keys.length; i += 1500) {
    const part = keys.slice(i, i + 1500);
    part.forEach((k) => inflight.add(k));
    fetchCenteringBands(part)
      .then((r) => {
        if (r.defaults) defaults = r.defaults;
        if (r.error) { part.forEach((k) => { if (r.bands[k]) bands.set(k, r.bands[k]); }); return; } // retry the rest on a later ask
        part.forEach((k) => bands.set(k, r.bands[k] ?? null));
      })
      .catch(() => {})
      .finally(() => { part.forEach((k) => inflight.delete(k)); bump(); });
  }
}

function ask(key?: string) {
  if (!key || bands.has(key) || inflight.has(key) || queued.has(key)) return;
  queued.add(key);
  if (!timer) timer = setTimeout(flush, 30);
}

// peekBands: what's loaded for a card (its own, else the defaults), no fetch.
export function peekBands(key?: string): CardBands | undefined {
  const b = key ? bands.get(key) : undefined;
  return b ?? defaults ?? undefined;
}

// useCenteringBands: a card's bands, fetching them when first asked.
export function useCenteringBands(key?: string): CardBands | undefined {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  useEffect(() => ask(key), [key]);
  return peekBands(key);
}

// useBandsFor: ask for many cards at once (a board's filters); returns a
// version that changes as they load.
export function useBandsFor(keys: string[]): number {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  useEffect(() => keys.forEach(ask), [keys]);
  return v;
}
