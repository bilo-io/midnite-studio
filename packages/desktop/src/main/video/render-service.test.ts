import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpawnFn, SpawnedProcess } from '../process-runner';
import {
  buildRenderCommand,
  cancelRender,
  hyperframesCodecArgs,
  killAllRenders,
  listRenders,
  nextRenderVersion,
  parseHyperframesProgress,
  parseRenderProgress,
  queueRender,
  remotionCodecArgs,
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
    const target = buildRenderCommand({
      ...base,
      hasWrapper: false,
      existingOutputFiles: ['v1.mp4'],
    });
    expect(target).toEqual({
      command: 'npx',
      args: [
        'remotion',
        'render',
        'COP31Showreel',
        '/root/projects/01-cop31-showreel/output/v2.mp4',
      ],
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
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress: vi.fn() },
    );
    expect(spawn).toHaveBeenCalledWith('npx', ['remotion', 'render', 'C', 'out.mp4'], '/app');
    expect(listRenders('p1')[0]).toMatchObject({ id: 'r1', status: 'rendering' });
  });

  it('queues a second render on the same project rather than running it concurrently', () => {
    const childA = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => childA.process);
    const onProgress = vi.fn();
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
    queueRender(
      { renderId: 'r2', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(listRenders('p1').find((r) => r.id === 'r2')).toMatchObject({ status: 'queued' });
  });

  it('starts the next queued render once the running one closes', async () => {
    const childA = fakeChild();
    const childB = fakeChild();
    const spawn = vi
      .fn<SpawnFn>()
      .mockReturnValueOnce(childA.process)
      .mockReturnValueOnce(childB.process);
    const onProgress = vi.fn();
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
    queueRender(
      { renderId: 'r2', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
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
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
    queueRender(
      { renderId: 'r2', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress },
    );
    cancelRender('r2', { onProgress });
    expect(listRenders('p1').find((r) => r.id === 'r2')).toMatchObject({ status: 'cancelled' });
    childA.close(0);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('killAllRenders kills every currently running child', () => {
    const childA = fakeChild();
    const childB = fakeChild();
    const spawn = vi
      .fn<SpawnFn>()
      .mockReturnValueOnce(childA.process)
      .mockReturnValueOnce(childB.process);
    queueRender(
      { renderId: 'r1', projectId: 'p1', compositionId: 'C', target },
      { spawn, onProgress: vi.fn() },
    );
    queueRender(
      { renderId: 'r2', projectId: 'p2', compositionId: 'C', target },
      { spawn, onProgress: vi.fn() },
    );
    killAllRenders();
    expect(childA.kill).toHaveBeenCalledTimes(1);
    expect(childB.kill).toHaveBeenCalledTimes(1);
  });
});

describe('remotionCodecArgs — codec → argv (Phase 99 Theme D)', () => {
  it('h264 with no knobs adds nothing, so Phase 44 renders are unchanged', () => {
    expect(remotionCodecArgs(undefined)).toEqual([]);
    expect(remotionCodecArgs({ codec: 'h264' })).toEqual([]);
  });

  it.each([
    [{ codec: 'h264', crf: 18 }, ['--crf=18']],
    [{ codec: 'vp8', crf: 10 }, ['--codec=vp8', '--crf=10']],
    [{ codec: 'vp9', crf: 30, scale: 0.5 }, ['--codec=vp9', '--crf=30', '--scale=0.5']],
    [{ codec: 'prores', crf: 18 }, ['--codec=prores', '--prores-profile=hq']],
    [{ codec: 'gif', crf: 18, scale: 0.25 }, ['--codec=gif', '--scale=0.25']],
  ] as const)('%j → %j', (options, argv) => {
    expect(remotionCodecArgs(options)).toEqual(argv);
  });
});

describe('buildRenderCommand with codec options', () => {
  const base = {
    rootDir: '/root',
    appDir: '/root/video-editor',
    projectId: 'brand/cat/001-x',
    compositionId: 'X',
    outputDir: '/root/projects/brand/cat/001-x/output',
    existingOutputFiles: ['v1.mp4', 'v2-final.webm', 'CHANGELOG.md'],
  };

  it('h264 still goes through the wrapper, passing knobs through', () => {
    const t = buildRenderCommand({
      ...base,
      hasWrapper: true,
      options: { codec: 'h264', crf: 20, label: 'cut' },
    });
    expect(t).toEqual({
      command: 'node',
      args: ['scripts/render.mjs', 'brand/cat/001-x', 'cut', '--crf=20'],
      cwd: '/root',
    });
  });

  it('a webm codec bypasses the .mp4-only wrapper, into the next free vN', () => {
    const t = buildRenderCommand({
      ...base,
      hasWrapper: true,
      options: { codec: 'vp9', label: 'web' },
    });
    expect(t.command).toBe('npx');
    expect(t.cwd).toBe('/root/video-editor');
    expect(t.args).toEqual([
      'remotion',
      'render',
      'X',
      '/root/projects/brand/cat/001-x/output/v3-web.webm',
      '--codec=vp9',
    ]);
  });
});

describe('hyperframesCodecArgs — codec → `hyperframes render` flags (Phase 99 Theme H)', () => {
  it('h264 with no knobs adds nothing: mp4 is the CLI default', () => {
    expect(hyperframesCodecArgs(undefined)).toEqual([]);
    expect(hyperframesCodecArgs({ codec: 'h264' })).toEqual([]);
  });

  it('maps codecs onto HyperFrames output formats', () => {
    expect(hyperframesCodecArgs({ codec: 'vp8' })).toEqual(['--format=webm']);
    expect(hyperframesCodecArgs({ codec: 'vp9' })).toEqual(['--format=webm']);
    expect(hyperframesCodecArgs({ codec: 'prores' })).toEqual(['--format=mov']);
    expect(hyperframesCodecArgs({ codec: 'gif' })).toEqual(['--format=gif']);
  });

  it('passes crf only to codecs that take one, and ignores scale (HyperFrames has presets, not a scale)', () => {
    expect(hyperframesCodecArgs({ codec: 'h264', crf: 20, scale: 2 })).toEqual(['--crf=20']);
    expect(hyperframesCodecArgs({ codec: 'vp9', crf: 30 })).toEqual(['--format=webm', '--crf=30']);
    expect(hyperframesCodecArgs({ codec: 'prores', crf: 10 })).toEqual(['--format=mov']);
  });
});

describe('buildRenderCommand — HyperFrames', () => {
  const base = {
    rootDir: '/root',
    appDir: '/root/hyperframes-editor',
    projectId: 'brand/cat/001-x',
    compositionId: 'X',
    outputDir: '/root/projects/brand/cat/001-x/output',
    existingOutputFiles: ['v1.mp4', 'v2-cut.mp4'],
    engine: 'hyperframes' as const,
  };

  it('goes through the wrapper for every format — the wrapper owns vN and the changelog', () => {
    expect(buildRenderCommand({ ...base, hasWrapper: true, options: { label: 'first' } })).toEqual({
      command: 'node',
      args: ['scripts/render.mjs', 'brand/cat/001-x', 'first'],
      cwd: '/root',
      env: { DO_NOT_TRACK: '1' },
    });
    const webm = buildRenderCommand({
      ...base,
      hasWrapper: true,
      options: { codec: 'vp9', crf: 28 },
    });
    expect(webm.command).toBe('node');
    expect(webm.args).toEqual([
      'scripts/render.mjs',
      'brand/cat/001-x',
      '--format=webm',
      '--crf=28',
    ]);
  });

  it('falls back to `hyperframes render <project dir> -o <next vN>` in the editor app', () => {
    expect(
      buildRenderCommand({ ...base, hasWrapper: false, options: { codec: 'gif', label: 'loop' } }),
    ).toEqual({
      command: 'npx',
      args: [
        'hyperframes',
        'render',
        'projects/brand/cat/001-x',
        '-o',
        '/root/projects/brand/cat/001-x/output/v3-loop.gif',
        '--format=gif',
      ],
      cwd: '/root/hyperframes-editor',
      env: { DO_NOT_TRACK: '1' },
    });
  });

  it('leaves the Remotion target untouched when no engine is given', () => {
    const t = buildRenderCommand({
      ...base,
      engine: undefined,
      appDir: '/root/video-editor',
      hasWrapper: true,
    });
    expect(t).toEqual({
      command: 'node',
      args: ['scripts/render.mjs', 'brand/cat/001-x'],
      cwd: '/root',
    });
    expect('env' in t).toBe(false);
  });
});

describe('parseHyperframesProgress', () => {
  const bar = (pct: number, text: string): string =>
    `  ${'█'.repeat(Math.round(pct / 4))}${'░'.repeat(25 - Math.round(pct / 4))}  ${pct}%  ${text}`;

  it('is undefined before the first bar prints', () => {
    expect(parseHyperframesProgress('[INFO] [Compiler] Fetched 11 font face(s)')).toBeUndefined();
  });

  it('takes the last bar percentage as a 0..1 fraction', () => {
    const buffer = [
      bar(26, 'Streaming frame 1/90'),
      bar(35, 'Streaming frame 17/90'),
      bar(69, 'Streaming frame 72/90'),
    ].join('\r');
    expect(parseHyperframesProgress(buffer)).toBeCloseTo(0.69);
    expect(parseHyperframesProgress(`${buffer}\r${bar(100, 'Render complete')}`)).toBe(1);
  });

  it('ignores percentages in log lines that are not a bar', () => {
    const buffer = `${bar(80, 'Streaming frame 90/90')}\n[static-dedup] reused 46/136 frame(s) (34%), est. ~368ms saved`;
    expect(parseHyperframesProgress(buffer)).toBeCloseTo(0.8);
  });

  it('is what parseRenderProgress returns for the hyperframes engine, and Remotion keeps its own format', () => {
    expect(parseRenderProgress(bar(40, 'Streaming frame 36/90'), 'hyperframes')).toBeCloseTo(0.4);
    expect(parseRenderProgress(bar(40, 'Streaming frame 36/90'))).toBeUndefined();
  });
});

describe('queueRender — engine env', () => {
  beforeEach(() => {
    resetVideoRenderState();
  });

  it('hands the target environment to the spawn, and reports HyperFrames progress', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    const onProgress = vi.fn();
    const target = {
      command: 'node',
      args: ['scripts/render.mjs', 'p'],
      cwd: '/root',
      env: { DO_NOT_TRACK: '1' },
    };
    queueRender(
      { renderId: 'h1', projectId: 'p', compositionId: 'C', target },
      { spawn, onProgress, engine: 'hyperframes' },
    );
    expect(spawn).toHaveBeenCalledWith('node', ['scripts/render.mjs', 'p'], '/root', {
      DO_NOT_TRACK: '1',
    });
    child.stdout('  ██████████░░░░░░░░░░░░░░░  40%  Streaming frame 36/90');
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ renderId: 'h1', progress: 0.4 }),
    );
  });
});
