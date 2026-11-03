import { useMemo, useState } from "react";
import { INFRA_EDGES, INFRA_NODES, INFRA_ZONES, type InfraEdge, type InfraKind, type InfraNode } from "../content/infra";

const KIND: Record<InfraKind, { label: string; color: string }> = {
  consumer: { label: "Uses the tracker", color: "#818cf8" },
  edge: { label: "Edge", color: "#f59e0b" },
  serve: { label: "Serving", color: "#38bdf8" },
  data: { label: "Database", color: "#34d399" },
  job: { label: "Jobs", color: "#a78bfa" },
  agent: { label: "Agents", color: "#f472b6" },
  build: { label: "Build & deploy", color: "#9ca3af" },
  source: { label: "Outside source", color: "#fb923c" },
};

const byId = new Map(INFRA_NODES.map((n) => [n.id, n]));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Drawn {
  e: InfraEdge;
  d: string;
  lx: number;
  ly: number;
}

// Vertical neighbours connect top-to-bottom (straight when they overlap,
// a short curve when not); side-by-side ones connect edge to edge.
function route(e: InfraEdge): Drawn {
  if (e.points) {
    const p = e.points;
    const [lx, ly] = e.labelAt ?? p[Math.floor(p.length / 2)];
    return { e, d: "M" + p.map(([x, y]) => `${x},${y}`).join(" L"), lx, ly };
  }
  const a = byId.get(e.from)!, b = byId.get(e.to)!;
  const above = b.y + b.h <= a.y, below = a.y + a.h <= b.y;
  if (above || below) {
    const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w);
    let x1: number, x2: number;
    if (hi - lo >= 8) x1 = x2 = (lo + hi) / 2;
    else {
      x1 = clamp(b.x + b.w / 2, a.x + 16, a.x + a.w - 16);
      x2 = clamp(a.x + a.w / 2, b.x + 16, b.x + b.w - 16);
    }
    const y1 = above ? a.y : a.y + a.h, y2 = above ? b.y + b.h : b.y, my = (y1 + y2) / 2;
    const d = x1 === x2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    return { e, d, lx: (x1 + x2) / 2, ly: my };
  }
  const left = b.x + b.w <= a.x;
  const y = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
  const x1 = left ? a.x : a.x + a.w, x2 = left ? b.x + b.w : b.x;
  return { e, d: `M${x1},${y} L${x2},${y}`, lx: (x1 + x2) / 2, ly: y - 8 };
}

const EDGES = INFRA_EDGES.map(route);

export default function InfraDiagram() {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = hover ?? pinned;

  const linked = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const { from, to } of INFRA_EDGES) {
      if (from === focus) s.add(to);
      if (to === focus) s.add(from);
    }
    return s;
  }, [focus]);

  const node: InfraNode | undefined = focus ? byId.get(focus) : undefined;
  const on = (e: InfraEdge) => !focus || e.from === focus || e.to === focus;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1200 780" className="w-full min-w-[60rem] select-none" role="img"
          aria-label="Infrastructure: outside sources feed jobs on LXC 109, which write Postgres on LXC 106; the API on LXC 109 serves Cloudflare, which the site, admin panel, MCP server, agents and other apps use."
          onClick={() => setPinned(null)}>
          <defs>
            {(["dim", "on"] as const).map((k) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={k === "on" ? "#a5b4fc" : "#6b7280"} />
              </marker>
            ))}
          </defs>

          {INFRA_ZONES.map((z) => (
            <g key={z.label}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10}
                fill={z.outer ? "none" : "#030712"} fillOpacity={z.outer ? 0 : 0.55}
                stroke={z.outer ? "#4b5563" : "#1f2937"} strokeDasharray={z.outer ? "6 4" : undefined} />
            </g>
          ))}

          {EDGES.map(({ e, d }, i) => {
            const lit = focus && on(e);
            return (
              <path key={i} d={d} fill="none" stroke={lit ? "#a5b4fc" : "#4b5563"} strokeWidth={lit ? 2 : 1.25}
                strokeDasharray={e.dashed ? "4 3" : undefined} opacity={on(e) ? 1 : 0.15}
                markerEnd={`url(#arrow-${lit ? "on" : "dim"})`} />
            );
          })}

          {/* Zone titles above the edges, so lines pass behind them. */}
          {INFRA_ZONES.map((z) => (
            <g key={z.label} pointerEvents="none">
              <rect x={z.x + 6} y={z.y + 4} width={z.label.length * 6.6 + 12} height={14} fill={z.outer ? "#111827" : "#0a0f1b"} />
              <text x={z.x + 12} y={z.y + 14} fontSize={10} fontWeight={600} fill="#6b7280" letterSpacing="0.04em">
                {z.label.toUpperCase()}
              </text>
            </g>
          ))}

          {INFRA_NODES.map((n) => {
            const k = KIND[n.kind];
            const dim = linked && !linked.has(n.id);
            const sel = focus === n.id;
            return (
              <g key={n.id} opacity={dim ? 0.3 : 1} className="cursor-pointer"
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                onClick={(ev) => { ev.stopPropagation(); setPinned(pinned === n.id ? null : n.id); }}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="#111827"
                  stroke={sel ? k.color : "#374151"} strokeWidth={sel ? 2 : 1} />
                <rect x={n.x} y={n.y + 6} width={3} height={n.h - 12} rx={1.5} fill={k.color} />
                <text x={n.x + 12} y={n.y + 19} fontSize={12} fontWeight={600} fill="#f3f4f6">{n.label}</text>
                {n.sub?.map((s, j) => (
                  <text key={j} x={n.x + 12} y={n.y + 34 + j * 13} fontSize={10} fill="#9ca3af">{s}</text>
                ))}
              </g>
            );
          })}

          {EDGES.filter((x) => x.e.label).map(({ e, lx, ly }, i) => {
            const w = e.label!.length * 5.6 + 10;
            return (
              <g key={i} opacity={on(e) ? 1 : 0.15} pointerEvents="none">
                <rect x={lx - w / 2} y={ly - 8} width={w} height={15} rx={3} fill="#0b1220" stroke="#1f2937" />
                <text x={lx} y={ly + 3} fontSize={9.5} fill="#cbd5e1" textAnchor="middle">{e.label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
        {(Object.keys(KIND) as InfraKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: KIND[k].color }} /> {KIND[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t border-dashed border-gray-500" /> occasional</span>
      </div>

      <div className="rounded border border-gray-800 bg-gray-950/60 px-3 py-2 min-h-[3.25rem]">
        {node ? (
          <>
            <div className="text-sm text-gray-100">{node.label} <span className="text-[11px] text-gray-500">· {KIND[node.kind].label}</span></div>
            <div className="text-xs text-gray-400 mt-0.5">{node.detail}</div>
          </>
        ) : (
          <div className="text-xs text-gray-500 py-1.5">Hover or tap a box to see what it does and light up what it talks to. Arrows point from caller to callee; data comes back the other way.</div>
        )}
      </div>
    </div>
  );
}
