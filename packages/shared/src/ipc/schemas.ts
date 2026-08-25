import { z } from 'zod';

import {
  ConflictOpSchema,
  DIFF_DEFAULT_CONTEXT,
  DIFF_FULL_CONTEXT,
  FileDiffSchema,
  GitOpResultSchema,
  GraphRowSchema,
  RefSchema,
  RepoDescriptorSchema,
  StatusResultSchema,
  WatchEventSchema,
  WorktreeSchema,
} from '../domain';
import {
  AgentDefinitionSchema,
  TerminalSessionKindSchema,
  TerminalSessionSchema,
} from '../terminal';

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

// --- status / detail -------------------------------------------------------

export const StatusGetRequest = RepoId.extend({
  /** Which checkout to inspect. Defaults to the repo's main worktree. */
  worktreePath: z.string().optional(),
});
export const StatusGetResponse = StatusResultSchema;

export const CommitDetailRequest = RepoId.extend({ sha: z.string().min(1) });
export const CommitDetailResponse = z.object({
  sha: z.string(),
  body: z.string(),
  /** `git show --stat` output, rendered as preformatted text for now. */
  stat: z.string(),
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
 * No `force` field, deliberately. Force-push is out of scope for the MVP
 * (docs/INITIAL_PLAN.md → Risks); when it lands it will be `--force-with-lease`
 * behind blast-radius gating, as a distinct channel.
 */
export const PushRequest = OpBase.extend({
  remote: z.string().optional(),
  branch: z.string().optional(),
  /** `-u` on the first push of a branch with no upstream. */
  setUpstream: z.boolean().default(false),
  /** Push the tag refspec too. */
  tags: z.boolean().default(false),
});

export const AbortRequest = OpBase.extend({ op: ConflictOpSchema });
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
});
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
export const PtyExitEvent = z.object({
  ptyId: z.string(),
  exitCode: z.number().int(),
  signal: z.number().int().optional(),
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
});
export const TerminalListResponse = z.object({
  sessions: z.array(RestoredTerminalSession),
});

export const TerminalSaveRequest = z.object({ session: TerminalSessionSchema });
export const TerminalForgetRequest = z.object({ sessionId: z.string().min(1) });
/** The full ordered id list, not a moved-from/moved-to pair — idempotent on replay. */
export const TerminalReorderRequest = z.object({ sessionIds: z.array(z.string().min(1)) });

export const AgentListResponse = z.object({ agents: z.array(AgentDefinitionSchema) });

/** Likewise the whole order, so a dropped message cannot leave a half-applied swap. */
export const RepoReorderRequest = z.object({ repoIds: z.array(z.string().min(1)) });

// --- window chrome ---------------------------------------------------------

export const WindowStateSchema = z.object({
  maximized: z.boolean(),
  fullScreen: z.boolean(),
  focused: z.boolean(),
});

// --- watch -----------------------------------------------------------------

export const WatchEventPayload = WatchEventSchema;

export type LogBatchEventPayload = z.infer<typeof LogBatchEvent>;
export type LogDoneEventPayload = z.infer<typeof LogDoneEvent>;
export type WindowState = z.infer<typeof WindowStateSchema>;
export type CommitDetail = z.infer<typeof CommitDetailResponse>;
export type BlastRadius = z.infer<typeof BlastRadiusResponse>;
