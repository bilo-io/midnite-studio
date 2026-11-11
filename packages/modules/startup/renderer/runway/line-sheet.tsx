import { useState, type FormEvent } from 'react';

import { PLAN_CADENCES, PLAN_CATEGORIES, type PlanLine } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { fromMinor, toMinor } from '../money-input';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';
const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/** The add/edit side sheet for one cost or revenue line. Main re-validates and answers with its own message. */
export function LineSheet({ line, currency, onClose }: { line: PlanLine | null; currency: string; onClose: () => void }) {
  const save = useStartupWrite((bridge, next: PlanLine) => bridge.upsertLine({ line: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeLine({ id }));
  const [id] = useState(() => line?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<PlanLine['kind']>(line?.kind ?? 'cost');
  const [name, setName] = useState(line?.name ?? '');
  const [category, setCategory] = useState<PlanLine['category']>(line?.category ?? 'other');
  const [amount, setAmount] = useState(line === null ? '' : fromMinor(line.minor, currency));
  const [cadence, setCadence] = useState<PlanLine['cadence']>(line?.cadence ?? 'monthly');
  const [start, setStart] = useState(line?.start ?? thisMonth());
  const [end, setEnd] = useState(line?.end ?? '');
  const [growth, setGrowth] = useState(line === null ? '0' : String(line.growthBpPerMonth / 100));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const minor = toMinor(amount, currency);
    const growthPct = Number(growth);
    if (name.trim() === '') return setProblem('Give the line a name.');
    if (minor === null || minor < 0) return setProblem('Enter the amount as a number.');
    if (!Number.isFinite(growthPct) || Math.abs(growthPct) > 100) return setProblem('Growth is a percentage between -100 and 100.');
    if (end !== '' && end < start) return setProblem('The end cannot be before the start.');
    setProblem(null);
    save.mutate(
      { id, kind, name: name.trim(), category, minor, cadence, start, ...(end !== '' ? { end } : {}), growthBpPerMonth: Math.round(growthPct * 100), ...(line?.contractId !== undefined ? { contractId: line.contractId } : {}) },
      { onSuccess: onClose, onError: (e) => setProblem(e.message) },
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={line === null ? 'Add line' : 'Edit line'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{line === null ? 'Add line' : 'Edit line'}</h2>
        <label className={LABEL}>
          Kind
          <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as PlanLine['kind'])}>
            <option value="cost">Cost</option>
            <option value="revenue">Revenue</option>
          </select>
        </label>
        <label className={LABEL}>
          Name
          <input className={FIELD} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={LABEL}>
          Category
          <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value as PlanLine['category'])}>
            {PLAN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Amount ({currency})
          <input className={FIELD} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className={LABEL}>
          Cadence
          <select className={FIELD} value={cadence} onChange={(e) => setCadence(e.target.value as PlanLine['cadence'])}>
            {PLAN_CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Start
          <input className={FIELD} type="month" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={LABEL}>
          End (optional)
          <input className={FIELD} type="month" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className={LABEL}>
          Growth per month (%)
          <input className={FIELD} inputMode="decimal" value={growth} onChange={(e) => setGrowth(e.target.value)} />
        </label>
        {problem !== null ? (
          <p role="alert" className="text-xs text-red-500">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Save
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-sm">
            Cancel
          </button>
          {line !== null ? (
            <button type="button" onClick={() => remove.mutate(line.id, { onSuccess: onClose, onError: (e) => setProblem(e.message) })} className="ml-auto h-8 rounded-md px-3 text-sm text-red-500">
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
