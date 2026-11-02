import { useState } from "react";

// A section that folds away, remembering the choice per key.
export default function Collapsible({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const key = `collapse:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <div>
      <button onClick={toggle} className="text-xs text-gray-400 hover:text-gray-200 mb-1">
        {open ? "▾" : "▸"} {title}
      </button>
      {open && children}
    </div>
  );
}
