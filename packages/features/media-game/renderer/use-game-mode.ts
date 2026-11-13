import { useCallback, useRef, useState } from 'react';

import { bridge } from '@midnite/studio-frame';

import { useGameRunStore } from './game-run-store';

/** The centre panel's two tabs (Phase 132 Theme B). */
export type GameMode = 'editor' | 'play';

/**
 * Which centre tab each game shows, and the pause policy that goes with leaving Play (Decision 10).
 *
 * - A game's mode is session state, never persisted; a game nobody has touched is on `editor`.
 * - Leaving Play pauses a run **only** when this window's Play button started it, it is `running`, it is not
 *   popped out and `pauseWhenEditing` is on. Returning resumes only a run this hook paused itself, so a run the
 *   user paused by hand stays paused, and a run an agent started is never touched.
 */
export function useGameMode(pauseWhenEditing: boolean) {
  const [modes, setModes] = useState<ReadonlyMap<string, GameMode>>(() => new Map());
  /** gameId -> the runId the Play button started. */
  const startedByPlay = useRef(new Map<string, string>());
  /** gameId -> the runId this hook paused. */
  const autoPaused = useRef(new Map<string, string>());

  const modeOf = useCallback((gameId: string | null): GameMode => (gameId ? (modes.get(gameId) ?? 'editor') : 'editor'), [modes]);

  const toolbar = (gameId: string, action: 'pause' | 'resume') => {
    void bridge()?.games.toolbar({ gameId, action });
  };

  const setMode = useCallback(
    (gameId: string, next: GameMode) => {
      const prev = modes.get(gameId) ?? 'editor';
      if (prev !== next) {
        const { runs, popped } = useGameRunStore.getState();
        const info = runs[gameId];
        if (prev === 'play' && next === 'editor') {
          if (
            pauseWhenEditing &&
            info?.state === 'running' &&
            popped !== gameId &&
            startedByPlay.current.get(gameId) === info.runId
          ) {
            autoPaused.current.set(gameId, info.runId);
            toolbar(gameId, 'pause');
          }
        } else if (next === 'play') {
          const pausedRun = autoPaused.current.get(gameId);
          autoPaused.current.delete(gameId);
          if (pausedRun !== undefined && info?.state === 'paused' && info.runId === pausedRun) toolbar(gameId, 'resume');
        }
      }
      setModes((current) => new Map(current).set(gameId, next));
    },
    [modes, pauseWhenEditing],
  );

  /**
   * The Play button's hook: show Play. `started` resolves to the run id when the button itself started a run, so
   * the pause policy can tell it from a run an agent or play-test started.
   */
  const onPlay = useCallback(
    (gameId: string, started?: Promise<string | null>) => {
      if (started) {
        void started.then((runId) => {
          if (runId) startedByPlay.current.set(gameId, runId);
        });
      }
      setMode(gameId, 'play');
    },
    [setMode],
  );

  return { modeOf, setMode, onPlay };
}
