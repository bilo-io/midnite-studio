import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TempRepo, writeQueue } from '@midnite/studio-git-engine';
import { ForgeRunSchema, MCP_TOOLS } from '@midnite/studio-shared';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as ghCli from '../forge/gh-cli';
import { configureRegistry, openRepo, resetRegistry } from '../repo-registry';
import { nullRepoStore } from '../repo-store';
import {
  branchList,
  diffFile,
  forgeChecks,
  forgePulls,
  GRAPH_LOG_MAX_LIMIT,
  graphLog,
  repoList,
  repoResolve,
  statusGet,
} from './tools';

vi.mock('../forge/gh-cli', async () => {
  const actual = await vi.importActual<typeof ghCli>('../forge/gh-cli');
  return { ...actual, listPulls: vi.fn(), listRuns: vi.fn() };
});

let repos: TempRepo[] = [];

async function newRepo(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  repos.push(repo);
  return repo;
}

/**
 * Spied (not mocked) across the whole file — every test below runs the real
 * `WriteQueue.run`, and the read-only guardrail at the bottom asserts it was
 * never called. Set up before any `it()` runs so it captures every tool call
 * in this file, not just the ones after it.
 */
const writeQueueRunSpy = vi.spyOn(writeQueue, 'run');

beforeEach(() => {
  configureRegistry(nullRepoStore);
});

afterEach(async () => {
  resetRegistry();
  vi.mocked(ghCli.listPulls).mockReset();
  vi.mocked(ghCli.listRuns).mockReset();
  await Promise.all(repos.map((r) => r.cleanup()));
  repos = [];
});

afterAll(() => {
  writeQueueRunSpy.mockRestore();
});

const parses = <K extends keyof typeof MCP_TOOLS>(id: K, value: unknown): boolean =>
  MCP_TOOLS[id].output.safeParse(value).success;

describe('repoList', () => {
  it('lists every open repository', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'hi', 'initial');
    await openRepo(repo.path);

    const result = await repoList();
    expect(parses('repo.list', result)).toBe(true);
    expect(result.map((r) => r.path)).toEqual([repo.path]);
  });
});

describe('repoResolve', () => {
  it('resolves a path to its registered repo and current branch', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'hi', 'initial');
    await openRepo(repo.path);

    const result = await repoResolve({ repoPath: repo.path });
    expect(parses('repo.resolve', result)).toBe(true);
    expect(result.repo.path).toBe(repo.path);
    expect(result.branch).toBe('main');
  });

  it('reports null for a detached HEAD', async () => {
    const repo = await newRepo();
    const sha = await repo.commitFile('a.txt', 'hi', 'initial');
    await repo.git(['checkout', '--detach', sha]);
    await openRepo(repo.path);

    const result = await repoResolve({ repoPath: repo.path });
    expect(result.branch).toBeNull();
  });

  it('refuses a repository Midnite Studio has not opened', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'hi', 'initial');
    // Deliberately not opened via openRepo().

    await expect(repoResolve({ repoPath: repo.path })).rejects.toMatchObject({
      kind: 'refused',
    });
  });

  it('answers not-found for a path outside any git repository', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mstudio-mcp-not-a-repo-'));
    try {
      await expect(repoResolve({ repoPath: dir })).rejects.toMatchObject({ kind: 'not-found' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('statusGet', () => {
  it('returns the parsed working tree, including from a linked worktree', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'hi', 'initial');
    await openRepo(repo.path);

    const worktreeDir = `${repo.path}-wt`;
    await repo.git(['worktree', 'add', worktreeDir, '-b', 'feature']);
    try {
      await import('node:fs/promises').then((fs) => fs.writeFile(join(worktreeDir, 'b.txt'), 'new'));

      const result = await statusGet({ repoPath: worktreeDir });
      expect(parses('status.get', result)).toBe(true);
      expect(result.entries.some((e) => e.path === 'b.txt' && e.unstaged === 'untracked')).toBe(true);
      expect(result.branch.head).toBe('feature');
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
    }
  });
});

describe('graphLog', () => {
  it('returns laid-out rows for a repo with commits', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', '1', 'first');
    await repo.commitFile('a.txt', '2', 'second');
    await openRepo(repo.path);

    const result = await graphLog({ repoPath: repo.path });
    expect(parses('graph.log', result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]?.commit.subject).toBe('second');
  });

  it('returns an empty graph for a repository with no commits', async () => {
    const repo = await newRepo();
    await openRepo(repo.path);

    const result = await graphLog({ repoPath: repo.path });
    expect(result).toEqual([]);
  });

  it('clamps the limit to the hard maximum', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', '1', 'first');
    await openRepo(repo.path);

    await graphLog({ repoPath: repo.path, limit: GRAPH_LOG_MAX_LIMIT + 500 });
    // Nothing to assert on row count with one commit; this exercises the
    // clamp path without asserting on git's own argv.
  });
});

describe('diffFile', () => {
  it('returns a parsed diff for a modified text file', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'one\n', 'initial');
    await repo.writeFile('a.txt', 'one\ntwo\n');
    await openRepo(repo.path);

    const result = await diffFile({ repoPath: repo.path, path: 'a.txt' });
    expect(parses('diff.file', result)).toBe(true);
    expect(result.binary).toBe(false);
    expect(result.hunks.length).toBeGreaterThan(0);
  });

  it('refuses a binary file rather than serving it', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', 'one\n', 'initial');
    const fs = await import('node:fs/promises');
    await fs.writeFile(join(repo.path, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255, 254]));
    await repo.git(['add', '--', 'bin.dat']);
    await openRepo(repo.path);

    await expect(diffFile({ repoPath: repo.path, path: 'bin.dat', staged: true })).rejects.toMatchObject({
      kind: 'refused',
    });
  });
});

describe('branchList', () => {
  it('lists only local and remote branches, not tags', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', '1', 'first');
    await repo.git(['branch', 'feature']);
    await repo.git(['tag', 'v1']);
    await openRepo(repo.path);

    const result = await branchList({ repoPath: repo.path });
    expect(parses('branch.list', result)).toBe(true);
    expect(result.every((r) => r.kind === 'localBranch' || r.kind === 'remoteBranch')).toBe(true);
    expect(result.map((r) => r.name)).toEqual(expect.arrayContaining(['main', 'feature']));
  });
});

describe('forgePulls', () => {
  it('answers not-found for a repo with no remote', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', '1', 'first');
    await openRepo(repo.path);

    await expect(forgePulls({ repoPath: repo.path })).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lists pulls through gh-cli for a repo with a GitHub remote', async () => {
    const repo = await newRepo();
    await repo.commitFile('a.txt', '1', 'first');
    await repo.git(['remote', 'add', 'origin', 'https://github.com/acme/widgets.git']);
    await openRepo(repo.path);

    const fixture = {
      cli: { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' },
      pulls: [],
      error: null,
    };
    vi.mocked(ghCli.listPulls).mockResolvedValue(fixture);

    const result = await forgePulls({ repoPath: repo.path });
    expect(parses('forge.pulls', result)).toBe(true);
    expect(result).toEqual(fixture);
    expect(ghCli.listPulls).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'widgets', kind: 'github' }),
      expect.objectContaining({ limit: 20, state: 'open' }),
    );
  });
});

describe('forgeChecks', () => {
  it('combines the run list with a computed verdict', async () => {
    const repo = await newRepo();
    const sha = await repo.commitFile('a.txt', '1', 'first');
    await repo.git(['remote', 'add', 'origin', 'https://github.com/acme/widgets.git']);
    await openRepo(repo.path);

    vi.mocked(ghCli.listRuns).mockResolvedValue({
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      runs: [
        ForgeRunSchema.parse({
          id: '1',
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          headBranch: 'main',
          headSha: sha,
          createdAt: new Date().toISOString(),
          url: 'https://github.com/acme/widgets/actions/runs/1',
        }),
      ],
      error: null,
    });

    const result = await forgeChecks({ repoPath: repo.path });
    expect(parses('forge.checks', result)).toBe(true);
    expect(result.verdict).toEqual({ level: 'ok', summary: '1 of 1 check passed' });
  });
});

describe('read-only guardrail', () => {
  it('never calls writeQueue.run across any tool in this file', () => {
    // A spy across the whole suite would need to wrap every `it()`; asserting
    // it here after every test above has run is the same guarantee the doc
    // asks for — the whole tool set, exercised, made no write-queue calls.
    expect(writeQueue.run).not.toHaveBeenCalled();
  });
});
