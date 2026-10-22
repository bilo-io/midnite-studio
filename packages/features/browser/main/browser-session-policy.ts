import { cancelDownload, denyAllDevices, denyAllPermissions } from './browser-security';
import type { BrowserSession } from './browser-electron';
import type { DownloadItemLike } from './browser-security';

/**
 * One session policy, applied once per partition (Phase 117 Theme A).
 *
 * `persist:browser` and every `persist:app-<id>` used to be configured by two near-identical
 * blocks in `browser-service.ts` and `web-apps-service.ts`, each remembering to call the same
 * three guards. A rule added to one and not the other is exactly the drift this module exists to
 * stop: the services now call {@link applyBrowserSessionPolicy} and nothing else, and every
 * session-level rule the phase adds (Theme C's certificate verifier, Theme C/E's `webRequest`
 * listeners) lands here, in the order below, for both partitions at once.
 *
 * Order matters and is pinned by `browser-session-policy.test.ts`:
 *
 * 1. `denyAllPermissions` — request AND check handlers (Theme B replaces this with a prompt).
 * 2. `denyAllDevices` — no WebUSB/HID/serial chooser, no `getDisplayMedia`.
 * 3. `will-download` — refused outright; Theme D's opt-in quarantine replaces the handler.
 * 4. `setSpellCheckerEnabled(false)` — Chromium's spellchecker hands typed text to the OS
 *    service; off unless the composer asks for it (the Settings switch is Theme B's page).
 *
 * Structural types only, like `browser-security.ts`: every step runs against a plain fake.
 */

/** What the policy needs from a `Session` — a subset of the composer's {@link BrowserSession}. */
export type PolicySession = Pick<
  BrowserSession,
  | 'setPermissionRequestHandler'
  | 'setPermissionCheckHandler'
  | 'setDevicePermissionHandler'
  | 'setDisplayMediaRequestHandler'
  | 'on'
  | 'setSpellCheckerEnabled'
>;

export type BrowserSessionPolicyOptions = {
  /**
   * Told about every refused download, with the `webContents` that asked so the browser service
   * can route the notice to the tab the user was looking at. The item is already cancelled.
   */
  onDownloadRefused: (filename: string, webContents: unknown) => void;
  /** Default `false`. `true` only from a user-facing switch — never from a page. */
  spellcheck?: boolean;
};

export function applyBrowserSessionPolicy(session: PolicySession, options: BrowserSessionPolicyOptions): void {
  denyAllPermissions(session);
  denyAllDevices(session);
  session.on('will-download', (_event, item: DownloadItemLike, webContents) => {
    cancelDownload(item, (filename) => options.onDownloadRefused(filename, webContents));
  });
  session.setSpellCheckerEnabled(options.spellcheck === true);
}

/**
 * The `webPreferences` every embedded page gets — the browser's tabs and the web-app views alike.
 *
 * Every dangerous flag is written out explicitly as its safe value rather than left to Electron's
 * default, so `web-preferences.test.ts` pins a table instead of an absence: a future Electron
 * that flipped a default would still produce this exact object. `preload` is deliberately not a
 * key at all — an embedded page must have no path to `window.midniteStudio`, and the cheapest
 * guarantee is to hand it nothing. `devTools` follows the composer's `devToolsAllowed`
 * (dev, or the `MSTUDIO_DEVTOOLS=1` support hatch), so a packaged build cannot open an inspector
 * on a page from anywhere, not just the menu — the same rule the app windows follow.
 */
export function sandboxedPageWebPreferences(partition: string, options: { devTools: boolean }): {
  partition: string;
  sandbox: true;
  contextIsolation: true;
  nodeIntegration: false;
  nodeIntegrationInSubFrames: false;
  nodeIntegrationInWorker: false;
  webviewTag: false;
  allowRunningInsecureContent: false;
  experimentalFeatures: false;
  enableBlinkFeatures: '';
  webSecurity: true;
  devTools: boolean;
} {
  return {
    partition,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    webSecurity: true,
    devTools: options.devTools,
  };
}

/** The slice of a view's `webContents` the two per-view guards below touch. */
export type GuardedPageContents = {
  on(event: 'will-attach-webview', listener: (event: { preventDefault(): void }) => void): void;
};

/**
 * `<webview>` can never attach to an embedded page, whatever `webviewTag` says.
 *
 * `webviewTag: false` already keeps the element inert, so this handler is unreachable today — and
 * that is the point: it is the second lock, so a future flag flip (or an Electron default change)
 * cannot reopen a guest-page surface with its own `webPreferences` of the page's choosing.
 */
export function refuseWebviewAttach(wc: GuardedPageContents): void {
  wc.on('will-attach-webview', (event) => event.preventDefault());
}
