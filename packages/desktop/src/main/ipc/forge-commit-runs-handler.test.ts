import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  The graph CI column's IPC handler, driven through the real registry and the
  real GitHub adapter — only `gh-cli`'s `listRuns` (the subprocess) and the
  repo/remote lookups are mocked. Same arrangement as
  `forge-project-handlers.test.ts`: `ipcMain.handle` is captured so the
  registered handler can be invoked directly.
*/
const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
}));

const { resolveWorkdir } = vi.hoisted(() => ({ resolveWorkdir: vi.fn() }));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));

const { listRemotes } = vi.hoisted(() => ({ listRemotes: vi.fn() }));
vi.mock('@midnite/studio-git-engine', () => ({ listRemotes }));

const { listRuns } = vi.hoisted(() => ({ listRuns: vi.fn() }));
vi.mock('../forge/github/gh-cli', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../forge/github/gh-cli')>()),
  listRuns,
}));

vi.mock('../forge/forge-accounts', () => ({ activeAccountFor: vi.fn(async () => null) }));
vi.mock('../window-manager', () => ({ resolveWindow: vi.fn(() => null) }));

const CHANNEL = 'mstudio:forge:commit-runs';
const OK_CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const githubRemote = {
  name: 'origin',
  url: 'https://github.com/acme/widgets.git',
  pushUrl: 'https://github.com/acme/widgets.git',
  forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' as const },
};
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const run = (headSha: string, id: string, status = 'completed', conclusion: string | null = 'success') => ({
  id,
  name: 'CI',
  status,
  conclusion,
  headBranch: 'main',
  headSha,
  createdAt: '2026-09-01T10:00:00Z',
  url: `https://github.com/acme/widgets/actions/runs/${id}`,
  event: 'push',
  workflowId: '1',
  workflowName: 'CI',
  startedAt: null,
  updatedAt: null,
  displayTitle: null,
  number: null,
  attempt: null,
});

let registerForgeHandlers: () => void;
let commitRuns: { clear: () => void };
beforeAll(async () => {
  ({ registerForgeHandlers, commitRuns } = await import('./forge-handlers'));
});

beforeEach(() => {
  handlers.clear();
  resolveWorkdir.mockReset();
  listRemotes.mockReset();
  listRuns.mockReset();
  commitRuns.clear();
  registerForgeHandlers();
});

const invoke = (payload: unknown) => handlers.get(CHANNEL)?.(null, payload);

describe('forgeCommitRuns', () => {
  it('resolves owner/repo from the repo and answers a batch keyed by sha', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    listRuns.mockResolvedValue({
      cli: OK_CLI,
      runs: [run(A, '1', 'in_progress', null), run(B, '2', 'completed', 'failure')],
      error: null,
    });

    const result = (await invoke({ repoId: 'r1', shas: [A, B] })) as {
      runs: Record<string, Array<{ id: string }>>;
      error: string | null;
    };

    expect(listRuns).toHaveBeenCalledTimes(1);
    expect(listRuns).toHaveBeenCalledWith(githubRemote.forge, { limit: 100 });
    expect(result.error).toBeNull();
    expect(result.runs[A]?.map((r) => r.id)).toEqual(['1']);
    expect(result.runs[B]?.map((r) => r.id)).toEqual(['2']);
  });

  it('uses `gh run list --commit` for a sha older than the recent page', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    const full = Array.from({ length: 100 }, (_, i) => run('f'.repeat(40), `9${i}`));
    listRuns.mockImplementation(async (_forge: unknown, options: { commit?: string }) =>
      options.commit ? { cli: OK_CLI, runs: [run(A, '7')], error: null } : { cli: OK_CLI, runs: full, error: null },
    );

    const result = (await invoke({ repoId: 'r1', shas: [A] })) as { runs: Record<string, unknown[]> };

    expect(listRuns).toHaveBeenCalledWith(githubRemote.forge, { limit: 20, commit: A });
    expect(result.runs[A]).toHaveLength(1);
  });

  it('answers a repo with no forge remote with an empty map and no error', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([]);

    const result = await invoke({ repoId: 'r1', shas: [A] });

    expect(listRuns).not.toHaveBeenCalled();
    expect(result).toMatchObject({ runs: {}, error: null, cli: { reason: 'not-installed' } });
  });

  it('rejects an abbreviated or injected sha at the boundary', async () => {
    for (const shas of [['abc1234'], [`${A};rm -rf ~`], []]) {
      const result = await invoke({ repoId: 'r1', shas });
      expect(result).toMatchObject({ runs: {} });
      expect((result as { error: string | null }).error).toMatch(/commit-runs/);
    }
    expect(listRuns).not.toHaveBeenCalled();
  });

  it('never throws when the subprocess layer does', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    listRuns.mockRejectedValue(new Error('gh exploded'));

    const result = await invoke({ repoId: 'r1', shas: [A] });

    expect(result).toMatchObject({ runs: {}, error: 'gh exploded' });
  });
});
