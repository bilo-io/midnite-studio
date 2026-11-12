import { useEffect, useRef, useState } from 'react';
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';
import type { HealthExercise, HealthPlan } from '@midnite/studio-shared';

import { shortId } from '../data/ids';
import { useWritePlan } from '../data/use-health';
import { NumField } from './num-field';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DEBOUNCE_MS = 600;

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
};

/** One exercise row: name plus the progression numbers. */
function ExerciseRow({ ex, onChange }: { ex: HealthExercise; onChange: (e: HealthExercise) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6" data-testid="exercise-row">
      <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
        Exercise
        <input value={ex.name} maxLength={80} onChange={(e) => e.target.value !== '' && onChange({ ...ex, name: e.target.value })} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring" />
      </label>
      <NumField label="Sets" value={ex.sets} min={1} max={10} integer onCommit={(v) => v !== undefined && onChange({ ...ex, sets: v })} />
      <NumField label="Reps min" value={ex.repsMin} min={1} max={ex.repsMax} integer onCommit={(v) => v !== undefined && onChange({ ...ex, repsMin: v })} />
      <NumField label="Reps max" value={ex.repsMax} min={ex.repsMin} max={100} integer onCommit={(v) => v !== undefined && onChange({ ...ex, repsMax: v })} />
      <NumField label="Start" unit="kg" value={ex.startKg} min={0} max={1000} onCommit={(v) => v !== undefined && onChange({ ...ex, startKg: v })} />
      <NumField label="Add each time" unit="kg" value={ex.incrementKg} min={0} max={50} onCommit={(v) => v !== undefined && onChange({ ...ex, incrementKg: v })} />
      <NumField label="Deload" unit="%" value={ex.deloadPct} min={0} max={50} onCommit={(v) => v !== undefined && onChange({ ...ex, deloadPct: v })} />
    </div>
  );
}

/**
 * Edits one plan. Changes save 600 ms after the last edit, and a pending save is flushed on leaving, so closing
 * the editor never drops an edit.
 */
export function PlanEditor({ plan, onBack, onLogSession }: { plan: HealthPlan; onBack: () => void; onLogSession: (plan: HealthPlan, dayId: string) => void }) {
  const { IconButton } = useFrameChrome();
  const write = useWritePlan();
  const [draft, setDraft] = useState(plan);
  const [weekdayError, setWeekdayError] = useState<string | null>(null);
  const pending = useRef<HealthPlan | null>(null);
  const writeRef = useRef(write.mutate);
  writeRef.current = write.mutate;

  const edit = (next: HealthPlan) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    pending.current = stamped;
    setDraft(stamped);
  };

  useEffect(() => {
    if (pending.current === null) return;
    const timer = setTimeout(() => {
      if (pending.current) writeRef.current(pending.current);
      pending.current = null;
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(
    () => () => {
      if (pending.current) writeRef.current(pending.current);
    },
    [],
  );

  const setDay = (i: number, patch: Partial<HealthPlan['days'][number]>) => edit({ ...draft, days: draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  const chooseWeekday = (i: number, value: string) => {
    if (value === '') {
      setWeekdayError(null);
      const { weekday: _drop, ...rest } = draft.days[i]!;
      return edit({ ...draft, days: draft.days.map((d, j) => (j === i ? rest : d)) });
    }
    const weekday = Number(value);
    if (draft.days.some((d, j) => j !== i && d.weekday === weekday)) return setWeekdayError(`Already on ${WEEKDAYS[weekday - 1]}`);
    setWeekdayError(null);
    setDay(i, { weekday });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="plan-editor">
      <div className="flex items-center gap-2">
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-accent" onClick={onBack}>
          ← Plans
        </button>
        <input
          aria-label="Plan name"
          value={draft.name}
          maxLength={80}
          onChange={(e) => edit({ ...draft, name: e.target.value === '' ? draft.name : e.target.value })}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {weekdayError ? (
        <p className="text-[11px] text-destructive" role="alert">
          {weekdayError}
        </p>
      ) : null}
      {draft.days.map((day, i) => (
        <section key={day.id} className="flex flex-col gap-3 rounded-lg border border-border p-3" aria-label={day.name}>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`Day ${i + 1} name`} value={day.name} maxLength={40} onChange={(e) => setDay(i, { name: e.target.value })} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-ring" />
            <select aria-label={`Day ${i + 1} weekday`} value={day.weekday ?? ''} onChange={(e) => chooseWeekday(i, e.target.value)} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
              <option value="">Any day</option>
              {WEEKDAYS.map((w, k) => (
                <option key={w} value={k + 1}>
                  {w}
                </option>
              ))}
            </select>
            <button type="button" className="ml-auto rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40" disabled={day.exercises.length === 0} onClick={() => onLogSession(draft, day.id)}>
              Log session
            </button>
            {draft.days.length > 1 ? <IconButton icon={LuTrash2} label={`Delete ${day.name}`} onClick={() => edit({ ...draft, days: draft.days.filter((_, j) => j !== i) })} /> : null}
          </div>
          {day.exercises.map((ex, k) => (
            <div key={ex.id} className="flex items-start gap-2">
              <div className="flex-1">
                <ExerciseRow ex={ex} onChange={(next) => setDay(i, { exercises: day.exercises.map((e, j) => (j === k ? next : e)) })} />
              </div>
              <div className="flex flex-col">
                <IconButton icon={LuArrowUp} label={`Move ${ex.name} up`} disabled={k === 0} onClick={() => setDay(i, { exercises: move(day.exercises, k, k - 1) })} />
                <IconButton icon={LuArrowDown} label={`Move ${ex.name} down`} disabled={k === day.exercises.length - 1} onClick={() => setDay(i, { exercises: move(day.exercises, k, k + 1) })} />
                <IconButton icon={LuTrash2} label={`Delete ${ex.name}`} onClick={() => setDay(i, { exercises: day.exercises.filter((_, j) => j !== k) })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="flex items-center gap-1 self-start rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
            disabled={day.exercises.length >= 20}
            onClick={() => setDay(i, { exercises: [...day.exercises, { id: shortId('x'), name: 'New exercise', sets: 3, repsMin: 8, repsMax: 12, startKg: 20, incrementKg: 2.5, deloadPct: 10 }] })}
          >
            <LuPlus aria-hidden /> Add exercise
          </button>
        </section>
      ))}
      <button type="button" className="flex items-center gap-1 self-start rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" disabled={draft.days.length >= 7} onClick={() => edit({ ...draft, days: [...draft.days, { id: shortId('d'), name: `Day ${draft.days.length + 1}`, exercises: [] }] })}>
        <LuPlus aria-hidden /> Add day
      </button>
    </div>
  );
}
