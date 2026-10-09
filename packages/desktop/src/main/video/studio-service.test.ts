import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpawnFn, SpawnedProcess } from '../process-runner';
import {
  HYPERFRAMES_ENV,
  buildStudioCommand,
  getStudioStatus,
  parseStudioUrl,
  resetVideoStudioState,
  startStudio,
  stopAllStudios,
  stopStudio,
} from './studio-service';

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
    stderr: (c: string) => handlers.stderr.forEach((h) => h(c)),
    error: (e: NodeJS.ErrnoException) => handlers.error.forEach((h) => h(e)),
    close: (code: number | null = 0) => handlers.close.forEach((h) => h(code)),
  };
}

describe('parseStudioUrl', () => {
  it('matches the resolved port Remotion actually printed, not an assumed 3000', () => {
    const output = 'Server ready - Local: http://localhost:3001, Network: http://192.168.1.5:3001';
    expect(parseStudioUrl(output)).toBe('http://localhost:3001');
  });

  it('is null before the server-ready line has appeared', () => {
    expect(parseStudioUrl('Bundled code ━━━━━━━━━━ 2314ms')).toBeNull();
  });
});

beforeEach(() => {
  resetVideoStudioState();
});

describe('startStudio', () => {
  it('spawns `npx remotion studio --no-open` in the given cwd', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    startStudio('p1', '/root/video-editor', { spawn, onStatus: vi.fn() });
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['remotion', 'studio', '--no-open'],
      '/root/video-editor',
    );
  });

  it('reports starting, then running once the URL is printed', () => {
    const child = fakeChild();
    const onStatus = vi.fn();
    startStudio('p1', '/root/video-editor', { spawn: () => child.process, onStatus });
    expect(getStudioStatus('p1')).toEqual({ state: 'starting' });
    child.stdout('Server ready - Local: http://localhost:3000, Network: http://x:3000');
    expect(getStudioStatus('p1')).toEqual({ state: 'running', url: 'http://localhost:3000' });
    expect(onStatus).toHaveBeenCalledWith('p1', { state: 'running', url: 'http://localhost:3000' });
  });

  it('does not spawn a second studio for a project that already has one', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    const onStatus = vi.fn();
    startStudio('p1', '/root/video-editor', { spawn, onStatus });
    startStudio('p1', '/root/video-editor', { spawn, onStatus });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('reports failed with the last stderr lines when the process exits on its own', () => {
    const child = fakeChild();
    const onStatus = vi.fn();
    startStudio('p1', '/root/video-editor', { spawn: () => child.process, onStatus });
    child.stderr('Error: something broke\n');
    child.close(1);
    expect(getStudioStatus('p1')).toEqual({ state: 'failed', stderr: ['Error: something broke'] });
  });

  it('reports failed when npx itself cannot be spawned', () => {
    const spawn = vi.fn<SpawnFn>(() => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    });
    const onStatus = vi.fn();
    startStudio('p1', '/root/video-editor', { spawn, onStatus });
    expect(getStudioStatus('p1')).toEqual({
      state: 'failed',
      stderr: ['npx was not found on PATH.'],
    });
  });
});

describe('stopStudio', () => {
  it('kills the child and clears tracking so a later close is a no-op', () => {
    const child = fakeChild();
    const onStatus = vi.fn();
    startStudio('p1', '/root/video-editor', { spawn: () => child.process, onStatus });
    stopStudio('p1');
    expect(child.kill).toHaveBeenCalledTimes(1);
    onStatus.mockClear();
    child.close(0);
    expect(onStatus).not.toHaveBeenCalled();
    expect(getStudioStatus('p1')).toEqual({ state: 'stopped' });
  });

  it('is a no-op for a project with no tracked studio', () => {
    expect(() => stopStudio('unknown')).not.toThrow();
  });
});

describe('stopAllStudios', () => {
  it('kills every tracked studio', () => {
    const childA = fakeChild();
    const childB = fakeChild();
    startStudio('a', '/root', { spawn: () => childA.process, onStatus: vi.fn() });
    startStudio('b', '/root', { spawn: () => childB.process, onStatus: vi.fn() });
    stopAllStudios();
    expect(childA.kill).toHaveBeenCalledTimes(1);
    expect(childB.kill).toHaveBeenCalledTimes(1);
  });
});

describe('buildStudioCommand — per engine (Phase 99 Theme H)', () => {
  it('Remotion: one `remotion studio` in the editor app, exactly as before the engine choice', () => {
    expect(
      buildStudioCommand({ engine: 'remotion', appDir: '/r/video-editor', projectId: 'a/b/001-x' }),
    ).toEqual({
      command: 'npx',
      args: ['remotion', 'studio', '--no-open'],
      cwd: '/r/video-editor',
    });
  });

  it('HyperFrames: `hyperframes preview` on the project folder, attached, telemetry off', () => {
    expect(
      buildStudioCommand({
        engine: 'hyperframes',
        appDir: '/r/hyperframes-editor',
        projectId: 'a/b/001-x',
      }),
    ).toEqual({
      command: 'npx',
      args: ['hyperframes', 'preview', 'projects/a/b/001-x', '--no-open', '--foreground'],
      cwd: '/r/hyperframes-editor',
      env: HYPERFRAMES_ENV,
    });
    expect(HYPERFRAMES_ENV).toEqual({ DO_NOT_TRACK: '1' });
  });
});

describe('parseStudioUrl — HyperFrames', () => {
  const output = [
    '┌  hyperframes preview',
    '◇  Studio running',
    '  Port 3002 is in use, using 3003 instead',
    '  Studio    http://localhost:3003/#project/001-x',
    '  Server    http://localhost:3003',
  ].join('\n');

  it('keeps the project hash and the port the CLI actually chose', () => {
    expect(parseStudioUrl(output, 'hyperframes')).toBe('http://localhost:3003/#project/001-x');
  });

  it('is null until the Studio line has printed', () => {
    expect(parseStudioUrl('◇  Studio running', 'hyperframes')).toBeNull();
    expect(parseStudioUrl('Port 3002 is in use', 'hyperframes')).toBeNull();
  });
});

describe('startStudio — engine', () => {
  it('spawns the HyperFrames command with the telemetry opt-out in its environment', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    startStudio('a/001-x', '/r/hyperframes-editor', {
      spawn,
      engine: 'hyperframes',
      onStatus: vi.fn(),
    });
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['hyperframes', 'preview', 'projects/a/001-x', '--no-open', '--foreground'],
      '/r/hyperframes-editor',
      { DO_NOT_TRACK: '1' },
    );
  });

  it('turns running once HyperFrames prints its Studio URL, and keeps one studio per project', () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    const onStatus = vi.fn();
    startStudio('p', '/r/hyperframes-editor', { spawn, engine: 'hyperframes', onStatus });
    child.stdout('  Studio    http://localhost:3002/#project/p\n');
    expect(getStudioStatus('p')).toEqual({
      state: 'running',
      url: 'http://localhost:3002/#project/p',
    });
    startStudio('p', '/r/hyperframes-editor', { spawn, engine: 'hyperframes', onStatus });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('does not mistake a Remotion-style line for a HyperFrames studio', () => {
    const child = fakeChild();
    startStudio('p', '/r/hyperframes-editor', {
      spawn: () => child.process,
      engine: 'hyperframes',
      onStatus: vi.fn(),
    });
    child.stdout('Server ready - Local: http://localhost:3000, Network: http://x:3000');
    expect(getStudioStatus('p')).toEqual({ state: 'starting' });
  });
});
