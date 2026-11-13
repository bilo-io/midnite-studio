import { useState } from 'react';

import { LevelDialog } from './level-dialog';
import { buildBlankLevel, sceneDefaults, validateSceneName } from './new-scene-model';
import { useGameManifest, useLevels, useSaveLevel, useSetLevelsStart } from './use-levels';

/**
 * New scene (Phase 132 Theme D): a name, a size and a blank level in `levels/`, committed through `level-set`
 * with `create`. A game with no `levels` key yet also offers **Make this the start scene**, the explicit opt-in
 * of Decision 14 (it sets the manifest's `levels` key). A 3D game gets an 80 x 80 m plan with one spawn (Theme E).
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

  const values = size ?? { width: defaults.width, height: defaults.height, tilewidth: defaults.tilewidth, tileheight: defaults.tileheight };
  const nameError = name === '' ? null : validateSceneName(name, levels?.scenes.map((s) => s.scene) ?? []);
  const sizeOk = Object.values(values).every((v) => Number.isInteger(v) && v >= 1) && values.width <= 512 && values.height <= 512;
  const canCreate = sizeOk && name !== '' && nameError === null && !busy;
  const firstScene = manifest !== null && manifest.levels === undefined;

  const create = async () => {
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
        value={values[key]}
        onChange={(e) => setSize({ ...values, [key]: Number(e.target.value) })}
        className="w-full rounded border border-border bg-background px-1.5 py-1"
      />
    </label>
  );

  return (
    <LevelDialog title="New scene" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Name</span>
          <input autoFocus aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={nameError !== null} className="rounded border border-border bg-background px-1.5 py-1" />
          {nameError ? <span role="alert" className="text-red-500">{nameError}</span> : null}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {num('width', defaults.baseLayer === null ? 'Width (m)' : 'Width (tiles)')}
          {num('height', defaults.baseLayer === null ? 'Depth (m)' : 'Height (tiles)')}
          {defaults.baseLayer === null ? null : num('tilewidth', 'Tile width (px)')}
          {defaults.baseLayer === null ? null : num('tileheight', 'Tile height (px)')}
        </div>
        <p className="text-xs text-muted-foreground">
          {defaults.baseLayer === null
            ? 'Starts blank: an objects layer with one spawn, on a plan one metre a tile.'
            : `Starts blank: a ${defaults.baseLayer} layer, a collision layer and an objects layer with one spawn.`}
        </p>
        {firstScene ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={makeStart} onChange={(e) => setMakeStart(e.target.checked)} />
            Make this the start scene
          </label>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="rounded border border-border px-2.5 py-1 hover:bg-accent">Cancel</button>
        <button type="button" disabled={!canCreate} onClick={() => void create()} className="rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-40">
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </LevelDialog>
  );
}
