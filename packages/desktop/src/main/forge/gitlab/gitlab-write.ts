import type { Forge, ForgeMergeMethod, ForgeReviewEvent, ForgeWriteResult } from '@midnite/studio-shared';

import { gitlabCliStatus, glGet, glPost, glPut, projectId, type GitLabContext } from './gitlab-client';
import { asArray, asString, asStringLoose, row } from './gitlab-json';

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

function notReady(cli: ReturnType<typeof gitlabCliStatus>): ForgeWriteResult {
  return { ok: false, cli, error: cli.hint || null };
}

function fromResult(cli: ReturnType<typeof gitlabCliStatus>, ok: boolean, error: string | null): ForgeWriteResult {
  return { ok, cli, error };
}

// ─── Comments ────────────────────────────────────────────────────────────

export async function commentPull(ctx: GitLabContext, forge: Forge, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(ctx, `projects/${projectId(forge)}/merge_requests/${number}/notes`, { body });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function commentIssue(ctx: GitLabContext, forge: Forge, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(ctx, `projects/${projectId(forge)}/issues/${number}/notes`, { body });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function setIssueState(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPut(ctx, `projects/${projectId(forge)}/issues/${number}`, {
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
  ctx: GitLabContext,
  forge: Forge,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  if (event === 'COMMENT') return commentPull(ctx, forge, number, body);

  const verb = event === 'APPROVE' ? 'approve' : 'unapprove';
  const verdict = await glPost(ctx, `projects/${projectId(forge)}/merge_requests/${number}/${verb}`);
  if (!verdict.ok) return fromResult(cli, false, verdict.error);

  if (body.trim().length > 0) {
    const note = await glPost(ctx, `projects/${projectId(forge)}/merge_requests/${number}/notes`, { body });
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
  ctx: GitLabContext,
  forge: Forge,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  if (method === 'rebase') {
    // GitLab has no merge-time "rebase" flag — `rebase` is its own async
    // operation. Kick it off, give it a moment to land, then merge without
    // squash. A rebase that has not finished by then surfaces as an honest
    // merge failure rather than this call silently downgrading to `merge`.
    const rebase = await glPut(ctx, `projects/${projectId(forge)}/merge_requests/${number}/rebase`);
    if (!rebase.ok) return fromResult(cli, false, rebase.error);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const merged = await glPut(ctx, `projects/${projectId(forge)}/merge_requests/${number}/merge`, { squash: false });
    return fromResult(cli, merged.ok, merged.ok ? null : merged.error);
  }

  const merged = await glPut(ctx, `projects/${projectId(forge)}/merge_requests/${number}/merge`, {
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
  ctx: GitLabContext,
  forge: Forge,
  number: number,
  reviewers: string[],
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);
  if (reviewers.length === 0) return fromResult(cli, true, null);

  const [mr, resolved] = await Promise.all([
    glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}/merge_requests/${number}`),
    Promise.all(
      reviewers.map(async (username) => {
        const found = await glGet<unknown[]>(ctx, 'users', { username });
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
  const result = await glPut(ctx, `projects/${projectId(forge)}/merge_requests/${number}`, {
    reviewer_ids: reviewerIds,
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * GitLab's draft flag lives in the title (`Draft: ` / `WIP: ` prefix) —
 * still true across API versions, unlike a dedicated boolean field. Marking
 * ready strips whichever prefix the title carries.
 */
export async function markReady(ctx: GitLabContext, forge: Forge, number: number): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  const mr = await glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}/merge_requests/${number}`);
  if (!mr.ok) return fromResult(cli, false, mr.error);

  const title = asStringLoose(mr.data['title']);
  const stripped = title.replace(/^(draft|wip)\s*:\s*/i, '');
  if (stripped === title) return fromResult(cli, true, null);

  const result = await glPut(ctx, `projects/${projectId(forge)}/merge_requests/${number}`, { title: stripped });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * `failedOnly` maps directly onto GitLab's own two retry shapes:
 * `POST .../pipelines/:id/retry` only ever retries unsuccessful jobs (there
 * is no "retry everything" pipeline-level call), so a full re-run instead
 * retries every job in the pipeline individually.
 */
export async function rerunChecks(
  ctx: GitLabContext,
  forge: Forge,
  runId: string,
  failedOnly: boolean,
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  if (failedOnly) {
    const result = await glPost(ctx, `projects/${projectId(forge)}/pipelines/${runId}/retry`);
    return fromResult(cli, result.ok, result.ok ? null : result.error);
  }

  const jobs = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/pipelines/${runId}/jobs`, {
    per_page: 100,
  });
  if (!jobs.ok) return fromResult(cli, false, jobs.error);

  const ids = asArray(jobs.data)
    .map((j) => row(j)?.['id'])
    .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string');
  const outcomes = await Promise.all(
    ids.map((id) => glPost(ctx, `projects/${projectId(forge)}/jobs/${id}/retry`)),
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
  ctx: GitLabContext,
  forge: Forge,
  request: { number: number; commitId: string; path: string; line: number; side: 'RIGHT'; body: string },
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  const mr = await glGet<Record<string, unknown>>(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${request.number}`,
  );
  if (!mr.ok) return fromResult(cli, false, mr.error);
  const diffRefs = row(mr.data['diff_refs']);
  if (!diffRefs) return fromResult(cli, false, 'This merge request has no diff to comment on.');

  const result = await glPost(ctx, `projects/${projectId(forge)}/merge_requests/${request.number}/discussions`, {
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
  ctx: GitLabContext,
  forge: Forge,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await glPost(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${request.number}/discussions/${request.commentId}/notes`,
    { body: request.body },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** Decodes the `${mrNumber}:${discussionId}` id `gitlab-read.ts` builds — see
 *  its own note on why the number has to ride inside the id here. */
export async function setThreadResolved(
  ctx: GitLabContext,
  forge: Forge,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return notReady(cli);

  const separator = request.threadId.indexOf(':');
  if (separator <= 0) return fromResult(cli, false, 'Not a GitLab thread id.');
  const number = request.threadId.slice(0, separator);
  const discussionId = request.threadId.slice(separator + 1);
  if (!/^\d+$/.test(number) || discussionId.length === 0) {
    return fromResult(cli, false, 'Not a GitLab thread id.');
  }

  const result = await glPut(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${number}/discussions/${discussionId}`,
    { resolved: request.resolved },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}
