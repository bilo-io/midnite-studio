import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectsStore } from './video/projects-store';

/**
 * `video-service.ts` is pure orchestration between five already-tested
 * modules (Themes B/C/E) — these mocks let its own logic (root-gating,
 * `appDir` resolution, first-status capture, wrapper detection) be asserted
 * without spawning a real `npx`/`remotion` process, which
 * `studio-service.test.ts`/`render-service.test.ts` already cover directly.
 */
vi.mock('./video/studio-service', () => ({
  getStudioStatus: vi.fn(() => ({ state: 'stopped' })),
  startStudio: vi.fn(),
  stopStudio: vi.fn(),
  stopAllStudios: vi.fn(),
}));
vi.mock('./video/render-service', () => ({
  buildRenderCommand: vi.fn(() => ({ command: 'npx', args: ['remotion', 'render'], cwd: '/app' })),
  cancelRender: vi.fn(),
  killAllRenders: vi.fn(),
  listRenders: vi.fn(() => []),
  queueRender: vi.fn((input) => ({
    id: input.renderId,
    projectId: input.projectId,
    compositionId: input.compositionId,
    status: 'queued',
    startedAt: 0,
  })),
}));

import { startStudio, stopStudio } from './video/studio-service';
import { buildRenderCommand, queueRender } from './video/render-service';
import {
  configureVideo,
  createVideoProject,
  getVideoRoot,
  listVideoProjects,
  readVideoProjectFile,
  removeVideoProject,
  setVideoRoot,
  videoRenderStart,
  videoStudioStart,
} from './video-service';

let dirs: string[] = [];
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-video-service-'));
  dirs.push(dir);
  return dir;
};

function fakeStore(initial: string | null = null): ProjectsStore {
  let root = initial;
  return {
    load: async () => ({ videoRoot: root }),
    save: async (settings) => {
      root = settings.videoRoot;
    },
  };
}

const noWindow: () => BrowserWindow | null = () => null;

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

beforeEach(() => {
  configureVideo(fakeStore(null), noWindow);
});

describe('root gating', () => {
  it('reports no root configured', async () => {
    expect(await getVideoRoot()).toBeNull();
  });

  it('listVideoProjects returns empty with no root configured', async () => {
    expect(await listVideoProjects()).toEqual([]);
  });

  it('createVideoProject/removeVideoProject fail with no root configured', async () => {
    const created = await createVideoProject('p1', 'Title');
    expect(created.ok).toBe(false);
    const removed = await removeVideoProject('p1');
    expect(removed.ok).toBe(false);
  });

  it('videoStudioStart fails with no root configured, and never calls startStudio', async () => {
    const result = await videoStudioStart('p1');
    expect(result.ok).toBe(false);
    expect(startStudio).not.toHaveBeenCalled();
  });

  it('readVideoProjectFile returns null with no root configured', async () => {
    expect(await readVideoProjectFile('p1', 'BRIEF.md')).toBeNull();
  });

  it('videoRenderStart fails with no root configured, and never calls queueRender', async () => {
    const result = await videoRenderStart('p1', 'MyComp');
    expect(result.ok).toBe(false);
    expect(queueRender).not.toHaveBeenCalled();
  });

  it('setVideoRoot persists and getVideoRoot reflects it on the next call', async () => {
    await setVideoRoot('/some/root');
    expect(await getVideoRoot()).toBe('/some/root');
  });
});

describe('videoStudioStart', () => {
  it('resolves `<root>/video-editor` as the studio cwd and captures the first status', async () => {
    await setVideoRoot('/videos');
    vi.mocked(startStudio).mockImplementation((_projectId, _cwd, deps) => {
      deps.onStatus('p1', { state: 'starting' });
    });

    const result = await videoStudioStart('p1');
    expect(startStudio).toHaveBeenCalledWith('p1', '/videos/video-editor', expect.any(Object));
    expect(result).toEqual({ ok: true, value: { state: 'starting' } });
  });
});

describe('videoRenderStart', () => {
  it('detects the project wrapper script and builds the render command through it', async () => {
    const root = await tempDir();
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(join(root, 'scripts', 'render.mjs'), '', 'utf8');
    await setVideoRoot(root);

    const result = await videoRenderStart('p1', 'MyComp');
    expect(result.ok).toBe(true);
    expect(buildRenderCommand).toHaveBeenCalledWith(
      expect.objectContaining({ hasWrapper: true, rootDir: root, appDir: join(root, 'video-editor') }),
    );
  });

  it('falls back to the raw CLI target when no wrapper script exists', async () => {
    const root = await tempDir();
    await setVideoRoot(root);

    await videoRenderStart('p1', 'MyComp');
    expect(buildRenderCommand).toHaveBeenCalledWith(expect.objectContaining({ hasWrapper: false }));
  });
});

describe('removeVideoProject', () => {
  it('stops the project studio before removing it from disk', async () => {
    const root = await tempDir();
    await mkdir(join(root, 'projects', 'p1'), { recursive: true });
    await writeFile(join(root, 'projects', 'p1', 'project.json'), '{}', 'utf8');
    await setVideoRoot(root);

    await removeVideoProject('p1');
    expect(stopStudio).toHaveBeenCalledWith('p1');
  });
});
