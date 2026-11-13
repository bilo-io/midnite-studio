import { useState } from 'react';

import { LevelDialog } from './level-dialog';
import { buildBlankLevel, sceneDefaults, validateSceneName } from './new-scene-model';
import { useGameManifest, useLevels, useSaveLevel, useSetLevelsStart } from './use-levels';

/**
 * New scene (Phase 132 Theme D): a name, a size and a blank level in `levels/`, committed through `level-set`
 * with `create`. A game with no `levels` key yet also offers **Make this the start scene**, the explicit opt-in
 * of Decision 14 (it sets the manifest's `levels` key). 3D scenes belong to Theme E, so a 3D game cannot make one here.
 */
export function NewSceneDialog({ gameId, onClose, onCreated }: { gameId: string; onClose: () => void; onCreated: (scene: string) => void }) {
  const manifest = useGameManifest(gameId).data ?? null;
  const levels = useLevels(gameId).data;
  const save = useSaveLevel();
  const setStart = useSetLevelsStart();
  const defaults = sceneDefaults(manifest?.perspective);
  const [name, setName] = useState('');
  const [size, setSize] = useState<{ width: number; height: number; tilewidth: number; tileheight: number } | null>(null);
  const [makeStart, setMakeStart] = useState(false);
  const [busy, setBusy] = useState(false);

  const values = size ?? (defaults ? { width: defaults.width, height: defaults.height, tilewidth: defaults.tilewidth, tileheight: defaults.tileheight } : null);
  const nameError = name === '' ? null : validateSceneName(name, levels?.scenes.map((s) => s.scene) ?? []);
  const sizeOk = values !== null && Object.values(values).every((v) => Number.isInteger(v) && v >= 1) && values.width <= 512 && values.height <= 512;
  const canCreate = defaults !== null && values !== null && sizeOk && name !== '' && nameError === null && !busy;
  const firstScene = manifest !== null && manifest.levels === undefined;

  const create = async () => {
    if (!defaults || !values) return;
    setBusy(true);
    try {
      const level = buildBlankLevel({ ...defaults, ...values });
      const result = await save.mutateAsync({ gameId, scene: name, level, create: true });
      if (!result.ok) return;
      if (firstScene && makeStart) await setStart.mutateAsync({ gameId, start: name });
      onCreated(name);
    } finally {
      setBusy(false);
    }
  };

  const num = (key: 'width' | 'height' | 'tilewidth' | 'tileheight', label: string) => (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        aria-label={label}
        value={values?.[key] ?? ''}
        disabled={!values}
        onChange={(e) => setSize({ ...values!, [key]: Number(e.target.value) })}
        className="w-full rounded border border-border bg-background px-1.5 py-1"
      />
    </label>
  );

  return (
    <LevelDialog title="New scene" onClose={onClose}>
      {defaults === null ? (
        <p className="text-xs text-muted-foreground">This is a 3D game. Its scenes are placed in the 3D editor, which is not available yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted-foreground">Name</span>
            <input autoFocus aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={nameError !== null} className="rounded border border-border bg-background px-1.5 py-1" />
            {nameError ? <span role="alert" className="text-red-500">{nameError}</span> : null}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {num('width', 'Width (tiles)')}
            {num('height', 'Height (tiles)')}
            {num('tilewidth', 'Tile width (px)')}
            {num('tileheight', 'Tile height (px)')}
          </div>
          <p className="text-xs text-muted-foreground">
            Starts blank: a {defaults.baseLayer} layer, a collision layer and an objects layer with one spawn.
          </p>
          {firstScene ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={makeStart} onChange={(e) => setMakeStart(e.target.checked)} />
              Make this the start scene
            </label>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="rounded border border-border px-2.5 py-1 hover:bg-accent">Cancel</button>
        <button type="button" disabled={!canCreate} onClick={() => void create()} className="rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-40">
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </LevelDialog>
  );
}
