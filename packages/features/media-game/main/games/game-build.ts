import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  failure,
  GAME_BUILD_TAIL_LINES,
  GAME_BUILD_TIMEOUT_MS,
  ok,
  type GitOpResult,
} from '@midnite/studio-shared';
import { ensureLoginShellPathAsync, joinWithin, scrubHostAgentEnv } from '@midnite/studio-runtime';

/**
 * Build a bundled game (Phase 149 Theme E): run `manifest.build.command` in the repo so `build.out` is
 * fresh before the runner loads it. It never installs anything — a missing `node_modules` is a hint,
 * not an `npm install`.
 */

export type GameBuildSpec = { command: string; out: string };

export const BUILD_OUTSIDE_MESSAGE = 'Build output is outside the game.';

/** The folder a game is served and exported from: `build.out` inside the repo, or the repo itself. `null` when `out` escapes. */
export function gameServeRoot(root: string, build: GameBuildSpec | null | undefined): string | null {
  return build ? joinWithin(root, build.out) : root;
}

export type RunGameBuildOptions = {
  timeoutMs?: number;
  /** Fold the login shell's PATH into `process.env` before spawning. Tests pass a no-op. */
  resolvePath?: () => Promise<void>;
};

let pathReady: Promise<void> | null = null;
const loginPathOnce = (): Promise<void> => (pathReady ??= ensureLoginShellPathAsync().catch(() => undefined));

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

function killTree(child: ChildProcess): void {
  try {
    // Detached, so the shell leads its own process group: the build's children die with it.
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/**
 * Run the build, streaming each output line to `onLine`. Resolves with the elapsed ms; a non-zero exit,
 * a timeout, an abort or a refusal is a `failure` whose `stderr` carries the last lines of output.
 */
export async function runGameBuild(
  root: string,
  build: GameBuildSpec,
  onLine: (line: string) => void,
  signal: AbortSignal,
  options: RunGameBuildOptions = {},
): Promise<GitOpResult<{ ms: number }>> {
  const timeoutMs = options.timeoutMs ?? GAME_BUILD_TIMEOUT_MS;
  if (signal.aborted) return failure('Build cancelled.');
  if ((await exists(join(root, 'package.json'))) && !(await exists(join(root, 'node_modules')))) {
    const hint = `Run your package manager's install in ${root} first.`;
    onLine(hint);
    return failure('Dependencies are not installed.', hint);
  }
  await (options.resolvePath ?? loginPathOnce)();
  if (signal.aborted) return failure('Build cancelled.');

  const startedAt = Date.now();
  const tail: string[] = [];
  const push = (line: string): void => {
    tail.push(line);
    if (tail.length > GAME_BUILD_TAIL_LINES) tail.shift();
    onLine(line);
  };

  return new Promise((resolve) => {
    const child = spawn(build.command, {
      shell: true,
      cwd: root,
      env: scrubHostAgentEnv({ ...process.env }),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let settled = false;
    let reason: string | null = null;
    const finish = (result: GitOpResult<{ ms: number }>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const stop = (why: string): void => {
      reason = why;
      killTree(child);
    };
    const timer = setTimeout(() => stop('Build took longer than 5 minutes.'), timeoutMs);
    const onAbort = (): void => stop('Build cancelled.');
    signal.addEventListener('abort', onAbort, { once: true });

    for (const stream of [child.stdout, child.stderr]) {
      let pending = '';
      stream?.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) if (line !== '') push(line);
      });
      stream?.on('end', () => {
        if (pending !== '') push(pending);
        pending = '';
      });
    }
    child.on('error', (error) => finish(failure(`Could not start the build: ${error.message}`)));
    child.on('close', (code) => {
      if (reason !== null) return finish(failure(reason, tail.join('\n')));
      if (code === 0) return finish(ok({ ms: Date.now() - startedAt }));
      finish(failure(`Build failed (exit ${code ?? 'unknown'}).`, tail.join('\n')));
    });
  });
}
