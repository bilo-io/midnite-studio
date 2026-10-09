import { join } from 'node:path';

import { DEFAULT_VIDEO_ENGINE, type VideoEngine, type VideoStudioStatus } from '@midnite/studio-shared';

import { realSpawn, type SpawnFn, type SpawnedProcess } from '../process-runner';

/**
 * Hosting one `remotion studio` dev server per project — the timeline editor
 * this phase does not have to build, because Remotion already did.
 *
 * Owns a `Map<projectId, ChildProcess>` the way
 * [`browser-service.ts`](../browser-service.ts) owns its tab map and
 * `pty-service.ts` owns its ptys: starting a studio that is already running
 * for that project returns the running one rather than spawning a second, and
 * every child this module owns is expected to be killed on `before-quit` and
 * on project removal — by {@link stopAllStudios}, called from wherever Theme H
 * wires it, the same way `browser-service.ts`'s teardown is called from
 * `main/index.ts` rather than from inside itself.
 *
 * Unlike `process-runner.ts`'s `runProcess`, this reaches for `realSpawn`
 * directly rather than the full timeout-bounded orchestration: a dev server
 * has no natural end, so there is no deadline to enforce, only a stop.
 */

/** `remotion studio --no-open` never has a shell surface a user's input can
 *  reach, so an argv vector is enough — no quoting concerns here. */
const STUDIO_ARGS = ['remotion', 'studio', '--no-open'];

/** HyperFrames' CLI reports anonymous usage unless told not to; this app never opts a user in. */
export const HYPERFRAMES_ENV = { DO_NOT_TRACK: '1' } as const;

export type StudioCommand = {
  command: string;
  args: string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
};

/**
 * The argv for one project's studio, per engine (Phase 99 Theme H).
 *
 * - **Remotion**: one `remotion studio` in the editor app serves every
 *   composition, deep-linked by URL.
 * - **HyperFrames**: a studio is *one project's directory* —
 *   `hyperframes preview projects/<id>` from the editor app. `--foreground`
 *   keeps it attached (it detaches itself in a non-TTY otherwise, which would
 *   orphan it from the kill this module owns), and a busy default port is
 *   handled by the CLI itself (it picks the next one and prints it).
 */
export function buildStudioCommand(input: {
  engine: VideoEngine;
  appDir: string;
  projectId: string;
}): StudioCommand {
  if (input.engine === 'hyperframes') {
    return {
      command: 'npx',
      args: ['hyperframes', 'preview', join('projects', input.projectId), '--no-open', '--foreground'],
      cwd: input.appDir,
      env: HYPERFRAMES_ENV,
    };
  }
  return { command: 'npx', args: STUDIO_ARGS, cwd: input.appDir };
}

/** The URL Remotion's own `printServerReadyComment` writes to stdout once the
 *  dev server is actually listening — see `start-studio.js`'s
 *  `Server ready - Local: http://localhost:<port>, …`. Matched directly
 *  against the resolved port rather than assumed to be 3000: Remotion picks
 *  the next free one when 3000 is taken, and a machine already running a
 *  studio or an unrelated dev server on it is the normal case. */
const STUDIO_URL_PATTERN = /https?:\/\/localhost:\d+/;

/** HyperFrames prints `Studio    http://localhost:3002/#project/<name>` — the
 *  hash selects the project, so the whole URL is kept, not just the origin. */
const HYPERFRAMES_URL_PATTERN = /Studio\s+(https?:\/\/localhost:\d+\S*)/;

/** Pure so the "which line in a chatty stdout is the real answer" question is
 *  reviewable against captured output rather than a live process. */
export function parseStudioUrl(output: string, engine: VideoEngine = DEFAULT_VIDEO_ENGINE): string | null {
  if (engine === 'hyperframes') return HYPERFRAMES_URL_PATTERN.exec(output)?.[1] ?? null;
  return STUDIO_URL_PATTERN.exec(output)?.[0] ?? null;
}

/** Last stderr lines only — Theme C's own rule: "a dev server that dies
 *  silently is the single most confusing failure this feature can have." */
const STDERR_TAIL_LINES = 20;
/** Bounds the raw buffer a long-lived dev server can otherwise grow forever —
 *  only the tail is ever read, so nothing before it needs to be kept. */
const STDERR_BUFFER_CAP = 20_000;

type Tracked = {
  /** Absent once the child has closed or failed to spawn at all — `status`
   *  is what stays queryable; there is nothing left to kill. */
  child?: SpawnedProcess;
  status: VideoStudioStatus;
};

const studios = new Map<string, Tracked>();

export type StudioDeps = {
  spawn: SpawnFn;
  /** Phase 99 Theme H — absent = Remotion, exactly as before the engine choice. */
  engine: VideoEngine;
  onStatus: (projectId: string, status: VideoStudioStatus) => void;
};

const REAL: Pick<StudioDeps, 'spawn' | 'engine'> = { spawn: realSpawn, engine: DEFAULT_VIDEO_ENGINE };

function setStatus(projectId: string, status: VideoStudioStatus, onStatus: StudioDeps['onStatus']): void {
  const tracked = studios.get(projectId);
  if (tracked) tracked.status = status;
  onStatus(projectId, status);
}

export function getStudioStatus(projectId: string): VideoStudioStatus {
  return studios.get(projectId)?.status ?? { state: 'stopped' };
}

/**
 * Start (or return) the studio for one project.
 *
 * `cwd` is the engine's editor app directory, resolved by the caller — this
 * module has no opinion on where projects live on disk, only on owning at most
 * one child per `projectId` once it is told to start one.
 */
export function startStudio(projectId: string, cwd: string, deps: Partial<StudioDeps> & Pick<StudioDeps, 'onStatus'>): void {
  const { spawn, onStatus, engine } = { ...REAL, ...deps };
  const existing = studios.get(projectId);
  if (existing && (existing.status.state === 'starting' || existing.status.state === 'running')) {
    // Already active: report the current state, spawn nothing. A `failed` or
    // absent entry falls through below instead — that is what makes a failed
    // studio restartable rather than stuck reporting its old failure forever.
    onStatus(projectId, existing.status);
    return;
  }

  let child: SpawnedProcess;
  try {
    const target = buildStudioCommand({ engine, appDir: cwd, projectId });
    child = target.env
      ? spawn(target.command, target.args, target.cwd, target.env)
      : spawn(target.command, target.args, target.cwd);
  } catch (error) {
    studios.set(projectId, { status: { state: 'failed', stderr: [describeSpawnError(error)] } });
    onStatus(projectId, studios.get(projectId)!.status);
    return;
  }

  studios.set(projectId, { child, status: { state: 'starting' } });
  onStatus(projectId, { state: 'starting' });

  let buffer = '';
  let stderrBuffer = '';
  let stderrTail: string[] = [];
  let resolved = false;

  child.onStdout((chunk) => {
    if (resolved) return;
    buffer += chunk;
    const url = parseStudioUrl(buffer, engine);
    if (url) {
      resolved = true;
      setStatus(projectId, { state: 'running', url }, onStatus);
    }
  });

  child.onStderr((chunk) => {
    stderrBuffer = (stderrBuffer + chunk).slice(-STDERR_BUFFER_CAP);
    stderrTail = stderrBuffer.split('\n').filter((line) => line.length > 0).slice(-STDERR_TAIL_LINES);
  });

  child.onError((error) => {
    resolved = true;
    setStatus(projectId, { state: 'failed', stderr: [describeSpawnError(error)] }, onStatus);
  });

  child.onClose(() => {
    // An explicit `stopStudio` already deleted this project's entry before
    // killing the child, so the `close` that follows lands on a map with
    // nothing left to update — a deliberate stop is not a failure to report.
    if (!studios.has(projectId)) return;
    setStatus(projectId, { state: 'failed', stderr: stderrTail }, onStatus);
  });
}

function describeSpawnError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' ? 'npx was not found on PATH.' : 'The studio process could not be started.';
}

/** Idempotent — stopping a project with no tracked (or already-dead) studio is a no-op. */
export function stopStudio(projectId: string): void {
  const tracked = studios.get(projectId);
  if (!tracked?.child) return;
  studios.delete(projectId);
  tracked.child.kill();
}

/** Every studio, by process group — called from wherever `before-quit` and
 *  project-removal are wired (Theme H), never from inside this module. */
export function stopAllStudios(): void {
  for (const projectId of [...studios.keys()]) stopStudio(projectId);
}

/** Tests only — the module-level map otherwise carries state across cases. */
export function resetVideoStudioState(): void {
  studios.clear();
}
