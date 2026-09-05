import {
  currentBranch,
  getStatus,
  layoutGraph,
  listRefs,
  listRemotes,
  readFileDiff,
  readLog,
  resolveMainWorktree,
  resolveRepoRoot,
  revParse,
} from '@midnite/studio-git-engine';
import {
  checksVerdict,
  DIFF_LINE_CAP,
  pickForgeRemote,
  type Forge,
  type ForgeRunsResult,
  type GraphRow,
  type McpToolInput,
  type McpToolOutput,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import { listPulls, listRuns } from '../forge/gh-cli';
import { listRepos } from '../repo-registry';
import { McpToolError } from './errors';

/**
 * The eight read-only MCP tools (Phase 57 Theme D), one function per tool id.
 *
 * Every handler takes the tool's own validated input (`dispatch.ts` parses
 * with `MCP_TOOLS[id].input` before calling in) and returns the tool's own
 * `output` shape (or throws {@link McpToolError} for a `not-found`/`refused`
 * answer) — never `writeQueue.run`, which is the enforceable form of
 * "read-only" this phase's own guardrail names.
 */

/** What resolving a caller-supplied path to a registered repository produced. */
type RegisteredRepo = {
  /** The exact directory `repoPath` resolved to — may be a linked worktree's own root, not the main one. */
  repoRoot: string;
  /** The repo's registered (main-worktree) path — what `listRepos()` keys entries on. */
  mainRoot: string;
  repoId: string;
};

/**
 * `repoPath` → the repository it belongs to, refusing anything the app has
 * not opened. Every tool below resolves through this rather than trusting
 * `repoPath` outright — "the current repo" has no meaning here (multi-window,
 * and an MCP caller is not a window at all), so every call must name one.
 *
 * Uses `resolveRepoRoot` + the repo registry, not `fs-scope.ts`: `joinWithin`
 * there refuses absolute paths outright, and an MCP caller only ever has an
 * absolute path (Phase 57 Decision 9). The deeper hardening this needs before
 * the server is reachable outside a developer's own machine — `realpath`
 * symlink comparison, an audit trail — is Theme E, deferred with the rest of
 * consent-and-scope; this is the resolve-then-compare Theme D's own bullet
 * list requires so a tool can find the right repository at all.
 */
async function resolveRegisteredRepo(
  repoPath: string,
): Promise<{ ok: true; repo: RegisteredRepo } | { ok: false; error: McpToolError }> {
  const repoRoot = await resolveRepoRoot(repoPath);
  if (!repoRoot) {
    return {
      ok: false,
      error: new McpToolError('not-found', `"${repoPath}" is not inside a git repository.`),
    };
  }

  const mainRoot = (await resolveMainWorktree(repoPath)) ?? repoRoot;
  const registered = (await listRepos()).find((repo) => repo.path === mainRoot);
  if (!registered) {
    return {
      ok: false,
      error: new McpToolError(
        'refused',
        `"${mainRoot}" is not a repository Midnite Studio has open — open it in the app first.`,
      ),
    };
  }

  return { ok: true, repo: { repoRoot, mainRoot, repoId: registered.id } };
}

/** The repo's GitHub remote, resolved from its worktree — same rule `githubForge` (`ipc/forge-handlers.ts`) applies from a `repoId`, applied here from a path since an MCP caller has no id. */
async function githubForgeFor(repoRoot: string): Promise<Forge | null> {
  const forge = pickForgeRemote(await listRemotes(repoRoot))?.forge ?? null;
  return forge?.kind === 'github' ? forge : null;
}

export async function repoList(): Promise<RepoDescriptor[]> {
  return listRepos();
}

export async function repoResolve(
  input: McpToolInput<'repo.resolve'>,
): Promise<McpToolOutput<'repo.resolve'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const repos = await listRepos();
  const repo = repos.find((r) => r.id === resolved.repo.repoId);
  if (!repo) {
    throw new McpToolError('not-found', `Repository "${resolved.repo.mainRoot}" is no longer open.`);
  }

  return { repo, branch: await currentBranch(resolved.repo.repoRoot) };
}

export async function statusGet(input: McpToolInput<'status.get'>): Promise<McpToolOutput<'status.get'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  return getStatus(resolved.repo.repoRoot);
}

/** Default rows for `graph.log`; the hard ceiling a caller cannot raise past (Decision 3). */
export const GRAPH_LOG_DEFAULT_LIMIT = 50;
export const GRAPH_LOG_MAX_LIMIT = 200;

export async function graphLog(input: McpToolInput<'graph.log'>): Promise<McpToolOutput<'graph.log'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const limit = Math.min(input.limit ?? GRAPH_LOG_DEFAULT_LIMIT, GRAPH_LOG_MAX_LIMIT);
  const commits = await readLog(resolved.repo.repoRoot, { limit, all: true });
  const rows: GraphRow[] = layoutGraph(commits);
  return rows;
}

export async function diffFile(input: McpToolInput<'diff.file'>): Promise<McpToolOutput<'diff.file'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const options = input.context === undefined ? {} : { context: input.context };
  const diff = await readFileDiff(resolved.repo.repoRoot, input.path, input.staged ?? false, options);

  if (diff.binary) {
    throw new McpToolError('refused', `"${input.path}" is a binary file — diff.file only serves text diffs.`);
  }
  if (diff.truncated) {
    throw new McpToolError(
      'refused',
      `"${input.path}"'s diff exceeds the ${DIFF_LINE_CAP}-line cap (${diff.droppedLines} lines dropped) — narrow the request.`,
    );
  }

  return diff;
}

export async function branchList(input: McpToolInput<'branch.list'>): Promise<McpToolOutput<'branch.list'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const refs = await listRefs(resolved.repo.repoRoot);
  return refs.filter((ref) => ref.kind === 'localBranch' || ref.kind === 'remoteBranch');
}

export async function forgePulls(input: McpToolInput<'forge.pulls'>): Promise<McpToolOutput<'forge.pulls'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const forge = await githubForgeFor(resolved.repo.repoRoot);
  if (!forge) {
    throw new McpToolError('not-found', 'This repository has no recognised GitHub remote.');
  }

  return listPulls(forge, {
    limit: input.limit ?? 20,
    state: input.state ?? 'open',
  });
}

export async function forgeChecks(input: McpToolInput<'forge.checks'>): Promise<McpToolOutput<'forge.checks'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const forge = await githubForgeFor(resolved.repo.repoRoot);
  if (!forge) {
    throw new McpToolError('not-found', 'This repository has no recognised GitHub remote.');
  }

  const branch = input.branch ?? (await currentBranch(resolved.repo.repoRoot)) ?? undefined;
  const options: { limit: number; branch?: string } = { limit: input.limit ?? 20 };
  if (branch !== undefined) options.branch = branch;

  const runsResult: ForgeRunsResult = await listRuns(forge, options);
  const headSha = await revParse(resolved.repo.repoRoot, 'HEAD');
  const verdict = checksVerdict(runsResult.runs, headSha) ?? null;

  return { ...runsResult, verdict };
}
