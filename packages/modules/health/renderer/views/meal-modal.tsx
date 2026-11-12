import { useState } from 'react';

import { FrameModal } from '@midnite/studio-frame';
import type { HealthFood, HealthMeal, HealthMealSlot } from '@midnite/studio-shared';

import { shortId } from '../data/ids';
import { useFoods, useUpsertFood } from '../data/use-health';
import { NumField } from './num-field';

const round = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** A food scaled by servings: kcal to 1, grams to 0.1. */
export function mealFromFood(food: HealthFood, slot: HealthMealSlot, servings: number): HealthMeal {
  return {
    id: shortId('m'),
    slot,
    name: food.name,
    kcal: Math.round(food.kcal * servings),
    proteinG: round(food.proteinG * servings, 1),
    carbsG: round(food.carbsG * servings, 1),
    fatG: round(food.fatG * servings, 1),
    foodId: food.id,
    servings,
  };
}

type Custom = { name: string; kcal: number | undefined; proteinG?: number; carbsG?: number; fatG?: number };

/**
 * Adds a meal to a slot, or edits one (`editing`). Add: search saved foods and pick servings, or a custom entry
 * (optionally saved to the library). Edit: the meal's own numbers, as typed.
 */
export function MealModal({ slot, editing, onSave, onClose }: { slot: HealthMealSlot; editing?: HealthMeal; onSave: (meal: HealthMeal) => void; onClose: () => void }) {
  const foods = useFoods();
  const upsert = useUpsertFood();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<HealthFood | null>(null);
  const [servings, setServings] = useState(1);
  const [custom, setCustom] = useState(editing !== undefined || false);
  const [form, setForm] = useState<Custom>({ name: editing?.name ?? '', kcal: editing?.kcal, proteinG: editing?.proteinG, carbsG: editing?.carbsG, fatG: editing?.fatG });
  const [saveFood, setSaveFood] = useState(false);

  const matches = (foods.data ?? []).filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const valid = form.name.trim() !== '' && form.kcal !== undefined;

  const submitCustom = () => {
    if (!valid) return;
    const meal: HealthMeal = {
      id: editing?.id ?? shortId('m'),
      slot: editing?.slot ?? slot,
      name: form.name.trim(),
      kcal: form.kcal!,
      servings: editing?.servings ?? 1,
      ...(form.proteinG === undefined ? {} : { proteinG: form.proteinG }),
      ...(form.carbsG === undefined ? {} : { carbsG: form.carbsG }),
      ...(form.fatG === undefined ? {} : { fatG: form.fatG }),
      ...(editing?.foodId === undefined ? {} : { foodId: editing.foodId }),
    };
    if (saveFood && editing === undefined) {
      upsert.mutate({ id: shortId('f'), name: meal.name, serving: '1 serving', kcal: meal.kcal, proteinG: meal.proteinG ?? 0, carbsG: meal.carbsG ?? 0, fatG: meal.fatG ?? 0 });
    }
    onSave(meal);
  };

  return (
    <FrameModal open onClose={onClose} title={editing ? 'Edit meal' : 'Add meal'} size="md" scope="window" testId="meal-modal">
      <div className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold">{editing ? 'Edit meal' : 'Add meal'}</h3>
        {picked ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {picked.name} <span className="opacity-60">· {picked.serving} · {picked.kcal} kcal</span>
            </p>
            <NumField label="Servings" value={servings} min={0.1} max={50} onCommit={(v) => setServings(v ?? 1)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={() => setPicked(null)}>
                Back
              </button>
              <button type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => onSave(mealFromFood(picked, slot, servings))}>
                Add
              </button>
            </div>
          </div>
        ) : custom ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Name
              <input
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Calories" unit="kcal" value={form.kcal} min={0} max={10000} integer onCommit={(v) => setForm({ ...form, kcal: v })} />
              <NumField label="Protein" unit="g" value={form.proteinG} min={0} max={1000} onCommit={(v) => setForm({ ...form, proteinG: v })} />
              <NumField label="Carbs" unit="g" value={form.carbsG} min={0} max={1000} onCommit={(v) => setForm({ ...form, carbsG: v })} />
              <NumField label="Fat" unit="g" value={form.fatG} min={0} max={1000} onCommit={(v) => setForm({ ...form, fatG: v })} />
            </div>
            {editing ? null : (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={saveFood} onChange={(e) => setSaveFood(e.target.checked)} />
                Save to my foods
              </label>
            )}
            <div className="flex justify-end gap-2">
              {editing ? null : (
                <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={() => setCustom(false)}>
                  Back
                </button>
              )}
              <button type="button" disabled={!valid} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40" onClick={submitCustom}>
                {editing ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              aria-label="Search foods"
              placeholder="Search your foods"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            {matches.length === 0 ? <p className="text-xs opacity-70">{(foods.data ?? []).length === 0 ? 'No saved foods yet.' : 'No match.'}</p> : null}
            <ul className="flex flex-col">
              {matches.map((f) => (
                <li key={f.id}>
                  <button type="button" className="flex w-full justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent" onClick={() => setPicked(f)}>
                    <span>{f.name}</span>
                    <span className="opacity-60">
                      {f.serving} · {f.kcal} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="self-start rounded px-2 py-1 text-xs font-medium hover:bg-accent" onClick={() => setCustom(true)}>
              Custom entry
            </button>
          </div>
        )}
      </div>
    </FrameModal>
  );
}
