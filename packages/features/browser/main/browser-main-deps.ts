import type { BrowserElectron } from './browser-electron';

/**
 * What the browser and web-apps services need from whoever composes them (Phase 113 Theme L),
 * installed once at startup by {@link installBrowserMain} — before the first tab or app view.
 *
 * The services keep their module-level maps and their exported functions exactly as they were (the
 * window manager, the optimizer's kill list and the quit path call them by name); what moved out is
 * only what they used to import from `electron` and from desktop's own modules.
 */

/** desktop's `Logger`: callable (warn), with `warn` and `error`. */
export type BrowserLog = ((message: string) => void) & {
  warn(message: string): void;
  error(message: string, err?: unknown): void;
};

/** The two settings the web-apps idle sweep reads (Studio: `settings-mirror`'s `currentSettings()`). */
export type BrowserDiscardSettings = {
  browserDiscardMs?: number;
  webAppDiscardIdle?: Readonly<Record<string, boolean>>;
};

export type BrowserMainDeps = {
  electron: BrowserElectron;
  log: BrowserLog;
  /** Read at sweep time, so a settings change applies on the next tick. */
  readDiscardSettings: () => BrowserDiscardSettings;
};

let installed: BrowserMainDeps | null = null;

/** Install the composer's Electron and services. Re-installing replaces them (tests do). */
export function installBrowserMain(deps: BrowserMainDeps): void {
  installed = deps;
}

/** The installed deps — throws when nothing composed the browser, rather than running unwired. */
export function browserMainDeps(): BrowserMainDeps {
  if (!installed) throw new Error('The browser feature main half was used before installBrowserMain()');
  return installed;
}

/** The installed logger. A thunk-shaped proxy so the services keep calling `defaultLogger(...)` as before. */
export const defaultLogger: BrowserLog = Object.assign((message: string) => browserMainDeps().log(message), {
  warn: (message: string) => browserMainDeps().log.warn(message),
  error: (message: string, err?: unknown) => browserMainDeps().log.error(message, err),
});
