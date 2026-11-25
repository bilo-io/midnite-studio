import { useMemo, useState } from 'react';

import { bridge } from '@midnite/studio-frame';

import { LevelDialog } from './level-dialog';
import type { EditLevel } from './level-edit-model';
import { buildBlankLevel, rewriteTilesetImages, sceneDefaults, validateSceneName } from './new-scene-model';
import { useGameManifest, useLevels, useSaveLevel, useSetLevelsStart } from './use-levels';

/**
 * New scene (Phase 132 Theme D): a name, a size and a blank level (or a copy of an imported `map` asset) in
 * `levels/`, committed through `level-set` with `create`. A game with no `levels` key yet also offers
 * **Make this the start scene**, the explicit opt-in of Decision 14 (it sets the manifest's `levels` key).
 * A 3D game gets an 80 x 80 m plan with one spawn (Theme E).
 */
export function NewSceneDialog({ gameId, onClose, onCreated }: { gameId: string; onClose: () => void; onCreated: (scene: string) => void }) {
  const manifest = useGameManifest(gameId).data ?? null;
  const levels = useLevels(gameId).data;
  const save = useSaveLevel();
  const setStart = useSetLevelsStart();
  const defaults = sceneDefaults(manifest?.perspective);
  const mapAssets = useMemo(() => (manifest?.assets ?? []).filter((a) => a.kind === 'map').map((a) => a.name), [manifest]);
  const [name, setName] = useState('');
  const [startFrom, setStartFrom] = useState<'blank' | 'map'>('blank');
  const [mapAsset, setMapAsset] = useState('');
  const [size, setSize] = useState<{ width: number; height: number; tilewidth: number; tileheight: number } | null>(null);
  const [makeStart, setMakeStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMap = mapAssets.includes(mapAsset) ? mapAsset : (mapAssets[0] ?? '');
  const usingMap = startFrom === 'map' && mapAssets.length > 0;
  const values = size ?? { width: defaults.width, height: defaults.height, tilewidth: defaults.tilewidth, tileheight: defaults.tileheight };
  const nameError = name === '' ? null : validateSceneName(name, levels?.scenes.map((s) => s.scene) ?? []);
  const sizeOk = Object.values(values).every((v) => Number.isInteger(v) && v >= 1) && values.width <= 512 && values.height <= 512;
  const canCreate = (usingMap ? selectedMap !== '' : sizeOk) && name !== '' && nameError === null && !busy;
  const firstScene = manifest !== null && manifest.levels === undefined;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      let level: EditLevel;
      if (usingMap) {
        const read = await bridge()?.games.levels.mapAsset({ gameId, assetName: selectedMap });
        if (!read) {
          setError('The app bridge is not available.');
          return;
        }
        if (!read.ok) {
          setError(read.kind === 'error' ? read.message : 'That map asset could not be read.');
          return;
        }
        if (read.value.level === null || read.value.issues.length > 0) {
          setError(read.value.issues[0]?.message ?? `Map asset "${selectedMap}" is not a valid level.`);
          return;
        }
        level = rewriteTilesetImages(read.value.level as EditLevel, selectedMap);
      } else {
        level = buildBlankLevel({ ...defaults, ...values });
      }
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
        {mapAssets.length > 0 ? (
          <fieldset className="flex flex-col gap-1.5 text-xs">
            <legend className="text-muted-foreground">Start from</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="start-from" checked={startFrom === 'blank'} onChange={() => { setStartFrom('blank'); setError(null); }} />
                Blank
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="start-from" checked={startFrom === 'map'} onChange={() => { setStartFrom('map'); setError(null); }} />
                Map asset
              </label>
            </div>
          </fieldset>
        ) : null}
        {usingMap ? (
          <>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-muted-foreground">Map asset</span>
              <select
                aria-label="Map asset"
                value={selectedMap}
                onChange={(e) => { setMapAsset(e.target.value); setError(null); }}
                className="rounded border border-border bg-background px-1.5 py-1"
              >
                {mapAssets.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Copies <code className="font-mono">assets/map/{selectedMap}/map.tmj</code> into <code className="font-mono">levels/</code> with its tileset paths rewritten.
            </p>
          </>
        ) : (
          <>
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
          </>
        )}
        {firstScene ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={makeStart} onChange={(e) => setMakeStart(e.target.checked)} />
            Make this the start scene
          </label>
        ) : null}
        {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
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
