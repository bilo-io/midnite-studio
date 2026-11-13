import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useNotify } from '../chrome';
import { LevelDialog } from './level-dialog';
import { useLevelStore } from './level-store';
import { NewSceneDialog } from './new-scene-dialog';
import { fetchLevel, useGotoScene, useLevels, useSaveOpenLevel } from './use-levels';

const NEW = '__new__';

/**
 * The scene picker (Phase 132 Theme D, Decision 9), in the centre tab strip so it shows on both tabs. Picking a
 * scene opens its level in the editor **and** jumps the running game to it; a dirty level asks first. It shows
 * the level the *editor* has open, and does not follow the game when the game moves by itself.
 */
export function ScenePicker({ gameId }: { gameId: string | null }) {
  const client = useQueryClient();
  const notify = useNotify();
  const levels = useLevels(gameId);
  const goto = useGotoScene();
  const save = useSaveOpenLevel(gameId);
  const open = useLevelStore((s) => (gameId ? s.byGame[gameId] : undefined));
  const newSceneFor = useLevelStore((s) => s.newSceneFor);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const scenes = levels.data?.scenes ?? [];
  const start = levels.data?.start ?? null;

  const flash = (text: string) => {
    setNotice(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 4000);
  };

  /** Open the level in the editor; `jump` also moves the running game there. */
  const openScene = async (scene: string, jump: boolean) => {
    if (!gameId) return;
    try {
      useLevelStore.getState().open(gameId, scene, await fetchLevel(client, gameId, scene));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The level could not be opened.', { danger: true });
      return;
    }
    if (!jump) return;
    const result = await goto.mutateAsync({ gameId, scene });
    if (result.ok && result.value.via === 'next-run') flash(`The next run starts at ${scene}.`);
  };

  const request = (scene: string) => {
    if (open?.edit.dirty) setPending(scene);
    else void openScene(scene, true);
  };

  const resolve = async (choice: 'save' | 'discard' | 'cancel') => {
    const scene = pending;
    setPending(null);
    if (!scene || choice === 'cancel') return;
    if (choice === 'save' && !(await save())) return;
    await openScene(scene, true);
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {notice ? <span role="status" className="text-muted-foreground">{notice}</span> : null}
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Scene</span>
        <select
          aria-label="Scene"
          disabled={!gameId}
          value={open?.scene ?? ''}
          onChange={(e) => {
            if (e.target.value === NEW) {
              if (gameId) useLevelStore.getState().openNewScene(gameId);
            } else if (e.target.value) request(e.target.value);
          }}
          className="rounded border border-border bg-background px-1.5 py-0.5"
        >
          {open ? null : <option value="" disabled>{scenes.length ? 'Pick a scene' : 'No scenes'}</option>}
          {scenes.map((s) => (
            <option key={s.scene} value={s.scene}>
              {s.scene}{s.scene === start ? ' (start)' : ''}
            </option>
          ))}
          <option value={NEW}>New scene…</option>
        </select>
      </label>
      {pending && open ? (
        <LevelDialog title={`Save changes to ${open.scene}?`} onClose={() => void resolve('cancel')}>
          <p className="text-xs text-muted-foreground">Opening {pending} would discard your unsaved edits.</p>
          <div className="mt-4 flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => void resolve('cancel')} className="rounded border border-border px-2.5 py-1 hover:bg-accent">Cancel</button>
            <button type="button" onClick={() => void resolve('discard')} className="rounded border border-border px-2.5 py-1 hover:bg-accent">Discard</button>
            <button type="button" onClick={() => void resolve('save')} className="rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground">Save</button>
          </div>
        </LevelDialog>
      ) : null}
      {gameId && newSceneFor === gameId ? (
        <NewSceneDialog gameId={gameId} onClose={() => useLevelStore.getState().closeNewScene()} onCreated={(scene) => { useLevelStore.getState().closeNewScene(); void openScene(scene, false); }} />
      ) : null}
    </div>
  );
}
