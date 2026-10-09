import type { GameJuicePatch } from '@midnite/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The juice settings the user chose per game (the runner toolbar's Juice popover).
 *
 * Persisted in the renderer, keyed by game id, and re-applied through the game's
 * `window.__midnite.juice` hook each time a run starts. Only what the user changed is
 * stored (a patch), so a kit upgrade that moves a default reaches games nobody touched.
 */
type State = {
  byGame: Record<string, GameJuicePatch>;
  /** Merge `patch` over what is stored for the game. */
  setPatch: (gameId: string, patch: GameJuicePatch) => void;
  /** Forget the game's overrides. */
  reset: (gameId: string) => void;
};

export const useGameJuiceStore = create<State>()(
  persist(
    (set) => ({
      byGame: {},
      setPatch: (gameId, patch) =>
        set((current) => ({ byGame: { ...current.byGame, [gameId]: { ...current.byGame[gameId], ...patch } } })),
      reset: (gameId) =>
        set((current) => {
          const { [gameId]: _dropped, ...rest } = current.byGame;
          return { byGame: rest };
        }),
    }),
    { name: 'midnite-studio.game-juice', version: 1, partialize: (state) => ({ byGame: state.byGame }) },
  ),
);
