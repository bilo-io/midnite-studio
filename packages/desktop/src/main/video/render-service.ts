import { join } from 'node:path';

import type { VideoRender, VideoRenderProgressEvent } from '@midnite/studio-shared';

import { firstLine, runProcess, type ProcessSink, type RunProcessDeps, type SpawnFn } from '../process-runner';

/**
 * Running a video render — the second long-lived, cancellable job this app
 * spawns outside the pty (a test run and a render are "the same shape of
 * job": an argument vector, a working directory, a deadline, and a process
 * group `kill` reaching everything Chrome spawns underneath). Rides
 * `process-runner.ts`'s `runProcess` exactly as `testing/runner.ts` does —
 * writing a fresh `spawn` here is the mistake Theme E's own doc names.
 *
 * "A render is queued per project — one at a time" (Theme E): two concurrent
 * headless-Chrome renders on a laptop is how the app feels broken, so this
 * module keeps one FIFO queue per `projectId` and only ever has one child
 * running for a given project, while different projects render freely in
 * parallel.
 */

/**
 * Real renders run minutes, not seconds — long enough that `runProcess`'s own
 * 120s default would kill a normal render as "timed out". Bounded rather than
 * unbounded so a wedged headless Chrome cannot hold a project's queue forever.
 */
export const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

/** Only the tail is ever read back out, so the live buffer is capped the same
 *  way `process-runner.ts` caps stderr. */
const PROGRESS_BUFFER_CAP = 20_000;

export type RenderTarget = { command: string; args: string[]; cwd: string };

/**
 * The wrapper knows the output convention (`vN-<label>.mp4`) and appends the
 * changelog stub — prefer it. The fallback reconstructs just enough of that
 * convention to produce a sane path when no wrapper exists.
 */
export function buildRenderCommand(input: {
  /** Video root — cwd for the project's own `scripts/render.mjs`. */
  rootDir: string;
  /** The Remotion app's own directory — cwd for the raw CLI fallback. */
  appDir: string;
  hasWrapper: boolean;
  projectId: string;
  compositionId: string;
  label?: string;
  /** Absolute `<project>/output` directory, for the fallback's explicit out path. */
  outputDir: string;
  /** Filenames already in `<project>/output/`, for the fallback's version numbering. */
  existingOutputFiles: readonly string[];
}): RenderTarget {
  if (input.hasWrapper) {
    const args = ['scripts/render.mjs', input.projectId, ...(input.label ? [input.label] : [])];
    return { command: 'node', args, cwd: input.rootDir };
  }
  const version = nextRenderVersion(input.existingOutputFiles);
  const name = `${version}${input.label ? `-${input.label}` : ''}.mp4`;
  return {
    command: 'npx',
    args: ['remotion', 'render', input.compositionId, join(input.outputDir, name)],
    cwd: input.appDir,
  };
}

/** Mirrors `ekko-videos/scripts/render.mjs`'s own increment exactly, so a
 *  fallback render lands the same `vN` a wrapper-produced one would have. */
export function nextRenderVersion(existingOutputFiles: readonly string[]): string {
  const next =
    1 +
    existingOutputFiles
      .map((name) => /^v(\d+)/.exec(name)?.[1])
      .filter((match): match is string => match !== undefined)
      .reduce((max, n) => Math.max(max, Number(n)), 0);
  return `v${next}`;
}

/**
 * One frame-counted stage's fraction, out of Remotion's own CLI text —
 * `progress-bar.js`'s `makeRenderingProgress`/`makeStitchingProgress`, run
 * through a piped (non-TTY) stdout, which is why the label is `Rendering`
 * (not yet done) or `Rendered` (done, `N/M` no longer printed at all — only
 * an elapsed-ms) rather than an overwritten ANSI progress bar.
 */
function stageFraction(buffer: string, workingLabel: string, doneLabel: string): number | undefined {
  let fraction: number | undefined;
  for (const rawLine of buffer.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith(doneLabel)) {
      fraction = 1;
    } else if (line.startsWith(workingLabel)) {
      const match = /(\d+)\/(\d+)/.exec(line);
      const total = match ? Number(match[2]) : 0;
      if (match && total > 0) fraction = Number(match[1]) / total;
    }
  }
  return fraction;
}

/**
 * Overall progress as one fraction, matching `@remotion/renderer`'s own
 * internal weighting of the same two stages (`render-media.js`:
 * `(70 * renderedFrames + 30 * encoded) / totalFrames`) — rendering is the
 * expensive 70%, encoding the remaining 30%. `undefined` until the rendering
 * stage has printed its first fraction: a bundling-only buffer is "working",
 * not a number worth a channel push.
 */
export function parseRenderProgress(buffer: string): number | undefined {
  const rendering = stageFraction(buffer, 'Rendering frames', 'Rendered frames');
  if (rendering === undefined) return undefined;
  const stitching =
    stageFraction(buffer, 'Encoding video', 'Encoded video') ??
    stageFraction(buffer, 'Muxing video', 'Muxed video') ??
    stageFraction(buffer, 'Encoding audio', 'Encoded audio') ??
    stageFraction(buffer, 'Encoding GIF', 'Encoded GIF');
  const combined = stitching === undefined ? rendering * 0.7 : rendering * 0.7 + stitching * 0.3;
  return Math.min(1, Math.max(0, combined));
}

function bufferSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer += chunk;
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

const records = new Map<string, VideoRender>();
/** Pending + running render ids per project, front of the array is running. */
const queues = new Map<string, string[]>();
const killers = new Map<string, () => void>();
const cancelled = new Set<string>();

export type RenderDeps = { spawn?: SpawnFn; now?: () => number; onProgress: (event: VideoRenderProgressEvent) => void };

export function listRenders(projectId?: string): VideoRender[] {
  const all = [...records.values()];
  return projectId === undefined ? all : all.filter((r) => r.projectId === projectId);
}

/** Enqueues a render; starts it immediately if its project's queue was empty. */
export function queueRender(
  input: { renderId: string; projectId: string; compositionId: string; target: RenderTarget },
  deps: RenderDeps,
): VideoRender {
  const now = deps.now ?? Date.now;
  const record: VideoRender = {
    id: input.renderId,
    projectId: input.projectId,
    compositionId: input.compositionId,
    status: 'queued',
    startedAt: now(),
  };
  records.set(input.renderId, record);

  const queue = queues.get(input.projectId) ?? [];
  queue.push(input.renderId);
  queues.set(input.projectId, queue);

  if (queue.length === 1) void runNext(input.projectId, input.target, deps);
  else deps.onProgress({ renderId: input.renderId, projectId: input.projectId, status: 'queued' });

  return record;
}

async function runNext(projectId: string, target: RenderTarget, deps: RenderDeps): Promise<void> {
  const queue = queues.get(projectId);
  const renderId = queue?.[0];
  if (!queue || renderId === undefined) return;
  const now = deps.now ?? Date.now;

  const record = records.get(renderId);
  if (!record) {
    queue.shift();
    return void runNext(projectId, target, deps);
  }

  record.status = 'rendering';
  deps.onProgress({ renderId, projectId, status: 'rendering' });

  let progressBuffer = '';
  let lastReported: number | undefined;
  const runDeps: RunProcessDeps<string> = {
    sink: bufferSink(),
    timeoutMs: RENDER_TIMEOUT_MS,
    onChunk: (chunk) => {
      progressBuffer = (progressBuffer + chunk).slice(-PROGRESS_BUFFER_CAP);
      const progress = parseRenderProgress(progressBuffer);
      if (progress !== undefined && progress !== lastReported) {
        lastReported = progress;
        deps.onProgress({ renderId, projectId, status: 'rendering', progress });
      }
    },
    onSpawned: (handle) => killers.set(renderId, handle.kill),
  };
  if (deps.spawn !== undefined) runDeps.spawn = deps.spawn;
  if (deps.now !== undefined) runDeps.now = deps.now;

  const outcome = await runProcess(target.command, target.args, target.cwd, runDeps);
  killers.delete(renderId);

  const wasCancelled = cancelled.delete(renderId);
  record.endedAt = now();
  if (wasCancelled) {
    record.status = 'cancelled';
  } else if (!outcome.ok) {
    // `runProcess`'s `ok` means only "the sink could read the output" — this
    // sink never refuses, so this is `not-installed` or `timed-out`.
    record.status = 'failed';
    record.error = outcome.hint;
  } else if (outcome.exitCode === 0) {
    record.status = 'succeeded';
  } else {
    // A non-zero exit is a normal render failure, not a `runProcess` failure —
    // the sink happily buffered every byte either way.
    record.status = 'failed';
    record.error = firstLine(outcome.stderr) || `The render exited with code ${outcome.exitCode ?? 'unknown'}.`;
  }
  deps.onProgress({
    renderId,
    projectId,
    status: record.status,
    ...(record.status === 'succeeded' ? { progress: 1 } : {}),
  });

  queue.shift();
  void runNext(projectId, target, deps);
}

/**
 * Cancel a render — running (killed by process group) or merely queued
 * (dropped before it ever spawns). A render that already finished is a no-op:
 * there is nothing left to cancel.
 */
export function cancelRender(renderId: string, deps: Pick<RenderDeps, 'onProgress' | 'now'>): void {
  const record = records.get(renderId);
  if (!record || (record.status !== 'queued' && record.status !== 'rendering')) return;

  const kill = killers.get(renderId);
  if (kill) {
    cancelled.add(renderId);
    kill();
    return;
  }

  // Not yet running: drop it from whichever project queue holds it.
  const queue = queues.get(record.projectId);
  if (queue) queues.set(record.projectId, queue.filter((id) => id !== renderId));
  record.status = 'cancelled';
  record.endedAt = (deps.now ?? Date.now)();
  deps.onProgress({ renderId, projectId: record.projectId, status: 'cancelled' });
}

/** Every active render's process group — called from wherever `before-quit`
 *  is wired (Theme H), never from inside this module. */
export function killAllRenders(): void {
  for (const kill of killers.values()) kill();
}

/** Tests only — module-level maps otherwise carry state across test cases. */
export function resetVideoRenderState(): void {
  records.clear();
  queues.clear();
  killers.clear();
  cancelled.clear();
}
