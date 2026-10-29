import { useCallback, useEffect, useState } from "react";
import { fetchSystemStatus, type CheckStatus, type SystemCheck, type SystemStatus as Data } from "../lib/api";
import { useSession } from "../lib/auth";

// Where everything runs and whether it's alive: every server, service and
// worker the tracker depends on, checked by the API every 5 minutes, with
// the last 24 hours as a heartbeat strip.

const GROUPS: { key: SystemCheck["group"]; title: string; sub: string }[] = [
  { key: "edge", title: "Public edge", sub: "What users hit: Cloudflare in front of the API, GitHub Pages for the site" },
  { key: "lxc109", title: "LXC 109 · app server (proxmox5)", sub: "Docker: the API, the job worker and scheduler, the other FG services" },
  { key: "lxc106", title: "LXC 106 · database (proxmox5)", sub: "Postgres 15, database market_tracker" },
  { key: "agents", title: "Agent hosts", sub: "Claude Code workers on the two subscription accounts (deal vetting, data triage, art tags)" },
  { key: "jobs", title: "Job queue", sub: "Work the workers claim, by kind" },
  { key: "data", title: "Data feeds", sub: "Each ingest's last success against how often it should run" },
];

const DOT: Record<CheckStatus | "", string> = {
  ok: "bg-green-500", warn: "bg-amber-400", down: "bg-red-500", unknown: "bg-gray-500", "": "bg-gray-800",
};
const WORD: Record<CheckStatus, string> = { ok: "OK", warn: "Warning", down: "Down", unknown: "Unknown" };
const rank: Record<string, number> = { "": 0, unknown: 1, ok: 2, warn: 3, down: 4 };

// 288 five-minute slots shown as 96 fifteen-minute cells (worst of three).
function Strip({ slots, minutes }: { slots?: ("" | CheckStatus)[]; minutes: number }) {
  if (!slots) return <div className="text-[10px] text-gray-600">no history yet</div>;
  const per = 3;
  const cells: ("" | CheckStatus)[] = [];
  for (let i = 0; i < slots.length; i += per) {
    cells.push(slots.slice(i, i + per).reduce<"" | CheckStatus>((w, s) => (rank[s] > rank[w] ? s : w), ""));
  }
  return (
    <div className="flex gap-px" title={`Last 24 h, ${minutes * per}-minute cells (oldest left)`}>
      {cells.map((s, i) => <span key={i} className={`h-3 w-1 rounded-[1px] ${DOT[s]}`} />)}
    </div>
  );
}

export default function SystemStatus() {
  const session = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    fetchSystemStatus().then((d) => { setData(d); setErr(""); }).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!session) return;
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [session, load]);

  if (!session) return <p className="text-sm text-gray-400">Sign in to see system status.</p>;
  if (err && !data) return <p className="text-sm text-red-400">{err}</p>;
  if (!data) return <p className="text-sm text-gray-500">Checking…</p>;

  const counts = data.checks.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  const problems = data.checks.filter((c) => c.status === "down" || c.status === "warn");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded border ${counts.down ? "border-red-800 bg-red-950/40 text-red-200" : counts.warn ? "border-amber-800 bg-amber-950/30 text-amber-200" : "border-green-900 bg-green-950/30 text-green-200"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${counts.down ? DOT.down : counts.warn ? DOT.warn : DOT.ok}`} />
          {counts.down ? `${counts.down} down` : counts.warn ? `${counts.warn} need attention` : "Everything is up"}
        </span>
        <span className="text-xs text-gray-500">
          {counts.ok ?? 0} ok · {counts.warn ?? 0} warning · {counts.down ?? 0} down · checked {new Date(data.checked_at).toLocaleTimeString()} · refreshes every minute
        </span>
        <button onClick={load} className="text-xs text-indigo-300 hover:text-indigo-200">Check now</button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>

      {problems.length > 0 && (
        <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 space-y-1">
          <h2 className="text-sm font-semibold text-amber-200">Needs attention</h2>
          {problems.map((c) => (
            <div key={c.id} className="text-xs text-gray-300 flex gap-2">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} />
              <span><b className="text-gray-100">{c.name}</b>{c.where ? <span className="text-gray-500"> · {c.where}</span> : null}: {c.detail}</span>
            </div>
          ))}
        </section>
      )}

      {GROUPS.map((g) => {
        const cs = data.checks.filter((c) => c.group === g.key);
        if (cs.length === 0) return null;
        return (
          <section key={g.key} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">{g.title}</h2>
              <p className="text-xs text-gray-500">{g.sub}</p>
            </div>
            <div className="divide-y divide-gray-800">
              {cs.map((c) => (
                <div key={c.id} className="py-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} title={WORD[c.status]} />
                      <span className="text-gray-100">{c.name}</span>
                      {c.where && <span className="text-xs text-gray-500 truncate">{c.where}</span>}
                    </div>
                    {c.detail && <div className="text-xs text-gray-400 ml-[18px] break-words">{c.detail}</div>}
                  </div>
                  <div className="ml-[18px] md:ml-0 overflow-x-auto"><Strip slots={data.history[c.id]} minutes={data.slot_minutes} /></div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-100 mb-3">How code ships</h2>
        <div className="space-y-3 min-w-[48rem] text-xs">
          {[
            ["Backend (market-tracker-backend, branch master)", ["Merge a PR", "GitHub Actions: build the Docker image", "Docker Hub: philwin/market-tracker-backend:<commit>", "Deploy runner on LXC 109: pull, recreate API + worker, health check, prune old images", "Live at market.futuregadgetlabs.com (Cloudflare)"]],
            ["Frontend (market-tracker-frontend, branch main)", ["Merge a PR", "GitHub Actions: build the site", "GitHub Pages", "Live at market-tracker-coverage.futuregadgetlabs.com"]],
            ["Database migrations", ["PR adds migrations/NNNN_*.sql", "Run by hand as postgres on LXC 106 (goose_db_version records it)", "Merge after it's applied"]],
            ["Agent workers", ["Worker script served by the API", "Re-downloaded by hand on each agent host (not self-updating)", "systemd user service, restarts on its own"]],
            ["Scraper (sellthrough-analyzer)", ["Merge a PR", "Rebuilds its own sellthrough-worker container on LXC 109"]],
          ].map(([title, steps]) => (
            <div key={title as string}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{title}</div>
              <div className="flex items-stretch gap-2">
                {(steps as string[]).map((s, i, a) => (
                  <div key={s} className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 rounded border border-gray-700 bg-gray-950/60 px-2.5 py-1.5 text-gray-200">{s}</div>
                    {i < a.length - 1 && <span className="text-gray-600" aria-hidden>→</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
