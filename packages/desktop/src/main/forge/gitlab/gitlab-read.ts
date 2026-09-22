import { parseMultiFileDiff } from '@midnite/studio-git-engine';
import {
  DIFF_DEFAULT_CONTEXT,
  PULL_COMMIT_SAMPLE,
  PULL_PATCH_BYTE_CAP,
  type FileDiff,
  type Forge,
  type ForgeComment,
  type ForgeIssue,
  type ForgeIssueCommentsResult,
  type ForgeIssueDetailResult,
  type ForgeIssuesResult,
  type ForgeJob,
  type ForgePull,
  type ForgePullCommentsResult,
  type ForgePullDetailResult,
  type ForgePullFilesResult,
  type ForgePullScope,
  type ForgePullsResult,
  type ForgePullThreadsResult,
  type ForgeReviewComment,
  type ForgeReviewThread,
  type ForgeRun,
  type ForgeRunDetail,
  type ForgeRunDetailResult,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflow,
  type ForgeWorkflowsResult,
} from '@midnite/studio-shared';

import { capPatch, stripPatchPreamble } from '../github/gh-cli';
import { parseRunLog } from '../github/gh-parse';
import { gitlabWhoami } from '../whoami';
import { gitlabCliStatus, glGet, glTrace, projectId, type GitLabContext } from './gitlab-client';
import { asArray, asBool, asId, asNumber, asString, asStringLoose, row } from './gitlab-json';
import { mapApprovalDecision, mapChecksRollup, mapIssueState, mapMergeRequestState, mapPipelineStatus } from './gitlab-mappers';

/**
 * GitLab's read surface — REST v4, one function per `ForgeAdapter` read
 * method, bound together in `create-gitlab-adapter.ts`. The GitHub sibling
 * of this file (`github/gh-cli.ts`) shells out to `gh`; this one calls
 * `../http.ts` directly, because GitLab has no CLI this app uses (see the
 * phase doc's "`glab` is not used" decision, recorded on `gitlab-client.ts`).
 */

const LIST_LIMIT_CAP = 100;

function projectUrl(forge: Forge): string {
  return `https://${forge.host}/${forge.owner}/${forge.repo}`;
}

// ─── Pipelines (Theme E's "runs") ───────────────────────────────────────────

type GitLabPipelineRow = {
  id: unknown;
  iid: unknown;
  name?: unknown;
  status: unknown;
  ref: unknown;
  sha: unknown;
  source?: unknown;
  created_at: unknown;
  updated_at?: unknown;
  started_at?: unknown;
  web_url: unknown;
};

function mapRun(raw: GitLabPipelineRow): ForgeRun {
  const { status, conclusion } = mapPipelineStatus(asString(raw.status) ?? '');
  const iid = asNumber(raw.iid);
  return {
    id: asId(raw.id),
    name: asString(raw.name) ?? `Pipeline #${iid ?? asId(raw.id)}`,
    status,
    conclusion,
    headBranch: asString(raw.ref),
    headSha: asString(raw.sha),
    createdAt: asString(raw.created_at) ?? new Date(0).toISOString(),
    url: asString(raw.web_url) ?? '',
    event: asString(raw.source),
    workflowId: null,
    workflowName: null,
    startedAt: asString(raw.started_at),
    updatedAt: asString(raw.updated_at),
    displayTitle: null,
    number: iid,
    attempt: null,
  };
}

export async function listRuns(
  ctx: GitLabContext,
  forge: Forge,
  options: { limit: number; branch?: string; workflow?: string },
): Promise<ForgeRunsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, runs: [], error: null };

  // GitLab pipelines carry no named-workflow concept to filter `options.workflow`
  // against — one project has one `.gitlab-ci.yml`, unlike a GitHub repo's many
  // workflow files — so that filter is a no-op here, not an unsupported error.
  const result = await glGet<GitLabPipelineRow[]>(ctx, `projects/${projectId(forge)}/pipelines`, {
    per_page: Math.min(options.limit, LIST_LIMIT_CAP),
    order_by: 'id',
    sort: 'desc',
    ...(options.branch ? { ref: options.branch } : {}),
  });
  if (!result.ok) return { cli, runs: [], error: result.error };

  return { cli, runs: asArray(result.data).map((r) => mapRun(r as GitLabPipelineRow)), error: null };
}

export async function runDetail(
  ctx: GitLabContext,
  forge: Forge,
  runId: string,
): Promise<ForgeRunDetailResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const pipeline = await glGet<GitLabPipelineRow>(ctx, `projects/${projectId(forge)}/pipelines/${runId}`);
  if (!pipeline.ok) return { cli, detail: null, error: pipeline.error };

  const jobs = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/pipelines/${runId}/jobs`, {
    per_page: LIST_LIMIT_CAP,
  });
  const jobRows = jobs.ok ? asArray(jobs.data) : [];

  const detail: ForgeRunDetail = {
    run: mapRun(pipeline.data),
    jobs: jobRows.map((j): ForgeJob => {
      const r = row(j) ?? {};
      const { status, conclusion } = mapPipelineStatus(asString(r['status']) ?? '');
      const stage = asString(r['stage']);
      const name = asString(r['name']) ?? '';
      return {
        id: asId(r['id']),
        name: stage ? `${stage} / ${name}` : name,
        status,
        conclusion,
        startedAt: asString(r['started_at']),
        completedAt: asString(r['finished_at']),
        url: asString(r['web_url']) ?? '',
        // GitLab jobs have no step tree over this API — an empty array is the
        // documented, normal answer `ForgeJobSchema` already carries for a
        // job GitHub itself never ran a step on.
        steps: [],
      };
    }),
  };
  return { cli, detail, error: null };
}

export async function listWorkflows(ctx: GitLabContext, forge: Forge): Promise<ForgeWorkflowsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, workflows: [], error: null };

  // GitLab has one CI config file per project rather than GitHub's many
  // `.github/workflows/*.yml` — `ci_config_path` on the project resource
  // (defaulting to `.gitlab-ci.yml`) is the one synthetic "workflow" this
  // adapter can resolve a file path for.
  const project = await glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}`);
  if (!project.ok) return { cli, workflows: [], error: project.error };

  const path = asString(project.data['ci_config_path']) ?? '.gitlab-ci.yml';
  const workflow: ForgeWorkflow = { id: 'gitlab-ci', name: path, path, state: 'active' };
  return { cli, workflows: [workflow], error: null };
}

export async function runLog(
  ctx: GitLabContext,
  forge: Forge,
  runId: string,
  options: { jobId?: string; full?: boolean } = {},
): Promise<ForgeRunLogResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, log: null, pending: false, error: null };

  if (options.jobId) {
    const trace = await glTrace(ctx, `projects/${projectId(forge)}/jobs/${options.jobId}/trace`);
    if (!trace.ok) return { cli, log: null, pending: false, error: trace.error };
    return { cli, log: parseRunLog(trace.data, { full: options.full }), pending: false, error: null };
  }

  // No job named — the combined, whole-pipeline log `gh run view --log`
  // gives for free. GitLab has no equivalent single call, so this fetches
  // every job's trace and concatenates them under the same `job\tstep\t`
  // prefix convention `log-model.ts` already parses (GitLab jobs have no
  // steps, so the step field is left empty).
  const jobsResult = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/pipelines/${runId}/jobs`, {
    per_page: LIST_LIMIT_CAP,
  });
  if (!jobsResult.ok) return { cli, log: null, pending: false, error: jobsResult.error };
  const jobRows = asArray(jobsResult.data);
  if (jobRows.length === 0) return { cli, log: null, pending: true, error: null };

  const parts: string[] = [];
  for (const j of jobRows) {
    const r = row(j) ?? {};
    const id = asId(r['id']);
    const name = asString(r['name']) ?? id;
    const status = asString(r['status']) ?? '';
    // A job that has not run yet has no trace to fetch — skip it rather than
    // surface a 404 as this whole call's error.
    if (status === 'created' || status === 'pending' || status === 'manual' || status === 'scheduled') continue;
    const trace = await glTrace(ctx, `projects/${projectId(forge)}/jobs/${id}/trace`);
    if (!trace.ok) continue;
    const prefixed = trace.data
      .split('\n')
      .map((line) => `${name}\t\t${line}`)
      .join('\n');
    parts.push(prefixed);
  }

  if (parts.length === 0) return { cli, log: null, pending: true, error: null };
  return { cli, log: parseRunLog(parts.join('\n'), { full: options.full }), pending: false, error: null };
}

// ─── Merge requests ("pulls") ───────────────────────────────────────────────

type GitLabMrRow = {
  id: unknown;
  iid: unknown;
  title: unknown;
  state: unknown;
  draft?: unknown;
  work_in_progress?: unknown;
  author?: unknown;
  source_branch: unknown;
  web_url: unknown;
  merged_at?: unknown;
  closed_at?: unknown;
  head_pipeline?: unknown;
  pipeline?: unknown;
};

function mapPull(raw: GitLabMrRow): ForgePull {
  const author = row(raw.author);
  const pipeline = row(raw.head_pipeline) ?? row(raw.pipeline);
  return {
    id: asId(raw.id),
    number: asNumber(raw.iid) ?? 0,
    title: asStringLoose(raw.title),
    state: mapMergeRequestState(asString(raw.state) ?? 'opened'),
    isDraft: asBool(raw.draft) || asBool(raw.work_in_progress),
    // Requires a per-MR `/approvals` call this listing does not make — see
    // `pullDetail`, which computes it for the one MR actually opened.
    reviewDecision: null,
    checks: mapChecksRollup(pipeline ? asString(pipeline['status']) : null),
    headBranch: asStringLoose(raw.source_branch),
    author: author ? asStringLoose(author['username']) : '',
    url: asString(raw.web_url) ?? '',
    mergedAt: asString(raw.merged_at),
    closedAt: asString(raw.closed_at),
  };
}

async function scopeParams(ctx: GitLabContext, scope: ForgePullScope | undefined): Promise<Record<string, string>> {
  if (!scope || scope === 'all') return {};
  if (scope === 'mine') return { scope: 'created_by_me' };
  // 'review-requested' — GitLab filters by a specific reviewer's username
  // rather than a "me" shorthand, so this resolves it once via `whoami`.
  const me = await gitlabWhoami(ctx.host, ctx.token);
  return me ? { reviewer_username: me.login } : {};
}

export async function listPulls(
  ctx: GitLabContext,
  forge: Forge,
  options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all'; scope?: ForgePullScope },
): Promise<ForgePullsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, pulls: [], error: null };

  const stateParam = options.state === 'open' ? 'opened' : options.state;
  const result = await glGet<GitLabMrRow[]>(ctx, `projects/${projectId(forge)}/merge_requests`, {
    state: stateParam,
    per_page: Math.min(options.limit, LIST_LIMIT_CAP),
    order_by: 'updated_at',
    sort: 'desc',
    ...(await scopeParams(ctx, options.scope)),
  });
  if (!result.ok) return { cli, pulls: [], error: result.error };

  return { cli, pulls: asArray(result.data).map((r) => mapPull(r as GitLabMrRow)), error: null };
}

async function fetchMrDiff(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<{ files: FileDiff[]; truncated: boolean; omittedFiles: number; totalBytes: number } | null> {
  const diffs = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/merge_requests/${number}/diffs`, {
    per_page: LIST_LIMIT_CAP,
  });
  if (!diffs.ok) return null;

  const parts: string[] = [];
  for (const raw of asArray(diffs.data)) {
    const f = row(raw);
    if (!f) continue;
    const oldPath = asString(f['old_path']) ?? asString(f['new_path']) ?? '';
    const newPath = asString(f['new_path']) ?? oldPath;
    const newFile = asBool(f['new_file']);
    const deletedFile = asBool(f['deleted_file']);
    const renamedFile = asBool(f['renamed_file']);
    const header = [
      `diff --git a/${oldPath} b/${newPath}`,
      ...(newFile ? ['new file mode 100644'] : []),
      ...(deletedFile ? ['deleted file mode 100644'] : []),
      ...(renamedFile ? [`rename from ${oldPath}`, `rename to ${newPath}`] : []),
      `--- ${newFile ? '/dev/null' : `a/${oldPath}`}`,
      `+++ ${deletedFile ? '/dev/null' : `b/${newPath}`}`,
    ].join('\n');
    const body = asStringLoose(f['diff']);
    parts.push(body.length > 0 ? `${header}\n${body}` : header);
  }

  const patch = stripPatchPreamble(parts.join('\n'));
  const capped = capPatch(patch, PULL_PATCH_BYTE_CAP);
  const files = parseMultiFileDiff(capped.patch, {
    contextLines: DIFF_DEFAULT_CONTEXT,
    fallbackPath: `merge-request-${number}`,
  });
  return { files, truncated: capped.truncated, omittedFiles: capped.omittedFiles, totalBytes: capped.totalBytes };
}

export async function pullFiles(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgePullFilesResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, files: null, error: null };

  const built = await fetchMrDiff(ctx, forge, number);
  if (!built) return { cli, files: null, error: 'Could not load this merge request’s diff.' };

  return { cli, files: built, error: null };
}

export async function pullDetail(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgePullDetailResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const mr = await glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}/merge_requests/${number}`);
  if (!mr.ok) return { cli, detail: null, error: mr.error };
  const raw = mr.data;

  const diffRefs = row(raw['diff_refs']) ?? {};
  const mergeStatus = asString(raw['merge_status']);
  const mergeable = mergeStatus === 'can_be_merged' ? 'MERGEABLE' : mergeStatus === 'cannot_be_merged' ? 'CONFLICTING' : 'UNKNOWN';

  const diff = await fetchMrDiff(ctx, forge, number);
  const changedFiles = diff ? diff.files.length : Number.parseInt(asStringLoose(raw['changes_count']), 10) || 0;
  let additions = 0;
  let deletions = 0;
  for (const f of diff?.files ?? []) {
    additions += f.insertions;
    deletions += f.deletions;
  }

  const commitsResult = await glGet<unknown[]>(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${number}/commits`,
    { per_page: LIST_LIMIT_CAP },
  );
  const commitRows = commitsResult.ok ? asArray(commitsResult.data) : [];
  const commits = commitRows
    .slice(0, PULL_COMMIT_SAMPLE)
    .map((c) => {
      const r = row(c) ?? {};
      return { sha: asId(r['id']), subject: asStringLoose(r['title']) };
    });

  const reviewers = asArray(raw['reviewers'])
    .map((r) => row(r)?.['username'])
    .filter((v): v is string => typeof v === 'string');

  // Approvals cost their own call (`GET .../approvals`), which is why
  // `listPulls`' rows leave `reviewDecision` null rather than paying it once
  // per row in a listing — see that function's own note.
  const approvals = await glGet<Record<string, unknown>>(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${number}/approvals`,
  );
  const reviewDecision = approvals.ok
    ? mapApprovalDecision(asBool(approvals.data['approved']), asNumber(approvals.data['approvals_required']) ?? 0)
    : null;

  const pull = mapPull(raw as GitLabMrRow);

  return {
    cli,
    detail: {
      pull: { ...pull, reviewDecision },
      body: asStringLoose(raw['description']),
      headSha: asString(diffRefs['head_sha']) ?? asString(raw['sha']),
      baseSha: asString(diffRefs['base_sha']),
      baseBranch: asStringLoose(raw['target_branch']),
      additions,
      deletions,
      changedFiles,
      createdAt: asString(raw['created_at']),
      updatedAt: asString(raw['updated_at']),
      mergeable,
      commitCount: commitRows.length,
      commits,
      reviewRequests: reviewers,
    },
    error: null,
  };
}

// ─── Discussions (conversation + inline threads) ────────────────────────────

type GitLabNote = {
  id: unknown;
  body: unknown;
  author?: unknown;
  created_at: unknown;
  system?: unknown;
  resolvable?: unknown;
  resolved?: unknown;
  position?: unknown;
};

type GitLabDiscussion = { id: unknown; individual_note?: unknown; notes?: unknown };

function noteAuthor(note: GitLabNote): string {
  const author = row(note.author);
  return author ? asStringLoose(author['username']) : '';
}

async function fetchDiscussions(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<GitLabDiscussion[] | null> {
  const result = await glGet<GitLabDiscussion[]>(
    ctx,
    `projects/${projectId(forge)}/merge_requests/${number}/discussions`,
    { per_page: LIST_LIMIT_CAP },
  );
  return result.ok ? asArray(result.data) as GitLabDiscussion[] : null;
}

/**
 * Splits a merge request's discussions into the top-level conversation
 * (`pullComments`) and the inline, diff-anchored threads (`pullThreads`) —
 * the same separation `forge.ts` draws between `ForgePullCommentsResult` and
 * `ForgePullThreadsResult`, applied to GitLab's one unified discussions
 * collection. A discussion counts as a thread the moment any of its notes
 * carries a `position`; every other discussion is plain conversation.
 */
function splitDiscussions(
  discussions: GitLabDiscussion[],
  number: number,
): {
  comments: ForgeComment[];
  threads: ForgeReviewThread[];
} {
  const comments: ForgeComment[] = [];
  const threads: ForgeReviewThread[] = [];

  for (const discussion of discussions) {
    const notes = asArray(discussion.notes).filter((n): n is GitLabNote => row(n) !== null) as GitLabNote[];
    const real = notes.filter((n) => !asBool(n.system));
    if (real.length === 0) continue;

    const anchored = real.find((n) => row(n.position) !== null);
    if (!anchored) {
      for (const note of real) {
        comments.push({
          id: asId(note.id),
          kind: 'comment',
          author: noteAuthor(note),
          body: asStringLoose(note.body),
          createdAt: asString(note.created_at) ?? new Date(0).toISOString(),
          url: '',
          reviewState: null,
        });
      }
      continue;
    }

    const position = row(anchored.position) ?? {};
    const newLine = asNumber(position['new_line']);
    const oldLine = asNumber(position['old_line']);
    const lineRange = row(position['line_range']);
    const startLine = lineRange ? asNumber(row(lineRange['start'])?.['new_line']) : null;

    const reviewComments: ForgeReviewComment[] = real.map((note) => ({
      id: asId(note.id),
      // The discussion id, not the note id — `replyToReviewComment`'s
      // `POST discussions/:discussion_id/notes` and `setThreadResolved`'s
      // `PUT discussions/:discussion_id` both key on this, not on any one
      // note within it. Every comment in the same discussion carries the
      // same value here, matching what GitHub's `databaseId` is used for:
      // "any comment already in the thread" is enough to reply into it.
      databaseId: asId(discussion.id),
      author: noteAuthor(note),
      body: asStringLoose(note.body),
      createdAt: asString(note.created_at) ?? new Date(0).toISOString(),
      url: '',
    }));

    threads.push({
      // `${number}:${discussionId}` — `setThreadResolved`'s request carries
      // only `{threadId, resolved}`, with no merge-request number (GitHub's
      // GraphQL thread id is globally addressable; GitLab's REST resolve
      // endpoint is `PUT .../merge_requests/:iid/discussions/:discussion_id`,
      // a *three*-part key). Rather than widen the interface for one
      // provider, the MR number rides inside the id this adapter itself
      // handed out — `gitlab-write.ts`'s `setThreadResolved` decodes it back.
      id: `${number}:${asId(discussion.id)}`,
      path: asString(position['new_path']) ?? asString(position['old_path']) ?? '',
      line: newLine,
      originalLine: newLine ?? oldLine,
      startLine,
      side: newLine === null && oldLine !== null ? 'LEFT' : 'RIGHT',
      resolved: asBool(anchored.resolved),
      // Not derivable from this API without a second diff-position
      // reconciliation this adapter does not perform — see the module note.
      outdated: false,
      fileLevel: false,
      comments: reviewComments,
    });
  }

  return { comments, threads };
}

export async function pullComments(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgePullCommentsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, comments: [], error: null };

  const discussions = await fetchDiscussions(ctx, forge, number);
  if (discussions === null) return { cli, comments: [], error: 'Could not load this merge request’s discussion.' };

  return { cli, comments: splitDiscussions(discussions, number).comments, error: null };
}

export async function pullThreads(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgePullThreadsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, threads: [], error: null };

  const discussions = await fetchDiscussions(ctx, forge, number);
  if (discussions === null) return { cli, threads: [], error: 'Could not load this merge request’s threads.' };

  return { cli, threads: splitDiscussions(discussions, number).threads, error: null };
}

// ─── Issues ──────────────────────────────────────────────────────────────

type GitLabIssueRow = {
  id: unknown;
  iid: unknown;
  title: unknown;
  state: unknown;
  author?: unknown;
  labels?: unknown;
  assignees?: unknown;
  updated_at: unknown;
  created_at?: unknown;
  web_url: unknown;
  milestone?: unknown;
};

function mapIssue(raw: GitLabIssueRow): ForgeIssue {
  const author = row(raw.author);
  const milestone = row(raw.milestone);
  return {
    id: asId(raw.id),
    number: asNumber(raw.iid) ?? 0,
    title: asStringLoose(raw.title),
    state: mapIssueState(asString(raw.state) ?? 'opened'),
    author: author ? asStringLoose(author['username']) : '',
    labels: asArray(raw.labels)
      .map((l) => row(l))
      .filter((l): l is Record<string, unknown> => l !== null)
      .map((l) => ({ name: asStringLoose(l['name']), color: (asString(l['color']) ?? '').replace(/^#/, '') })),
    assignees: asArray(raw.assignees)
      .map((a) => row(a)?.['username'])
      .filter((v): v is string => typeof v === 'string'),
    updatedAt: asString(raw.updated_at) ?? new Date(0).toISOString(),
    createdAt: asString(raw.created_at),
    url: asString(raw.web_url) ?? '',
    milestone: milestone ? { title: asStringLoose(milestone['title']) } : null,
  };
}

export async function listIssues(
  ctx: GitLabContext,
  forge: Forge,
  options: { limit: number; state: 'open' | 'closed' | 'all' },
): Promise<ForgeIssuesResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, issues: [], disabled: false, error: null };

  const stateParam = options.state === 'open' ? 'opened' : options.state;
  const result = await glGet<GitLabIssueRow[]>(ctx, `projects/${projectId(forge)}/issues`, {
    state: stateParam,
    per_page: Math.min(options.limit, LIST_LIMIT_CAP),
    order_by: 'updated_at',
    sort: 'desc',
    with_labels_details: true,
  });
  if (!result.ok) {
    // GitLab reports a project with issues turned off the same way it
    // reports one that does not exist — 404 — which is exactly the
    // "disabled" state `ForgeIssuesResultSchema` has a dedicated field for.
    if (result.status === 404) return { cli, issues: [], disabled: true, error: null };
    return { cli, issues: [], disabled: false, error: result.error };
  }

  return { cli, issues: asArray(result.data).map((r) => mapIssue(r as GitLabIssueRow)), disabled: false, error: null };
}

export async function issueDetail(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgeIssueDetailResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, issue: null, error: null };

  const result = await glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}/issues/${number}`, {
    with_labels_details: true,
  });
  if (!result.ok) return { cli, issue: null, error: result.error };

  return {
    cli,
    issue: { issue: mapIssue(result.data as GitLabIssueRow), body: asStringLoose(result.data['description']) },
    error: null,
  };
}

export async function issueComments(
  ctx: GitLabContext,
  forge: Forge,
  number: number,
): Promise<ForgeIssueCommentsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, comments: [], error: null };

  const result = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/issues/${number}/notes`, {
    per_page: LIST_LIMIT_CAP,
    order_by: 'created_at',
    sort: 'asc',
  });
  if (!result.ok) return { cli, comments: [], error: result.error };

  const issueUrl = `${projectUrl(forge)}/-/issues/${number}`;
  const comments: ForgeComment[] = asArray(result.data)
    .map((n) => row(n))
    .filter((n): n is Record<string, unknown> => n !== null && !asBool(n['system']))
    .map((n) => ({
      id: asId(n['id']),
      kind: 'comment',
      author: (() => {
        const author = row(n['author']);
        return author ? asStringLoose(author['username']) : '';
      })(),
      body: asStringLoose(n['body']),
      createdAt: asString(n['created_at']) ?? new Date(0).toISOString(),
      url: `${issueUrl}#note_${asId(n['id'])}`,
      reviewState: null,
    }));

  return { cli, comments, error: null };
}
