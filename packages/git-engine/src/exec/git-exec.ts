import type { ChildProcess } from 'node:child_process';

import { GitProcess, type IGitExecutionOptions, type IGitResult } from 'dugite';

/**
 * The one place this codebase shells out to git.
 *
 * Backend choice (docs/INITIAL_PLAN.md → research findings): **dugite**, the
 * layer GitHub Desktop uses. It bundles a known-version git binary, so behaviour
 * doesn't drift with whatever the user has on PATH, and because it's the real
 * CLI we inherit credential helpers, SSH agents and commit signing for free —
 * none of which libgit2 bindings or isomorphic-git give us.
 *
 * `resolveGitBinary` is the seam for a future settings flag that switches to the
 * user's system git; nothing else in the engine knows which binary ran.
 */

export type GitExecResult = IGitResult & {
  /** The argv actually passed to git, for error messages and logging. */
  readonly args: readonly string[];
};

export class GitExecError extends Error {
  constructor(
    override readonly message: string,
    readonly result: GitExecResult,
  ) {
    super(message);
    this.name = 'GitExecError';
  }
}

/**
 * Environment applied to every git invocation.
 *
 * - `LC_ALL=C` — porcelain output is only stable in the C locale. Under a
 *   localised locale git translates the very strings the parsers match on.
 * - `GIT_OPTIONAL_LOCKS=0` — read commands (`status`, `log`) otherwise take
 *   `index.lock` to refresh the index. With the watcher firing reads constantly
 *   that races the user's own writes for no benefit.
 * - `GIT_TERMINAL_PROMPT=0` — never block on a credential prompt with no
 *   terminal attached. An auth failure must fail loudly and immediately rather
 *   than hang a spinner forever.
 * - `GIT_CONFIG_PARAMETERS` for `core.quotepath=false` — with quoting on, git
 *   escapes non-ASCII bytes in paths as `\303\251` octal even under `-z`.
 *
 * Note what is NOT overridden: `HOME`. The user's `~/.gitconfig` — identity,
 * signing key, credential helper, aliases — applies exactly as it does in their
 * terminal. That's the point of shelling out.
 */
const BASE_ENV: Readonly<Record<string, string>> = {
  LC_ALL: 'C',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_PARAMETERS: "'core.quotepath=false'",
};

/** Extra env for writes, where the optional-locks suppression must NOT apply. */
const WRITE_ENV: Readonly<Record<string, string>> = {
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_PARAMETERS: "'core.quotepath=false'",
};

export type GitExecOptions = {
  /** Written to git's stdin — used for `commit -F -` so messages need no escaping. */
  stdin?: string;
  /** Additional environment, merged over the base. */
  env?: Record<string, string>;
  /**
   * A write op: keeps `GIT_OPTIONAL_LOCKS` unset so git can take the index lock
   * it legitimately needs. Callers should route these through the write queue.
   */
  write?: boolean;
  /**
   * Buffer size for the child's stdout. dugite defaults to 10MB, which a big
   * `log`/`diff` blows straight past.
   */
  maxBuffer?: number;
  /** Rejects with `GitExecError` on a non-zero exit. Default: false. */
  throwOnError?: boolean;
  processCallback?: (proc: ChildProcess) => void;
};

const buildEnv = (opts: GitExecOptions): Record<string, string> => ({
  ...(opts.write ? WRITE_ENV : BASE_ENV),
  ...opts.env,
});

/**
 * Run git in `repoPath` and buffer the output.
 *
 * Non-zero exits resolve normally by default — git uses exit codes as data
 * (`diff --quiet` exits 1 when there *are* changes; `merge` exits 1 on
 * conflict), so callers inspect `exitCode` themselves.
 */
export async function execGit(
  repoPath: string,
  args: readonly string[],
  opts: GitExecOptions = {},
): Promise<GitExecResult> {
  const options: IGitExecutionOptions = {
    env: buildEnv(opts),
    maxBuffer: opts.maxBuffer ?? 100 * 1024 * 1024,
    ...(opts.stdin === undefined ? {} : { stdin: opts.stdin }),
    ...(opts.processCallback === undefined ? {} : { processCallback: opts.processCallback }),
  };

  const raw = await GitProcess.exec([...args], repoPath, options);
  const result: GitExecResult = { ...raw, args };

  if (opts.throwOnError && raw.exitCode !== 0) {
    throw new GitExecError(describeFailure(args, raw), result);
  }
  return result;
}

/**
 * Spawn git and hand back the live child process, for output too large to
 * buffer — the log stream reads stdout incrementally so the first rows reach
 * the UI while git is still walking history.
 */
export function spawnGit(
  repoPath: string,
  args: readonly string[],
  opts: Pick<GitExecOptions, 'env' | 'write'> = {},
): ChildProcess {
  return GitProcess.spawn([...args], repoPath, { env: buildEnv(opts) });
}

const describeFailure = (args: readonly string[], result: IGitResult): string => {
  const first = result.stderr.trim().split('\n')[0] ?? '';
  const cmd = `git ${args.join(' ')}`;
  return first ? `${cmd} failed (${result.exitCode}): ${first}` : `${cmd} failed (${result.exitCode})`;
};

/**
 * Is this path inside a git repository, and where is its top level?
 *
 * Answers for linked worktrees too: in one, `.git` is a *file* pointing at
 * `…/.git/worktrees/<name>`, so probing for a `.git` directory would say no.
 * `rev-parse` is the only correct test.
 */
export async function resolveRepoRoot(path: string): Promise<string | null> {
  const res = await execGit(path, ['rev-parse', '--show-toplevel']);
  if (res.exitCode !== 0) return null;
  const top = res.stdout.trim();
  return top.length > 0 ? top : null;
}

/**
 * The path of the *main* worktree for a repo, given any worktree inside it.
 *
 * `--path-format=absolute --git-common-dir` resolves to the shared `.git`
 * directory (the main worktree's, even when called from a linked one); the main
 * worktree is its parent. This is how the sidebar groups linked worktrees under
 * the repository that owns them rather than listing each as a separate repo.
 */
export async function resolveMainWorktree(path: string): Promise<string | null> {
  const res = await execGit(path, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (res.exitCode !== 0) return null;
  const commonDir = res.stdout.trim();
  if (!commonDir) return null;
  // A bare repo's common dir IS the repo; otherwise strip the trailing `/.git`.
  const suffix = '/.git';
  return commonDir.endsWith(suffix) ? commonDir.slice(0, -suffix.length) : commonDir;
}
