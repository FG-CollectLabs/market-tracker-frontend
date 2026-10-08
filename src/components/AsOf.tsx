import type { ReactNode } from "react";
import { FRESH_TEXT, ago, freshness, isStale, shortDate } from "../lib/freshness";

// Wraps a value with its capture date: a tooltip always, an amber dot once
// it missed a weekly run (> 8 days) and red text past 30 days.
export function AsOf({ at, label, children }: { at: string | null | undefined; label: string; children: ReactNode }) {
  if (!at) return <>{children}</>;
  const f = freshness(at);
  return (
    <span
      className={f === "old" ? `${FRESH_TEXT.old} [&_*]:!text-red-400` : undefined}
      title={`${label} · updated ${shortDate(at)} (${ago(at)})${f === "old" ? " — over 30 days old" : ""}`}
    >
      {children}
      {f === "late" && <span className="text-amber-600 ml-0.5">•</span>}
    </span>
  );
}

// One chip per field with the newest date in view; red when even the newest
// value is stale, so a missed weekly run shows up at a glance.
export function FreshnessChips({ fields }: { fields: { label: string; at: string | null }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">Updated:</span>
      {fields.map(({ label, at }) => {
        const stale = !at || isStale(at);
        return (
          <span
            key={label}
            className={`px-2 py-0.5 rounded border ${stale ? "border-red-900/70 bg-red-950/30 text-red-300" : "border-gray-800 bg-gray-900/40 text-gray-300"}`}
            title={at ? `Newest ${label} value: ${new Date(at).toLocaleString()} (${ago(at)})` : `No ${label} data`}
          >
            {label} <span className="text-gray-500">{at ? shortDate(at) : "never"}</span>
          </span>
        );
      })}
    </div>
  );
}
