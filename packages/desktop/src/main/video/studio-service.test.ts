import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpawnFn, SpawnedProcess } from '../process-runner';
import { getStudioStatus, parseStudioUrl, resetVideoStudioState, startStudio, stopAllStudios, stopStudio } from './studio-service';

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
    expect(spawn).toHaveBeenCalledWith('npx', ['remotion', 'studio', '--no-open'], '/root/video-editor');
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
    expect(getStudioStatus('p1')).toEqual({ state: 'failed', stderr: ['npx was not found on PATH.'] });
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
