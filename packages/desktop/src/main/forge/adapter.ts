import type {
  Forge,
  ForgeCapability,
  ForgeIssueCommentsResult,
  ForgeIssueCreateResult,
  ForgeIssueDetailResult,
  ForgeIssueEditInput,
  ForgeIssuesResult,
  ForgeKind,
  ForgeLinkKind,
  ForgeLinkWriteResult,
  ForgeMergeMethod,
  ForgeProjectAddItemInput,
  ForgeProjectCreateResult,
  ForgeProjectFieldsResult,
  ForgeProjectFieldValue,
  ForgeProjectItemsResult,
  ForgeProjectsResult,
  ForgeProjectWriteResult,
  ForgePullCommentsResult,
  ForgePullDetailResult,
  ForgePullFilesResult,
  ForgePullScope,
  ForgePullsResult,
  ForgePullThreadsResult,
  ForgeRunDetailResult,
  ForgeRunLogResult,
  ForgeRunsResult,
  ForgeReviewEvent,
  ForgeWorkflowsResult,
  ForgeWriteResult,
} from '@midnite/studio-shared';

/**
 * The seam Phase 90 Theme D builds: one interface every forge integration
 * implements, so `forge-handlers.ts`'s 24 handlers stop calling `gh-*.ts`
 * directly and become provider-blind. GitHub is the first (and, until
 * Themes E-G land, only) implementation — see `github/create-github-adapter.ts`.
 *
 * **Deliberately not the doc's four-name shorthand.** The phase doc describes
 * the "bounded write surface" as `comment`, `review`, `setIssueState`,
 * `setItemField` — the write vocabulary every provider's capability matrix
 * can eventually be checked against. This interface instead names every
 * write GitHub's UI already drives today (`commentPull` *and* `commentIssue`,
 * `mergePull`, `requestReview`, `markReady`, `rerunChecks`, …), because
 * Theme D's own acceptance criterion is "no behaviour change" — collapsing
 * eleven working call sites into four generic verbs is a real design change
 * that belongs with the provider that first needs the generalisation (a
 * future theme), not smuggled into a rename-and-move refactor. `setItemField`
 * is the one name that already matches the shorthand, because GitHub's own
 * `setItemFieldValue` already has no siblings to collapse.
 *
 * Every method takes the same `Forge` (and, where relevant, the same request
 * shape) the moved `gh-*.ts` functions already took — the adapter is a thin
 * dispatch layer, not a new abstraction over the data.
 */
export interface ForgeAdapter {
  readonly kind: ForgeKind;

  // --- reads ------------------------------------------------------------

  listRuns(
    forge: Forge,
    options: { limit: number; branch?: string; workflow?: string },
  ): Promise<ForgeRunsResult>;
  runDetail(forge: Forge, runId: string): Promise<ForgeRunDetailResult>;
  runLog(
    forge: Forge,
    runId: string,
    options?: { jobId?: string; full?: boolean },
  ): Promise<ForgeRunLogResult>;
  listWorkflows(forge: Forge): Promise<ForgeWorkflowsResult>;

  listPulls(
    forge: Forge,
    options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all'; scope?: ForgePullScope },
  ): Promise<ForgePullsResult>;
  pullDetail(forge: Forge, number: number): Promise<ForgePullDetailResult>;
  pullFiles(forge: Forge, number: number): Promise<ForgePullFilesResult>;
  pullComments(forge: Forge, number: number): Promise<ForgePullCommentsResult>;
  pullThreads(forge: Forge, number: number): Promise<ForgePullThreadsResult>;

  listIssues(
    forge: Forge,
    options: { limit: number; state: 'open' | 'closed' | 'all' },
  ): Promise<ForgeIssuesResult>;
  issueDetail(forge: Forge, number: number): Promise<ForgeIssueDetailResult>;
  issueComments(forge: Forge, number: number): Promise<ForgeIssueCommentsResult>;

  listBoards(forge: Forge): Promise<ForgeProjectsResult>;
  boardFields(forge: Forge, projectId: string): Promise<ForgeProjectFieldsResult>;
  boardItems(forge: Forge, projectId: string, cursor?: string): Promise<ForgeProjectItemsResult>;

  // --- writes -------------------------------------------------------------

  addReviewComment(
    forge: Forge,
    request: {
      number: number;
      commitId: string;
      path: string;
      line: number;
      side: 'RIGHT';
      position?: number;
      body: string;
    },
  ): Promise<ForgeWriteResult>;
  replyToReviewComment(
    forge: Forge,
    request: { number: number; commentId: string; body: string },
  ): Promise<ForgeWriteResult>;
  setThreadResolved(
    forge: Forge,
    request: { threadId: string; resolved: boolean },
  ): Promise<ForgeWriteResult>;
  reviewPull(
    forge: Forge,
    number: number,
    event: ForgeReviewEvent,
    body: string,
  ): Promise<ForgeWriteResult>;
  commentPull(forge: Forge, number: number, body: string): Promise<ForgeWriteResult>;
  mergePull(forge: Forge, number: number, method: ForgeMergeMethod): Promise<ForgeWriteResult>;
  requestReview(forge: Forge, number: number, reviewers: string[]): Promise<ForgeWriteResult>;
  markReady(forge: Forge, number: number): Promise<ForgeWriteResult>;
  rerunChecks(forge: Forge, runId: string, failedOnly: boolean): Promise<ForgeWriteResult>;

  commentIssue(forge: Forge, number: number, body: string): Promise<ForgeWriteResult>;
  setIssueState(forge: Forge, number: number, state: 'open' | 'closed'): Promise<ForgeWriteResult>;

  setItemField(
    forge: Forge,
    request: { projectId: string; itemId: string; fieldId: string; value: ForgeProjectFieldValue },
  ): Promise<ForgeProjectWriteResult>;

  // --- issue and project CRUD, and dependency links (Phase 95 Theme D) ----
  //
  // `capabilities().ops` says which of these a given adapter actually
  // answers with a real write — an unsupported op still has to implement this
  // interface (the same "every method has a real function, even an honest
  // `unsupportedWrite`" posture `gitlab-write.ts`/`bitbucket-writes.ts`/
  // `azure-writes.ts` already take for their own PR-review writes), it just
  // never returns `ok: true`.

  /** Reads the created issue back through `issueDetail` on success, so every
   *  provider returns the identical `ForgeIssue` shape a listing would. */
  createIssue(
    forge: Forge,
    request: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: string;
    },
  ): Promise<ForgeIssueCreateResult>;
  editIssue(forge: Forge, number: number, request: ForgeIssueEditInput): Promise<ForgeWriteResult>;
  deleteIssue(forge: Forge, number: number): Promise<ForgeWriteResult>;

  createProject(forge: Forge, title: string): Promise<ForgeProjectCreateResult>;
  editProject(
    forge: Forge,
    request: { projectId: string; title?: string; closed?: boolean },
  ): Promise<ForgeProjectWriteResult>;
  deleteProject(forge: Forge, projectId: string): Promise<ForgeProjectWriteResult>;

  /** An existing issue/PR (`contentId`) or a brand-new draft (`draftTitle` +
   *  optional `draftBody`) — see `ForgeProjectAddItemInputSchema`'s own note
   *  on why this is a union rather than one shape with optional fields. */
  addProjectItem(
    forge: Forge,
    request: { projectId: string } & ForgeProjectAddItemInput,
  ): Promise<ForgeProjectWriteResult>;
  /** Removes a row from the board — not the issue/PR it points at. */
  removeProjectItem(
    forge: Forge,
    request: { projectId: string; itemId: string },
  ): Promise<ForgeProjectWriteResult>;

  /**
   * `number` gains a dependency on `targetNumber` (`blockedBy`) or gains it
   * as a child (`subIssue`). `targetRepo` is `''` for the board's own repo,
   * `owner/name` for a cross-repo target — see `ForgeIssuesLinkRequest`'s own
   * note. Reports `via: 'api'` for a native provider mutation, `via: 'body'`
   * for the `Blocked by #N`/`Blocked by owner/name#N` text fallback every
   * provider with no native relation falls back to — `resolveForgeGraph`
   * (`forge-graph.ts`) already parses that line on read.
   */
  linkIssues(
    forge: Forge,
    request: { kind: ForgeLinkKind; number: number; targetNumber: number; targetRepo?: string },
  ): Promise<ForgeLinkWriteResult>;
  /** The inverse of `linkIssues` — removes the same edge the same way it was written. */
  unlinkIssues(
    forge: Forge,
    request: { kind: ForgeLinkKind; number: number; targetNumber: number; targetRepo?: string },
  ): Promise<ForgeLinkWriteResult>;

  // --- identity, and the capability matrix Theme H reads ------------------

  /**
   * "Who am I" against this forge, using whatever credential the adapter was
   * bound with. Reuses `whoami.ts`'s existing per-kind implementation rather
   * than a second one — this is a thin binding, not new auth code.
   */
  whoami(forge: Forge): Promise<{ login: string; displayName: string; avatarUrl: string | null } | null>;

  /**
   * The reachable-repo listing Theme C's account switch will use to populate
   * the repo picker. **Not implemented for any provider yet** — deliberately
   * optional so `createGitHubAdapter()` can satisfy this interface without
   * inventing a new `gh` call this refactor's own acceptance criterion ("no
   * behaviour change", "the diff is moves plus one binding module") would
   * then have to justify. Theme C wires a real implementation.
   */
  listRepos?(forge: Forge): Promise<{ repos: string[]; error: string | null }>;

  /**
   * The one write with a side effect beyond its own result: a re-run adds an
   * attempt to an already-cached run, so the handler must evict it. Optional
   * because it is a GitHub-cache-specific housekeeping detail, not part of
   * every provider's contract.
   */
  forgetRun?(forge: Forge, runId: string): void;

  /** Theme H's capability matrix, scoped to this adapter's own kind. */
  capabilities(): ForgeCapability;
}
