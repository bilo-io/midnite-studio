import { parseMultiFileDiff } from '@midnite/studio-git-engine';
import {
  DIFF_DEFAULT_CONTEXT,
  PULL_COMMIT_SAMPLE,
  PULL_PATCH_BYTE_CAP,
  type Forge,
  type ForgeAccount,
  type ForgeComment,
  type ForgeIssue,
  type ForgeIssueCommentsResult,
  type ForgeIssueDetailResult,
  type ForgeIssuesResult,
  type ForgeJob,
  type ForgeLabel,
  type ForgePull,
  type ForgePullCommentsResult,
  type ForgePullDetailResult,
  type ForgePullFilesResult,
  type ForgePullsResult,
  type ForgePullThreadsResult,
  type ForgeReviewComment,
  type ForgeReviewThread,
  type ForgeRun,
  type ForgeRunDetailResult,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflow,
  type ForgeWorkflowsResult,
} from '@midnite/studio-shared';

import { parseRunLog } from '../github/gh-parse';
import { azGet, azPost, azureCliStatus, repoSegment, repositoryIdFor, stateCategoriesFor } from './azure-client';
import { buildFileDiffText } from './azure-diff';
import { asArray, asBool, asId, asNumber, asString, asStringLoose, fields, row } from './azure-json';
import { mapBuildStatus, mapMergeable, mapPullState, mapReviewDecision, mapWorkItemStateCategory } from './azure-mappers';

/**
 * Azure DevOps's read surface — REST 7.1, one function per `ForgeAdapter`
 * read method, bound together in `create-azure-adapter.ts`. The sibling of
 * `gitlab-read.ts`/`bitbucket-reads.ts`, over `azure-client.ts` rather than
 * `gitlab-client.ts`/`bitbucket-client.ts`.
 */

const LIST_LIMIT_CAP = 100;

function repoWebUrl(forge: Forge): string {
  return `https://${forge.host}/${forge.owner}/_git/${forge.repo}`;
}

function shortBranch(ref: string | null): string | null {
  if (!ref) return null;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

// ─── Pipelines ("runs") ───────────────────────────────────────────────────

type AzureBuildRow = Record<string, unknown>;

function mapBuild(raw: AzureBuildRow): ForgeRun {
  const status = asStringLoose(raw['status']);
  const result = asString(raw['result']);
  const { status: mappedStatus, conclusion } = mapBuildStatus(status, result);
  const definition = row(raw['definition']);
  const links = row(raw['_links']);
  const web = row(links?.['web']);
  const id = asId(raw['id']);
  const buildNumber = asString(raw['buildNumber']);

  return {
    id,
    name: (definition && asStringLoose(definition['name'])) || `Build #${id}`,
    status: mappedStatus,
    conclusion,
    headBranch: shortBranch(asString(raw['sourceBranch'])),
    headSha: asString(raw['sourceVersion']),
    createdAt: asString(raw['queueTime']) ?? new Date(0).toISOString(),
    url: (web && asString(web['href'])) ?? '',
    event: asString(raw['reason']),
    workflowId: definition ? asId(definition['id']) : null,
    workflowName: definition ? asStringLoose(definition['name']) : null,
    startedAt: asString(raw['startTime']),
    updatedAt: asString(raw['finishTime']),
    displayTitle: null,
    number: buildNumber && /^\d+$/.test(buildNumber) ? Number(buildNumber) : null,
    attempt: null,
  };
}

export async function listRuns(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; branch?: string; workflow?: string },
): Promise<ForgeRunsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, runs: [], error: null };

  const repositoryId = await repositoryIdFor(forge, account);
  if (!repositoryId) return { cli, runs: [], error: 'Could not resolve this repository on Azure DevOps.' };

  const result = await azGet<{ value?: AzureBuildRow[] }>(forge, account, 'build/builds', {
    $top: Math.min(options.limit, LIST_LIMIT_CAP),
    repositoryId,
    repositoryType: 'TfsGit',
    queryOrder: 'queueTimeDescending',
    ...(options.branch ? { branchName: `refs/heads/${options.branch}` } : {}),
    ...(options.workflow ? { definitions: options.workflow } : {}),
  });
  if (!result.ok) return { cli, runs: [], error: result.error };

  return { cli, runs: (result.data.value ?? []).map(mapBuild), error: null };
}

export async function listWorkflows(forge: Forge, account: ForgeAccount | null): Promise<ForgeWorkflowsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, workflows: [], error: null };

  const result = await azGet<{ value?: Array<Record<string, unknown>> }>(forge, account, 'build/definitions', {
    $top: LIST_LIMIT_CAP,
  });
  if (!result.ok) return { cli, workflows: [], error: result.error };

  // `path` on a classic build definition is a folder grouping, not a file —
  // Azure's YAML pipelines carry their actual `.yml` path on
  // `process.yamlFilename`, which this listing call does not expand. `name`
  // is what every consumer of `ForgeWorkflow.path` in this app actually
  // shows on screen, so it is the honest fallback rather than a folder path
  // that reads like a filename and is not one.
  const workflows: ForgeWorkflow[] = (result.data.value ?? []).map((raw) => {
    const r = row(raw) ?? {};
    const name = asStringLoose(r['name']);
    return { id: asId(r['id']), name, path: name, state: null };
  });
  return { cli, workflows, error: null };
}

/** A timeline record's `state` (`pending`/`inProgress`/`completed`) reads
 *  onto the same vocabulary a build's own `status` uses for `notStarted` — a
 *  record that has not started yet is simply never reported as `pending` at
 *  the top of a timeline, so the narrower three-value set maps in directly. */
function mapTimelineState(state: string, result: string | null): { status: ForgeRun['status']; conclusion: ForgeRun['conclusion'] } {
  const translated = state === 'pending' ? 'notStarted' : state;
  return mapBuildStatus(translated, result);
}

export async function runDetail(
  forge: Forge,
  account: ForgeAccount | null,
  runId: string,
): Promise<ForgeRunDetailResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const build = await azGet<AzureBuildRow>(forge, account, `build/builds/${encodeURIComponent(runId)}`);
  if (!build.ok) return { cli, detail: null, error: build.error };

  const timeline = await azGet<{ records?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `build/builds/${encodeURIComponent(runId)}/timeline`,
  );
  const records = timeline.ok ? (timeline.data.records ?? []) : [];

  const jobRecords = records.filter((r) => row(r)?.['type'] === 'Job');
  // A build with no jobs recorded (e.g. it failed before agent assignment)
  // falls back to its stages, so the pane shows something rather than an
  // empty tree for a run that genuinely did run.
  const topLevel = jobRecords.length > 0 ? jobRecords : records.filter((r) => row(r)?.['type'] === 'Stage');

  const jobs: ForgeJob[] = topLevel
    .map((raw) => row(raw))
    .filter((r): r is Record<string, unknown> => r !== null)
    .sort((a, b) => (asNumber(a['order']) ?? 0) - (asNumber(b['order']) ?? 0))
    .map((r) => {
      const { status, conclusion } = mapTimelineState(asStringLoose(r['state']), asString(r['result']));
      const id = asId(r['id']);
      const steps = records
        .map((raw2) => row(raw2))
        .filter((r2): r2 is Record<string, unknown> => r2 !== null && r2['type'] === 'Task' && asId(r2['parentId']) === id)
        .sort((a, b) => (asNumber(a['order']) ?? 0) - (asNumber(b['order']) ?? 0))
        .map((r2, index) => {
          const stepState = mapTimelineState(asStringLoose(r2['state']), asString(r2['result']));
          return {
            number: index + 1,
            name: asStringLoose(r2['name']),
            status: stepState.status,
            conclusion: stepState.conclusion,
            startedAt: asString(r2['startTime']),
            completedAt: asString(r2['finishTime']),
          };
        });
      return {
        id,
        name: asStringLoose(r['name']),
        status,
        conclusion,
        startedAt: asString(r['startTime']),
        completedAt: asString(r['finishTime']),
        url: '',
        steps,
      };
    });

  return { cli, detail: { run: mapBuild(build.data), jobs }, error: null };
}

/** The timeline record whose log should show when no `jobId` was named: the
 *  first failed one, or the last one — the same "what would a person look
 *  for" fallback `bitbucket-reads.ts`'s `runLog` already uses. */
function chooseLogRecord(records: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const withLog = records.filter((r) => row(r?.['log']) !== null);
  const failed = withLog.find((r) => asString(r['result']) === 'failed');
  return failed ?? withLog.at(-1) ?? null;
}

export async function runLog(
  forge: Forge,
  account: ForgeAccount | null,
  runId: string,
  options: { jobId?: string; full?: boolean } = {},
): Promise<ForgeRunLogResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, log: null, pending: false, error: null };

  const timeline = await azGet<{ records?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `build/builds/${encodeURIComponent(runId)}/timeline`,
  );
  if (!timeline.ok) return { cli, log: null, pending: false, error: timeline.error };
  const records = (timeline.data.records ?? []).map((r) => row(r)).filter((r): r is Record<string, unknown> => r !== null);

  const record = options.jobId ? (records.find((r) => asId(r['id']) === options.jobId) ?? null) : chooseLogRecord(records);
  if (!record) return { cli, log: null, pending: true, error: null };

  const logId = asNumber(row(record['log'])?.['id']);
  if (logId === null) return { cli, log: null, pending: true, error: null };

  const text = await azGet<string>(
    forge,
    account,
    `build/builds/${encodeURIComponent(runId)}/logs/${logId}`,
    undefined,
    { responseType: 'text' },
  );
  if (!text.ok) return { cli, log: null, pending: false, error: text.error };
  return { cli, log: parseRunLog(text.data, { full: options.full }), pending: false, error: null };
}

// ─── Pull requests ────────────────────────────────────────────────────────

type AzurePrRow = Record<string, unknown>;

function reviewerVotes(raw: AzurePrRow): { vote: number; isRequired: boolean }[] {
  return asArray(raw['reviewers'])
    .map((r) => row(r))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => ({ vote: asNumber(r['vote']) ?? 0, isRequired: asBool(r['isRequired']) }));
}

function mapPull(forge: Forge, raw: AzurePrRow): ForgePull {
  const createdBy = row(raw['createdBy']);
  const id = asId(raw['pullRequestId']);
  const status = asStringLoose(raw['status']);
  return {
    id,
    number: asNumber(raw['pullRequestId']) ?? 0,
    title: asStringLoose(raw['title']),
    state: mapPullState(status),
    isDraft: asBool(raw['isDraft']),
    reviewDecision: mapReviewDecision(reviewerVotes(raw)),
    checks: null, // Azure has no rolled-up check on the PR listing row itself — see pullDetail's own note.
    headBranch: shortBranch(asString(raw['sourceRefName'])) ?? '',
    author: createdBy ? asStringLoose(createdBy['uniqueName']) || asStringLoose(createdBy['displayName']) : '',
    url: `${repoWebUrl(forge)}/pullrequest/${id}`,
    mergedAt: status === 'completed' ? asNullableIso(raw['closedDate']) : null,
    closedAt: status === 'abandoned' ? asNullableIso(raw['closedDate']) : null,
  };
}

function asNullableIso(value: unknown): string | null {
  return asString(value);
}

export async function listPulls(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all' },
): Promise<ForgePullsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, pulls: [], error: null };

  // Azure's `searchCriteria.status` takes exactly one value per request and
  // has no `closed` bucket of its own (`abandoned` is the closest single
  // status) — `all` over-fetches and filters client-side, the same trade
  // `bitbucket-reads.ts`'s `listPulls` makes for its own `closed`.
  const statusParam = options.state === 'open' ? 'active' : options.state === 'merged' ? 'completed' : options.state === 'closed' ? 'abandoned' : 'all';

  const result = await azGet<{ value?: AzurePrRow[] }>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests`,
    { 'searchCriteria.status': statusParam, $top: Math.min(options.limit, LIST_LIMIT_CAP) },
  );
  if (!result.ok) return { cli, pulls: [], error: result.error };

  const pulls = (result.data.value ?? []).map((r) => mapPull(forge, r));
  return { cli, pulls: pulls.slice(0, options.limit), error: null };
}

export async function pullDetail(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullDetailResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const pr = await azGet<AzurePrRow>(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`);
  if (!pr.ok) return { cli, detail: null, error: pr.error };
  const raw = pr.data;

  const commits = await azGet<{ value?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/commits`,
    { $top: LIST_LIMIT_CAP },
  );
  const commitRows = commits.ok ? (commits.data.value ?? []) : [];

  const pull = mapPull(forge, raw);
  const lastMergeSource = row(raw['lastMergeSourceCommit']);
  const lastMergeTarget = row(raw['lastMergeTargetCommit']);

  return {
    cli,
    detail: {
      pull,
      body: asStringLoose(raw['description']),
      headSha: lastMergeSource ? asString(lastMergeSource['commitId']) : null,
      baseSha: lastMergeTarget ? asString(lastMergeTarget['commitId']) : null,
      baseBranch: shortBranch(asString(raw['targetRefName'])) ?? '',
      additions: 0, // Not returned by the PR resource — see `pullFiles`'s own docblock for why a byte-accurate count costs a full diff build.
      deletions: 0,
      changedFiles: 0,
      createdAt: asString(raw['creationDate']),
      updatedAt: asString(raw['creationDate']),
      mergeable: mapMergeable(asString(raw['mergeStatus'])),
      commitCount: commitRows.length,
      commits: commitRows.slice(0, PULL_COMMIT_SAMPLE).map((c) => {
        const r = row(c) ?? {};
        return { sha: asId(r['commitId']), subject: asStringLoose(r['comment']).split('\n')[0] ?? '' };
      }),
      reviewRequests: asArray(raw['reviewers'])
        .map((r) => row(r))
        .filter((r): r is Record<string, unknown> => r !== null && (asNumber(r['vote']) ?? 0) === 0)
        .map((r) => asStringLoose(r['uniqueName']) || asStringLoose(r['displayName']))
        .filter((v) => v.length > 0),
    },
    error: null,
  };
}

/**
 * Azure's Git API has no `gh pr diff`/GitLab-`/diffs`-style unified-patch
 * endpoint at all — only a change list (path + change type) and, separately,
 * raw file content at a commit. This builds the same unified-diff text
 * GitLab/Bitbucket hand over directly, from those two calls, via
 * `azure-diff.ts`'s line differ — see that module's own docblock.
 *
 * **Unverified against a live Azure DevOps organization** — the same caveat
 * `gitlab-read.ts`'s `scopeQuery` carries for its own best-effort mapping —
 * specifically the `iterations/{id}/changes` response shape
 * (`changeEntries[].item.path`/`.changeType`), which this app has not yet
 * exercised end to end.
 */
async function fetchPrDiff(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<{ changes: Array<{ path: string; changeType: string }>; baseCommit: string; targetCommit: string } | null> {
  const pr = await azGet<AzurePrRow>(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`);
  if (!pr.ok) return null;
  const lastMergeSource = row(pr.data['lastMergeSourceCommit']);
  const lastMergeTarget = row(pr.data['lastMergeTargetCommit']);
  const sourceCommit = lastMergeSource ? asString(lastMergeSource['commitId']) : null;
  const targetCommit = lastMergeTarget ? asString(lastMergeTarget['commitId']) : null;
  if (!sourceCommit || !targetCommit) return null;

  const iterations = await azGet<{ value?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/iterations`,
  );
  const lastIteration = iterations.ok ? asId(row(iterations.data.value?.at(-1))?.['id']) : '';
  if (!lastIteration) return null;

  const changesResult = await azGet<{ changeEntries?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/iterations/${lastIteration}/changes`,
    { $top: 500 },
  );
  if (!changesResult.ok) return null;

  const changes = (changesResult.data.changeEntries ?? [])
    .map((raw) => row(raw))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => {
      const item = row(r['item']) ?? {};
      const changeTypeRaw = asStringLoose(r['changeType']).toLowerCase();
      return { path: asStringLoose(item['path']), changeType: changeTypeRaw };
    })
    .filter((c) => c.path.length > 0);

  return { changes, baseCommit: targetCommit, targetCommit: sourceCommit };
}

async function fetchFileContent(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  commit: string,
): Promise<string | null> {
  const result = await azGet<string>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/items`,
    { path, 'versionDescriptor.version': commit, 'versionDescriptor.versionType': 'commit', includeContent: true },
    { responseType: 'text' },
  );
  return result.ok ? result.data : null;
}

const PULL_FILES_MAX_COUNT = 100;

export async function pullFiles(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullFilesResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, files: null, error: null };

  const diff = await fetchPrDiff(forge, account, number);
  if (diff === null) {
    return { cli, files: null, error: 'Could not load this pull request’s changes.' };
  }

  const changes = diff.changes.slice(0, PULL_FILES_MAX_COUNT);
  const omittedByCount = diff.changes.length - changes.length;
  let omittedFiles = omittedByCount;
  const parts: string[] = [];

  for (const change of changes) {
    const changeType = change.changeType.includes('rename')
      ? 'rename'
      : change.changeType === 'add'
        ? 'add'
        : change.changeType === 'delete'
          ? 'delete'
          : 'edit';

    const [oldContent, newContent] = await Promise.all([
      changeType === 'add' ? Promise.resolve(null) : fetchFileContent(forge, account, change.path, diff.baseCommit),
      changeType === 'delete' ? Promise.resolve(null) : fetchFileContent(forge, account, change.path, diff.targetCommit),
    ]);

    const text = buildFileDiffText(change.path, change.path, oldContent, newContent, changeType, DIFF_DEFAULT_CONTEXT);
    if (text === null) {
      omittedFiles += 1;
      continue;
    }
    parts.push(text);
  }

  const patch = parts.join('\n');
  const totalBytes = Buffer.byteLength(patch, 'utf8');
  let capped = patch;
  let truncated = false;
  if (totalBytes > PULL_PATCH_BYTE_CAP) {
    capped = patch.slice(0, PULL_PATCH_BYTE_CAP);
    truncated = true;
  }

  const files = parseMultiFileDiff(capped, { contextLines: DIFF_DEFAULT_CONTEXT, fallbackPath: `pull-${number}` });
  return {
    cli,
    files: { files, truncated: truncated || omittedFiles > 0, omittedFiles, totalBytes },
    error: null,
  };
}

// ─── Threads (conversation + inline) ─────────────────────────────────────

type AzureThread = Record<string, unknown>;

function threadIsInline(raw: AzureThread): boolean {
  return row(raw['threadContext']) !== null;
}

/** Every real comment in a thread — deleted rows and system-generated notes
 *  ("X voted Y") filtered out, the same rule GitLab's `splitDiscussions`
 *  applies to its own `system` notes. */
function realComments(comments: unknown[]): Record<string, unknown>[] {
  return comments
    .map((c) => row(c))
    .filter((c): c is Record<string, unknown> => c !== null && !asBool(c['isDeleted']) && asString(c['commentType']) !== 'system');
}

function commentAuthor(raw: Record<string, unknown>): string {
  const author = row(raw['author']);
  return author ? asStringLoose(author['uniqueName']) || asStringLoose(author['displayName']) : '';
}

async function fetchThreads(forge: Forge, account: ForgeAccount | null, number: number): Promise<AzureThread[] | null> {
  const result = await azGet<{ value?: AzureThread[] }>(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/threads`,
  );
  return result.ok ? (result.data.value ?? []).filter((t) => !asBool(row(t)?.['isDeleted'])) : null;
}

export async function pullComments(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullCommentsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, comments: [], error: null };

  const threads = await fetchThreads(forge, account, number);
  if (threads === null) return { cli, comments: [], error: 'Could not load this pull request’s conversation.' };

  const comments: ForgeComment[] = [];
  for (const thread of threads) {
    if (threadIsInline(thread)) continue;
    for (const c of realComments(asArray(thread['comments']))) {
      comments.push({
        id: asId(c['id']),
        kind: 'comment',
        author: commentAuthor(c),
        body: asStringLoose(c['content']),
        createdAt: asString(c['publishedDate']) ?? new Date(0).toISOString(),
        url: '',
        reviewState: null,
      });
    }
  }
  return { cli, comments, error: null };
}

export async function pullThreads(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgePullThreadsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, threads: [], error: null };

  const rawThreads = await fetchThreads(forge, account, number);
  if (rawThreads === null) return { cli, threads: [], error: 'Could not load this pull request’s threads.' };

  const threads: ForgeReviewThread[] = [];
  for (const thread of rawThreads) {
    if (!threadIsInline(thread)) continue;
    const comments = realComments(asArray(thread['comments']));
    if (comments.length === 0) continue;

    const context = row(thread['threadContext']) ?? {};
    const rightStart = row(context['rightFileStart']);
    const leftStart = row(context['leftFileStart']);
    const line = rightStart ? asNumber(rightStart['line']) : null;
    const status = asString(thread['status']);

    const reviewComments: ForgeReviewComment[] = comments.map((c) => ({
      id: asId(c['id']),
      // The thread id, not the comment id — `replyToReviewComment` and
      // `setThreadResolved` both key on `GET/PATCH .../threads/{threadId}`,
      // never on any one comment within it. Same convention GitLab's
      // discussion id plays for `databaseId` below.
      databaseId: asId(thread['id']),
      author: commentAuthor(c),
      body: asStringLoose(c['content']),
      createdAt: asString(c['publishedDate']) ?? new Date(0).toISOString(),
      url: '',
    }));

    threads.push({
      // `${prNumber}:${threadId}` — `ForgeAdapter.setThreadResolved` carries
      // only `{threadId, resolved}`, with no PR number, but the resolve
      // route is `PATCH .../pullrequests/{prNumber}/threads/{threadId}`, a
      // two-part key. Same fix GitLab/Bitbucket already made for the
      // identical interface gap — see `azure-writes.ts`'s own note.
      id: `${number}:${asId(thread['id'])}`,
      path: asStringLoose(context['filePath']).replace(/^\//, ''),
      line,
      originalLine: line ?? (leftStart ? asNumber(leftStart['line']) : null),
      startLine: null,
      side: line !== null ? 'RIGHT' : 'LEFT',
      resolved: status === 'fixed' || status === 'closed',
      // Azure's thread status has no distinct "the diff moved past this
      // anchor" flag the way GitHub's `isOutdated` does — a thread that no
      // longer maps onto the latest iteration simply keeps its last known
      // line, so `outdated` is always `false` here rather than a guess.
      outdated: false,
      fileLevel: line === null && !leftStart,
      comments: reviewComments,
    });
  }
  return { cli, threads, error: null };
}

// ─── Work items ("issues") ──────────────────────────────────────────────

const WORK_ITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.CreatedBy',
  'System.CreatedDate',
  'System.ChangedDate',
  'System.AssignedTo',
  'System.Tags',
  'System.IterationPath',
].join(',');

function identityLogin(value: unknown): string {
  const identity = row(value);
  if (identity) return asStringLoose(identity['uniqueName']) || asStringLoose(identity['displayName']);
  return typeof value === 'string' ? value : '';
}

function workItemLabels(f: Record<string, unknown>): ForgeLabel[] {
  // The work item's own type is carried as the first label — the phase doc's
  // own instruction to say, in the UI, that these are work items rather than
  // GitHub issues: `label-chip.tsx` already renders an arbitrary chip, and a
  // "Bug"/"Task"/"User Story" pill in that slot is the cheapest honest
  // signal that costs no new component.
  const type = asStringLoose(f['System.WorkItemType']);
  const tags = asStringLoose(f['System.Tags'])
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const labels: ForgeLabel[] = [];
  if (type) labels.push({ name: type, color: '' });
  for (const tag of tags) labels.push({ name: tag, color: '' });
  return labels;
}

function workItemUrl(forge: Forge, id: string): string {
  return `https://${forge.host}/${forge.owner}/_workitems/edit/${id}`;
}

async function mapWorkItem(forge: Forge, account: ForgeAccount | null, raw: unknown): Promise<ForgeIssue> {
  const f = fields(raw);
  const id = asId(f['System.Id']) || asId(row(raw)?.['id']);
  const type = asStringLoose(f['System.WorkItemType']);
  const categories = type ? await stateCategoriesFor(forge, account, type) : null;
  const stateName = asStringLoose(f['System.State']);
  const category = categories?.get(stateName) ?? null;
  const iterationPath = asStringLoose(f['System.IterationPath']);
  const iterationLeaf = iterationPath.split('\\').at(-1) ?? '';

  return {
    id,
    number: asNumber(f['System.Id']) ?? asNumber(row(raw)?.['id']) ?? 0,
    title: asStringLoose(f['System.Title']),
    state: mapWorkItemStateCategory(category),
    author: identityLogin(f['System.CreatedBy']),
    labels: workItemLabels(f),
    assignees: (() => {
      const login = identityLogin(f['System.AssignedTo']);
      return login ? [login] : [];
    })(),
    updatedAt: asString(f['System.ChangedDate']) ?? new Date(0).toISOString(),
    createdAt: asString(f['System.CreatedDate']),
    url: workItemUrl(forge, id),
    milestone: iterationLeaf.length > 0 ? { title: iterationLeaf } : null,
  };
}

export async function listIssues(
  forge: Forge,
  account: ForgeAccount | null,
  options: { limit: number; state: 'open' | 'closed' | 'all' },
): Promise<ForgeIssuesResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, issues: [], disabled: false, error: null };

  // State categories are per-project-per-type, so this over-fetches and
  // filters client-side rather than trying to build a state-name filter
  // from an unknown vocabulary — the same "fetch, then filter honestly"
  // trade `bitbucket-reads.ts`'s `listIssues` makes for its own state arg.
  const fetchLimit = Math.min(Math.max(options.limit * 2, options.limit), 200);
  const queryResult = await postWiql(forge, account, fetchLimit);
  if (!queryResult) return { cli, issues: [], disabled: false, error: 'Could not query Azure Boards work items.' };
  if (queryResult.length === 0) return { cli, issues: [], disabled: false, error: null };

  const ids = queryResult.slice(0, fetchLimit).map((w) => w.id);
  const hydrated = await azGet<{ value?: unknown[] }>(forge, account, 'wit/workitems', {
    ids: ids.join(','),
    fields: WORK_ITEM_FIELDS,
  });
  if (!hydrated.ok) return { cli, issues: [], disabled: false, error: hydrated.error };

  const mapped = await Promise.all((hydrated.data.value ?? []).map((raw) => mapWorkItem(forge, account, raw)));
  const filtered = options.state === 'all' ? mapped : mapped.filter((issue) => issue.state === options.state);
  return { cli, issues: filtered.slice(0, options.limit), disabled: false, error: null };
}

async function postWiql(
  forge: Forge,
  account: ForgeAccount | null,
  top: number,
): Promise<Array<{ id: string }> | null> {
  const query = `SELECT TOP ${top} [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC`;
  const result = await azPost<{ workItems?: Array<{ id?: unknown }> }>(forge, account, 'wit/wiql', { query });
  if (!result.ok) return null;
  return (result.data.workItems ?? [])
    .map((w) => asId(row(w)?.['id']))
    .filter((id) => id.length > 0)
    .map((id) => ({ id }));
}

/** A minimal HTML→text reader for `System.Description`, which Azure stores
 *  as rich HTML rather than markdown. `ForgeIssueDetail.body`'s own contract
 *  says "markdown, as authored" — Azure never authors markdown here, so
 *  rendering the raw tags verbatim would be the dishonest answer; stripping
 *  them to plain text is the closest this app gets without a second render
 *  path just for one provider's one field. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function issueDetail(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgeIssueDetailResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, issue: null, error: null };

  const result = await azGet<Record<string, unknown>>(forge, account, `wit/workitems/${number}`, {
    fields: `${WORK_ITEM_FIELDS},System.Description`,
  });
  if (!result.ok) return { cli, issue: null, error: result.error };

  const issue = await mapWorkItem(forge, account, result.data);
  const f = fields(result.data);
  const description = asStringLoose(f['System.Description']);
  return { cli, issue: { issue, body: description ? htmlToText(description) : '' }, error: null };
}

export async function issueComments(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
): Promise<ForgeIssueCommentsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, comments: [], error: null };

  const result = await azGet<{ comments?: Array<Record<string, unknown>> }>(
    forge,
    account,
    `wit/workItems/${number}/comments`,
    { 'api-version': '7.1-preview.3' },
  );
  if (!result.ok) return { cli, comments: [], error: result.error };

  const comments: ForgeComment[] = (result.data.comments ?? [])
    .map((raw) => row(raw))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => ({
      id: asId(r['id']),
      kind: 'comment',
      author: identityLogin(r['createdBy']),
      body: asStringLoose(r['text']),
      createdAt: asString(r['createdDate']) ?? new Date(0).toISOString(),
      url: `${workItemUrl(forge, String(number))}#comment-${asId(r['id'])}`,
      reviewState: null,
    }));
  return { cli, comments, error: null };
}
