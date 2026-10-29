import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Midnite Coder's git: the SYSTEM git, behind dugite's API (docs/APPS.md, "App 8: Coder").
 *
 * `scripts/bundle-main.mjs` aliases `dugite` to this module, so git-engine's one exec seam
 * (`exec/git-exec.ts`) runs whatever git the Mac already has instead of a bundled 42 MB copy.
 * Coder only ever reads (log, refs, show, diff, status — every one under git-engine's
 * `GIT_OPTIONAL_LOCKS=0`), and those are stable across every git Apple has shipped in years.
 *
 * Resolution never runs `/usr/bin/git` itself: on a Mac without the Command Line Tools that is
 * an `xcrun` shim which pops the "install developer tools" dialog. It asks `xcode-select -p` for the
 * active developer directory instead and runs that directory's own git, after an explicit
 * `MIDNITE_GIT` and Homebrew's. Without any of them every call answers {@link NO_GIT} — the graph
 * renders it as its "could not read the history" state.
 */

export const NO_GIT =
  "Git isn't installed. Install Apple's Command Line Tools (run `xcode-select --install` in Terminal), then reopen this repository.";

export type GitBinary = { path: string } | { path: null; reason: string };

export type GitProbe = {
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  /** `xcode-select -p`, or null when it fails (no developer directory is selected). */
  developerDir: () => string | null;
};

const HOMEBREW = ['/opt/homebrew/bin/git', '/usr/local/bin/git'];

export function resolveSystemGit(probe: GitProbe): GitBinary {
  const explicit = probe.env['MIDNITE_GIT'];
  if (explicit && probe.exists(explicit)) return { path: explicit };
  for (const candidate of HOMEBREW) if (probe.exists(candidate)) return { path: candidate };
  const dir = probe.developerDir();
  if (dir) {
    const git = join(dir, 'usr', 'bin', 'git');
    if (probe.exists(git)) return { path: git };
  }
  return { path: null, reason: NO_GIT };
}

const SYSTEM_PROBE: GitProbe = {
  env: process.env,
  exists: existsSync,
  developerDir: () => {
    try {
      const out = execFileSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8', timeout: 2000 }).trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  },
};

let cached: GitBinary | undefined;
/** Resolved once per process: installing the tools mid-session takes a relaunch, as with any app. */
export function systemGit(): GitBinary {
  return (cached ??= resolveSystemGit(SYSTEM_PROBE));
}

/** The subset of dugite's `IGitExecutionOptions` git-engine passes. */
type ExecOptions = {
  env?: Record<string, string | undefined>;
  stdin?: string;
  maxBuffer?: number;
  processCallback?: (process: ChildProcess) => void;
};

type ExecResult = { stdout: string; stderr: string; exitCode: number };

/** No git: a child that prints the reason on stderr and exits 128, so a streaming read ends with it. */
function spawnNoGit(reason: string): ChildProcess {
  return spawn('/bin/sh', ['-c', 'printf "%s\\n" "$0" >&2; exit 128', reason]);
}

function exec(args: string[], path: string, options: ExecOptions = {}): Promise<ExecResult> {
  const git = systemGit();
  if (git.path === null) return Promise.resolve({ stdout: '', stderr: git.reason, exitCode: 128 });
  const binary = git.path;
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: path, env: { ...process.env, ...options.env } });
    const limit = options.maxBuffer ?? 10 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let overflow = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > limit && !overflow) {
        overflow = true;
        child.kill();
      }
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < limit) stderr += chunk;
    });
    // A missing `cwd` or binary rejects, exactly as dugite does; git-exec turns it into an exit of -1.
    child.on('error', reject);
    child.on('close', (code) => {
      if (overflow) reject(new Error(`git ${args[0] ?? ''}: output exceeded maxBuffer (${limit} bytes)`));
      else resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    options.processCallback?.(child);
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

function spawnGit(args: string[], path: string, options: { env?: Record<string, string | undefined> } = {}): ChildProcess {
  const git = systemGit();
  if (git.path === null) return spawnNoGit(git.reason);
  return spawn(git.path, args, { cwd: path, env: { ...process.env, ...options.env } });
}

/** dugite's `GitProcess`, as far as git-engine uses it. */
export const GitProcess = { exec, spawn: spawnGit };
