import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_LEVEL_SNAP, sanitiseSnap, type LevelSnap } from '../level-snap';
import { DEFAULT_OPTIMISATION, presetFor, type OptimisationStep } from './optimisation';

export type LevelViewMode = 'plan' | '3d';
/** Where the group gizmo sits (Unity's Pivot / Center) and how it is oriented (Local / World). */
export type GizmoPivot = 'pivot' | 'centre';
export type GizmoSpace = 'local' | 'world';

type State = {
  /** Floorplan or 3D, per game (Phase 136 Theme E). A game nobody switched opens on Floorplan. */
  modeByGame: Record<string, LevelViewMode>;
  /** The Optimisation slider (Theme G), one setting for every game: it is about this machine, not the level. */
  optimisation: OptimisationStep;
  /** The FPS / draw-call / visible-object readout. */
  stats: boolean;
  /** Snap settings (Phase 137 Theme F), shared by the Floorplan and the 3D gizmo. */
  snap: LevelSnap;
  /** Phase 137 Theme D: the group gizmo's pivot and orientation. */
  pivot: GizmoPivot;
  space: GizmoSpace;
  setSnap: (snap: Partial<LevelSnap>) => void;
  setPivot: (pivot: GizmoPivot) => void;
  setSpace: (space: GizmoSpace) => void;
  setMode: (gameId: string, mode: LevelViewMode) => void;
  setOptimisation: (step: number) => void;
  toggleStats: () => void;
};

/** Persisted in the renderer (`midnite-studio.level-view`, listed in the Media toggle's data). Main never reads it. */
export const useLevelViewStore = create<State>()(
  persist(
    (set) => ({
      modeByGame: {},
      optimisation: DEFAULT_OPTIMISATION,
      stats: false,
      snap: DEFAULT_LEVEL_SNAP,
      pivot: 'pivot',
      space: 'world',
      setSnap: (snap) => set((s) => ({ snap: sanitiseSnap({ ...s.snap, ...snap }) })),
      setPivot: (pivot) => set({ pivot }),
      setSpace: (space) => set({ space }),
      setMode: (gameId, mode) => set((s) => ({ modeByGame: { ...s.modeByGame, [gameId]: mode } })),
      setOptimisation: (step) => set({ optimisation: presetFor(step).step }),
      toggleStats: () => set((s) => ({ stats: !s.stats })),
    }),
    {
      name: 'midnite-studio.level-view',
      version: 1,
      partialize: (s) => ({ modeByGame: s.modeByGame, optimisation: s.optimisation, stats: s.stats, snap: s.snap, pivot: s.pivot, space: s.space }),
      // A hand-edited or older payload never breaks the editor: anything unexpected falls back to the default.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const modes: Record<string, LevelViewMode> = {};
        if (p.modeByGame && typeof p.modeByGame === 'object') {
          for (const [id, mode] of Object.entries(p.modeByGame)) if (mode === 'plan' || mode === '3d') modes[id] = mode;
        }
        return { ...current, modeByGame: modes, optimisation: presetFor(typeof p.optimisation === 'number' ? p.optimisation : DEFAULT_OPTIMISATION).step, stats: p.stats === true, snap: sanitiseSnap(p.snap), pivot: p.pivot === 'centre' ? 'centre' : 'pivot', space: p.space === 'local' ? 'local' : 'world' };
      },
    },
  ),
);

export const levelViewMode = (state: Pick<State, 'modeByGame'>, gameId: string): LevelViewMode => state.modeByGame[gameId] ?? 'plan';
