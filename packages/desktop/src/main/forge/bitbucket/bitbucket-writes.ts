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
import { bitbucketCliStatus, bitbucketRequest, repoPath } from './bitbucket-client';
import { issueDetail } from './bitbucket-reads';

/**
 * The write half of Bitbucket Cloud's adapter.
 *
 * **Scoped to exactly what the phase doc's checklist names for Bitbucket**:
 * "comment, approve/unapprove, request-changes, resolve an inline thread,
 * close an issue where the tracker exists" — the same narrower-than-the-
 * interface posture GitLab's own checklist takes ("Nothing that needs a
 * picker"). `mergePull`, `requestReview`, `markReady`, `rerunChecks` and
 * `setItemField` are still implemented, because `ForgeAdapter` requires them,
 * but as an honest `unsupportedWrite` rather than a guess at undocumented or
 * unverified Bitbucket API behaviour — see each function's own comment for
 * why that one specifically was left out rather than attempted.
 */

async function unsupportedWrite(account: ForgeAccount | null, message: string): Promise<ForgeWriteResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };
  return { ok: false, cli, error: message };
}

function writeResult(result: { ok: true; cli: ForgeCliStatus } | { ok: false; cli: ForgeCliStatus; error: string | null }): ForgeWriteResult {
  return result.ok ? { ok: true, cli: result.cli, error: null } : { ok: false, cli: result.cli, error: result.error };
}

// --- comments and threads --------------------------------------------------

/**
 * A new inline comment. `side` is always `'RIGHT'` (the interface's own v1
 * scope, matching GitHub's) and `commitId`/`position` are unused: Bitbucket
 * anchors an inline comment to `{path, to: line}` with no commit pinning.
 */
export async function addReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; path: string; line: number; body: string },
): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'POST', repoPath(forge, `/pullrequests/${request.number}/comments`), {
    json: { content: { raw: request.body }, inline: { path: request.path, to: request.line } },
  });
  return writeResult(result);
}

export async function replyToReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'POST', repoPath(forge, `/pullrequests/${request.number}/comments`), {
    json: { content: { raw: request.body }, parent: { id: Number(request.commentId) } },
  });
  return writeResult(result);
}

/**
 * `threadId` decodes `"{number}:{commentId}"` — see `bitbucket-map.ts`'s
 * `synthesizeThreads` docblock for why the PR number has to travel folded
 * into the id at all. A malformed id (never produced by this adapter's own
 * reads) fails closed with a clear message rather than guessing a PR number.
 */
export async function setThreadResolved(
  forge: Forge,
  account: ForgeAccount | null,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const [numberPart, commentId] = request.threadId.split(':', 2);
  const number = numberPart ? Number(numberPart) : NaN;
  if (!Number.isFinite(number) || !commentId) {
    const cli = await bitbucketCliStatus(account);
    return { ok: false, cli, error: `"${request.threadId}" is not a Bitbucket thread id.` };
  }
  const verb = request.resolved ? 'resolve' : 'reopen';
  const result = await bitbucketRequest(
    account,
    'POST',
    repoPath(forge, `/pullrequests/${number}/comments/${commentId}/${verb}`),
  );
  return writeResult(result);
}

export async function commentPull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  body: string,
): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'POST', repoPath(forge, `/pullrequests/${number}/comments`), {
    json: { content: { raw: body } },
  });
  return writeResult(result);
}

export async function commentIssue(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  body: string,
): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'POST', repoPath(forge, `/issues/${number}/comments`), {
    json: { content: { raw: body } },
  });
  return writeResult(result);
}

// --- approve / request-changes ----------------------------------------------

/**
 * `APPROVE` and `REQUEST_CHANGES` each have a dedicated Bitbucket endpoint;
 * `COMMENT` has no review-submission equivalent at all (Bitbucket does not
 * model "submit a review" as its own object the way GitHub does — a comment
 * is just a comment), so it falls through to the same call `commentPull`
 * makes. A non-empty `body` alongside `APPROVE`/`REQUEST_CHANGES` is posted
 * as a second, plain comment — Bitbucket's approve/request-changes calls
 * take no body of their own.
 *
 * **Withdrawing an approval ("unapprove") has no event in
 * `ForgeReviewEventSchema`** — GitHub's own interface has no verb for it
 * either, so this is not a Bitbucket-specific gap.
 */
export async function reviewPull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  if (event === 'COMMENT') return commentPull(forge, account, number, body);

  const path = event === 'APPROVE' ? `/pullrequests/${number}/approve` : `/pullrequests/${number}/request-changes`;
  const verdict = await bitbucketRequest(account, 'POST', repoPath(forge, path));
  if (!verdict.ok) return writeResult(verdict);
  if (body.length === 0) return writeResult(verdict);
  return commentPull(forge, account, number, body);
}

// --- merge -------------------------------------------------------------

/**
 * `merge` -> `merge_commit`, `squash` -> `squash`. `rebase` has no Bitbucket
 * analogue — its `fast_forward` strategy requires the branch to already be a
 * fast-forward, which is a precondition, not a rewrite the server performs,
 * so mapping it onto `rebase` would claim a capability Bitbucket does not
 * have. Reported as an honest write failure rather than silently merging
 * with the wrong strategy.
 */
export async function mergePull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  if (method === 'rebase') {
    return unsupportedWrite(account, 'Bitbucket has no rebase-merge strategy — merge or squash instead.');
  }
  const mergeStrategy = method === 'squash' ? 'squash' : 'merge_commit';
  const result = await bitbucketRequest(account, 'POST', repoPath(forge, `/pullrequests/${number}/merge`), {
    json: { type: 'pullrequest', merge_strategy: mergeStrategy },
  });
  return writeResult(result);
}

// --- out of this theme's write scope (see module docblock) -----------------

export async function requestReview(
  _forge: Forge,
  account: ForgeAccount | null,
  _number: number,
  _reviewers: string[],
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Requesting a Bitbucket reviewer needs a full reviewer-list update this app does not build a picker for yet.',
  );
}

export async function markReady(_forge: Forge, account: ForgeAccount | null, _number: number): Promise<ForgeWriteResult> {
  return unsupportedWrite(account, 'Marking a Bitbucket pull request ready for review is not supported yet.');
}

export async function rerunChecks(
  _forge: Forge,
  account: ForgeAccount | null,
  _runId: string,
  _failedOnly: boolean,
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Bitbucket Pipelines has no public API to rerun a pipeline — rerun it from bitbucket.org.',
  );
}

export async function setItemField(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'Not authenticated.' };
  return { ok: false, kind: 'error', message: 'Bitbucket has no project boards.' };
}

// --- issue state ---------------------------------------------------------

/** `open`/`closed` onto Bitbucket's own richer vocabulary — `resolved` is
 *  the state Bitbucket's own web UI uses for "close this issue". */
export async function setIssueState(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'PUT', repoPath(forge, `/issues/${number}`), {
    json: { state: state === 'open' ? 'open' : 'resolved' },
  });
  return writeResult(result);
}

// ─── Phase 95 Theme D: issue CRUD and the body-fallback dependency link ────

/**
 * `POST .../issues`, then a read-back through `issueDetail` — the same
 * "return the exact `ForgeIssue` shape a listing would" posture every
 * provider's `createIssue` takes (`adapter.ts`'s own docblock).
 *
 * **`assignees`/`labels` are lossy on Bitbucket.** Its classic issue tracker
 * has one `assignee` (a single user), not a list, and no free-form labels at
 * all — only a fixed `kind`/`priority` vocabulary this contract has no field
 * for. Only `request.assignees[0]` is sent; the rest, and every label, are
 * silently dropped rather than refusing the whole create over a field this
 * provider cannot represent.
 */
export async function createIssue(
  forge: Forge,
  account: ForgeAccount | null,
  request: { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string },
): Promise<ForgeIssueCreateResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const json: Record<string, unknown> = {
    title: request.title,
    content: { raw: request.body ?? '', markup: 'markdown' },
  };
  if (request.assignees && request.assignees[0]) json['assignee'] = { username: request.assignees[0] };
  if (request.milestone) json['milestone'] = { name: request.milestone };

  const created = await bitbucketRequest<Record<string, unknown>>(account, 'POST', repoPath(forge, '/issues'), { json });
  if (!created.ok) return { ok: false, cli: created.cli, error: created.error };

  const id = created.data['id'];
  if (typeof id !== 'number') {
    return { ok: false, cli: created.cli, error: 'Issue created, but its number could not be read.' };
  }
  const detail = await issueDetail(forge, account, id);
  if (!detail.issue) {
    return { ok: false, cli: detail.cli, error: detail.error ?? 'Issue created, but could not be read back.' };
  }
  return { ok: true, cli: detail.cli, issue: detail.issue.issue };
}

/** `PUT .../issues/{n}` — a partial update. `assignees`/`labels` share
 *  `createIssue`'s own lossy limitation; `assignees: []` clears the single
 *  assignee, matching the `undefined`/`null`/value convention every other
 *  provider's `editIssue` follows for "leave alone" vs "clear". */
export async function editIssue(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  request: ForgeIssueEditInput,
): Promise<ForgeWriteResult> {
  const json: Record<string, unknown> = {};
  if (request.title !== undefined) json['title'] = request.title;
  if (request.body !== undefined) json['content'] = { raw: request.body, markup: 'markdown' };
  if (request.assignees !== undefined) {
    json['assignee'] = request.assignees[0] ? { username: request.assignees[0] } : null;
  }
  if (request.milestone !== undefined) {
    json['milestone'] = request.milestone === null ? null : { name: request.milestone };
  }
  if (Object.keys(json).length === 0) {
    const cli = await bitbucketCliStatus(account);
    return { ok: true, cli, error: null };
  }

  const result = await bitbucketRequest(account, 'PUT', repoPath(forge, `/issues/${number}`), { json });
  return writeResult(result);
}

/** `DELETE .../issues/{n}`. */
export async function deleteIssue(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const result = await bitbucketRequest(account, 'DELETE', repoPath(forge, `/issues/${number}`));
  return writeResult(result);
}

/** Bitbucket Cloud has no project board at all — `capabilities().projects`
 *  is `'none'`, and this theme does not invent one (the phase doc's own
 *  instruction, echoed in `create-bitbucket-adapter.ts`'s own note on its
 *  `listBoards`/`boardFields`/`boardItems`). Honest `unsupportedWrite`s,
 *  matching `capabilitiesFor('bitbucket').ops`'s `false` rows. */
async function unsupportedProjectWrite(account: ForgeAccount | null, message: string): Promise<ForgeProjectWriteResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'Not authenticated.' };
  return { ok: false, kind: 'error', message };
}

export async function createProject(account: ForgeAccount | null): Promise<ForgeProjectCreateResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: 'Not authenticated.' };
  return { ok: false, kind: 'error', message: 'Bitbucket has no project boards.' };
}

export function editProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Bitbucket has no project boards.');
}

export function deleteProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Bitbucket has no project boards.');
}

export function addProjectItem(
  account: ForgeAccount | null,
  _request: { projectId: string } & ForgeProjectAddItemInput,
): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Bitbucket has no project boards.');
}

export function removeProjectItem(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'Bitbucket has no project boards.');
}

/** `kind: 'blockedBy'` via the text fallback; `kind: 'subIssue'` is an honest
 *  unsupported write — see `body-link-fallback.ts`'s own module docblock. */
export async function linkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  if (request.kind === 'subIssue') {
    const cli = await bitbucketCliStatus(account);
    return { ok: false, cli, error: 'Bitbucket has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli: detail.cli, error: detail.error ?? 'Could not read the issue to link.' };

  const { body: nextBody, changed } = withBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli: detail.cli, error: null, via: 'body' };

  const result = await bitbucketRequest(account, 'PUT', repoPath(forge, `/issues/${request.number}`), {
    json: { content: { raw: nextBody, markup: 'markdown' } },
  });
  return result.ok
    ? { ok: true, cli: result.cli, error: null, via: 'body' }
    : { ok: false, cli: result.cli, error: result.error };
}

/** The inverse of {@link linkIssues}. */
export async function unlinkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  if (request.kind === 'subIssue') {
    const cli = await bitbucketCliStatus(account);
    return { ok: false, cli, error: 'Bitbucket has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli: detail.cli, error: detail.error ?? 'Could not read the issue to unlink.' };

  const { body: nextBody, changed } = withoutBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli: detail.cli, error: null, via: 'body' };

  const result = await bitbucketRequest(account, 'PUT', repoPath(forge, `/issues/${request.number}`), {
    json: { content: { raw: nextBody, markup: 'markdown' } },
  });
  return result.ok
    ? { ok: true, cli: result.cli, error: null, via: 'body' }
    : { ok: false, cli: result.cli, error: result.error };
}
