import { useState } from 'react';
import { LuEllipsis, LuPlus } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';
import type { HealthDay, HealthMeal, HealthMealSlot } from '@midnite/studio-shared';
import { HEALTH_MEAL_SLOTS } from '@midnite/studio-shared';

import { hasTarget, kcalTarget } from '../calc/body';
import { todayKey } from '../data/dates';
import { shortId } from '../data/ids';
import { healthBridge, useDay, useLatestWeight, useProfile, usePutDay } from '../data/use-health';
import { HealthMissing } from '../data/health-missing';
import { DateRow } from './date-row';
import { FoodsTab } from './foods-tab';
import { MealModal } from './meal-modal';
import { NOT_MEDICAL } from './profile-card';

const SLOT_LABEL: Record<HealthMealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export const sumMeals = (meals: HealthMeal[]) => ({
  kcal: meals.reduce((a, m) => a + m.kcal, 0),
  proteinG: meals.reduce((a, m) => a + (m.proteinG ?? 0), 0),
  carbsG: meals.reduce((a, m) => a + (m.carbsG ?? 0), 0),
  fatG: meals.reduce((a, m) => a + (m.fatG ?? 0), 0),
});

const g = (n: number): string => String(Math.round(n * 10) / 10);

/** Nutrition — a day's meals by slot against the calorie target, and the saved-foods library. */
export function NutritionView({ onView }: { onView?: (view: string) => void }) {
  const [tab, setTab] = useState<'log' | 'foods'>('log');
  const [date, setDate] = useState(todayKey);
  const [modal, setModal] = useState<{ slot: HealthMealSlot; editing?: HealthMeal } | null>(null);
  const { day, loaded } = useDay(date);
  const put = usePutDay();
  const profile = useProfile();
  const { latest } = useLatestWeight();
  const { IconButton, useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  if (healthBridge() === undefined) return <HealthMissing />;

  const save = (meals: HealthMeal[]) => put.mutate({ date, day: { ...day, meals } satisfies HealthDay });
  const totals = sumMeals(day.meals);
  const target = kcalTarget(profile.data, latest?.kg, new Date().getFullYear());

  const rowMenu = (e: React.MouseEvent, meal: HealthMeal) =>
    dialogs.openMenu?.({ clientX: e.clientX, clientY: e.clientY }, [
      { label: 'Edit', onSelect: () => setModal({ slot: meal.slot, editing: meal }) },
      { label: 'Duplicate to today', onSelect: () => duplicateToToday(meal) },
      { label: 'Delete', danger: true, onSelect: () => save(day.meals.filter((m) => m.id !== meal.id)) },
    ]);

  const duplicateToToday = (meal: HealthMeal) => {
    const today = todayKey();
    const copy = { ...meal, id: shortId('m') };
    if (today === date) return save([...day.meals, copy]);
    // Another day: merge into today's real contents, read fresh from main.
    void healthBridge()
      ?.getMonths({ from: today.slice(0, 7), to: today.slice(0, 7) })
      .then((res) => {
        const existing = res.ok ? (res.value.months[0]?.days[today] ?? { meals: [], sessions: [] }) : null;
        if (existing) put.mutate({ date: today, day: { ...existing, meals: [...existing.meals, copy] } });
      });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6" data-testid="nutrition-view">
      <div role="tablist" className="flex gap-1">
        {(['log', 'foods'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`rounded-md px-3 py-1 text-xs ${tab === t ? 'bg-accent font-medium' : 'opacity-70 hover:bg-accent'}`} onClick={() => setTab(t)}>
            {t === 'log' ? 'Meals' : 'Foods'}
          </button>
        ))}
      </div>
      {tab === 'foods' ? (
        <FoodsTab />
      ) : (
        <>
          <DateRow date={date} onChange={setDate} />
          <div className="rounded-lg border border-border p-3 text-xs" data-testid="day-total">
            {hasTarget(target) ? (
              <>
                <p className="text-sm">
                  <b>{totals.kcal}</b> / {target.kcal} kcal ·{' '}
                  {totals.kcal <= target.kcal ? `${target.kcal - totals.kcal} kcal left` : `${totals.kcal - target.kcal} kcal over`}
                </p>
              </>
            ) : (
              <p className="text-sm">
                <b>{totals.kcal}</b> kcal ·{' '}
                <button type="button" className="underline" onClick={() => onView?.('biometrics')}>
                  Set up your profile for a target
                </button>
              </p>
            )}
            <p className="opacity-70">
              P {g(totals.proteinG)} g · C {g(totals.carbsG)} g · F {g(totals.fatG)} g
            </p>
            <p className="mt-1 opacity-60">Targets are estimates. {NOT_MEDICAL}</p>
          </div>
          {HEALTH_MEAL_SLOTS.map((slot) => {
            const meals = day.meals.filter((m) => m.slot === slot);
            const t = sumMeals(meals);
            return (
              <section key={slot} className="rounded-lg border border-border p-3" aria-label={SLOT_LABEL[slot]}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {SLOT_LABEL[slot]} <span className="text-xs font-normal opacity-60">{t.kcal} kcal</span>
                  </h3>
                  <button type="button" disabled={!loaded} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" onClick={() => setModal({ slot })} aria-label={`Add to ${SLOT_LABEL[slot]}`}>
                    <LuPlus aria-hidden /> Add
                  </button>
                </div>
                <ul className="mt-1 flex flex-col">
                  {meals.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1 text-xs" data-testid="meal-row">
                      <span>
                        {m.name} <span className="opacity-60">× {m.servings}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="opacity-70">
                          {m.kcal} kcal · P {g(m.proteinG ?? 0)} C {g(m.carbsG ?? 0)} F {g(m.fatG ?? 0)}
                        </span>
                        <IconButton icon={LuEllipsis} label={`Actions for ${m.name}`} onClick={(e) => rowMenu(e, m)} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
      {modal ? (
        <MealModal
          slot={modal.slot}
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSave={(meal) => {
            save(modal.editing ? day.meals.map((m) => (m.id === meal.id ? meal : m)) : [...day.meals, meal]);
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}
