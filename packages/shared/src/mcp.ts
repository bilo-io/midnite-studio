import { z } from 'zod';

import {
  ChecksVerdictSchema,
  FileDiffSchema,
  ForgePullsResultSchema,
  ForgeRunsResultSchema,
  GraphRowSchema,
  RefSchema,
  RepoDescriptorSchema,
  StatusResultSchema,
} from './domain';

/**
 * Midnite Studio speaks MCP (Phase 57).
 *
 * `MCP_TOOLS` is the single source of truth for every tool this app's MCP
 * server answers — id, the one-line description a model reads to decide
 * whether to call it, and its zod input/output schemas — in the house style
 * of `COMMANDS` (`keybindings.ts`): `McpToolId` and `MCP_TOOL_IDS` are derived
 * from it, never hand-maintained separately.
 *
 * **Inputs are new schemas keyed by filesystem path, not reused `RepoId`
 * extensions.** Nearly every request schema in `ipc/schemas.ts` extends
 * `RepoId` (`StatusGetRequest = RepoId.extend({ worktreePath: z.string().optional() })`),
 * and a repo *id* is the one thing an agent in a shell cannot know — it knows
 * its own `cwd`. `McpRepoTarget` is the one new input primitive every tool
 * builds on.
 *
 * **Outputs are reused, verbatim.** Every tool's `output` is an existing
 * export from `domain/` — `StatusResultSchema`, `GraphRowSchema`, `RefSchema`,
 * `FileDiffSchema`, the forge result schemas — never a re-typed copy. Where a
 * tool needs a shape those don't already have on their own (`repo.resolve`'s
 * paired branch name, `forge.checks`'s verdict), the existing schema is
 * extended with a plain field rather than rebuilt.
 */

/**
 * Every tool call is scoped to a repository the caller names by path — an
 * agent knows its `cwd`, never Midnite Studio's internal `repoId`. Every
 * tool's dispatcher resolves this to a registered repository via
 * `resolveRepoRoot` + the repo registry before touching git (Phase 57 Theme D)
 * rather than trusting it outright.
 */
export const McpRepoTarget = z.object({ repoPath: z.string().min(1) });

/** Every entry's shape. `input`/`output` stay `z.ZodTypeAny` so each tool keeps its own literal schema type under `satisfies` rather than being widened. */
type McpToolEntry = {
  id:
    | 'repo.list'
    | 'repo.resolve'
    | 'status.get'
    | 'graph.log'
    | 'diff.file'
    | 'branch.list'
    | 'forge.pulls'
    | 'forge.checks';
  title: string;
  /**
   * The text a model actually reads to decide whether to call this tool.
   * Rule, not aspiration: at most 220 characters, one sentence, starting with
   * a verb, naming the shell command it replaces — asserted in `mcp.test.ts`.
   */
  description: string;
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  /** Always `true` in this phase — write tools are a deferred follow-up (Decision 5). */
  readOnly: true;
};

export const MCP_TOOLS = {
  'repo.list': {
    id: 'repo.list',
    title: 'List open repositories',
    description:
      'Lists every repository Midnite Studio has open — use instead of `find ~ -name .git -type d` to discover checkouts; each entry carries its path, name and current branch.',
    input: z.object({}),
    output: z.array(RepoDescriptorSchema),
    readOnly: true,
  },
  'repo.resolve': {
    id: 'repo.resolve',
    title: 'Resolve a path to its repository',
    description:
      'Resolves a filesystem path to its registered repository and current branch — use instead of `git rev-parse --show-toplevel` plus `git branch --show-current`.',
    input: McpRepoTarget,
    output: z.object({
      repo: RepoDescriptorSchema,
      /** The branch checked out at `repoPath` specifically — may differ from `repo.headRef` when `repoPath` is a linked worktree. */
      branch: z.string().nullable(),
    }),
    readOnly: true,
  },
  'status.get': {
    id: 'status.get',
    title: 'Get working tree status',
    description:
      'Returns the parsed working tree (staged, unstaged, untracked, conflicted) for a repository — use instead of `git status --porcelain`; conflict states are already classified.',
    input: McpRepoTarget,
    output: StatusResultSchema,
    readOnly: true,
  },
  'graph.log': {
    id: 'graph.log',
    title: 'Get the laid-out commit graph',
    description:
      'Returns laid-out commit graph rows, lanes and edges included, for a repository — use instead of `git log --graph`; lane layout is not something a shell can reproduce cheaply.',
    input: McpRepoTarget.extend({
      /** Default 50, hard maximum 200 — clamped server-side, never trusted from the caller (Decision 3). */
      limit: z.number().int().min(1).max(200).optional(),
    }),
    output: z.array(GraphRowSchema),
    readOnly: true,
  },
  'diff.file': {
    id: 'diff.file',
    title: 'Get one file’s diff',
    description:
      'Returns a parsed unified diff for one file in a repository — use instead of `git diff -- <path>`; a binary or over-cap diff is refused rather than truncated.',
    input: McpRepoTarget.extend({
      path: z.string().min(1),
      staged: z.boolean().optional(),
      context: z.number().int().min(0).max(1000).optional(),
    }),
    output: FileDiffSchema,
    readOnly: true,
  },
  'branch.list': {
    id: 'branch.list',
    title: 'List branches',
    description:
      'Lists local and remote branches with ahead/behind counts — use instead of `git for-each-ref refs/heads refs/remotes`; tracking info is already resolved.',
    input: McpRepoTarget,
    output: z.array(RefSchema),
    readOnly: true,
  },
  'forge.pulls': {
    id: 'forge.pulls',
    title: 'List pull requests',
    description:
      'Lists a repository’s pull requests through the user’s own `gh` CLI — use instead of `gh pr list`; review decision and checks rollup are already parsed.',
    input: McpRepoTarget.extend({
      limit: z.number().int().min(1).max(100).optional(),
      state: z.enum(['open', 'closed', 'merged', 'all']).optional(),
    }),
    output: ForgePullsResultSchema,
    readOnly: true,
  },
  'forge.checks': {
    id: 'forge.checks',
    title: 'Get CI runs and their verdict',
    description:
      'Lists recent CI runs and a pass/fail verdict for a branch — use instead of `gh run list` plus eyeballing conclusions; the verdict is computed from the same runs.',
    input: McpRepoTarget.extend({
      limit: z.number().int().min(1).max(100).optional(),
      /** Defaults to the branch checked out at `repoPath`. */
      branch: z.string().optional(),
    }),
    output: ForgeRunsResultSchema.extend({
      /** `null` when there is nothing to say — see `checksVerdict` in `domain/checks-verdict.ts`. */
      verdict: ChecksVerdictSchema.nullable(),
    }),
    readOnly: true,
  },
} satisfies Record<string, McpToolEntry>;

/** Derived, never hand-maintained — exactly `COMMAND_IDS` from `COMMANDS` in `keybindings.ts`. */
export type McpToolId = keyof typeof MCP_TOOLS;
export const MCP_TOOL_IDS = Object.keys(MCP_TOOLS) as McpToolId[];

export const isMcpToolId = (value: string): value is McpToolId =>
  (MCP_TOOL_IDS as readonly string[]).includes(value);

/** The validated input shape for one tool, inferred from its own schema. */
export type McpToolInput<K extends McpToolId> = z.output<(typeof MCP_TOOLS)[K]['input']>;
/** The success-value shape for one tool, inferred from its own schema. */
export type McpToolOutput<K extends McpToolId> = z.output<(typeof MCP_TOOLS)[K]['output']>;

/**
 * The frame protocol. Deliberately shaped like `GitOpResultOf`
 * (`domain/result.ts`) — success payload under `value`, failure carrying a
 * discriminating `kind` — and deliberately *not* `GitOpResult` itself, whose
 * `kind: 'conflict'` arm means nothing for a read-only tool.
 */
export type McpRequest = {
  id: string;
  tool: string;
  input: unknown;
};

export type McpResponse =
  | { id: string; ok: true; value: unknown }
  | {
      id: string;
      ok: false;
      kind: 'error' | 'not-found' | 'refused';
      message: string;
    };

export const MCP_PROTOCOL = 1;
/**
 * Sized for what a model should be handed in one call, not for pty output —
 * these deliberately undercut `broker/protocol.ts`'s `MAX_PAYLOAD_LENGTH`
 * (16 MB), which exists for terminal scrollback frames.
 */
export const MCP_MAX_REQUEST_BYTES = 256 * 1024;
export const MCP_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
