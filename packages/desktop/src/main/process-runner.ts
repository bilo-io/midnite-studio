import { spawn as nodeSpawn } from 'node:child_process';

/**
 * Spawning a program that belongs to the checkout rather than to us — the
 * shared engine behind both `diagnostics/runner.ts` (a repo's linter) and
 * `testing/runner.ts` (a repo's test suite).
 *
 * Generalised out of `diagnostics/runner.ts` once a second caller needed the
 * same three properties, exactly as the phase 19 doc calls for: an argument
 * vector with no shell anywhere in it, a deadline enforced by our own timer
 * and `SIGKILL`, and nothing inherited that changes behaviour. See
 * `diagnostics/runner.ts`'s original docblock for the full reasoning — it
 * still applies verbatim; only the parsing of *what* the child said is left to
 * each caller's own sink.
 *
 * One addition over the original: the child is spawned `detached`, in its own
 * process group, and the kill signals the *group* (`process.kill(-pid, …)`)
 * rather than the child alone. A test runner routinely spawns workers of its
 * own (vitest's pool, playwright's browser processes) and a single-child kill
 * leaves every one of them running past Cancel — the diagnostics linter never
 * had grandchildren to worry about, but this engine now serves one that does.
 */

/** Enough stderr/stdout to explain a failure, not enough to matter if it is a firehose. */
export const OUTPUT_TAIL_CAP = 200_000;

export type SpawnedProcess = {
  onStdout: (handler: (chunk: string) => void) => void;
  onStderr: (handler: (chunk: string) => void) => void;
  /** Spawn failed outright — ENOENT for a binary that has been removed. */
  onError: (handler: (error: NodeJS.ErrnoException) => void) => void;
  onClose: (handler: (code: number | null) => void) => void;
  /** Kills the whole process group, not just this one process. */
  kill: () => void;
};

export type SpawnFn = (
  command: string,
  args: readonly string[],
  cwd: string,
) => SpawnedProcess;

/** The real thing: `spawn` with everything that could change behaviour pinned. */
export const realSpawn: SpawnFn = (command, args, cwd) => {
  const child = nodeSpawn(command, [...args], {
    cwd,
    env: {
      ...process.env,
      // Colour codes would land inside a JSON payload a sink is trying to parse.
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
    // Its own process group, so `kill` below can reach every process it spawns
    // rather than only the one Node started directly.
    detached: process.platform !== 'win32',
  });

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  return {
    onStdout: (handler) => child.stdout?.on('data', handler),
    onStderr: (handler) => child.stderr?.on('data', handler),
    onError: (handler) => child.on('error', handler),
    onClose: (handler) => child.on('close', handler),
    kill: () => {
      if (process.platform !== 'win32' && typeof child.pid === 'number') {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch {
          // ESRCH (already gone) or a platform that refused the group signal —
          // fall through to the direct kill below either way.
        }
      }
      child.kill('SIGKILL');
    },
  };
};

/** What a sink hands back once the child has closed and its output is fully read. */
export type SinkOutcome<T> = { ok: true; data: T } | { ok: false; hint: string };

/** Incremental parse over a child's stdout, total by construction. */
export type ProcessSink<T> = {
  push: (chunk: string) => void;
  finish: () => SinkOutcome<T>;
};

export type ProcessRunReason = 'not-installed' | 'timed-out' | 'parse-failed';

export type ProcessOutcome<T> =
  | { ok: true; data: T; stderr: string; exitCode: number | null; ranAt: number; durationMs: number }
  | { ok: false; reason: ProcessRunReason; hint: string };

export type RunProcessDeps<T> = {
  spawn?: SpawnFn;
  now?: () => number;
  timeoutMs?: number;
  sink: ProcessSink<T>;
  /** Called with every stdout chunk as it arrives — for a live output stream. */
  onChunk?: (chunk: string) => void;
  /** Called once, right after a successful spawn — the caller's hook for cancellation. */
  onSpawned?: (handle: { kill: () => void }) => void;
};

/** Two minutes — long enough for a cold run over a real monorepo, short enough
 *  that a wedged process is not still holding a slot when the user has moved on. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Run one trusted command in one working directory.
 *
 * Never rejects. Every outcome — a missing binary, a wedged process, output
 * the sink could not read — resolves to a {@link ProcessOutcome} the caller
 * renders. The parsing is entirely the sink's: this module knows nothing about
 * eslint's JSON, vitest's reporter, or anything else that might be running.
 */
export function runProcess<T>(
  command: string,
  args: readonly string[],
  cwd: string,
  deps: RunProcessDeps<T>,
): Promise<ProcessOutcome<T>> {
  const spawn = deps.spawn ?? realSpawn;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sink = deps.sink;

  return new Promise<ProcessOutcome<T>>((resolvePromise) => {
    const startedAt = now();

    let stderr = '';
    let settled = false;
    // Declared before `settle` because `spawn` can throw synchronously, which
    // settles the promise before the deadline timer has been created.
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    const settle = (result: ProcessOutcome<T>): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolvePromise(result);
    };

    let child: SpawnedProcess;
    try {
      child = spawn(command, args, cwd);
    } catch (error) {
      // `spawn` can throw synchronously (an invalid cwd, for one) rather than
      // emitting 'error'. Both paths have to reach the same reason code.
      return settle(notInstalled(error));
    }

    deps.onSpawned?.({ kill: () => child.kill() });

    timer = setTimeout(() => {
      child.kill();
      settle({
        ok: false,
        reason: 'timed-out',
        hint: `The command did not finish within ${Math.round(timeoutMs / 1000)}s.`,
      });
    }, timeoutMs);

    child.onStdout((chunk) => {
      sink.push(chunk);
      deps.onChunk?.(chunk);
    });

    child.onStderr((chunk) => {
      stderr = (stderr + chunk).slice(-OUTPUT_TAIL_CAP);
      deps.onChunk?.(chunk);
    });

    child.onError((error) => settle(notInstalled(error)));

    child.onClose((exitCode) => {
      const parsed = sink.finish();
      if (!parsed.ok) {
        // stderr, one line, when the tool said anything at all — usually more
        // useful than the sink's own generic "could not parse" hint.
        return settle({ ok: false, reason: 'parse-failed', hint: firstLine(stderr) || parsed.hint });
      }
      settle({
        ok: true,
        data: parsed.data,
        stderr,
        exitCode,
        ranAt: now(),
        durationMs: Math.max(0, now() - startedAt),
      });
    });
  });
}

function notInstalled(error: unknown): ProcessOutcome<never> {
  return {
    ok: false,
    reason: 'not-installed',
    hint:
      (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
        ? 'The command is no longer on disk. Re-detect to pick it up again.'
        : 'The command could not be started.',
  };
}

/** One sentence for the UI — never a stack trace, never a wall of output. */
export function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 200) : '';
}
