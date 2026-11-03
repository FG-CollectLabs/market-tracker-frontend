import { useEffect, useState } from "react";
import { AUTH, CONSUMED, MCP_TOOLS, PUBLISHED, type AuthKind, type Endpoint, type PublishedApi } from "../content/apis";

const BASE = import.meta.env.VITE_API_URL ?? "";

const METHOD: Record<Endpoint["method"], string> = {
  GET: "text-green-300",
  POST: "text-sky-300",
  PUT: "text-amber-300",
  PATCH: "text-amber-300",
  DELETE: "text-red-300",
};

function AuthBadge({ a }: { a: AuthKind }) {
  return (
    <span title={AUTH[a].detail} className={`shrink-0 px-1.5 py-0.5 rounded border text-[11px] font-medium ${AUTH[a].cls}`}>
      {AUTH[a].label}
    </span>
  );
}

// The spec's own version, read live so the page never claims a stale one.
function SpecVersion({ path }: { path: string }) {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${BASE}${path}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => live && setV(s?.info?.version ?? null))
      .catch(() => {});
    return () => { live = false; };
  }, [path]);
  return v ? <span className="px-1.5 py-0.5 rounded border border-gray-700 text-[11px] text-gray-300 tabular-nums">v{v}</span> : null;
}

function ApiCard({ api, filter }: { api: PublishedApi; filter: string }) {
  const [swagger, setSwagger] = useState(false);
  const f = filter.trim().toLowerCase();
  const groups = api.groups
    .map((gr) => ({ ...gr, endpoints: gr.endpoints.filter((e) => !f || `${e.method} ${e.path} ${e.note ?? ""}`.toLowerCase().includes(f)) }))
    .filter((gr) => gr.endpoints.length);
  const count = api.groups.reduce((n, gr) => n + gr.endpoints.length, 0);
  if (f && !groups.length) return null;

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-100">{api.name}</h2>
        <AuthBadge a={api.auth} />
        {api.spec && <SpecVersion path={api.spec.json} />}
        <span className="text-[11px] text-gray-500">{count} endpoints</span>
        {api.authNote && <code className="text-[11px] text-gray-500">{api.authNote}</code>}
      </div>
      <p className="text-xs text-gray-400">{api.summary}</p>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="text-gray-500">Used by</span>
        {api.consumers.map((c) => (
          <span key={c} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{c}</span>
        ))}
      </div>

      {api.spec && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-xs">
            <button onClick={() => setSwagger(!swagger)} className="px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/50 text-indigo-200 hover:bg-indigo-900/60">
              {swagger ? "Hide Swagger UI" : "Show Swagger UI"}
            </button>
            <a href={`${BASE}${api.spec.docs}`} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 self-center">Open in a new tab</a>
            <a href={`${BASE}${api.spec.json}`} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 self-center">openapi.json</a>
          </div>
          {swagger && (
            <iframe title={`${api.name} Swagger UI`} src={`${BASE}${api.spec.docs}`}
              className="w-full h-[42rem] rounded border border-gray-700 bg-white" />
          )}
        </div>
      )}

      <div className="space-y-1">
        {groups.map((gr) => (
          <details key={gr.title} open={!!f} className="group rounded border border-gray-800 bg-gray-950/40">
            <summary className="cursor-pointer px-2.5 py-1.5 text-xs text-gray-300 flex items-center gap-2">
              <span className="text-gray-600 group-open:rotate-90 transition-transform">▸</span>
              {gr.title} <span className="text-gray-600">{gr.endpoints.length}</span>
            </summary>
            <ul className="px-2.5 pb-2 space-y-0.5">
              {gr.endpoints.map((e) => (
                <li key={e.method + e.path} className="grid grid-cols-[3.75rem_1fr] gap-2 text-xs">
                  <span className={`font-mono font-semibold ${METHOD[e.method]}`}>{e.method}</span>
                  <span className="min-w-0">
                    <code className="text-gray-200 break-all">{e.path}</code>
                    {e.note && <span className="text-gray-500"> · {e.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PublishedApis() {
  const [filter, setFilter] = useState("");
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          Everything the tracker serves at <code className="text-gray-300">market.futuregadgetlabs.com</code>, grouped by who may call it.
          The Pricing API has a full OpenAPI spec; the rest are listed from the routes in the backend.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
          {(Object.keys(AUTH) as AuthKind[]).map((a) => (
            <span key={a} className="flex items-center gap-1.5"><AuthBadge a={a} /> {AUTH[a].detail}</span>
          ))}
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter endpoints (e.g. watchlist, POST, history)"
          className="w-full sm:w-80 rounded border border-gray-700 bg-gray-950 px-2.5 py-1 text-sm text-gray-200 placeholder:text-gray-600" />
      </div>

      {PUBLISHED.map((api) => <ApiCard key={api.id} api={api} filter={filter} />)}

      {!filter && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">MCP server</h2>
            <AuthBadge a="admin" />
            <span className="text-[11px] text-gray-500">cmd/mcp · stdio, runs next to Claude</span>
          </div>
          <p className="text-xs text-gray-400">Tools Claude can call. Each one calls the admin or public API above.</p>
          <dl className="divide-y divide-gray-800">
            {MCP_TOOLS.map((t) => (
              <div key={t.group} className="py-1.5 grid gap-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-xs text-gray-300">{t.group}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {t.tools.map((n) => <code key={n} className="px-1.5 py-0.5 rounded bg-gray-800 text-[11px] text-gray-200">{n}</code>)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

export function ConsumedApis() {
  return (
    <div className="space-y-4 max-w-6xl">
      <p className="text-sm text-gray-400">
        Every outside service the backend calls, what it gets from it and which job does the calling. Credentials are named by
        their environment variable only; they live in the env files on LXC 109.
      </p>
      {CONSUMED.map((grp) => (
        <section key={grp.title} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-100 mb-2">{grp.title}</h2>
          <ul className="divide-y divide-gray-800">
            {grp.apis.map((a) => (
              <li key={a.name} className="py-2 grid gap-1 md:grid-cols-[13rem_1fr]">
                <div className="min-w-0">
                  <div className="text-sm text-gray-200">{a.name}</div>
                  <code className="text-[11px] text-gray-500 break-all">{a.host}</code>
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-xs text-gray-400">{a.what}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-gray-500">via <span className="text-gray-300">{a.via}</span></span>
                    {a.auth && <span className="text-gray-500">auth <code className="text-gray-300 break-all">{a.auth}</code></span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
