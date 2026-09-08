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
  /** Electron's own audio/video split, which some paths report instead of `media`. */
  | 'audioCapture'
  | 'videoCapture'
  | 'media'
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
    handler: (
      webContents: unknown,
      permission: BrowserPermission,
      requestingOrigin: string,
      details?: unknown,
    ) => boolean,
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

/**
 * The one permission the app's own renderer is allowed, and nothing else
 * (Phase 79 Theme F).
 *
 * Two facts make this necessary rather than merely tidy. First, Electron's
 * *default* for a session with no handler installed is to **approve** most
 * permission requests — so before this existed the app renderer could have had
 * the camera, the screen and the clipboard for the asking, and only the
 * browser pane was actually policed. Second, the companion genuinely needs a
 * microphone, and `denyAllPermissions` is the right answer for a page loaded
 * off the internet but the wrong one for our own UI.
 *
 * So the app session gets its own handler pair with exactly one hole in it:
 * `media`, audio only, from our own origin. Both conditions, both handlers.
 *
 * The browser pane is untouched and keeps refusing everything — it runs in the
 * separate `persist:browser` partition, and `browser-service.ts` still calls
 * `denyAllPermissions` on it. That is the invariant `browser-security.test.ts`
 * asserts by session rather than by rule.
 */

/** What the request handler's `details` argument carries for a `media` request. */
export type PermissionRequestDetails = {
  /** Present only for `media`. `['audio']`, `['video']`, or both. */
  mediaTypes?: readonly string[];
  /** The origin asking. `file://` for the packaged bundle, the dev server's origin in dev. */
  securityOrigin?: string;
  requestingUrl?: string;
};

/** What the *check* handler is told instead — one media type, not a list. */
export type PermissionCheckDetails = {
  /** `'audio'`, `'video'`, or `'unknown'`. Singular: the check API asks about one. */
  mediaType?: string;
  securityOrigin?: string;
  requestingUrl?: string;
};

/**
 * Is this origin the app's own UI?
 *
 * Two shapes, because the renderer is loaded two different ways. A packaged
 * build is `win.loadFile(...)`, whose origin is the **opaque** `file://` — the
 * same opaque origin that forces Monaco's workers to be inlined (Phase 64).
 * Chromium reports it as the literal string `"file://"` here, and as `"null"`
 * through some paths, so both are accepted. Dev is `win.loadURL(...)` against
 * Vite, whose origin is a real one and is compared exactly.
 *
 * `devServerOrigin` is injected rather than read from `process.env` in here so
 * the rule is testable without a environment, and so a packaged build can pass
 * `null` and have the dev branch be unreachable rather than merely unused.
 *
 * **`file://` being opaque is not a loophole.** A page in the browser pane can
 * never reach `file:` at all — `checkNavigationUrl` above refuses the scheme —
 * and the browser pane is a different session with a different handler
 * regardless. The origin check is the second lock, not the only one.
 */
export function isAppOrigin(origin: string | undefined, devServerOrigin: string | null): boolean {
  if (origin === undefined) return false;
  const trimmed = origin.trim();
  if (trimmed === 'file://' || trimmed === 'file://.' || trimmed === 'null') return true;
  if (devServerOrigin === null) return false;
  return trimmed === normaliseOrigin(devServerOrigin);
}

/** `http://localhost:5173/` and `http://localhost:5173` are one origin; make them one string. */
function normaliseOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

/**
 * The rule, as a pure predicate: grant only `media`, only `['audio']`, only
 * from the app's own origin.
 *
 * `['audio']` **exactly** — a request for `['audio', 'video']` is refused
 * outright rather than downgraded to audio. Electron's callback is a single
 * boolean over the whole request, so "grant the audio half" is not a thing it
 * can express; approving such a request would hand over the camera too. A
 * caller that wants the microphone asks for the microphone.
 */
export function isAudioOnlyAppRequest(
  permission: BrowserPermission,
  details: PermissionRequestDetails | undefined,
  devServerOrigin: string | null,
): boolean {
  if (permission !== 'media' && permission !== 'audioCapture' && permission !== 'microphone') {
    return false;
  }
  if (!isAppOrigin(details?.securityOrigin, devServerOrigin)) return false;

  const types = details?.mediaTypes;
  /*
    `microphone`/`audioCapture` arrive with no `mediaTypes` at all — the
    permission name *is* the media type. `media` without a list is refused: it
    is the ambiguous case, and the ambiguous case is the one that could be a
    camera.
  */
  if (types === undefined) return permission !== 'media';
  return types.length === 1 && types[0] === 'audio';
}

/** {@link isAudioOnlyAppRequest} for the synchronous check API, whose details are singular. */
export function isAudioOnlyAppCheck(
  permission: BrowserPermission,
  details: PermissionCheckDetails | undefined,
  requestingOrigin: string,
  devServerOrigin: string | null,
): boolean {
  if (permission !== 'media' && permission !== 'audioCapture' && permission !== 'microphone') {
    return false;
  }
  // The check handler is given the origin as its own argument; `details` also
  // carries one, and either may be the populated one depending on the caller.
  const origin = requestingOrigin.length > 0 ? requestingOrigin : (details?.securityOrigin ?? '');
  if (!isAppOrigin(origin, devServerOrigin)) return false;

  const mediaType = details?.mediaType;
  if (mediaType === undefined) return permission !== 'media';
  return mediaType === 'audio';
}

/**
 * Install the carve-out on the app's own session.
 *
 * Called once at startup against `session.defaultSession` — the session the
 * app window loads in. Both handlers, for the reason
 * {@link denyAllPermissions} gives: `setPermissionCheckHandler` is what a
 * synchronous `navigator.permissions.query()` reads, and a renderer that only
 * ever calls that would otherwise be told every permission is available.
 */
export function allowAppAudioOnly(
  session: PermissionSession,
  devServerOrigin: string | null,
): void {
  session.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(
      isAudioOnlyAppRequest(permission, details as PermissionRequestDetails | undefined, devServerOrigin),
    ),
  );
  session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    isAudioOnlyAppCheck(
      permission,
      details as PermissionCheckDetails | undefined,
      requestingOrigin,
      devServerOrigin,
    ),
  );
}

export type OnlyHttpAllowed = { allowed: boolean; blockedScheme?: string };

/**
 * `will-navigate`/`will-redirect` policy: only `http:`/`https:` proceed.
 *
 * `file:`, `mstudio-file:`, `javascript:`, `data:` and every custom scheme are
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
