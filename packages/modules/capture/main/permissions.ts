import type { DisplayMediaGate, PermissionDetails } from '@midnite/studio-feature-capture/main';

/** The two session handlers, as far as Capture installs them. */
export type CapturePermissionSession = {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: unknown,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: unknown,
    ) => boolean,
  ): void;
  setDisplayMediaRequestHandler(
    handler: (request: unknown, callback: (streams: unknown) => void) => void,
  ): void;
};

/** The window loads `index.html` from disk, so the app's only origin is `file://`. */
export const isCaptureAppOrigin = (origin: string): boolean => origin === 'file://';

/**
 * Capture's window asks for nothing — no camera, microphone, notifications or the rest — except the one
 * hole the recording gate opens: a screen stream from our own main frame in the seconds after the user
 * pressed Record on one source. Electron's default for a session with no handler is to approve most
 * requests, so both handlers are installed; the display-media handler answers no stream unless armed.
 */
export function installCapturePermissions(
  session: CapturePermissionSession,
  gate: DisplayMediaGate,
): void {
  session.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(gate.allowsPermission(permission, details as PermissionDetails | undefined)),
  );
  session.setPermissionCheckHandler((_wc, permission, origin, details) =>
    gate.allowsPermission(permission, details as PermissionDetails | undefined, origin),
  );
  session.setDisplayMediaRequestHandler((request, callback) =>
    gate.handleRequest(
      request as Parameters<DisplayMediaGate['handleRequest']>[0],
      callback as Parameters<DisplayMediaGate['handleRequest']>[1],
    ),
  );
}
