import { parseMultiFileDiff } from '@midnite/studio-git-engine';
import {
  DIFF_DEFAULT_CONTEXT,
  PULL_COMMIT_SAMPLE,
  PULL_PATCH_BYTE_CAP,
  type Forge,
  type ForgeAccount,
  type ForgeIssueCommentsResult,
  type ForgeIssueDetailResult,
  type ForgeIssuesResult,
  type ForgePullCommentsResult,
  type ForgePullDetailResult,
  type ForgePullFilesResult,
  type ForgePullScope,
  type ForgePullsResult,
  type ForgePullThreadsResult,
  type ForgeRunDetailResult,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflowsResult,
} from '@midnite/studio-shared';

import { capPatch, stripPatchPreamble } from '../github/gh-cli';
import { parseRunLog } from '../github/gh-parse';
import { bitbucketCliStatus, bitbucketPaginate, bitbucketRequest, repoPath } from './bitbucket-client';
import {
  BITBUCKET_PIPELINES_WORKFLOW,
  mapComment,
  mapCommitSample,
  mapIssue,
  mapIssueBody,
  mapPipelineRun,
  mapPipelineStep,
  mapPull,
  mapPullDetailExtra,
  mapTopLevelComments,
  synthesizeThreads,
} from './bitbucket-map';

/**
 * The read half of Bitbucket Cloud's adapter — every method
 * `create-bitbucket-adapter.ts` binds onto `ForgeAdapter`'s read surface.
 * Each function resolves `bitbucketCliStatus` first so a missing/rejected
 * account reports the same honest "not authenticated" the interface's
 * deferred docblock note describes, rather than a raw HTTP 401 leaking
 * through to the UI.
 */

const PAGE_SIZE = 50;

// --- pipelines (runs) --------------------------------------------------

export async function listRuns(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; branch?: string; workflow?: string },
): Promise<ForgeRunsResult> {
  const query: Record<string, string | number> = { pagelen: Math.min(PAGE_SIZE, options.limit), sort: '-created_on' };
  // `workflow` has nothing to filter by — a Bitbucket repo has exactly one
  // pipeline definition (`BITBUCKET_PIPELINES_WORKFLOW`), never several.
  if (options.branch) query['target.ref_name'] = options.branch;

  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, '/pipelines/'),
    query,
    options.limit,
  );
  if (!result.ok) return { cli: result.cli, runs: [], error: result.error };
  return { cli: result.cli, runs: result.data.map(mapPipelineRun), error: null };
}

export async function runDetail(
  forge: Forge,
  account: ForgeAccount | null,
  runId: string,
): Promise<ForgeRunDetailResult> {
  const pipeline = await bitbucketRequest<Record<string, unknown>>(
    account,
    'GET',
    repoPath(forge, `/pipelines/${encodeURIComponent(runId)}`),
  );
  if (!pipeline.ok) return { cli: pipeline.cli, detail: null, error: pipeline.error };

  const steps = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, `/pipelines/${encodeURIComponent(runId)}/steps/`),
    {},
    100,
  );
  if (!steps.ok) return { cli: steps.cli, detail: null, error: steps.error };

  return {
    cli: pipeline.cli,
    detail: { run: mapPipelineRun(pipeline.data), jobs: steps.data.map(mapPipelineStep) },
    error: null,
  };
}

/**
 * Bitbucket has no whole-pipeline log — only a per-step one. When `jobId` is
 * given, that step's log is fetched. When it is not, this resolves the step
 * to show the way a user would look for one: the first failed step, or the
 * last step if none failed. `parseRunLog` (from `gh-parse.ts`) is provider-
 * agnostic string processing — the head/tail cap it applies to a GitHub log
 * applies identically here.
 */
export async function runLog(
  forge: Forge,
  account: ForgeAccount | null,
  runId: string,
  options?: { jobId?: string; full?: boolean },
): Promise<ForgeRunLogResult> {
  let stepId = options?.jobId;

  if (!stepId) {
    const steps = await bitbucketPaginate<Record<string, unknown>>(
      account,
      repoPath(forge, `/pipelines/${encodeURIComponent(runId)}/steps/`),
      {},
      100,
    );
    if (!steps.ok) return { cli: steps.cli, log: null, pending: false, error: steps.error };
    const failed = steps.data.find((step) => {
      const state = step['state'] as Record<string, unknown> | undefined;
      const result = state?.['result'] as Record<string, unknown> | undefined;
      return result?.['name'] === 'FAILED' || result?.['name'] === 'ERROR';
    });
    const chosen = failed ?? steps.data.at(-1);
    if (!chosen) {
      const cli = await bitbucketCliStatus(account);
      return { cli, log: null, pending: true, error: null };
    }
    stepId = String(chosen['uuid']);
  }

  const text = await bitbucketRequest<string>(
    account,
    'GET',
    repoPath(forge, `/pipelines/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/log`),
    { responseType: 'text' },
  );
  if (!text.ok) return { cli: text.cli, log: null, pending: false, error: text.error };
  return { cli: text.cli, log: parseRunLog(text.data, { full: options?.full }), pending: false, error: null };
}

export async function listWorkflows(forge: Forge, account: ForgeAccount | null): Promise<ForgeWorkflowsResult> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { cli, workflows: [], error: null };
  // Static — see `BITBUCKET_PIPELINES_WORKFLOW`'s own docblock. No request needed.
  void forge;
  return { cli, workflows: [BITBUCKET_PIPELINES_WORKFLOW], error: null };
}

// --- pull requests -------------------------------------------------------

/**
 * Bitbucket's `state` query parameter takes exactly one value per request,
 * so `'closed'` (which spans Bitbucket's own `DECLINED` and `SUPERSEDED`)
 * and `'all'` are resolved by over-fetching and filtering here rather than
 * on the server — the same trade `listIssues` below makes for the same
 * reason. `'open'` and `'merged'` map onto a single Bitbucket state and are
 * filtered server-side.
 */
function bitbucketPullStateParam(state: 'open' | 'closed' | 'merged' | 'all'): string | undefined {
  switch (state) {
    case 'open':
      return 'OPEN';
    case 'merged':
      return 'MERGED';
    default:
      return undefined;
  }
}

/**
 * `scope` as a BBQL `q` filter against the account's own login. **Unverified
 * against a live workspace** — Bitbucket's BBQL accepts `author.username`/
 * `reviewers.username` clauses per its documented query language, but this
 * adapter has not been run against a real Bitbucket repo yet (the phase's
 * own "Human pass" verification item). If a workspace rejects the clause,
 * this degrades to an HTTP error surfaced through `ForgePullsResult.error`
 * rather than a silent empty list.
 */
function scopeQuery(scope: ForgePullScope | undefined, login: string): string | undefined {
  if (scope === 'mine') return `author.username="${login}"`;
  if (scope === 'review-requested') return `reviewers.username="${login}"`;
  return undefined;
}

export async function listPulls(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all'; scope?: ForgePullScope },
): Promise<ForgePullsResult> {
  const query: Record<string, string | number> = { pagelen: Math.min(PAGE_SIZE, Math.max(options.limit, 1) * 2) };
  const stateParam = bitbucketPullStateParam(options.state);
  if (stateParam) query['state'] = stateParam;
  const q = account ? scopeQuery(options.scope, account.login) : undefined;
  if (q) query['q'] = q;

  // Over-fetch by 2x when a client-side filter (`closed`) will run, since the
  // server-side page otherwise stops short of `limit` matching rows.
  const fetchLimit = stateParam ? options.limit : options.limit * 2;
  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, '/pullrequests'),
    query,
    Math.max(fetchLimit, options.limit),
  );
  if (!result.ok) return { cli: result.cli, pulls: [], error: result.error };

  let pulls = result.data.map(mapPull);
  if (options.state === 'closed') pulls = pulls.filter((p) => p.state === 'closed');
  return { cli: result.cli, pulls: pulls.slice(0, options.limit), error: null };
}

export async function pullDetail(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullDetailResult> {
  const result = await bitbucketRequest<Record<string, unknown>>(
    account,
    'GET',
    repoPath(forge, `/pullrequests/${number}`),
  );
  if (!result.ok) return { cli: result.cli, detail: null, error: result.error };

  const pull = mapPull(result.data);
  const extra = mapPullDetailExtra(result.data);

  /*
    Not skippable: `commitCount` is what the merge confirm's blast-radius
    dialog shows (CLAUDE.md's "destructive ops need a confirm dialog showing
    blast radius"), so a stubbed `0` here would be silently wrong on every
    real Bitbucket PR, not just an honest gap. `/commits` is a second
    request the PR resource itself does not fold in — unlike `gh pr view
    --json commits`, which returns the full list in the same call.
  */
  const commits = await bitbucketRequest<{ values?: Record<string, unknown>[]; size?: number }>(
    account,
    'GET',
    repoPath(forge, `/pullrequests/${number}/commits`),
    { query: { pagelen: PULL_COMMIT_SAMPLE } },
  );
  const commitRows = commits.ok ? (commits.data.values ?? []) : [];
  const commitCount = commits.ok ? (commits.data.size ?? commitRows.length) : 0;

  return {
    cli: result.cli,
    detail: {
      pull,
      body: extra.body,
      headSha: extra.headSha,
      baseSha: extra.baseSha,
      baseBranch: extra.baseBranch,
      additions: 0, // Not returned by the PR resource itself — `/diffstat` would cost a second call nothing here reads yet.
      deletions: 0,
      changedFiles: 0,
      createdAt: extra.createdAt,
      updatedAt: extra.updatedAt,
      mergeable: null, // Bitbucket exposes no equivalent tri-state field on this resource.
      commitCount,
      commits: mapCommitSample(commitRows, PULL_COMMIT_SAMPLE),
      reviewRequests: [],
    },
    error: null,
  };
}

/**
 * `GET /pullrequests/{id}/diff` returns a raw unified diff — the same
 * `parseMultiFileDiff`/`capPatch` path `gh pr diff`'s output takes in
 * `gh-cli.ts`'s own `pullFiles`, reused rather than re-solved (renames,
 * combined hunks, `\ No newline` are already handled there).
 */
export async function pullFiles(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullFilesResult> {
  const result = await bitbucketRequest<string>(
    account,
    'GET',
    repoPath(forge, `/pullrequests/${number}/diff`),
    { responseType: 'text' },
  );
  if (!result.ok) return { cli: result.cli, files: null, error: result.error };

  const patch = stripPatchPreamble(result.data);
  const capped = capPatch(patch, PULL_PATCH_BYTE_CAP);
  const files = parseMultiFileDiff(capped.patch, {
    contextLines: DIFF_DEFAULT_CONTEXT,
    fallbackPath: `pull-${number}`,
  });

  return {
    cli: result.cli,
    files: { files, truncated: capped.truncated, omittedFiles: capped.omittedFiles, totalBytes: capped.totalBytes },
    error: null,
  };
}

export async function pullComments(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullCommentsResult> {
  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, `/pullrequests/${number}/comments`),
    { pagelen: 100 },
    500,
  );
  if (!result.ok) return { cli: result.cli, comments: [], error: result.error };
  return { cli: result.cli, comments: mapTopLevelComments(result.data), error: null };
}

export async function pullThreads(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullThreadsResult> {
  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, `/pullrequests/${number}/comments`),
    { pagelen: 100 },
    500,
  );
  if (!result.ok) return { cli: result.cli, threads: [], error: result.error };
  return { cli: result.cli, threads: synthesizeThreads(result.data, number), error: null };
}

// --- issues ----------------------------------------------------------------

/**
 * `GET /issues` 404s outright when a repository's tracker is off — the
 * per-repo `disabled` state [Phase 54](../../../../../.midnite/tasks/phases/phase-54-issues-view.md)
 * already built for GitHub, reused rather than a second empty state (the
 * phase doc's own instruction for this theme).
 */
export async function listIssues(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; state: 'open' | 'closed' | 'all' },
): Promise<ForgeIssuesResult> {
  const fetchLimit = options.state === 'all' ? options.limit : options.limit * 2;
  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, '/issues'),
    { pagelen: Math.min(PAGE_SIZE, Math.max(fetchLimit, 1)), sort: '-updated_on' },
    Math.max(fetchLimit, options.limit),
  );
  if (!result.ok) {
    if (result.status === 404) return { cli: result.cli, issues: [], disabled: true, error: null };
    return { cli: result.cli, issues: [], disabled: false, error: result.error };
  }

  let issues = result.data.map(mapIssue);
  if (options.state !== 'all') issues = issues.filter((issue) => issue.state === options.state);
  return { cli: result.cli, issues: issues.slice(0, options.limit), disabled: false, error: null };
}

export async function issueDetail(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgeIssueDetailResult> {
  const result = await bitbucketRequest<Record<string, unknown>>(account, 'GET', repoPath(forge, `/issues/${number}`));
  if (!result.ok) return { cli: result.cli, issue: null, error: result.error };
  return { cli: result.cli, issue: { issue: mapIssue(result.data), body: mapIssueBody(result.data) }, error: null };
}

export async function issueComments(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgeIssueCommentsResult> {
  const result = await bitbucketPaginate<Record<string, unknown>>(
    account,
    repoPath(forge, `/issues/${number}/comments`),
    { pagelen: 100 },
    500,
  );
  if (!result.ok) return { cli: result.cli, comments: [], error: result.error };
  return { cli: result.cli, comments: result.data.map(mapComment), error: null };
}
