import { z } from 'zod';

/**
 * What a forge's CI and review surfaces have to say about a repository.
 *
 * Read through the user's own `gh` CLI rather than an HTTP client with a token
 * of ours: `gh` already holds a credential, refreshes it, respects enterprise
 * hosts and honours `GH_*` env overrides. The app owning a second copy of that
 * story would mean a settings page for a PAT, a keychain decision, and a token
 * that silently expires — for data that is decoration on a git client.
 *
 * Every field that the forge can legitimately withhold is nullable, and each
 * `null` has a distinct meaning spelled out below. A run that has not finished
 * has no conclusion; a pull request nobody has reviewed has no decision. Those
 * are answers, not gaps, and collapsing either into a falsy default is how a
 * queued run ends up rendering as a failure.
 */

/**
 * Where a run, job or step is in its lifecycle.
 *
 * `completed` is the only state with a conclusion. The other five are all
 * "not finished", and they are all here because GitHub sends all of them:
 * `waiting` is a job held by an environment protection rule, `requested` and
 * `pending` are its neighbours in the queue. Leaving them out does not make
 * them not happen — it makes a run held for a deployment approval fail to
 * parse, and a job blocked on a human is exactly the one worth seeing.
 */
export const ForgeRunStatusSchema = z.enum([
  'queued',
  'in_progress',
  'completed',
  'waiting',
  'requested',
  'pending',
]);
export type ForgeRunStatus = z.infer<typeof ForgeRunStatusSchema>;

/**
 * How a completed run ended.
 *
 * The full GitHub set, including the three that are neither success nor
 * failure: `skipped` and `neutral` are non-events, and `action_required` is a
 * run waiting on a human. Folding those into "failure" would put a red dot on
 * a branch whose tests all passed.
 */
export const ForgeRunConclusionSchema = z.enum([
  'success',
  'failure',
  'cancelled',
  'skipped',
  'neutral',
  'timed_out',
  'action_required',
  'stale',
  'startup_failure',
]);
export type ForgeRunConclusion = z.infer<typeof ForgeRunConclusionSchema>;

/** One workflow run. */
export const ForgeRunSchema = z.object({
  /** The forge's own id, as a string — GitHub's run ids exceed 2^53 on busy orgs. */
  id: z.string(),
  /** The workflow's display name, e.g. "CI". */
  name: z.string(),
  status: ForgeRunStatusSchema,
  /** null while `status !== 'completed'` — an unfinished run has no verdict. */
  conclusion: ForgeRunConclusionSchema.nullable().default(null),
  /** The branch the run was triggered on; null for a detached or tag trigger. */
  headBranch: z.string().nullable().default(null),
  /** Full 40-char sha, so a run can be matched to a branch tip exactly. */
  headSha: z.string().nullable().default(null),
  /** ISO 8601. Ordering only — never parsed for display arithmetic. */
  createdAt: z.string(),
  /** The run's page on the forge. Always https; opened through `shell.openExternal`. */
  url: z.string(),

  /*
    Everything below arrived with Phase 19 Theme C, and every one of them is
    nullable with a default so that Phase 17's fixtures, its parser tests and
    any cached payload still parse unchanged. A field the forge did not send is
    a field the row does not draw — never a reason to drop the run.
  */

  /** What triggered it: `push`, `pull_request`, `schedule`, `workflow_dispatch`… */
  event: z.string().nullable().default(null),
  /**
   * The workflow's own id, and the only stable thing to group runs by.
   *
   * `workflowName` is a display string that changes the moment someone edits
   * `name:` in the yaml, which would silently split one workflow's history into
   * two groups. `gh run list --json` does not expose the file path at all — see
   * `ForgeWorkflow` for the lazy lookup that resolves one when a link needs it.
   */
  workflowId: z.string().nullable().default(null),
  /** The workflow's display name. Grouping label, never the grouping key. */
  workflowName: z.string().nullable().default(null),
  /** ISO 8601, or null for a run still queued. */
  startedAt: z.string().nullable().default(null),
  /** ISO 8601 of the last state change — the end of a completed run. */
  updatedAt: z.string().nullable().default(null),
  /** The commit subject or PR title the run is showing against itself. */
  displayTitle: z.string().nullable().default(null),
  /** The run's number within its workflow, and the attempt within the run. */
  number: z.number().int().nullable().default(null),
  attempt: z.number().int().nullable().default(null),
});
export type ForgeRun = z.infer<typeof ForgeRunSchema>;

/**
 * One workflow definition, fetched lazily and only to resolve a file path.
 *
 * Grouping never needs this — `ForgeRun.workflowId` is enough, and comes free
 * with the run list. What needs it is a link: "open the workflow file on
 * GitHub" has to name `.github/workflows/ci.yml`, and no run-list field carries
 * it. So the path costs a second subprocess, paid only when something asks for
 * a link, rather than on every sidebar expand.
 */
export const ForgeWorkflowSchema = z.object({
  /** Matches `ForgeRun.workflowId`. A string for the same 2^53 reason. */
  id: z.string(),
  name: z.string(),
  /** Repo-relative, e.g. `.github/workflows/ci.yml`. */
  path: z.string(),
  /** `active`, `disabled_manually`, `disabled_inactivity`… kept as sent. */
  state: z.string().nullable().default(null),
});
export type ForgeWorkflow = z.infer<typeof ForgeWorkflowSchema>;

/** Whether a pull request is open, and how it closed if it isn't. */
export const ForgePullStateSchema = z.enum(['open', 'closed', 'merged']);
export type ForgePullState = z.infer<typeof ForgePullStateSchema>;

/**
 * The aggregate review verdict.
 *
 * `null` is "nobody has reviewed and none is required" — distinct from
 * `REVIEW_REQUIRED`, which is "the branch protection rule is unsatisfied".
 * Rendering both as "pending" loses the difference between a PR waiting on a
 * person and one waiting on nothing at all.
 */
export const ForgeReviewDecisionSchema = z.enum([
  'APPROVED',
  'CHANGES_REQUESTED',
  'REVIEW_REQUIRED',
]);
export type ForgeReviewDecision = z.infer<typeof ForgeReviewDecisionSchema>;

/** The rollup of a PR's status checks — the same traffic light, one level up. */
export const ForgeChecksRollupSchema = z.enum(['passing', 'failing', 'pending']);
export type ForgeChecksRollup = z.infer<typeof ForgeChecksRollupSchema>;

/** One pull request. */
export const ForgePullSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: ForgePullStateSchema,
  isDraft: z.boolean().default(false),
  /** null when no review has been submitted and none is required. */
  reviewDecision: ForgeReviewDecisionSchema.nullable().default(null),
  /** null when the PR has no checks at all — not the same as "pending". */
  checks: ForgeChecksRollupSchema.nullable().default(null),
  headBranch: z.string(),
  /** Login of whoever opened it. Empty string when the forge withholds it. */
  author: z.string().default(''),
  url: z.string(),
});
export type ForgePull = z.infer<typeof ForgePullSchema>;

/**
 * Whether the `gh` CLI can answer at all, and why not when it can't.
 *
 * Modelled as a reason code plus a message rather than a bare boolean because
 * the three failures need three different sentences in the UI: "install gh",
 * "run gh auth login", and "gh is there but the call failed". A single
 * `available: false` would collapse them into an unactionable "unavailable".
 */
export const ForgeCliReasonSchema = z.enum(['ready', 'not-installed', 'not-authenticated']);
export type ForgeCliReason = z.infer<typeof ForgeCliReasonSchema>;

export const ForgeCliStatusSchema = z.object({
  reason: ForgeCliReasonSchema,
  /** Resolved binary path when installed; null otherwise. */
  binPath: z.string().nullable().default(null),
  /** The hint shown to the user — the command that would fix it. */
  hint: z.string().default(''),
});
export type ForgeCliStatus = z.infer<typeof ForgeCliStatusSchema>;

/**
 * A forge listing that is allowed to come back empty-handed.
 *
 * The envelope exists so "no runs yet" and "gh could not be reached" stay
 * different answers at every layer. Without it the renderer would have to
 * infer failure from an empty array, and a brand-new repository with no CI
 * would render the same error card as a machine with no `gh` installed.
 */
export const ForgeRunsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  runs: z.array(ForgeRunSchema).default([]),
  /** Present when the listing itself failed despite a ready CLI. */
  error: z.string().nullable().default(null),
});
export type ForgeRunsResult = z.infer<typeof ForgeRunsResultSchema>;

export const ForgePullsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  pulls: z.array(ForgePullSchema).default([]),
  error: z.string().nullable().default(null),
});
export type ForgePullsResult = z.infer<typeof ForgePullsResultSchema>;

/**
 * Whether an issue is open, and nothing more.
 *
 * Deliberately not `ForgePullState`'s three arms: an issue cannot merge, and a
 * union that offers `merged` for a shape that can never hold it is a state the
 * UI has to write a dead branch for.
 */
export const ForgeIssueStateSchema = z.enum(['open', 'closed']);
export type ForgeIssueState = z.infer<typeof ForgeIssueStateSchema>;

/** A label, with the colour the forge assigned it. */
export const ForgeLabelSchema = z.object({
  name: z.string(),
  /** Six hex digits, no leading `#`, as GitHub sends it. Empty when withheld. */
  color: z.string().default(''),
});
export type ForgeLabel = z.infer<typeof ForgeLabelSchema>;

/** One issue. */
export const ForgeIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: ForgeIssueStateSchema,
  /** Login of whoever opened it. Empty string when the forge withholds it. */
  author: z.string().default(''),
  labels: z.array(ForgeLabelSchema).default([]),
  /** Logins, in the order the forge listed them. Empty means unassigned. */
  assignees: z.array(z.string()).default([]),
  /** ISO 8601. Ordering and relative-age display. */
  updatedAt: z.string(),
  createdAt: z.string().nullable().default(null),
  url: z.string(),
});
export type ForgeIssue = z.infer<typeof ForgeIssueSchema>;

/**
 * One step inside a job.
 *
 * `status` reuses `ForgeRunStatus` because GitHub uses the same three words at
 * every level of the tree, and `conclusion` reuses `ForgeRunConclusion` for the
 * same reason — a skipped step and a skipped run mean the same thing and should
 * not be two enums that drift.
 */
export const ForgeStepSchema = z.object({
  /** 1-based, and the order the step ran in. */
  number: z.number().int(),
  name: z.string(),
  status: ForgeRunStatusSchema,
  conclusion: ForgeRunConclusionSchema.nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
});
export type ForgeStep = z.infer<typeof ForgeStepSchema>;

/**
 * One job within a run.
 *
 * `steps` is routinely empty and that is normal, not a parse failure: a job
 * that was skipped by an `if:` never had steps, and GitHub sends `[]`. Rendering
 * "no steps" for it is correct; treating it as an error is not.
 */
export const ForgeJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ForgeRunStatusSchema,
  conclusion: ForgeRunConclusionSchema.nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  /** The job's own page on the forge — its log, in the browser. */
  url: z.string().default(''),
  steps: z.array(ForgeStepSchema).default([]),
});
export type ForgeJob = z.infer<typeof ForgeJobSchema>;

/** A run, plus the job/step tree underneath it. */
export const ForgeRunDetailSchema = z.object({
  run: ForgeRunSchema,
  jobs: z.array(ForgeJobSchema).default([]),
});
export type ForgeRunDetail = z.infer<typeof ForgeRunDetailSchema>;

/**
 * A job log, capped and split.
 *
 * **Lines, not one string.** The renderer virtualises this through
 * `@tanstack/react-virtual`, which needs an indexable array; splitting an
 * 800KB string on mount is work done on the render thread that main can do once
 * while it already holds the bytes.
 *
 * **Head and tail, with the middle named.** A failed matrix job's log is
 * routinely tens of megabytes. The failure is at the end and the setup context
 * is at the start, so both windows are kept and `omittedLines` says exactly how
 * much fell out of the middle — a silently short log is the one outcome this
 * shape refuses to produce. `totalBytes` is the whole log's size regardless of
 * what was kept, so the UI can offer the un-truncated fetch and say what it
 * would cost.
 */
export const ForgeRunLogSchema = z.object({
  lines: z.array(z.string()).default([]),
  /** True when `lines` is a window onto a larger log. */
  truncated: z.boolean().default(false),
  /** How many lines the head/tail split dropped. 0 when `truncated` is false. */
  omittedLines: z.number().int().nonnegative().default(0),
  /** The full log's size in bytes, even when truncated. */
  totalBytes: z.number().int().nonnegative().default(0),
  /** Set when the request asked for, and got, the whole thing. */
  complete: z.boolean().default(false),
});
export type ForgeRunLog = z.infer<typeof ForgeRunLogSchema>;

/**
 * The line spliced in where a truncated log's middle was removed.
 *
 * Contract, not cosmetics, and it lives here for a reason: main writes this
 * line and the renderer has to *recognise* it, because it is the boundary
 * between two windows that were never adjacent. A group opened in the head
 * window and never closed would otherwise swallow every line of the tail —
 * including the failure the log was opened for — under the wrong header.
 *
 * Two regexes in two packages agreeing by luck is how that breaks silently, so
 * the writer and the reader share one definition.
 */
export const logGapMarker = (omittedLines: number): string =>
  `··· ${omittedLines.toLocaleString('en-US')} lines omitted — open the run on GitHub for the full log ···`;

/**
 * Whether a log line is that marker.
 *
 * Matched on the sentinel rule rather than the exact sentence: the marker is
 * the only line in a log that carries no `job<TAB>step<TAB>` prefix *and*
 * opens with the ellipsis run, so the wording can change without the reader
 * losing the boundary.
 */
export const isLogGapMarker = (line: string): boolean =>
  line.startsWith('··· ') && line.endsWith(' ···') && !line.includes('\t');

/**
 * An issue listing.
 *
 * `disabled` is its own field rather than an `error` string because "this
 * repository has issues turned off" is a permanent, correct answer that the
 * sidebar should state calmly and the dashboard should use to drop its Issues
 * widget entirely — while `error` means "something went wrong, try again".
 * Collapsing the two would put a red failure card on a repo that is behaving
 * exactly as its owner configured it.
 */
export const ForgeIssuesResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  issues: z.array(ForgeIssueSchema).default([]),
  disabled: z.boolean().default(false),
  error: z.string().nullable().default(null),
});
export type ForgeIssuesResult = z.infer<typeof ForgeIssuesResultSchema>;

/** A run's job tree. `detail` is null whenever `error` is set, and vice versa. */
export const ForgeRunDetailResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  detail: ForgeRunDetailSchema.nullable().default(null),
  error: z.string().nullable().default(null),
});
export type ForgeRunDetailResult = z.infer<typeof ForgeRunDetailResultSchema>;

/**
 * A run's log.
 *
 * `log` is null for the honest and common case of a run that has not finished:
 * GitHub does not serve logs for an in-flight run, and `gh` says so on stderr.
 * That is a "not yet", not a failure, so it arrives as a null log with a null
 * error and a `pending` flag rather than as a red card.
 */
export const ForgeRunLogResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  log: ForgeRunLogSchema.nullable().default(null),
  /** The run is still going, so there is no log to serve yet. */
  pending: z.boolean().default(false),
  error: z.string().nullable().default(null),
});
export type ForgeRunLogResult = z.infer<typeof ForgeRunLogResultSchema>;

/** The repo's workflow definitions — fetched only to resolve a file path. */
export const ForgeWorkflowsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  workflows: z.array(ForgeWorkflowSchema).default([]),
  error: z.string().nullable().default(null),
});
export type ForgeWorkflowsResult = z.infer<typeof ForgeWorkflowsResultSchema>;
