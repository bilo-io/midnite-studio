import { create } from 'zustand';

import { DEFAULT_ACTIVITY_PALETTE_ID } from '@midnite/studio-shared';

/**
 * The active Activity preset id — Theme A's own wiring point for Theme C's
 * `useActivityGlow` consumers and for `useActivityPaletteSync` below.
 *
 * Deliberately **not** persisted yet. `Settings ▸ Activity` (Theme B) is
 * what gives a user any way to change this, and that theme's own checklist
 * is explicit that its persistence rides `appearance-store.ts`'s
 * `'midnite.settings'` store via `sharedSettingsStorage` — the same
 * `zustand/middleware persist` shape `palette-store.ts` already uses, with
 * its own migration story. Building that persistence here, before there is
 * any UI to exercise it or any prior-shape data to migrate away from, would
 * just be Theme B's work done twice. In-memory state is enough for Theme A:
 * every consumer reads the resolved Brand preset either way, since Brand is
 * `DEFAULT_ACTIVITY_PALETTE_ID` and nothing yet calls `setActivePaletteId`.
 */
export type ActivityPaletteState = {
  activePaletteId: string;
  setActivePaletteId: (id: string) => void;
};

export const useActivityPaletteStore = create<ActivityPaletteState>()((set) => ({
  activePaletteId: DEFAULT_ACTIVITY_PALETTE_ID,
  setActivePaletteId: (activePaletteId) => set({ activePaletteId }),
}));
