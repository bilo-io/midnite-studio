import { spawn as nodeSpawn } from 'node:child_process';

import type { DiagnosticsCommand, DiagnosticsRun } from '@midnite/git-shared';

import { createEslintStream, type DiagnosticsSink } from './parse-eslint';

/**
 * Spawning a repository's own linter, on a deadline, into a streaming parser.
 *
 * Three properties matter more here than anywhere else in the app, because this
 * is the one place executing a binary that came with the repository:
 *
 * 1. **An argument vector, never a shell string.** `gh-cli.ts` runs through
 *    `$SHELL -lic` because a Homebrew-installed `gh` exists only on the PATH a
 *    login shell builds — it has to pay for quoting to get PATH resolution.
 *    Here the executable is an absolute path the detector already found on
 *    disk, so there is nothing to resolve and no reason to involve a shell.
 *    That removes shell metacharacters from the threat model entirely.
 * 2. **A deadline enforced by SIGKILL.** Not `SIGTERM`, and not the `timeout`
 *    option's default signal: a linter that has wedged is precisely the process
 *    that will ignore a polite one. The timer is ours rather than the child's
 *    so the reason code is set on the same code path that kills it.
 * 3. **Nothing inherited that changes behaviour.** `NO_COLOR=1` because escape
 *    codes would land inside the JSON, and stdin is `ignore` so a tool that
 *    decides to prompt gets EOF instead of hanging until the deadline.
 *
 * The child process API is injected so the whole of this — the deadline, the
 * kill, the reason codes — is unit-testable without a linter, a repository, or
 * a spawned process anywhere. The same split `repo-store.ts` makes for its
 * directory.
 */

/**
 * Two minutes.
 *
 * Long enough for a cold eslint over a real monorepo (a few thousand files with
 * type-aware rules is comfortably a minute), short enough that a wedged process
 * is not still holding a slot when the user has moved on. Runs are manual, so
 * this is never in anyone's way repeatedly.
 */
export const DIAGNOSTICS_TIMEOUT_MS = 120_000;

/** Enough stderr to explain a failure, not enough to matter if it is a firehose. */
const STDERR_TAIL_CAP = 4_000;

/** The slice of a child process this module uses. Injected in tests. */
export type SpawnedProcess = {
  onStdout: (handler: (chunk: string) => void) => void;
  onStderr: (handler: (chunk: string) => void) => void;
  /** Spawn failed outright — ENOENT for a binary that has been removed. */
  onError: (handler: (error: NodeJS.ErrnoException) => void) => void;
  onClose: (handler: (code: number | null) => void) => void;
  kill: () => void;
};

export type SpawnFn = (
  command: string,
  args: readonly string[],
  cwd: string,
) => SpawnedProcess;

export type RunnerDeps = {
  spawn?: SpawnFn;
  now?: () => number;
  timeoutMs?: number;
  rowCap?: number;
  /** Chosen by `parser`; injectable so the runner tests need no real format. */
  sink?: (workdir: string, rowCap?: number) => DiagnosticsSink;
};

/** The real thing: `spawn` with everything that could change behaviour pinned. */
export const realSpawn: SpawnFn = (command, args, cwd) => {
  const child = nodeSpawn(command, [...args], {
    cwd,
    env: {
      ...process.env,
      // Colour codes would land inside the JSON payload.
      NO_COLOR: '1',
      CLICOLOR: '0',
      FORCE_COLOR: '0',
    },
    // No stdin: a tool that decides to ask a question gets EOF rather than
    // blocking until the deadline kills it.
    stdio: ['ignore', 'pipe', 'pipe'],
    // Belt and braces against a shell sneaking in through a platform default.
    shell: false,
    windowsHide: true,
  });

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  return {
    onStdout: (handler) => child.stdout?.on('data', handler),
    onStderr: (handler) => child.stderr?.on('data', handler),
    onError: (handler) => child.on('error', handler),
    onClose: (handler) => child.on('close', handler),
    kill: () => child.kill('SIGKILL'),
  };
};

/** Pick the streaming parser for a command's declared format. */
function sinkFor(command: DiagnosticsCommand, workdir: string, rowCap?: number): DiagnosticsSink {
  switch (command.parser) {
    case 'eslint':
      return createEslintStream({ workdir, ...(rowCap === undefined ? {} : { rowCap }) });
  }
}

/**
 * Run one trusted command in one checkout.
 *
 * Never rejects. Every outcome — a missing binary, a wedged process, output
 * that is not what it claimed to be — is a `DiagnosticsRun` the footer renders.
 *
 * Trust is *not* checked here: this function does what it is told, and the
 * handler above it is what refuses to call it without a live grant. Keeping the
 * policy in one place beats a second, subtly different check in the mechanism.
 */
export function runDiagnostics(
  command: DiagnosticsCommand,
  workdir: string,
  deps: RunnerDeps = {},
): Promise<DiagnosticsRun> {
  const spawn = deps.spawn ?? realSpawn;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DIAGNOSTICS_TIMEOUT_MS;
  const makeSink = deps.sink ?? ((wd, cap) => sinkFor(command, wd, cap));

  return new Promise<DiagnosticsRun>((resolvePromise) => {
    const startedAt = now();
    const sink = makeSink(workdir, deps.rowCap);

    let stderr = '';
    let settled = false;
    // Declared before `settle` because `spawn` can throw synchronously, which
    // settles the promise before the deadline timer has been created.
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    const settle = (result: DiagnosticsRun): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolvePromise(result);
    };

    let child: SpawnedProcess;
    try {
      child = spawn(command.command, command.args, workdir);
    } catch (error) {
      // `spawn` can throw synchronously (an invalid cwd, for one) rather than
      // emitting 'error'. Both paths have to reach the same reason code.
      return settle(notInstalled(error));
    }

    timer = setTimeout(() => {
      child.kill();
      settle({
        ok: false,
        reason: 'timed-out',
        hint: `The command did not finish within ${Math.round(timeoutMs / 1000)}s.`,
      });
    }, timeoutMs);

    child.onStdout((chunk) => sink.push(chunk));

    child.onStderr((chunk) => {
      // Kept only to explain a failure. Truncated from the front so the most
      // recent complaint — usually the useful one — survives.
      stderr = (stderr + chunk).slice(-STDERR_TAIL_CAP);
    });

    child.onError((error) => settle(notInstalled(error)));

    child.onClose(() => {
      const parsed = sink.finish();
      if (!parsed.ok) {
        // Note what is deliberately absent: the exit code plays no part in
        // deciding success. eslint exits 1 whenever it found a single lint
        // error, which is the *normal* case for this feature — treating a
        // non-zero exit as failure would make a repo with problems report
        // nothing at all.
        return settle({
          ok: false,
          reason: 'parse-failed',
          hint: firstLine(stderr) || parsed.hint,
        });
      }

      settle({
        ok: true,
        errorCount: parsed.errorCount,
        warningCount: parsed.warningCount,
        rows: parsed.rows,
        withheld: parsed.withheld,
        ranAt: now(),
        durationMs: Math.max(0, now() - startedAt),
      });
    });
  });
}

const notInstalled = (error: unknown): DiagnosticsRun => ({
  ok: false,
  reason: 'not-installed',
  hint:
    (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
      ? 'The command is no longer on disk. Re-detect to pick it up again.'
      : 'The command could not be started.',
});

/** One sentence for the UI — never a stack trace, never a wall of output. */
function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 200) : '';
}
