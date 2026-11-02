import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the store remembers about one panel. Either field is absent until the user first changes it. */
export type BottomPanelState = { size?: number; collapsed?: boolean };

type BottomPanelStore = {
  panels: Record<string, BottomPanelState>;
  setSize: (id: string, size: number) => void;
  setCollapsed: (id: string, collapsed: boolean) => void;
};

/**
 * The height and collapsed flag of every bottom panel (the game console, the model inspector, the
 * map layer list, the API history), keyed by a panel id the caller picks.
 *
 * One tiny slice for all of them rather than a field each on `ui-store`'s blob: the panels belong to
 * different features, which may not import each other (or Studio's store), and a panel that wants to
 * be resizable should cost its feature one id string. Plain `localStorage` — not the suite-prefs
 * file — because a panel's height is a per-window convenience, not a preference every app shares.
 * A panel with no entry yet falls back to the defaults its own call site passes, so adding one never
 * needs a migration.
 */
export const useBottomPanelStore = create<BottomPanelStore>()(
  persist(
    (set) => ({
      panels: {},
      setSize: (id, size) => set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], size } } })),
      setCollapsed: (id, collapsed) => set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], collapsed } } })),
    }),
    { name: 'midnite-studio:bottom-panels', version: 1, partialize: (s) => ({ panels: s.panels }) },
  ),
);
