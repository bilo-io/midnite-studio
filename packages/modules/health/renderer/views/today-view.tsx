import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { HealthMeal, HealthMealSlot, HealthPlan } from '@midnite/studio-shared';

import { hasTarget, kcalTarget } from '../calc/body';
import { nextPrescription, prescriptionLine } from '../calc/overload';
import { dayNumber } from '../calc/trends';
import { formatWeight, kgToLb, lbToKg } from '../calc/units';
import { todayKey } from '../data/dates';
import { HealthMissing } from '../data/health-missing';
import { healthBridge, useDay, useLatestWeight, usePlans, useProfile, usePutDay } from '../data/use-health';
import { MealModal } from './meal-modal';
import { NOT_MEDICAL } from './profile-card';
import { sumMeals } from './nutrition-view';
import { historyFor, SessionSheet } from './session-sheet';

const slotForNow = (d: Date): HealthMealSlot => (d.getHours() < 11 ? 'breakfast' : d.getHours() < 16 ? 'lunch' : d.getHours() < 21 ? 'dinner' : 'snack');
const isoWeekday = (d: Date): number => ((d.getDay() + 6) % 7) + 1;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Ring({ fraction }: { fraction: number }) {
  const C = 2 * Math.PI * 40;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="10" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent, #f43f5e)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.min(1, Math.max(0, fraction)) * C} ${C}`} />
    </svg>
  );
}

/** Today — calories left, a quick weigh-in, today's training and a first-run card. */
export function TodayView({ onView }: { onView?: (view: string) => void }) {
  const client = useQueryClient();
  const now = new Date();
  const today = todayKey();
  const profile = useProfile();
  const plans = usePlans();
  const { day, loaded } = useDay(today);
  const { latest, months, quarantined, isLoading: monthsLoading } = useLatestWeight(now);
  const put = usePutDay();
  const [mealOpen, setMealOpen] = useState(false);
  const [logging, setLogging] = useState<{ plan: HealthPlan; dayId: string } | null>(null);
  const [weight, setWeight] = useState('');

  if (healthBridge() === undefined) return <HealthMissing />;
  if (profile.isError || plans.isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-sm" role="alert">
        <p>Couldn't read your Health data.</p>
        <button type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => void client.refetchQueries({ queryKey: ['health'] })}>
          Retry
        </button>
      </div>
    );
  }
  if (profile.isLoading || plans.isLoading || monthsLoading || !loaded) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6" data-testid="today-skeleton" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-accent/40" />
        ))}
      </div>
    );
  }

  const units = profile.data?.units ?? 'metric';
  const planList = plans.data?.plans ?? [];
  const damaged = (plans.data?.quarantined ?? 0) + quarantined;
  const anyLogged = months.some((m) => Object.keys(m.days).length > 0);

  const notice = damaged > 0 ? <p className="text-xs opacity-70" data-testid="damaged-notice">{`${damaged} damaged ${damaged === 1 ? 'file was' : 'files were'} set aside in your Health data folder.`}</p> : null;

  if (profile.data === null && !anyLogged) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6" data-testid="today-first-run">
        {notice}
        <Card title="Start with whatever you like">
          <p className="text-xs opacity-70">Everything is optional and stays on this Mac.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => onView?.('biometrics')}>
              Add a weigh-in
            </button>
            <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={() => onView?.('nutrition')}>
              Log a meal
            </button>
            <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={() => onView?.('workouts')}>
              Pick a starter plan
            </button>
          </div>
        </Card>
        <p className="text-xs opacity-60">{NOT_MEDICAL}</p>
      </div>
    );
  }

  const totals = sumMeals(day.meals);
  const target = kcalTarget(profile.data, latest?.kg, now.getFullYear());

  // Weights: the average of the last 7 days, and its change from the 7 days before that.
  const points = months.flatMap((m) => Object.entries(m.days).filter(([, d]) => d.weightKg !== undefined).map(([date, d]) => ({ n: dayNumber(date), kg: d.weightKg! })));
  const t = dayNumber(today);
  const cur = points.filter((p) => p.n > t - 7 && p.n <= t).map((p) => p.kg);
  const prev = points.filter((p) => p.n > t - 14 && p.n <= t - 7).map((p) => p.kg);
  const avgNow = cur.length >= 3 ? mean(cur) : null;
  const avgChange = avgNow !== null && prev.length >= 3 ? avgNow - mean(prev) : null;

  const saveWeight = () => {
    const n = Number(weight);
    const kg = units === 'imperial' ? Math.round(lbToKg(n) * 100) / 100 : n;
    if (!Number.isFinite(n) || kg < 20 || kg > 400) return;
    put.mutate({ date: today, day: { ...day, weightKg: kg } });
    setWeight('');
  };

  const weekday = isoWeekday(now);
  let todays: { plan: HealthPlan; dayId: string } | null = null;
  for (const p of planList) {
    const d = p.days.find((x) => x.weekday === weekday);
    if (d !== undefined) {
      todays = { plan: p, dayId: d.id };
      break;
    }
  }
  const planDay = todays?.plan.days.find((d) => d.id === todays!.dayId);

  const addMeal = (meal: HealthMeal) => {
    put.mutate({ date: today, day: { ...day, meals: [...day.meals, meal] } });
    setMealOpen(false);
  };
  const dispWeight = (kg: number): string => String(units === 'imperial' ? Math.round(kgToLb(kg) * 10) / 10 : kg);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6" data-testid="today-view">
      {notice}
      <Card title="Calories">
        <div className="flex items-center gap-4">
          <Ring fraction={hasTarget(target) ? totals.kcal / target.kcal : 0} />
          <div className="text-xs">
            {hasTarget(target) ? (
              <p className="text-sm" data-testid="calories-line">
                <b>{totals.kcal}</b> / {target.kcal} kcal · {totals.kcal <= target.kcal ? `${target.kcal - totals.kcal} kcal left` : `${totals.kcal - target.kcal} kcal over`}
              </p>
            ) : (
              <p className="text-sm">
                <b>{totals.kcal}</b> kcal ·{' '}
                <button type="button" className="underline" onClick={() => onView?.('biometrics')}>
                  Set up your profile for a target
                </button>
              </p>
            )}
            <p className="opacity-70">
              P {Math.round(totals.proteinG)} g · C {Math.round(totals.carbsG)} g · F {Math.round(totals.fatG)} g
            </p>
          </div>
          <button type="button" className="ml-auto rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => setMealOpen(true)}>
            Log a meal
          </button>
        </div>
      </Card>
      <Card title="Weigh-in">
        {day.weightKg !== undefined ? <p className="text-sm">Today: <b>{formatWeight(day.weightKg, units)}</b></p> : null}
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Weight ({units === 'imperial' ? 'lb' : 'kg'})
            <input type="number" inputMode="decimal" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-28 rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring" />
          </label>
          <button type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40" disabled={weight.trim() === ''} onClick={saveWeight}>
            Save
          </button>
        </div>
        {avgNow !== null ? (
          <p className="text-xs opacity-70" data-testid="weight-average">
            7-day average {formatWeight(avgNow, units)}
            {avgChange !== null ? ` · ${avgChange < 0 ? '−' : '+'}${dispWeight(Math.abs(avgChange))} ${units === 'imperial' ? 'lb' : 'kg'} from a week ago` : ''}
          </p>
        ) : null}
      </Card>
      <Card title="Training">
        {planDay === undefined || todays === null ? (
          <p className="text-xs" data-testid="rest-day">
            Rest day.{' '}
            <button type="button" className="underline" onClick={() => onView?.('workouts')}>
              Open Workouts
            </button>
          </p>
        ) : (
          <>
            <p className="text-sm font-medium" data-testid="training-day">
              {todays.plan.name} · {planDay.name}
            </p>
            <ul className="text-xs opacity-80">
              {planDay.exercises.map((ex) => (
                <li key={ex.id}>
                  {ex.name}: {prescriptionLine(ex, nextPrescription(ex, historyFor(ex.id, months)), units)}
                </li>
              ))}
            </ul>
            <button type="button" className="self-start rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40" disabled={planDay.exercises.length === 0} onClick={() => setLogging(todays)}>
              Log session
            </button>
          </>
        )}
      </Card>
      <p className="text-xs opacity-60">Targets are estimates. {NOT_MEDICAL}</p>
      {mealOpen ? <MealModal slot={slotForNow(now)} onSave={addMeal} onClose={() => setMealOpen(false)} /> : null}
      {logging !== null ? <SessionSheet plan={logging.plan} dayId={logging.dayId} date={today} units={units} onClose={() => setLogging(null)} /> : null}
    </div>
  );
}
