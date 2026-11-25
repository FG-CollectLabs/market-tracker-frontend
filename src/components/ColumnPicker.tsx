import { useEffect, useRef, useState } from "react";
import type { Columns } from "../lib/useColumns";

// "Columns" menu for a table: tick to show or hide, drag (or ↑ ↓) to reorder.
// Saved per table in this browser; Reset goes back to the table's defaults.
export default function ColumnPicker({ cols }: { cols: Columns }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const meta = new Map(cols.all.map((c) => [c.id, c]));
  const btn = "px-1 rounded text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-500";
  return (
    <div ref={ref} className="relative inline-block print:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title="Choose which columns show and their order (saved in this browser)"
        className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 hover:border-gray-500">
        Columns {cols.visible.length}/{cols.order.length} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1 text-xs">
          <div className="px-3 py-1.5 text-gray-500">Tick to show · drag or ↑↓ to reorder</div>
          {cols.order.map((id, i) => {
            const c = meta.get(id);
            if (!c) return null;
            return (
              <div key={id} draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (drag && drag !== id) cols.moveTo(drag, i); setDrag(null); }}
                className={`flex items-center gap-2 px-3 py-1 cursor-grab ${drag === id ? "opacity-40" : "hover:bg-gray-800"}`}>
                <span className="text-gray-600 select-none" aria-hidden>⠿</span>
                <label className="flex-1 flex items-center gap-2 min-w-0" title={c.title}>
                  <input type="checkbox" checked={!cols.hidden.has(id)} disabled={c.locked} onChange={() => cols.toggle(id)} />
                  <span className={`truncate ${cols.hidden.has(id) ? "text-gray-500" : "text-gray-200"}`}>{c.label}</span>
                </label>
                <button type="button" className={btn} disabled={i === 0} onClick={() => cols.moveTo(id, i - 1)} aria-label={`Move ${c.label} up`}>↑</button>
                <button type="button" className={btn} disabled={i === cols.order.length - 1} onClick={() => cols.moveTo(id, i + 1)} aria-label={`Move ${c.label} down`}>↓</button>
              </div>
            );
          })}
          <div className="border-t border-gray-800 mt-1 px-3 pt-1.5 pb-1 flex justify-between">
            <button type="button" onClick={cols.reset} disabled={!cols.customized} className="text-indigo-300 hover:text-indigo-200 disabled:text-gray-600">Reset to default</button>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// A table box whose header row stays put while its rows scroll: the box
// scrolls both ways (capped at the window height), so the header sticks at
// any screen width and stays lined up with the columns when scrolled sideways.
export const FROZEN_BOX = "overflow-auto max-h-[calc(100dvh-4rem)] rounded-lg border border-gray-800 bg-gray-900 print:max-h-none print:overflow-visible";
export const FROZEN_HEAD = "!top-0 z-20";
