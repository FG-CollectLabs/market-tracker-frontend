import { useState, type ReactNode } from "react";

// A help box that opens on hover or keyboard focus (and on tap), for
// explaining what a control or number means and how it's worked out.
export default function HelpTip({ children, help, width = "w-96" }: { children: ReactNode; help: ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <span role="tooltip"
          className={`absolute z-40 left-0 top-full mt-1.5 ${width} max-w-[90vw] rounded-lg border border-gray-700 bg-gray-950 p-3 text-left text-xs font-normal leading-relaxed text-gray-300 shadow-2xl`}>
          {help}
        </span>
      )}
    </span>
  );
}

// A small "?" that shows help on hover, for headers and labels.
export function HelpDot({ help, width }: { help: ReactNode; width?: string }) {
  return (
    <HelpTip help={help} width={width}>
      <span tabIndex={0} className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-600 text-[10px] text-gray-400 hover:text-gray-100">?</span>
    </HelpTip>
  );
}
