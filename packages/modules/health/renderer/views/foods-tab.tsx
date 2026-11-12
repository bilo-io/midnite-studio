import { useState } from 'react';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';

import { FrameModal, useFrameChrome } from '@midnite/studio-frame';
import type { HealthFood } from '@midnite/studio-shared';

import { shortId } from '../data/ids';
import { useFoods, useRemoveFood, useUpsertFood } from '../data/use-health';
import { NumField } from './num-field';

function FoodModal({ food, onClose }: { food: HealthFood | null; onClose: () => void }) {
  const upsert = useUpsertFood();
  const [form, setForm] = useState({
    name: food?.name ?? '',
    serving: food?.serving ?? '1 serving',
    kcal: food?.kcal as number | undefined,
    proteinG: food?.proteinG as number | undefined,
    carbsG: food?.carbsG as number | undefined,
    fatG: food?.fatG as number | undefined,
  });
  const valid = form.name.trim() !== '' && form.kcal !== undefined;
  const text = (label: string, key: 'name' | 'serving', max: number) => (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input value={form[key]} maxLength={max} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring" />
    </label>
  );
  return (
    <FrameModal open onClose={onClose} title={food ? 'Edit food' : 'New food'} size="md" scope="window" testId="food-modal">
      <div className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold">{food ? 'Edit food' : 'New food'}</h3>
        {text('Name', 'name', 120)}
        {text('Serving', 'serving', 40)}
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Calories" unit="kcal" value={form.kcal} min={0} max={10000} integer onCommit={(v) => setForm({ ...form, kcal: v })} />
          <NumField label="Protein" unit="g" value={form.proteinG} min={0} max={1000} onCommit={(v) => setForm({ ...form, proteinG: v })} />
          <NumField label="Carbs" unit="g" value={form.carbsG} min={0} max={1000} onCommit={(v) => setForm({ ...form, carbsG: v })} />
          <NumField label="Fat" unit="g" value={form.fatG} min={0} max={1000} onCommit={(v) => setForm({ ...form, fatG: v })} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1.5 text-xs hover:bg-accent" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            onClick={() => {
              upsert.mutate({ id: food?.id ?? shortId('f'), name: form.name.trim(), serving: form.serving.trim(), kcal: form.kcal!, proteinG: form.proteinG ?? 0, carbsG: form.carbsG ?? 0, fatG: form.fatG ?? 0 });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </FrameModal>
  );
}

/** The saved-foods library: new, edit, delete. Logged meals copy their numbers, so deleting is safe. */
export function FoodsTab() {
  const foods = useFoods();
  const remove = useRemoveFood();
  const { IconButton, useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<HealthFood | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-3" data-testid="foods-tab">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Foods</h3>
        <button type="button" className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => setEditing('new')}>
          <LuPlus aria-hidden /> New food
        </button>
      </div>
      {(foods.data ?? []).length === 0 ? (
        <p className="text-xs opacity-70">No saved foods yet. Save one from a custom entry, or add it here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {(foods.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span>
                {f.name} <span className="opacity-60">· {f.serving}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="opacity-70">
                  {f.kcal} kcal · P {f.proteinG} C {f.carbsG} F {f.fatG}
                </span>
                <IconButton icon={LuPencil} label={`Edit ${f.name}`} onClick={() => setEditing(f)} />
                <IconButton
                  icon={LuTrash2}
                  label={`Delete ${f.name}`}
                  onClick={() =>
                    dialogs.confirm({
                      title: `Delete '${f.name}'?`,
                      body: 'Meals already logged keep their numbers.',
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => {
                        remove.mutate(f.id);
                        dialogs.close();
                      },
                    })
                  }
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing ? <FoodModal food={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
