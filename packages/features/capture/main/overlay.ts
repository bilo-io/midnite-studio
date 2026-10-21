import { randomBytes } from 'node:crypto';

/**
 * The desktop-wide region overlay (Phase 113 Theme K slice 2): one window over the display the user is
 * capturing, showing the frozen grab of it full-size, where they drag the region. It replaces slice 1's
 * `NO_DESKTOP_OVERLAY` seam; the in-view picker stays as the fallback when no overlay can open.
 *
 * **The window is the composer's, opened only from a user action.** The service calls {@link
 * OverlayController.open} from the Region button (`captureRegionStart`) or the user's own chord, after the
 * screen is frozen — never otherwise. The composer's opener ({@link CaptureOverlayOpener}, built by
 * `electronOverlayOpener`) makes a frameless, transparent, always-on-top, sandboxed window, guards it, loads
 * the app's own overlay page and hands it a preload that exposes the three overlay calls and nothing else.
 *
 * **One overlay, one token.** Each overlay is opened with a fresh random token its preload reads from
 * `additionalArguments` and sends with every call; main answers the overlay channels only for the token of
 * the overlay open now ({@link OverlayController.session}). A second open closes the first. The window
 * closes on blur, cancel and confirm; however it closes, the frozen frame is dropped unless it was taken.
 */

export type CaptureOverlayBounds = { x: number; y: number; width: number; height: number };

/** A window as far as the controller holds it. */
export type CaptureOverlayWindow = { close: () => void };

/**
 * Opens the overlay window over `bounds` for `token`, or answers null when it cannot (no window support,
 * a load failure reported synchronously). `onClosed` fires once when the window goes, for any reason —
 * blur, the OS, or {@link CaptureOverlayWindow.close}.
 */
export type CaptureOverlayOpener = (request: {
  token: string;
  bounds: CaptureOverlayBounds;
  onClosed: () => void;
}) => CaptureOverlayWindow | null;

/** Where the overlay was started from: the chord brings the app forward once it has a capture. */
export type OverlayOrigin = 'view' | 'shortcut';

export type OverlaySession = {
  token: string;
  pendingId: string;
  origin: OverlayOrigin;
};

export type OverlayController = {
  /** Whether this composer can open an overlay at all. */
  available: boolean;
  /**
   * Opens an overlay for a frozen frame; false when it could not (the caller falls back to the in-view
   * picker with the same frame). Closes any overlay already open, which counts as dismissing it.
   */
  open: (request: {
    pendingId: string;
    bounds: CaptureOverlayBounds | undefined;
    origin: OverlayOrigin;
  }) => boolean;
  /** The open overlay, if `token` is its token — the check every overlay channel makes first. */
  session: (token: string) => OverlaySession | null;
  /** The open overlay's frozen frame id, if one is open (the in-view picker must not take it). */
  pendingId: () => string | null;
  /** Ends the session for `token` and closes its window, without reporting a dismissal. */
  finish: (token: string) => OverlaySession | null;
  /** Closes whatever is open (quit), reporting it as dismissed. */
  dispose: () => void;
};

export const newOverlayToken = (): string => `ovl-${randomBytes(12).toString('hex')}`;

export function createOverlayController(deps: {
  opener?: CaptureOverlayOpener | undefined;
  /** The overlay went without a confirm (blur, Escape, the OS, a newer overlay): drop its frame. */
  onDismissed: (session: OverlaySession) => void;
  token?: () => string;
}): OverlayController {
  const token = deps.token ?? newOverlayToken;
  let current: { session: OverlaySession; window: CaptureOverlayWindow } | null = null;

  /** Ends the live session (if it is `which`) and closes its window; `dismissed` reports it. */
  const end = (which: string, dismissed: boolean): OverlaySession | null => {
    if (!current || current.session.token !== which) return null;
    const { session, window } = current;
    current = null;
    try {
      window.close();
    } catch {
      // Already gone.
    }
    if (dismissed) deps.onDismissed(session);
    return session;
  };

  return {
    available: deps.opener !== undefined,
    open: ({ pendingId, bounds, origin }) => {
      if (!deps.opener || !bounds || bounds.width <= 0 || bounds.height <= 0) return false;
      if (current) end(current.session.token, true);
      const session: OverlaySession = { token: token(), pendingId, origin };
      let window: CaptureOverlayWindow | null = null;
      try {
        window = deps.opener({
          token: session.token,
          bounds,
          // However the window goes, a session still open is a dismissal.
          onClosed: () => void end(session.token, true),
        });
      } catch {
        window = null;
      }
      if (!window) return false;
      current = { session, window };
      return true;
    },
    session: (which) => (current && current.session.token === which ? current.session : null),
    pendingId: () => current?.session.pendingId ?? null,
    finish: (which) => end(which, false),
    dispose: () => {
      if (current) end(current.session.token, true);
    },
  };
}
