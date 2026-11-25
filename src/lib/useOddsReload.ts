import { useCallback, useEffect, useRef, useState } from "react";
import { GRADE_ODDS_REFRESHED } from "./api";

// What a GRADE_ODDS_REFRESHED event carries: the listings whose odds were
// re-read (none: a bulk refresh, the whole board).
export interface OddsRefreshedDetail { listingIds?: string[] }

export function announceOddsRefreshed(listingIds?: string[]) {
  window.dispatchEvent(new CustomEvent<OddsRefreshedDetail>(GRADE_ODDS_REFRESHED, { detail: { listingIds } }));
}

// A counter that goes up whenever a copy's odds are refreshed from the
// grading predictor (the ↻ on an odds badge). Add it to a board's fetch
// dependencies so adjusted odds, EV and suggested bids recompute.
export function useOddsReload(): number {
  return useOddsRefreshing().tick;
}

// The same counter, plus which rows are waiting on the reloaded board (their
// centering, odds and EV are recomputed server-side): the board shows them
// as updating until its fetch for this tick settles (call settle(tick)).
export function useOddsRefreshing() {
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<{ ids: Set<string>; all: boolean }>({ ids: new Set(), all: false });
  const tickRef = useRef(0);
  useEffect(() => {
    const on = (e: Event) => {
      const ids = (e as CustomEvent<OddsRefreshedDetail>).detail?.listingIds;
      setPending((p) => ids?.length ? { ids: new Set([...p.ids, ...ids]), all: p.all } : { ids: p.ids, all: true });
      tickRef.current += 1;
      setTick(tickRef.current);
    };
    window.addEventListener(GRADE_ODDS_REFRESHED, on);
    return () => window.removeEventListener(GRADE_ODDS_REFRESHED, on);
  }, []);
  // a fetch started at tick t settled: rows refreshed before it are current
  const settle = useCallback((t: number) => {
    if (t === tickRef.current) setPending({ ids: new Set(), all: false });
  }, []);
  const isPending = useCallback((listingId: string) => pending.all || pending.ids.has(listingId), [pending]);
  return { tick, settle, isPending, count: pending.ids.size, all: pending.all };
}
