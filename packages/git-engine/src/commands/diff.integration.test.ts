import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readCommitFileDiff, readFileDiff, readRefDiff } from './diff';
import { readCommitDetail } from './log';

/**
 * The unit tests in parsers/diff-parser.test.ts assert the parser against
 * hand-written patches. These assert that real git actually emits those shapes —
 * the failure mode a fixture can never catch.
 */
describe('diff commands (integration)', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('reads a worktree modification with correct line numbers', async () => {
    await repo.commitFile('a.txt', 'one\ntwo\nthree\n', 'add a');
    await repo.writeFile('a.txt', 'one\nTWO\nthree\n');

    const diff = await readFileDiff(repo.path, 'a.txt', false);

    expect(diff.path).toBe('a.txt');
    expect(diff.change).toBe('modified');
    expect(diff.insertions).toBe(1);
    expect(diff.deletions).toBe(1);

    const kinds = diff.hunks[0]!.lines.map((l) => l.kind);
    expect(kinds).toEqual(['ctx', 'del', 'add', 'ctx']);
    expect(diff.hunks[0]!.lines[1]).toMatchObject({ oldNo: 2, newNo: null, text: 'two' });
    expect(diff.hunks[0]!.lines[2]).toMatchObject({ oldNo: null, newNo: 2, text: 'TWO' });
  });

  it('distinguishes the staged diff from the worktree diff', async () => {
    await repo.commitFile('a.txt', 'base\n', 'add a');
    await repo.writeFile('a.txt', 'staged\n');
    await repo.git(['add', '--', 'a.txt']);
    await repo.writeFile('a.txt', 'unstaged\n');

    const staged = await readFileDiff(repo.path, 'a.txt', true);
    const worktree = await readFileDiff(repo.path, 'a.txt', false);

    expect(staged.hunks[0]!.lines.find((l) => l.kind === 'add')?.text).toBe('staged');
    expect(worktree.hunks[0]!.lines.find((l) => l.kind === 'add')?.text).toBe('unstaged');
  });

  it('shows an untracked file as an addition rather than "no changes"', async () => {
    await repo.commitFile('a.txt', 'a\n', 'init');
    await repo.writeFile('brand-new.txt', 'hello\nworld\n');

    const diff = await readFileDiff(repo.path, 'brand-new.txt', false);

    expect(diff.change).toBe('added');
    expect(diff.insertions).toBe(2);
    expect(diff.hunks[0]!.lines.map((l) => l.text)).toEqual(['hello', 'world']);
  });

  it('honours the -U context value it is given', async () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    await repo.commitFile('a.txt', `${body}\n`, 'add a');
    await repo.writeFile('a.txt', `${body.replace('line 15', 'CHANGED')}\n`);

    const tight = await readFileDiff(repo.path, 'a.txt', false, { context: 1 });
    const wide = await readFileDiff(repo.path, 'a.txt', false, { context: 8 });

    expect(tight.contextLines).toBe(1);
    expect(wide.contextLines).toBe(8);
    // 1 line of context each side + the change; then 8 each side.
    expect(tight.hunks[0]!.lines).toHaveLength(4);
    expect(wide.hunks[0]!.lines).toHaveLength(18);
  });

  it('detects a rename when told the pre-image path', async () => {
    await repo.commitFile('old-name.txt', 'stable content here\nsecond line\n', 'add');
    await rename(join(repo.path, 'old-name.txt'), join(repo.path, 'new-name.txt'));
    await repo.git(['add', '-A']);

    const diff = await readFileDiff(repo.path, 'new-name.txt', true, {
      oldPath: 'old-name.txt',
    });

    expect(diff.change).toBe('renamed');
    expect(diff.oldPath).toBe('old-name.txt');
    expect(diff.path).toBe('new-name.txt');
  });

  it('reports a rename as a fresh addition when the pre-image path is withheld', async () => {
    // Documents the constraint that makes `oldPath` necessary: a pathspec is
    // applied before rename detection pairs a deletion with an addition, so a
    // path-scoped diff sees only the new file. Callers have this from
    // StatusEntry.origPath — this asserts the limitation is understood, not that
    // the behaviour is desirable.
    await repo.commitFile('old-name.txt', 'stable content here\nsecond line\n', 'add');
    await rename(join(repo.path, 'old-name.txt'), join(repo.path, 'new-name.txt'));
    await repo.git(['add', '-A']);

    const diff = await readFileDiff(repo.path, 'new-name.txt', true);

    expect(diff.change).toBe('added');
  });

  it('flags a binary file and produces no hunks', async () => {
    await repo.commitFile('a.txt', 'a\n', 'init');
    // A NUL byte is what makes git call it binary.
    await repo.writeFile('blob.bin', 'aaa\u0000bbb');
    await repo.git(['add', '--', 'blob.bin']);

    const diff = await readFileDiff(repo.path, 'blob.bin', true);

    expect(diff.binary).toBe(true);
    expect(diff.hunks).toEqual([]);
  });

  it('reports a file with no trailing newline', async () => {
    await repo.commitFile('a.txt', 'one\n', 'add a');
    await repo.writeFile('a.txt', 'one\ntwo');

    const diff = await readFileDiff(repo.path, 'a.txt', false);
    const added = diff.hunks[0]!.lines.filter((l) => l.kind === 'add');

    expect(added.at(-1)).toMatchObject({ text: 'two', noNewline: true });
  });

  it('reads a path out of a specific commit, not the worktree', async () => {
    await repo.commitFile('a.txt', 'v1\n', 'first');
    const second = await repo.commitFile('a.txt', 'v2\n', 'second');
    await repo.commitFile('a.txt', 'v3\n', 'third');

    const diff = await readCommitFileDiff(repo.path, second, 'a.txt');

    expect(diff.hunks[0]!.lines.find((l) => l.kind === 'del')?.text).toBe('v1');
    expect(diff.hunks[0]!.lines.find((l) => l.kind === 'add')?.text).toBe('v2');
  });

  it('reads a rename inside a commit as a rename, given the pre-image path', async () => {
    // The pre-image path comes from readCommitDetail's numstat, which keeps the
    // rename `from` token for exactly this call.
    await repo.commitFile('before.txt', 'line one\nline two\nline three\n', 'add');
    await repo.git(['mv', 'before.txt', 'after.txt']);
    await repo.writeFile('after.txt', 'line one\nline TWO\nline three\n');
    await repo.git(['add', '-A']);
    const sha = await repo.commit('rename and edit');

    const detail = await readCommitDetail(repo.path, sha);
    // Non-null asserted rather than optional-chained: a null here means the sha
    // did not resolve, which would make every assertion below vacuously pass.
    const entry = detail!.files.find((f) => f.path === 'after.txt');
    expect(entry?.oldPath).toBe('before.txt');

    const diff = await readCommitFileDiff(repo.path, sha, 'after.txt', {
      oldPath: entry?.oldPath ?? undefined,
    });

    expect(diff.change).toBe('renamed');
    expect(diff.oldPath).toBe('before.txt');
    // One line changed — not the whole file re-added.
    expect(diff.insertions).toBe(1);
    expect(diff.deletions).toBe(1);
  });

  it('reads the first commit in a repo, which has no parent', async () => {
    const first = await repo.commitFile('a.txt', 'hello\n', 'root commit');

    const diff = await readCommitFileDiff(repo.path, first, 'a.txt');

    expect(diff.change).toBe('added');
    expect(diff.insertions).toBe(1);
    expect(diff.deletions).toBe(0);
  });

  it('reads a merge commit against its first parent instead of returning nothing', async () => {
    // `git show` on a merge prints no diff at all by default — a merge has no
    // single pre-image. Without -m/--first-parent this returns empty hunks.
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('feature.txt', 'from feature\n', 'feature work');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('main.txt', 'from main\n', 'main work');
    await repo.git(['merge', '--no-ff', '-m', 'merge feature', 'feature']);
    const mergeSha = await repo.head();

    const diff = await readCommitFileDiff(repo.path, mergeSha, 'feature.txt');

    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.hunks[0]!.lines.find((l) => l.kind === 'add')?.text).toBe('from feature');
  });

  it('reads a deleted path with its real name, not the fallback', async () => {
    await repo.commitFile('doomed.txt', 'bye\n', 'add');
    await rm(join(repo.path, 'doomed.txt'));
    await repo.git(['add', '-A']);

    const diff = await readFileDiff(repo.path, 'doomed.txt', true);

    expect(diff.change).toBe('deleted');
    expect(diff.path).toBe('doomed.txt');
    expect(diff.deletions).toBe(1);
  });

  it('caps a large diff and says how much it dropped', async () => {
    await repo.commitFile('big.txt', 'seed\n', 'seed');
    const huge = Array.from({ length: 500 }, (_, i) => `generated line ${i}`).join('\n');
    await repo.writeFile('big.txt', `seed\n${huge}\n`);

    const diff = await readFileDiff(repo.path, 'big.txt', false, { maxLines: 100 });

    expect(diff.truncated).toBe(true);
    expect(diff.droppedLines).toBeGreaterThan(0);
    expect(diff.hunks.reduce((n, h) => n + h.lines.length, 0)).toBe(100);
  });

  it('marks only the changed word within a modified line', async () => {
    await repo.commitFile('a.ts', 'const timeout = 500;\n', 'add');
    await repo.writeFile('a.ts', 'const timeout = 1500;\n');

    const diff = await readFileDiff(repo.path, 'a.ts', false);
    const add = diff.hunks[0]!.lines.find((l) => l.kind === 'add')!;

    expect(add.ranges).toHaveLength(1);
    expect(add.text.slice(add.ranges[0]!.start, add.ranges[0]!.end)).toBe('1500');
  });

  it('reads a diff between two arbitrary commits, not just a commit and its own parent', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    const base = (await repo.git(['rev-parse', 'HEAD'])).trim();
    await repo.git(['checkout', '-q', '-b', 'side']);
    await repo.commitFile('a.txt', 'two\n', 'side commit');
    const side = (await repo.git(['rev-parse', 'HEAD'])).trim();

    const diff = await readRefDiff(repo.path, base, side, 'a.txt');

    expect(diff.hunks[0]!.lines.find((l) => l.kind === 'add')?.text).toBe('two');
  });
});
