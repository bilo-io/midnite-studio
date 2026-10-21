import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseResourceQuery, type ForgePullsResult } from '@midnite/studio-shared';

/**
 * Phase 112 Theme G — the live sources, against a mocked bridge and seeded
 * stores. Each test asks one source directly; ranking is `resolve.test.ts`'s.
 */

type Handler = (event: unknown) => void;
const mocks = vi.hoisted(() => ({
  batch: [] as Handler[],
  done: [] as Handler[],
  searchStart: vi.fn(),
  searchCancel: vi.fn(async () => undefined),
  revParse: vi.fn(async () => ({ sha: null as string | null })),
  forgePulls: vi.fn(),
  projectList: vi.fn(),
  fileList: vi.fn(),
  listCollections: vi.fn(),
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
  hasBridge: () => true,
  bridge: () => ({
    windowRole: 'main',
    search: {
      start: mocks.searchStart,
      cancel: mocks.searchCancel,
      onBatch: (h: Handler) => {
        mocks.batch.push(h);
        return () => mocks.batch.splice(mocks.batch.indexOf(h), 1);
      },
      onDone: (h: Handler) => {
        mocks.done.push(h);
        return () => mocks.done.splice(mocks.done.indexOf(h), 1);
      },
    },
    repos: { revParse: mocks.revParse },
    forge: { pulls: mocks.forgePulls },
    media: { project: { list: mocks.projectList }, file: { list: mocks.fileList } },
    apiClient: { listCollections: mocks.listCollections },
  }),
}));

import { keys } from '../../../../services/queries';
import { appQueryClient } from '../../../../services/query-client';
import { useApiClientStore } from '@midnite/studio-feature-api-client/renderer';
import { useNotesStore } from '../../../../store/notes-store';
import type { ResourceSource, SourceQuery } from '../resolve';
import { GIT_SOURCES } from './git';
import { NOTES_MEDIA_SOURCES, noteTitle } from './notes-media';
import { TOOLS_SOURCES } from './tools';

const R = 'repo-1';
const query = (text: string, over: Partial<SourceQuery> = {}): SourceQuery => {
  const parsed = parseResourceQuery(text);
  return { ...parsed, kinds: parsed.kinds, repoId: R, signal: new AbortController().signal, ...over };
};
const pick = (list: readonly ResourceSource[], id: string): ResourceSource => list.find((s) => s.id === id)!;

beforeEach(() => {
  mocks.batch.length = 0;
  mocks.done.length = 0;
  vi.clearAllMocks();
  appQueryClient.clear();
});

afterEach(() => {
  appQueryClient.clear();
});

describe('commits', () => {
  const commits = pick(GIT_SOURCES, 'commits');
  const row = { sha: 'abcdef1234', parents: [], authorName: 'Ada', authorEmail: 'a@x', authorDate: 10, committerDate: 10, subject: 'fix lock screen', refs: ['refs/heads/main'], coAuthors: [], sessionTrailers: [] };

  it('greps every term, case-insensitively, and streams the commits back', async () => {
    mocks.searchStart.mockImplementation(async (req: { requestId: string }) => {
      queueMicrotask(() => {
        mocks.batch.forEach((h) => h({ requestId: 'other', mode: 'commits', commits: [{ ...row, sha: 'nope' }] }));
        mocks.batch.forEach((h) => h({ requestId: req.requestId, mode: 'commits', commits: [row] }));
        mocks.done.forEach((h) => h({ requestId: req.requestId, mode: 'commits', total: 1, truncated: false }));
      });
      return { ok: true, value: { started: true } };
    });
    const out = await commits.load(query('the commit about lock screen'));
    expect(mocks.searchStart).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: R, mode: 'commits', query: { grep: ['lock', 'screen'], regexp: false, ignoreCase: true } }),
    );
    expect(out).toEqual([
      expect.objectContaining({ ref: { kind: 'commit', repoId: R, sha: 'abcdef1234' }, title: 'fix lock screen', at: 10_000, matched: true, keywords: 'main' }),
    ]);
    // Both listeners were released.
    expect(mocks.batch).toHaveLength(0);
  });

  it('cancels its search in main when the find gives up on it', async () => {
    mocks.searchStart.mockResolvedValue({ ok: true, value: { started: true } });
    const controller = new AbortController();
    const pending = commits.load(query('commit lock', { signal: controller.signal }));
    controller.abort();
    expect(await pending).toEqual([]);
    expect(mocks.searchCancel).toHaveBeenCalledWith(expect.objectContaining({ repoId: R }));
  });

  it('resolves a sha as an exact match and searches nothing else', async () => {
    mocks.revParse.mockResolvedValue({ sha: 'a1b2c3d4e5f6' });
    const out = await commits.load(query('a1b2c3d'));
    expect(out).toEqual([{ ref: { kind: 'commit', repoId: R, sha: 'a1b2c3d4e5f6' }, title: 'commit a1b2c3d', exact: true }]);
    expect(mocks.searchStart).not.toHaveBeenCalled();
  });

  it('escapes regex metacharacters in a term', async () => {
    mocks.searchStart.mockResolvedValue({ ok: false, kind: 'error', message: 'x' });
    await commits.load(query('commit a*b'));
    expect(mocks.searchStart.mock.calls[0]![0].query.grep).toEqual(['a\\*b']);
    await commits.load(query('commit v1.2'));
    expect(mocks.searchStart.mock.calls[1]![0].query.grep).toEqual(['v1\\.2']);
  });
});

describe('pulls', () => {
  const pulls = pick(GIT_SOURCES, 'pulls');
  const pull = (number: number, title: string) => ({ id: '', number, title, state: 'open', isDraft: false, reviewDecision: null, checks: null, headBranch: `b${number}`, author: 'ada', url: '', mergedAt: null, closedAt: null });

  it('reads every cached listing, de-duplicated, without fetching', async () => {
    const result = (pulls_: unknown[]) => ({ cli: {}, pulls: pulls_, error: null }) as unknown as ForgePullsResult;
    appQueryClient.setQueryData(keys.forgePulls(R, 20, 'open', 'all'), result([pull(812, 'Auth'), pull(7, 'Docs')]));
    appQueryClient.setQueryData(keys.forgePulls(R, 20, 'merged', 'all'), result([pull(812, 'Auth')]));
    const out = await pulls.load(query('PR 812'));
    expect(mocks.forgePulls).not.toHaveBeenCalled();
    expect(out.map((c) => [c.ref, c.exact])).toEqual([
      [{ kind: 'pull', repoId: R, number: 812 }, true],
      [{ kind: 'pull', repoId: R, number: 7 }, false],
    ]);
  });

  it('falls back to one listing call when nothing is cached', async () => {
    mocks.forgePulls.mockResolvedValue({ cli: {}, pulls: [pull(3, 'x')], error: null });
    expect(await pulls.load(query('pr x'))).toHaveLength(1);
    expect(mocks.forgePulls).toHaveBeenCalledWith({ repoId: R, limit: 30, state: 'all' });
  });
});

describe('notes', () => {
  it('titles a note by its first line and keeps the body for matching only', async () => {
    useNotesStore.setState({
      notes: { n1: { id: 'n1', repoId: R, body: '# Release plan\nship the auth fix', status: 'todo', done: false, createdAt: 1, updatedAt: 2, order: 0 } as never },
    });
    const [note] = await pick(NOTES_MEDIA_SOURCES, 'notes').load(query('note auth'));
    expect(note).toMatchObject({ ref: { kind: 'note', id: 'n1' }, title: 'Release plan', at: 2 });
    expect(note!.detail).not.toContain('auth');
    expect(noteTitle('\n- [ ] buy milk')).toBe('buy milk');
    expect(noteTitle('   ')).toBe('Untitled note');
  });
});

describe('media', () => {
  it('lists a tab’s projects and its named assets', async () => {
    mocks.projectList.mockResolvedValue({ ok: true, value: [{ name: 'beasts', fileCount: 2, mtimeMs: 5 }] });
    mocks.fileList.mockResolvedValue({ ok: true, value: [{ path: 'dragon.obj', size: 1, mtimeMs: 9 }, { path: 'dragon.mtl', size: 1, mtimeMs: 9 }] });
    const out = await pick(NOTES_MEDIA_SOURCES, 'media:model').load(query('dragon model'));
    expect(out.map((c) => [c.ref, c.title])).toEqual([
      [{ kind: 'media', repoId: R, media: 'model', project: 'beasts' }, 'beasts'],
      [{ kind: 'media', repoId: R, media: 'model', project: 'beasts', path: 'dragon.obj' }, 'dragon'],
    ]);
  });

  it('names a terrain by its folder, minus the generator stamp', async () => {
    mocks.projectList.mockResolvedValue({ ok: true, value: [{ name: 'world', fileCount: 1, mtimeMs: 1 }] });
    mocks.fileList.mockResolvedValue({ ok: true, value: [{ path: 'dunes-20261004-120000/terrain.json', size: 1, mtimeMs: 1 }] });
    const out = await pick(NOTES_MEDIA_SOURCES, 'media:terrain').load(query('dunes terrain'));
    expect(out[1]).toMatchObject({ title: 'dunes', ref: { path: 'dunes-20261004-120000/terrain.json' } });
  });
});

describe('api requests', () => {
  it('walks folders into item paths, reading without loading the store', async () => {
    useApiClientStore.setState({ collections: [], collectionsRepoId: 'elsewhere' });
    mocks.listCollections.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'col',
          fileName: 'c.json',
          collection: { info: { name: 'Petstore' }, item: [{ name: 'Pets', item: [{ name: 'List pets', request: { method: 'GET', url: 'https://x/pets' } }] }] },
        },
      ],
    });
    const out = await pick(TOOLS_SOURCES, 'api-requests').load(query('list pets request'));
    expect(out).toEqual([
      expect.objectContaining({ ref: { kind: 'apiRequest', repoId: R, collectionId: 'col', itemPath: 'Pets/List pets' }, title: 'List pets', detail: 'GET · Petstore' }),
    ]);
    expect(useApiClientStore.getState().collectionsRepoId).toBe('elsewhere');
  });
});

describe('settings', () => {
  it('lists every page and section with its page in the title', async () => {
    const out = await pick(TOOLS_SOURCES, 'settings').load(query('settings'));
    expect(out).toContainEqual(expect.objectContaining({ ref: { kind: 'setting', page: 'appearance' }, title: 'Appearance settings' }));
    expect(out).toContainEqual(expect.objectContaining({ ref: { kind: 'setting', page: 'appearance', section: 'theme' }, title: 'Appearance settings — Theme' }));
  });
});
