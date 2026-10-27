import type { SettingsSyncPayload } from '@midnite/studio-shared';

/**
 * Main's copy of the renderer-owned settings its own timers need (Phase 84
 * Theme B.4).
 *
 * `ui-store` stays the sole owner of these fields — this module only
 * remembers the last snapshot pushed over `CHANNELS.settingsSync`
 * (`use-settings-sync.ts`, sent on every change and once on mount). The
 * defaults below match `ui-store.ts`'s own initial state, so a scheduler
 * started before the renderer's first push (or in a test that never sends
 * one) behaves exactly as the renderer would with nothing overridden yet.
 */
const DEFAULT_SETTINGS: SettingsSyncPayload = {
  autoFetchEnabled: true,
  autoFetchIntervalMs: 60_000,
  webAppDiscardIdle: {
    spotify: false,
    'google-calendar': false,
    youtube: false,
  },
  browserDiscardMs: 10 * 60 * 1000,
  // Phase 90 Theme C: matches `ui-store.ts`'s own default — on, per the
  // phase doc's Decisions — so an account switch that happens before the
  // renderer's first sync still runs `gh auth switch`.
  forgeSyncGhAuthSwitch: true,
  // Phase 96 Theme H: matches `ui-store.ts`'s own default — nothing bound
  // yet, so a council or workflow agent node run before the renderer's
  // first sync resolves every agent as native, same as after it.
  agentBackends: {},
  // Phase 121 Theme E: confinement is off until Settings ▸ Agents turns it on.
  confineNewSessions: false,
  // Phase 115 Theme F: reads of ~/.claude and ~/.codex stay on until the user switches them off.
  readAgentHistory: true,
  // Phase 115 Theme B: history is kept forever until the user picks a limit.
  historyRetentionDays: null,
};

/** Whether main may read `~/.claude` / `~/.codex` right now (Phase 115 Theme F). */
export function agentHistoryReadsEnabled(): boolean {
  return current.readAgentHistory !== false;
}

let current: SettingsSyncPayload = DEFAULT_SETTINGS;

export type SettingsChangeListener = (settings: SettingsSyncPayload) => void;
const listeners = new Set<SettingsChangeListener>();

/** The last snapshot the renderer sent, or the default before the first one. */
export function currentSettings(): SettingsSyncPayload {
  return current;
}

/** Called from `settings-handlers.ts` on every `CHANNELS.settingsSync` message. */
export function applySettingsSync(payload: SettingsSyncPayload): void {
  current = payload;
  for (const listener of listeners) listener(current);
}

/** `fetch-scheduler.ts` re-arms its timers when the interval changes. */
export function onSettingsChange(listener: SettingsChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only reset — module state otherwise outlives every test in a file. */
export function resetSettingsMirrorForTests(): void {
  current = DEFAULT_SETTINGS;
  listeners.clear();
}
