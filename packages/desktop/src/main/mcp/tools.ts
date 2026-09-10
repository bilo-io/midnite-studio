import { realpath } from 'node:fs/promises';

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
  UI_TOOLS_OFF_MESSAGE,
  type CompanionUiReplyResult,
  type Forge,
  type ForgeRunsResult,
  type GraphRow,
  type McpToolInput,
  type McpToolOutput,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import { requestUiAction } from '../companion/ui-bridge';
import { listPulls, listRuns } from '../forge/gh-cli';
import { listRepos } from '../repo-registry';
import { McpToolError } from './errors';
import { getMcpAllowUi } from './ui-gate';

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
  /** The full descriptor, already fetched by this resolution — callers that need it (`repo.resolve`) reuse it rather than paying for a second `listRepos()`. */
  descriptor: RepoDescriptor;
};

/** `realpath`, or `null` for anything that cannot be resolved (missing, a broken symlink, a permissions error) — never thrown, since every caller here treats that the same as "does not match". */
async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/**
 * `repoPath` → the repository it belongs to, refusing anything the app has
 * not opened. Every tool below resolves through this rather than trusting
 * `repoPath` outright — "the current repo" has no meaning here (multi-window,
 * and an MCP caller is not a window at all), so every call must name one.
 *
 * Uses `resolveRepoRoot` + the repo registry, not `fs-scope.ts`: `joinWithin`
 * there refuses absolute paths outright, and an MCP caller only ever has an
 * absolute path (Phase 57 Decision 9).
 *
 * **Symlink/TOCTOU hardening (Theme E).** Comparison is resolved-root to
 * resolved-root, via `realpath`, not the raw strings `resolveMainWorktree`
 * and the registry return — a `repoPath` reached only through a symlink
 * whose real target is a repository Midnite Studio has not opened is refused
 * exactly like any other unregistered path, even if some segment of the
 * unresolved string happened to collide with a registered one.
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
  const realMainRoot = await realpathOrNull(mainRoot);
  if (!realMainRoot) {
    return {
      ok: false,
      error: new McpToolError('refused', `"${mainRoot}" could not be resolved.`),
    };
  }

  let registered: RepoDescriptor | undefined;
  for (const repo of await listRepos()) {
    if ((await realpathOrNull(repo.path)) === realMainRoot) {
      registered = repo;
      break;
    }
  }

  if (!registered) {
    return {
      ok: false,
      error: new McpToolError(
        'refused',
        `"${mainRoot}" is not a repository Midnite Studio has open — open it in the app first.`,
      ),
    };
  }

  return { ok: true, repo: { repoRoot, mainRoot, descriptor: registered } };
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

  return { repo: resolved.repo.descriptor, branch: await currentBranch(resolved.repo.repoRoot) };
}

export async function statusGet(input: McpToolInput<'status.get'>): Promise<McpToolOutput<'status.get'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  return getStatus(resolved.repo.repoRoot);
}

/** Default rows for `graph.log`; the hard ceiling a caller cannot raise past (Decision 3). */
export const GRAPH_LOG_DEFAULT_LIMIT = 50;
export const GRAPH_LOG_MAX_LIMIT = 200;

/** Pure, so the clamp itself — the one contract Decision 3 actually cares about — is unit-testable without a repo. */
export function clampGraphLogLimit(requested: number | undefined): number {
  return Math.min(requested ?? GRAPH_LOG_DEFAULT_LIMIT, GRAPH_LOG_MAX_LIMIT);
}

export async function graphLog(input: McpToolInput<'graph.log'>): Promise<McpToolOutput<'graph.log'>> {
  const resolved = await resolveRegisteredRepo(input.repoPath);
  if (!resolved.ok) throw resolved.error;

  const limit = clampGraphLogLimit(input.limit);
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

// --- ui.* (Phase 81 Theme F) -------------------------------------------------
//
// Three tools with no repository to resolve — they steer the window itself,
// through `ui-bridge.ts`'s round trip to the main window's own
// `useCompanionUiRequests()` (`features/companion/ui-requests.ts`), which is
// what actually owns `resolveNavigation`/`COMMAND_ACCESS`/`runCommand`. Every
// failure this trio can produce — no window, a timeout, an off switch, a
// renderer-side refusal (locked, `confirm`/`never` tier) — answers `refused`:
// from an agent's own point of view every one of those means the same thing,
// "you don't get to do that right now," and `McpToolError`'s three kinds have
// no closer fit for any of them.

/**
 * A round trip whose renderer side answered `ok:false` for any reason (no
 * window, a timeout, or a declined action) becomes a uniform `refused` — the
 * `'conflict'` arm of `GitOpResult` is structurally possible but never
 * actually produced by `ui-bridge.ts` or `ui-requests.ts`, so it is folded
 * into the same message-less refusal rather than given a branch nothing
 * reaches.
 */
function refuseIfFailed(result: CompanionUiReplyResult): void {
  if (result.ok) return;
  throw new McpToolError('refused', result.kind === 'error' ? result.message : 'refused');
}

export async function uiState(): Promise<McpToolOutput<'ui.state'>> {
  // Deliberately NOT gated on `getMcpAllowUi()` — the switch controls whether
  // `ui.navigate`/`ui.command` may act, not whether an agent may read what is
  // on screen. `uiToolsEnabled` below is how it learns the switch's state
  // without the call itself being refused for it.
  const result = await requestUiAction({ kind: 'state' });
  refuseIfFailed(result);
  if (!result.ok || result.value.did !== 'state') {
    throw new McpToolError('error', 'unexpected reply shape for ui.state');
  }

  const { activeView, settingsPage, detached, repoPath, locked } = result.value;
  return { activeView, settingsPage, detached, repoPath, locked, uiToolsEnabled: getMcpAllowUi() };
}

export async function uiNavigate(input: McpToolInput<'ui.navigate'>): Promise<McpToolOutput<'ui.navigate'>> {
  if (!getMcpAllowUi()) throw new McpToolError('refused', UI_TOOLS_OFF_MESSAGE);

  const result = await requestUiAction({
    kind: 'navigate',
    view: input.view,
    ...(input.page === undefined ? {} : { page: input.page }),
    ...(input.issue === undefined ? {} : { issue: input.issue }),
  });
  refuseIfFailed(result);
  if (!result.ok || result.value.did === 'state' || result.value.did === 'ran') {
    throw new McpToolError('error', 'unexpected reply shape for ui.navigate');
  }

  return { did: result.value.did, view: result.value.view };
}

export async function uiCommand(input: McpToolInput<'ui.command'>): Promise<McpToolOutput<'ui.command'>> {
  if (!getMcpAllowUi()) throw new McpToolError('refused', UI_TOOLS_OFF_MESSAGE);

  const result = await requestUiAction({ kind: 'command', id: input.id });
  refuseIfFailed(result);
  if (!result.ok || result.value.did !== 'ran') {
    throw new McpToolError('error', 'unexpected reply shape for ui.command');
  }

  return { did: 'ran', label: result.value.label };
}
