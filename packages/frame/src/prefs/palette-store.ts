import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_THEME_PALETTE_ID as DEFAULT_PALETTE_ID } from '@midnite/studio-shared';

import { sharedSettingsStorage } from './shared-settings-storage';
import { registerSuitePrefsStore, suitePrefsStorage } from './suite-prefs-storage';

/** A user palette needs an id to be replaced by; its full shape is the app's (`StudioPalette`). */
type WithId = { id: string };

export type PaletteState<StudioPalette extends WithId = WithId> = {
  activePaletteId: string;
  /** `null` = "match app" — the terminal follows the active palette. */
  terminalPaletteOverride: string | null;
  /** `null` = "match app" — the editor follows the active palette. */
  editorPaletteOverride: string | null;
  userPalettes: StudioPalette[];

  setActivePalette: (id: string) => void;
  setTerminalOverride: (id: string | null) => void;
  setEditorOverride: (id: string | null) => void;
  addUserPalette: (palette: StudioPalette) => void;
};

type PersistedPaletteState<P extends WithId> = Pick<
  PaletteState<P>,
  'activePaletteId' | 'terminalPaletteOverride' | 'editorPaletteOverride' | 'userPalettes'
>;

/**
 * Its own store beside `appearance-store.ts` rather than a slice of
 * `ui-store` (Decision 10) — `ui-store` is ~60 unrelated session/layout keys
 * at `version: 8`; this is the same *class* of state `appearance-store`
 * already holds (accent, motion, density, …), so it persists into that
 * store's own localStorage key, `midnite.settings`, via `sharedSettingsStorage`
 * rather than a second key or a slice of a 61-key store.
 */
export function createPaletteStore<StudioPalette extends WithId>() {
  const store = create<PaletteState<StudioPalette>>()(
    persist(
      (set) => ({
        activePaletteId: DEFAULT_PALETTE_ID,
        terminalPaletteOverride: null,
        editorPaletteOverride: null,
        userPalettes: [],

        setActivePalette: (activePaletteId) => set({ activePaletteId }),
        setTerminalOverride: (terminalPaletteOverride) => set({ terminalPaletteOverride }),
        setEditorOverride: (editorPaletteOverride) => set({ editorPaletteOverride }),
        // Replaces (rather than duplicates) an existing palette with the same
        // id — the VS Code importer (Theme E) derives an id from the theme's
        // `name`, so re-importing an edited copy of the same file is the
        // expected path, not an edge case. Appending unconditionally would
        // leave two `userPalettes` entries with one id: a duplicate React key
        // on the settings page's preset-card list (Theme F) and an ambiguous
        // `resolvePaletteById` lookup (`.find` silently keeps the first).
        addUserPalette: (palette) =>
          set((state) => ({
            userPalettes: [...state.userPalettes.filter((p) => p.id !== palette.id), palette],
          })),
      }),
      {
        name: 'midnite.settings',
        version: 2,
        storage: suitePrefsStorage('palette', 2, sharedSettingsStorage('midnite.settings')),
        partialize: (state): PersistedPaletteState<StudioPalette> => ({
          activePaletteId: state.activePaletteId,
          terminalPaletteOverride: state.terminalPaletteOverride,
          editorPaletteOverride: state.editorPaletteOverride,
          userPalettes: state.userPalettes,
        }),
        /**
         * A pre-Phase-64 profile has none of these fields — `version: 1` never
         * held them — so every arm is seeded from scratch rather than gated on
         * `version < 2`: there is no earlier shape of THIS store's own data to
         * migrate away from, only absence.
         */
        migrate: (persisted): PersistedPaletteState<StudioPalette> => {
          const saved = (persisted ?? {}) as Partial<PersistedPaletteState<StudioPalette>>;
          return {
            activePaletteId: saved.activePaletteId ?? DEFAULT_PALETTE_ID,
            terminalPaletteOverride: saved.terminalPaletteOverride ?? null,
            editorPaletteOverride: saved.editorPaletteOverride ?? null,
            userPalettes: saved.userPalettes ?? [],
          };
        },
      },
    ),
  );
  registerSuitePrefsStore('palette', store);
  return store;
}
