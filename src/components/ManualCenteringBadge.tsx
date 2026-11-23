// The pre-grader held a copy's odds back: its outline or borders can't be
// trusted, so a person checks the centering first (copy page, Centering).
// Shown in place of odds and EV; not a low-odds answer.
export default function ManualCenteringBadge({ reasons, url, compact }: { reasons?: string[]; url?: string; compact?: boolean }) {
  const tip = ["Odds held by the pre-grader until a person checks this copy's centering (not a low-odds answer).", ...(reasons ?? [])].join("\n");
  const cls = "inline-block whitespace-nowrap rounded border border-amber-700 bg-amber-950/40 px-1.5 py-0.5 text-[11px] text-amber-200";
  const label = compact ? "Manual centering" : "Needs manual centering";
  return url
    ? <a href={url} target="_blank" rel="noreferrer" title={tip} className={`${cls} hover:bg-amber-900/50`}>{label} ↗</a>
    : <span title={tip} className={cls}>{label}</span>;
}
