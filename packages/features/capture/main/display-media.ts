import { CAPTURE_ARM_TTL_MS } from '@midnite/studio-shared';

/**
 * The recording gate (Phase 113 Theme K): how a renderer gets exactly one screen stream, for the source
 * the user picked, and nothing else.
 *
 * A recording starts with a click: the renderer asks main to **arm** the chosen source, then calls
 * `navigator.mediaDevices.getDisplayMedia()`. The composer installs {@link DisplayMediaGate.handleRequest}
 * as the session's display-media handler and {@link DisplayMediaGate.allowsPermission} inside its
 * permission handlers, so:
 *
 * - an unarmed `getDisplayMedia` is refused (the handler answers no stream);
 * - an armed one gets the armed source and disarms the gate — one stream per click;
 * - an arm left unused expires after {@link CAPTURE_ARM_TTL_MS};
 * - only the app's own origin, in its main frame, is ever answered (`isAppOrigin` is the composer's).
 *
 * The audio half of a request is never granted: Capture records the picture only.
 */
export type ArmedSource = { id: string; name: string };

/** The parts of Electron's `DisplayMediaRequestHandlerHandlerRequest` the gate reads. */
export type DisplayMediaRequest = {
  securityOrigin?: string;
  frame?: { url?: string; parent?: unknown } | null;
  videoRequested?: boolean;
};

export type DisplayMediaStreams = { video?: ArmedSource };

export type DisplayMediaGate = {
  arm: (source: ArmedSource) => void;
  disarm: () => void;
  /** The source armed most recently and not yet expired, if any — whether a request would be answered. */
  armed: () => ArmedSource | null;
  /** The last source a stream was handed out for (the recording's label). */
  lastStreamed: () => ArmedSource | null;
  handleRequest: (request: DisplayMediaRequest, callback: (streams: DisplayMediaStreams) => void) => void;
  /**
   * For the composer's permission request/check handlers: true only for a screen-capture permission
   * (`display-capture`, or `media` asking for video alone) from the app's own main frame while armed.
   */
  allowsPermission: (permission: string, details: PermissionDetails | undefined, origin?: string) => boolean;
};

export type PermissionDetails = {
  requestingUrl?: string;
  securityOrigin?: string;
  isMainFrame?: boolean;
  mediaTypes?: string[];
  mediaType?: string;
};

export function createDisplayMediaGate(options: {
  isAppOrigin: (origin: string) => boolean;
  now?: () => number;
  ttlMs?: number;
}): DisplayMediaGate {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? CAPTURE_ARM_TTL_MS;
  let current: { source: ArmedSource; at: number } | null = null;
  let streamed: ArmedSource | null = null;

  const armed = (): ArmedSource | null => {
    if (!current) return null;
    if (now() - current.at > ttl) {
      current = null;
      return null;
    }
    return current.source;
  };

  const originOf = (raw: string | undefined): string => {
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return url.protocol === 'file:' ? 'file://' : url.origin;
    } catch {
      return '';
    }
  };

  return {
    arm: (source) => {
      current = { source, at: now() };
    },
    disarm: () => {
      current = null;
    },
    armed,
    lastStreamed: () => streamed,
    handleRequest: (request, callback) => {
      const source = armed();
      const origin = request.securityOrigin ?? originOf(request.frame?.url);
      const mainFrame = request.frame ? request.frame.parent === null || request.frame.parent === undefined : true;
      if (!source || request.videoRequested === false || !mainFrame || !options.isAppOrigin(origin)) {
        callback({});
        return;
      }
      current = null;
      streamed = source;
      callback({ video: { id: source.id, name: source.name } });
    },
    allowsPermission: (permission, details, origin) => {
      if (!armed()) return false;
      if (details?.isMainFrame === false) return false;
      const from = origin && origin.length > 0 ? origin : (details?.securityOrigin ?? originOf(details?.requestingUrl));
      if (!options.isAppOrigin(from)) return false;
      if (permission === 'display-capture') return true;
      if (permission !== 'media') return false;
      const types = details?.mediaTypes ?? (details?.mediaType ? [details.mediaType] : []);
      return types.length > 0 && types.every((t) => t === 'video');
    },
  };
}
