import { useEffect, useState } from "react";
import { GRADE_ODDS_REFRESHED } from "./api";

// A counter that goes up whenever a copy's odds are refreshed from the
// grading predictor (the ↻ on an odds badge). Add it to a board's fetch
// dependencies so adjusted odds, EV and suggested bids recompute.
export function useOddsReload(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    window.addEventListener(GRADE_ODDS_REFRESHED, on);
    return () => window.removeEventListener(GRADE_ODDS_REFRESHED, on);
  }, []);
  return n;
}
