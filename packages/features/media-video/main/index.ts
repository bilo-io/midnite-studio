import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, schemas, type VideoRootResolution } from '@midnite/studio-shared';

import { mediaVideoManifest } from '../manifest';
import {
  createVideoProject,
  getVideoProject,
  getVideoRoot,
  listVideoProjectFiles,
  listVideoProjects,
  openVideoFile,
  readVideoProjectFile,
  removeVideoProject,
  resolveVideoRootFor,
  revealVideoFile,
  setupVideoWorkspace,
  setVideoRoot,
  videoEngineGet,
  videoEngineSet,
  videoRenderCancel,
  videoRenderList,
  videoRenderStart,
  videoStudioStart,
  videoStudioStatus,
  videoStudioStop,
  videoToolchain,
} from './video-service';

export { mediaVideoManifest, type MediaVideoManifest } from '../manifest';
export {
  configureVideo,
  effectiveVideoRoot,
  resolveHandoffPath,
  stopAllVideoProcesses,
  type VideoServiceHost,
} from './video-service';
export { createProjectsStore, nullProjectsStore, type ProjectsStore } from './video/projects-store';

/**
 * The Video feature's main half (Phase 113 Theme Q): project CRUD over the
 * discovered root, the studio lifecycle, the render queue, the toolchain probe
 * and Setup Video. `video-service.ts` owns every decision this file forwards.
 *
 * The composer calls `configureVideo` once at boot (its settings store, the
 * window event push and the OS handoffs), then registers with the two
 * environment lookups only it can answer — a repository's working directory
 * (Studio's repo registry; Creator's one media root) and where the packaged
 * `templates/media-video/` tree lives. Nothing here imports `electron`, and
 * the engine's CLIs run through the runtime's process runner.
 */
export type MediaVideoMainServices = {
  /** A repository id → the directory its checkout lives in, or null when it is not open. */
  resolveWorkdir: (repoId: string) => Promise<string | null>;
  /** The `templates/media-video` directory Setup Video and an engine switch copy from. */
  templateRoot: () => string;
};

export const mediaVideoMain = defineFeatureMain<MediaVideoMainServices>({
  feature: mediaVideoManifest.feature,
  channels: mediaVideoManifest.ipc,
  register(ctx, { resolveWorkdir, templateRoot }) {
    const { handle, handleBare } = ctx.ipc;
    handleBare(CHANNELS.videoProjectList, async () => ({ projects: await listVideoProjects() }));

    handle(
      CHANNELS.videoProjectGet,
      schemas.VideoProjectGetRequest,
      async ({ id }) => ({ project: await getVideoProject(id) }),
      () => ({ project: null }),
    );

    handle(
      CHANNELS.videoProjectCreate,
      schemas.VideoProjectCreateRequest,
      async ({ id, title, template }) => createVideoProject(id, title, template),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoProjectRemove,
      schemas.VideoProjectRemoveRequest,
      async ({ id }) => removeVideoProject(id),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoStudioStart,
      schemas.VideoStudioStartRequest,
      async ({ projectId }) => videoStudioStart(projectId),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoStudioStop,
      schemas.VideoStudioStopRequest,
      async ({ projectId }) => videoStudioStop(projectId),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoStudioStatus,
      schemas.VideoStudioStatusRequest,
      async ({ projectId }) => ({ status: videoStudioStatus(projectId) }),
      () => ({ status: { state: 'stopped' as const } }),
    );

    handle(
      CHANNELS.videoRenderStart,
      schemas.VideoRenderStartRequest,
      async ({ projectId, compositionId, options }) => videoRenderStart(projectId, compositionId, options),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoRenderCancel,
      schemas.VideoRenderCancelRequest,
      async ({ renderId }) => videoRenderCancel(renderId),
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoRenderList,
      schemas.VideoRenderListRequest,
      async ({ projectId }) => ({ renders: videoRenderList(projectId) }),
      () => ({ renders: [] }),
    );

    const unresolvedToolchain = {
      toolchain: {
        node: { found: false as const, reason: 'Invalid request.' },
        npx: { found: false as const, reason: 'Invalid request.' },
        skills: {
          videoWriteScript: { found: false as const, reason: 'Invalid request.' },
          videoExecuteScript: { found: false as const, reason: 'Invalid request.' },
        },
      },
    };
    handle(
      CHANNELS.videoToolchain,
      schemas.VideoToolchainRequest,
      async () => ({ toolchain: await videoToolchain() }),
      () => unresolvedToolchain,
    );

    handle(
      CHANNELS.videoProjectFiles,
      schemas.VideoProjectFilesRequest,
      async ({ projectId, area, recursive }) => ({
        entries: await listVideoProjectFiles(projectId, area, recursive === true),
      }),
      () => ({ entries: [] }),
    );

    handle(
      CHANNELS.videoProjectReadFile,
      schemas.VideoProjectReadFileRequest,
      async ({ projectId, relPath }) => ({ content: await readVideoProjectFile(projectId, relPath) }),
      () => ({ content: null }),
    );

    handle(
      CHANNELS.videoFileReveal,
      schemas.VideoFileHandoffRequest,
      async ({ projectId, area, name }) => revealVideoFile(projectId, area, name),
      (issue) => ({ ok: false, message: issue }),
    );

    handle(
      CHANNELS.videoFileOpen,
      schemas.VideoFileHandoffRequest,
      async ({ projectId, area, name }) => openVideoFile(projectId, area, name),
      (issue) => ({ ok: false, message: issue }),
    );

    handleBare(CHANNELS.videoRootGet, async () => ({ root: await getVideoRoot() }));

    handle(
      CHANNELS.videoRootSet,
      schemas.VideoRootSetRequest,
      async ({ root }) => {
        await setVideoRoot(root);
        return { root };
      },
      () => ({ root: null }),
    );

    handle(
      CHANNELS.videoRootResolve,
      schemas.VideoRootResolveRequest,
      async ({ repoId }) => resolveVideoRootFor(repoId ? await resolveWorkdir(repoId) : null),
      (): VideoRootResolution => ({ root: null, source: null, setupTarget: null }),
    );

    handle(
      CHANNELS.videoSetup,
      schemas.VideoSetupRequest,
      async ({ repoId, engine }) => {
        const repoPath = await resolveWorkdir(repoId);
        if (!repoPath) return failure('That repository is not open.');
        return setupVideoWorkspace(repoPath, templateRoot(), engine);
      },
      (issue) => failure(issue),
    );

    handle(
      CHANNELS.videoEngineGet,
      schemas.VideoEngineGetRequest,
      async ({ target }) => videoEngineGet(target),
      () => ({ root: null, engine: 'remotion' as const, needsInstall: false, appDir: null }),
    );

    handle(
      CHANNELS.videoEngineSet,
      schemas.VideoEngineSetRequest,
      async ({ target, engine }) => videoEngineSet(target, engine, templateRoot()),
      (issue) => failure(issue),
    );
  },
});
