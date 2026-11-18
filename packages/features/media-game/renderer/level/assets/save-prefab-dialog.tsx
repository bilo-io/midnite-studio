import { useState } from 'react';

import { GamePrefabNameSchema } from '@midnite/studio-shared';

import { LevelDialog } from '../level-dialog';

/** The live validation of a prefab name: `null` when it is acceptable. An existing name is a replace, which the dialog says. */
export function validatePrefabName(name: string): string | null {
  if (name === '') return null;
  const parsed = GamePrefabNameSchema.safeParse(name);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'That is not a valid name.');
}

/**
 * Save selection as prefab (Phase 139 Theme G): a name, prefilled from the first selected object, validated as you
 * type by `GamePrefabNameSchema`. A name that is already a prefab is replaced, and the dialog says so.
 */
export function SavePrefabDialog({
  initialName,
  existing,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialName: string;
  existing: readonly string[];
  busy?: boolean;
  error?: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const problem = validatePrefabName(name);
  const canSave = name !== '' && problem === null && !busy;
  return (
    <LevelDialog title="Save as prefab" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(name);
        }}
      >
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Name</span>
          <input autoFocus aria-label="Prefab name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={problem !== null} className="rounded border border-border bg-background px-1.5 py-1" />
          {problem ? <span role="alert" className="text-red-500">{problem}</span> : null}
          {!problem && existing.includes(name) ? <span className="text-muted-foreground">A prefab named “{name}” exists and will be replaced.</span> : null}
        </label>
        <p className="text-xs text-muted-foreground">The selected objects are saved as <code className="font-mono">levels/prefabs/{name || 'name'}.prefab.json</code> and become one instance of it.</p>
        {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-2.5 py-1 text-xs hover:bg-accent">Cancel</button>
          <button type="submit" disabled={!canSave} className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </LevelDialog>
  );
}
