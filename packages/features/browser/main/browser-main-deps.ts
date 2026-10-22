import type { BrowserElectron } from './browser-electron';
import type { LedgerCipher } from './host-first-seen';
import type { PermissionGrantStore } from './permission-grant-store';

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
  /**
   * Whether an embedded page's DevTools may open (Phase 117 Theme A) — the composer's
   * `devToolsAllowed(app.isPackaged)`: dev, or the `MSTUDIO_DEVTOOLS=1` support hatch. Absent
   * reads as `false`, so a composer that forgets it ships the packaged rule, never the dev one.
   */
  devToolsAllowed?: boolean;
  /** Injected directory path for persistent storage (e.g. browser-permissions.json). */
  userDataPath?: string;
  /** Injected permission grant store (tests or custom compositions). */
  permissionStore?: PermissionGrantStore;
  /**
   * `electron.safeStorage` (Phase 117 Theme F): encrypts the first-seen ledger's HMAC key. Absent, the
   * ledger stays in memory, nothing about visited hosts is written to disk and the `first-seen` rule
   * stays off. Studio passes it; Midnite Browser does not — an app main holds `safeStorage` only for
   * its pairing seed (`scripts/app-vault-grants.test.mjs`).
   */
  ledgerCipher?: LedgerCipher;
  /**
   * Phase 117 Theme G: a page asked to open a `midnite-studio://` or `midnite://` link. Chromium is
   * never allowed to launch it; the composer that can act on one (Studio) gets it here with the
   * page's origin, rate-limits it and confirms it. Absent (Midnite Browser), the link is dropped.
   */
  onPageDeepLink?: (url: string, origin: string) => void;
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
