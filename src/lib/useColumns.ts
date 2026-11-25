import { useCallback, useEffect, useMemo, useState } from "react";

// Per-table column choice: which columns show and in what order, saved in
// this browser (localStorage "cols.<key>"). Columns added to a table later
// slot in after their neighbour in the default order: shown if they're in
// the defaults, hidden otherwise.

export interface ColMeta { id: string; label: string; title?: string; locked?: boolean } // locked: can't be hidden
interface Saved { order: string[]; hidden: string[] }

const load = (k: string): Saved | null => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "null");
    return v && Array.isArray(v.order) && Array.isArray(v.hidden) ? v : null;
  } catch {
    return null;
  }
};

// The column order and hidden set from what was saved (null: the defaults).
// Columns the save doesn't know (added since) go after their nearest earlier
// default that is present, or first if none is; non-default ones go last.
export function resolveColumns(saved: Saved | null, ids: string[], defs: string[], locked: Set<string>) {
  let order: string[];
  if (!saved) {
    order = [...defs, ...ids.filter((i) => !defs.includes(i))];
  } else {
    order = saved.order.filter((i) => ids.includes(i));
    for (const id of [...defs, ...ids]) {
      if (order.includes(id)) continue;
      const di = defs.indexOf(id);
      if (di < 0) { order.push(id); continue; }
      const prev = defs.slice(0, di).reverse().find((p) => order.includes(p));
      order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
    }
  }
  const hidden = saved
    ? new Set([...saved.hidden.filter((i) => ids.includes(i)), ...ids.filter((i) => !saved.order.includes(i) && !defs.includes(i))])
    : new Set(ids.filter((i) => !defs.includes(i)));
  locked.forEach((l) => hidden.delete(l));
  return { order, hidden };
}

export interface Columns {
  visible: string[];           // shown, in order
  order: string[];             // every column, in order
  hidden: Set<string>;
  all: ColMeta[];
  customized: boolean;
  toggle: (id: string) => void;
  moveTo: (id: string, index: number) => void;
  reset: () => void;
}

export function useColumns(key: string, all: ColMeta[], defaults: string[]): Columns {
  const storeKey = `cols.${key}`;
  const [saved, setSaved] = useState<Saved | null>(() => load(storeKey));
  useEffect(() => setSaved(load(storeKey)), [storeKey]);

  const ids = useMemo(() => all.map((c) => c.id), [all]);
  const locked = useMemo(() => new Set(all.filter((c) => c.locked).map((c) => c.id)), [all]);
  const defs = useMemo(() => defaults.filter((d) => ids.includes(d)), [defaults, ids]);

  const { order, hidden } = useMemo(() => resolveColumns(saved, ids, defs, locked), [saved, ids, defs, locked]);

  const save = useCallback((s: Saved | null) => {
    setSaved(s);
    try {
      if (s) localStorage.setItem(storeKey, JSON.stringify(s));
      else localStorage.removeItem(storeKey);
    } catch { /* private window: this session only */ }
  }, [storeKey]);

  const toggle = (id: string) => {
    if (locked.has(id)) return;
    const h = new Set(hidden);
    if (h.has(id)) h.delete(id); else h.add(id);
    save({ order, hidden: [...h] });
  };
  const moveTo = (id: string, index: number) => {
    const o = order.filter((i) => i !== id);
    o.splice(Math.max(0, Math.min(index, o.length)), 0, id);
    save({ order: o, hidden: [...hidden] });
  };

  return {
    visible: order.filter((i) => !hidden.has(i)),
    order, hidden, all,
    customized: saved != null,
    toggle, moveTo,
    reset: () => save(null),
  };
}
