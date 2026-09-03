import {
  CHANNELS,
  schemas,
  type ForgeProjectFieldsResult,
  type ForgeProjectItemsResult,
  type ForgeProjectsResult,
  type ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import { addItemToProject, clearItemFieldValue, setItemFieldValue } from '../forge/gh-project-write';
import { listProjects, projectFields, projectItems } from '../forge/gh-project';
import { githubForge, noForgeStatus } from './forge-handlers';
import { handle } from './handle';

/**
 * GitHub ProjectV2 IPC (Phase 40 Themes C and E) — the IPC half of
 * `gh-project.ts` (reads, Theme B) and `gh-project-write.ts` (writes, Theme
 * E), registered beside `forge-handlers.ts` rather than folded into it: the
 * `forge-project:` namespace is its own IPC surface (see `channels.ts`), and
 * keeping its handlers in their own module mirrors the read/write split
 * those two files themselves document.
 *
 * Owner and repo are resolved from `.git/config` on this side for the one
 * read channel that needs them, exactly as every other forge read does. The
 * two write channels take only node ids (Theme A's own request shape), so
 * they reach `GITHUB_COM_FORGE` the same way `fields`/`items` already do.
 */
export function registerForgeProjectHandlers(): void {
  handle<typeof schemas.ForgeProjectListRequest, ForgeProjectsResult>(
    CHANNELS.forgeProjectList,
    schemas.ForgeProjectListRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), projects: [], error: null, kind: 'ok' };
      return listProjects(forge);
    },
    (issue) => ({ cli: noForgeStatus(), projects: [], error: issue, kind: 'error' }),
  );

  /*
    `fields` and `items` take only a `projectId` (Theme A's own schema — see
    `ForgeProjectFieldsRequest`/`ForgeProjectItemsRequest`, neither of which
    carries a `repoId`), and that omission is not an oversight: a ProjectV2
    board belongs to a user or an organization, never to a repository, so
    nothing about "which repo is open" bears on reading its fields or items —
    the project's own GraphQL node id is the complete address. `gh-project.ts`
    still asks for a `Forge` because `apiHostFlag` needs a *host* to support
    GitHub Enterprise, but `owner`/`repo` go unused by `projectFields` and
    `projectItems` — both query through `node(id:$projectId)`, never through a
    repository root. `GITHUB_COM_FORGE` below is the honest placeholder for
    that: **GitHub Enterprise hosts are not reachable through these two
    channels**, a limitation forced by Theme A's frozen request shape rather
    than a design choice, and worth revisiting if a `host` (not a whole
    `repoId`) is ever added to those two requests.
  */
  handle<typeof schemas.ForgeProjectFieldsRequest, ForgeProjectFieldsResult>(
    CHANNELS.forgeProjectFields,
    schemas.ForgeProjectFieldsRequest,
    async (req) => projectFields(GITHUB_COM_FORGE, req.projectId),
    (issue) => ({ cli: noForgeStatus(), fields: [], error: issue, kind: 'error' }),
  );

  handle<typeof schemas.ForgeProjectItemsRequest, ForgeProjectItemsResult>(
    CHANNELS.forgeProjectItems,
    schemas.ForgeProjectItemsRequest,
    async (req) => projectItems(GITHUB_COM_FORGE, req.projectId, req.cursor),
    (issue) => ({ cli: noForgeStatus(), items: [], nextCursor: null, error: issue, kind: 'error' }),
  );

  handle<typeof schemas.ForgeProjectSetFieldRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectSetField,
    schemas.ForgeProjectSetFieldRequest,
    async (req) =>
      setItemFieldValue(GITHUB_COM_FORGE, {
        projectId: req.projectId,
        itemId: req.itemId,
        fieldId: req.fieldId,
        value: req.value,
      }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectAddItemRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectAddItem,
    schemas.ForgeProjectAddItemRequest,
    async (req) => addItemToProject(GITHUB_COM_FORGE, { projectId: req.projectId, contentId: req.contentId }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectClearFieldRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectClearField,
    schemas.ForgeProjectClearFieldRequest,
    async (req) =>
      clearItemFieldValue(GITHUB_COM_FORGE, {
        projectId: req.projectId,
        itemId: req.itemId,
        fieldId: req.fieldId,
      }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );
}

/** See the note above `fields`/`items` for why this exists and its one limitation. */
const GITHUB_COM_FORGE = { kind: 'github', host: 'github.com', owner: '', repo: '' } as const;
