import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  schemas,
  type CaptureChanged,
} from '@midnite/studio-shared';

import { captureManifest } from '../manifest';
import type { CaptureService } from './service';

export { captureManifest, type CaptureManifest } from '../manifest';
export { CAPTURES_DIR, createCaptureStore, type CaptureStore } from './capture-store';
export {
  CLIPBOARD_DIR,
  createClipboardHistory,
  isMarked,
  type ClipboardHistory,
  type Timers,
} from './clipboard-history';
export {
  createDisplayMediaGate,
  type ArmedSource,
  type DisplayMediaGate,
  type DisplayMediaRequest,
  type DisplayMediaStreams,
  type PermissionDetails,
} from './display-media';
export { captureFileResolver, resolveCaptureFileUrl, type CaptureFileDirs } from './file-url';
export { readPermission, requestPermission } from './permission';
export type {
  CaptureClipboard,
  CaptureDesktopSource,
  CaptureDisplay,
  CaptureElectron,
  CaptureGlobalShortcut,
  CaptureImage,
} from './port';
export {
  createCaptureService,
  type CaptureCreatorPort,
  type CaptureService,
  type CaptureServiceDeps,
} from './service';
export { createShortcutManager, type ShortcutManager } from './shortcut';
export { NO_DESKTOP_OVERLAY } from './stills';

/** The data directory a composer gives Capture, under its own userData. */
export const CAPTURE_DATA_DIR = 'capture';

/** Capture's one event, bound to a composer's `emit` — what it passes to `createCaptureService`. */
export const captureEmitter =
  (emit: (channel: string, payload: unknown) => void) =>
  (payload: CaptureChanged): void =>
    emit(EVENT_CHANNELS.captureChanged, payload);

export type CaptureMainServices = { capture: CaptureService };

/**
 * The capture feature's main half (Phase 113 Theme K). The service is the composer's — it decides the
 * data directory, wires the real Electron port, installs the recording gate on its session and says
 * which Send to… destinations it reaches — so this module never imports `electron`.
 */
export const captureMain = defineFeatureMain<CaptureMainServices>({
  feature: captureManifest.feature,
  channels: captureManifest.ipc,
  register(ctx, { capture }) {
    const invalid = (issue: string) => failure(issue);
    /** Runs an op so that a throw comes back as the error envelope, never across the boundary. */
    const safe = async <R>(run: () => Promise<R> | R): Promise<R> => {
      try {
        return await run();
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error)) as R;
      }
    };

    ctx.ipc.handleBare(CHANNELS.captureStatus, () => capture.status());
    ctx.ipc.handleBare(CHANNELS.captureRequestPermission, async () => ({
      permission: await capture.requestPermission(),
    }));
    ctx.ipc.handleBare(CHANNELS.captureOpenPermissionSettings, () =>
      safe(() => capture.openPermissionSettings()),
    );
    ctx.ipc.handle(
      CHANNELS.captureSources,
      schemas.CaptureSourcesRequest,
      ({ kind }) => safe(() => capture.sources(kind)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureStill,
      schemas.CaptureStillRequest,
      (req) => safe(() => capture.still(req)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRegionBegin,
      schemas.CaptureRegionBeginRequest,
      ({ sourceId }) => safe(() => capture.regionBegin(sourceId)),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.captureRegionPending, () => ({ frame: capture.regionPending() }));
    ctx.ipc.handle(
      CHANNELS.captureRegionFinish,
      schemas.CaptureRegionFinishRequest,
      ({ pendingId, rect }) => safe(() => capture.regionFinish(pendingId, rect)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRegionCancel,
      schemas.CaptureRegionCancelRequest,
      ({ pendingId }) => capture.regionCancel(pendingId),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRecordingArm,
      schemas.CaptureRecordingArmRequest,
      ({ sourceId }) => safe(() => capture.recordingArm(sourceId)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRecordingBegin,
      schemas.CaptureRecordingBeginRequest,
      ({ mime }) => safe(() => capture.recordingBegin(mime)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRecordingChunk,
      schemas.CaptureRecordingChunkRequest,
      ({ recordingId, bytes }) => safe(() => capture.recordingChunk(recordingId, bytes)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRecordingFinish,
      schemas.CaptureRecordingFinishRequest,
      ({ recordingId, durationMs }) => safe(() => capture.recordingFinish(recordingId, durationMs)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureRecordingAbort,
      schemas.CaptureRecordingAbortRequest,
      ({ recordingId }) => safe(() => capture.recordingAbort(recordingId)),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.captureList, async () => ({ captures: await capture.list() }));
    ctx.ipc.handle(
      CHANNELS.captureDelete,
      schemas.CaptureDeleteRequest,
      ({ id }) => safe(() => capture.remove(id)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureReveal,
      schemas.CaptureRevealRequest,
      ({ id }) => safe(() => capture.reveal(id)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureCopy,
      schemas.CaptureCopyRequest,
      ({ id }) => safe(() => capture.copy(id)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureSettingsSet,
      schemas.CaptureSettingsSetRequest,
      (patch) => safe(() => capture.setSettings(patch)),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.captureClipboardList, () => capture.clipboardList());
    ctx.ipc.handle(
      CHANNELS.captureClipboardCopy,
      schemas.CaptureClipboardCopyRequest,
      ({ id }) => safe(() => capture.clipboardCopy(id)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureClipboardDelete,
      schemas.CaptureClipboardDeleteRequest,
      ({ id }) => safe(() => capture.clipboardRemove(id)),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.captureClipboardClear, () => safe(() => capture.clipboardClear()));
    ctx.ipc.handle(
      CHANNELS.captureAttachment,
      schemas.CaptureAttachmentRequest,
      ({ id }) => safe(() => capture.attachment(id)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.captureSendToCreator,
      schemas.CaptureSendToCreatorRequest,
      ({ id, repoId }) => safe(() => capture.sendToCreator(id, repoId)),
      invalid,
    );
  },
});
