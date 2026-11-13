import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  defaultFeatureFlags,
  FeatureFlagsPrefsSchema,
  type FeatureFlagId,
  type FeatureFlagsPrefs,
} from '@midnite/studio-shared';

import { registerSuitePrefsStore, suitePrefsStorage } from './suite-prefs-storage';

/**
 * Feature flags (Phase 134 Theme D), on the suite-prefs file's `featureFlags`
 * group, so a flag turned on in Studio's Settings is on in Agents too. The
 * table of flags and their defaults is `shared/src/feature-flags.ts`; this is
 * only where their values live.
 */
export type FeatureFlagsState = {
  flags: FeatureFlagsPrefs;
  setFlag: (id: FeatureFlagId, on: boolean) => void;
};

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
  persist(
    (set) => ({
      flags: defaultFeatureFlags(),
      setFlag: (id, on) => set((state) => ({ flags: { ...state.flags, [id]: on } })),
    }),
    {
      name: 'midnite.feature-flags',
      version: 1,
      storage: suitePrefsStorage<FeatureFlagsPrefs>('featureFlags', 1),
      // The group on disk is the flags record itself, not `{ flags }`.
      partialize: (state): FeatureFlagsPrefs => state.flags,
      // Field-wise and schema-checked: a payload from before a flag existed gains its default,
      // and a corrupt value falls back rather than reading as "on".
      merge: (persisted, current) => {
        const parsed = FeatureFlagsPrefsSchema.safeParse(persisted ?? {});
        return { ...current, flags: parsed.success ? parsed.data : current.flags };
      },
    },
  ),
);

registerSuitePrefsStore('featureFlags', useFeatureFlagsStore);

/** Whether a flag is on. A hook. */
export function useFeatureFlag(id: FeatureFlagId): boolean {
  return useFeatureFlagsStore((state) => state.flags[id]);
}
