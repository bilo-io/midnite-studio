import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { listRefs } from './refs';
import {
  checkout,
  countOrphanedCommits,
  createBranch,
  createTag,
  deleteBranch,
  renameBranch,
  reset,
} from './refs-ops';
import { getStatus } from './status';
import { addWorktree } from './worktree-ops';

let repo: TempRepo;
let first: string;
let second: string;

beforeEach(async () => {
  repo = await TempRepo.create();
  first = await repo.commitFile('a.txt', 'one\n', 'first');
  second = await repo.commitFile('b.txt', 'two\n', 'second');
});

afterEach(async () => {
  await repo.cleanup();
});

/** Every error arm asserts on the mapped message, not just on failure. */
const errorMessage = (result: Awaited<ReturnType<typeof checkout>>): string => {
  if (result.ok || result.kind !== 'error') throw new Error('expected an error result');
  return result.message;
};

describe('checkout', () => {
  it('switches branches', async () => {
    await repo.git(['branch', 'feature', first]);
    expect(await checkout(repo.path, { target: 'feature' })).toEqual({ ok: true });
    expect((await getStatus(repo.path)).branch.head).toBe('feature');
  });

  it('detaches onto a commit', async () => {
    expect(await checkout(repo.path, { target: first, detach: true })).toEqual({ ok: true });
    const status = await getStatus(repo.path);
    expect(status.branch.detached).toBe(true);
    expect(status.branch.oid).toBe(first);
  });

  it('explains a dirty tree instead of echoing git', async () => {
    // git prints a file list then "Please commit your changes or stash them";
    // the first line alone says nothing actionable.
    //
    // The file has to DIFFER between the two commits as well as being dirty —
    // git happily carries a local edit across a checkout when the file is
    // identical on both sides, which is not the case under test.
    await repo.git(['branch', 'other', first]);
    await repo.commitFile('a.txt', 'main moved on\n', 'main edits a.txt');
    await repo.writeFile('a.txt', 'uncommitted\n');

    const result = await checkout(repo.path, { target: 'other' });
    expect(errorMessage(result)).toMatch(/uncommitted changes/i);
    expect(errorMessage(result)).toMatch(/commit or discard/i);
  });

  it('explains a branch checked out in another worktree', async () => {
    await addWorktree(repo.path, {
      path: join(repo.path, 'wt'),
      branch: 'taken',
      createBranch: true,
    });

    expect(errorMessage(await checkout(repo.path, { target: 'taken' }))).toMatch(
      /only be checked out once/i,
    );
  });

  it('explains an unknown ref', async () => {
    expect(errorMessage(await checkout(repo.path, { target: 'no-such-branch' }))).toMatch(
      /not a branch, tag or commit/i,
    );
  });
});

describe('branch create / rename / delete', () => {
  it('creates a branch at a start point without switching', async () => {
    expect(await createBranch(repo.path, { name: 'from-first', startPoint: first })).toEqual({
      ok: true,
    });

    const refs = await listRefs(repo.path);
    expect(refs.find((r) => r.name === 'from-first')?.sha).toBe(first);
    expect((await getStatus(repo.path)).branch.head).toBe('main');
  });

  it('creates and switches in one step', async () => {
    await createBranch(repo.path, { name: 'switched', startPoint: first, checkout: true });
    expect((await getStatus(repo.path)).branch.head).toBe('switched');
  });

  it('rejects a duplicate branch name', async () => {
    await createBranch(repo.path, { name: 'dupe', startPoint: first });
    expect(errorMessage(await createBranch(repo.path, { name: 'dupe', startPoint: first }))).toMatch(
      /already exists/i,
    );
  });

  it('rejects an invalid branch name', async () => {
    expect(
      errorMessage(await createBranch(repo.path, { name: 'bad name', startPoint: first })),
    ).toBeTruthy();
  });

  it('renames a branch', async () => {
    await createBranch(repo.path, { name: 'old', startPoint: first });
    expect(await renameBranch(repo.path, 'old', 'new')).toEqual({ ok: true });

    const names = (await listRefs(repo.path)).map((r) => r.name);
    expect(names).toContain('new');
    expect(names).not.toContain('old');
  });

  it('deletes a merged branch', async () => {
    await createBranch(repo.path, { name: 'merged', startPoint: first });
    expect(await deleteBranch(repo.path, { name: 'merged' })).toEqual({ ok: true });
  });

  it('refuses an unmerged branch and says what would be lost', async () => {
    // git's refusal is protective — only the reflog would stand between the
    // user and losing those commits.
    await repo.git(['checkout', '-q', '-b', 'unmerged']);
    await repo.commitFile('c.txt', 'three\n', 'unmerged work');
    await repo.git(['checkout', '-q', 'main']);

    expect(errorMessage(await deleteBranch(repo.path, { name: 'unmerged' }))).toMatch(
      /not merged anywhere else/i,
    );
  });

  it('deletes an unmerged branch when force is explicitly requested', async () => {
    await repo.git(['checkout', '-q', '-b', 'doomed']);
    await repo.commitFile('c.txt', 'three\n', 'doomed work');
    await repo.git(['checkout', '-q', 'main']);

    expect(await deleteBranch(repo.path, { name: 'doomed', force: true })).toEqual({ ok: true });
  });

  it('refuses to delete a branch checked out in a worktree', async () => {
    await addWorktree(repo.path, {
      path: join(repo.path, 'wt'),
      branch: 'live',
      createBranch: true,
    });

    expect(errorMessage(await deleteBranch(repo.path, { name: 'live', force: true }))).toMatch(
      /checked out in a worktree/i,
    );
  });
});

describe('tags', () => {
  it('creates a lightweight tag pointing straight at the commit', async () => {
    expect(await createTag(repo.path, { name: 'v1', target: first })).toEqual({ ok: true });
    expect((await listRefs(repo.path)).find((r) => r.name === 'v1')?.sha).toBe(first);
  });

  it('creates an annotated tag that still resolves to the commit', async () => {
    // An annotated tag is its own object; the graph joins badges by COMMIT sha,
    // so the peeling in the refs parser has to hold here too.
    expect(
      await createTag(repo.path, { name: 'v2', target: second, message: 'release two' }),
    ).toEqual({ ok: true });

    expect((await listRefs(repo.path)).find((r) => r.name === 'v2')?.sha).toBe(second);
  });

  it('rejects a duplicate tag name', async () => {
    await createTag(repo.path, { name: 'v3', target: first });
    expect(errorMessage(await createTag(repo.path, { name: 'v3', target: second }))).toMatch(
      /already exists/i,
    );
  });
});

describe('reset', () => {
  it('soft reset moves the branch and keeps the changes staged', async () => {
    expect(await reset(repo.path, first, 'soft')).toEqual({ ok: true });

    const status = await getStatus(repo.path);
    expect(status.branch.oid).toBe(first);
    expect(status.entries.find((e) => e.path === 'b.txt')?.staged).toBe('added');
  });

  it('mixed reset moves the branch and unstages the changes', async () => {
    await reset(repo.path, first, 'mixed');
    expect((await getStatus(repo.path)).entries.find((e) => e.path === 'b.txt')?.unstaged).toBe(
      'untracked',
    );
  });

  it('hard reset discards the working tree', async () => {
    await reset(repo.path, first, 'hard');

    const status = await getStatus(repo.path);
    expect(status.branch.oid).toBe(first);
    expect(status.entries).toEqual([]);
  });

  it('rejects an unknown target', async () => {
    expect(errorMessage(await reset(repo.path, 'deadbeef', 'hard'))).toMatch(
      /not a commit in this repository/i,
    );
  });
});

describe('countOrphanedCommits', () => {
  it('counts what a reset would orphan and samples their subjects', async () => {
    // The number IS the confirm dialog: "this discards 2 commits" is a decision
    // a user can make; "are you sure?" is not.
    await repo.commitFile('c.txt', 'three\n', 'third');

    const { count, sample } = await countOrphanedCommits(repo.path, {
      from: 'HEAD',
      to: first,
      movingRef: 'refs/heads/main',
    });

    expect(count).toBe(2);
    expect(sample.map((c) => c.subject)).toEqual(['third', 'second']);
  });

  it('does NOT count a commit that another branch still holds', async () => {
    // The whole reason this isn't `rev-list --count to..from`. Saying "2 commits
    // will be orphaned" when one is safely on `feature` is the kind of wrong
    // number that teaches people to click through safety dialogs unread.
    await repo.git(['branch', 'keeper', second]);
    await repo.commitFile('c.txt', 'three\n', 'third');

    const { count, sample } = await countOrphanedCommits(repo.path, {
      from: 'HEAD',
      to: first,
      movingRef: 'refs/heads/main',
    });

    expect(count).toBe(1);
    expect(sample.map((c) => c.subject)).toEqual(['third']);
  });

  it('counts what deleting a branch would orphan', async () => {
    await repo.git(['checkout', '-q', '-b', 'doomed']);
    await repo.commitFile('d.txt', 'four\n', 'only on doomed');
    await repo.git(['checkout', '-q', 'main']);

    const { count } = await countOrphanedCommits(repo.path, {
      from: 'doomed',
      movingRef: 'refs/heads/doomed',
    });

    expect(count).toBe(1);
  });

  it('counts zero for a branch fully merged elsewhere', async () => {
    await repo.git(['branch', 'merged', first]);
    expect(
      await countOrphanedCommits(repo.path, { from: 'merged', movingRef: 'refs/heads/merged' }),
    ).toEqual({ count: 0, sample: [] });
  });

  it('returns zero when nothing would be orphaned', async () => {
    expect(
      await countOrphanedCommits(repo.path, { from: first, to: 'HEAD', movingRef: 'refs/heads/main' }),
    ).toEqual({ count: 0, sample: [] });
  });

  it('returns zero rather than throwing for an unknown ref', async () => {
    expect(await countOrphanedCommits(repo.path, { from: 'nope', to: 'HEAD' })).toEqual({
      count: 0,
      sample: [],
    });
  });
});
