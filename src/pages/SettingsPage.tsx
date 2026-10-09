import { useEffect, useState, type ReactNode } from "react";
import { fetchSettings, saveSettings, type AnalysisSettings, type Grader, type ServiceTier } from "../lib/api";
import { useSession } from "../lib/auth";
import { Spinner, ErrorMsg } from "../components/Spinner";

const inputCls = "bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 font-mono text-right";

// Dollar, percent and day inputs over the API's cents / fractions.
function Money({ cents, onChange, w = "w-20" }: { cents: number; onChange: (c: number) => void; w?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-gray-500">
      $<input type="number" min={0} step={0.01} value={+(cents / 100).toFixed(2)} className={`${inputCls} ${w}`}
        onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))} />
    </span>
  );
}

function Pct({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-gray-500">
      <input type="number" step={step} value={+(value * 100).toFixed(2)} className={`${inputCls} w-20`}
        onChange={(e) => onChange((Number(e.target.value) || 0) / 100)} />%
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        <div className="text-xs text-gray-500 max-w-md">{hint}</div>
      </div>
      <div className="shrink-0 text-sm">{children}</div>
    </div>
  );
}

function GraderCard({ id, g, onChange }: { id: string; g: Grader; onChange: (g: Grader) => void }) {
  const setTier = (i: number, t: Partial<ServiceTier>) => onChange({ ...g, tiers: g.tiers.map((x, j) => (j === i ? { ...x, ...t } : x)) });
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-100">{g.name || id.toUpperCase()}</h2>
        <label className="flex items-center gap-2 text-xs text-gray-400" title="Shipping there and back, insurance and supplies, per card">
          Shipping & logistics per card <Money cents={g.ship_cents} onChange={(c) => onChange({ ...g, ship_cents: c })} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 pr-3 font-medium">Service tier</th>
              <th className="text-right py-1 pr-3 font-medium">Fee per card</th>
              <th className="text-right py-1 pr-3 font-medium" title="Most a card can be worth for this tier; 0 = no cap">Max value</th>
              <th className="text-right py-1 pr-3 font-medium" title="Calendar days, door to door">Turnaround</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {g.tiers.map((t, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-3">
                  <input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })}
                    className="bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 w-32" />
                </td>
                <td className="py-1.5 pr-3 text-right"><Money cents={t.fee_cents} onChange={(c) => setTier(i, { fee_cents: c })} /></td>
                <td className="py-1.5 pr-3 text-right"><Money cents={t.max_value_cents} onChange={(c) => setTier(i, { max_value_cents: c })} w="w-24" /></td>
                <td className="py-1.5 pr-3 text-right">
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <input type="number" min={0} max={730} value={t.turnaround_days} className={`${inputCls} w-16`}
                      onChange={(e) => setTier(i, { turnaround_days: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                    days
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <button onClick={() => onChange({ ...g, tiers: g.tiers.filter((_, j) => j !== i) })} disabled={g.tiers.length <= 1}
                    className="text-gray-500 hover:text-red-400 disabled:opacity-30" title="Remove tier">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange({ ...g, tiers: [...g.tiers, { name: "New tier", fee_cents: 0, max_value_cents: 0, turnaround_days: 30 }] })}
        className="text-xs text-indigo-300 hover:text-indigo-200">+ Add tier</button>
      <p className="text-[11px] text-gray-500">
        Each card is priced at the cheapest tier whose max value covers its graded price.
      </p>
    </section>
  );
}

// Site-wide numbers behind the buying guide and Deals: grading fees per
// grader and tier, shipping, turnaround, the cost of sourcing and holding
// cards, resale fees and the decision thresholds.
export default function SettingsPage() {
  const session = useSession();
  const [s, setS] = useState<AnalysisSettings | null>(null);
  const [defaults, setDefaults] = useState<AnalysisSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((r) => {
        setS(r.settings);
        setDefaults(r.defaults);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const set = (patch: Partial<AnalysisSettings>) => {
    setSaved(null);
    setS((cur) => (cur ? { ...cur, ...patch } : cur));
  };

  const save = () => {
    if (!s) return;
    setSaving(true);
    setError(null);
    saveSettings(s)
      .then((r) => {
        setS(r.settings);
        setSaved("Saved. The buying guide and Deals use these now.");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  if (!s) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-500">
          The costs and thresholds behind the buying guide, Deals and the agent's analysis.
          {s.updated_at && <> Last saved {new Date(s.updated_at).toLocaleString()}{s.updated_by ? ` by ${s.updated_by}` : ""}.</>}
        </p>
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Grading</h2>
      {Object.entries(s.graders).sort(([a], [b]) => (a === "psa" ? -1 : b === "psa" ? 1 : a.localeCompare(b))).map(([id, g]) => (
        <GraderCard key={id} id={id} g={g} onChange={(ng) => set({ graders: { ...s.graders, [id]: ng } })} />
      ))}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sourcing and time</h2>
      <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
        <Field label="Sourcing premium" hint="Paid over raw market price to get a clean, gradable copy: screening, rejects, buying from people who already picked out the best ones.">
          <Pct value={s.sourcing_pct} onChange={(v) => set({ sourcing_pct: v })} />
        </Field>
        <Field label="Cost of capital" hint="Yearly return the money could earn elsewhere. Charged for the turnaround days a card spends at the grader.">
          <Pct value={s.capital_rate} onChange={(v) => set({ capital_rate: v })} />
          <span className="text-gray-500"> / yr</span>
        </Field>
        <Field label="Price slabs for when they come back" hint="Adjust the 10's price by how cards usually move over the turnaround, based on the release curves (e.g. a 3-month-old set usually keeps falling).">
          <input type="checkbox" checked={s.use_timing} onChange={(e) => set({ use_timing: e.target.checked })} className="accent-indigo-500" />
        </Field>
      </section>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selling</h2>
      <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
        <Field label="Selling fee on slabs you graded" hint="Where you'd sell your own grades: Fanatics cash ~6%, FanCash 0%, eBay ~13.25%.">
          <Pct value={s.sell_fee_pct} onChange={(v) => set({ sell_fee_pct: v })} step={0.25} />
        </Field>
        <Field label="Resale fee on flips" hint="Selling a slab you bought, in the max bid and flip margin.">
          <Pct value={s.exit_fee_pct} onChange={(v) => set({ exit_fee_pct: v })} step={0.25} />
        </Field>
        <Field label="Fanatics buyer's premium" hint="Added to every auction hammer price.">
          <Pct value={s.premium_pct} onChange={(v) => set({ premium_pct: v })} />
        </Field>
      </section>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Buying rules</h2>
      <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
        <Field label="Target margin on flips" hint="Profit wanted after the resale fee; sets the max bid.">
          <Pct value={s.target_margin} onChange={(v) => set({ target_margin: v })} step={5} />
        </Field>
        <Field label="Buy raw to grade at" hint="Grading EV after every cost at or above this…">
          <Pct value={s.min_roi} onChange={(v) => set({ min_roi: v })} step={5} />
        </Field>
        <Field label="…and at least" hint="Expected profit per copy.">
          <Money cents={s.min_profit_cents} onChange={(c) => set({ min_profit_cents: c })} />
        </Field>
        <Field label="Buy the 10 instead at" hint="Grading EV at or below this (or a 10 cheaper than making one) says buy the slab.">
          <Pct value={s.buy_ten_below_ev} onChange={(v) => set({ buy_ten_below_ev: v })} step={5} />
        </Field>
      </section>

      {error && <ErrorMsg msg={error} />}
      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-gray-950/95 py-3 border-t border-gray-800">
        <button onClick={save} disabled={saving || !session}
          className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        {defaults && (
          <button onClick={() => set({ ...defaults, updated_at: s.updated_at, updated_by: s.updated_by })}
            className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 text-sm hover:text-white">
            Reset to defaults
          </button>
        )}
        {!session && <span className="text-xs text-amber-300">Sign in with Google to save.</span>}
        {saved && <span className="text-xs text-green-400">{saved}</span>}
      </div>
    </div>
  );
}
