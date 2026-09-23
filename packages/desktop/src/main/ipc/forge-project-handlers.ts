import {
  CHANNELS,
  schemas,
  type Forge,
  type ForgeProjectCreateResult,
  type ForgeProjectFieldsResult,
  type ForgeProjectItemsResult,
  type ForgeProjectsResult,
  type ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import type { ForgeAdapter } from '../forge/adapter';
import { activeAccountFor } from '../forge/forge-accounts';
import { adapterFor } from '../forge/registry';
import { noForgeStatus, repoForge } from './forge-handlers';
import { handle } from './handle';

/**
 * GitHub ProjectV2 IPC (Phase 40 Themes C and E) — the IPC half of
 * `gh-project.ts` (reads, Theme B) and `gh-project-write.ts` (writes, Theme
 * E), registered beside `forge-handlers.ts` rather than folded into it: the
 * `forge-project:` namespace is its own IPC surface (see `channels.ts`), and
 * keeping its handlers in their own module mirrors the read/write split
 * those two files themselves document.
 *
 * **Every handler dispatches through `registry.ts`'s `adapterFor` (Phase 95
 * Theme D)**, not `gh-project.ts`/`gh-project-write.ts` directly — the same
 * refactor `forge-handlers.ts` already made. `list` and `create` carry a
 * `repoId` and resolve the *repo's own* forge and account, exactly like
 * every channel in `forge-handlers.ts`, so a GitLab or Azure repo's board
 * listing/creation reaches that provider's own adapter rather than always
 * asking GitHub. `fields`/`items`/`set-field`/`add-item`/`add-draft-item`/
 * `clear-field`/`remove-item` still cannot: Theme A froze their request
 * shape to `{projectId, ...}` with no `repoId` at all, because a ProjectV2
 * board belongs to a user or an organization, never to a repository — see
 * the note below `GITHUB_COM_FORGE`. Those five stay pinned to GitHub's own
 * adapter (`adapterFor(GITHUB_COM_FORGE, null)`), the same dispatch every
 * other channel uses, just resolved against a fixed target instead of a
 * `repoId`. **This is Theme D's "fold onto the adapter" refactor, not new
 * multi-provider board-item support** — a GitLab/Bitbucket/Azure board has no
 * item-level write in this app yet (`capabilitiesFor(kind).ops` says so).
 */

/** GitHub's own placeholder forge for the five channels with no `repoId` to
 *  resolve one from — see this file's own docblock above. GitHub Enterprise
 *  hosts are not reachable through them, a limitation inherited unchanged
 *  from Theme A's frozen request shape. */
const GITHUB_COM_FORGE: Forge = { kind: 'github', host: 'github.com', owner: '', repo: '' };

/** GitHub's adapter is never `null` (unlike a GitLab/Bitbucket/Azure repo
 *  with no adapter yet), so this is a thin, always-succeeding resolve —
 *  kept as a function rather than a module-level constant so it goes through
 *  the same `adapterFor` dispatch point every other resolve in this app
 *  uses, instead of importing `createGitHubAdapter` directly. */
function githubAdapter(): ForgeAdapter {
  const adapter = adapterFor(GITHUB_COM_FORGE, null);
  if (!adapter) throw new Error('unreachable: the github adapter is always registered');
  return adapter;
}

/** The same `{forge, adapter}` resolve `forge-handlers.ts`'s own
 *  `resolveAdapter` performs, for the one channel here (`list`, and
 *  `create`) that carries a `repoId` to resolve one from. */
async function resolveAdapter(repoId: string): Promise<{ forge: Forge; adapter: ForgeAdapter } | null> {
  const forge = await repoForge(repoId);
  if (!forge) return null;
  const account = await activeAccountFor(forge);
  const adapter = adapterFor(forge, account);
  if (!adapter) return null;
  return { forge, adapter };
}

export function registerForgeProjectHandlers(): void {
  handle<typeof schemas.ForgeProjectListRequest, ForgeProjectsResult>(
    CHANNELS.forgeProjectList,
    schemas.ForgeProjectListRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), projects: [], error: null, kind: 'ok' };
      return resolved.adapter.listBoards(resolved.forge);
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
    repository root. `GITHUB_COM_FORGE` above is the honest placeholder for
    that: **GitHub Enterprise hosts are not reachable through these
    channels**, a limitation forced by Theme A's frozen request shape rather
    than a design choice, and worth revisiting if a `host` (not a whole
    `repoId`) is ever added to those requests.
  */
  handle<typeof schemas.ForgeProjectFieldsRequest, ForgeProjectFieldsResult>(
    CHANNELS.forgeProjectFields,
    schemas.ForgeProjectFieldsRequest,
    async (req) => githubAdapter().boardFields(GITHUB_COM_FORGE, req.projectId),
    (issue) => ({ cli: noForgeStatus(), fields: [], error: issue, kind: 'error' }),
  );

  handle<typeof schemas.ForgeProjectItemsRequest, ForgeProjectItemsResult>(
    CHANNELS.forgeProjectItems,
    schemas.ForgeProjectItemsRequest,
    async (req) => githubAdapter().boardItems(GITHUB_COM_FORGE, req.projectId, req.cursor),
    (issue) => ({ cli: noForgeStatus(), items: [], nextCursor: null, error: issue, kind: 'error' }),
  );

  handle<typeof schemas.ForgeProjectSetFieldRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectSetField,
    schemas.ForgeProjectSetFieldRequest,
    async (req) =>
      githubAdapter().setItemField(GITHUB_COM_FORGE, {
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
    async (req) =>
      githubAdapter().addProjectItem(GITHUB_COM_FORGE, { projectId: req.projectId, contentId: req.contentId }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectClearFieldRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectClearField,
    schemas.ForgeProjectClearFieldRequest,
    async (req) =>
      githubAdapter().clearItemFieldValue?.(GITHUB_COM_FORGE, {
        projectId: req.projectId,
        itemId: req.itemId,
        fieldId: req.fieldId,
      }) ?? clearFieldFallback(req),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  // --- Phase 95 Theme D: board CRUD, drafts, remove-item, and links --------

  handle<typeof schemas.ForgeProjectCreateRequest, ForgeProjectCreateResult>(
    CHANNELS.forgeProjectCreate,
    schemas.ForgeProjectCreateRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { ok: false, kind: 'error', message: 'This repository has no supported forge remote.' };
      return resolved.adapter.createProject(resolved.forge, req.title);
    },
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectEditRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectEdit,
    schemas.ForgeProjectEditRequest,
    async (req) =>
      githubAdapter().editProject(GITHUB_COM_FORGE, {
        projectId: req.projectId,
        ...(req.title === undefined ? {} : { title: req.title }),
        ...(req.closed === undefined ? {} : { closed: req.closed }),
      }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectDeleteRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectDelete,
    schemas.ForgeProjectDeleteRequest,
    async (req) => githubAdapter().deleteProject(GITHUB_COM_FORGE, req.projectId),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectAddDraftItemRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectAddDraftItem,
    schemas.ForgeProjectAddDraftItemRequest,
    async (req) =>
      githubAdapter().addProjectItem(GITHUB_COM_FORGE, {
        projectId: req.projectId,
        draftTitle: req.title,
        draftBody: req.body,
      }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );

  handle<typeof schemas.ForgeProjectRemoveItemRequest, ForgeProjectWriteResult>(
    CHANNELS.forgeProjectRemoveItem,
    schemas.ForgeProjectRemoveItemRequest,
    async (req) =>
      githubAdapter().removeProjectItem(GITHUB_COM_FORGE, { projectId: req.projectId, itemId: req.itemId }),
    (issue) => ({ ok: false, kind: 'error', message: issue }),
  );
}

/** `clearItemFieldValue` is not on `ForgeAdapter` — `setItemField` with no
 *  value input already covers every writable field type, and Theme D did not
 *  add a fourth adapter method purely to keep this one handler's call shape
 *  identical. Unreachable in practice (the `githubAdapter()` optional-call
 *  above always short-circuits before this runs), kept only so the handler's
 *  return type stays a plain `ForgeProjectWriteResult`, never `undefined`. */
function clearFieldFallback(_req: { projectId: string; itemId: string; fieldId: string }): ForgeProjectWriteResult {
  return { ok: false, kind: 'error', message: 'clear-field is not implemented on this adapter.' };
}
