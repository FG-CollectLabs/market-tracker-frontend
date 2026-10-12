import { useEffect, useState } from "react";
import {
  cancelJob, fetchAutomation, fetchFindings, fetchSettingsAudit, runJob, saveAutomation,
  type AgentFinding, type Automation, type AutomationStatus, type KindConfig, type SettingChange,
} from "../lib/api";
import { Link } from "react-router-dom";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";

const TIERS = ["hot", "warm", "cold"] as const;
const KIND_INFO: Record<string, { label: string; hint: string }> = {
  fanatics_history: { label: "Fanatics sold history", hint: "Sold history and live listings per card (2 requests). The heavy one." },
  fanatics_listings: { label: "Fanatics live listings", hint: "Live auctions, Buy Nows and supply only (1 request). Keeps this week's counts and ceilings fresh." },
  sync_owned: { label: "Owned-cards sync", hint: "Your FGL owned-cards feed; every owned card gets tracked." },
};
const AGENT_INFO: Record<string, { label: string; hint: string }> = {
  agent_deal_vetting: { label: "Deal vetting", hint: "Reads the top slab deals' live listings for anything that isn't the card, grade, printing or condition the deal assumes." },
  agent_data_triage: { label: "Data triage", hint: "Explains unmatched owned cards and PriceCharting prices our sales overruled, with the exact fix." },
};
const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
];
const VERDICT_CLS: Record<string, string> = {
  ok: "text-green-400", flag: "text-amber-300", fix: "text-amber-300", info: "text-sky-300",
};
const TIER_HINT: Record<string, string> = {
  hot: "Owned, watchlist and recently released sets.",
  warm: "The tiers below (rarity, Pokémon, artist).",
  cold: "Everything else tracked.",
};

const inputCls = "bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono text-right";
const ago = (iso?: string) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? `${Math.round(s)}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 172800 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const cadenceText = (h: number) => (h <= 0 ? "never" : h % 24 === 0 ? `${h / 24}d` : `${h}h`);
const STATUS_CLS: Record<string, string> = {
  queued: "text-gray-300", running: "text-sky-300", done: "text-green-400", failed: "text-red-400", cancelled: "text-gray-500",
};

function TierChecks({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  return (
    <span className="inline-flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o} className="inline-flex items-center gap-1 text-gray-300">
          <input type="checkbox" className="accent-indigo-500" checked={value.includes(o)}
            onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </span>
  );
}

// The job queue and worker: what refreshes how often, by card priority
// tier; what's running; and every settings change. Modelled on PolyEdge.
export default function AutomationPage() {
  const session = useSession();
  const [st, setSt] = useState<AutomationStatus | null>(null);
  const [a, setA] = useState<Automation | null>(null);
  const [audit, setAudit] = useState<SettingChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<AgentFinding[] | null>(null);
  useEffect(() => {
    fetchFindings({ limit: 60 }).then((r) => setFindings(r.findings)).catch(() => setFindings(null));
  }, [st?.queue.done_24h]);

  const load = () =>
    fetchAutomation()
      .then((s) => {
        setSt(s);
        setA((cur) => cur ?? s.settings);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (session) fetchSettingsAudit().then((r) => setAudit(r.changes)).catch(() => setAudit(null));
  }, [session, st?.settings.updated_at]);

  if (!st || !a) return error ? <ErrorMsg msg={error} /> : <Spinner />;
  const setKind = (k: string, patch: Partial<KindConfig>) => setA({ ...a, kinds: { ...a.kinds, [k]: { ...a.kinds[k], ...patch } } });
  const dirty = JSON.stringify(a) !== JSON.stringify(st.settings);
  const online = st.workers.filter((w) => w.online && w.info?.type !== "agent");
  const agents = st.workers.filter((w) => w.info?.type === "agent");
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await saveAutomation(a);
      setSt(s);
      setA(s.settings);
      setMsg("Saved. The scheduler picks it up on its next pass (within 5 minutes).");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const run = async (body: { kind: string; tier?: string }) => {
    try {
      const r = await runJob(body);
      setMsg(`Queued job #${r.id}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Automation</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            What refreshes how often. Cards are split into priority tiers; each job type refreshes each tier on its own cadence, one batch at a time,
            most important first. Fanatics jobs run one at a time across all workers so it never sees bursts.
            {st.settings.updated_at && <> Last saved {new Date(st.settings.updated_at).toLocaleString()}{st.settings.updated_by ? ` by ${st.settings.updated_by}` : ""}.</>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-1 rounded-full border ${online.length ? "border-green-800 text-green-300" : "border-red-800 text-red-300"}`}
            title={st.workers.map((w) => `${w.name}: ${ago(w.last_seen)}`).join("\n")}>
            {online.length ? `${online.length} data worker${online.length > 1 ? "s" : ""} online` : "no data worker online"}
          </span>
          <span className="px-2 py-1 rounded-full border border-gray-700 text-gray-300">
            {st.queue.running ?? 0} running · {st.queue.queued ?? 0} queued · {st.queue.done_24h ?? 0} done / {st.queue.failed_24h ?? 0} failed in 24h
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Tiers</h2>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" className="accent-indigo-500" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} />
            Scheduler on
          </label>
        </div>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left py-1 font-medium">Tier</th>
              <th className="text-right py-1 font-medium">Cards</th>
              {Object.keys(KIND_INFO).filter((k) => k !== "sync_owned").map((k) => (
                <th key={k} className="text-right py-1 font-medium">{KIND_INFO[k].label}: due now</th>
              ))}
              <th className="py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300">
            {TIERS.map((t) => (
              <tr key={t}>
                <td className="py-1.5"><span className="capitalize text-gray-100">{t}</span> <span className="text-xs text-gray-500">{TIER_HINT[t]}</span></td>
                <td className="py-1.5 text-right">{st.tiers[t]?.cards ?? 0}</td>
                {Object.keys(KIND_INFO).filter((k) => k !== "sync_owned").map((k) => (
                  <td key={k} className="py-1.5 text-right">{st.tiers[t]?.due[k] ?? 0}</td>
                ))}
                <td className="py-1.5 text-right">
                  {session && (
                    <button onClick={() => run({ kind: "fanatics_history", tier: t })} className="text-xs text-indigo-300 hover:text-indigo-200">
                      Refresh a batch now
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-2 text-xs text-gray-400 md:grid-cols-2">
          <label className="flex items-center gap-2">
            Hot: sets released within
            <input type="number" min={0} max={60} value={a.tiers.hot_new_set_months} className={`${inputCls} w-14`}
              onChange={(e) => setA({ ...a, tiers: { ...a.tiers, hot_new_set_months: Number(e.target.value) || 0 } })} /> months
          </label>
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" className="accent-indigo-500" checked={a.tiers.hot_owned}
              onChange={(e) => setA({ ...a, tiers: { ...a.tiers, hot_owned: e.target.checked } })} /> owned is hot</label>
            <label className="flex items-center gap-1"><input type="checkbox" className="accent-indigo-500" checked={a.tiers.hot_watchlist}
              onChange={(e) => setA({ ...a, tiers: { ...a.tiers, hot_watchlist: e.target.checked } })} /> watchlist is hot</label>
          </span>
          <span>Warm rarity tiers: <TierChecks value={a.tiers.warm_rarity_tiers} options={["sir", "gold", "gallery", "ir", "ultra"]}
            onChange={(v) => setA({ ...a, tiers: { ...a.tiers, warm_rarity_tiers: v } })} /></span>
          <span>Warm Pokémon tiers: <TierChecks value={a.tiers.warm_pokemon_tiers} options={["top", "a", "b", "c"]}
            onChange={(v) => setA({ ...a, tiers: { ...a.tiers, warm_pokemon_tiers: v } })} /></span>
          <span>Warm artist tiers: <TierChecks value={a.tiers.warm_artist_tiers} options={["top", "a", "b", "c"]}
            onChange={(v) => setA({ ...a, tiers: { ...a.tiers, warm_artist_tiers: v } })} /></span>
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-100">Jobs</h2>
        <div className="divide-y divide-gray-800">
          {Object.entries(KIND_INFO).map(([k, info]) => {
            const c = a.kinds[k];
            if (!c) return null;
            const def = st.defaults.kinds[k];
            return (
              <div key={k} className="py-3 grid gap-2 md:grid-cols-[16rem_1fr] items-start">
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-100">
                    <input type="checkbox" className="accent-indigo-500" checked={c.enabled} onChange={(e) => setKind(k, { enabled: e.target.checked })} />
                    {info.label}
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">{info.hint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400">
                  {c.cadence_hours && TIERS.map((t) => {
                    const v = c.cadence_hours?.[t] ?? 0;
                    const changed = def?.cadence_hours?.[t] !== v;
                    return (
                      <label key={t} className="flex items-center gap-1" title={`Default ${cadenceText(def?.cadence_hours?.[t] ?? 0)}`}>
                        <span className="capitalize">{t}</span> every
                        <input type="number" min={0} step={1} value={v} className={`${inputCls} w-16 ${changed ? "ring-1 ring-amber-600" : ""}`}
                          onChange={(e) => setKind(k, { cadence_hours: { ...c.cadence_hours, [t]: Number(e.target.value) || 0 } })} />h
                        <span className="text-gray-600">({cadenceText(v)})</span>
                      </label>
                    );
                  })}
                  {c.batch_size != null && (
                    <label className="flex items-center gap-1">batch
                      <input type="number" min={1} max={1000} value={c.batch_size} className={`${inputCls} w-16`}
                        onChange={(e) => setKind(k, { batch_size: Number(e.target.value) || 1 })} /> cards</label>
                  )}
                  {c.delay_ms != null && (
                    <label className="flex items-center gap-1" title="Gap between requests: Fanatics rate-limits bursts">delay
                      <input type="number" min={0} max={60000} step={250} value={c.delay_ms} className={`${inputCls} w-20`}
                        onChange={(e) => setKind(k, { delay_ms: Number(e.target.value) || 0 })} /> ms</label>
                  )}
                  {c.daily_hour_utc != null && (
                    <label className="flex items-center gap-1">daily at
                      <input type="number" min={0} max={23} value={c.daily_hour_utc} className={`${inputCls} w-14`}
                        onChange={(e) => setKind(k, { daily_hour_utc: Number(e.target.value) || 0 })} />:00 UTC</label>
                  )}
                  {k === "sync_owned" && session && (
                    <button onClick={() => run({ kind: "sync_owned" })} className="text-indigo-300 hover:text-indigo-200">Run now</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <ErrorMsg msg={error} />}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={!session || !dirty || busy}
            className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setA(st.defaults)} className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 text-sm hover:text-white">Reset to defaults</button>
          {!session && <span className="text-xs text-amber-300">Sign in with Google to change anything.</span>}
          {msg && <span className="text-xs text-green-400">{msg}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Agents</h2>
            <p className="text-xs text-gray-500 max-w-3xl">
              Claude agent workers on your subscriptions (claude -p on the agent hosts). The server gathers the facts; the agent judges them and
              returns structured findings. Prices and math never move to the agent.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-300" title="primary first: the secondary account only works when the primary is offline, paused on a usage limit or full">
            Accounts
            <select value={a.agents?.mode ?? "primary_first"} onChange={(e) => setA({ ...a, agents: { mode: e.target.value as "primary_first" | "balanced" } })}
              className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200">
              <option value="primary_first">Primary first, then secondary</option>
              <option value="balanced">Balanced (both claim)</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {agents.length === 0 && <span className="text-gray-500">No agent worker has connected yet.</span>}
          {agents.map((w) => {
            const info = w.info as { account?: string; rank?: number; slots?: number; busy?: number; paused_until?: string | null };
            const paused = info.paused_until && new Date(info.paused_until) > new Date();
            return (
              <span key={w.name} className={`px-2 py-1 rounded border ${!w.online ? "border-gray-700 text-gray-500" : paused ? "border-amber-800 text-amber-300" : "border-green-800 text-green-300"}`}
                title={`${w.name} · last seen ${ago(w.last_seen)}`}>
                {info.rank === 1 ? "Primary" : `Secondary (${info.rank})`} · {info.account ?? "?"} ·{" "}
                {!w.online ? "offline" : paused ? `paused until ${new Date(info.paused_until!).toLocaleTimeString()}` : `${info.busy ?? 0}/${info.slots ?? 1} busy`}
              </span>
            );
          })}
        </div>
        <div className="divide-y divide-gray-800">
          {Object.entries(AGENT_INFO).map(([k, info]) => {
            const c = a.kinds[k];
            if (!c) return null;
            return (
              <div key={k} className="py-3 grid gap-2 md:grid-cols-[16rem_1fr] items-start">
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-100">
                    <input type="checkbox" className="accent-indigo-500" checked={c.enabled} onChange={(e) => setKind(k, { enabled: e.target.checked })} />
                    {info.label}
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">{info.hint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400">
                  <span className="inline-flex rounded border border-gray-700 overflow-hidden">
                    {MODELS.map((m) => (
                      <button key={m.id} onClick={() => setKind(k, { model: m.id })}
                        className={`px-2 py-0.5 ${c.model === m.id ? "bg-indigo-700 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>{m.label}</button>
                    ))}
                  </span>
                  <label className="flex items-center gap-1">effort
                    <select value={c.effort ?? "low"} onChange={(e) => setKind(k, { effort: e.target.value as "low" | "medium" | "high" })}
                      className="bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-gray-200">
                      <option>low</option><option>medium</option><option>high</option>
                    </select></label>
                  <label className="flex items-center gap-1">up to
                    <input type="number" min={1} max={200} value={c.max_items ?? 10} className={`${inputCls} w-14`}
                      onChange={(e) => setKind(k, { max_items: Number(e.target.value) || 1 })} /> items</label>
                  <label className="flex items-center gap-1">daily at
                    <input type="number" min={0} max={23} value={c.daily_hour_utc ?? 0} className={`${inputCls} w-14`}
                      onChange={(e) => setKind(k, { daily_hour_utc: Number(e.target.value) || 0 })} />:00 UTC</label>
                  {session && <button onClick={() => run({ kind: k })} className="text-indigo-300 hover:text-indigo-200">Run now</button>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500">Model and agent settings save with the Save button above.</p>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Agent findings</h2>
        {!findings || findings.length === 0 ? (
          <p className="text-xs text-gray-500">No findings yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {findings.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{ago(f.created_at)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{f.kind === "agent_deal_vetting" ? "Vetting" : "Triage"}</td>
                  <td className={`py-1.5 pr-2 font-medium ${VERDICT_CLS[f.verdict] ?? ""}`}>{f.verdict}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {f.display_key ? <Link to={`/cards/${encodeURIComponent(f.display_key)}`} className="text-gray-100 hover:text-indigo-300">{f.card_name}</Link>
                      : <span className="text-gray-400">{f.subject.replace(/^owned:/, "owned: ").split("|").slice(1, 4).join(" ") || f.subject}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-400">
                    {f.summary}
                    {f.details?.fix && <div className="text-amber-200">Fix: {f.details.fix}</div>}
                    {f.details?.issues && f.details.issues.length > 0 && <div className="text-amber-200">{f.details.issues.join(", ").replace(/_/g, " ")}</div>}
                    {f.details?.url && <a href={f.details.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">listing</a>}
                  </td>
                  <td className="py-1.5 text-gray-500 whitespace-nowrap" title={f.account}>{f.model?.replace("claude-", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-100">Recent jobs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1 pr-2 font-medium">#</th>
                <th className="text-left py-1 pr-2 font-medium">Job</th>
                <th className="text-left py-1 pr-2 font-medium">Scope</th>
                <th className="text-left py-1 pr-2 font-medium">Status</th>
                <th className="text-left py-1 pr-2 font-medium">Worker</th>
                <th className="text-right py-1 pr-2 font-medium">Queued</th>
                <th className="text-right py-1 pr-2 font-medium">Took</th>
                <th className="text-left py-1 pr-2 font-medium">Result</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {st.recent.map((j) => {
                const took = j.claimed_at && j.finished_at ? (new Date(j.finished_at).getTime() - new Date(j.claimed_at).getTime()) / 1000 : null;
                const scope = j.scope?.tiers ? Object.entries(j.scope.tiers).map(([t, n]) => `${n} ${t}`).join(", ") : "";
                const res = j.result ? Object.entries(j.result).filter(([, v]) => v !== 0 && v !== "" && v != null).map(([k2, v]) => `${k2.replace(/_/g, " ")} ${v}`).join(" · ") : "";
                return (
                  <tr key={j.id} className="align-top">
                    <td className="py-1.5 pr-2 text-gray-500">{j.id}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{KIND_INFO[j.kind]?.label ?? j.kind}{j.source === "manual" && <span className="text-gray-500"> (manual)</span>}</td>
                    <td className="py-1.5 pr-2 text-gray-400">{scope}</td>
                    <td className={`py-1.5 pr-2 ${STATUS_CLS[j.status]}`}>{j.status}{j.attempts > 1 ? ` (try ${j.attempts})` : ""}</td>
                    <td className="py-1.5 pr-2 text-gray-500">{j.claimed_by ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-400">{ago(j.created_at)}</td>
                    <td className="py-1.5 pr-2 text-right">{took != null ? `${Math.round(took)}s` : "—"}</td>
                    <td className="py-1.5 pr-2 text-gray-400 max-w-md">{j.error ? <span className="text-red-400">{j.error}</span> : res}</td>
                    <td className="py-1.5 text-right">
                      {session && (j.status === "queued" || j.status === "running") && (
                        <button onClick={() => cancelJob(j.id).then(load)} className="text-gray-500 hover:text-red-400">Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {st.recent.length === 0 && <tr><td colSpan={9} className="py-3 text-gray-500">No jobs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {session && audit && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-100">Change history</h2>
          <p className="text-xs text-gray-500">Every change on this page and on Settings: when, what, old → new, who.</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {audit.map((c, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{new Date(c.at).toLocaleString()}</td>
                  <td className="py-1 pr-3 font-mono">{c.key}</td>
                  <td className="py-1 pr-3 font-mono"><span className="text-gray-500">{JSON.stringify(c.old)}</span> → {JSON.stringify(c.new)}</td>
                  <td className="py-1 text-gray-500">{c.actor ?? "—"}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td className="py-2 text-gray-500">No changes yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
