import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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

// `revealVideoFile`/`openVideoFile` (Theme E) are the only two functions in
// this file that touch `electron` at runtime — every other export here is
// pure orchestration over the mocked modules above.
const { showItemInFolder: showItemInFolderMock, openPath: openPathMock } = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
  openPath: vi.fn(async () => ''),
}));
vi.mock('electron', () => ({
  shell: { showItemInFolder: showItemInFolderMock, openPath: openPathMock },
}));

import { startStudio, stopAllStudios, stopStudio } from './video/studio-service';
import { buildRenderCommand, queueRender } from './video/render-service';
import {
  configureVideo,
  createVideoProject,
  currentVideoRootResolution,
  getVideoRoot,
  listVideoProjects,
  openVideoFile,
  readVideoProjectFile,
  removeVideoProject,
  revealVideoFile,
  setVideoRoot,
  videoEngineGet,
  videoEngineSet,
  videoRenderStart,
  videoStudioStart,
} from './video-service';
import { readVideoEngine } from './video/engine';
import { scaffoldVideoWorkspace } from './video/scaffold';

const TEMPLATE = join(__dirname, '..', '..', '..', '..', 'templates', 'media-video');

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
      expect.objectContaining({
        hasWrapper: true,
        rootDir: root,
        appDir: join(root, 'video-editor'),
      }),
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

describe('revealVideoFile / openVideoFile (Theme E)', () => {
  it('hands the confined, real path to shell.showItemInFolder / shell.openPath', async () => {
    const root = await realpath(await tempDir());
    const outputDir = join(root, 'projects', 'p1', 'output');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'v1-cut.mp4'), 'fake video', 'utf8');
    await setVideoRoot(root);

    const revealed = await revealVideoFile('p1', 'output', 'v1-cut.mp4');
    expect(revealed).toEqual({ ok: true });
    expect(showItemInFolderMock).toHaveBeenCalledWith(join(outputDir, 'v1-cut.mp4'));

    const opened = await openVideoFile('p1', 'output', 'v1-cut.mp4');
    expect(opened).toEqual({ ok: true });
    expect(openPathMock).toHaveBeenCalledWith(join(outputDir, 'v1-cut.mp4'));
  });

  it('refuses a name that escapes the area, and never calls shell', async () => {
    const root = await realpath(await tempDir());
    await mkdir(join(root, 'projects', 'p1', 'output'), { recursive: true });
    await setVideoRoot(root);

    const revealed = await revealVideoFile('p1', 'output', '../../../../etc/passwd');
    expect(revealed.ok).toBe(false);
    expect(showItemInFolderMock).not.toHaveBeenCalled();

    const opened = await openVideoFile('p1', 'output', '../../../../etc/passwd');
    expect(opened.ok).toBe(false);
    expect(openPathMock).not.toHaveBeenCalled();
  });

  it("surfaces shell.openPath's own error string rather than reporting success", async () => {
    const root = await realpath(await tempDir());
    const outputDir = join(root, 'projects', 'p1', 'output');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'v1-cut.mp4'), 'fake video', 'utf8');
    await setVideoRoot(root);
    openPathMock.mockResolvedValueOnce('no application registered for this file type');

    const opened = await openVideoFile('p1', 'output', 'v1-cut.mp4');
    expect(opened).toEqual({ ok: false, message: 'no application registered for this file type' });
  });

  it('fails with no root configured, and never calls shell', async () => {
    const revealed = await revealVideoFile('p1', 'output', 'v1-cut.mp4');
    expect(revealed.ok).toBe(false);
    expect(showItemInFolderMock).not.toHaveBeenCalled();
  });
});

describe('engine choice (Phase 99 Theme H)', () => {
  /** A real scaffolded root — the service reads `video.config.json` off disk. */
  const scaffolded = async (engine: 'remotion' | 'hyperframes'): Promise<string> => {
    const root = join(await tempDir(), 'video');
    expect((await scaffoldVideoWorkspace(TEMPLATE, root, engine)).ok).toBe(true);
    return root;
  };

  it('resolves a root with no config as Remotion, so existing setups are untouched', async () => {
    const root = await tempDir();
    await mkdir(join(root, 'projects'), { recursive: true });
    await setVideoRoot(root);
    expect(await currentVideoRootResolution()).toMatchObject({ root, engine: 'remotion' });
    expect(await videoEngineGet('global')).toMatchObject({ root, engine: 'remotion' });
  });

  it('reports no engine state without a root', async () => {
    expect(await videoEngineGet('active')).toEqual({
      root: null,
      engine: 'remotion',
      needsInstall: false,
      appDir: null,
    });
    expect((await videoEngineSet('active', 'hyperframes', TEMPLATE)).ok).toBe(false);
  });

  it('switches the engine, persists it, adds the app, and stops the engine-specific studios', async () => {
    const root = await scaffolded('remotion');
    await setVideoRoot(root);
    const result = await videoEngineSet('global', 'hyperframes', TEMPLATE);
    expect(result).toMatchObject({
      ok: true,
      value: { engine: 'hyperframes', needsInstall: true },
    });
    expect(stopAllStudios).toHaveBeenCalled();
    expect(await readVideoEngine(root)).toBe('hyperframes');
    expect((await currentVideoRootResolution()).engine).toBe('hyperframes');
  });

  it('runs the HyperFrames studio from hyperframes-editor with the engine named', async () => {
    const root = await scaffolded('hyperframes');
    await mkdir(join(root, 'hyperframes-editor', 'node_modules'), { recursive: true });
    await setVideoRoot(root);
    vi.mocked(startStudio).mockImplementation((_projectId, _cwd, deps) => {
      deps.onStatus('example/000-hello', { state: 'starting' });
    });

    const result = await videoStudioStart('example/000-hello');
    expect(result.ok).toBe(true);
    expect(startStudio).toHaveBeenCalledWith(
      'example/000-hello',
      join(root, 'hyperframes-editor'),
      expect.objectContaining({ engine: 'hyperframes' }),
    );
  });

  it('refuses a HyperFrames studio or render before `npm install`, naming the fix, without spawning', async () => {
    const root = await scaffolded('hyperframes');
    await setVideoRoot(root);
    const studio = await videoStudioStart('example/000-hello');
    expect(studio).toMatchObject({ ok: false });
    expect(JSON.stringify(studio)).toContain('npm install');
    expect(startStudio).not.toHaveBeenCalled();
    const render = await videoRenderStart('example/000-hello', 'ExampleHello');
    expect(render.ok).toBe(false);
    expect(queueRender).not.toHaveBeenCalled();
  });

  it('writes a composition stub for a project that has none, then starts its studio', async () => {
    const root = await scaffolded('hyperframes');
    await mkdir(join(root, 'hyperframes-editor', 'node_modules'), { recursive: true });
    await mkdir(join(root, 'projects', 'acme', '001-new'), { recursive: true });
    await writeFile(
      join(root, 'projects', 'acme', '001-new', 'project.json'),
      JSON.stringify({
        id: 'acme/001-new',
        title: 'New',
        composition: 'AcmeNew',
        brief: 'input/BRIEF.md',
        script: 'EDITORIAL_SCRIPT.md',
      }),
    );
    await setVideoRoot(root);
    vi.mocked(startStudio).mockImplementation((_p, _c, deps) =>
      deps.onStatus('acme/001-new', { state: 'starting' }),
    );

    expect((await videoStudioStart('acme/001-new')).ok).toBe(true);
    const html = await readFile(
      join(root, 'hyperframes-editor', 'projects', 'acme', '001-new', 'index.html'),
      'utf8',
    );
    expect(html).toContain('data-composition-id="AcmeNew"');
  });

  it('builds the HyperFrames render target against the editor app', async () => {
    const root = await scaffolded('hyperframes');
    await mkdir(join(root, 'hyperframes-editor', 'node_modules'), { recursive: true });
    await setVideoRoot(root);

    expect(
      (await videoRenderStart('example/000-hello', 'ExampleHello', { codec: 'vp9', crf: 30 })).ok,
    ).toBe(true);
    expect(buildRenderCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: 'hyperframes',
        hasWrapper: true,
        appDir: join(root, 'hyperframes-editor'),
      }),
    );
    expect(queueRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ engine: 'hyperframes' }),
    );
  });
});
