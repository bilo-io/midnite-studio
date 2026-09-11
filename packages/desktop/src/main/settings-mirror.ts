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
};

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
