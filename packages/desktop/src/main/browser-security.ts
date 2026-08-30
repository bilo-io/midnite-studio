/**
 * The security policy Phase 27 attached as a condition to the browser
 * engine — lands with Theme A, not after it (see the phase doc's "Not in
 * this phase" section on why an engine without this is the incident).
 *
 * Every function here takes the pieces it touches structurally (a
 * `session`-shaped object, a `webContents`-shaped one) rather than the real
 * Electron types, so `browser-security.test.ts` can exercise every rule
 * against a plain fake with no Electron dependency at all.
 */

/** The permission kinds `setPermissionRequestHandler`/`CheckHandler` are asked about. */
export type BrowserPermission =
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'notifications'
  | 'midiSysex'
  | 'midi'
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'display-capture'
  | 'pointerLock'
  | string;

export type PermissionSession = {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: BrowserPermission,
      callback: (granted: boolean) => void,
      details: unknown,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (webContents: unknown, permission: BrowserPermission, requestingOrigin: string) => boolean,
  ): void;
};

/**
 * Deny every permission, request AND check alike.
 *
 * Both handlers, not just the request one: `setPermissionCheckHandler` is
 * what a synchronous `navigator.permissions.query()` reads, and a page that
 * only ever calls that (never the async request API) would otherwise see
 * every permission as available.
 */
export function denyAllPermissions(session: PermissionSession): void {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

export type OnlyHttpAllowed = { allowed: boolean; blockedScheme?: string };

/**
 * `will-navigate`/`will-redirect` policy: only `http:`/`https:` proceed.
 *
 * `file:`, `mgit-file:`, `javascript:`, `data:` and every custom scheme are
 * refused — a page loaded in the browser tab has no reason to reach any of
 * them, and the renderer's own scheme staying unreachable from here is the
 * whole point of the separate `persist:browser` partition.
 */
export function checkNavigationUrl(rawUrl: string): OnlyHttpAllowed {
  let scheme: string;
  try {
    scheme = new URL(rawUrl).protocol;
  } catch {
    return { allowed: false, blockedScheme: 'invalid' };
  }
  if (scheme === 'http:' || scheme === 'https:') return { allowed: true };
  return { allowed: false, blockedScheme: scheme };
}

export type DownloadItemLike = { getFilename(): string; cancel(): void };

/** `will-download` cancels loudly rather than starting a download nobody asked for a destination for. */
export function cancelDownload(item: DownloadItemLike, notify: (filename: string) => void): void {
  item.cancel();
  notify(item.getFilename());
}
