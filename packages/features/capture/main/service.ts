import { copyFile, mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CAPTURE_CREATOR_PROJECT,
  capturePermitted,
  failure,
  ok,
  type CaptureChanged,
  type CaptureDestination,
  type CaptureItem,
  type CaptureOverlayFrame,
  type CapturePermission,
  type CaptureRegionFrame,
  type CaptureRegionRect,
  type CaptureRegionStartResult,
  type CaptureSettings,
  type CaptureSource,
  type CaptureSourceKind,
  type CaptureStatus,
  type ClipboardEntry,
  type GitOpResult,
  captureFileName,
  studioCaptureLink,
} from '@midnite/studio-shared';

import { CAPTURES_DIR, createCaptureStore, type CaptureStore } from './capture-store';
import {
  CLIPBOARD_DIR,
  createClipboardHistory,
  type ClipboardHistory,
  type Timers,
} from './clipboard-history';
import type { DisplayMediaGate } from './display-media';
import { captureFileResolver } from './file-url';
import {
  createOverlayController,
  type CaptureOverlayBounds,
  type CaptureOverlayOpener,
  type OverlayController,
} from './overlay';
import { readPermission, requestPermission } from './permission';
import type { CaptureDesktopSource, CaptureElectron, CaptureImage } from './port';
import { createRecordingWriter, type RecordingWriter } from './recording';
import { createSettingsStore } from './settings-store';
import { createShortcutManager, type ShortcutManager } from './shortcut';
import { createRegionState, grabSource, listSources, regionPixels } from './stills';

/**
 * The Creator half of "Send to…": the composer's import into a repository's Creator ▸ Images project.
 * Studio fills it from its media store; an app without Creator leaves it out and the destination is
 * not offered.
 */
export type CaptureCreatorPort = {
  importImage: (request: {
    repoId: string;
    project: string;
    fileName: string;
    bytes: Uint8Array;
  }) => Promise<GitOpResult<{ project: string; path: string }>>;
};

export type CaptureServiceDeps = {
  /** The directory Capture keeps everything in (captures, clipboard history, settings). */
  dataDir: string;
  electron: CaptureElectron;
  /** The composer's defaults: Studio ships no chord, Midnite Capture ships one. History is off in both. */
  defaults: CaptureSettings;
  emit: (payload: CaptureChanged) => void;
  trashItem: (path: string) => Promise<void>;
  /** The recording gate the composer installed on its session; null, recording is not offered. */
  gate: DisplayMediaGate | null;
  /** Present when this app can import into Creator. */
  creator?: CaptureCreatorPort;
  /**
   * Destinations this app reaches beyond Creator and Studio (Studio: `chat`, `pr-comment`; Midnite
   * Capture: `clipboard`, `finder`). `creator` and `studio` come from the ports below, never from here.
   */
  destinations?: readonly CaptureDestination[];
  /**
   * The desktop-wide region overlay's window opener (`electronOverlayOpener`). Absent, a region is picked
   * in the app window over the same frozen frame.
   */
  overlay?: CaptureOverlayOpener;
  /**
   * Midnite Capture's "Open in Midnite Studio": opens a `midnite-studio://capture` link (the system's
   * `openExternal`). Present only in the standalone app; it is the `studio` destination.
   */
  openStudioLink?: (url: string) => Promise<void>;
  /**
   * Studio's import of a capture the standalone Midnite Capture took: that app's own data directory
   * (`<appData>/Midnite Runtime/apps/capture/capture`), read only — never written.
   */
  importFrom?: { dataDir: string };
  /**
   * Whether the global shortcut may be registered and the clipboard polled at all. A smoke run passes
   * false for both: it must not take a system-wide chord or read the clipboard.
   */
  background: { shortcut: boolean; clipboard: boolean };
  now?: () => number;
  timers?: Timers;
};

export type CaptureService = {
  /** Registers the saved chord and starts clipboard polling if the user turned history on. */
  start: () => Promise<void>;
  /** Releases the chord, stops polling and drops an unfinished recording (quit). */
  dispose: () => Promise<void>;
  status: () => Promise<CaptureStatus>;
  requestPermission: () => Promise<CapturePermission>;
  openPermissionSettings: () => Promise<GitOpResult>;
  sources: (
    kind: CaptureSourceKind,
  ) => Promise<GitOpResult<{ permission: CapturePermission; sources: CaptureSource[] }>>;
  still: (request: {
    mode: 'screen' | 'window';
    sourceId: string;
  }) => Promise<GitOpResult<CaptureItem>>;
  regionBegin: (sourceId?: string) => Promise<GitOpResult<CaptureRegionFrame>>;
  regionPending: () => CaptureRegionFrame | null;
  regionFinish: (pendingId: string, rect: CaptureRegionRect) => Promise<GitOpResult<CaptureItem>>;
  regionCancel: (pendingId: string) => GitOpResult;
  /** Freezes the screen under the pointer and opens the overlay on it, else hands back the frame. */
  regionStart: () => Promise<GitOpResult<CaptureRegionStartResult>>;
  overlayFrame: (token: string) => Promise<GitOpResult<CaptureOverlayFrame>>;
  overlayConfirm: (token: string, rect: CaptureRegionRect) => Promise<GitOpResult<CaptureItem>>;
  overlayCancel: (token: string) => GitOpResult;
  openInStudio: (id: string) => Promise<GitOpResult>;
  importFromApp: (id: string) => Promise<GitOpResult<CaptureItem>>;
  recordingArm: (sourceId: string) => Promise<GitOpResult>;
  recordingBegin: (mime: string) => Promise<GitOpResult<{ recordingId: string }>>;
  recordingChunk: (recordingId: string, bytes: Uint8Array) => Promise<GitOpResult>;
  recordingFinish: (recordingId: string, durationMs: number) => Promise<GitOpResult<CaptureItem>>;
  recordingAbort: (recordingId: string) => Promise<GitOpResult>;
  list: () => Promise<CaptureItem[]>;
  remove: (id: string) => Promise<GitOpResult>;
  reveal: (id: string) => Promise<GitOpResult>;
  copy: (id: string) => Promise<GitOpResult>;
  setSettings: (patch: Partial<CaptureSettings>) => Promise<GitOpResult<CaptureStatus>>;
  clipboardList: () => Promise<{ enabled: boolean; entries: ClipboardEntry[] }>;
  clipboardCopy: (id: string) => Promise<GitOpResult>;
  clipboardRemove: (id: string) => Promise<GitOpResult>;
  clipboardClear: () => Promise<GitOpResult>;
  attachment: (id: string) => Promise<GitOpResult<{ name: string; text: string }>>;
  sendToCreator: (
    id: string,
    repoId: string,
  ) => Promise<GitOpResult<{ project: string; path: string }>>;
  /** The `capture` host's resolver for the composer's `mstudio-file:` handler. */
  fileResolver: (rawUrl: string) => Promise<string | null>;
  /** Fires the shortcut's action — what the registered chord calls. Exported for tests. */
  onShortcut: () => Promise<void>;
  /** For tests and the composer. */
  store: CaptureStore;
  clipboard: ClipboardHistory;
  shortcut: ShortcutManager;
  recording: RecordingWriter;
  overlay: OverlayController;
};

/** The overlay's JPEG quality: it is shown full-size, so it is kept close to the grab. */
export const OVERLAY_JPEG_QUALITY = 90;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const permissionMessage = (permission: CapturePermission) =>
  permission === 'not-determined'
    ? 'Capture needs the Screen Recording permission first.'
    : 'Screen Recording is off for this app. Turn it on in System Settings ▸ Privacy & Security ▸ Screen Recording.';

export function createCaptureService(deps: CaptureServiceDeps): CaptureService {
  const el = deps.electron;
  const now = deps.now ?? Date.now;
  const store = createCaptureStore(deps.dataDir, () => new Date(now()));
  const settings = createSettingsStore(deps.dataDir, deps.defaults);
  const region = createRegionState(now);
  const recording = createRecordingWriter(store, { now });
  const clipboard = createClipboardHistory({
    dataDir: deps.dataDir,
    clipboard: el.clipboard,
    imageFromPng: el.imageFromPng,
    onChanged: () => deps.emit({ reason: 'clipboard' }),
    now,
    ...(deps.timers ? { timers: deps.timers } : {}),
  });

  const destinations: CaptureDestination[] = [
    ...(deps.destinations ?? []).filter((d) => d !== 'creator' && d !== 'studio'),
    ...(deps.creator ? (['creator'] as const) : []),
    ...(deps.openStudioLink ? (['studio'] as const) : []),
  ];

  const overlay = createOverlayController({
    opener: deps.overlay,
    // Blur, Escape-less closes, the OS or a newer overlay: the frozen frame goes with it.
    onDismissed: (session) => {
      region.cancel(session.pendingId);
      deps.emit({ reason: 'overlay', overlay: { outcome: 'cancelled' } });
    },
  });

  /** Gates every grab on the permission. */
  const permitted = <T = void>(): GitOpResult<T> | null => {
    const permission = readPermission(el);
    return capturePermitted(permission) ? null : failure<T>(permissionMessage(permission));
  };

  /** Runs a grab with this app's windows out of the shot when the user wants that. */
  const withWindowsHidden = async <T>(hide: boolean, run: () => Promise<T>): Promise<T> => {
    const restore = hide && el.hideOwnWindows ? await el.hideOwnWindows() : null;
    try {
      return await run();
    } finally {
      restore?.();
    }
  };

  const kindOf = (sourceId: string): CaptureSourceKind =>
    sourceId.startsWith('window:') ? 'window' : 'screen';

  const saveImage = async (
    image: CaptureImage,
    mode: CaptureItem['mode'],
    sourceName: string,
  ): Promise<CaptureItem> => {
    const { width, height } = image.getSize();
    const item = await store.add({
      id: store.newId(),
      kind: 'screenshot',
      mode,
      mime: 'image/png',
      createdAt: now(),
      bytes: image.toPNG(),
      width,
      height,
      sourceName,
    });
    deps.emit({ reason: 'captures', captureId: item.id });
    return item;
  };

  type Frozen = { frame: CaptureRegionFrame; bounds: CaptureOverlayBounds | undefined };

  /** Grabs one screen (absent: the one under the pointer) once, and keeps it for the region. */
  const freezeFor = async (sourceId?: string): Promise<GitOpResult<Frozen>> => {
    const refused = permitted<Frozen>();
    if (refused) return refused;
    const { hideWindows } = await settings.read();
    const pointer = sourceId ? null : el.displayUnderPointer();
    const match: (s: CaptureDesktopSource) => boolean = pointer
      ? (s) => s.display_id === String(pointer.id)
      : (s) => s.id === sourceId;
    const source = await withWindowsHidden(hideWindows, () => grabSource(el, 'screen', match));
    if (!source) return failure('That screen is not available any more.');
    const display = pointer ?? el.displays().find((d) => String(d.id) === source.display_id);
    return ok({ frame: region.freeze(source.thumbnail, source.name), bounds: display?.bounds });
  };

  const freeze = async (sourceId?: string): Promise<GitOpResult<CaptureRegionFrame>> => {
    const frozen = await freezeFor(sourceId);
    return frozen.ok ? ok(frozen.value.frame) : frozen;
  };

  /** Cuts a rectangle from a frozen frame and saves it as a region capture. */
  const cutRegion = async (
    pending: { image: CaptureImage; frame: CaptureRegionFrame },
    rect: CaptureRegionRect,
  ): Promise<CaptureItem> => {
    const cut = pending.image.crop(regionPixels(rect, pending.image.getSize()));
    return saveImage(cut, 'region', pending.frame.sourceName);
  };

  const shortcutManager = createShortcutManager(
    el.globalShortcut,
    () => void service.onShortcut().catch(() => undefined),
    { enabled: deps.background.shortcut },
  );

  const status = async (): Promise<CaptureStatus> => ({
    permission: readPermission(el),
    settings: await settings.read(),
    shortcut: shortcutManager.state(),
    canRecord: deps.gate !== null,
    destinations,
  });

  const applyClipboard = (enabled: boolean) => {
    if (enabled && deps.background.clipboard) clipboard.start();
    else clipboard.stop();
  };

  const service: CaptureService = {
    start: async () => {
      const current = await settings.read();
      shortcutManager.apply(current.shortcut);
      applyClipboard(current.clipboardHistory);
    },
    dispose: async () => {
      shortcutManager.dispose();
      overlay.dispose();
      clipboard.stop();
      deps.gate?.disarm();
      await recording.dispose();
    },
    status,
    requestPermission: async () => {
      const permission = await requestPermission(el);
      deps.emit({ reason: 'permission' });
      return permission;
    },
    openPermissionSettings: async () => {
      try {
        await el.openScreenRecordingSettings();
        return ok();
      } catch (error) {
        return failure(message(error));
      }
    },
    sources: async (kind) => {
      const permission = readPermission(el);
      if (!capturePermitted(permission)) return ok({ permission, sources: [] });
      try {
        return ok({ permission, sources: await listSources(el, kind) });
      } catch (error) {
        return failure(message(error));
      }
    },
    still: async ({ mode, sourceId }) => {
      const refused = permitted<CaptureItem>();
      if (refused) return refused;
      if (kindOf(sourceId) !== mode) return failure('That source is not a ' + mode + '.');
      try {
        const { hideWindows } = await settings.read();
        // A window grab never hides this app: the window asked for may be one of its own.
        const source = await withWindowsHidden(hideWindows && mode === 'screen', () =>
          grabSource(el, mode, (s) => s.id === sourceId),
        );
        if (!source) return failure('That source is not available any more.');
        return ok(await saveImage(source.thumbnail, mode, source.name));
      } catch (error) {
        return failure(message(error));
      }
    },
    regionBegin: async (sourceId) => {
      try {
        return await freeze(sourceId);
      } catch (error) {
        return failure(message(error));
      }
    },
    // A frame an overlay is showing is the overlay's: the in-view picker never takes it over.
    regionPending: () => {
      const frame = region.pending();
      return frame && frame.pendingId === overlay.pendingId() ? null : frame;
    },
    regionFinish: async (pendingId, rect) => {
      const pending = region.take(pendingId);
      if (!pending) return failure('That frozen frame has expired. Take the region again.');
      try {
        return ok(await cutRegion(pending, rect));
      } catch (error) {
        return failure(message(error));
      }
    },
    regionStart: async () => {
      try {
        const frozen = await freezeFor();
        if (!frozen.ok) return frozen;
        const { frame, bounds } = frozen.value;
        if (overlay.open({ pendingId: frame.pendingId, bounds, origin: 'view' }))
          return ok({ surface: 'overlay' as const });
        return ok({ surface: 'in-view' as const, frame });
      } catch (error) {
        return failure(message(error));
      }
    },
    overlayFrame: async (token) => {
      const session = overlay.session(token);
      if (!session) return failure('That overlay is closed.');
      const pending = region.peek(session.pendingId);
      if (!pending) {
        overlay.finish(token);
        deps.emit({
          reason: 'overlay',
          overlay: { outcome: 'error', message: 'The frozen frame expired.' },
        });
        return failure('The frozen frame expired.');
      }
      const { width, height } = pending.image.getSize();
      const jpeg = pending.image.toJPEG(OVERLAY_JPEG_QUALITY);
      return ok({
        image: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`,
        width,
        height,
        sourceName: pending.frame.sourceName,
      });
    },
    overlayConfirm: async (token, rect) => {
      const session = overlay.finish(token);
      if (!session) return failure('That overlay is closed.');
      const pending = region.take(session.pendingId);
      if (!pending) {
        deps.emit({
          reason: 'overlay',
          overlay: { outcome: 'error', message: 'The frozen frame expired.' },
        });
        return failure('That frozen frame has expired. Take the region again.');
      }
      try {
        const item = await cutRegion(pending, rect);
        deps.emit({ reason: 'overlay', overlay: { outcome: 'captured', captureId: item.id } });
        if (session.origin === 'shortcut') {
          // The chord's capture is shown in the app once it is taken — not while the user is selecting.
          el.focusApp?.();
          deps.emit({ reason: 'shortcut', captureId: item.id });
        }
        return ok(item);
      } catch (error) {
        deps.emit({ reason: 'overlay', overlay: { outcome: 'error', message: message(error) } });
        return failure(message(error));
      }
    },
    overlayCancel: (token) => {
      const session = overlay.finish(token);
      if (session) {
        region.cancel(session.pendingId);
        deps.emit({ reason: 'overlay', overlay: { outcome: 'cancelled' } });
      }
      return ok();
    },
    openInStudio: async (id) => {
      if (!deps.openStudioLink) return failure('Midnite Studio is not reachable from this app.');
      const item = await store.get(id);
      if (!item) return failure('That capture is gone.');
      try {
        // Built here from the stored id: the renderer never hands main a URL to open.
        await deps.openStudioLink(studioCaptureLink(item.id));
        return ok();
      } catch {
        return failure('Midnite Studio did not open. Is it installed?');
      }
    },
    importFromApp: async (id) => {
      if (!deps.importFrom) return failure('Importing from Midnite Capture is not available here.');
      const already = await store.get(id);
      if (already) return ok(already);
      try {
        // The other app's store, read only: its index and the one file, never written.
        const source = createCaptureStore(deps.importFrom.dataDir);
        const item = await source.get(id);
        if (!item) return failure('That capture is not in Midnite Capture any more.');
        // The file name is rebuilt from the validated id and type, never taken from the other app's
        // index — a name read from disk does not get to choose a path.
        const fileName = captureFileName(item.id, item.mime);
        if (item.fileName !== fileName)
          return failure('That capture is not one this app can open.');
        await mkdir(store.dir, { recursive: true });
        const target = join(store.dir, fileName);
        const tmp = `${target}.import.tmp`;
        await copyFile(join(deps.importFrom.dataDir, CAPTURES_DIR, fileName), tmp);
        await rename(tmp, target);
        const { bytes: _bytes, ...entry } = item;
        const imported = await store.record({ ...entry, fileName });
        deps.emit({ reason: 'captures', captureId: imported.id });
        return ok(imported);
      } catch (error) {
        return failure(message(error));
      }
    },
    regionCancel: (pendingId) => {
      region.cancel(pendingId);
      return ok();
    },
    recordingArm: async (sourceId) => {
      if (!deps.gate) return failure('Recording is not available in this app.');
      const refused = permitted();
      if (refused) return refused;
      try {
        const kind = kindOf(sourceId);
        const sources = await el.getSources({
          types: [kind],
          thumbnailSize: { width: 1, height: 1 },
        });
        const source = sources.find((s) => s.id === sourceId);
        if (!source) return failure('That source is not available any more.');
        deps.gate.arm({ id: source.id, name: source.name });
        return ok();
      } catch (error) {
        return failure(message(error));
      }
    },
    recordingBegin: async (mime) => {
      if (!deps.gate) return failure('Recording is not available in this app.');
      // A recording is only accepted for a stream the gate actually handed out.
      if (!deps.gate.lastStreamed()) return failure('Pick a screen or window to record first.');
      try {
        return await recording.begin(mime);
      } catch (error) {
        return failure(message(error));
      }
    },
    recordingChunk: async (recordingId, bytes) => {
      try {
        return await recording.chunk(recordingId, bytes);
      } catch (error) {
        await recording.abort(recordingId).catch(() => undefined);
        return failure(message(error));
      }
    },
    recordingFinish: async (recordingId, durationMs) => {
      try {
        const streamed = deps.gate?.lastStreamed() ?? null;
        const result = await recording.finish(
          recordingId,
          durationMs,
          streamed ? { name: streamed.name, mode: kindOf(streamed.id) } : null,
        );
        if (result.ok) deps.emit({ reason: 'captures', captureId: result.value.id });
        return result;
      } catch (error) {
        return failure(message(error));
      }
    },
    recordingAbort: async (recordingId) => {
      try {
        return await recording.abort(recordingId);
      } catch (error) {
        return failure(message(error));
      }
    },
    list: () => store.list(),
    remove: async (id) => {
      const item = await store.get(id);
      if (!item) return ok();
      try {
        await deps.trashItem(store.pathOf(item));
        await store.forget(id);
        deps.emit({ reason: 'captures' });
        return ok();
      } catch (error) {
        return failure(message(error));
      }
    },
    reveal: async (id) => {
      const item = await store.get(id);
      if (!item) return failure('That capture is gone.');
      el.showItemInFolder(store.pathOf(item));
      return ok();
    },
    copy: async (id) => {
      const item = await store.get(id);
      if (!item) return failure('That capture is gone.');
      if (item.kind !== 'screenshot')
        return failure('Only a screenshot can be copied as an image.');
      try {
        await el.clipboard.writeImage(el.imageFromPng(await readFile(store.pathOf(item))));
        return ok();
      } catch (error) {
        return failure(message(error));
      }
    },
    setSettings: async (patch) => {
      try {
        const before = await settings.read();
        const next = await settings.write(patch);
        if (
          patch.shortcut !== undefined &&
          (patch.shortcut !== before.shortcut || shortcutManager.state().state !== 'registered')
        )
          shortcutManager.apply(next.shortcut);
        if (patch.clipboardHistory !== undefined) applyClipboard(next.clipboardHistory);
        deps.emit({ reason: 'settings' });
        return ok(await status());
      } catch (error) {
        return failure(message(error));
      }
    },
    clipboardList: async () => ({
      enabled: (await settings.read()).clipboardHistory,
      entries: await clipboard.list(),
    }),
    clipboardCopy: (id) => clipboard.copy(id),
    clipboardRemove: (id) => clipboard.remove(id),
    clipboardClear: () => clipboard.clear(),
    attachment: async (id) => {
      const item = await store.get(id);
      if (!item) return failure('That capture is gone.');
      const path = store.pathOf(item);
      const what = item.kind === 'screenshot' ? 'Screenshot' : 'Screen recording';
      const size = item.width && item.height ? `, ${item.width}×${item.height}` : '';
      const from = item.sourceName ? ` of "${item.sourceName}"` : '';
      return ok({
        name: item.fileName,
        text: `${what}${from}${size}, saved on this machine at:\n${path}\nRead the file at that path to see it.`,
      });
    },
    sendToCreator: async (id, repoId) => {
      if (!deps.creator) return failure('Creator is not available in this app.');
      const item = await store.get(id);
      if (!item) return failure('That capture is gone.');
      if (item.kind !== 'screenshot')
        return failure('Only a screenshot can go to a Creator project.');
      try {
        return await deps.creator.importImage({
          repoId,
          project: CAPTURE_CREATOR_PROJECT,
          fileName: item.fileName,
          bytes: await readFile(store.pathOf(item)),
        });
      } catch (error) {
        return failure(message(error));
      }
    },
    fileResolver: captureFileResolver({
      captures: store.dir,
      clipboard: join(deps.dataDir, CLIPBOARD_DIR),
    }),
    onShortcut: async () => {
      // The chord is the user's action; it freezes the screen under the pointer for the region picker
      // and brings the app forward to show it. Without the permission it only opens the app on the
      // explanation — never a prompt.
      if (permitted()) {
        el.focusApp?.();
        deps.emit({ reason: 'shortcut' });
        return;
      }
      const frozen = await freezeFor();
      // The desktop overlay first: the user selects on the screen itself, and the app stays where it is.
      if (
        frozen.ok &&
        overlay.open({
          pendingId: frozen.value.frame.pendingId,
          bounds: frozen.value.bounds,
          origin: 'shortcut',
        })
      )
        return;
      el.focusApp?.();
      deps.emit(
        frozen.ok ? { reason: 'shortcut', region: frozen.value.frame } : { reason: 'shortcut' },
      );
    },
    store,
    clipboard,
    shortcut: shortcutManager,
    recording,
    overlay,
  };
  return service;
}
