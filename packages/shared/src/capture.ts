/**
 * Capture (Phase 113 Theme K) — the wire contract for screenshots, screen recordings, the global capture
 * shortcut and the opt-in clipboard history.
 *
 * **Nothing is captured without a user action, and nothing leaves the machine.** Every still is taken in
 * main from a source the user picked (a screen, a window, or a region they dragged on a frozen frame), a
 * recording only ever streams the one source the user armed, and the result lands as a file in a capture
 * directory the composing app owns. File names are generated in main — the renderer never names a path.
 * Bytes reach the renderer over the existing `mstudio-file:` scheme on the `capture` host
 * (`mstudio-file://capture/<bucket>/<file>`), resolved against that directory alone, so the CSP is
 * unchanged. No channel here opens a socket or makes a network call.
 *
 * **Clipboard history is off by default.** While it is off, main does not read the clipboard at all; when
 * the user turns it on, main polls, keeps text and images only (capped by count and bytes), and skips any
 * entry a password manager marks concealed, transient or auto-generated (the nspasteboard.org markers).
 */
import { z } from 'zod';

import { MSTUDIO_FILE_SCHEME } from './fs';

// --- files -----------------------------------------------------------------------

/** The `mstudio-file:` host capture bytes are served on. */
export const CAPTURE_FILE_HOST = 'capture';
/** The bucket a capture's file is served from: the captures themselves, or the clipboard history's images. */
export const CAPTURE_BUCKETS = ['captures', 'clipboard'] as const;
export type CaptureBucket = (typeof CAPTURE_BUCKETS)[number];

/**
 * A capture's id, which is also its file stem: `cap-<yyyymmdd>-<hhmmss>-<hex>`. Generated in main; the
 * pattern is what lets the file resolver refuse any other name.
 */
export const CaptureIdSchema = z.string().regex(/^cap-\d{8}-\d{6}-[0-9a-f]{6,16}$/);
/** A clipboard entry's id: `clip-<hex>`. */
export const ClipboardEntryIdSchema = z.string().regex(/^clip-[0-9a-f]{6,32}$/);

export const CAPTURE_KINDS = ['screenshot', 'recording'] as const;
export const CaptureKindSchema = z.enum(CAPTURE_KINDS);
export type CaptureKind = z.infer<typeof CaptureKindSchema>;

/** How a still was framed. A recording is always of a whole screen or one window. */
export const CAPTURE_MODES = ['screen', 'window', 'region'] as const;
export const CaptureModeSchema = z.enum(CAPTURE_MODES);
export type CaptureMode = z.infer<typeof CaptureModeSchema>;

export const CAPTURE_MODE_LABELS: Record<CaptureMode, string> = {
  screen: 'Full screen',
  window: 'Window',
  region: 'Region',
};

/** The two file types a capture can be. A recording is WebM, which is what Chromium's `MediaRecorder` writes. */
export const CAPTURE_MIMES = ['image/png', 'video/webm'] as const;
export const CaptureMimeSchema = z.enum(CAPTURE_MIMES);
export type CaptureMime = z.infer<typeof CaptureMimeSchema>;

export const CaptureItemSchema = z.object({
  id: CaptureIdSchema,
  kind: CaptureKindSchema,
  mode: CaptureModeSchema,
  mime: CaptureMimeSchema,
  /** The generated file name (`<id>.png` / `<id>.webm`) — never a path. */
  fileName: z.string().min(1),
  createdAt: z.number(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /** What was captured, for the grid: the screen or window's name. */
  sourceName: z.string().optional(),
});
export type CaptureItem = z.infer<typeof CaptureItemSchema>;

// --- permission ----------------------------------------------------------------

/**
 * macOS's Screen Recording permission, as `systemPreferences.getMediaAccessStatus('screen')` reports it.
 * `unsupported` is any platform without the gate (nothing to ask for).
 */
export const CAPTURE_PERMISSIONS = [
  'granted',
  'not-determined',
  'denied',
  'restricted',
  'unsupported',
] as const;
export const CapturePermissionSchema = z.enum(CAPTURE_PERMISSIONS);
export type CapturePermission = z.infer<typeof CapturePermissionSchema>;

/** Whether a capture may be attempted under this permission. */
export const capturePermitted = (permission: CapturePermission): boolean =>
  permission === 'granted' || permission === 'unsupported';

// --- sources -----------------------------------------------------------------------

export const CaptureSourceKindSchema = z.enum(['screen', 'window']);
export type CaptureSourceKind = z.infer<typeof CaptureSourceKindSchema>;

/** A desktopCapturer source id (`screen:<n>:<n>` / `window:<n>:<n>`). */
export const CaptureSourceIdSchema = z.string().regex(/^(screen|window):[\w:-]{1,64}$/);

export const CaptureSourceSchema = z.object({
  id: CaptureSourceIdSchema,
  kind: CaptureSourceKindSchema,
  name: z.string(),
  /** A small `data:image/png` preview for the picker; null when the OS gave none. */
  thumbnail: z.string().nullable(),
});
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

export const CaptureSourcesRequestSchema = z.object({ kind: CaptureSourceKindSchema });
export const CaptureSourcesResponseSchema = z.object({
  permission: CapturePermissionSchema,
  sources: z.array(CaptureSourceSchema),
});

// --- stills ------------------------------------------------------------------------

export const CaptureStillRequestSchema = z.object({
  mode: z.enum(['screen', 'window']),
  sourceId: CaptureSourceIdSchema,
});

/**
 * A region, as fractions of the frozen frame (0..1), so the renderer's scaled preview and the full-size
 * frame agree without the renderer ever knowing the display's pixel size.
 */
export const CaptureRegionRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine(
    (r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001,
    'region runs off the frame',
  );
export type CaptureRegionRect = z.infer<typeof CaptureRegionRectSchema>;

/** Freezes one screen (absent: the screen under the pointer) for the region picker. */
export const CaptureRegionBeginRequestSchema = z.object({
  sourceId: CaptureSourceIdSchema.optional(),
});
export const CaptureRegionFrameSchema = z.object({
  pendingId: z.string().regex(/^pend-[0-9a-f]{6,32}$/),
  /** A scaled-down `data:image/jpeg` of the frozen frame, for the picker only. */
  preview: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceName: z.string(),
});
export type CaptureRegionFrame = z.infer<typeof CaptureRegionFrameSchema>;
export const CaptureRegionFinishRequestSchema = z.object({
  pendingId: CaptureRegionFrameSchema.shape.pendingId,
  rect: CaptureRegionRectSchema,
});
/** The frame the shortcut froze and the picker has not taken yet, if any. */
export const CaptureRegionPendingResponseSchema = z.object({
  frame: CaptureRegionFrameSchema.nullable(),
});
export const CaptureRegionCancelRequestSchema = z.object({
  pendingId: CaptureRegionFrameSchema.shape.pendingId,
});

/**
 * Starts a region capture the best way this app can: the desktop-wide overlay — a frozen grab of the
 * screen under the pointer, shown full-screen over it, where the user drags the region — or, when the
 * overlay cannot open, the same frozen frame for the in-view picker. Either way the screen is grabbed
 * once.
 */
export const CaptureRegionStartResultSchema = z.discriminatedUnion('surface', [
  z.object({ surface: z.literal('overlay') }),
  z.object({ surface: z.literal('in-view'), frame: CaptureRegionFrameSchema }),
]);
export type CaptureRegionStartResult = z.infer<typeof CaptureRegionStartResultSchema>;

// --- the region overlay ------------------------------------------------------------

/**
 * The one-time token an overlay window is opened with (`CAPTURE_OVERLAY_ARG`). Main answers the overlay
 * channels only for the token of the overlay that is open now, so no other window can drive it.
 */
export const CaptureOverlayTokenSchema = z.string().regex(/^ovl-[0-9a-f]{16,64}$/);

/** What the overlay shows: the frozen grab at the display's full pixel size, as a JPEG data URL. */
export const CaptureOverlayFrameSchema = z.object({
  image: z.string().startsWith('data:image/jpeg;base64,'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceName: z.string(),
});
export type CaptureOverlayFrame = z.infer<typeof CaptureOverlayFrameSchema>;

export const CaptureOverlayFrameRequestSchema = z.object({ token: CaptureOverlayTokenSchema });
export const CaptureOverlayConfirmRequestSchema = z.object({
  token: CaptureOverlayTokenSchema,
  rect: CaptureRegionRectSchema,
});
export const CaptureOverlayCancelRequestSchema = z.object({ token: CaptureOverlayTokenSchema });

/** How an overlay ended, for the Capture view (the event's `overlay`). */
export const CaptureOverlayOutcomeSchema = z.object({
  outcome: z.enum(['captured', 'cancelled', 'error']),
  captureId: CaptureIdSchema.optional(),
  message: z.string().optional(),
});
export type CaptureOverlayOutcome = z.infer<typeof CaptureOverlayOutcomeSchema>;

// --- recordings ------------------------------------------------------------------

/** How long an armed source waits for the renderer's `getDisplayMedia` call before it disarms itself. */
export const CAPTURE_ARM_TTL_MS = 10_000;
/** One `MediaRecorder` chunk may not exceed this (a 1 s timeslice is far below it). */
export const CAPTURE_RECORDING_CHUNK_MAX_BYTES = 16 * 1024 * 1024;
/** A whole recording may not exceed this; main refuses the chunk that would cross it. */
export const CAPTURE_RECORDING_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** The container a recording must be: what Chromium's `MediaRecorder` writes, codec suffix allowed. */
export const CaptureRecordingMimeSchema = z
  .string()
  .regex(/^video\/webm(;\s*codecs=[\w.,"-]+)?$/i, 'a recording must be video/webm');

export const CaptureRecordingArmRequestSchema = z.object({ sourceId: CaptureSourceIdSchema });
export const CaptureRecordingBeginRequestSchema = z.object({ mime: CaptureRecordingMimeSchema });
export const CaptureRecordingIdSchema = z.string().regex(/^rec-[0-9a-f]{6,32}$/);
export const CaptureRecordingChunkRequestSchema = z.object({
  recordingId: CaptureRecordingIdSchema,
  bytes: z.instanceof(Uint8Array),
});
export const CaptureRecordingFinishRequestSchema = z.object({
  recordingId: CaptureRecordingIdSchema,
  durationMs: z.number().int().nonnegative(),
});
export const CaptureRecordingAbortRequestSchema = z.object({
  recordingId: CaptureRecordingIdSchema,
});

// --- the captures ------------------------------------------------------------------

export const CaptureListResponseSchema = z.object({ captures: z.array(CaptureItemSchema) });
export const CaptureIdRequestSchema = z.object({ id: CaptureIdSchema });

// --- send to ---------------------------------------------------------------------

/**
 * Where a capture can go — Capture imports no other feature, so each is the composer's. Studio's:
 * `chat` attaches it to a new agent-chat draft; `pr-comment` copies the screenshot and opens the pull
 * request's own page at its comment box in the embedded browser, where the user pastes it (nothing is
 * posted until they press Comment there); `creator` imports it into a Creator project. The standalone
 * app's: `clipboard` copies it, `finder` reveals the file, and `studio` opens it in Midnite Studio through
 * a `midnite-studio://capture` link, where Studio's Send to takes over.
 */
export const CAPTURE_DESTINATIONS = [
  'chat',
  'pr-comment',
  'creator',
  'clipboard',
  'finder',
  'studio',
] as const;
export const CaptureDestinationSchema = z.enum(CAPTURE_DESTINATIONS);
export type CaptureDestination = z.infer<typeof CaptureDestinationSchema>;

export const CAPTURE_DESTINATION_LABELS: Record<CaptureDestination, string> = {
  chat: 'Agent chat',
  'pr-comment': 'Pull-request comment',
  creator: 'Creator project',
  clipboard: 'Copy to clipboard',
  finder: 'Show in Finder',
  studio: 'Midnite Studio',
};

/**
 * The page a pull-request comment is written on: the PR's own web page, scrolled to its comment box.
 * GitHub's pull-request URLs (`…/pull/<n>`) take `#new_comment_field`, the id of the conversation's
 * composer; any other forge's PR page opens as it is (its composer is on the page, without an anchor
 * to it). An anchor that is missing only fails to scroll — it never changes which page opens.
 */
export function capturePrCommentUrl(pullUrl: string): string {
  let url: URL;
  try {
    url = new URL(pullUrl);
  } catch {
    return pullUrl;
  }
  if (!/\/pull\/\d+\/?$/.test(url.pathname)) return url.toString();
  url.hash = 'new_comment_field';
  return url.toString();
}

/**
 * What a chat draft attaches for a capture: a text attachment naming the file, which an agent CLI reads
 * from disk. The path is main's, from its own store — the renderer asks by id.
 */
export const CaptureAttachmentResponseSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
});
/** Imports a screenshot into the repository's Creator ▸ Images project {@link CAPTURE_CREATOR_PROJECT}. */
export const CaptureSendToCreatorRequestSchema = z.object({
  id: CaptureIdSchema,
  repoId: z.string().min(1),
});
export const CaptureSendToCreatorResultSchema = z.object({ project: z.string(), path: z.string() });
/** The Creator ▸ Images project a capture is imported into. */
export const CAPTURE_CREATOR_PROJECT = 'Captures';

/**
 * Studio's import of one capture the standalone Midnite Capture took (the `midnite-studio://capture` link's
 * landing). Main copies it by id from that app's own captures directory — never a path from the link.
 */
export const CaptureImportRequestSchema = z.object({ id: CaptureIdSchema });

// --- settings, shortcut and status --------------------------------------------------

/** An Electron accelerator: modifiers then one key, `+`-joined. Validated again by `globalShortcut` itself. */
export const CaptureAcceleratorSchema = z
  .string()
  .max(64)
  .regex(
    /^((CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)\+)+([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Plus|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Backspace|[`~!@#$%^&*()_={}[\]|\\:;"'<>,.?/-])$/,
    'not a shortcut',
  );

export const CaptureSettingsSchema = z.object({
  /** The global capture chord, or null for none. Registered only while the app runs. */
  shortcut: CaptureAcceleratorSchema.nullable(),
  /** Clipboard history. Off by default; while off, the clipboard is never read. */
  clipboardHistory: z.boolean(),
  /** Hide this app's own windows for the moment a screen is captured, so they are not in the shot. */
  hideWindows: z.boolean(),
});
export type CaptureSettings = z.infer<typeof CaptureSettingsSchema>;

export const CAPTURE_DEFAULT_SETTINGS: CaptureSettings = {
  shortcut: null,
  clipboardHistory: false,
  hideWindows: true,
};

/** Whether the shortcut is live: `conflict` is `globalShortcut.register` answering false (another app owns it). */
export const CaptureShortcutStateSchema = z.object({
  accelerator: CaptureAcceleratorSchema.nullable(),
  state: z.enum(['off', 'registered', 'conflict', 'invalid', 'disabled']),
  message: z.string().optional(),
});
export type CaptureShortcutState = z.infer<typeof CaptureShortcutStateSchema>;

export const CaptureStatusSchema = z.object({
  permission: CapturePermissionSchema,
  settings: CaptureSettingsSchema,
  shortcut: CaptureShortcutStateSchema,
  /** Whether this app can record at all (the composer wired a display-media handler). */
  canRecord: z.boolean(),
  /** Which "Send to…" destinations this app can reach. */
  destinations: z.array(CaptureDestinationSchema),
});
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

export const CaptureSettingsSetRequestSchema = CaptureSettingsSchema.partial();

// --- clipboard history -----------------------------------------------------------

/** At most this many entries; the oldest goes first. */
export const CLIPBOARD_HISTORY_MAX_ENTRIES = 50;
/** A text entry larger than this is not recorded at all (a pasted log is not history). */
export const CLIPBOARD_TEXT_MAX_BYTES = 64 * 1024;
/** An image entry larger than this (as PNG) is not recorded. */
export const CLIPBOARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** The whole history's bytes; past it the oldest entries go until it fits. */
export const CLIPBOARD_HISTORY_MAX_BYTES = 64 * 1024 * 1024;
/** How often main looks at the clipboard while history is on (the clipboard has no change event). */
export const CLIPBOARD_POLL_MS = 1_000;

/**
 * Pasteboard types a password manager or a clipboard tool sets to say "do not keep this"
 * (nspasteboard.org). Any one present and the entry is skipped.
 */
export const CLIPBOARD_SKIP_MARKERS = [
  'org.nspasteboard.ConcealedType',
  'org.nspasteboard.TransientType',
  'org.nspasteboard.AutoGeneratedType',
] as const;

export const ClipboardEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    id: ClipboardEntryIdSchema,
    kind: z.literal('text'),
    createdAt: z.number(),
    bytes: z.number().int().nonnegative(),
    text: z.string(),
  }),
  z.object({
    id: ClipboardEntryIdSchema,
    kind: z.literal('image'),
    createdAt: z.number(),
    bytes: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);
export type ClipboardEntry = z.infer<typeof ClipboardEntrySchema>;

export const ClipboardHistoryResponseSchema = z.object({
  enabled: z.boolean(),
  entries: z.array(ClipboardEntrySchema),
});
export const ClipboardEntryRequestSchema = z.object({ id: ClipboardEntryIdSchema });

// --- events ------------------------------------------------------------------------

export const CaptureChangedSchema = z.object({
  reason: z.enum(['captures', 'clipboard', 'settings', 'permission', 'shortcut', 'overlay']),
  /** The capture the change is about — the one the shortcut just took, say. */
  captureId: CaptureIdSchema.optional(),
  /** The shortcut froze a frame for the region picker: the renderer opens it. */
  region: CaptureRegionFrameSchema.optional(),
  /** The region overlay closed: what it took, or that it was dismissed. */
  overlay: CaptureOverlayOutcomeSchema.optional(),
});
export type CaptureChanged = z.infer<typeof CaptureChangedSchema>;

// --- helpers -----------------------------------------------------------------------

/** `mstudio-file://capture/captures/<file>` — the URL a capture's bytes are served on. */
export function captureFileUrl(fileName: string, bucket: CaptureBucket = 'captures'): string {
  return `${MSTUDIO_FILE_SCHEME}://${CAPTURE_FILE_HOST}/${bucket}/${encodeURIComponent(fileName)}`;
}

/** The URL a clipboard image entry is served on. */
export const clipboardImageUrl = (id: string): string => captureFileUrl(`${id}.png`, 'clipboard');

/** A capture's file name from its id and type. */
export const captureFileName = (id: string, mime: CaptureMime): string =>
  `${id}.${mime === 'video/webm' ? 'webm' : 'png'}`;

/** `cap-YYYYMMDD-HHMMSS-<hex>` for a moment (local time, so a Finder listing reads naturally). */
export function captureIdFor(at: Date, hex: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `cap-${date}-${time}-${hex}`;
}
