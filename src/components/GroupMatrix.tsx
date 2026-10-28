import { Link } from "react-router-dom";
import type { ReleaseCurves, WindowRow } from "../lib/api";
import { groupPath } from "../lib/groups";

// A grid of buy-window rows: one cell per group (row x column), showing
// what that group's cards have returned past the hype and when they
// bottomed after release. Used by the Pull difficulty and Gem rate tabs.

export const pct = (v: number) => {
  const r = Math.round(v * 100);
  return `${r > 0 ? "+" : ""}${r === 0 ? 0 : r}%`;
};

export function findRow(data: ReleaseCurves, cat: string, grade: string, lang: string): WindowRow | undefined {
  return data.table.find((r) => r.category === cat && r.grade === grade && r.lang === lang);
}

// Too few cards to say anything: fewer than this behind the trailing figure.
const THIN = 15;

export function MatrixCell({ row, cat, grade, lang, benchmark }: { row?: WindowRow; cat: string; grade: string; lang: string; benchmark: number }) {
  if (!row) return <td className="py-2 px-2 text-center text-gray-600">—</td>;
  const t = row.trailing;
  const thin = !t || t.cards < THIN;
  const beat = t && t.net_median_2y > benchmark;
  return (
    <td className={`py-2 px-2 align-top ${thin ? "opacity-60" : ""}`}>
      <Link to={groupPath(cat, grade, lang)} className="block hover:bg-gray-800/60 rounded px-1 -mx-1"
        title={`${row.cards} cards. Trailing: median yearly change of cards past month 12 over their last ~12 months` +
          (t ? ` (${t.cards} cards, middle half ${pct(t.p25)} to ${pct(t.p75)}, ${Math.round(t.beat_share * 100)}% beat the S&P after fees, ${Math.round(t.down_share * 100)}% lost value)` : "") +
          `. Bottom: where the group's release curve is lowest; buy window = months within 3% of it.${row.provisional ? " Provisional: fewer than 8 sets behind some months." : ""}`}>
        <div className={`text-sm font-semibold tabular-nums ${!t ? "text-gray-500" : beat ? "text-green-400" : t.median < 0 ? "text-red-400" : "text-gray-200"}`}>
          {t ? `${pct(t.median)}/yr` : "no trailing"}
        </div>
        <div className="text-[11px] text-gray-400 tabular-nums">
          low M{row.bottom_month} {pct(row.bottom_change)}
          <span className="text-gray-500"> · buy M{row.window_from}–{row.window_to}</span>
        </div>
        <div className="text-[10px] text-gray-500">
          {t ? `${t.cards} held` : ""}{t ? " · " : ""}{row.cards} cards{row.provisional ? " · provisional" : ""}{thin && t ? " · thin" : ""}
        </div>
      </Link>
    </td>
  );
}

export function MatrixTable({ data, rows, cols, cat, grade, lang, corner }: {
  data: ReleaseCurves;
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cat: (row: string, col: string) => string;
  grade: string;
  lang: string;
  corner?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1 pr-3 font-medium">{corner}</th>
            {cols.map((c) => <th key={c.key} className="text-left py-1 px-2 font-medium min-w-32">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 pr-3 text-gray-300 whitespace-nowrap align-top">{r.label}</td>
              {cols.map((c) => {
                const k = cat(r.key, c.key);
                return <MatrixCell key={c.key} row={findRow(data, k, grade, lang)} cat={k} grade={grade} lang={lang} benchmark={data.benchmark} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded border border-gray-700 overflow-hidden">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 ${value === o.key ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function CellLegend({ benchmark }: { benchmark: number }) {
  return (
    <p className="text-[11px] text-gray-500 max-w-3xl">
      Each cell: the group's <b className="text-gray-400">trailing yearly change</b> (median card past month 12, its last ~12 months;{" "}
      <span className="text-green-400">green</span> = beats the S&P's {pct(benchmark)}/yr after fees held two years), then its{" "}
      <b className="text-gray-400">release low</b> (month and drop vs launch) and buy window. Faded = fewer than {THIN} cards behind the trailing
      figure. Click a cell for its cards.
    </p>
  );
}
