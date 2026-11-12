import { useMemo, useState } from 'react';
import { useStore } from 'zustand';

import { hasTarget, kcalTarget } from '../calc/body';
import { kgToLb } from '../calc/units';
import { isoWeekKey, movingAverage, weekStart, weeklyRate, weeklySummary, type Point } from '../calc/trends';
import { TimeChart } from '../charts/time-chart';
import { monthKeyOffset, shiftDate, todayKey } from '../data/dates';
import { HealthMissing } from '../data/health-missing';
import { healthBridge, useLatestWeight, useMonths, useProfile } from '../data/use-health';
import { healthUiStore, type ProgressRange } from '../health-ui-store';

const RANGE_DAYS: Record<ProgressRange, number> = { '30d': 30, '90d': 90, '1y': 365 };
const RANGE_MONTHS_BACK: Record<ProgressRange, number> = { '30d': 1, '90d': 3, '1y': 12 };
const RANGE_LABEL: Record<ProgressRange, string> = { '30d': '30 days', '90d': '90 days', '1y': '1 year' };

const signed = (n: number, dp = 1): string => `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(dp)}`;

function Empty() {
  return (
    <p className="py-6 text-center text-xs opacity-70" data-testid="chart-empty">
      Nothing to plot yet
    </p>
  );
}

function Card({ title, header, children }: { title: string; header?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3" aria-label={title}>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {header ? <span className="text-xs opacity-70">{header}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Progress — a weekly report card and four charts over the chosen range. */
export function ProgressView() {
  const range = useStore(healthUiStore(), (s) => s.range);
  const setRange = useStore(healthUiStore(), (s) => s.setRange);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const now = new Date();
  const months = useMonths(monthKeyOffset(now, -RANGE_MONTHS_BACK[range]), monthKeyOffset(now, 0));
  const profile = useProfile();
  const { latest } = useLatestWeight();

  const today = todayKey();
  const from = shiftDate(today, -(RANGE_DAYS[range] - 1));
  const imperial = profile.data?.units === 'imperial';
  const wUnit = imperial ? 'lb' : 'kg';
  const conv = (kg: number): number => (imperial ? Math.round(kgToLb(kg) * 10) / 10 : kg);

  const data = useMemo(() => {
    const logs = months.data?.months ?? [];
    const days = logs.flatMap((m) => Object.entries(m.days).map(([date, d]) => ({ date, ...d }))).sort((a, b) => (a.date < b.date ? -1 : 1));
    const inRange = days.filter((d) => d.date >= from && d.date <= today);
    const weights: Point[] = days.filter((d) => d.weightKg !== undefined).map((d) => ({ date: d.date, value: conv(d.weightKg!) }));
    const kcal: Point[] = inRange.filter((d) => d.meals.length > 0).map((d) => ({ date: d.date, value: d.meals.reduce((a, m) => a + m.kcal, 0) }));
    const volumeByWeek = new Map<string, number>();
    const tops = new Map<string, { name: string; points: Point[] }>();
    for (const d of inRange) {
      for (const s of d.sessions) {
        for (const e of s.exercises) {
          if (e.sets.length === 0) continue;
          const vol = e.sets.reduce((a, st) => a + st.reps * st.kg, 0);
          volumeByWeek.set(weekStart(d.date), (volumeByWeek.get(weekStart(d.date)) ?? 0) + vol);
          const entry = tops.get(e.exerciseId) ?? { name: e.name, points: [] };
          entry.points.push({ date: d.date, value: conv(Math.max(...e.sets.map((st) => st.kg))) });
          tops.set(e.exerciseId, entry);
        }
      }
    }
    return { logs, weights, kcal, volume: [...volumeByWeek].map(([date, value]) => ({ date, value: Math.round(value) })), tops };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.data, from, today, imperial]);

  if (healthBridge() === undefined) return <HealthMissing />;
  if (months.isError) {
    return (
      <p className="p-8 text-sm" role="alert">
        Couldn't read your Health data.
      </p>
    );
  }

  const weightsInRange = data.weights.filter((p) => p.date >= from);
  const avg = movingAverage(data.weights).filter((p) => p.date >= from);
  // `data.weights` is already in the profile's units, so the rate is too.
  const rate = weeklyRate(data.weights);
  const year = now.getFullYear();
  const target = kcalTarget(profile.data, latest?.kg, year);
  const topList = [...data.tops].map(([id, v]) => ({ id, ...v }));
  const chosen = topList.find((t) => t.id === exerciseId) ?? topList[0];
  const thisWeek = isoWeekKey(today);
  const lastWeek = isoWeekKey(shiftDate(today, -7));

  const report = (key: string) => {
    const s = weeklySummary(data.logs, key);
    const parts = [
      s.avgKcal === null ? 'no meals logged' : `Avg ${s.avgKcal.toLocaleString('en-US')} kcal`,
      `${s.daysLogged} days logged`,
      `${s.sessions} ${s.sessions === 1 ? 'session' : 'sessions'}`,
      `${Math.round(s.volumeKg).toLocaleString('en-US')} kg moved`,
      s.weightChangeKg === null ? 'no weight change' : `weight ${signed(imperial ? kgToLb(s.weightChangeKg) : s.weightChangeKg)} ${wUnit}`,
    ];
    return parts.join(' · ');
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6" data-testid="progress-view">
      <div role="tablist" className="flex gap-1" aria-label="Range">
        {(['30d', '90d', '1y'] as const).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={range === r} className={`rounded-md px-3 py-1 text-xs ${range === r ? 'bg-accent font-medium' : 'opacity-70 hover:bg-accent'}`} onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <section className="rounded-lg border border-border p-3 text-xs" aria-label="Weekly report" data-testid="report-card">
        <h3 className="mb-1 text-sm font-semibold">Weekly report</h3>
        <p>
          <b>This week</b> · {report(thisWeek)}
        </p>
        <p className="opacity-80">
          <b>Last week</b> · {report(lastWeek)}
        </p>
      </section>
      <Card title="Weight" header={rate === null ? undefined : `${signed(rate)} ${wUnit}/week`}>
        {weightsInRange.length === 0 ? (
          <Empty />
        ) : (
          <TimeChart
            title="Weight"
            yUnit={wUnit}
            range={{ from, to: today }}
            series={[
              { id: 'weight', label: 'Weight', kind: 'dots', tone: 'muted', points: weightsInRange },
              { id: 'avg', label: '7-day average', kind: 'line', tone: 'accent', points: avg },
            ]}
          />
        )}
      </Card>
      <Card title="Calories">
        {data.kcal.length === 0 ? (
          <Empty />
        ) : (
          <TimeChart title="Calories" yUnit="kcal" range={{ from, to: today }} series={[{ id: 'kcal', label: 'Calories', kind: 'bars', tone: 'accent', points: data.kcal }]} {...(hasTarget(target) ? { refLine: { value: target.kcal, label: `Target ${target.kcal}` } } : {})} />
        )}
      </Card>
      <Card title="Training volume">
        {data.volume.length === 0 ? <Empty /> : <TimeChart title="Training volume" yUnit="kg" range={{ from, to: today }} series={[{ id: 'volume', label: 'Weekly volume', kind: 'bars', tone: 'good', points: data.volume }]} />}
      </Card>
      <Card title="Top set">
        {chosen === undefined ? (
          <Empty />
        ) : (
          <>
            <select aria-label="Exercise" value={chosen.id} onChange={(e) => setExerciseId(e.target.value)} className="mb-2 rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
              {topList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <TimeChart title={`Top set: ${chosen.name}`} yUnit={wUnit} range={{ from, to: today }} series={[{ id: 'top', label: chosen.name, kind: 'line', tone: 'accent', points: chosen.points }, { id: 'topdots', label: 'Sets', kind: 'dots', tone: 'accent', points: chosen.points }]} />
          </>
        )}
      </Card>
    </div>
  );
}
