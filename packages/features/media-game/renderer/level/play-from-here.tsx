import { useRef, useState } from 'react';
import { LuPlay } from 'react-icons/lu';

import { levelEntityToWorld, levelPixelsToWorld } from '@midnite/studio-shared';
import { bridge, RingSpinner, useToastStore } from '@midnite/studio-frame';

import { useGameRunStore } from '../game-run-store';
import { findObject, isLevel3d, serialise, type EditLevel, type EditState, type LevelObject, type PlanPoint } from './level-edit-model';

/** Where Play from here starts, in the kit's `midnite-spawn` shape: 2D `{x, y}` px; 3D `{x, y}` = x,z or `{x, y, z}` = x,height,z metres. */
export type PlaySpawn = { x: number; y: number; z?: number };

/**
 * The start point (Phase 140 Theme B): the primary selected object's position, else where the pointer last was
 * over the plan, else `null` (the scene's own `spawn`). A 3D level answers in metres through
 * `levelEntityToWorld` — the placement the kit builds — and drops a missing elevation so the kit grounds the player.
 */
export function playSpawn(level: EditLevel, selected: LevelObject | null, pointer: PlanPoint | null): PlaySpawn | null {
  if (selected) {
    if (isLevel3d(level)) {
      const [x, elevation, z] = levelEntityToWorld(selected, level).position;
      return elevation === null ? { x, y: z } : { x, y: elevation, z };
    }
    const w = selected.width ?? 0;
    const h = selected.height ?? 0;
    return { x: selected.x + w / 2, y: selected.y + h / 2 };
  }
  if (!pointer) return null;
  if (isLevel3d(level)) {
    const [x, y] = levelPixelsToWorld(level, pointer.x, pointer.y);
    return { x, y };
  }
  return { x: pointer.x, y: pointer.y };
}

type Options = {
  gameId: string;
  scene: string;
  /** Read at the moment of the press: the editor's current, unsaved state. */
  getState: () => EditState;
  getPointer: () => PlanPoint | null;
  readOnly: boolean;
  /** The run started (or restarted): the host shows the Run tab, unless the runner is popped out. */
  onStarted?: (started: Promise<string | null>) => void;
};

/**
 * Play from here's behaviour, shared by the toolbar button and the `F5` / `Shift+F5` keys (Phase 140 Theme B):
 * send the unsaved level to the runner's in-memory overlay and start (or restart) the game there. No commit.
 */
export function usePlayFromHere({ gameId, scene, getState, getPointer, readOnly, onStarted }: Options) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const play = async (): Promise<void> => {
    if (readOnly || busy.current) return;
    const api = bridge();
    if (!api) return;
    busy.current = true;
    setPending(true);
    try {
      const state = getState();
      const selected = findObject(state.level, state.selection) ?? null;
      const result = await api.games.levels.preview({
        gameId,
        scene,
        level: serialise(state),
        spawn: playSpawn(state.level, selected, getPointer()),
      });
      if (!result.ok) {
        useToastStore.getState().addToast({ message: result.kind === 'error' ? result.message : 'Could not play the level.', status: 'error' });
        return;
      }
      const popped = useGameRunStore.getState().popped === gameId;
      if (!popped) onStarted?.(Promise.resolve(null));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const stop = (): void => {
    void bridge()?.games.stop({ gameId });
  };

  return { play, stop, pending };
}

/** The toolbar button: the Games Run button's gradient treatment, a spinner while the run starts. */
export function PlayFromHereButton({ pending, disabled, onClick }: { pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Play from here"
      title="Play the unsaved level from the selection (F5)"
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      onClick={onClick}
      className="gradient-border gradient-border--always gradient-border--hover flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold motion-safe:transition-shadow disabled:opacity-50"
    >
      {pending ? <RingSpinner size="xs" tone="inherit" label="Starting" /> : <LuPlay aria-hidden className="h-3.5 w-3.5" />}
      Play from here
    </button>
  );
}
