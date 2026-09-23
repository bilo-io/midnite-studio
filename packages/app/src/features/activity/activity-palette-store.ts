import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  ACTIVITY_STATUSES,
  DEFAULT_ACTIVITY_PALETTE_ID,
  type ActivityStatus,
  type ActivityStatusStyle,
} from '@midnite/studio-shared';

import { sharedSettingsStorage } from '../../store/shared-settings-storage';

/** `agent`'s own style choice — the preset's identity gradient, or the fixed
 * metallic ring `shell` wears by default. */
export type AgentStyleMode = 'gradient' | 'metallic';

/** `shell`'s own style choice — the third option lets a plain terminal wear
 * whatever `agent` currently resolves to, override included. */
export type ShellStyleMode = 'metallic' | 'gradient' | 'matchAgent';

/**
 * Settings ▸ Activity's persisted state (Phase 95 Theme B) — the preset
 * pick plus everything a user can layer on top of it: per-status colour/
 * gradient overrides, and the agent/shell style pair the phase doc calls
 * out separately since only those two statuses have a "how it's driven"
 * axis (a live session) on top of "what colour".
 *
 * `activePaletteId` was Theme A's own in-memory field — this file now owns
 * the field's whole lifecycle, so Theme A's `setActivePaletteId` call sites
 * (`use-activity-palette-sync.ts`, its own tests) keep working unchanged.
 */
export type ActivityPaletteState = {
  activePaletteId: string;
  /** Per-status overrides, layered on top of the active preset. A status
   * absent here falls back to the preset's own value — `resolveActive
   * Palette.ts` is where that fallback happens, not here. */
  statusOverrides: Partial<Record<ActivityStatus, ActivityStatusStyle>>;
  agentStyle: AgentStyleMode;
  shellStyle: ShellStyleMode;

  setActivePaletteId: (id: string) => void;
  setStatusOverride: (status: ActivityStatus, style: ActivityStatusStyle) => void;
  resetStatusOverride: (status: ActivityStatus) => void;
  setAgentStyle: (mode: AgentStyleMode) => void;
  setShellStyle: (mode: ShellStyleMode) => void;
  /** Restores every field on this page to its shipped default — the preset,
   * every per-status override, and both style pickers. */
  resetAll: () => void;
};

type PersistedActivityPaletteState = Pick<
  ActivityPaletteState,
  'activePaletteId' | 'statusOverrides' | 'agentStyle' | 'shellStyle'
>;

const DEFAULTS: PersistedActivityPaletteState = {
  activePaletteId: DEFAULT_ACTIVITY_PALETTE_ID,
  statusOverrides: {},
  agentStyle: 'gradient',
  shellStyle: 'metallic',
};

/**
 * Persisted via `appearance-store.ts`'s own `'midnite.settings'` key
 * (`sharedSettingsStorage`), the same shape `palette-store.ts` (Phase 64)
 * already uses — Theme B's own checklist item: this state lives beside
 * accent and motion, not in `ui-store`'s 60-plus-key blob.
 */
export const useActivityPaletteStore = create<ActivityPaletteState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setActivePaletteId: (activePaletteId) => set({ activePaletteId }),
      setStatusOverride: (status, style) =>
        set((state) => ({ statusOverrides: { ...state.statusOverrides, [status]: style } })),
      resetStatusOverride: (status) =>
        set((state) => {
          const next = { ...state.statusOverrides };
          delete next[status];
          return { statusOverrides: next };
        }),
      setAgentStyle: (agentStyle) => set({ agentStyle }),
      setShellStyle: (shellStyle) => set({ shellStyle }),
      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'midnite.settings',
      version: 1,
      storage: sharedSettingsStorage('midnite.settings'),
      partialize: (state): PersistedActivityPaletteState => ({
        activePaletteId: state.activePaletteId,
        statusOverrides: state.statusOverrides,
        agentStyle: state.agentStyle,
        shellStyle: state.shellStyle,
      }),
      // No prior shape to migrate away from — this key's earlier profiles
      // (Theme A shipped this store unpersisted) simply have none of these
      // fields, so every arm is seeded from `DEFAULTS` rather than gated on
      // a version check, the same reasoning `palette-store.ts`'s own v1→v2
      // migrate follows.
      migrate: (persisted): PersistedActivityPaletteState => {
        const saved = (persisted ?? {}) as Partial<PersistedActivityPaletteState>;
        const statusOverrides: Partial<Record<ActivityStatus, ActivityStatusStyle>> = {};
        if (saved.statusOverrides) {
          for (const status of ACTIVITY_STATUSES) {
            const style = saved.statusOverrides[status];
            if (style) statusOverrides[status] = style;
          }
        }
        return {
          activePaletteId: saved.activePaletteId ?? DEFAULTS.activePaletteId,
          statusOverrides,
          agentStyle: saved.agentStyle ?? DEFAULTS.agentStyle,
          shellStyle: saved.shellStyle ?? DEFAULTS.shellStyle,
        };
      },
    },
  ),
);
