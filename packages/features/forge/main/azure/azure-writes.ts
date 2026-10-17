import type {
  Forge,
  ForgeAccount,
  ForgeCliStatus,
  ForgeIssueCreateResult,
  ForgeIssueEditInput,
  ForgeLinkWriteResult,
  ForgeMergeMethod,
  ForgeProjectAddItemInput,
  ForgeProjectCreateResult,
  ForgeProjectWriteResult,
  ForgeReviewEvent,
  ForgeWriteResult,
} from '@midnite/studio-shared';

import { withBlockedByLine, withoutBlockedByLine } from '../body-link-fallback';
import {
  azGet,
  azPatch,
  azPost,
  azPut,
  azureCliStatus,
  azureRequest,
  azWorkItemCreate,
  azWorkItemPatch,
  repoSegment,
  stateCategoriesFor,
} from './azure-client';
import { asStringLoose, fields, row } from './azure-json';
import { issueDetail } from './azure-reads';

/**
 * The write half of Azure DevOps's adapter — the phase doc's own scope:
 * "comment on a PR or work item, vote, resolve a thread, transition a work
 * item's state." `mergePull` and `markReady` are real Azure actions and are
 * implemented properly; `requestReview` needs an identity-resolution picker
 * this app does not build (the same gap Bitbucket's own write module leaves
 * open, for the identical reason) and `rerunChecks` has no selective-retry
 * endpoint in Azure's public REST API at all — both report an honest
 * `unsupportedWrite` rather than a guess.
 */

function notReady(cli: ForgeCliStatus): ForgeWriteResult {
  return { ok: false, cli, error: cli.hint || null };
}

function fromResult(cli: ForgeCliStatus, ok: boolean, error: string | null): ForgeWriteResult {
  return { ok, cli, error };
}

async function unsupportedWrite(account: ForgeAccount | null, message: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  return { ok: false, cli, error: message };
}

// ─── Comments ─────────────────────────────────────────────────────────────

export async function commentPull(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPost(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}/threads`, {
    comments: [{ content: body, commentType: 'text' }],
    status: 'active',
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function commentIssue(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPost(forge, account, `wit/workItems/${number}/comments`, { text: body }, { 'api-version': '7.1-preview.3' });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function replyToReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  // `commentId` here is actually the thread id — see `azure-reads.ts`'s
  // `pullThreads`, whose `ForgeReviewComment.databaseId` is the thread id,
  // not the comment id, because a reply targets the thread as a whole.
  const result = await azPost(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${request.number}/threads/${request.commentId}/comments`,
    { content: request.body, commentType: 'text' },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * A brand-new inline thread. Azure anchors a thread to `{filePath,
 * rightFileStart, rightFileEnd}` rather than a commit id — `commitId` and
 * `side` are accepted (the interface's own shape) but unused, the same
 * "the interface still names it, this provider does not need it" posture
 * `bitbucket-writes.ts`'s `addReviewComment` already takes for its own
 * unused `commitId`.
 */
export async function addReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; path: string; line: number; body: string },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const anchor = { line: request.line, offset: 1 };
  const result = await azPost(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${request.number}/threads`, {
    comments: [{ content: request.body, commentType: 'text' }],
    status: 'active',
    threadContext: { filePath: `/${request.path}`, rightFileStart: anchor, rightFileEnd: anchor },
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** Decodes the `${prNumber}:${threadId}` id `azure-reads.ts`'s `pullThreads`
 *  builds — see its own note on why the PR number has to ride inside the id. */
export async function setThreadResolved(
  forge: Forge,
  account: ForgeAccount | null,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const separator = request.threadId.indexOf(':');
  if (separator <= 0) return fromResult(cli, false, 'Not an Azure DevOps thread id.');
  const number = request.threadId.slice(0, separator);
  const threadId = request.threadId.slice(separator + 1);
  if (!/^\d+$/.test(number) || threadId.length === 0) {
    return fromResult(cli, false, 'Not an Azure DevOps thread id.');
  }

  const result = await azPatch(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/threads/${threadId}`,
    { status: request.resolved ? 'fixed' : 'active' },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

// ─── Review vote ──────────────────────────────────────────────────────────

/**
 * `reviewPull` onto Azure's numeric vote scale — `10` for `APPROVE`, `-10`
 * for `REQUEST_CHANGES` (Azure's own reject; there is no separate
 * "request changes" concept beyond the vote itself, the phase doc's own
 * note), and a plain thread comment for `COMMENT`, exactly like
 * GitLab/Bitbucket's identical fallthrough.
 *
 * The reviewer id is the authenticated PAT's own identity — resolved via
 * the profile call `whoami.ts`'s `azureWhoami` already makes.
 * **Unverified against a live organization**: Azure DevOps's own
 * documentation is ambiguous about whether the *profile* id `GET
 * .../profiles/me` returns is accepted directly as the `reviewerId` path
 * segment on `PUT .../reviewers/{id}`, or whether it needs resolving through
 * the separate Identities API first. `@me` — the literal string Azure's own
 * web UI's underlying calls are known to accept in several reviewer
 * endpoints — is used here instead, which sidesteps the ambiguity if Azure
 * accepts it; the numeric id is not.
 */
export async function reviewPull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (event === 'COMMENT') return commentPull(forge, account, number, body);

  const vote = event === 'APPROVE' ? 10 : -10;
  const verdict = await azPut(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}/reviewers/@me`, { vote });
  if (!verdict.ok) return fromResult(cli, false, verdict.error);

  if (body.trim().length > 0) {
    const note = await commentPull(forge, account, number, body);
    if (!note.ok) return fromResult(cli, true, `Vote recorded, but the comment failed: ${note.error}`);
  }
  return fromResult(cli, true, null);
}

// ─── Merge, draft, reviewers, rerun ─────────────────────────────────────

/**
 * Azure's completion request needs `lastMergeSourceCommit` as a concurrency
 * guard — the same commit the PR itself last computed a merge against — so
 * this reads the PR before writing it, matching `gitlab-write.ts`'s
 * `markReady` doing the identical read-before-write for its own title-prefix
 * toggle.
 */
export async function mergePull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (method === 'rebase') {
    return unsupportedWrite(account, 'Azure DevOps has no server-side rebase-merge — merge or squash instead.');
  }

  const pr = await azGet<Record<string, unknown>>(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`);
  if (!pr.ok) return fromResult(cli, false, pr.error);
  const lastMergeSource = row(pr.data['lastMergeSourceCommit']);
  if (!lastMergeSource) return fromResult(cli, false, 'This pull request has no computed merge commit yet.');

  const result = await azPatch(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`, {
    status: 'completed',
    lastMergeSourceCommit: lastMergeSource,
    completionOptions: { squashMerge: method === 'squash', bypassPolicy: false },
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function markReady(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPatch(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`, { isDraft: false });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function requestReview(
  _forge: Forge,
  account: ForgeAccount | null,
  _number: number,
  _reviewers: string[],
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Requesting an Azure DevOps reviewer needs an identity picker this app does not build yet.',
  );
}

export async function rerunChecks(
  _forge: Forge,
  account: ForgeAccount | null,
  _runId: string,
  _failedOnly: boolean,
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Azure Pipelines has no public API to retry an existing run — start a new one from the Pipelines page.',
  );
}

export async function setItemField(): Promise<ForgeProjectWriteResult> {
  // Real board writes go through `azure-board.ts`'s own `setItemField` —
  // `create-azure-adapter.ts` binds that one, not this stub. This exists
  // only so the module shape mirrors `bitbucket-writes.ts`'s and
  // `gitlab-write.ts`'s own file layout.
  return { ok: false, kind: 'error', message: 'Not implemented in this module — see azure-board.ts.' };
}

// ─── Work item state ──────────────────────────────────────────────────────

/**
 * `open`/`closed` onto a real Azure state name — Azure has no `open`/
 * `closed` field at all, only a per-type, per-process `System.State`
 * vocabulary (`azure-client.ts`'s `stateCategoriesFor`). This picks the
 * first state in the target category (`Completed` for `closed`, `Proposed`
 * for `open`, falling back to `InProgress`) — a team with several
 * "Completed"-category states (`Closed` *and* `Done`, say) gets whichever
 * one the API lists first, the same single-verb simplification GitHub's own
 * "Close" button makes for issues with no equivalent multi-state ambiguity.
 */
export async function setIssueState(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const item = await azGet<Record<string, unknown>>(forge, account, `wit/workitems/${number}`, {
    fields: 'System.WorkItemType,System.State',
  });
  if (!item.ok) return fromResult(cli, false, item.error);
  const f = fields(item.data);
  const type = asStringLoose(f['System.WorkItemType']);
  if (!type) return fromResult(cli, false, 'Could not resolve this work item’s type.');

  const categories = await stateCategoriesFor(forge, account, type);
  if (!categories) return fromResult(cli, false, 'Could not load this project’s work item states.');

  const targetCategory = state === 'closed' ? 'Completed' : 'Proposed';
  let targetState = [...categories.entries()].find(([, category]) => category === targetCategory)?.[0];
  if (!targetState && state === 'open') {
    targetState = [...categories.entries()].find(([, category]) => category === 'InProgress')?.[0];
  }
  if (!targetState) return fromResult(cli, false, `This project has no "${targetCategory}" state for ${type}.`);

  const result = await azWorkItemPatch(forge, account, `wit/workitems/${number}`, [
    { op: 'add', path: '/fields/System.State', value: targetState },
  ]);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

// ─── Phase 95 Theme D: issue CRUD and the body-fallback dependency link ────

/**
 * `POST wit/workitems/$Issue`, then a read-back through `issueDetail` — the
 * same posture every provider's `createIssue` takes.
 *
 * **`workItemType` is a best-effort default, not a resolved fact** — the
 * same "unverified against a live organization" honesty `reviewPull`'s own
 * docblock above already carries for this file: Azure's work item types are
 * per-project, per-process-template (`stateCategoriesFor` exists precisely
 * because state names vary the same way), and this contract's
 * `createIssue` request has no field for one. `'Issue'` is the Basic
 * process's own name for its bug/task-tracker type; an Agile/Scrum project
 * with no `Issue` type reports the create as a normal write failure — Azure
 * itself refuses an unknown type — rather than this app guessing further.
 *
 * `milestone` (an iteration) is not set here — resolving a bare leaf name to
 * its full `System.IterationPath` needs the project's iteration tree, a
 * lookup this theme does not add; the field is accepted on the request and
 * silently unused, the same lossy posture `createIssue`'s Bitbucket sibling
 * documents for `labels`.
 */
export async function createIssue(
  forge: Forge,
  account: ForgeAccount | null,
  request: { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string },
): Promise<ForgeIssueCreateResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const workItemType = 'Issue';
  const ops: Array<{ op: 'add' | 'replace'; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: request.title },
  ];
  if (request.body) ops.push({ op: 'add', path: '/fields/System.Description', value: request.body });
  if (request.assignees && request.assignees[0]) {
    ops.push({ op: 'add', path: '/fields/System.AssignedTo', value: request.assignees[0] });
  }
  if (request.labels && request.labels.length > 0) {
    ops.push({ op: 'add', path: '/fields/System.Tags', value: request.labels.join('; ') });
  }

  const created = await azWorkItemCreate<Record<string, unknown>>(forge, account, workItemType, ops);
  if (!created.ok) return { ok: false, cli, error: created.error };

  const id = created.data['id'];
  if (typeof id !== 'number') {
    return { ok: false, cli, error: 'Issue created, but its number could not be read.' };
  }
  const detail = await issueDetail(forge, account, id);
  if (!detail.issue) {
    return { ok: false, cli, error: detail.error ?? 'Issue created, but could not be read back.' };
  }
  return { ok: true, cli, issue: detail.issue.issue };
}

/** `PATCH wit/workitems/{n}` — a partial update via JSON Patch. `'add'`
 *  throughout, matching `setIssueState`'s own op above: Azure's own PATCH
 *  treats `add` as an upsert for a simple field, whether or not it already
 *  has a value, which sidesteps having to know in advance which is true. */
export async function editIssue(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  request: ForgeIssueEditInput,
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const ops: Array<{ op: 'add' | 'replace'; path: string; value: unknown }> = [];
  if (request.title !== undefined) ops.push({ op: 'add', path: '/fields/System.Title', value: request.title });
  if (request.body !== undefined) ops.push({ op: 'add', path: '/fields/System.Description', value: request.body });
  if (request.assignees !== undefined) {
    ops.push({ op: 'add', path: '/fields/System.AssignedTo', value: request.assignees[0] ?? null });
  }
  if (request.labels !== undefined) {
    ops.push({ op: 'add', path: '/fields/System.Tags', value: request.labels.join('; ') });
  }
  if (ops.length === 0) return { ok: true, cli, error: null };

  const result = await azWorkItemPatch(forge, account, `wit/workitems/${number}`, ops);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** `DELETE wit/workitems/{n}` — a soft delete (Azure's own recycle bin),
 *  not `?destroy=true`: this app's own blast-radius confirm already covers
 *  the "you are about to lose this" step, and a soft delete stays
 *  recoverable from Azure Boards' own UI besides, which a hard destroy would
 *  not be. */
export async function deleteIssue(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azureRequest(forge, account, 'DELETE', `wit/workitems/${number}`);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** Azure Boards Columns give a real per-column state table
 *  (`capabilities().projects` is `'full'` — see `AZURE_CAPABILITY`'s own
 *  docblock), but that is a *read* fact about the board this app already
 *  renders, not a board-create/item-add write this theme implements. Honest
 *  `unsupportedWrite`s, matching `capabilitiesFor('azure').ops`'s `false` rows. */
async function unsupportedProjectWrite(account: ForgeAccount | null, message: string): Promise<ForgeProjectWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'Not authenticated.' };
  return { ok: false, kind: 'error', message };
}

export async function createProject(account: ForgeAccount | null): Promise<ForgeProjectCreateResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'Not authenticated.' };
  return { ok: false, kind: 'error', message: 'Azure Boards are not created through this app yet.' };
}

export function editProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Azure Boards are not edited through this app yet.');
}

export function deleteProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Azure Boards are not deleted through this app yet.');
}

export function addProjectItem(
  account: ForgeAccount | null,
  _request: { projectId: string } & ForgeProjectAddItemInput,
): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Azure has no board-item-add write in this app yet.');
}

export function removeProjectItem(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Azure has no board-item-remove write in this app yet.');
}

/** `kind: 'blockedBy'` via the text fallback, written into
 *  `System.Description` (HTML in Azure's own schema, but plain text stores
 *  and reads back through `htmlToText` fine for a single marker line — see
 *  `azure-reads.ts`'s `issueDetail`); `kind: 'subIssue'` is an honest
 *  unsupported write. */
export async function linkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  if (request.kind === 'subIssue') {
    return { ok: false, cli, error: 'Azure DevOps has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli, error: detail.error ?? 'Could not read the issue to link.' };

  const { body: nextBody, changed } = withBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli, error: null, via: 'body' };

  const result = await azWorkItemPatch(forge, account, `wit/workitems/${request.number}`, [
    { op: 'add', path: '/fields/System.Description', value: nextBody },
  ]);
  return { ok: result.ok, cli, error: result.ok ? null : result.error, via: 'body' };
}

/** The inverse of {@link linkIssues}. */
export async function unlinkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  if (request.kind === 'subIssue') {
    return { ok: false, cli, error: 'Azure DevOps has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli, error: detail.error ?? 'Could not read the issue to unlink.' };

  const { body: nextBody, changed } = withoutBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli, error: null, via: 'body' };

  const result = await azWorkItemPatch(forge, account, `wit/workitems/${request.number}`, [
    { op: 'add', path: '/fields/System.Description', value: nextBody },
  ]);
  return { ok: result.ok, cli, error: result.ok ? null : result.error, via: 'body' };
}
