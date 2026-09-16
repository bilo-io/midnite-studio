import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Registers straight through the real `electron.ipcMain` (`handle.ts`'s own
 * doc comment), so testing it means capturing what it registers — same shape
 * as `database.test.ts`'s own `vi.mock('electron', ...)`. `@midnite/studio-
 * knowledge` and the layout worker are both mocked: this is the IPC layer's
 * own contract test (repo resolution, envelope shape, the cache-hit/cache-miss
 * branch), not a re-test of the engine — that lives in `packages/knowledge`.
 */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
}));

vi.mock('../window-manager', () => ({ resolveWindow: () => null }));

const { getRepo } = vi.hoisted(() => ({ getRepo: vi.fn() }));
vi.mock('../repo-registry', () => ({ getRepo }));

const { runLayoutInWorker } = vi.hoisted(() => ({ runLayoutInWorker: vi.fn() }));
vi.mock('../knowledge/layout-runner', () => ({
  runLayoutInWorker,
  resolveLayoutWorkerPath: () => '/mock/knowledge-layout-worker.js',
}));

const { readGraph, readLayoutCache, writeLayoutCache, graphExists } = vi.hoisted(() => ({
  readGraph: vi.fn(),
  readLayoutCache: vi.fn(),
  writeLayoutCache: vi.fn(async () => {}),
  graphExists: vi.fn(async () => false),
}));
vi.mock('@midnite/studio-knowledge', async () => {
  const actual =
    await vi.importActual<typeof import('@midnite/studio-knowledge')>('@midnite/studio-knowledge');
  return {
    ...actual,
    readGraph,
    readLayoutCache,
    writeLayoutCache,
    graphExists,
  };
});

// Theme F's staleness label (`commitsBehind`) is the one place this handler
// shells out to git — mocked so the suite never depends on a real repo at the
// fake `/repo` path these tests use.
const { execGit } = vi.hoisted(() => ({
  execGit: vi.fn(async () => ({ exitCode: 0, stdout: '0\n', stderr: '', args: [] })),
}));
vi.mock('@midnite/studio-git-engine', () => ({ execGit }));

import { loggerFrom } from '../log';
import { configureKnowledge, registerKnowledgeHandlers, resetKnowledge } from './knowledge-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw: unknown): unknown {
  const listener = handlers.get(channel);
  if (!listener) throw new Error(`no handler registered for ${channel}`);
  return listener({ sender: {} }, raw);
}

const RAW_GRAPH = {
  nodes: [
    {
      id: 'a',
      label: 'A',
      community: 0,
      community_name: 'core',
      file_type: 'code',
      source_file: 'src/a.ts',
      source_location: 'L1',
    },
    { id: 'b', label: 'B', community: 1, community_name: 'edge', file_type: 'code' },
  ],
  links: [{ source: 'a', target: 'b', relation: 'calls', weight: 1 }],
  built_at_commit: 'deadbeef',
};

describe('registerKnowledgeHandlers (Phase 87 Theme B)', () => {
  beforeEach(() => {
    handlers.clear();
    getRepo.mockReset();
    runLayoutInWorker.mockReset();
    readGraph.mockReset();
    readLayoutCache.mockReset();
    writeLayoutCache.mockClear();
    graphExists.mockReset();
    graphExists.mockResolvedValue(false);
    execGit.mockReset();
    execGit.mockResolvedValue({ exitCode: 0, stdout: '0\n', stderr: '', args: [] });
    resetKnowledge();
    configureKnowledge('/tmp/knowledge-cache-test', loggerFrom(() => {}));
    registerKnowledgeHandlers();
  });

  describe('knowledgeGetGraph', () => {
    it('answers `error` for a repoId that is not open', async () => {
      getRepo.mockReturnValue(undefined);
      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:gone' });
      expect(result).toEqual({ ok: false, kind: 'error', message: expect.any(String) });
    });

    it('answers `absent` for a repo with no graphify-out/graph.json', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: false, kind: 'absent' });
      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });
      expect(result).toEqual({ ok: false, kind: 'absent' });
    });

    it('answers `malformed` distinctly from `absent`', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: false, kind: 'malformed', message: 'bad shape' });
      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });
      expect(result).toEqual({ ok: false, kind: 'malformed', message: 'bad shape' });
    });

    it('serves a cached layout without invoking the worker', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
      readLayoutCache.mockResolvedValue({
        builtAtCommit: 'deadbeef',
        projectionVersion: 2,
        nodeCount: 2,
        linkCount: 1,
        positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } },
      });

      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });

      expect(runLayoutInWorker).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ok: true,
        value: {
          builtAtCommit: 'deadbeef',
          cached: true,
          positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } },
        },
      });
      // The lean projection — camelCase on the wire, no source_location leak.
      expect((result as { value: { nodes: unknown[] } }).value.nodes).toEqual([
        { id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' },
        { id: 'b', label: 'B', community: 1, communityName: 'edge', fileType: 'code' },
      ]);
    });

    it('runs the layout worker and writes the cache on a cache miss', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
      readLayoutCache.mockResolvedValue(null);
      runLayoutInWorker.mockResolvedValue({
        ok: true,
        positions: { a: { x: 3, y: 3 }, b: { x: 4, y: 4 } },
      });

      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });

      expect(runLayoutInWorker).toHaveBeenCalledTimes(1);
      expect(writeLayoutCache).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ ok: true, value: { cached: false } });
    });

    it('surfaces a worker failure as `error`, never a thrown rejection', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
      readLayoutCache.mockResolvedValue(null);
      runLayoutInWorker.mockResolvedValue({ ok: false, message: 'worker crashed' });

      const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });
      expect(result).toEqual({ ok: false, kind: 'error', message: 'worker crashed' });
      expect(writeLayoutCache).not.toHaveBeenCalled();
    });

    describe('commitsBehind (Theme F staleness, reported not acted on)', () => {
      it('is 0 when built_at_commit is HEAD, on a cache hit', async () => {
        getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
        readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
        readLayoutCache.mockResolvedValue({
          builtAtCommit: 'deadbeef',
          projectionVersion: 1,
          nodeCount: 2,
          linkCount: 1,
          positions: {},
        });
        execGit.mockResolvedValue({ exitCode: 0, stdout: '0\n', stderr: '', args: [] });

        const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });

        expect(execGit).toHaveBeenCalledWith('/repo', ['rev-list', '--count', 'deadbeef..HEAD']);
        expect(result).toMatchObject({ ok: true, value: { commitsBehind: 0 } });
      });

      it('is a positive count when HEAD has moved on, on a cache miss', async () => {
        getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
        readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
        readLayoutCache.mockResolvedValue(null);
        runLayoutInWorker.mockResolvedValue({ ok: true, positions: {} });
        execGit.mockResolvedValue({ exitCode: 0, stdout: '7\n', stderr: '', args: [] });

        const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });
        expect(result).toMatchObject({ ok: true, value: { commitsBehind: 7 } });
      });

      it('is null, not thrown or 0, when the commit cannot be resolved', async () => {
        getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
        readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
        readLayoutCache.mockResolvedValue({
          builtAtCommit: 'deadbeef',
          projectionVersion: 1,
          nodeCount: 2,
          linkCount: 1,
          positions: {},
        });
        execGit.mockResolvedValue({
          exitCode: 128,
          stdout: '',
          stderr: "fatal: bad revision 'deadbeef..HEAD'",
          args: [],
        });

        const result = await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });
        expect(result).toMatchObject({ ok: true, value: { commitsBehind: null } });
      });
    });
  });

  describe('knowledgeCheckGraph (Theme F rail greying)', () => {
    it('answers `exists: true` without invoking readGraph or the layout worker', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      graphExists.mockResolvedValue(true);

      const result = await invoke(CHANNELS.knowledgeCheckGraph, { repoId: 'repo:1' });

      expect(result).toEqual({ exists: true });
      expect(readGraph).not.toHaveBeenCalled();
      expect(runLayoutInWorker).not.toHaveBeenCalled();
    });

    it('answers `exists: false` for an un-graphified repo', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      graphExists.mockResolvedValue(false);

      const result = await invoke(CHANNELS.knowledgeCheckGraph, { repoId: 'repo:1' });
      expect(result).toEqual({ exists: false });
    });

    it('answers `exists: false`, not a thrown error, for a repoId that is not open', async () => {
      getRepo.mockReturnValue(undefined);
      const result = await invoke(CHANNELS.knowledgeCheckGraph, { repoId: 'repo:gone' });
      expect(result).toEqual({ exists: false });
    });
  });

  describe('knowledgeGetNodeDetail', () => {
    it('returns not-found for an id the current graph does not carry', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
      readLayoutCache.mockResolvedValue(null);
      runLayoutInWorker.mockResolvedValue({ ok: true, positions: {} });

      // Populate the in-memory detail index the way a real getGraph call would.
      await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });

      const result = await invoke(CHANNELS.knowledgeGetNodeDetail, {
        repoId: 'repo:1',
        nodeId: 'ghost',
      });
      expect(result).toEqual({ ok: false, kind: 'not-found' });
    });

    it('answers a node with a source location, by id', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });
      readLayoutCache.mockResolvedValue(null);
      runLayoutInWorker.mockResolvedValue({ ok: true, positions: {} });
      await invoke(CHANNELS.knowledgeGetGraph, { repoId: 'repo:1' });

      const result = await invoke(CHANNELS.knowledgeGetNodeDetail, {
        repoId: 'repo:1',
        nodeId: 'a',
      });
      expect(result).toEqual({
        ok: true,
        value: { sourceFile: 'src/a.ts', sourceLocation: 'L1' },
      });
    });

    it('rebuilds the detail index from a fresh read when nothing is cached in memory yet', async () => {
      getRepo.mockReturnValue({ id: 'repo:1', path: '/repo' });
      readGraph.mockResolvedValue({ ok: true, graph: RAW_GRAPH });

      const result = await invoke(CHANNELS.knowledgeGetNodeDetail, {
        repoId: 'repo:1',
        nodeId: 'a',
      });
      expect(result).toEqual({
        ok: true,
        value: { sourceFile: 'src/a.ts', sourceLocation: 'L1' },
      });
    });

    it('answers `error` for a repoId that is not open', async () => {
      getRepo.mockReturnValue(undefined);
      const result = await invoke(CHANNELS.knowledgeGetNodeDetail, {
        repoId: 'repo:gone',
        nodeId: 'a',
      });
      expect(result).toEqual({ ok: false, kind: 'error', message: expect.any(String) });
    });
  });
});
