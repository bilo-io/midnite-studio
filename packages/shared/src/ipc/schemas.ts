import { z } from 'zod';

import {
  BlameResultSchema,
  BrowserBoundsSchema,
  BrowserEventSchema,
  BrowserNavErrorSchema,
  CommitSchema,
  ConflictSideSchema,
  InProgressOpSchema,
  DiagnosticsCandidateSchema,
  DiagnosticsCommandSchema,
  DiagnosticsRunSchema,
  DiagnosticsTrustStatusSchema,
  DIFF_DEFAULT_CONTEXT,
  DIFF_FULL_CONTEXT,
  FileDiffSchema,
  ForgeCliStatusSchema,
  ForgeIssuesResultSchema,
  ForgeMergeMethodSchema,
  ForgePullCommentsResultSchema,
  ForgePullDetailResultSchema,
  ForgePullFilesResultSchema,
  ForgePullScopeSchema,
  ForgePullsResultSchema,
  ForgePullThreadsResultSchema,
  ForgeProjectFieldsResultSchema,
  ForgeProjectFieldValueSchema,
  ForgeProjectItemsResultSchema,
  ForgeProjectsResultSchema,
  ForgeProjectWriteResultSchema,
  GrepHitSchema,

  ForgeReviewEventSchema,
  ForgeRunDetailResultSchema,
  ForgeRunLogResultSchema,
  ForgeRunsResultSchema,
  ForgeWorkflowsResultSchema,
  ForgeWriteResultSchema,
  GitOpResultOf,
  GitOpResultSchema,
  GraphRowSchema,
  METRICS_MAX_INTERVAL_MS,
  METRICS_MIN_INTERVAL_MS,
  MetricSampleSchema,
  RefSchema,
  ReflogEntrySchema,
  RemoteSchema,
  RebaseSequencePlanSchema,
  RepoDescriptorSchema,
  RepoStatsSchema,
  ScaffoldApplyResultSchema,
  ScaffoldPlanSchema,
  StashDetailSchema,
  StashDropResultSchema,
  StashEntrySchema,
  StashPartSchema,
  StatsWindowSchema,
  StatusCountsSchema,
  StatusResultSchema,
  TestDiscoverySchema,
  TestRunResultSchema,
  TestTrustStatusSchema,
  WatchEventSchema,
  WorktreeSchema,
} from '../domain';
import {
  ClaudeInfoSchema,
  FsEntrySchema,
  FsSearchModeSchema,
  FsVersionSchema,
  FsWriteScopeSchema,
  GrepMatchSchema,
} from '../fs';
import {
  AgentDefinitionSchema,
  AgentStatusSchema,
  SessionActivitySchema,
  TerminalSessionKindSchema,
  TerminalSessionSchema,
  agentIdMatchesKind,
} from '../terminal';
import {
  CouncilMemberProviderSchema,
  CouncilMemberSchema,
  CouncilRunSchema,
  CouncilSchema,
} from '../council';
import { LoopModelSchema, LoopRunRecordSchema } from '../loops';
import { WorkflowRunSchema, WorkflowSchema } from '../workflow';

/**
 * Payload/response schemas for every channel. Each `ipcMain.handle` parses its
 * payload with the matching schema before touching git: the renderer is a
 * separate process and, contextIsolation notwithstanding, main must not trust
 * the shape of anything crossing the boundary.
 *
 * Responses are validated in tests rather than at runtime on the hot path —
 * they originate in main, so a mismatch is a bug we want caught in CI, not a
 * per-call cost on a 50k-row log stream.
 */

const RepoId = z.object({ repoId: z.string().min(1) });

// --- repositories ----------------------------------------------------------

export const RepoOpenRequest = z.object({
  /** Absolute path. May point at a linked worktree — main resolves it to the repo. */
  path: z.string().min(1),
});
export const RepoOpenResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), repo: RepoDescriptorSchema }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

export const RepoListResponse = z.array(RepoDescriptorSchema);
export const RepoCloseRequest = RepoId;
export const RepoRefsRequest = RepoId;
export const RepoRefsResponse = z.array(RefSchema);
export const RepoWorktreesRequest = RepoId;
export const RepoWorktreesResponse = z.array(WorktreeSchema);

export const WorktreeAddRequest = RepoId.extend({
  path: z.string().min(1),
  /** Branch to check out. When `createBranch`, this is the new branch's name. */
  branch: z.string().min(1),
  createBranch: z.boolean().default(false),
  /** Start point for a newly created branch (defaults to HEAD). */
  startPoint: z.string().optional(),
});
export const WorktreeRemoveRequest = RepoId.extend({
  path: z.string().min(1),
  force: z.boolean().default(false),
});

// --- log stream ------------------------------------------------------------

export const LogStartRequest = RepoId.extend({
  /**
   * Correlates batches with the request that produced them. On repo switch the
   * renderer bumps this and drops any batch carrying a stale id — otherwise
   * in-flight rows from the previous repo append to the new repo's graph.
   */
  requestId: z.string().min(1),
  /** Hard cap on rows; the UI offers "load more" beyond it. */
  limit: z.number().int().positive().default(50_000),
  /**
   * Fully-qualified refs to walk (`refs/heads/main`), or empty for every ref.
   *
   * Fully-qualified because `main` and `origin/main` are different commits with
   * the same short name, and `git log main` would silently resolve one of them.
   *
   * Filtering here rather than in the renderer is what keeps the lanes honest:
   * the layout engine assigns lanes from the commits it is given, so hiding
   * rows after the fact would leave edges running into empty space.
   *
   * Defaulted, so a payload written before this field existed still parses.
   */
  revisions: z.array(z.string()).default([]),
});
export const LogCancelRequest = z.object({ requestId: z.string().min(1) });

export const LogBatchEvent = z.object({
  requestId: z.string(),
  rows: z.array(GraphRowSchema),
});
export const LogDoneEvent = z.object({
  requestId: z.string(),
  total: z.number().int().nonnegative(),
  /** True when the stream stopped at `limit` rather than at the root commit. */
  truncated: z.boolean(),
  /** Set when the stream died; the UI shows this instead of an empty graph. */
  error: z.string().optional(),
});

// --- search stream & blame -------------------------------------------------

const SafeArgvString = z
  .string()
  .refine((v) => !v.startsWith('-'), 'must not begin with "-"');

const SafePathspecString = SafeArgvString.refine(
  (p) => !p.startsWith('/') && !p.includes('..'),
  'must be a repo-relative path without ".."',
);

export const CommitsSearchQuerySchema = z.object({
  grep: z.array(SafeArgvString).optional(),
  author: z.array(SafeArgvString).optional(),
  since: SafeArgvString.optional(),
  until: SafeArgvString.optional(),
  paths: z.array(SafePathspecString).optional(),
  pickaxeString: SafeArgvString.optional(),
  pickaxeRegex: SafeArgvString.optional(),
  regexp: z.boolean().default(false),
  ignoreCase: z.boolean().default(false),
});
export type CommitsSearchQuery = z.infer<typeof CommitsSearchQuerySchema>;

export const ContentSearchQuerySchema = z.object({
  pattern: SafeArgvString,
  rev: SafeArgvString.optional(),
  paths: z.array(SafePathspecString).optional(),
  regexp: z.boolean().default(false),
  ignoreCase: z.boolean().default(false),
  wordMatch: z.boolean().default(false),
  contextLines: z.number().int().nonnegative().default(0),
});
export type ContentSearchQuery = z.infer<typeof ContentSearchQuerySchema>;

export const SearchStartRequest = z.discriminatedUnion('mode', [
  RepoId.extend({
    mode: z.literal('commits'),
    requestId: z.string().min(1),
    cap: z.number().int().positive().default(5000),
    query: CommitsSearchQuerySchema,
  }),
  RepoId.extend({
    mode: z.literal('content'),
    requestId: z.string().min(1),
    cap: z.number().int().positive().default(5000),
    query: ContentSearchQuerySchema,
  }),
]);
export type SearchStartRequest = z.infer<typeof SearchStartRequest>;

export const SearchStartResponse = GitOpResultOf(z.object({ started: z.literal(true) }));
export type SearchStartResponse = z.infer<typeof SearchStartResponse>;

export const SearchCancelRequest = RepoId.extend({
  requestId: z.string().optional(),
});
export type SearchCancelRequest = z.infer<typeof SearchCancelRequest>;

export const BlameReadRequest = RepoId.extend({
  relPath: SafePathspecString,
  rev: SafeArgvString.optional(),
  followRenames: z.boolean().default(false),
  worktreePath: z.string().optional(),
});
export type BlameReadRequest = z.infer<typeof BlameReadRequest>;

export const BlameReadResponse = GitOpResultOf(BlameResultSchema);
export type BlameReadResponse = z.infer<typeof BlameReadResponse>;


export const SearchBatchEvent = z.discriminatedUnion('mode', [
  z.object({
    requestId: z.string(),
    mode: z.literal('commits'),
    commits: z.array(CommitSchema),
  }),
  z.object({
    requestId: z.string(),
    mode: z.literal('content'),
    hits: z.array(GrepHitSchema),
  }),
]);
export type SearchBatchEvent = z.infer<typeof SearchBatchEvent>;

export const SearchDoneEvent = z.object({
  requestId: z.string(),
  mode: z.enum(['commits', 'content']),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  error: z.string().optional(),
});
export type SearchDoneEvent = z.infer<typeof SearchDoneEvent>;


// --- status / detail -------------------------------------------------------

export const StatusGetRequest = RepoId.extend({
  /** Which checkout to inspect. Defaults to the repo's main worktree. */
  worktreePath: z.string().optional(),
});
export const StatusGetResponse = StatusResultSchema;

/** Same target as `StatusGetRequest` — a repo, and optionally one of its checkouts. */
export const StatusCountsRequest = RepoId.extend({
  worktreePath: z.string().optional(),
});
export const StatusCountsResponse = StatusCountsSchema;

/**
 * A revision, restricted to hex.
 *
 * The only producer is the linkifier, which matches 7-40 hex characters, and the
 * value reaches a `git` argv. Hex-only is therefore both sufficient and the
 * tightest guard available: no leading `-` to be read as an option, no `..` to
 * become a range, no `^{}` peel, no refname at all. Widening this to accept
 * branch names is a deliberate decision to make later, not a default to inherit.
 */
const HexRev = z
  .string()
  .regex(/^[0-9a-fA-F]{4,40}$/, 'A revision must be 4-40 hexadecimal characters.');

export const RevParseRequest = RepoId.extend({ rev: HexRev });
/** `sha` is null when the revision names nothing in this repository. */
export const RevParseResponse = z.object({ sha: z.string().nullable() });

/**
 * One commit, in full.
 *
 * `committer` is always populated — git writes both trailers on every commit —
 * and the renderer is what decides whether to show it, by comparing the two.
 * Shipping it unconditionally keeps that decision in one place instead of
 * splitting it between a handler that omits a field and a view that checks for
 * its absence.
 */
const CommitIdentity = z.object({
  name: z.string(),
  email: z.string(),
  /** Unix seconds, matching every other date on the wire (see GraphRow). */
  date: z.number().int(),
});

/**
 * Hex, like `RevParseRequest` — not `z.string().min(1)`.
 *
 * The value becomes a `git show` argument, and `git show` accepts diff options:
 * `--output=<file>` alone is an arbitrary file write. Every caller already
 * passes hex (a graph row's sha, a parent, or the linkifier's output, which is
 * hex by construction), so this costs nothing and removes the asymmetry where
 * one of the two rev-taking channels was guarded and the other was not.
 */
export const CommitDetailRequest = RepoId.extend({ sha: HexRev });
export const CommitDetailResponse = z.object({
  /**
   * The resolved 40-char sha, which need not equal the requested one — the
   * request accepts anything `git show` does.
   */
  sha: z.string(),
  /** Parent shas, in git's order. Two or more means a merge. */
  parents: z.array(z.string()),
  /** `%s` — the first line, already stripped of its trailing newline. */
  subject: z.string(),
  /** `%B` — the whole message, subject included. */
  body: z.string(),
  author: CommitIdentity,
  committer: CommitIdentity,
  files: z.array(
    z.object({
      path: z.string(),
      /**
       * Pre-image path on a rename, else null. Carried so the inspector can ask
       * for a rename-aware diff — a path-scoped diff without both sides reports
       * the file as wholly new.
       */
      oldPath: z.string().nullable().default(null),
      insertions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
    }),
  ),
});

/**
 * How much context to ask git for. Bounded because it becomes a `-U` argument:
 * the renderer supplies it when expanding a collapsed gap, and an unbounded
 * value from the renderer is an unbounded amount of work in main.
 */
const ContextLines = z.number().int().nonnegative().max(DIFF_FULL_CONTEXT);

/**
 * The pre-image path when the file was renamed (`StatusEntry.origPath`).
 * Rename detection pairs a deletion with an addition, and a pathspec filters
 * before that pairing — so without this a renamed file diffs as wholly new.
 */
const OldPath = z.string().min(1).optional();

export const FileDiffRequest = RepoId.extend({
  path: z.string().min(1),
  oldPath: OldPath,
  worktreePath: z.string().optional(),
  /** Staged diff (`--cached`) vs worktree diff. */
  staged: z.boolean().default(false),
  context: ContextLines.default(DIFF_DEFAULT_CONTEXT),
});

/**
 * A file's diff *within a commit* — `git show <sha> -- <path>`.
 *
 * Deliberately not a widening of FileDiffRequest: that one is scoped to a
 * worktree and its index (`staged` is meaningless here), and collapsing the two
 * would make both fields conditionally-meaningful on the other.
 */
export const CommitFileDiffRequest = RepoId.extend({
  sha: z.string().min(1),
  path: z.string().min(1),
  oldPath: OldPath,
  worktreePath: z.string().optional(),
  context: ContextLines.default(DIFF_DEFAULT_CONTEXT),
});

export const FileDiffResponse = FileDiffSchema;

// --- remotes ---------------------------------------------------------------

export const RemotesListRequest = RepoId;
export const RemotesListResponse = z.array(RemoteSchema);

// --- forge -----------------------------------------------------------------

export const ForgeCliStatusRequest = z.object({});
export const ForgeCliStatusResponse = ForgeCliStatusSchema;

/**
 * A forge listing, capped.
 *
 * `limit` is bounded here rather than left to the caller: these round-trip
 * through a `gh` subprocess, and an unbounded page size turns a sidebar
 * section into a multi-second spawn that also burns the user's API quota.
 */
const ForgeListRequest = RepoId.extend({
  limit: z.number().int().min(1).max(100).default(20),
});

export const ForgeRunsRequest = ForgeListRequest.extend({
  /** Restrict to one branch's runs. Omitted means every branch. */
  branch: z.string().min(1).optional(),
});
export const ForgeRunsResponse = ForgeRunsResultSchema;

/**
 * `state` defaults to `open`, matching Phase 17's original contract: the
 * sidebar's Reviews section and the dashboard's pulls widget both ask "what
 * might I review right now", and reading `all` into those unfiltered would
 * bury that under every merged and closed PR in the repository's history.
 * The Reviews view (Phase 20 B) is the one caller that asks for `all`
 * explicitly — its own status tabs are the filter.
 */
export const ForgePullsRequest = ForgeListRequest.extend({
  state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
  /**
   * Which slice to ask for — `all` keeps Phase 17's contract exactly.
   *
   * Defaulted rather than required so every caller written before the Reviews
   * groups landed still means what it meant: the dashboard widget and the
   * `PrDetail` header both want the repository's pull requests, not the
   * viewer's, and neither should have to say so.
   */
  scope: ForgePullScopeSchema.default('all'),
});
export const ForgePullsResponse = ForgePullsResultSchema;

/**
 * `state` is bounded to what `gh issue list --state` accepts, and defaults to
 * `open`: a repository's closed-issue history is unbounded and nothing in this
 * phase reads it, so asking for it has to be a deliberate act.
 */
export const ForgeIssuesRequest = ForgeListRequest.extend({
  state: z.enum(['open', 'closed', 'all']).default('open'),
});
export const ForgeIssuesResponse = ForgeIssuesResultSchema;

/**
 * A run id, as the string it has always been in this contract.
 *
 * `.regex(/^\d+$/)` rather than a bare string because this value is spliced
 * into a shell command line. `shellQuote` already makes that safe, but a run id
 * has exactly one legal shape and rejecting anything else at the boundary means
 * main never has to trust the quoting alone.
 */
const RunId = z.string().regex(/^\d+$/, 'a run id is digits only');

export const ForgeRunDetailRequest = RepoId.extend({ runId: RunId });
export const ForgeRunDetailResponse = ForgeRunDetailResultSchema;

/**
 * A log request, capped by default.
 *
 * `full` is the escape hatch behind the head-and-tail window, and it is opt-in
 * for a reason: a failed matrix job's log runs to tens of megabytes, and
 * shipping that across IPC unasked would stall the renderer for the sake of a
 * middle section that is almost always matrix noise.
 */
export const ForgeRunLogRequest = RepoId.extend({
  runId: RunId,
  /** Restrict to one job's log. Omitted means the whole run's. */
  jobId: RunId.optional(),
  full: z.boolean().default(false),
});
export const ForgeRunLogResponse = ForgeRunLogResultSchema;

export const ForgeWorkflowsRequest = RepoId;
export const ForgeWorkflowsResponse = ForgeWorkflowsResultSchema;

/**
 * A pull-request number.
 *
 * A positive integer by construction, which is what makes it safe to splice
 * into the `gh` command line main builds — the same reasoning as `RunId`'s
 * digits-only regex, expressed in the type the JSON payload already carries.
 */
const PullNumber = z.number().int().positive();

const ForgePullRequest = RepoId.extend({ number: PullNumber });

export const ForgePullDetailRequest = ForgePullRequest;
export const ForgePullDetailResponse = ForgePullDetailResultSchema;

export const ForgePullFilesRequest = ForgePullRequest;
export const ForgePullFilesResponse = ForgePullFilesResultSchema;

export const ForgePullCommentsRequest = ForgePullRequest;
export const ForgePullCommentsResponse = ForgePullCommentsResultSchema;

export const ForgePullThreadsRequest = ForgePullRequest;
export const ForgePullThreadsResponse = ForgePullThreadsResultSchema;

// --- forge writes (Phase 20 Themes E, F and G) -----------------------------

/**
 * How long any review body is allowed to be.
 *
 * GitHub's own field takes far more, but a body arriving here is spliced into a
 * JSON payload handed to a subprocess, and an unbounded string across IPC is a
 * renderer's-choice allocation in main. 64KB is longer than any review comment
 * anybody has written and short enough to be a bounded write.
 */
export const FORGE_BODY_MAX = 65_536;

/** The ceiling, with no floor — the floors differ per action and are set below. */
const ForgeBody = z.string().max(FORGE_BODY_MAX);

/** An inline comment or a reply: never empty, because an empty one says nothing. */
const ReviewBody = ForgeBody.min(1, 'a comment needs a body');

/**
 * A full 40-char sha, and specifically the PR head the comment is written
 * against.
 *
 * Required by GitHub, and worth stating why the app cannot omit it: a review
 * comment is anchored to a commit, and posting one without `commit_id` attaches
 * it to whatever the API decides is current — which, on a PR that was pushed to
 * between the diff being read and the comment being written, is not the diff the
 * reader was looking at.
 */
const HeadSha = z.string().regex(/^[0-9a-f]{40}$/, 'a commit sha is 40 lowercase hex digits');

/**
 * A new inline thread.
 *
 * `line` is the NEW-file line number, and `side` is `RIGHT` only — v1's scope.
 * `position` is the legacy diff-offset form of the same anchor, sent alongside
 * rather than instead of it: main tries the line-based request first and falls
 * back to `position` only if the API rejects it, so a host that has not yet
 * accepted the modern form still works. The renderer computes it because the
 * renderer is what holds the parsed hunks — see `comment-anchors.ts`.
 */
export const ForgeReviewCommentRequest = ForgePullRequest.extend({
  commitId: HeadSha,
  path: z.string().min(1),
  line: z.number().int().positive(),
  /** `RIGHT` only in v1. A left-side anchor needs a second mapping — see the phase doc. */
  side: z.literal('RIGHT').default('RIGHT'),
  /** Legacy hunk-offset anchor, used only if the line-based form is refused. */
  position: z.number().int().positive().optional(),
  body: ReviewBody,
});
export const ForgeReviewCommentResponse = ForgeWriteResultSchema;

/**
 * A reply into an existing thread.
 *
 * Keyed by the REST comment id rather than the thread's node id, because the
 * reply endpoint is `pulls/{n}/comments/{comment_id}/replies` and GraphQL has
 * no equivalent mutation. Digits-only for the same reason `RunId` is: it is
 * spliced into a command line, and it has exactly one legal shape.
 */
export const ForgeReviewReplyRequest = ForgePullRequest.extend({
  commentId: z.string().regex(/^\d+$/, 'a comment id is digits only'),
  body: ReviewBody,
});
export const ForgeReviewReplyResponse = ForgeWriteResultSchema;

/**
 * Resolve a thread, or reopen it.
 *
 * `resolved` is a target state rather than two channels, because that is what
 * the UI has: one toggle. `threadId` is a GraphQL node id — opaque base64-ish
 * text, so it is bounded by charset rather than by shape.
 */
export const ForgeResolveThreadRequest = RepoId.extend({
  threadId: z.string().min(1).max(256).regex(/^[A-Za-z0-9_=-]+$/, 'a node id is url-safe base64'),
  resolved: z.boolean(),
});
export const ForgeResolveThreadResponse = ForgeWriteResultSchema;

/**
 * A review submission.
 *
 * **`APPROVE` is the only bodiless verb**, and that split is GitHub's rather
 * than ours: its review endpoint documents `body` as required when `event` is
 * `REQUEST_CHANGES` *or* `COMMENT`, and rejects either without one. A bare
 * approval is a normal thing to give; a comment-review with nothing said is not
 * a review at all.
 *
 * Encoding the rule here means the composer's disabled Submit button and the
 * contract agree, instead of the UI enforcing half of a rule and the user
 * discovering the other half from a failed subprocess.
 */
export const ForgePullReviewRequest = ForgePullRequest.extend({
  event: ForgeReviewEventSchema,
  body: ForgeBody.default(''),
}).refine((req) => req.event === 'APPROVE' || req.body.trim().length > 0, {
  message: 'requesting changes or commenting needs a body',
  path: ['body'],
});
export const ForgePullReviewResponse = ForgeWriteResultSchema;

/** A top-level conversation comment. Empty is meaningless, so it is refused. */
export const ForgePullCommentRequest = ForgePullRequest.extend({
  body: ForgeBody.trim().min(1, 'a comment needs a body'),
});
export const ForgePullCommentResponse = ForgeWriteResultSchema;

/**
 * A merge.
 *
 * `method` has no default on purpose. Every other request in this file defaults
 * generously, because a missing `limit` has an obviously right answer; a missing
 * merge method does not, and picking one for the caller would mean the app could
 * squash a history the user meant to preserve because a field went unset. The
 * renderer's dialog leaves its picker unselected until a human chooses, and this
 * is the same rule expressed in the contract.
 */
export const ForgePullMergeRequest = ForgePullRequest.extend({
  method: ForgeMergeMethodSchema,
});
export const ForgePullMergeResponse = ForgeWriteResultSchema;

/**
 * A GitHub login, by its documented shape.
 *
 * Alphanumerics and single interior hyphens, 39 characters at most. Declared
 * because these are the one write payload whose values come from a free-text
 * field a user types — `shellQuote` already makes them inert, and a login that
 * cannot exist should still never reach a subprocess.
 */
const Login = z.string().regex(/^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/, 'not a GitHub login');

/** Ask for reviews. Capped at fifteen, which is GitHub's own per-call ceiling. */
export const ForgePullRequestReviewRequest = ForgePullRequest.extend({
  reviewers: z.array(Login).min(1).max(15),
});
export const ForgePullRequestReviewResponse = ForgeWriteResultSchema;

/** Draft → ready. Nothing to configure, so the PR is the whole payload. */
export const ForgePullReadyRequest = ForgePullRequest;
export const ForgePullReadyResponse = ForgeWriteResultSchema;

/**
 * Re-run a workflow run.
 *
 * `failedOnly` defaults to false — "re-run this run" is the unsurprising reading
 * of the verb, and the narrower one is the opt-in.
 */
export const ForgeRunRerunRequest = RepoId.extend({
  runId: RunId,
  failedOnly: z.boolean().default(false),
});
export const ForgeRunRerunResponse = ForgeWriteResultSchema;

// --- forge projects (Phase 40 Theme A — GitHub ProjectV2) -------------------

/**
 * A ProjectV2 node id, item id or field id — the same opaque, url-safe
 * base64-ish shape GraphQL hands out for all three, and bounded by charset for
 * the same reason `ForgeResolveThreadRequest.threadId` is: none of them are a
 * shape this app can otherwise validate, so the boundary at least confines the
 * character set before any of them reaches a `gh api graphql` argument.
 */
const ProjectNodeId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_=-]+$/, 'a node id is url-safe base64');

/** The ProjectV2 boards visible to the open repo's owner. */
export const ForgeProjectListRequest = RepoId;
export const ForgeProjectListResponse = ForgeProjectsResultSchema;

/** One board's field definitions. */
export const ForgeProjectFieldsRequest = z.object({ projectId: ProjectNodeId });
export const ForgeProjectFieldsResponse = ForgeProjectFieldsResultSchema;

/**
 * One board's items, one page at a time.
 *
 * `cursor` is omitted for the first page and echoed back from
 * `ForgeProjectItemsResult.nextCursor` for every page after — the same
 * opaque-cursor pattern GraphQL pagination always takes, never an offset.
 * Bounded by the same reasoning as `ProjectNodeId`: it is opaque base64-ish
 * text this app cannot otherwise validate, and it reaches a `gh api graphql`
 * argument, so the boundary confines its character set rather than trusting
 * `shellQuote` alone to be the only line of defense.
 */
export const ForgeProjectItemsRequest = z.object({
  projectId: ProjectNodeId,
  cursor: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9+/_=-]+$/, 'a cursor is url-safe base64')
    .optional(),
});
export const ForgeProjectItemsResponse = ForgeProjectItemsResultSchema;

/**
 * `updateProjectV2ItemFieldValue` — the one per-cell write this phase allows.
 *
 * `value` carries `ForgeProjectFieldValue` wholesale rather than a narrower
 * write-only shape: the mutation's own value shape is already exactly what
 * that union's `text`/`number`/`date`/`single_select` arms hold, and a second,
 * near-identical type would only be another place for the two to drift.
 * `iteration` is never sent — Theme E's writable set stops at `single_select`
 * — so main rejects it the same way this phase's UI never offers it.
 */
export const ForgeProjectSetFieldRequest = z.object({
  projectId: ProjectNodeId,
  itemId: ProjectNodeId,
  fieldId: ProjectNodeId,
  value: ForgeProjectFieldValueSchema,
});
export const ForgeProjectSetFieldResponse = ForgeProjectWriteResultSchema;

/** `addProjectV2ItemById` — attach an existing issue or PR to the board. */
export const ForgeProjectAddItemRequest = z.object({
  projectId: ProjectNodeId,
  /** The issue's or PR's own GraphQL node id — never a number, never a draft. */
  contentId: ProjectNodeId,
});
export const ForgeProjectAddItemResponse = ForgeProjectWriteResultSchema;

// --- shell -----------------------------------------------------------------

/**
 * Protocols `shell.openExternal` is allowed to be handed.
 *
 * `openExternal` is a hand-off to the OS's default handler for a scheme, and the
 * OS has handlers for far more than the web. A renderer-supplied `file:///…`
 * opens Finder on an arbitrary path; on Windows an `smb:` URL reaches out to a
 * host of the caller's choosing; and a `javascript:` URL is the classic form.
 * The renderer is our own code today, but the whole point of the boundary is
 * that main does not depend on that staying true — a linkified commit message
 * is attacker-authored text arriving from a clone.
 *
 * `mailto:` is on the list because Theme A linkifies the author emails a commit
 * trailer is full of, and routing those through the same guarded channel beats
 * a second channel with a second (weaker) check.
 */
export const OPEN_EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/**
 * The canonical form of an openable URL, or null if it is not one.
 *
 * Returns the parsed `href` rather than the caller's string so main opens what
 * was *validated*, not what was sent. The two can differ: the WHATWG parser
 * strips leading whitespace and control characters, so `\njavascript:…` and
 * `javascript:…` validate identically — and if main then passed the raw string
 * on, it would be handing the OS a string this function never actually saw.
 */
export function normalizeExternalUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Exact protocol match, never a prefix test: `httpsx:` starts with `https`.
  if (!(OPEN_EXTERNAL_PROTOCOLS as readonly string[]).includes(parsed.protocol)) return null;
  return parsed.href;
}

/** True only for a well-formed URL whose protocol is on the allowlist. */
export const isOpenableExternally = (url: string): boolean => normalizeExternalUrl(url) !== null;

export const OpenExternalRequest = z.object({
  url: z.string().min(1).refine(isOpenableExternally, {
    message: 'Only http, https and mailto URLs can be opened externally.',
  }),
});

/**
 * Whether the hand-off happened. Not a `GitOpResult` — nothing here ran git, and
 * the failure the caller can act on is "we refused this URL", not a git error.
 */
export const OpenExternalResponse = z.object({
  ok: z.boolean(),
  /** Present only on refusal, for the console. Never surfaced as a dialog. */
  message: z.string().optional(),
});

// --- clipboard -------------------------------------------------------------

/**
 * Upper bound on a clipboard write.
 *
 * Generous next to the 40 characters the copy button actually sends, and small
 * next to what an unbounded renderer string could be. The cap exists because
 * `clipboard.writeText` in main is synchronous: a multi-megabyte payload is a
 * frozen window, and nothing this channel legitimately carries is long.
 */
export const CLIPBOARD_MAX_LENGTH = 8192;

export const ClipboardWriteTextRequest = z.object({
  text: z.string().min(1).max(CLIPBOARD_MAX_LENGTH),
});

/**
 * Whether the write happened. Not a `GitOpResult` — no git ran — and reported
 * rather than assumed because the button's copied-state feedback would otherwise
 * be a claim it has no evidence for.
 */
export const ClipboardWriteTextResponse = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
});

// --- mutating operations ---------------------------------------------------

/** Every op targets a specific checkout — worktrees have independent indexes. */
const OpBase = RepoId.extend({ worktreePath: z.string().optional() });

export const CheckoutRequest = OpBase.extend({
  /** Branch name, tag, or sha. */
  target: z.string().min(1),
  /** Check out a sha without creating a branch. */
  detach: z.boolean().default(false),
});
export const BranchCreateRequest = OpBase.extend({
  name: z.string().min(1),
  startPoint: z.string().min(1),
  checkout: z.boolean().default(false),
});
export const BranchDeleteRequest = OpBase.extend({
  name: z.string().min(1),
  /** `-D` — required when the branch isn't merged. Gated by a confirm dialog. */
  force: z.boolean().default(false),
});
export const BranchRenameRequest = OpBase.extend({
  from: z.string().min(1),
  to: z.string().min(1),
});
export const TagCreateRequest = OpBase.extend({
  name: z.string().min(1),
  target: z.string().min(1),
  /** Annotated tag when a message is given, lightweight otherwise. */
  message: z.string().optional(),
});
export const MergeRequest = OpBase.extend({
  /** The branch being merged INTO the current one. */
  source: z.string().min(1),
  noFastForward: z.boolean().default(false),
});
export const RebaseRequest = OpBase.extend({
  /** Rebase the current branch ONTO this. */
  onto: z.string().min(1),
});
export const CherryPickRequest = OpBase.extend({ shas: z.array(z.string().min(1)).min(1) });
export const ResetRequest = OpBase.extend({
  target: z.string().min(1),
  mode: z.enum(['soft', 'mixed', 'hard']),
});

export const StageRequest = OpBase.extend({ paths: z.array(z.string()).min(1) });
export const UnstageRequest = StageRequest;
/** Explicit paths only — never a bare `git checkout .`. */
export const DiscardRequest = StageRequest;

/** Accept one side for an entire conflicted path (Phase 47 Theme B). */
export const ConflictResolveWholeFileRequest = OpBase.extend({
  path: z.string().min(1),
  side: ConflictSideSchema,
});

export const CommitRequest = OpBase.extend({
  message: z.string().min(1),
  amend: z.boolean().default(false),
  /** Stage every tracked modification first (`commit -a`). */
  all: z.boolean().default(false),
});

export const FetchRequest = OpBase.extend({
  remote: z.string().default('origin'),
  prune: z.boolean().default(true),
});
export const PullRequest = OpBase.extend({
  remote: z.string().optional(),
  branch: z.string().optional(),
  rebase: z.boolean().default(false),
});
/**
 * No bare `force` field — Phase 22 Theme F's reversal of the MVP's original
 * "no force-push" rule (docs/INITIAL_PLAN.md → Risks) stops well short of
 * one. `forceWithLease` is the only escape hatch, and it is deliberately not
 * a boolean: git's bare `--force-with-lease` leases against the LOCAL
 * remote-tracking ref, which a background fetch can silently refresh into
 * agreement with the remote — turning the safety net into a no-op. `ref` +
 * `expect` forces the caller to have read that ref's sha at confirm time and
 * pass it through explicitly, so the sha the blast-radius dialog showed is
 * the sha the lease actually checks against.
 */
export const PushRequest = OpBase.extend({
  remote: z.string().optional(),
  branch: z.string().optional(),
  /** `-u` on the first push of a branch with no upstream. */
  setUpstream: z.boolean().default(false),
  /** Push the tag refspec too. */
  tags: z.boolean().default(false),
  /**
   * `--force-with-lease=<ref>:<expect>` — offered only from the ref badge
   * menu, only after a plain push has already been rejected as non-fast-
   * forward, and only behind the `Settings ▸ Git Safety` opt-in.
   */
  forceWithLease: z
    .object({
      /**
       * The ref as named ON THE REMOTE — a local branch ref like
       * `refs/heads/main`, matching what an ordinary push already sends as
       * the refspec destination. **Not** `refs/remotes/origin/main`: that
       * form names the LOCAL remote-tracking copy, which is not what git's
       * `--force-with-lease=<ref>:<expect>` compares `expect` against. See
       * `sync.ts`'s `push()` (the caller) and its integration tests, both of
       * which use `refs/heads/<branch>`.
       */
      ref: z.string().min(1),
      /** The sha that ref was at when the confirm dialog read it. */
      expect: z.string().min(1),
    })
    .optional(),
});

/**
 * `InProgressOpSchema`, not `ConflictOpSchema` — abort/continue operate on a
 * sequencer state (`MERGE_HEAD`, `rebase-merge`, …), and a stash conflict, the
 * one `ConflictOp` a sequencer never produces, has none of those to resume.
 */
export const AbortRequest = OpBase.extend({ op: InProgressOpSchema });
export const ContinueRequest = AbortRequest;

export const BlastRadiusRequest = OpBase.extend({
  /** The tip whose history is at risk: `HEAD` for a reset, the branch for a delete. */
  from: z.string().min(1),
  /** Where the ref ends up. Omitted for a delete, where it ends up nowhere. */
  to: z.string().min(1).optional(),
  /**
   * The ref being moved or deleted, fully qualified. Excluded from the
   * "still reachable elsewhere" set — before the operation it is exactly what
   * keeps these commits alive, so counting it would always yield zero.
   */
  movingRef: z.string().min(1).optional(),
});
export const BlastRadiusResponse = z.object({
  count: z.number().int().nonnegative(),
  /** A few subjects to show in the confirm dialog. */
  sample: z.array(z.object({ sha: z.string(), subject: z.string() })),
});

export const OpResponse = GitOpResultSchema;

// --- stash -------------------------------------------------------------------

export const StashListRequest = OpBase;
export const StashListResponse = z.array(StashEntrySchema);

/**
 * A selector for one entry, everywhere but `push` — `stash@{n}`, exactly as
 * `listStashes` returns it and as every stash op accepts it back.
 */
const StashSelector = z.string().min(1);

export const StashPushRequest = OpBase.extend({
  message: z.string().optional(),
  keepIndex: z.boolean().default(false),
  includeUntracked: z.boolean().default(false),
  /** Scope the stash to these paths. Omitted means the whole working tree. */
  paths: z.array(z.string()).optional(),
});

export const StashPopRequest = OpBase.extend({ selector: StashSelector });
export const StashApplyRequest = OpBase.extend({ selector: StashSelector });
export const StashDropRequest = OpBase.extend({ selector: StashSelector });
/**
 * Widened over the plain `GitOpResult` every other op returns — see
 * `CHANNELS.opStashDrop`.
 */
export const StashDropResponse = StashDropResultSchema;

export const StashBranchRequest = OpBase.extend({
  name: z.string().min(1),
  selector: StashSelector,
});

/**
 * `git stash store` — restore a dropped stash from its captured sha. Not a
 * selector: a dropped stash entry no longer has one, which is the whole
 * reason this takes a raw sha instead.
 */
export const StashStoreRequest = OpBase.extend({
  sha: z.string().min(1),
  message: z.string().optional(),
});

/** A stash entry's three-part file list (Phase 22 Theme D). */
export const StashDetailRequest = OpBase.extend({ selector: StashSelector });
export const StashDetailResponse = StashDetailSchema.nullable();

/** One file's hunks within one part of a stash entry (Phase 22 Theme D). */
export const StashDiffRequest = OpBase.extend({
  selector: StashSelector,
  part: StashPartSchema,
  path: z.string().min(1),
  oldPath: OldPath,
  context: ContextLines.default(DIFF_DEFAULT_CONTEXT),
});
export const StashDiffResponse = FileDiffSchema.nullable();

// --- reflog ------------------------------------------------------------------

export const ReflogListRequest = OpBase.extend({
  /** Absent means `HEAD`. */
  ref: z.string().optional(),
  limit: z.number().int().positive().max(500).default(200),
});
export const ReflogListResponse = z.array(ReflogEntrySchema);

// --- pty -------------------------------------------------------------------

export const PtyCreateRequest = z.object({
  /**
   * The session this pty belongs to.
   *
   * Supplied by the renderer rather than minted here, because the session record
   * exists before the process does — a restored session is a row with no pty
   * until the user revives it, and reviving must append to that row's own
   * scrollback log rather than start a new one.
   */
  sessionId: z.string().min(1),
  kind: TerminalSessionKindSchema,
  /** Paired with `kind`, exactly as on the session record it belongs to. */
  agentId: z.string().min(1).optional(),
  repoId: z.string().min(1),
  /** Working directory — the selected worktree. */
  cwd: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  /**
   * Typed into the shell once it is up, for agent sessions (`'claude\r'`).
   *
   * Deliberately *not* `pty.spawn(command)`: a login shell resolves nvm- and
   * asdf-managed binaries the way the user's real terminal does, and leaves them
   * at a prompt when the agent exits instead of at a dead pane.
   */
  initialInput: z.string().optional(),
}).superRefine(agentIdMatchesKind);
export const PtyCreateResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), ptyId: z.string() }),
  /** node-pty is loaded lazily and fails soft — the UI shows "terminal unavailable". */
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export const PtyInputRequest = z.object({ ptyId: z.string(), data: z.string() });
export const PtyResizeRequest = z.object({
  ptyId: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export const PtyKillRequest = z.object({ ptyId: z.string() });
/**
 * The full ring-buffer contents for a live pty, trimmed the same way a
 * restart's scrollback file is. An unknown `ptyId` answers empty rather than
 * throwing — the pty may have exited between the renderer asking and this
 * resolving.
 */
export const PtySnapshotRequest = z.object({ ptyId: z.string().min(1) });
export const PtySnapshotResponse = z.object({ bytes: z.instanceof(Uint8Array) });
export const PtyExitEvent = z.object({
  ptyId: z.string(),
  exitCode: z.number().int(),
  signal: z.number().int().optional(),
});

/**
 * Which roster agent is running inside a pty right now, or none.
 *
 * `null` is a real answer, not an absence: it means main looked at the pty's
 * process tree and found nothing it recognised — an agent that has quit, or a
 * plain shell sitting at a prompt. That distinction is the whole reason the
 * renderer keys this into a `Record<string, string | null>` where an absent key
 * means *never probed*: a session that has not been looked at yet must keep
 * showing the mark of the agent it was opened for, and only an explicit `null`
 * may take that mark away.
 *
 * The event is emitted on a change only, so nothing arrives for a terminal
 * whose contents are steady.
 */
export const PtyAgentChangedEvent = z.object({
  ptyId: z.string().min(1),
  agentId: z.string().min(1).nullable(),
});

/**
 * The shell's foreground process changed, from the `ps stat` `+` flag.
 *
 * `command: null` means the shell is back at a bare prompt — held by the
 * renderer's auto-namer, which never overwrites a name with a null.
 */
export const PtyCommandChangedEvent = z.object({
  ptyId: z.string().min(1),
  command: z.string().min(1).nullable(),
});

/**
 * A live pty's guessed activity changed, from main's process-tree-adjacent
 * output detector.
 *
 * `null` is the explicit "detector has nothing to say" — no marker set for
 * the running agent, or one that tripped its time budget and was disabled —
 * which the renderer draws as the quiet "unknown" mark rather than a stale
 * guess. Emitted on a change only, same contract as `PtyAgentChangedEvent`.
 */
export const PtyActivityEvent = z.object({
  ptyId: z.string().min(1),
  activity: SessionActivitySchema.nullable(),
});

// --- terminal sessions -----------------------------------------------------

/**
 * A restored session: the saved record plus the bytes to replay into its xterm.
 *
 * The scrollback crosses as a `Uint8Array` via structured clone — the same
 * no-base64 rule `ptyData` follows, and for the same reason: these are raw pty
 * bytes with their escape sequences intact, and xterm is the one thing that
 * should be decoding them.
 */
export const RestoredTerminalSession = z.object({
  session: TerminalSessionSchema,
  scrollback: z.instanceof(Uint8Array),
  /**
   * The still-running process behind this row, if any.
   *
   * `null` is a restored row with no live shell — today's only case. A
   * non-null value means the pty survived whatever happened to the renderer
   * (a reload, a crash) and `hydrate()` should bind to it rather than mark
   * the row exited.
   */
  live: z
    .object({
      ptyId: z.string().min(1),
      pid: z.number().int().positive(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
      /**
       * The detector's current guess for this pty, so `hydrate()` can seed the
       * session list. `pty:activity` events fire on a CHANGE only — a renderer
       * that reloads mid-turn would otherwise show "unknown" until the agent's
       * next rung change, which for a long turn is minutes of a wrong glyph.
       * `null` means the detector has nothing to say (no marker set, or none
       * tracked yet).
       */
      activity: SessionActivitySchema.nullable().optional(),
    })
    .nullable(),
  /**
   * Set when this session belongs to an older broker protocol version.
   * Derived at runtime by main when listing terminals from legacy brokers.
   */
  legacy: z.boolean().optional(),
});
export const TerminalListResponse = z.object({
  sessions: z.array(RestoredTerminalSession),
  broker: z
    .object({
      mode: z.enum(['broker', 'inproc']),
      reason: z.string().optional(),
    })
    .optional(),
});

export const TerminalSaveRequest = z.object({ session: TerminalSessionSchema });
export const TerminalForgetRequest = z.object({ sessionId: z.string().min(1) });
/** The full ordered id list, not a moved-from/moved-to pair — idempotent on replay. */
export const TerminalReorderRequest = z.object({ sessionIds: z.array(z.string().min(1)) });

/**
 * The roster, plus what main could learn about it on this machine.
 *
 * One response rather than two channels: `installed` is a fact *about* these
 * objects, and a second round-trip would let the menu render a roster it has
 * no status for. `status` is keyed by id rather than positional, and may be
 * shorter than `agents` — an agent the probe could not answer for is simply
 * absent, which the renderer reads as "assume it works".
 */
export const AgentListResponse = z.object({
  agents: z.array(AgentDefinitionSchema),
  status: z.array(AgentStatusSchema).default([]),
});

// --- councils (Phase 34) -----------------------------------------------------

export const CouncilListResponse = z.object({ councils: z.array(CouncilSchema) });
export const CouncilGetRequest = z.object({ id: z.string().min(1) });
export const CouncilGetResponse = z.object({ council: CouncilSchema.nullable() });

export const CouncilCreateRequest = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export const CouncilCreateResponse = GitOpResultOf(CouncilSchema);

export const CouncilUpdateMembersRequest = z.object({
  id: z.string().min(1),
  members: z.array(CouncilMemberSchema),
  synthProvider: CouncilMemberProviderSchema,
});
export const CouncilUpdateMembersResponse = GitOpResultOf(CouncilSchema);

export const CouncilRemoveRequest = z.object({ id: z.string().min(1) });
export const CouncilRemoveResponse = GitOpResultSchema;

export const CouncilRunStartRequest = z.object({
  councilId: z.string().min(1),
  prompt: z.string().min(1),
});
export const CouncilRunStartResponse = GitOpResultOf(CouncilRunSchema);

export const CouncilRunGetRequest = z.object({ runId: z.string().min(1) });
export const CouncilRunGetResponse = z.object({ run: CouncilRunSchema.nullable() });

export const CouncilRunListRequest = z.object({ councilId: z.string().min(1) });
export const CouncilRunListResponse = z.object({ runs: z.array(CouncilRunSchema) });

export const CouncilRunSkipMemberRequest = z.object({
  runId: z.string().min(1),
  memberId: z.string().min(1),
});
export const CouncilRunSkipMemberResponse = GitOpResultSchema;

export const CouncilRunRetryMemberRequest = z.object({
  runId: z.string().min(1),
  memberId: z.string().min(1),
});
export const CouncilRunRetryMemberResponse = GitOpResultSchema;

// --- FAB loop runs (Phase 35) ------------------------------------------------

export const LoopRunsListResponse = z.object({ runs: z.array(LoopRunRecordSchema) });

/**
 * The renderer announces a run it has just started. Main mints the record —
 * `id`, `startedAt`, `status: 'running'` — so a clock skewed renderer cannot
 * write history, and remembers `sessionId → run` so the pty's own exit
 * finalises the record even if the renderer is gone by then.
 */
export const LoopRunStartRequest = z.object({
  loopId: z.string().min(1),
  sessionId: z.string().min(1),
  composedPrompt: z.string().min(1),
  checkedModifierIds: z.array(z.string().min(1)),
  /**
   * Which Claude the run was launched on. Optional because it is not derivable
   * from `composedPrompt` — the model is a `--model` flag, not a sentence — and
   * a renderer that predates the picker sends none.
   */
  model: LoopModelSchema.optional(),
});
export const LoopRunStartResponse = GitOpResultOf(LoopRunRecordSchema);

/**
 * Keyed by sessionId, not runId: the FAB tab knows its session across
 * remounts (it is persisted ui state) but would have to re-learn a runId.
 * Stopping a session with no running record is `ok` — the run may have
 * exited naturally a beat earlier, and that is not an error worth surfacing.
 */
export const LoopRunStopRequest = z.object({ sessionId: z.string().min(1) });
export const LoopRunStopResponse = GitOpResultSchema;

export const ClaudeInfoResponse = ClaudeInfoSchema;
/**
 * Update runs to completion in main; chunks stream on the event channel while
 * it does. Failures resolve — the settings page renders them like any other.
 */
export const ClaudeUpdateResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), exitCode: z.number().int() }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export const ClaudeUpdateDataEvent = z.object({ chunk: z.string() });

// --- read-only filesystem (Phase 16) ----------------------------------------
// Scoped, relative paths only: the renderer never names an absolute path, and
// main confines every join to the scope's root (repo checkout or ~/.claude).

/** Exported: Theme C's dir-stats and reveal-in-Finder reads are repo-scoped
 *  reads with no `claude-home` arm, so they reuse this shape directly rather
 *  than `FsListDirRequest`'s wider discriminated union. */
export const FsRepoScope = z.object({
  scope: z.literal('repo'),
  repoId: z.string().min(1),
  /** A linked worktree's checkout; omitted means the main worktree. */
  worktreePath: z.string().optional(),
  /** POSIX-relative from the scope root; empty string is the root itself. */
  relPath: z.string(),
});
const FsClaudeScope = z.object({
  scope: z.literal('claude-home'),
  relPath: z.string(),
});

export const FsListDirRequest = z.discriminatedUnion('scope', [FsRepoScope, FsClaudeScope]);
export const FsListDirResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), entries: z.array(FsEntrySchema) }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

export const FsReadFileRequest = z.discriminatedUnion('scope', [FsRepoScope, FsClaudeScope]);
/**
 * `binary` and `too-large` are outcomes, not errors: the preview renders each
 * as a fallback card. Only a jail rejection or a read failure is `error`.
 */
export const FsReadFileResponse = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    content: z.string(),
    size: z.number().int().nonnegative(),
    /** So a later save can prove the file has not moved underneath it. */
    version: FsVersionSchema,
  }),
  z.object({ kind: z.literal('binary'), size: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('too-large'), size: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('error'), message: z.string() }),
]);

/** Likewise the whole order, so a dropped message cannot leave a half-applied swap. */
export const RepoReorderRequest = z.object({ repoIds: z.array(z.string().min(1)) });

// --- writable filesystem (Phase 24) -----------------------------------------
// Repo scope only, built on `FsWriteScopeSchema` rather than `FsRepoScope`'s
// `scope` union — `claude-home` cannot be expressed here, so a write into
// `~/.claude` fails zod parsing before any handler runs. Every response is a
// plain `GitOpResult` through `handleOp`, per the repo's "never throws, a bad
// outcome is data" rule; a stale write arrives as `{ok:false, kind:'error',
// code:'stale-write'}` rather than a fs-shaped failure arm of its own.

const FsWriteScopeBase = z.object({
  scope: FsWriteScopeSchema,
  repoId: z.string().min(1),
  /** A linked worktree's checkout; omitted means the main worktree. */
  worktreePath: z.string().optional(),
});

/**
 * A relative path naming a write's own target. Non-empty and NUL-free at the
 * schema level — real path safety (traversal, symlinks, `.git/`) is entirely
 * `fs-scope-write.ts`'s job, so there is exactly one place that logic lives;
 * this is shape validation only, and "empty string is the root" (as reads
 * allow) makes no sense for a write, since nothing here can write the root.
 */
const FsWriteRelPath = z
  .string()
  .min(1)
  .refine((s) => !s.includes('\0'), 'relPath must not contain NUL');

const FsWriteRepoScope = FsWriteScopeBase.extend({ relPath: FsWriteRelPath });

export const FsWriteFileRequest = FsWriteRepoScope.extend({
  content: z.string(),
  /** The `FsVersion` the caller last read. Main refuses when `fstat` disagrees. */
  expectedVersion: FsVersionSchema,
});

export const FsCreateRequest = FsWriteRepoScope.extend({
  kind: z.enum(['file', 'directory']),
});

/** Cross-directory moves are in scope; the UI only offers same-directory rename today. */
export const FsRenameRequest = FsWriteScopeBase.extend({
  fromRelPath: FsWriteRelPath,
  toRelPath: FsWriteRelPath,
});

export const FsDeleteRequest = FsWriteRepoScope;

/**
 * A directory's file count and total bytes, for the delete confirm's blast
 * radius. `FsRepoScope`, not `FsWriteRepoScope` — this never touches disk. The
 * uncommitted half of the blast radius is joined client-side against the
 * status cache the tree already holds; main only counts what the filesystem
 * itself knows.
 */
export const FsDirStatsRequest = FsRepoScope;
export const FsDirStatsResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    fileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    /** The walk stopped at `FS_DIR_STATS_WALK_CAP` — the counts are a floor, not exact. */
    truncated: z.boolean(),
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

/** Reveal a repo-scoped path in the OS file manager. See `CHANNELS.shellShowItemInFolder`. */
export const ShowItemInFolderRequest = FsRepoScope;

/**
 * Find in files (Phase 24 Theme E): `git grep` over the checkout, repo scope
 * only — there is no `claude-home` arm, unlike `FsRepoScope`, because a
 * search has no `relPath` to be widened by. `caseSensitive`/`wholeWord`
 * default the way most code search does: case-insensitive, whole-word off.
 */
export const FsSearchRequest = z.object({
  repoId: z.string().min(1),
  worktreePath: z.string().optional(),
  query: z.string().min(1),
  mode: FsSearchModeSchema.default('fixed'),
  caseSensitive: z.boolean().default(false),
  wholeWord: z.boolean().default(false),
});
export const FsSearchResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    matches: z.array(GrepMatchSchema),
    /** Hit `FS_SEARCH_MAX_MATCHES` after parsing — the list is a floor, not exact. */
    truncated: z.boolean(),
  }),
  /** Most commonly a malformed regex in `mode: 'regex'` — surfaced verbatim from git. */
  z.object({ ok: z.literal(false), message: z.string() }),
]);
/** Mirrors `OpenExternalResponse` — a hand-off outcome, not a `GitOpResult`. */
export const ShowItemInFolderResponse = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
});

export const FsListFilesRequest = z.object({
  repoId: z.string().min(1),
  worktreePath: z.string().optional(),
});

export const FsListFilesResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    files: z.array(z.string()),
    truncated: z.boolean(),
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

// --- system metrics (Phase 18) ---------------------------------------------

export const MetricsStartRequest = z.object({
  intervalMs: z
    .number()
    .int()
    .min(METRICS_MIN_INTERVAL_MS)
    .max(METRICS_MAX_INTERVAL_MS),
  /**
   * Read disk capacity on this tick regardless of the usual coarse schedule.
   * The flyout's gauge is the one surface that shows a figure precise enough
   * for staleness to be visible, so opening it forces a fresh `statfs`.
   */
  freshDisk: z.boolean().optional(),
});

export const MetricsSampleEvent = MetricSampleSchema;

// --- repo diagnostics (Phase 18) -------------------------------------------
// A `repoId` and nothing else on every request. The command is never sent from
// the renderer *except* on `trust`, where it is the thing being approved — and
// even there main re-derives the candidate list and refuses a command it did
// not itself propose. See diag-handlers.ts.

export const DiagTrustStatusRequest = RepoId;
export const DiagTrustStatusResponse = DiagnosticsTrustStatusSchema;

/**
 * Approve one command for one repository.
 *
 * The command travels on this call because the user is approving *that exact
 * command* — a grant recorded against anything looser would bless a value the
 * prompt never showed. Main still validates it against its own detector output
 * before storing, so this is a confirmation, not an instruction.
 */
export const DiagTrustRequest = RepoId.extend({ command: DiagnosticsCommandSchema });
export const DiagTrustResponse = DiagnosticsTrustStatusSchema;

export const DiagUntrustRequest = RepoId;
export const DiagUntrustResponse = DiagnosticsTrustStatusSchema;

/** Detection reads the filesystem and runs nothing. Safe before any grant. */
export const DiagDetectRequest = RepoId;
export const DiagDetectResponse = z.object({
  candidates: z.array(DiagnosticsCandidateSchema),
});

export const DiagRunRequest = RepoId;
export const DiagRunResponse = DiagnosticsRunSchema;

// --- onboarding kit scaffold (Phase 49) ------------------------------------

/** Reads the template tree and the target repo. Writes nothing. */
export const ScaffoldPlanRequest = RepoId;
export const ScaffoldPlanResponse = GitOpResultOf(ScaffoldPlanSchema);

export const ScaffoldApplyRequest = RepoId.extend({
  paths: z.array(z.string().min(1)),
});
export const ScaffoldApplyResponse = GitOpResultOf(ScaffoldApplyResultSchema);

// --- repository statistics (Phase 19) --------------------------------------

/**
 * `repoId` only, never a path — the `forge-handlers.ts` rule. Main resolves the
 * checkout itself, so the renderer cannot point the traversal somewhere else.
 */
export const StatsSummaryRequest = RepoId.extend({
  window: StatsWindowSchema.default('90d'),
  /**
   * `--numstat` is the expensive half of the traversal: it makes git diff every
   * commit rather than just read commit objects. A board with no churn widget
   * on it should not pay for one, so the caller opts in.
   */
  withChurn: z.boolean().default(false),
});
export const StatsSummaryResponse = RepoStatsSchema;

// --- repository tests (Phase 19) --------------------------------------------
// A `repoId` on every request; `run`/`trust` also carry a `suiteId`, never a
// command. Main re-discovers and re-derives the argument vector itself — the
// same rule diagnostics enforces for `diagRun` — so the renderer can never
// name what gets executed.

/** Runs nothing — reads package.json/moon.yml and config-file presence only. */
export const TestsDiscoverRequest = RepoId;
export const TestsDiscoverResponse = TestDiscoverySchema;

export const TestsTrustStatusRequest = RepoId.extend({ suiteId: z.string().min(1) });
export const TestsTrustStatusResponse = TestTrustStatusSchema;

/**
 * `fingerprint` is the suite's command fingerprint as the trust prompt showed
 * it. Main re-discovers, finds the suite by id, and only records the grant if
 * the live fingerprint still matches — the `isProposedCommand` check, reused
 * for a suite instead of a proposed linter.
 */
export const TestsTrustRequest = RepoId.extend({
  suiteId: z.string().min(1),
  fingerprint: z.string().min(1),
});
export const TestsTrustResponse = TestTrustStatusSchema;

export const TestsUntrustRequest = RepoId.extend({ suiteId: z.string().min(1) });
export const TestsUntrustResponse = TestTrustStatusSchema;

export const TestsRunRequest = RepoId.extend({ suiteId: z.string().min(1) });
export const TestsRunResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), runId: z.string().min(1) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const TestsCancelRequest = z.object({ runId: z.string().min(1) });

export const TestsOutputEvent = z.object({ runId: z.string().min(1), chunk: z.string() });
export const TestsResultEvent = z.object({
  runId: z.string().min(1),
  suiteId: z.string().min(1),
  result: TestRunResultSchema,
});

// --- window chrome ---------------------------------------------------------

export const WindowStateSchema = z.object({
  maximized: z.boolean(),
  fullScreen: z.boolean(),
  focused: z.boolean(),
});

// --- browser (Phase 32) -----------------------------------------------------

export const BrowserCreateRequest = z.object({
  tabId: z.string().min(1),
  url: z.string().min(1),
});
export const BrowserCreateResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export const BrowserCloseRequest = z.object({ tabId: z.string().min(1) });
export const BrowserNavigateRequest = z.object({
  tabId: z.string().min(1),
  url: z.string().min(1),
});
export const BrowserBackRequest = z.object({ tabId: z.string().min(1) });
export const BrowserForwardRequest = z.object({ tabId: z.string().min(1) });
export const BrowserReloadRequest = z.object({ tabId: z.string().min(1) });
export const BrowserStopRequest = z.object({ tabId: z.string().min(1) });
export const BrowserSetBoundsRequest = z.object({
  tabId: z.string().min(1),
  bounds: BrowserBoundsSchema,
});
export const BrowserSetVisibleRequest = z.object({
  tabId: z.string().min(1),
  visible: z.boolean(),
});
export const BrowserActivateRequest = z.object({ tabId: z.string().min(1) });
export const BrowserDevtoolsRequest = z.object({
  tabId: z.string().min(1),
  mode: z.enum(['detach', 'embed']).default('detach'),
});
export const BrowserFindRequest = z.object({
  tabId: z.string().min(1),
  text: z.string().min(1),
  forward: z.boolean().default(true),
});
export const BrowserFindStopRequest = z.object({ tabId: z.string().min(1) });
/** No payload: clears the whole `persist:browser` partition's storage and cache. */
export const BrowserClearDataResponse = GitOpResultSchema;

export const BrowserEventPayload = BrowserEventSchema;

export type BrowserEventPayloadType = z.infer<typeof BrowserEventPayload>;
export type BrowserNavErrorType = z.infer<typeof BrowserNavErrorSchema>;

// --- watch -----------------------------------------------------------------

export const RebaseStartRequest = RepoId.extend({
  targetRef: z.string().min(1),
  plan: RebaseSequencePlanSchema,
});
export const RebaseStartResponse = GitOpResultSchema;

export const RebaseContinueRequest = RepoId;
export const RebaseContinueResponse = GitOpResultSchema;

export const RebaseAbortRequest = RepoId;
export const RebaseAbortResponse = GitOpResultSchema;

export const RebaseSkipRequest = RepoId;
export const RebaseSkipResponse = GitOpResultSchema;

export const RebaseStatusStateSchema = z.object({
  inProgress: z.boolean(),
  currentStep: z.number().int().optional(),
  totalSteps: z.number().int().optional(),
  headSha: z.string().optional(),
  ontoSha: z.string().optional(),
  pausedReason: z.enum(['conflict', 'edit', 'break']).optional(),
  backupRef: z.string().optional(),
});
export const RebaseStatusRequest = RepoId;
export const RebaseStatusResponse = RebaseStatusStateSchema;
export type RebaseStatusState = z.infer<typeof RebaseStatusStateSchema>;

export const WatchEventPayload = WatchEventSchema;

export type LogBatchEventPayload = z.infer<typeof LogBatchEvent>;
export type LogDoneEventPayload = z.infer<typeof LogDoneEvent>;
export type WindowState = z.infer<typeof WindowStateSchema>;
export type CommitDetail = z.infer<typeof CommitDetailResponse>;
export type BlastRadius = z.infer<typeof BlastRadiusResponse>;

// --- cli (Phase 33) --------------------------------------------------------
export const CliStatusResponse = z.object({
  installed: z.boolean(),
  path: z.string().nullable(),
  target: z.string().nullable(),
  managed: z.boolean(),
});
export type CliStatusResponse = z.infer<typeof CliStatusResponse>;
export const CliInstallRequest = z.object({ target: z.enum(['auto', 'user']).default('auto') });
export const CliUninstallRequest = z.object({}).optional();
export const CliInstallResponse = GitOpResultOf(CliStatusResponse);
export const CliUninstallResponse = GitOpResultOf(CliStatusResponse);

// --- updates (Phase 33) ----------------------------------------------------
export const UpdateChannelSchema = z.enum(['stable', 'beta']);
export const UpdateSetChannelRequest = z.object({ channel: UpdateChannelSchema });
export const UpdateStateSchema = z.object({
  phase: z.enum(['idle', 'checking', 'available', 'downloading', 'downloaded', 'error']),
  version: z.string().nullable(),
  percent: z.number().nullable(),
  error: z.string().nullable(),
  manualInstall: z.boolean().optional(),
});
export type UpdateState = z.infer<typeof UpdateStateSchema>;

// --- system health (Phase 33) ----------------------------------------------
export const SystemHealthResponse = z.object({
  git: z.object({ path: z.string().nullable(), version: z.string().nullable() }),
  shell: z.string().nullable(),
  sshAgent: z.object({ running: z.boolean(), keys: z.number() }),
  cli: CliStatusResponse,
});
export type SystemHealth = z.infer<typeof SystemHealthResponse>;

// --- deep link (Phase 33) --------------------------------------------------
export const DeepLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open'), repo: z.string() }),
  z.object({ kind: z.literal('clone'), url: z.string() }),
]);
export type DeepLink = z.infer<typeof DeepLinkSchema>;
export const DeepLinkEventSchema = z.object({
  link: DeepLinkSchema,
  known: z.boolean(),
});


// --- workflows (Phase 43) --------------------------------------------------

/**
 * Global, so no `repoId` on any of these — the deliberate difference from every
 * git-touching channel in this file, and the same shape councils use.
 */
export const WorkflowListResponse = z.object({ workflows: z.array(WorkflowSchema) });

/**
 * One upsert channel rather than create/update: the canvas edits a whole
 * workflow object and hands it back, and a create is just a save of an id the
 * store has not seen. The renderer mints the id (it needs one to render the
 * node the user just dropped, before any round-trip); `createdAt` is honoured
 * on first sight and preserved after.
 */
export const WorkflowSaveRequest = z.object({ workflow: WorkflowSchema });
export const WorkflowSaveResponse = GitOpResultOf(WorkflowSchema);

export const WorkflowDeleteRequest = z.object({ id: z.string().min(1) });
export const WorkflowDeleteResponse = GitOpResultSchema;

/**
 * Resolves with the freshly-minted run — main owns the id, per
 * `tests-handlers.ts` — not with the finished result. A run can take minutes;
 * progress arrives on `workflowRunChanged`.
 */
export const WorkflowRunRequest = z.object({ workflowId: z.string().min(1) });
export const WorkflowRunResponse = GitOpResultOf(WorkflowRunSchema);

export const WorkflowCancelRequest = z.object({ runId: z.string().min(1) });
export const WorkflowCancelResponse = GitOpResultSchema;

export const WorkflowRunsListRequest = z.object({ workflowId: z.string().min(1) });
export const WorkflowRunsListResponse = z.object({ runs: z.array(WorkflowRunSchema) });

export const WorkflowRunsGetRequest = z.object({ runId: z.string().min(1) });
export const WorkflowRunsGetResponse = z.object({ run: WorkflowRunSchema.nullable() });

// --- workflow demo API (Phase 43 Theme D) -----------------------------------

/**
 * The port is always reported, never chosen: the server binds `listen(0)` so a
 * fixed port cannot collide with whatever else the developer is running, and
 * the renderer reads it back from here rather than hard-coding one.
 */
export const DemoApiStatusSchema = z.discriminatedUnion('running', [
  z.object({ running: z.literal(false) }),
  z.object({ running: z.literal(true), port: z.number().int().positive() }),
]);
export type DemoApiStatus = z.infer<typeof DemoApiStatusSchema>;

export const DemoApiStartResponse = GitOpResultOf(DemoApiStatusSchema);
export const DemoApiStopResponse = GitOpResultSchema;
export const DemoApiStatusResponse = DemoApiStatusSchema;
