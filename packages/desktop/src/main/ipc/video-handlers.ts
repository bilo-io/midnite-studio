import { CHANNELS, failure, schemas, type VideoRootResolution } from '@midnite/studio-shared';

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
  videoRenderCancel,
  videoRenderList,
  videoRenderStart,
  videoEngineGet,
  videoEngineSet,
  videoStudioStart,
  videoStudioStatus,
  videoStudioStop,
  videoToolchain,
} from '../video-service';
import { resolveWorkdir } from '../repo-registry';
import { mediaVideoTemplateRoot } from '../template-path';
import { handle, handleBare } from './handle';

/**
 * Video Studio (Phase 44 Theme H) — global CRUD over discovered projects, the
 * studio lifecycle, and the render queue. Mirrors `workflow-handlers.ts`'s own
 * shape; `video-service.ts` owns every decision this file just forwards.
 */
export function registerVideoHandlers(): void {
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
    async ({ id, title }) => createVideoProject(id, title),
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
      return setupVideoWorkspace(repoPath, mediaVideoTemplateRoot(), engine);
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
    async ({ target, engine }) => videoEngineSet(target, engine, mediaVideoTemplateRoot()),
    (issue) => failure(issue),
  );
}
