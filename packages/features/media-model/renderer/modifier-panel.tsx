import { MODEL_MODIFIER_TYPES, type ModelModifier, type ModelPart } from '@midnite/studio-shared';
import type { Dispatch } from 'react';
import { LuArrowDown, LuArrowUp, LuEye, LuEyeOff, LuX } from 'react-icons/lu';

import type { EditorAction } from './editor-state';
import { NumberField, SelectField, VecRow } from './fields';
import { defaultModifier, MODIFIER_LABELS } from './spec-edit';

type Field =
  | { key: string; label: string; kind: 'number'; step: number; min?: number; max?: number; integer?: boolean }
  | { key: string; label: string; kind: 'axis' }
  | { key: string; label: string; kind: 'vec3' };

/** The editable fields of each modifier (mirrors `ModelModifierSchema`; a test checks the defaults validate). */
export const MODIFIER_FIELDS: Record<ModelModifier['type'], Field[]> = {
  bevel: [{ key: 'amount', label: 'Amount', kind: 'number', step: 0.01, min: 0.001 }],
  subdivide: [{ key: 'levels', label: 'Levels', kind: 'number', step: 1, min: 1, max: 3, integer: true }],
  mirror: [
    { key: 'axis', label: 'Axis', kind: 'axis' },
    { key: 'offset', label: 'Offset', kind: 'number', step: 0.05 },
  ],
  array: [
    { key: 'count', label: 'Count', kind: 'number', step: 1, min: 2, max: 64, integer: true },
    { key: 'offset', label: 'Offset', kind: 'vec3' },
  ],
  radialArray: [
    { key: 'count', label: 'Count', kind: 'number', step: 1, min: 2, max: 64, integer: true },
    { key: 'axis', label: 'Axis', kind: 'axis' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.05, min: 0 },
  ],
  twist: [
    { key: 'angle', label: 'Angle °', kind: 'number', step: 5 },
    { key: 'axis', label: 'Axis', kind: 'axis' },
  ],
  taper: [
    { key: 'amount', label: 'Far end ×', kind: 'number', step: 0.05, min: 0, max: 8 },
    { key: 'axis', label: 'Axis', kind: 'axis' },
  ],
  bend: [
    { key: 'angle', label: 'Angle °', kind: 'number', step: 5, min: -340, max: 340 },
    { key: 'axis', label: 'Axis', kind: 'axis' },
  ],
};

const AXES = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
] as const;

/** The part's modifier stack, applied top to bottom: add, reorder, toggle, edit, remove. */
export function ModifierPanel({ part, index, dispatch }: { part: ModelPart; index: number; dispatch: Dispatch<EditorAction> }) {
  const stack = part.modifiers ?? [];
  const edit = (edit: Parameters<typeof dispatchEdit>[1]) => dispatchEdit(dispatch, edit, index);
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Modifiers">
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Add
        <select
          aria-label="Add modifier"
          value=""
          onChange={(event) => {
            const type = event.target.value as ModelModifier['type'];
            if (type) dispatch({ type: 'addModifier', index, modifier: defaultModifier(type) });
          }}
          className="h-6 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
        >
          <option value="">Choose a modifier…</option>
          {MODEL_MODIFIER_TYPES.map((type) => (
            <option key={type} value={type}>
              {MODIFIER_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      {stack.length === 0 ? <p className="text-[11px] text-muted-foreground">No modifiers. They run in order on the part's own mesh before its transform.</p> : null}
      <ol className="flex flex-col gap-1.5">
        {stack.map((modifier, at) => (
          <li key={at} className={`rounded-md border border-border/70 p-1.5 ${modifier.enabled === false ? 'opacity-60' : ''}`}>
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground">
              <span className="flex-1">
                {at + 1}. {MODIFIER_LABELS[modifier.type]}
              </span>
              <MiniButton label="Move up" disabled={at === 0} onClick={() => edit({ kind: 'move', at, to: at - 1 })} icon={LuArrowUp} />
              <MiniButton label="Move down" disabled={at === stack.length - 1} onClick={() => edit({ kind: 'move', at, to: at + 1 })} icon={LuArrowDown} />
              <MiniButton
                label={modifier.enabled === false ? 'Enable modifier' : 'Disable modifier'}
                onClick={() => edit({ kind: 'toggle', at })}
                icon={modifier.enabled === false ? LuEyeOff : LuEye}
              />
              <MiniButton label="Remove modifier" onClick={() => edit({ kind: 'remove', at })} icon={LuX} />
            </div>
            <div className="flex flex-col gap-1">
              {MODIFIER_FIELDS[modifier.type].map((field) => {
                const value = (modifier as Record<string, unknown>)[field.key];
                const label = `${MODIFIER_LABELS[modifier.type]} ${field.label}`;
                const patch = (v: unknown) => edit({ kind: 'update', at, patch: { [field.key]: v } });
                if (field.kind === 'axis') {
                  return <SelectField key={field.key} label={label} value={(value as 'x' | 'y' | 'z') ?? 'y'} options={AXES} onChange={patch} />;
                }
                if (field.kind === 'vec3') return <VecRow key={field.key} label={label} value={value as number[]} step={0.1} onCommit={patch} />;
                return (
                  <label key={field.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-16 shrink-0">{field.label}</span>
                    <NumberField
                      label={label}
                      value={value as number}
                      step={field.step}
                      {...(field.min !== undefined ? { min: field.min } : {})}
                      {...(field.max !== undefined ? { max: field.max } : {})}
                      {...(field.integer ? { integer: true } : {})}
                      onCommit={(v) => v !== undefined && patch(v)}
                    />
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function dispatchEdit(
  dispatch: Dispatch<EditorAction>,
  edit: Extract<EditorAction, { type: 'modifier' }>['edit'],
  index: number,
): void {
  dispatch({ type: 'modifier', index, edit });
}

function MiniButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof LuX; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon aria-hidden className="h-3 w-3" />
    </button>
  );
}
