import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  isFeatureOn,
  setFeatureEnabled,
  StudioFeaturesPrefsSchema,
  type FeatureToggleId,
  type StudioFeaturesPrefs,
} from '@midnite/studio-shared';

import { registerSuitePrefsStore, suitePrefsStorage } from './suite-prefs-storage';

/**
 * Which of Studio's features are switched off (Phase 135) — the `studioFeatures` suite-prefs group, so main
 * reads the same file at boot and hears every change. Everything is on until something is switched off.
 */
export type FeatureTogglesState = {
  disabled: FeatureToggleId[];
  /** Switch one feature, applying its dependencies (`setFeatureEnabled`). */
  setEnabled: (id: FeatureToggleId, on: boolean) => void;
};

export const useFeatureTogglesStore = create<FeatureTogglesState>()(
  persist(
    (set) => ({
      disabled: [],
      setEnabled: (id, on) => set((state) => ({ disabled: setFeatureEnabled(state.disabled, id, on) })),
    }),
    {
      name: 'midnite.studio-features',
      version: 1,
      storage: suitePrefsStorage<StudioFeaturesPrefs>('studioFeatures', 1),
      partialize: (state): StudioFeaturesPrefs => ({ disabled: state.disabled }),
      // Schema-checked: unknown ids drop and a corrupt payload reads as "everything on", never as "off".
      merge: (persisted, current) => {
        const parsed = StudioFeaturesPrefsSchema.safeParse(persisted ?? {});
        return { ...current, disabled: parsed.success ? parsed.data.disabled : current.disabled };
      },
    },
  ),
);

registerSuitePrefsStore('studioFeatures', useFeatureTogglesStore);

/** The switched-off features — what the rail, palette, chords and settings filter on. */
export function useDisabledFeatures(): readonly FeatureToggleId[] {
  return useFeatureTogglesStore((state) => state.disabled);
}

export function useFeatureOn(id: FeatureToggleId): boolean {
  return useFeatureTogglesStore((state) => isFeatureOn(state.disabled, id));
}
