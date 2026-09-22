import type {
  ForgeComment,
  ForgeIssue,
  ForgeJob,
  ForgeLabel,
  ForgePull,
  ForgePullState,
  ForgeReviewComment,
  ForgeReviewDecision,
  ForgeReviewThread,
  ForgeRun,
  ForgeRunConclusion,
  ForgeRunStatus,
  ForgeStep,
  ForgeWorkflow,
} from '@midnite/studio-shared';

/**
 * Pure mappers from Bitbucket Cloud's REST 2.0 vocabulary onto this app's
 * GitHub-shaped schemas (Phase 90's "Settled" decision: GitHub's vocabulary
 * stays canonical, adapters map into it). Every function here takes the raw
 * JSON Bitbucket sends — loosely typed as `Record<string, unknown>` rather
 * than a generated client type, matching `gh-parse.ts`'s own posture that a
 * forge's payload is attacker-shaped input, not a typed contract.
 *
 * Nothing here makes a network call — that split is what makes the mapping
 * tables (the place this phase's bugs will live) testable with a literal
 * object and no fixture file, the way `gh-parse.test.ts` already tests
 * GitHub's mappers.
 */

type Json = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A Bitbucket user/account object's display login — `nickname` first (the
 *  handle a user recognises), falling back to `display_name`. */
function userLogin(raw: unknown): string {
  const user = asObject(raw);
  if (!user) return '';
  return asString(user['nickname']) || asString(user['display_name']);
}

function htmlUrl(raw: unknown): string {
  const links = asObject(asObject(raw)?.['links']);
  const html = asObject(links?.['html']);
  return asString(html?.['href']);
}

// --- pull requests -----------------------------------------------------

/** Bitbucket's four PR states onto GitHub's three. `SUPERSEDED` (replaced by
 *  a later PR on the same branch pair) has no GitHub analogue — it reads as
 *  `closed`, the same bucket `DECLINED` lands in, since neither is open and
 *  neither merged. */
export function mapPullState(raw: unknown): ForgePullState {
  switch (raw) {
    case 'OPEN':
      return 'open';
    case 'MERGED':
      return 'merged';
    case 'DECLINED':
    case 'SUPERSEDED':
      return 'closed';
    default:
      return 'closed';
  }
}

/**
 * The aggregate review verdict from a PR's `participants` array.
 *
 * Bitbucket has no branch-protection concept this endpoint exposes, so
 * `REVIEW_REQUIRED` is unreachable here — the same kind of honest gap the
 * phase doc names for GitLab's missing `CHANGES_REQUESTED`. `null` means
 * nobody has recorded a verdict yet.
 */
export function mapReviewDecision(participants: unknown): ForgeReviewDecision | null {
  const rows = asArray(participants);
  let approved = false;
  for (const row of rows) {
    const participant = asObject(row);
    if (!participant) continue;
    if (participant['state'] === 'changes_requested') return 'CHANGES_REQUESTED';
    if (participant['approved'] === true || participant['state'] === 'approved') approved = true;
  }
  return approved ? 'APPROVED' : null;
}

export function mapPull(raw: Json): ForgePull {
  const source = asObject(raw['source']);
  const sourceBranch = asObject(source?.['branch']);
  const author = raw['author'];

  return {
    id: String(raw['id'] ?? ''),
    number: asNumber(raw['id']) ?? 0,
    title: asString(raw['title']),
    state: mapPullState(raw['state']),
    isDraft: raw['draft'] === true,
    reviewDecision: mapReviewDecision(raw['participants']),
    checks: null, // Bitbucket reports build status per-commit, not rolled up on the PR itself.
    headBranch: asString(sourceBranch?.['name']),
    author: userLogin(author),
    url: htmlUrl(raw),
    mergedAt: raw['state'] === 'MERGED' ? asNullableString(raw['updated_on']) : null,
    closedAt:
      raw['state'] === 'DECLINED' || raw['state'] === 'SUPERSEDED'
        ? asNullableString(raw['updated_on'])
        : null,
  };
}

export type BitbucketPullDetailExtra = {
  body: string;
  baseBranch: string;
  headSha: string | null;
  baseSha: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function mapPullDetailExtra(raw: Json): BitbucketPullDetailExtra {
  const source = asObject(raw['source']);
  const destination = asObject(raw['destination']);
  const destBranch = asObject(destination?.['branch']);
  const sourceCommit = asObject(source?.['commit']);
  const destCommit = asObject(destination?.['commit']);
  const summary = asObject(raw['summary']);

  return {
    body: asString(summary?.['raw']),
    baseBranch: asString(destBranch?.['name']),
    headSha: asNullableString(sourceCommit?.['hash']),
    baseSha: asNullableString(destCommit?.['hash']),
    createdAt: asNullableString(raw['created_on']),
    updatedAt: asNullableString(raw['updated_on']),
  };
}

/**
 * The newest few of a PR's commits — the merge confirm's blast-radius sample
 * (`PULL_COMMIT_SAMPLE`, the cap `gh-parse.ts`'s own `parseCommitSample`
 * uses). Bitbucket's `/pullrequests/{id}/commits` returns newest-first
 * already (unlike `gh pr view --json commits`, which is oldest-first and
 * has to be reversed — see that function's own docblock), so no reordering
 * happens here. A sha-less row is dropped rather than shown with nothing to
 * abbreviate, the same rule GitHub's sample follows.
 */
export function mapCommitSample(rawCommits: readonly Json[], cap: number): { sha: string; subject: string }[] {
  const out: { sha: string; subject: string }[] = [];
  for (const raw of rawCommits) {
    if (out.length >= cap) break;
    const sha = asNullableString(raw['hash']);
    if (!sha) continue;
    out.push({ sha, subject: asString(raw['message']).split('\n')[0] ?? '' });
  }
  return out;
}

// --- issues --------------------------------------------------------------

/**
 * Bitbucket's issue states collapse onto `open`/`closed` — everything but
 * `new` and `open` reads as closed, since `resolved`/`invalid`/`duplicate`/
 * `wontfix`/`closed` are all terminal from a "does this still need work"
 * point of view, the same question `ForgeIssueState` exists to answer.
 */
export function mapIssueState(raw: unknown): 'open' | 'closed' {
  return raw === 'new' || raw === 'open' ? 'open' : 'closed';
}

/**
 * Bitbucket issues carry no free-form labels — `kind` (bug/enhancement/
 * proposal/task) is the closest thing, so it renders as a single chip rather
 * than an empty label row. Not a GitHub label in the visual sense (no colour
 * Bitbucket assigns), which is why `color` is left empty like every withheld
 * colour elsewhere in this schema.
 */
export function mapIssueLabels(raw: Json): ForgeLabel[] {
  const kind = asString(raw['kind']);
  return kind ? [{ name: kind, color: '' }] : [];
}

export function mapIssue(raw: Json): ForgeIssue {
  const assignee = raw['assignee'];
  const assigneeLogin = userLogin(assignee);

  return {
    id: String(raw['id'] ?? ''),
    number: asNumber(raw['id']) ?? 0,
    title: asString(raw['title']),
    state: mapIssueState(raw['state']),
    author: userLogin(raw['reporter']),
    labels: mapIssueLabels(raw),
    assignees: assigneeLogin ? [assigneeLogin] : [],
    updatedAt: asNullableString(raw['updated_on']) ?? asNullableString(raw['created_on']) ?? '',
    createdAt: asNullableString(raw['created_on']),
    url: htmlUrl(raw),
    milestone: null, // Bitbucket's "milestone" object exists but nothing here reads it yet.
  };
}

export function mapIssueBody(raw: Json): string {
  const content = asObject(raw['content']);
  return asString(content?.['raw']);
}

// --- pipelines (runs) ------------------------------------------------------

/**
 * `state.name` × `state.result.name` onto `ForgeRunStatus`/`ForgeRunConclusion`
 * — the tested table the phase doc asks for. Bitbucket's three-state
 * lifecycle (`PENDING`, `IN_PROGRESS`, `COMPLETED`) maps directly onto three
 * of GitHub's six; the other three (`waiting`/`requested`/`queued`) have no
 * Bitbucket equivalent and are simply never produced by this mapper.
 */
export function mapPipelineStatus(raw: Json): { status: ForgeRunStatus; conclusion: ForgeRunConclusion | null } {
  const state = asObject(raw['state']);
  const name = state?.['name'];

  if (name === 'PENDING') return { status: 'pending', conclusion: null };
  if (name === 'IN_PROGRESS') return { status: 'in_progress', conclusion: null };
  if (name !== 'COMPLETED') return { status: 'pending', conclusion: null };

  const result = asObject(state?.['result']);
  switch (result?.['name']) {
    case 'SUCCESSFUL':
      return { status: 'completed', conclusion: 'success' };
    case 'STOPPED':
      return { status: 'completed', conclusion: 'cancelled' };
    case 'ERROR':
    case 'FAILED':
      return { status: 'completed', conclusion: 'failure' };
    default:
      return { status: 'completed', conclusion: null };
  }
}

/** The one synthetic "workflow" every Bitbucket repo has — a single
 *  `bitbucket-pipelines.yml`, not a set of named workflow files the way
 *  GitHub Actions has one file per workflow. There is nothing to list. */
export const BITBUCKET_PIPELINES_WORKFLOW: ForgeWorkflow = {
  id: 'bitbucket-pipelines',
  name: 'Pipelines',
  path: 'bitbucket-pipelines.yml',
  state: null,
};

export function mapPipelineRun(raw: Json): ForgeRun {
  const { status, conclusion } = mapPipelineStatus(raw);
  const target = asObject(raw['target']);
  const commit = asObject(target?.['commit']);
  const trigger = asObject(raw['trigger']);
  const branchName = asString(target?.['ref_name']) || null;

  return {
    id: asString(raw['uuid']),
    name: BITBUCKET_PIPELINES_WORKFLOW.name,
    status,
    conclusion,
    headBranch: branchName,
    headSha: asNullableString(commit?.['hash']),
    createdAt: asNullableString(raw['created_on']) ?? '',
    url: htmlUrl(raw),
    event: asNullableString(trigger?.['name'])?.toLowerCase() ?? null,
    workflowId: BITBUCKET_PIPELINES_WORKFLOW.id,
    workflowName: BITBUCKET_PIPELINES_WORKFLOW.name,
    startedAt: null, // Bitbucket does not expose a pipeline-level "started_on" — only its steps have one.
    updatedAt: asNullableString(raw['completed_on']),
    displayTitle: branchName,
    number: asNumber(raw['build_number']),
    attempt: null, // A Bitbucket rerun is a new pipeline uuid, not an attempt counter on this one.
  };
}

/**
 * A pipeline "step" onto `ForgeJob`. Bitbucket does not nest a further step
 * tree beneath a step the way a GitHub Actions job nests steps, so `steps`
 * is always empty — the step itself is the leaf.
 */
export function mapPipelineStep(raw: Json): ForgeJob {
  const { status, conclusion } = mapPipelineStatus(raw);
  return {
    id: asString(raw['uuid']),
    name: asString(raw['name']) || 'Step',
    status,
    conclusion,
    startedAt: asNullableString(raw['started_on']),
    completedAt: asNullableString(raw['completed_on']),
    url: '',
    steps: [] as ForgeStep[],
  };
}

// --- comments and inline threads -------------------------------------------

type RawComment = Json;

/** A comment with no `inline` object is top-level PR/issue conversation. */
function isInline(raw: RawComment): boolean {
  return asObject(raw['inline']) !== null;
}

export function mapComment(raw: RawComment): ForgeComment {
  const content = asObject(raw['content']);
  return {
    id: String(raw['id'] ?? ''),
    kind: 'comment', // Bitbucket has no separate "review" collection — approvals are a PR-level flag, not a comment.
    author: userLogin(raw['user']),
    body: asString(content?.['raw']),
    createdAt: asNullableString(raw['created_on']) ?? '',
    url: htmlUrl(raw),
    reviewState: null,
  };
}

/** Top-level conversation: every comment Bitbucket did not anchor to a diff line. */
export function mapTopLevelComments(rawComments: readonly RawComment[]): ForgeComment[] {
  return rawComments.filter((raw) => !isInline(raw)).map(mapComment);
}

function mapReviewComment(raw: RawComment): ForgeReviewComment {
  const content = asObject(raw['content']);
  return {
    id: String(raw['id'] ?? ''),
    databaseId: String(raw['id'] ?? ''),
    author: userLogin(raw['user']),
    body: asString(content?.['raw']),
    createdAt: asNullableString(raw['created_on']) ?? '',
    url: htmlUrl(raw),
  };
}

/**
 * Bitbucket has no thread object at all — inline comments are a flat list
 * chained by `parent.id`, flatter than GitHub's own REST shape (which at
 * least groups by `in_reply_to_id` into a resolvable chain) and far flatter
 * than the GraphQL `reviewThreads` this app reads for GitHub. This is the
 * capability matrix's `threadResolution: 'partial'` row (Phase 90 Theme H):
 * a synthesised thread groups a root inline comment with every comment whose
 * parent chain leads back to it, and `resolved`/`outdated` are read off the
 * root — Bitbucket does not track per-reply resolution, only per-thread.
 *
 * `pullNumber` is folded into the thread id (`"{number}:{commentId}"`)
 * because `ForgeAdapter.setThreadResolved` receives only `{threadId,
 * resolved}` — no PR number — a shape GitHub's GraphQL thread id (a global
 * node id) needs nothing more to satisfy, but Bitbucket's REST resolve
 * endpoint is `/pullrequests/{number}/comments/{id}/resolve` and genuinely
 * needs both. Encoding the number into the id this adapter itself hands out
 * is the fix that costs no interface change — `create-bitbucket-adapter.ts`
 * decodes it back out. `ForgeReviewComment.id`/`databaseId` stay bare comment
 * ids, unprefixed, because `replyToReviewComment` already receives `number`
 * as its own argument.
 */
export function synthesizeThreads(rawComments: readonly RawComment[], pullNumber: number): ForgeReviewThread[] {
  const inline = rawComments.filter(isInline);
  const byId = new Map<string, RawComment>();
  for (const raw of inline) byId.set(String(raw['id']), raw);

  function rootOf(raw: RawComment): RawComment {
    const parent = asObject(raw['parent']);
    const parentId = parent ? String(parent['id']) : null;
    const parentRaw = parentId ? byId.get(parentId) : undefined;
    return parentRaw ? rootOf(parentRaw) : raw;
  }

  const groups = new Map<string, RawComment[]>();
  for (const raw of inline) {
    const root = rootOf(raw);
    const rootId = String(root['id']);
    const group = groups.get(rootId) ?? [];
    group.push(raw);
    groups.set(rootId, group);
  }

  const threads: ForgeReviewThread[] = [];
  for (const [rootId, group] of groups) {
    const root = byId.get(rootId);
    if (!root) continue;
    const inlineInfo = asObject(root['inline']);
    const toLine = asNumber(inlineInfo?.['to']);
    const fromLine = asNumber(inlineInfo?.['from']);

    // Oldest first, matching GitHub's own `reviewThreads` ordering.
    group.sort((a, b) => asString(a['created_on']).localeCompare(asString(b['created_on'])));

    threads.push({
      id: `${pullNumber}:${rootId}`,
      path: asString(inlineInfo?.['path']),
      line: toLine,
      originalLine: toLine ?? fromLine,
      startLine: null,
      side: toLine !== null ? 'RIGHT' : 'LEFT',
      resolved: asObject(root['resolution']) !== null,
      outdated: inlineInfo?.['outdated'] === true,
      fileLevel: toLine === null && fromLine === null,
      comments: group.map(mapReviewComment),
    });
  }
  return threads;
}
