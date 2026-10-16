import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The shared media feature (Phase 113 Theme Q) — the plumbing Creator, Media,
 * Gamer and Studio all compose: the Media shell and its tab registry, the
 * media kit, and the repo-scoped media store, watcher and ffmpeg export.
 *
 * `media` is one placement folder split into several packages
 * (`FEATURE_PACKAGE_SPLITS`): this one, then one per tab group. The tabs are
 * not here — each app hands `MediaShell` the descriptors it composes, so the
 * `media` view is each app's own composition (Studio's is
 * `packages/app/src/features/media/media-view.tsx`) and `views` is empty.
 * Settings ▸ Media stays Studio's for now: it edits Studio's `ui-store`.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mediaCoreManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaProjectList,
    CHANNELS.mediaProjectCreate,
    CHANNELS.mediaProjectRename,
    CHANNELS.mediaProjectRemove,
    CHANNELS.mediaFileList,
    CHANNELS.mediaFileRead,
    CHANNELS.mediaFileWrite,
    CHANNELS.mediaFileRename,
    CHANNELS.mediaFileRemove,
    CHANNELS.mediaReveal,
    CHANNELS.mediaFfmpegStatus,
    CHANNELS.mediaExport,
    CHANNELS.mediaExportCancel,
  ],
  events: [EVENT_CHANNELS.mediaChanged, EVENT_CHANNELS.mediaExportProgress],
  mcpTools: [],
});

export type MediaCoreManifest = typeof mediaCoreManifest;
