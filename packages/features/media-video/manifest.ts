import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Video as a feature (Phase 113 Theme Q) — video projects discovered
 * under a root (`<repo>/.midnite/media/video/`, an in-repo layout, or the
 * global root), edited in the engine's own studio (Remotion or HyperFrames),
 * rendered into versioned iterations, with a toolchain probe and Setup Video.
 *
 * One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`):
 * a tab, not a view — the app hands `mediaVideoTab` to media-core's
 * `MediaShell`. Video does not use media-core's store (its projects are the
 * engine's, not `.midnite/media/video/<project>/<file>`); the main half owns
 * discovery, the studio dev server and the render queue, spawning the engine's
 * CLIs through the runtime's process runner.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mediaVideoManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.videoProjectList,
    CHANNELS.videoProjectGet,
    CHANNELS.videoProjectCreate,
    CHANNELS.videoProjectRemove,
    CHANNELS.videoStudioStart,
    CHANNELS.videoStudioStop,
    CHANNELS.videoStudioStatus,
    CHANNELS.videoRenderStart,
    CHANNELS.videoRenderCancel,
    CHANNELS.videoRenderList,
    CHANNELS.videoToolchain,
    CHANNELS.videoProjectFiles,
    CHANNELS.videoProjectReadFile,
    CHANNELS.videoFileReveal,
    CHANNELS.videoFileOpen,
    CHANNELS.videoRootGet,
    CHANNELS.videoRootSet,
    CHANNELS.videoRootResolve,
    CHANNELS.videoSetup,
    CHANNELS.videoEngineGet,
    CHANNELS.videoEngineSet,
  ],
  events: [EVENT_CHANNELS.videoStudioChanged, EVENT_CHANNELS.videoRenderProgress],
  mcpTools: [],
});

export type MediaVideoManifest = typeof mediaVideoManifest;
