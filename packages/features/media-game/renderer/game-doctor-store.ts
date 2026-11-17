import { create } from 'zustand';

/**
 * Phase 149 Theme G: a request to open the Doctor panel for a game. The row's dot, the row menu's Run doctor and
 * the Level editor's Open Doctor are in different columns of the tab; each sets the request and `GameTab`
 * consumes it once, selecting the game and showing the panel in the right column.
 */
type DoctorRequestState = {
  requested: string | null;
  request: (gameId: string) => void;
  clear: () => void;
};

export const useDoctorRequest = create<DoctorRequestState>((set) => ({
  requested: null,
  request: (gameId) => set({ requested: gameId }),
  clear: () => set({ requested: null }),
}));
