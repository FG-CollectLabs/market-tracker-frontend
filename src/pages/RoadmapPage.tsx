import { useState } from "react";
import { OPEN_QUESTIONS, PATCH_NOTES, PHASES, type Status } from "../content/roadmap";
import { DIAGRAM, SECTIONS } from "../content/architecture";
import SystemStatus from "../components/SystemStatus";

const STATUS: Record<Status, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-green-950/60 text-green-300 border-green-900" },
  in_progress: { label: "In progress", cls: "bg-sky-950/60 text-sky-300 border-sky-900" },
  next: { label: "Next", cls: "bg-indigo-950/60 text-indigo-300 border-indigo-900" },
  later: { label: "Later", cls: "bg-gray-900 text-gray-400 border-gray-700" },
  blocked: { label: "Needs a decision", cls: "bg-amber-950/60 text-amber-300 border-amber-900" },
};

function Badge({ s }: { s: Status }) {
  return <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[11px] font-medium ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}

// The development roadmap and patch notes (src/content/roadmap.ts). Changes
// land through PRs, so GitHub's history of that file is the audit trail.
export default function RoadmapPage() {
  const [tab, setTab] = useState<"status" | "roadmap" | "notes" | "architecture">("status");
  const counts = PHASES.flatMap((p) => p.items).reduce<Record<string, number>>((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {});

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Developer</h1>
        <p className="text-sm text-gray-500">
          Where the tracker is headed, what changed and how it fits together. Edits go through pull requests;{" "}
          <a className="text-indigo-300 hover:text-indigo-200"
            href="https://github.com/FG-CollectLabs/market-tracker-frontend/commits/main/src/content" target="_blank" rel="noreferrer">
            the history of src/content
          </a>{" "}
          is the audit trail.
        </p>
      </div>

      <div className="inline-flex rounded border border-gray-700 overflow-hidden text-sm">
        {(["status", "roadmap", "notes", "architecture"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 ${tab === t ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
            {t === "status" ? "Status" : t === "roadmap" ? "Roadmap" : t === "notes" ? "Patch notes" : "Architecture"}
          </button>
        ))}
      </div>

      {tab === "status" && <div className="max-w-6xl"><SystemStatus /></div>}

      {tab === "status" ? null : tab === "architecture" ? (
        <div className="space-y-5 max-w-6xl">
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-100 mb-3">How data flows</h2>
            <div className="flex items-stretch gap-2 min-w-[56rem]">
              {DIAGRAM.map((col, i) => (
                <div key={col.title} className="flex items-stretch gap-2 flex-1">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{col.title}</div>
                    {col.nodes.map((n) => (
                      <div key={n.id} className="rounded border border-gray-700 bg-gray-950/60 px-2.5 py-1.5">
                        <div className="text-xs text-gray-100">{n.label}</div>
                        {n.sub && <div className="text-[10px] text-gray-500 break-words">{n.sub}</div>}
                      </div>
                    ))}
                  </div>
                  {i < DIAGRAM.length - 1 && <div className="self-center text-gray-600 text-lg" aria-hidden>→</div>}
                </div>
              ))}
            </div>
          </section>
          {SECTIONS.map((sec) => (
            <section key={sec.title} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <h2 className="text-sm font-semibold text-gray-100 mb-2">{sec.title}</h2>
              <dl className="divide-y divide-gray-800">
                {sec.items.map((it) => (
                  <div key={it.name} className="py-2 grid gap-1 sm:grid-cols-[12rem_1fr]">
                    <dt className="text-sm text-gray-200">{it.name}</dt>
                    <dd className="text-xs text-gray-400">{it.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : tab === "roadmap" ? (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(STATUS) as Status[]).filter((s) => counts[s]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-gray-400"><Badge s={s} /> {counts[s]}</span>
            ))}
          </div>

          {OPEN_QUESTIONS.length > 0 && (
            <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
              <h2 className="text-sm font-semibold text-amber-200">Open questions</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-300 list-disc pl-5">
                {OPEN_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </section>
          )}

          {PHASES.map((p) => (
            <section key={p.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">{p.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{p.goal}</p>
              </div>
              <ul className="divide-y divide-gray-800">
                {p.items.map((i) => (
                  <li key={i.title} className="flex items-start gap-3 py-2">
                    <Badge s={i.status} />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-200">{i.title}</div>
                      {i.detail && <div className="text-xs text-gray-500 mt-0.5">{i.detail}</div>}
                      {i.links && (
                        <div className="flex gap-2 mt-1 text-xs">
                          {i.links.map((l) => (
                            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">{l.label}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <ol className="space-y-4">
          {PATCH_NOTES.map((n, i) => (
            <li key={i} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-100">{n.title}</h2>
                <time className="text-xs text-gray-500 tabular-nums">{n.date}</time>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-gray-300 list-disc pl-5">
                {n.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
              {n.links && (
                <div className="flex gap-2 mt-2 text-xs">
                  {n.links.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">{l.label}</a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
