import {
  ForgeProjectSchema,
  type Forge,
  type ForgeProjectAddItemInput,
  type ForgeProjectCreateResult,
  type ForgeProjectFieldValue,
  type ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import { describeGraphqlFailure } from './gh-graphql';
import { scopeErrorKind } from './gh-project';
import { apiHostFlag, ghStatus, invalidateGhProbe, LIST_TIMEOUT_MS, runInShell, shellQuote } from './gh-shell';

/**
 * GitHub ProjectV2 writes (Phase 40 Theme E) — a sibling to `gh-project.ts`
 * rather than folded into `gh-write.ts`: the phase doc's own Decision keeps
 * the whole ProjectV2 surface, read and write, in one pair of files rather
 * than splitting it across the pre-existing forge-wide write module.
 *
 * **The value this module sends is polymorphic by definition**, which is
 * exactly the case `gh-write.ts`'s own docblock warns `-f`/`-F` both get
 * wrong: `-f` posts every value as a string (`-f line=42` becomes `"42"` and
 * GitHub rejects it), `-F` type-guesses from the text (a text field whose
 * value is the string `"true"` would be coerced to a boolean). So every
 * mutation here goes through `apiPost`'s pattern — a JSON body on stdin via
 * `--input -` — never through `-f`/`-F` flags, the one place this phase is
 * most likely to be built wrong.
 *
 * **Never optimistic, and never silent.** `ForgeProjectWriteResult` never
 * throws across the boundary — a refused write (a missing scope, a stale
 * option id, `forgeWritesEnabled` off at the surface) is a normal outcome the
 * UI renders next to the control that asked for it.
 */

/**
 * `updateProjectV2ItemFieldValue` — the one per-cell write this phase allows.
 *
 * The mutation's `value` input is itself a union keyed by which of its four
 * writable arms is set (`text` / `number` / `date` / `singleSelectOptionId`);
 * `fieldValueInput` below is what chooses the right one off the contract's
 * own discriminated `ForgeProjectFieldValue` rather than re-deciding the
 * mapping at the call site. `iteration` never reaches here — Theme D's editor
 * never offers one, and this file has nothing to send if it did.
 */
export async function setItemFieldValue(
  forge: Forge,
  request: { projectId: string; itemId: string; fieldId: string; value: ForgeProjectFieldValue },
): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const value = fieldValueInput(request.value);
  if (value === null) {
    return { ok: false, kind: 'error', message: `${request.value.dataType} fields are read-only.` };
  }

  const query =
    'mutation($input:UpdateProjectV2ItemFieldValueInput!){' +
    'updateProjectV2ItemFieldValue(input:$input){projectV2Item{id}}}';
  const variables = {
    input: {
      projectId: request.projectId,
      itemId: request.itemId,
      fieldId: request.fieldId,
      value,
    },
  };

  return runMutation(forge, query, variables);
}

/**
 * The mutation's own `value` input shape, off the contract's `dataType`.
 *
 * Returns `null` for a dataType the mutation cannot accept (`iteration`) —
 * the caller turns that into a refused write rather than sending a body the
 * API would reject anyway.
 */
function fieldValueInput(value: ForgeProjectFieldValue): Record<string, unknown> | null {
  switch (value.dataType) {
    case 'text':
      return { text: value.text };
    case 'number':
      return { number: value.number };
    case 'date':
      return { date: value.date };
    case 'single_select':
      return { singleSelectOptionId: value.optionId };
    default:
      return null;
  }
}

/**
 * `addProjectV2ItemById` — attach an existing issue or PR to the board.
 *
 * `contentId` is the content's own GraphQL node id (an `Issue`/`PullRequest`
 * id, from Theme B's item reads), never an issue number and never a draft —
 * a draft is created on the board directly, not "added" to it.
 *
 * The phase doc's own recommendation: this mutation ships, but the "Add to
 * project ▸" entry points on the Reviews and Issues surfaces do not — the
 * mutation is cheap, the cross-surface plumbing to reach it is a later
 * phase's scope.
 */
export async function addItemToProject(
  forge: Forge,
  request: { projectId: string; contentId: string },
): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const query =
    'mutation($input:AddProjectV2ItemByIdInput!){' + 'addProjectV2ItemById(input:$input){item{id}}}';
  const variables = { input: { projectId: request.projectId, contentId: request.contentId } };

  return runMutation(forge, query, variables);
}

/**
 * `clearProjectV2ItemFieldValue` (Phase 50 Theme C) — empties a cell rather
 * than setting it to something. `setItemFieldValue`'s own `value` input
 * always carries one of `text`/`number`/`date`/`singleSelectOptionId`; none
 * of them can mean "no value," which is exactly what dropping a card on
 * `board-view.tsx`'s "No status" column needs to send.
 */
export async function clearItemFieldValue(
  forge: Forge,
  request: { projectId: string; itemId: string; fieldId: string },
): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const query =
    'mutation($input:ClearProjectV2ItemFieldValueInput!){' +
    'clearProjectV2ItemFieldValue(input:$input){projectV2Item{id}}}';
  const variables = {
    input: { projectId: request.projectId, itemId: request.itemId, fieldId: request.fieldId },
  };

  return runMutation(forge, query, variables);
}

/**
 * One `gh api graphql` mutation with a JSON body on stdin.
 *
 * `printf %s <json> | gh api graphql --input -`, never `-f`/`-F` — see this
 * file's own docblock for why a polymorphic value forces that. Judged on
 * exit code, exactly as `gh-project.ts`'s reads are: `gh api graphql` prints
 * a valid-JSON `errors` array and still exits non-zero on a GraphQL error.
 */
async function runMutation(
  forge: Forge,
  query: string,
  variables: Record<string, unknown>,
): Promise<ForgeProjectWriteResult> {
  const result = await runMutationRaw(forge, query, variables);
  if (!result.ok) return result.failure;
  return { ok: true, kind: 'ok' };
}

/**
 * `runMutation`'s own body, minus the "throw the response away" part — Theme
 * D's create-shaped mutations (`createProjectV2`, and `gh-issue-links.ts`'s
 * `addSubIssue`/`addBlockedBy`) need the parsed JSON response, not just
 * ok/error, so this is the one place the `gh api graphql --input -` shell-out
 * lives; `runMutation` above is the thin wrapper every other write already
 * called it through, unchanged.
 */
async function runMutationRaw(
  forge: Forge,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; payload: unknown } | { ok: false; failure: ForgeProjectWriteResult }> {
  const command =
    `printf %s ${shellQuote(JSON.stringify({ query, variables }))} |` +
    ` gh api graphql${apiHostFlag(forge)} --input -`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    const kind = scopeErrorKind(result.output);
    const failure: ForgeProjectWriteResult =
      kind === 'insufficient-scope'
        ? { ok: false, kind, hint: 'gh auth refresh -s project' }
        : { ok: false, kind: 'error', message: describeGraphqlFailure(result.output) };
    return { ok: false, failure };
  }

  const brace = result.output.indexOf('{');
  if (brace < 0) {
    return { ok: false, failure: { ok: false, kind: 'error', message: 'The response could not be read.' } };
  }
  try {
    return { ok: true, payload: JSON.parse(result.output.slice(brace)) as unknown };
  } catch {
    return { ok: false, failure: { ok: false, kind: 'error', message: 'The response could not be read.' } };
  }
}

/** Digs `data.<path[0]>.<path[1]>…` out of a parsed GraphQL response, or `null`. */
function dig(payload: unknown, path: string[]): unknown {
  let cursor: unknown = payload;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

/*
  ─── Phase 95 Theme D: board CRUD, item add/remove ─────────────────────────
*/

/**
 * `repositoryOwner(login:).id` — `createProjectV2` takes an *owner id*, not a
 * login, and the open repository's owner is the only sensible default (the
 * phase doc scopes board creation to "create a board", not "pick an owner");
 * a future org-picker would widen this, not replace it.
 */
async function resolveOwnerId(forge: Forge): Promise<string | null> {
  const query = 'query($login:String!){repositoryOwner(login:$login){id}}';
  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(query)}` +
    ` -f login=${shellQuote(forge.owner)}`;
  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) return null;
  const brace = result.output.indexOf('{');
  if (brace < 0) return null;
  try {
    const payload = JSON.parse(result.output.slice(brace)) as unknown;
    const id = dig(payload, ['data', 'repositoryOwner', 'id']);
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** `createProjectV2` — a new board owned by the open repository's owner. */
export async function createProject(forge: Forge, title: string): Promise<ForgeProjectCreateResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const ownerId = await resolveOwnerId(forge);
  if (ownerId === null) {
    return { ok: false, kind: 'error', message: `Could not resolve the owner "${forge.owner}".` };
  }

  const query =
    'mutation($input:CreateProjectV2Input!){' +
    'createProjectV2(input:$input){projectV2{id number title url closed}}}';
  const result = await runMutationRaw(forge, query, { input: { ownerId, title } });
  if (!result.ok) return result.failure;

  const raw = dig(result.payload, ['data', 'createProjectV2', 'projectV2']);
  const parsed =
    typeof raw === 'object' && raw !== null
      ? ForgeProjectSchema.safeParse({ ...(raw as Record<string, unknown>), linkedToRepo: false })
      : null;
  if (!parsed || !parsed.success) {
    return { ok: false, kind: 'error', message: 'The board was created, but could not be read back.' };
  }
  return { ok: true, kind: 'ok', project: parsed.data };
}

/** `updateProjectV2` — rename a board, or close/reopen it. */
export async function editProject(
  forge: Forge,
  request: { projectId: string; title?: string; closed?: boolean },
): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const input: Record<string, unknown> = { projectId: request.projectId };
  if (request.title !== undefined) input['title'] = request.title;
  if (request.closed !== undefined) input['closed'] = request.closed;

  const query = 'mutation($input:UpdateProjectV2Input!){updateProjectV2(input:$input){projectV2{id}}}';
  return runMutation(forge, query, { input });
}

/** `deleteProjectV2` — irreversible on GitHub. The caller's blast-radius
 *  confirm has already run by the time this is called. */
export async function deleteProject(forge: Forge, projectId: string): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const query = 'mutation($input:DeleteProjectV2Input!){deleteProjectV2(input:$input){projectV2{id}}}';
  return runMutation(forge, query, { input: { projectId } });
}

/**
 * An existing issue/PR (`contentId`, `addProjectV2ItemById`) or a brand-new
 * draft (`draftTitle`/`draftBody`, `addProjectV2DraftIssue`) — the union
 * `ForgeProjectAddItemInputSchema` declares, narrowed here to pick the
 * matching mutation rather than guessing which was meant.
 */
export async function addProjectItem(
  forge: Forge,
  request: { projectId: string } & ForgeProjectAddItemInput,
): Promise<ForgeProjectWriteResult> {
  if ('contentId' in request) {
    return addItemToProject(forge, { projectId: request.projectId, contentId: request.contentId });
  }

  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const query =
    'mutation($input:AddProjectV2DraftIssueInput!){' +
    'addProjectV2DraftIssue(input:$input){projectItem{id}}}';
  const variables = {
    input: { projectId: request.projectId, title: request.draftTitle, body: request.draftBody },
  };
  return runMutation(forge, query, variables);
}

/** `deleteProjectV2Item` — removes a row from the board, not the issue/PR it
 *  points at. The inverse of `addProjectItem` above. */
export async function removeProjectItem(
  forge: Forge,
  request: { projectId: string; itemId: string },
): Promise<ForgeProjectWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'gh is not ready.' };

  const query =
    'mutation($input:DeleteProjectV2ItemInput!){deleteProjectV2Item(input:$input){deletedItemId}}';
  return runMutation(forge, query, {
    input: { projectId: request.projectId, itemId: request.itemId },
  });
}
