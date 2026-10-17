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
        <Field label="A CGC 9 is worth at least" hint="What a grading miss (a CGC 9) is worth when it has no market price, e.g. the lowest Fanatics auction. The cost to make a 10 counts every miss as a 9.">
          <Money cents={s.miss_floor_cgc_cents} onChange={(c) => set({ miss_floor_cgc_cents: c })} />
        </Field>
        <Field label="A PSA 9 is worth at least" hint="Same for PSA: what a PSA 9 is worth when it has no market price.">
          <Money cents={s.miss_floor_psa_cents} onChange={(c) => set({ miss_floor_psa_cents: c })} />
        </Field>
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

      {s.auto_prep && (() => {
        const a = s.auto_prep;
        const ap = (patch: Partial<typeof a>) => set({ auto_prep: { ...a, ...patch } });
        const num = (v: number, on: (n: number) => void, step = 0.1) => (
          <input type="number" step={step} value={v} className={`${inputCls} w-20`} onChange={(e) => on(Number(e.target.value) || 0)} />
        );
        return (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Auto-prep (Buying prep rules)</h2>
            <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
              <Field label="Weekly: pressure at least" hint="Add an auction when this many times its usual weekly sales (all channels) are up this week.">
                {num(a.pressure_min, (v) => ap({ pressure_min: v }))}<span className="text-gray-500">×</span>
              </Field>
              <Field label="Weekly: edge at least" hint="Confidence-weighted edge (what Deals sorts by).">
                <Pct value={a.edge_min} onChange={(v) => ap({ edge_min: v })} />
              </Field>
              <Field label="Weekly: auctions under BIN / eBay by" hint="Its own auction closes at least this far under its eBay or Fanatics Buy Now sold median.">
                <Pct value={a.auction_discount_min} onChange={(v) => ap({ auction_discount_min: v })} />
              </Field>
              <Field label="Only cards in their buy window" hint="Weekly: the grade's window (PSA 10 / CGC 10). Min-bid and lowball: the raw window (post hype).">
                <input type="checkbox" checked={a.require_window} onChange={(e) => ap({ require_window: e.target.checked })} className="accent-indigo-500" />
              </Field>
              <Field label="Near mint from grade" hint="Lowest grade the min-bid and lowball lists take (up to PSA 8 / CGC 8.5).">
                {num(a.nm_min_grade, (v) => ap({ nm_min_grade: v }), 0.5)}
              </Field>
              <Field label="Low grades: raw price from / to" hint="Near-mint low-grade slabs of cards whose raw price is in this range.">
                <Money cents={a.low_raw_min_cents} onChange={(c) => ap({ low_raw_min_cents: c })} /> – <Money cents={a.low_raw_max_cents} onChange={(c) => ap({ low_raw_max_cents: c })} />
              </Field>
              <Field label="Low grades: pay at most" hint="All-in (with buyer's premium), as a share of the raw price.">
                <Pct value={a.low_pct} onChange={(v) => ap({ low_pct: v })} /><span className="text-gray-500"> of raw</span>
              </Field>
              <Field label="Bid early when the max is at most" hint="Cheap auctions where $1 decides it go on the early list (bid now); the rest are bid late.">
                <Money cents={a.early_max_cents} onChange={(c) => ap({ early_max_cents: c })} />
              </Field>
              <Field label="…or the current bid is within" hint="Also bid early when the current bid is already this close to your max.">
                <Money cents={a.early_gap_cents} onChange={(c) => ap({ early_gap_cents: c })} /><span className="text-gray-500"> of the max</span>
              </Field>
            </section>
          </>
        );
      })()}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selling what you own (pricing API)</h2>
      <section className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
        <Field label="eBay shipping per sale" hint="Label and supplies when you offer free shipping. The eBay fee is the resale fee above.">
          <Money cents={s.ebay_ship_cents} onChange={(c) => set({ ebay_ship_cents: c })} />
        </Field>
        <Field label="Sending a card to the Fanatics vault" hint="Per card, for cards at home sold on Fanatics.">
          <Money cents={s.vault_inbound_cents} onChange={(c) => set({ vault_inbound_cents: c })} />
        </Field>
        <Field label="Withdrawing a card from the vault" hint="Per card, for vault cards sold on eBay.">
          <Money cents={s.vault_withdraw_cents} onChange={(c) => set({ vault_withdraw_cents: c })} />
        </Field>
        <Field label="List above market by" hint="Room for Best Offers. The list price drops to just under a cheaper competing Buy Now.">
          <Pct value={s.list_markup_pct} onChange={(v) => set({ list_markup_pct: v })} />
        </Field>
        <Field label="Auto-accept offers at" hint="Share of market value.">
          <Pct value={s.accept_offer_pct} onChange={(v) => set({ accept_offer_pct: v })} />
        </Field>
        <Field label="Decline offers below" hint="Share of market value.">
          <Pct value={s.min_offer_pct} onChange={(v) => set({ min_offer_pct: v })} />
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
        <Field label="Cracked PSA 9s that come back a CGC 10" hint="Crossover grading has no public data: start conservative and adjust as your own results come in. Used by the PSA 9 → CGC score.">
          <Pct value={s.crack_psa9_to_cgc10_rate} onChange={(v) => set({ crack_psa9_to_cgc10_rate: v })} step={5} />
        </Field>
        <Field label="Cracked CGC 10s that come back a PSA 10" hint="The rest are counted as PSA 9s. Used by the CGC 10 → PSA score.">
          <Pct value={s.crack_cgc10_to_psa10_rate} onChange={(v) => set({ crack_cgc10_to_psa10_rate: v })} step={5} />
        </Field>
        <Field label="Sets go out of print after" hint="Months after release. Out-of-print sets never say buy raw to grade (copies left are unlikely to be pack fresh); mark a set in or out of print by hand on its page.">
          <input type="number" min={0} max={240} value={s.out_of_print_months} className={`${inputCls} w-16`}
            onChange={(e) => set({ out_of_print_months: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          <span className="text-gray-500"> months</span>
        </Field>
        <Field label="Benchmark return" hint="What the money could earn in the S&P 500 (long-run ~10%/yr). The Timing page flags card categories that beat it after the selling fee.">
          <Pct value={s.benchmark_rate} onChange={(v) => set({ benchmark_rate: v })} step={0.5} />
          <span className="text-gray-500"> / yr</span>
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
