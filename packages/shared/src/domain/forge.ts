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

/** Where a run is in its lifecycle. `completed` is the only state with a conclusion. */
export const ForgeRunStatusSchema = z.enum(['queued', 'in_progress', 'completed']);
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
});
export type ForgeRun = z.infer<typeof ForgeRunSchema>;

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
