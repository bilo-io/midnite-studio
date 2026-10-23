import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readCommitStats } from './commit-stats';
import { readCommitDetail } from './log';

/**
 * The graph row's Diff column against the commit inspector, on real git output.
 *
 * The invariant every case pins: a row's `+added −deleted` over `files` is the
 * sum of the per-file numstat the inspector lists for the same commit, against
 * the same parent (the first one, for a merge). The unit test beside the parser
 * feeds it hand-built records; this one exists because the bug it guards lived
 * in the gap between those records and what git actually prints.
 */

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

/** What the inspector shows for one commit, summed the way the row should be. */
async function detailSum(sha: string) {
  const detail = await readCommitDetail(repo.path, sha);
  if (!detail) throw new Error(`no detail for ${sha}`);
  return {
    added: detail.files.reduce((sum, file) => sum + file.insertions, 0),
    deleted: detail.files.reduce((sum, file) => sum + file.deletions, 0),
    files: detail.files.length,
  };
}

async function expectRowMatchesDetail(sha: string) {
  const stats = await readCommitStats(repo.path, [sha]);
  expect(stats[sha]).toEqual(await detailSum(sha));
}

describe('readCommitStats', () => {
  it('counts a one-line edit as +1 −1 over one file (the reported case)', async () => {
    await repo.commitFile('_INDEX.md', 'one\ntwo\nthree\n', 'seed');
    const sha = await repo.commitFile(
      '_INDEX.md',
      'one\nTWO\nthree\n',
      'chore(todo): claim Phase 121 Theme G (WIP)',
    );

    expect((await readCommitStats(repo.path, [sha]))[sha]).toEqual({
      added: 1,
      deleted: 1,
      files: 1,
    });
    await expectRowMatchesDetail(sha);
  });

  it('counts every file of a multi-file commit, the first one included', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await repo.writeFile('a.ts', 'a\n');
    await repo.writeFile('b.ts', 'b\nb\n');
    await repo.writeFile('c.ts', 'c\nc\nc\n');
    await repo.git(['add', '--', 'a.ts', 'b.ts', 'c.ts']);
    const sha = await repo.commit('three files');

    expect((await readCommitStats(repo.path, [sha]))[sha]).toEqual({
      added: 6,
      deleted: 0,
      files: 3,
    });
    await expectRowMatchesDetail(sha);
  });

  it('counts a binary file as a changed file with no lines', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await repo.writeFile('img.bin', 'PNG\0\x01\x02binary\0payload');
    await repo.writeFile('notes.md', 'one\n');
    await repo.git(['add', '--', 'img.bin', 'notes.md']);
    const sha = await repo.commit('binary + text');

    expect((await readCommitStats(repo.path, [sha]))[sha]).toEqual({
      added: 1,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(sha);
  });

  it('counts a rename as one file, the way the inspector lists it', async () => {
    await repo.commitFile('old-name.txt', 'a\nb\nc\nd\ne\nf\ng\nh\n', 'seed');
    await repo.git(['mv', 'old-name.txt', 'new-name.txt']);
    const pure = await repo.commit('pure rename');

    expect((await readCommitStats(repo.path, [pure]))[pure]).toEqual({
      added: 0,
      deleted: 0,
      files: 1,
    });
    await expectRowMatchesDetail(pure);

    // A rename with an edit: still one file, carrying only the edit.
    await repo.git(['mv', 'new-name.txt', 'renamed again.txt']);
    await repo.writeFile('renamed again.txt', 'a\nb\nc\nd\ne\nf\ng\nH\n');
    await repo.git(['add', '--', 'renamed again.txt']);
    const edited = await repo.commit('rename + edit');

    expect((await readCommitStats(repo.path, [edited]))[edited]).toEqual({
      added: 1,
      deleted: 1,
      files: 1,
    });
    await expectRowMatchesDetail(edited);
  });

  it('counts a merge against its first parent, as the inspector does', async () => {
    await repo.commitFile('base.txt', 'base\n', 'seed');
    await repo.git(['checkout', '-q', '-b', 'side']);
    await repo.commitFile('side-a.txt', '1\n2\n', 'side a');
    await repo.commitFile('side-b.txt', '3\n', 'side b');
    await repo.git(['checkout', '-q', '-']);
    await repo.commitFile('base.txt', 'BASE\n', 'main edit');
    await repo.git(['merge', '--no-ff', '-q', '-m', 'merge side', 'side']);
    const merge = await repo.head();

    // First-parent diff: what the side branch brought onto main.
    expect((await readCommitStats(repo.path, [merge]))[merge]).toEqual({
      added: 3,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(merge);

    // `-m` would take its mode from `log.diffMerges`, and `remerge` prints no
    // numstat for a clean merge: both sides would agree on an empty +0 −0.
    await repo.git(['config', 'log.diffMerges', 'remerge']);
    expect((await readCommitStats(repo.path, [merge]))[merge]).toEqual({
      added: 3,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(merge);
  });

  it('counts a root commit against the empty tree', async () => {
    await repo.writeFile('a.txt', '1\n2\n3\n');
    await repo.writeFile('b.txt', '4\n');
    await repo.git(['add', '--', 'a.txt', 'b.txt']);
    const root = await repo.commit('root');

    expect((await readCommitStats(repo.path, [root]))[root]).toEqual({
      added: 4,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(root);

    // `log.showRoot=false` would blank a root's diff in `git log`; `--root` keeps it.
    await repo.git(['config', 'log.showRoot', 'false']);
    expect((await readCommitStats(repo.path, [root]))[root]).toEqual({
      added: 4,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(root);
  });

  it('agrees with the inspector when the user has turned rename detection off', async () => {
    await repo.commitFile('before.txt', 'a\nb\nc\n', 'seed');
    await repo.git(['mv', 'before.txt', 'after.txt']);
    const sha = await repo.commit('rename');
    await repo.git(['config', 'diff.renames', 'false']);

    // Both readers honour the same config: a delete plus an add, on both sides.
    expect((await readCommitStats(repo.path, [sha]))[sha]).toEqual({
      added: 3,
      deleted: 3,
      files: 2,
    });
    await expectRowMatchesDetail(sha);
  });

  it('is NUL-safe for paths holding tabs and newlines', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await repo.writeFile('tab\there.txt', 'a\n');
    await repo.writeFile('new\nline.txt', 'b\nc\n');
    await repo.git(['add', '--', 'tab\there.txt', 'new\nline.txt']);
    const sha = await repo.commit('odd paths');

    expect((await readCommitStats(repo.path, [sha]))[sha]).toEqual({
      added: 3,
      deleted: 0,
      files: 2,
    });
    await expectRowMatchesDetail(sha);
  });

  it('still answers for the rest of a page when one sha is unknown', async () => {
    const a = await repo.commitFile('a.txt', 'a\n', 'a');
    const b = await repo.commitFile('b.txt', 'b\nb\n', 'b');
    const missing = 'f'.repeat(40);

    const stats = await readCommitStats(repo.path, [a, missing, b]);

    expect(stats).toEqual({
      [a]: { added: 1, deleted: 0, files: 1 },
      [b]: { added: 2, deleted: 0, files: 1 },
    });
  });

  it('keeps every stat aligned to its own sha across a large, shuffled batch', async () => {
    // 60 commits in one `git log --no-walk` call, asked for out of order: any
    // record-splitting or off-by-one alignment would surface here. Each commit
    // adds a different number of lines, so a stat landing on the wrong sha
    // cannot pass by coincidence. (The 25-row page and the IPC's 50-sha cap
    // sit above this function; this pins the parser on a batch bigger than either.)
    const shas: string[] = [];
    let body = '';
    for (let n = 1; n <= 60; n += 1) {
      body += `${'line\n'.repeat(n)}`;
      shas.push(await repo.commitFile('grow.txt', body, `commit ${n}`));
    }

    // Asked for newest-first and shuffled, as the graph's pages are not sorted.
    const asked = [...shas].reverse();
    asked.splice(10, 0, ...asked.splice(40, 5));
    const stats = await readCommitStats(repo.path, asked);

    expect(Object.keys(stats)).toHaveLength(60);
    shas.forEach((sha, index) => {
      expect(stats[sha]).toEqual({ added: index + 1, deleted: 0, files: 1 });
    });
  });
});
