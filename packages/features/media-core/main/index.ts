import { join } from 'node:path';

import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  ok,
  schemas,
  type FfmpegStatus,
  type GitOpResult,
} from '@midnite/studio-shared';

import { mediaCoreManifest } from '../manifest';
import { cancelFfmpegExport, isFfmpegFormat, runFfmpegExport } from './export-service';
import type { MediaService } from './media-service';

export { mediaCoreManifest, type MediaCoreManifest } from '../manifest';
export { createMediaService, type MediaService, type MediaServiceDeps } from './media-service';
export { createMediaStore, type MediaStore, type MediaStoreDeps } from './media-store';
export * from './export-service';
export { createSerialQueue, type SerialQueue } from './serial-queue';

/**
 * media-core's main half (Phase 113 Theme Q): the repo-scoped media store's
 * IPC, the ffmpeg probe and the ffmpeg export. Never imports `electron` —
 * Finder, the save dialog and the ffmpeg probe arrive as services, so Studio
 * and Creator each answer them their own way and the handlers stay testable
 * under plain vitest.
 */
export type MediaCoreMainServices = {
  media: MediaService;
  /** Show a path in Finder (`shell.showItemInFolder`). */
  revealPath: (absPath: string) => void;
  ffmpegStatus: () => Promise<FfmpegStatus>;
  /** The native save dialog, sheeted on the asking window; null when dismissed. */
  pickSavePath: (options: {
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  /** Studio's Video tab: an iteration under the video root, re-confined there. Absent → not exportable. */
  resolveVideoExportInput?: (projectId: string, name: string) => Promise<string | null>;
};

/** Every op answers the envelope; a thrown fs error becomes a failure, never an IPC rejection. */
const guard = async <R extends GitOpResult<unknown> | GitOpResult>(run: () => Promise<R>): Promise<R | GitOpResult> => {
  try {
    return await run();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
};

export const mediaCoreMain = defineFeatureMain<MediaCoreMainServices>({
  feature: mediaCoreManifest.feature,
  channels: mediaCoreManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { store, ensureWatcher } = services.media;
    const invalid = (issue: string) => failure(issue);

    ipc.handle(
      CHANNELS.mediaProjectList,
      schemas.MediaProjectListRequest,
      (req) =>
        guard(async () => {
          void ensureWatcher(req.repoId);
          return store.listProjects(req);
        }),
      invalid,
    );
    ipc.handle(CHANNELS.mediaProjectCreate, schemas.MediaProjectCreateRequest, (req) => guard(() => store.createProject(req)), invalid);
    ipc.handle(CHANNELS.mediaProjectRename, schemas.MediaProjectRenameRequest, (req) => guard(() => store.renameProject(req)), invalid);
    ipc.handle(CHANNELS.mediaProjectRemove, schemas.MediaProjectRemoveRequest, (req) => guard(() => store.removeProject(req)), invalid);
    ipc.handle(CHANNELS.mediaFileList, schemas.MediaFileListRequest, (req) => guard(() => store.listFiles(req)), invalid);
    ipc.handle(CHANNELS.mediaFileRead, schemas.MediaFileReadRequest, (req) => guard(() => store.readFile(req)), invalid);
    ipc.handle(CHANNELS.mediaFileWrite, schemas.MediaFileWriteRequest, (req) => guard(() => store.writeFile(req)), invalid);
    ipc.handle(CHANNELS.mediaFileRename, schemas.MediaFileRenameRequest, (req) => guard(() => store.renameFile(req)), invalid);
    ipc.handle(CHANNELS.mediaFileRemove, schemas.MediaFileRemoveRequest, (req) => guard(() => store.removeFile(req)), invalid);
    ipc.handle(
      CHANNELS.mediaReveal,
      schemas.MediaRevealRequest,
      (req) =>
        guard(async () => {
          const target = await store.resolveForReveal(req);
          if (!target) return failure('Not found.');
          services.revealPath(target);
          return ok();
        }),
      invalid,
    );

    ipc.handleBare(CHANNELS.mediaFfmpegStatus, async () => ({ ffmpeg: await services.ffmpegStatus() }));

    ipc.handle(
      CHANNELS.mediaExport,
      schemas.MediaExportRequest,
      (req) =>
        guard(async () => {
          if (!isFfmpegFormat(req.format)) return failure(`${req.format} is not an ffmpeg export.`);
          const ffmpeg = await services.ffmpegStatus();
          if (!ffmpeg.found) return failure(ffmpeg.reason);
          const source = req.source;
          // Theme D's `video` arm: an iteration under the resolved video root,
          // re-confined there — never an absolute path from the renderer.
          const input =
            source.kind === 'video'
              ? ((await services.resolveVideoExportInput?.(source.projectId, source.name)) ?? null)
              : await store.resolveForRead(source);
          if (!input) return failure('Source file not found.');
          const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[req.format];
          const sourceName = source.kind === 'video' ? source.name : source.path;
          const stem = sourceName.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'export';
          const dest = await services.pickSavePath({
            defaultPath: join(req.defaultDir ?? '', `${stem}.${ext}`),
            filters: [{ name: label, extensions: [ext] }],
          });
          if (!dest) return failure('cancelled');
          return runFfmpegExport(
            { exportId: req.exportId, format: req.format, input, dest, options: req.options },
            { ffmpegPath: ffmpeg.path, emit: (event) => ctx.emit(EVENT_CHANNELS.mediaExportProgress, event) },
          );
        }),
      invalid,
    );

    ipc.handle(CHANNELS.mediaExportCancel, schemas.MediaExportCancelRequest, ({ exportId }) => cancelFfmpegExport(exportId), invalid);
  },
});
