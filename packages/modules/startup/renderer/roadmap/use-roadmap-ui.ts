import { create } from 'zustand';

export type RoadmapMode = 'list' | 'timeline';

const KEY = 'midnite-startup.roadmap.mode';

function load(): RoadmapMode {
  try {
    return localStorage.getItem(KEY) === 'timeline' ? 'timeline' : 'list';
  } catch {
    return 'list';
  }
}

type RoadmapUi = { mode: RoadmapMode; setMode: (mode: RoadmapMode) => void };

/** The roadmap's List | Timeline switch, remembered per viewer. Storage may be missing or blocked; the default is List. */
export const useRoadmapUi = create<RoadmapUi>((set) => ({
  mode: load(),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // Private window or blocked storage: the switch still works for this session.
    }
    set({ mode });
  },
}));
