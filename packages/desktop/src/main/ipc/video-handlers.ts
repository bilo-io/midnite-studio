import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import {
  createVideoProject,
  getVideoProject,
  listVideoProjectFiles,
  listVideoProjects,
  removeVideoProject,
  videoRenderCancel,
  videoRenderList,
  videoRenderStart,
  videoStudioStart,
  videoStudioStatus,
  videoStudioStop,
  videoToolchain,
} from '../video-service';
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
    async ({ projectId, compositionId }) => videoRenderStart(projectId, compositionId),
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
    async ({ projectId, area }) => ({ entries: await listVideoProjectFiles(projectId, area) }),
    () => ({ entries: [] }),
  );
}
