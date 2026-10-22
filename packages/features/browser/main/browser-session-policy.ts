import type { BrowserPermissionKind } from '@midnite/studio-shared';

import type { BrowserSession, CompletedRequestDetails } from './browser-electron';
import {
  cancelDownload,
  denyAllDevices,
  denyAllPermissions,
  normaliseOrigin,
  type BrowserPermission,
  type DownloadItemLike,
  type PermissionCheckDetails,
  type PermissionRequestDetails,
} from './browser-security';
import type { PermissionGrantStore } from './permission-grant-store';

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
 * 1. `configureSessionPermissions` — request AND check handlers (Theme B prompt + remembered grants).
 * 2. `denyAllDevices` — no WebUSB/HID/serial chooser, no `getDisplayMedia`.
 * 3. `will-download` — refused outright; Theme D's opt-in quarantine replaces the handler.
 * 4. `setCertificateVerifyProc` (Theme C) — record-only: every verification result is reported,
 *    Chromium's own verdict always stands (`-3`).
 * 5. `webRequest.onCompleted` (Theme C) — observe-only; Theme E owns the blocking events.
 * 6. `setSpellCheckerEnabled(false)` — Chromium's spellchecker hands typed text to the OS
 *    service; off unless the composer asks for it (the Settings switch is Theme B's page).
 *
 * Steps 4 and 5 install only when the composer passes their hook (the browser partition does;
 * the web-app partitions have no address bar to show a verdict in).
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
> &
  Partial<Pick<BrowserSession, 'setCertificateVerifyProc' | 'webRequest'>>;

export type PromptablePermissionRequest = {
  origin: string;
  permission: BrowserPermissionKind;
  permissions: BrowserPermissionKind[];
  webContents: unknown;
  callback: (granted: boolean) => void;
};

export type BrowserSessionPolicyOptions = {
  /**
   * Told about every refused download, with the `webContents` that asked so the browser service
   * can route the notice to the tab the user was looking at. The item is already cancelled.
   */
  onDownloadRefused: (filename: string, webContents: unknown) => void;
  /**
   * Store backing remembered permissions per origin. If omitted, all permissions are denied.
   */
  permissionStore?: PermissionGrantStore;
  /**
   * Called when a promptable permission has value 'ask' and passed rate limiting.
   */
  onPermissionRequest?: (request: PromptablePermissionRequest) => void;
  /** Default `false`. `true` only from a user-facing switch — never from a page. */
  spellcheck?: boolean;
  /**
   * Phase 117 Theme C: told every certificate verification — `error` is Chromium's error name, or
   * `undefined` when the chain verified. The verifier never changes the outcome (it always answers
   * `-3`, "Chromium's own result"); a proceed past a bad certificate is the tab's `certificate-error`
   * handler's call, per host, per session.
   */
  onCertificateVerified?: (hostname: string, error: string | undefined) => void;
  /** Phase 117 Theme C: every completed request on the partition (mixed content, script libraries). */
  onRequestCompleted?: (details: CompletedRequestDetails) => void;
};

/** `setCertificateVerifyProc`'s "use the result Chromium already computed". */
export const USE_CHROMIUM_VERIFICATION = -3;

/**
 * Maps an incoming permission request to granular promptable permission kinds (Phase 117 Theme B).
 * Returns null for non-promptable permissions (which are strictly denied).
 */
export function mapRequestedPermissions(
  permission: BrowserPermission,
  details?: PermissionRequestDetails,
): BrowserPermissionKind[] | null {
  if (permission === 'camera' || permission === 'videoCapture') return ['camera'];
  if (permission === 'microphone' || permission === 'audioCapture') return ['microphone'];
  if (permission === 'geolocation') return ['geolocation'];
  if (permission === 'notifications') return ['notifications'];
  if (permission === 'media') {
    const types = details?.mediaTypes ?? [];
    const list: BrowserPermissionKind[] = [];
    if (types.includes('audio')) list.push('microphone');
    if (types.includes('video')) list.push('camera');
    return list.length > 0 ? list : null;
  }
  return null;
}

/**
 * Maps a permission check query to its granular permission kind (Phase 117 Theme B).
 */
export function mapCheckPermission(
  permission: BrowserPermission,
  details?: PermissionCheckDetails,
): BrowserPermissionKind | null {
  if (permission === 'camera' || permission === 'videoCapture') return 'camera';
  if (permission === 'microphone' || permission === 'audioCapture') return 'microphone';
  if (permission === 'geolocation') return 'geolocation';
  if (permission === 'notifications') return 'notifications';
  if (permission === 'media') {
    const type = details?.mediaType;
    if (type === 'audio') return 'microphone';
    if (type === 'video') return 'camera';
    return null;
  }
  return null;
}

/**
 * Configures permission request and check handlers for a browser session (Phase 117 Theme B).
 *
 * Scope: camera, microphone, geolocation, notifications.
 * Non-promptable permissions (clipboard-read, midi, hid, usb, etc.) are denied immediately.
 * Check handler answers from store only, never prompts.
 * Prompts are rate-limited to at most once per (origin, permission) per minute.
 */
export function configureSessionPermissions(
  session: Pick<PolicySession, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
  options: BrowserSessionPolicyOptions,
): void {
  const store = options.permissionStore;
  if (!store) {
    denyAllPermissions(session);
    return;
  }

  // Rate limiting map: `${origin}:${permission}` -> timestamp
  const lastPromptTime = new Map<string, number>();

  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mapped = mapRequestedPermissions(permission, details as PermissionRequestDetails | undefined);
    if (!mapped || mapped.length === 0) {
      callback(false);
      return;
    }

    const rawOrigin =
      (details as PermissionRequestDetails | undefined)?.securityOrigin ||
      (details as PermissionRequestDetails | undefined)?.requestingUrl ||
      (webContents as { getURL?(): string } | undefined)?.getURL?.() ||
      '';
    const origin = normaliseOrigin(rawOrigin);

    let allAllowed = true;
    const ungranted: BrowserPermissionKind[] = [];
    for (const p of mapped) {
      const grant = store.get(origin, p);
      if (grant === 'deny') {
        callback(false);
        return;
      }
      if (grant !== 'allow') {
        allAllowed = false;
        ungranted.push(p);
      }
    }

    if (allAllowed) {
      callback(true);
      return;
    }

    // Rate limiting: at most once per (origin, permission) per minute
    const now = Date.now();
    for (const p of ungranted) {
      const key = `${origin}:${p}`;
      const last = lastPromptTime.get(key) ?? 0;
      if (now - last < 60_000) {
        callback(false);
        return;
      }
    }

    for (const p of ungranted) {
      lastPromptTime.set(`${origin}:${p}`, now);
    }

    if (!options.onPermissionRequest) {
      callback(false);
      return;
    }

    options.onPermissionRequest({
      origin,
      permission: ungranted[0]!,
      permissions: ungranted,
      webContents,
      callback,
    });
  });

  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const rawOrigin =
      requestingOrigin ||
      (details as PermissionCheckDetails | undefined)?.securityOrigin ||
      (details as PermissionCheckDetails | undefined)?.requestingUrl ||
      (webContents as { getURL?(): string } | undefined)?.getURL?.() ||
      '';
    const origin = normaliseOrigin(rawOrigin);
    const mapped = mapCheckPermission(permission, details as PermissionCheckDetails | undefined);
    if (!mapped) return false;
    return store.get(origin, mapped) === 'allow';
  });
}

export function applyBrowserSessionPolicy(session: PolicySession, options: BrowserSessionPolicyOptions): void {
  configureSessionPermissions(session, options);
  denyAllDevices(session);
  session.on('will-download', (_event, item: DownloadItemLike, webContents) => {
    cancelDownload(item, (filename) => options.onDownloadRefused(filename, webContents));
  });
  const onVerified = options.onCertificateVerified;
  if (onVerified && session.setCertificateVerifyProc) {
    session.setCertificateVerifyProc((request, callback) => {
      onVerified(request.hostname, request.errorCode === 0 ? undefined : request.verificationResult);
      callback(USE_CHROMIUM_VERIFICATION);
    });
  }
  const onCompleted = options.onRequestCompleted;
  if (onCompleted && session.webRequest) session.webRequest.onCompleted((details) => onCompleted(details));
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
