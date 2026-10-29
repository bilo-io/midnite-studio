// @vitest-environment node
// vitest, not Playwright: channel registration over a recording context and a temp-dir repository.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TempRepo } from '@midnite/studio-git-engine';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, type GraphRow } from '@midnite/studio-shared';

import { CODER_GIT_CHANNELS, registerCoderGit } from './git';
import { GitProcess, systemGit } from './system-git';

let repo: TempRepo;
let first: string;
let second: string;

beforeEach(async () => {
  repo = await TempRepo.create();
  first = await repo.commitFile('README.md', 'hello\n', 'First commit');
  second = await repo.commitFile('README.md', 'hello\nworld\n', 'Second commit');
});
afterEach(async () => {
  await repo.cleanup();
});

function setup() {
  const ctx = createRecordingContext();
  registerCoderGit(ctx, { pathOf: (id) => (id === 'repo-1' ? repo.path : null) });
  return ctx;
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

// The vitest config aliases `dugite` to Coder's shim, exactly as the bundle does — so these run the
// system git. A machine with none skips them (CI's macOS runners have the Command Line Tools).
describe.skipIf(systemGit().path === null)('registerCoderGit', () => {
  it('registers exactly the read-only channels the graph and diff use — no write', () => {
    const ctx = setup();
    expect([...ctx.channels].sort()).toEqual([...CODER_GIT_CHANNELS].sort());
    for (const channel of ctx.channels) expect(channel).not.toMatch(/:op:|stage|commit:create|push|checkout|reset/);
  });

  it('streams laid-out rows for a repository in its list, then ends the stream', async () => {
    const ctx = setup();
    await ctx.invoke(CHANNELS.logStart, { repoId: 'repo-1', requestId: 'r#1', limit: 100, revisions: [] });
    await waitFor(() => ctx.emitted.some((e) => e.channel === EVENT_CHANNELS.logDone));
    const rows = ctx.emitted
      .filter((e) => e.channel === EVENT_CHANNELS.logBatch)
      .flatMap((e) => (e.payload as { rows: GraphRow[] }).rows);
    expect(rows.map((r) => r.commit.subject)).toEqual(['Second commit', 'First commit']);
    expect(rows[0]).toMatchObject({ lane: 0, row: 0 });
    expect(ctx.emitted.at(-1)).toEqual({
      channel: EVENT_CHANNELS.logDone,
      payload: { requestId: 'r#1', total: 2, truncated: false },
    });
  });

  it('answers refs, status, a commit and its diff from the checkout main holds — through the system git', async () => {
    const ctx = setup();
    const exec = vi.spyOn(GitProcess, 'exec');
    const refs = (await ctx.invoke(CHANNELS.repoRefs, { repoId: 'repo-1' })) as { name: string }[];
    expect(refs.map((r) => r.name)).toContain('main');
    const status = (await ctx.invoke(CHANNELS.statusGet, { repoId: 'repo-1' })) as { branch: { oid: string | null } };
    expect(status.branch.oid).toBe(second);
    const detail = (await ctx.invoke(CHANNELS.commitDetail, { repoId: 'repo-1', sha: second })) as { sha: string };
    expect(detail.sha).toBe(second);
    const diff = (await ctx.invoke(CHANNELS.commitFileDiff, { repoId: 'repo-1', sha: second, path: 'README.md' })) as {
      insertions: number;
    };
    expect(diff.insertions).toBe(1);
    const stats = (await ctx.invoke(CHANNELS.commitStats, { repoId: 'repo-1', shas: [first, second] })) as {
      stats: Record<string, unknown>;
    };
    expect(Object.keys(stats.stats).sort()).toEqual([first, second].sort());
    expect(exec).toHaveBeenCalled();
    exec.mockRestore();
  });

  it('runs nothing for a repository id it does not hold, and never takes a path from the renderer', async () => {
    const ctx = setup();
    expect(await ctx.invoke(CHANNELS.repoRefs, { repoId: 'elsewhere' })).toEqual([]);
    // A worktreePath that is not Coder's own is ignored: status reads the listed checkout, or nothing.
    const status = (await ctx.invoke(CHANNELS.statusGet, { repoId: 'elsewhere', worktreePath: '/' })) as {
      entries: unknown[];
      branch: { oid: string | null };
    };
    expect(status).toMatchObject({ entries: [], branch: { oid: null } });
    await ctx.invoke(CHANNELS.logStart, { repoId: 'elsewhere', requestId: 'r#2', limit: 10, revisions: [] });
    expect(ctx.emitted).toEqual([
      {
        channel: EVENT_CHANNELS.logDone,
        payload: { requestId: 'r#2', total: 0, truncated: false, error: 'That repository is no longer open.' },
      },
    ]);
  });
});
