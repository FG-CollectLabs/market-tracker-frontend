import { useEffect, useMemo, useState } from "react";
import { fetchForecastSkill, type FcScore, type ForecastSkill } from "../lib/api";
import { Spinner } from "../components/Spinner";

// Forecast skill: how each price-forecasting method would have done on past
// cards (curves built without the card's own set), by grade, horizon, the
// card's age at the forecast and its tier or gem band. The blend weights the
// methods by their error, fitted on half the sets and scored on the other.

const GRADES = ["psa-10", "raw", "psa-9", "cgc-10"];
const GROUPS = ["all", "sir", "ir", "ultra", "gold", "gallery", "promo", "gem:high", "gem:mid", "gem:low"];
const HORIZONS = [3, 6, 12, 24];
const AGES = ["all", "0-2", "3-5", "6-11", "12-23", "24+"];
const LABEL: Record<string, string> = { flat: "Flat", curve: "Curve", curve_declines: "Curve, declines only", trend: "Own trend", curve_trend: "Curve + trend", blend: "Blend" };
const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
const skillCls = (v: number | null) => v == null ? "text-gray-500" : v >= 0.15 ? "text-emerald-300" : v > 0 ? "text-emerald-500" : v > -0.1 ? "text-amber-300" : "text-rose-300";

export default function ForecastSkillPage() {
  const [grade, setGrade] = useState("psa-10");
  const [group, setGroup] = useState("all");
  const [horizon, setHorizon] = useState(6);
  const [d, setD] = useState<ForecastSkill | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setD(null); fetchForecastSkill({ grade, group, horizon }).then(setD).catch((e) => setErr(String(e))); }, [grade, group, horizon]);
  const rows = useMemo(() => [...(d?.rows ?? [])].sort((a, b) => AGES.indexOf(a.age_months) - AGES.indexOf(b.age_months)), [d]);
  const members = ["blend", ...(d?.members.filter((m) => m.name !== "blend").map((m) => m.name) ?? [])];
  const sel = "rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-200";
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Forecast skill</h1>
        <p className="max-w-4xl text-xs text-gray-400">
          How each way of forecasting a card&apos;s price would have done on past cards, each forecast made without the card&apos;s own set.
          Skill is the cut in median error against assuming the price stays flat: above 0 beats doing nothing. Bias + means it forecast too high.
          The blend is what the price model will use once it beats every single method.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className={sel}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={sel}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
        <span className="text-gray-500">over</span>
        {HORIZONS.map((h) => (
          <button key={h} onClick={() => setHorizon(h)} className={`rounded border px-2 py-0.5 ${h === horizon ? "border-indigo-600 bg-indigo-950 text-indigo-200" : "border-gray-700 text-gray-400"}`}>{h} mo</button>
        ))}
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!d && !err && <Spinner />}
      {d && (rows.length === 0 ? <p className="text-xs text-gray-500">Too few cases for this grade, group and horizon.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr>
              <th className="py-1 pr-3 font-medium">Age at forecast</th>
              <th className="py-1 pr-3 text-right font-medium" title="what prices actually did over the horizon (median)">Actual</th>
              {members.map((m) => <th key={m} className="py-1 pr-3 text-right font-medium" title={d.members.find((x) => x.name === m)?.about}>{LABEL[m] ?? m}</th>)}
              <th className="py-1 font-medium">Blend weights</th>
            </tr></thead>
            <tbody>{rows.map((r) => {
              const by: Record<string, FcScore> = Object.fromEntries(r.scores.map((s) => [s.member, s]));
              const best = r.scores[0]?.member;
              return (
                <tr key={r.age_months} className="border-t border-gray-800 align-top">
                  <td className="py-1.5 pr-3 text-gray-200">{r.age_months === "all" ? "any age" : `month ${r.age_months}`}
                    <div className="text-[10px] text-gray-500">{r.cases.toLocaleString()} cases · {r.cards} cards · {r.sets} sets</div></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">{pct(r.actual_median_pct)}</td>
                  {members.map((m) => {
                    const s = by[m];
                    if (!s) return <td key={m} className="py-1.5 pr-3 text-right text-gray-600">–</td>;
                    return (
                      <td key={m} className={`py-1.5 pr-3 text-right tabular-nums ${m === best ? "font-semibold" : ""}`}
                        title={`median error ${(s.median_abs_error_pct * 100).toFixed(0)}%, bias ${pct(s.bias_pct)}${s.direction_right != null ? `, direction right ${(s.direction_right * 100).toFixed(0)}% of moves over 5%` : ""} (${s.n} cases)`}>
                        <span className={skillCls(s.skill_vs_flat)}>{m === "flat" ? `±${(s.median_abs_error_pct * 100).toFixed(0)}%` : s.skill_vs_flat != null ? pct(s.skill_vs_flat) : "–"}</span>
                        <div className={`text-[10px] ${Math.abs(s.bias_pct) >= 0.05 ? "text-amber-400" : "text-gray-500"}`}>bias {pct(s.bias_pct)}</div>
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-[10px] text-gray-400">{r.blend_weights?.map((w) => `${LABEL[w.member] ?? w.member} ${(w.weight * 100).toFixed(0)}%`).join(" · ")}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ))}
      {d && (
        <div className="space-y-1 text-[11px] text-gray-500">
          <p>Flat column: its median error. Other columns: skill vs flat (green beats it), with bias below. Hover a cell for the details.</p>
          <ul className="list-disc pl-5">{d.members.map((m) => <li key={m.name}><span className="text-gray-300">{LABEL[m.name] ?? m.name}</span>: {m.about}</li>)}</ul>
          <p className="max-w-4xl">{d.method}</p>
        </div>
      )}
    </div>
  );
}
