import { useState } from 'react';

import type { HealthDay, HealthProfile } from '@midnite/studio-shared';

import { formatWeight, kgToLb, lbToKg } from '../calc/units';
import { todayKey } from '../data/dates';
import { useDay, usePutDay, useLatestWeight } from '../data/use-health';
import { DateRow } from './date-row';
import { NumField } from './num-field';

const round = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;

type Field = 'bodyFatPct' | 'waistCm' | 'restingHr' | 'sleepHours';

/** The weigh-in form and the last 30 logged days. */
export function MeasurementLog({ units, date, onDate }: { units: HealthProfile['units']; date: string; onDate: (d: string) => void }) {
  const { day, loaded } = useDay(date);
  const put = usePutDay();
  const { months } = useLatestWeight();
  const save = (patch: Partial<HealthDay>) => put.mutate({ date, day: { ...day, ...patch } });
  const imperial = units === 'imperial';
  const weight = day.weightKg === undefined ? undefined : imperial ? round(kgToLb(day.weightKg), 1) : day.weightKg;
  const num = (label: string, field: Field, min: number, max: number, unit: string, integer = false) => (
    <NumField label={label} unit={unit} value={day[field]} min={min} max={max} integer={integer} onCommit={(v) => save({ [field]: v })} />
  );

  const rows = months
    .flatMap((m) => Object.entries(m.days).map(([d, v]) => ({ date: d, ...v })))
    .filter((r) => r.weightKg !== undefined || r.bodyFatPct !== undefined || r.waistCm !== undefined || r.restingHr !== undefined || r.sleepHours !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  const [noteDraft, setNoteDraft] = useState<{ date: string; text: string } | null>(null);
  const note = noteDraft?.date === date ? noteDraft.text : (day.note ?? '');

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-label="Measurements">
      <h3 className="text-sm font-semibold">Measurements</h3>
      <DateRow date={date} onChange={onDate} />
      <fieldset disabled={!loaded} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField
          label="Weight"
          unit={imperial ? 'lb' : 'kg'}
          value={weight}
          min={imperial ? 44 : 20}
          max={imperial ? 882 : 400}
          onCommit={(v) => save({ weightKg: v === undefined ? undefined : round(imperial ? lbToKg(v) : v, 2) })}
        />
        {num('Body fat', 'bodyFatPct', 2, 70, '%')}
        {num('Waist', 'waistCm', 30, 250, 'cm')}
        {num('Resting heart rate', 'restingHr', 25, 220, 'bpm', true)}
        {num('Sleep', 'sleepHours', 0, 24, 'hours')}
      </fieldset>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Note
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          disabled={!loaded}
          onChange={(e) => setNoteDraft({ date, text: e.target.value })}
          onBlur={() => {
            if (noteDraft?.date === date && noteDraft.text !== (day.note ?? '')) save({ note: noteDraft.text === '' ? undefined : noteDraft.text });
            setNoteDraft(null);
          }}
          className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      {rows.length === 0 ? (
        <p className="text-xs opacity-70" data-testid="measurements-empty">
          No measurements yet. Weigh in to start your trend.
        </p>
      ) : (
        <table className="w-full text-left text-xs" data-testid="measurement-table">
          <thead className="opacity-60">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="font-medium">Weight</th>
              <th className="font-medium">Body fat</th>
              <th className="font-medium">Waist</th>
              <th className="font-medium">RHR</th>
              <th className="font-medium">Sleep</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} onClick={() => onDate(r.date)} className={`cursor-pointer hover:bg-accent ${r.date === date ? 'bg-accent' : ''}`} aria-current={r.date === date ? 'date' : undefined}>
                <td className="py-1">{r.date === todayKey() ? 'Today' : r.date}</td>
                <td>{r.weightKg === undefined ? '—' : formatWeight(r.weightKg, units)}</td>
                <td>{r.bodyFatPct === undefined ? '—' : `${r.bodyFatPct}%`}</td>
                <td>{r.waistCm === undefined ? '—' : `${r.waistCm} cm`}</td>
                <td>{r.restingHr ?? '—'}</td>
                <td>{r.sleepHours === undefined ? '—' : `${r.sleepHours} h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
