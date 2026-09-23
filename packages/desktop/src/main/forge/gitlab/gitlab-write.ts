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
import { gitlabCliStatus, glGet, glPost, glPut, glRequest, projectId } from './gitlab-client';
import { asArray, asString, asStringLoose, row } from './gitlab-json';
import { issueDetail } from './gitlab-read';

/**
 * GitLab's write surface — the same bounded set `gh-write.ts` documents for
 * GitHub, applied to a REST API instead of `gh` subcommands.
 *
 * **The phase doc's own scope for Theme E**: "comment on an MR or issue,
 * approve/unapprove, resolve a discussion, close/reopen an issue — nothing
 * that needs a picker." `ForgeAdapter` still declares every write GitHub's UI
 * drives (Theme D's own "no behaviour change" rule for that interface), so
 * every method below has a real implementation — `mergePull`, `requestReview`,
 * `markReady` and `rerunChecks` included — but the four the doc actually
 * scoped are the ones exercised by a picker-free surface; the rest are
 * genuine GitLab equivalents, documented as such at each one.
 */

function notReady(cli: ForgeCliStatus): ForgeWriteResult {
  return { ok: false, cli, error: cli.hint || null };
}

function fromResult(cli: ForgeCliStatus, ok: boolean, error: string | null): ForgeWriteResult {
  return { ok, cli, error };
}

// ─── Comments ────────────────────────────────────────────────────────────

export async function commentPull(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/notes`, { body });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function commentIssue(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(forge, account, `projects/${projectId(forge)}/issues/${number}/notes`, { body });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function setIssueState(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPut(forge, account, `projects/${projectId(forge)}/issues/${number}`, {
    state_event: state === 'closed' ? 'close' : 'reopen',
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

// ─── Approvals ("review") ───────────────────────────────────────────────────

/**
 * `reviewPull` maps GitHub's three review events onto GitLab's two-verb
 * approval model, which has no "submit a verdict with a body" concept at all:
 *
 * - `APPROVE` → `POST .../approve`, then (if a body was written) a separate
 *   note — GitLab's approve call itself takes no comment.
 * - `REQUEST_CHANGES` → GitLab has no such state (the phase doc's own
 *   Decisions). The nearest real action is `POST .../unapprove` plus the
 *   body as a note, which is genuinely what a GitLab reviewer does to ask
 *   for changes — but it is not a distinct, queryable verdict the way
 *   GitHub's is, and `mapApprovalDecision` never reports it back.
 * - `COMMENT` → a plain note, identical to `commentPull`.
 */
export async function reviewPull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (event === 'COMMENT') return commentPull(forge, account, number, body);

  const verb = event === 'APPROVE' ? 'approve' : 'unapprove';
  const verdict = await glPost(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/${verb}`);
  if (!verdict.ok) return fromResult(cli, false, verdict.error);

  if (body.trim().length > 0) {
    const note = await glPost(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/notes`, { body });
    if (!note.ok) {
      // The verdict itself landed; only the note failed. Report the actual
      // partial state rather than an `ok: false` that would suggest neither did.
      return fromResult(cli, true, `Approval recorded, but the comment failed: ${note.error}`);
    }
  }
  return fromResult(cli, true, null);
}

// ─── Merge, reviewers, draft, re-run ────────────────────────────────────────

export async function mergePull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (method === 'rebase') {
    // GitLab has no merge-time "rebase" flag — `rebase` is its own async
    // operation. Kick it off, give it a moment to land, then merge without
    // squash. A rebase that has not finished by then surfaces as an honest
    // merge failure rather than this call silently downgrading to `merge`.
    const rebase = await glPut(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/rebase`);
    if (!rebase.ok) return fromResult(cli, false, rebase.error);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const merged = await glPut(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/merge`, { squash: false });
    return fromResult(cli, merged.ok, merged.ok ? null : merged.error);
  }

  const merged = await glPut(forge, account, `projects/${projectId(forge)}/merge_requests/${number}/merge`, {
    squash: method === 'squash',
  });
  return fromResult(cli, merged.ok, merged.ok ? null : merged.error);
}

/**
 * GitLab's `reviewer_ids` on the merge request is additive-by-write, not
 * additive-by-API: a `PUT` replaces the whole list, so this reads the
 * current reviewers first and merges the newly requested ones in, matching
 * "request a review" rather than "replace the reviewer list".
 */
export async function requestReview(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  reviewers: string[],
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  if (reviewers.length === 0) return fromResult(cli, true, null);

  const [mr, resolved] = await Promise.all([
    glGet<Record<string, unknown>>(forge, account, `projects/${projectId(forge)}/merge_requests/${number}`),
    Promise.all(
      reviewers.map(async (username) => {
        const found = await glGet<unknown[]>(forge, account, 'users', { username });
        const first = found.ok ? asArray(found.data)[0] : null;
        const id = first ? row(first)?.['id'] : null;
        return typeof id === 'number' ? id : null;
      }),
    ),
  ]);

  const existing = mr.ok
    ? asArray(mr.data['reviewers'])
        .map((r) => row(r)?.['id'])
        .filter((id): id is number => typeof id === 'number')
    : [];
  const newIds = resolved.filter((id): id is number => id !== null);
  if (newIds.length === 0) {
    return fromResult(cli, false, `Could not find a GitLab user for: ${reviewers.join(', ')}.`);
  }

  const reviewerIds = [...new Set([...existing, ...newIds])];
  const result = await glPut(forge, account, `projects/${projectId(forge)}/merge_requests/${number}`, {
    reviewer_ids: reviewerIds,
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * GitLab's draft flag lives in the title (`Draft: ` / `WIP: ` prefix) —
 * still true across API versions, unlike a dedicated boolean field. Marking
 * ready strips whichever prefix the title carries.
 */
export async function markReady(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const mr = await glGet<Record<string, unknown>>(forge, account, `projects/${projectId(forge)}/merge_requests/${number}`);
  if (!mr.ok) return fromResult(cli, false, mr.error);

  const title = asStringLoose(mr.data['title']);
  const stripped = title.replace(/^(draft|wip)\s*:\s*/i, '');
  if (stripped === title) return fromResult(cli, true, null);

  const result = await glPut(forge, account, `projects/${projectId(forge)}/merge_requests/${number}`, { title: stripped });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * `failedOnly` maps directly onto GitLab's own two retry shapes:
 * `POST .../pipelines/:id/retry` only ever retries unsuccessful jobs (there
 * is no "retry everything" pipeline-level call), so a full re-run instead
 * retries every job in the pipeline individually.
 */
export async function rerunChecks(
  forge: Forge,
  account: ForgeAccount | null,
  runId: string,
  failedOnly: boolean,
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (failedOnly) {
    const result = await glPost(forge, account, `projects/${projectId(forge)}/pipelines/${runId}/retry`);
    return fromResult(cli, result.ok, result.ok ? null : result.error);
  }

  const jobs = await glGet<unknown[]>(forge, account, `projects/${projectId(forge)}/pipelines/${runId}/jobs`, {
    per_page: 100,
  });
  if (!jobs.ok) return fromResult(cli, false, jobs.error);

  const ids = asArray(jobs.data)
    .map((j) => row(j)?.['id'])
    .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string');
  const outcomes = await Promise.all(
    ids.map((id) => glPost(forge, account, `projects/${projectId(forge)}/jobs/${id}/retry`)),
  );
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length > 0) {
    return fromResult(cli, false, `${failed.length} of ${ids.length} jobs could not be retried.`);
  }
  return fromResult(cli, true, null);
}

// ─── Inline review threads ───────────────────────────────────────────────

/** GitLab needs `diff_refs` (base/start/head sha) to anchor a new discussion
 *  onto the current diff — the one extra read `addReviewComment` pays that
 *  GitHub's `commit_id`-only REST form does not. */
export async function addReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; commitId: string; path: string; line: number; side: 'RIGHT'; body: string },
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const mr = await glGet<Record<string, unknown>>(
    forge,
    account,
    `projects/${projectId(forge)}/merge_requests/${request.number}`,
  );
  if (!mr.ok) return fromResult(cli, false, mr.error);
  const diffRefs = row(mr.data['diff_refs']);
  if (!diffRefs) return fromResult(cli, false, 'This merge request has no diff to comment on.');

  const result = await glPost(forge, account, `projects/${projectId(forge)}/merge_requests/${request.number}/discussions`, {
    body: request.body,
    position: {
      position_type: 'text',
      base_sha: diffRefs['base_sha'],
      start_sha: diffRefs['start_sha'],
      head_sha: asString(diffRefs['head_sha']) ?? request.commitId,
      new_path: request.path,
      old_path: request.path,
      new_line: request.line,
    },
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function replyToReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(
    forge,
    account,
    `projects/${projectId(forge)}/merge_requests/${request.number}/discussions/${request.commentId}/notes`,
    { body: request.body },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** Decodes the `${mrNumber}:${discussionId}` id `gitlab-read.ts` builds — see
 *  its own note on why the number has to ride inside the id here. */
export async function setThreadResolved(
  forge: Forge,
  account: ForgeAccount | null,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const separator = request.threadId.indexOf(':');
  if (separator <= 0) return fromResult(cli, false, 'Not a GitLab thread id.');
  const number = request.threadId.slice(0, separator);
  const discussionId = request.threadId.slice(separator + 1);
  if (!/^\d+$/.test(number) || discussionId.length === 0) {
    return fromResult(cli, false, 'Not a GitLab thread id.');
  }

  const result = await glPut(
    forge,
    account,
    `projects/${projectId(forge)}/merge_requests/${number}/discussions/${discussionId}`,
    { resolved: request.resolved },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

// ─── Phase 95 Theme D: issue CRUD and the body-fallback dependency link ────

/** `GET users?username=` for each login, keeping only the ones GitLab
 *  resolves — the same best-effort posture `requestReview` above already
 *  takes for a reviewer login it cannot find: a typo'd assignee should not
 *  sink the rest of the write. */
async function resolveAssigneeIds(forge: Forge, account: ForgeAccount | null, usernames: string[]): Promise<number[]> {
  const resolved = await Promise.all(
    usernames.map(async (username) => {
      const found = await glGet<unknown[]>(forge, account, 'users', { username });
      const first = found.ok ? asArray(found.data)[0] : null;
      const id = first ? row(first)?.['id'] : null;
      return typeof id === 'number' ? id : null;
    }),
  );
  return resolved.filter((id): id is number => id !== null);
}

/** GitLab's issue/edit body wants a milestone *id*, not the title this
 *  contract carries — resolved with one search call, the same "no cache,
 *  edits are rare" posture `gh-write.ts`'s own `resolveMilestoneNumber` takes. */
async function resolveMilestoneId(forge: Forge, account: ForgeAccount | null, title: string): Promise<number | null> {
  const found = await glGet<unknown[]>(forge, account, `projects/${projectId(forge)}/milestones`, { search: title });
  if (!found.ok) return null;
  for (const raw of asArray(found.data)) {
    const r = row(raw);
    if (r && r['title'] === title && typeof r['id'] === 'number') return r['id'];
  }
  return null;
}

export async function createIssue(
  forge: Forge,
  account: ForgeAccount | null,
  request: { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string },
): Promise<ForgeIssueCreateResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: cli.hint || null };

  const payload: Record<string, unknown> = { title: request.title };
  if (request.body !== undefined) payload['description'] = request.body;
  if (request.labels && request.labels.length > 0) payload['labels'] = request.labels.join(',');
  if (request.assignees && request.assignees.length > 0) {
    const ids = await resolveAssigneeIds(forge, account, request.assignees);
    if (ids.length > 0) payload['assignee_ids'] = ids;
  }
  if (request.milestone) {
    const milestoneId = await resolveMilestoneId(forge, account, request.milestone);
    if (milestoneId !== null) payload['milestone_id'] = milestoneId;
  }

  const created = await glPost<Record<string, unknown>>(forge, account, `projects/${projectId(forge)}/issues`, payload);
  if (!created.ok) return { ok: false, cli, error: created.error };

  const iid = created.data['iid'];
  if (typeof iid !== 'number') {
    return { ok: false, cli, error: 'Issue created, but its number could not be read.' };
  }
  const detail = await issueDetail(forge, account, iid);
  if (!detail.issue) {
    return { ok: false, cli, error: detail.error ?? 'Issue created, but could not be read back.' };
  }
  return { ok: true, cli, issue: detail.issue.issue };
}

export async function editIssue(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  request: ForgeIssueEditInput,
): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const payload: Record<string, unknown> = {};
  if (request.title !== undefined) payload['title'] = request.title;
  if (request.body !== undefined) payload['description'] = request.body;
  if (request.labels !== undefined) payload['labels'] = request.labels.join(',');
  if (request.assignees !== undefined) {
    payload['assignee_ids'] = request.assignees.length > 0 ? await resolveAssigneeIds(forge, account, request.assignees) : [];
  }
  if (request.milestone !== undefined) {
    payload['milestone_id'] = request.milestone === null ? null : await resolveMilestoneId(forge, account, request.milestone);
  }
  if (Object.keys(payload).length === 0) return { ok: true, cli, error: null };

  const result = await glPut(forge, account, `projects/${projectId(forge)}/issues/${number}`, payload);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** `DELETE projects/:id/issues/:iid` — requires the reporter/owner role
 *  GitLab itself gates issue deletion behind; a `403` surfaces as an honest
 *  write failure through the same `result.error` every other write here uses. */
export async function deleteIssue(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glRequest(forge, account, 'DELETE', `projects/${projectId(forge)}/issues/${number}`);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** No board-write this theme implements for GitLab (its own Issue Board is a
 *  synthetic label-backed field, not a ProjectV2-shaped resource) — an honest
 *  `unsupportedWrite`, the same posture this file already takes for
 *  `requestReview`/`markReady`/`rerunChecks` where GitLab genuinely has no
 *  equivalent, matching `capabilitiesFor('gitlab').ops`'s `false` rows. */
async function unsupportedProjectWrite(account: ForgeAccount | null, message: string): Promise<ForgeProjectWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: cli.hint || 'Not authenticated.' };
  return { ok: false, kind: 'error', message };
}

export async function createProject(account: ForgeAccount | null): Promise<ForgeProjectCreateResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, kind: 'error', message: cli.hint || 'Not authenticated.' };
  return { ok: false, kind: 'error', message: 'GitLab boards are not created through this app yet.' };
}

export function editProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'GitLab boards are not edited through this app yet.');
}

export function deleteProject(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'GitLab boards are not deleted through this app yet.');
}

export function addProjectItem(
  account: ForgeAccount | null,
  _request: { projectId: string } & ForgeProjectAddItemInput,
): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'GitLab has no board-item-add write in this app yet.');
}

export function removeProjectItem(account: ForgeAccount | null): Promise<ForgeProjectWriteResult> {
  return unsupportedProjectWrite(account, 'GitLab has no board-item-remove write in this app yet.');
}

/**
 * `kind: 'blockedBy'` — the text-fallback link, since GitLab's own Issue
 * Links API is a separate, still-unimplemented surface this theme does not
 * reach for (the phase doc's own scope: "where a provider has no native
 * dependency link, `linkIssues` falls back to appending a `Blocked by #N`
 * line"). `kind: 'subIssue'` has no fallback — a parent/child relation has no
 * body-text grammar this app parses — so it is an honest unsupported write.
 */
export async function linkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: cli.hint || null };
  if (request.kind === 'subIssue') {
    return { ok: false, cli, error: 'GitLab has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli, error: detail.error ?? 'Could not read the issue to link.' };

  const { body: nextBody, changed } = withBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli, error: null, via: 'body' };

  const result = await glPut(forge, account, `projects/${projectId(forge)}/issues/${request.number}`, {
    description: nextBody,
  });
  return result.ok ? { ok: true, cli, error: null, via: 'body' } : { ok: false, cli, error: result.error };
}

/** The inverse of {@link linkIssues} — removes the same `Blocked by` line. */
export async function unlinkIssues(
  forge: Forge,
  account: ForgeAccount | null,
  request: { kind: 'blockedBy' | 'subIssue'; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: cli.hint || null };
  if (request.kind === 'subIssue') {
    return { ok: false, cli, error: 'GitLab has no sub-issue relation this app writes yet.' };
  }

  const detail = await issueDetail(forge, account, request.number);
  if (!detail.issue) return { ok: false, cli, error: detail.error ?? 'Could not read the issue to unlink.' };

  const { body: nextBody, changed } = withoutBlockedByLine(detail.issue.body, {
    repo: request.targetRepo ?? '',
    number: request.targetNumber,
  });
  if (!changed) return { ok: true, cli, error: null, via: 'body' };

  const result = await glPut(forge, account, `projects/${projectId(forge)}/issues/${request.number}`, {
    description: nextBody,
  });
  return result.ok ? { ok: true, cli, error: null, via: 'body' } : { ok: false, cli, error: result.error };
}
