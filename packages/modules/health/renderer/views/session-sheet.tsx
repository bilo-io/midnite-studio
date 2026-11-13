import { useState } from 'react';

import { FrameModal, useFrameChrome } from '@midnite/studio-frame';
import type { HealthExercise, HealthPlan, HealthProfile, HealthSession } from '@midnite/studio-shared';

import { displayWeight, nextPrescription, prescriptionLine, type ExerciseHistory } from '../calc/overload';
import { lbToKg } from '../calc/units';
import { monthKeyOffset } from '../data/dates';
import { shortId } from '../data/ids';
import { useDay, useMonths, usePutDay } from '../data/use-health';

type Row = { reps: string; kg: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** This exercise's logged sets across the given months, oldest first. */
export function historyFor(exerciseId: string, months: { days: Record<string, { sessions: HealthSession[] }> }[]): ExerciseHistory {
  const out: ExerciseHistory = [];
  for (const m of months) {
    for (const [date, day] of Object.entries(m.days)) {
      for (const s of day.sessions) {
        for (const e of s.exercises) if (e.exerciseId === exerciseId && e.sets.length > 0) out.push({ date, sets: e.sets });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function ExerciseBlock({ ex, history, units, rows, onRows }: { ex: HealthExercise; history: ExerciseHistory; units: HealthProfile['units']; rows: Row[]; onRows: (r: Row[]) => void }) {
  const p = nextPrescription(ex, history);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label={ex.name}>
      <h4 className="text-sm font-semibold">{ex.name}</h4>
      <p className="text-xs opacity-70" data-testid="prescription">
        {prescriptionLine(ex, p, units)}
      </p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-10 opacity-60">Set {i + 1}</span>
          <input aria-label={`${ex.name} set ${i + 1} reps`} type="number" inputMode="numeric" value={r.reps} onChange={(e) => onRows(rows.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} className="w-16 rounded-md border border-input bg-background px-1.5 py-1 outline-none focus:ring-1 focus:ring-ring" />
          <span>×</span>
          <input aria-label={`${ex.name} set ${i + 1} weight`} type="number" inputMode="decimal" step="any" value={r.kg} onChange={(e) => onRows(rows.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} className="w-20 rounded-md border border-input bg-background px-1.5 py-1 outline-none focus:ring-1 focus:ring-ring" />
          <span className="opacity-60">{units === 'imperial' ? 'lb' : 'kg'}</span>
          <button type="button" className="rounded px-1.5 py-0.5 hover:bg-accent" aria-label={`Remove ${ex.name} set ${i + 1}`} onClick={() => onRows(rows.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="self-start rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" disabled={rows.length >= 10} onClick={() => onRows([...rows, { ...(rows[rows.length - 1] ?? { reps: String(p.repsTarget), kg: String(displayWeight(p.kg, units)) }) }])}>
        Add set
      </button>
    </section>
  );
}

/** Logs one session of a plan day: prefilled from the overload rule, editable, saved into the date's sessions. */
export function SessionSheet({ plan, dayId, date, units, onClose }: { plan: HealthPlan; dayId: string; date: string; units: HealthProfile['units']; onClose: () => void }) {
  const planDay = plan.days.find((d) => d.id === dayId)!;
  const now = new Date();
  const history = useMonths(monthKeyOffset(now, -2), monthKeyOffset(now, 0));
  const { day, loaded } = useDay(date);
  const put = usePutDay();
  const dialogs = useFrameChrome().useDialogs();
  const months = history.data?.months ?? [];
  const [rows, setRows] = useState<Record<string, Row[]> | null>(null);
  const [minutes, setMinutes] = useState('');
  const [dirty, setDirty] = useState(false);

  // Prefill once the history has loaded: each set takes the prescribed reps and weight.
  const initial: Record<string, Row[]> | null = history.data === undefined ? null : Object.fromEntries(
    planDay.exercises.map((ex) => {
      const p = nextPrescription(ex, historyFor(ex.id, months));
      return [ex.id, Array.from({ length: ex.sets }, () => ({ reps: String(p.repsTarget), kg: String(displayWeight(p.kg, units)) }))];
    }),
  );
  const current = rows ?? initial;

  const requestClose = () => {
    if (!dirty) return onClose();
    dialogs.confirm({
      title: 'Discard this session?',
      confirmLabel: 'Discard',
      danger: true,
      onConfirm: () => {
        dialogs.close();
        onClose();
      },
    });
  };

  const save = () => {
    if (current === null) return;
    const exercises = planDay.exercises.map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      sets: (current[ex.id] ?? []).flatMap((r) => {
        const reps = Number(r.reps);
        const shown = Number(r.kg);
        if (r.reps.trim() === '' || r.kg.trim() === '' || !Number.isInteger(reps) || reps < 0 || reps > 100 || !Number.isFinite(shown) || shown < 0) return [];
        const kg = round2(units === 'imperial' ? lbToKg(shown) : shown);
        return kg > 1000 ? [] : [{ reps, kg }];
      }),
    }));
    const mins = Number(minutes);
    const session: HealthSession = {
      id: shortId('w'),
      planId: plan.id,
      planDayId: planDay.id,
      exercises,
      ...(minutes.trim() !== '' && Number.isInteger(mins) && mins >= 0 && mins <= 600 ? { minutes: mins } : {}),
    };
    put.mutate({ date, day: { ...day, sessions: [...day.sessions, session] } });
    onClose();
  };

  return (
    <FrameModal open onClose={requestClose} title={`Log ${planDay.name}`} size="lg" scope="window" testId="session-sheet">
      <div className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold">
          {plan.name} · {planDay.name} · {date}
        </h3>
        {current === null ? <p className="text-xs opacity-70">Loading your history…</p> : null}
        {current !== null
          ? planDay.exercises.map((ex) => (
              <ExerciseBlock
                key={ex.id}
                ex={ex}
                history={historyFor(ex.id, months)}
                units={units}
                rows={current[ex.id] ?? []}
                onRows={(r) => {
                  setRows({ ...current, [ex.id]: r });
                  setDirty(true);
                }}
              />
            ))
          : null}
        <label className="flex w-40 flex-col gap-1 text-xs font-medium">
          Minutes
          <input type="number" value={minutes} onChange={(e) => { setMinutes(e.target.value); setDirty(true); }} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={requestClose}>
            Cancel
          </button>
          <button type="button" disabled={!loaded || current === null} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40" onClick={save}>
            Save session
          </button>
        </div>
      </div>
    </FrameModal>
  );
}
