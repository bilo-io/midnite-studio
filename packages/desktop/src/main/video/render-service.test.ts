import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpawnFn, SpawnedProcess } from '../process-runner';
import {
  buildRenderCommand,
  cancelRender,
  killAllRenders,
  listRenders,
  nextRenderVersion,
  parseRenderProgress,
  queueRender,
  resetVideoRenderState,
} from './render-service';

function fakeChild() {
  const handlers: {
    stdout: ((c: string) => void)[];
    stderr: ((c: string) => void)[];
    error: ((e: NodeJS.ErrnoException) => void)[];
    close: ((c: number | null) => void)[];
  } = { stdout: [], stderr: [], error: [], close: [] };
  const kill = vi.fn();
  const process: SpawnedProcess = {
    onStdout: (h) => handlers.stdout.push(h),
    onStderr: (h) => handlers.stderr.push(h),
    onError: (h) => handlers.error.push(h),
    onClose: (h) => handlers.close.push(h),
    kill,
  };
  return {
    process,
    kill,
    stdout: (c: string) => handlers.stdout.forEach((h) => h(c)),
    close: (code: number | null = 0) => handlers.close.forEach((h) => h(code)),
  };
}

describe('buildRenderCommand', () => {
  const base = {
    rootDir: '/root',
    appDir: '/root/video-editor',
    projectId: '01-cop31-showreel',
    compositionId: 'COP31Showreel',
    outputDir: '/root/projects/01-cop31-showreel/output',
    existingOutputFiles: [],
  };

  it('prefers the project wrapper when it exists', () => {
    const target = buildRenderCommand({ ...base, hasWrapper: true, label: 'client-notes' });
    expect(target).toEqual({
      command: 'node',
      args: ['scripts/render.mjs', '01-cop31-showreel', 'client-notes'],
      cwd: '/root',
    });
  });

  it('omits the label argument entirely when none was given', () => {
    const target = buildRenderCommand({ ...base, hasWrapper: true });
    expect(target.args).toEqual(['scripts/render.mjs', '01-cop31-showreel']);
  });

  it('falls back to the raw Remotion CLI, in the app dir, with an explicit out path', () => {
    const target = buildRenderCommand({ ...base, hasWrapper: false, existingOutputFiles: ['v1.mp4'] });
    expect(target).toEqual({
      command: 'npx',
      args: ['remotion', 'render', 'COP31Showreel', '/root/projects/01-cop31-showreel/output/v2.mp4'],
      cwd: '/root/video-editor',
    });
  });
});

describe('nextRenderVersion', () => {
  it('starts at v1 for an empty output directory', () => {
    expect(nextRenderVersion([])).toBe('v1');
  });

  it('increments past the highest existing version, ignoring labels', () => {
    expect(nextRenderVersion(['v1.mp4', 'v2-client-notes.mp4', 'v3.mp4'])).toBe('v4');
  });

  it('ignores files that are not version-prefixed', () => {
    expect(nextRenderVersion(['CHANGELOG.md', 'v2.mp4'])).toBe('v3');
  });
});

describe('parseRenderProgress', () => {
  it('is undefined while only bundling has printed', () => {
    expect(parseRenderProgress('Bundled code         ━━━━━━━━━━ 2314ms')).toBeUndefined();
  });

  it('weights rendering as 70% of the whole when no stitching line has appeared yet', () => {
    const buffer = 'Rendering frames     ━━━━░░░░░░           42/100 1m remaining';
    expect(parseRenderProgress(buffer)).toBeCloseTo(0.42 * 0.7, 5);
  });

  it('combines rendering and encoding at the 70/30 split render-media.js itself uses', () => {
    const buffer = [
      'Rendered frames      ━━━━━━━━━━━━━━━━━━ 4102ms',
      'Encoding video        ━━━━━━━━░░░░       30/100',
    ].join('\n');
    expect(parseRenderProgress(buffer)).toBeCloseTo(1 * 0.7 + 0.3 * 0.3, 5);
  });

  it('reads 100% once both stages report done, even with no fraction printed', () => {
    const buffer = [
      'Rendered frames      ━━━━━━━━━━━━━━━━━━ 4102ms',
      'Encoded video         ━━━━━━━━━━━━━━━━━━ 512ms',
    ].join('\n');
    expect(parseRenderProgress(buffer)).toBeCloseTo(1, 5);
  });

  it('takes the most recently printed fraction, not the first', () => {
    const buffer = [
      'Rendering frames     ━━░░░░░░░░           10/100',
      'Rendering frames     ━━━━━━░░░░           60/100',
    ].join('\n');
    expect(parseRenderProgress(buffer)).toBeCloseTo(0.6 * 0.7, 5);
  });
});

describe('queueRender / cancelRender', () => {
  beforeEach(() => {
    resetVideoRenderState();
  });

  const target = { command: 'npx', args: ['remotion', 'render', 'C', 'out.mp4'], cwd: '/app' };

  it('spawns the target command immediately when the project queue is empty', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    queueRender({ renderId: 'r1', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress: vi.fn() });
    expect(spawn).toHaveBeenCalledWith('npx', ['remotion', 'render', 'C', 'out.mp4'], '/app');
    expect(listRenders('p1')[0]).toMatchObject({ id: 'r1', status: 'rendering' });
  });

  it('queues a second render on the same project rather than running it concurrently', () => {
    const childA = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => childA.process);
    const onProgress = vi.fn();
    queueRender({ renderId: 'r1', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    queueRender({ renderId: 'r2', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(listRenders('p1').find((r) => r.id === 'r2')).toMatchObject({ status: 'queued' });
  });

  it('starts the next queued render once the running one closes', async () => {
    const childA = fakeChild();
    const childB = fakeChild();
    const spawn = vi.fn<SpawnFn>().mockReturnValueOnce(childA.process).mockReturnValueOnce(childB.process);
    const onProgress = vi.fn();
    queueRender({ renderId: 'r1', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    queueRender({ renderId: 'r2', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    childA.close(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(listRenders('p1').find((r) => r.id === 'r1')).toMatchObject({ status: 'succeeded' });
  });

  it('marks a render failed on a non-zero exit', async () => {
    const child = fakeChild();
    const onProgress = vi.fn();
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn: () => child.process, onProgress },
    );
    child.close(1);
    await Promise.resolve();
    expect(listRenders('p1')[0]).toMatchObject({ status: 'failed' });
  });

  it('kills the running process and marks the render cancelled, not failed', async () => {
    const child = fakeChild();
    const onProgress = vi.fn();
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn: () => child.process, onProgress },
    );
    cancelRender('r1', { onProgress });
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.close(null);
    await Promise.resolve();
    expect(listRenders('p1')[0]).toMatchObject({ status: 'cancelled' });
  });

  it('drops a merely-queued render without ever spawning it', () => {
    const childA = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => childA.process);
    const onProgress = vi.fn();
    queueRender({ renderId: 'r1', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    queueRender({ renderId: 'r2', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress });
    cancelRender('r2', { onProgress });
    expect(listRenders('p1').find((r) => r.id === 'r2')).toMatchObject({ status: 'cancelled' });
    childA.close(0);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('killAllRenders kills every currently running child', () => {
    const childA = fakeChild();
    const childB = fakeChild();
    const spawn = vi.fn<SpawnFn>().mockReturnValueOnce(childA.process).mockReturnValueOnce(childB.process);
    queueRender({ renderId: 'r1', projectId: 'p1', compositionId: 'C', target }, { spawn, onProgress: vi.fn() });
    queueRender({ renderId: 'r2', projectId: 'p2', compositionId: 'C', target }, { spawn, onProgress: vi.fn() });
    killAllRenders();
    expect(childA.kill).toHaveBeenCalledTimes(1);
    expect(childB.kill).toHaveBeenCalledTimes(1);
  });
});
