import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { conflictedPaths, detectInProgress } from './status';
import {
  listStashes,
  readStashDetail,
  readStashFileDiff,
  stashApply,
  stashBranch,
  stashDrop,
  stashPop,
  stashPush,
  stashStore,
} from './stash';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('stashPush', () => {
  it('stashes tracked changes and leaves a clean tree', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');

    expect(await stashPush(repo.path, { message: 'wip' })).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\n');

    const stashes = await listStashes(repo.path);
    expect(stashes).toHaveLength(1);
    expect(stashes[0]?.message).toContain('wip');
    expect(stashes[0]?.selector).toBe('stash@{0}');
    // No `-u`: two parents (HEAD + index), no third for untracked files.
    expect(stashes[0]?.parents).toHaveLength(2);
  });

  it('reports nothing to stash on a clean tree', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');

    const result = await stashPush(repo.path);
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/nothing to stash/i);
  });

  it('keeps staged changes in the index with --keep-index', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await repo.git(['add', '--', 'a.txt']);

    expect(await stashPush(repo.path, { keepIndex: true })).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n');
  });

  it('captures untracked files with -u, giving the stash a third parent', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('new.txt', 'untracked\n');

    expect(await stashPush(repo.path, { includeUntracked: true })).toEqual({ ok: true });
    expect((await listStashes(repo.path))[0]?.parents).toHaveLength(3);
  });

  it('scopes the stash to the given paths', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.commitFile('b.txt', 'one\n', 'base b');
    await repo.writeFile('a.txt', 'changed\n');
    await repo.writeFile('b.txt', 'changed\n');

    expect(await stashPush(repo.path, { paths: ['a.txt'] })).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\n');
    expect(await readFile(join(repo.path, 'b.txt'), 'utf8')).toBe('changed\n');
  });
});

describe('stashPop / stashApply', () => {
  it('pop restores the change and removes the entry', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    expect(await stashPop(repo.path, 'stash@{0}')).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n');
    expect(await listStashes(repo.path)).toEqual([]);
  });

  it('apply restores the change and keeps the entry', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    expect(await stashApply(repo.path, 'stash@{0}')).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n');
    expect(await listStashes(repo.path)).toHaveLength(1);
  });

  it('returns the conflict arm on a conflicted pop, and does not drop the stash', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'stashed\n');
    await stashPush(repo.path);
    // Diverge the working tree from what the stash expects to apply onto.
    await repo.writeFile('a.txt', 'diverged\n');
    await repo.git(['add', '--', 'a.txt']);
    await repo.commit('diverge');

    const result = await stashPop(repo.path, 'stash@{0}');
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(result.op).toBe('stash-apply');
    expect(result.files).toEqual(['a.txt']);
    expect(await conflictedPaths(repo.path)).toEqual(['a.txt']);

    // The one behaviour worth asserting explicitly: git itself does not drop
    // a stash that failed to apply cleanly.
    expect(await listStashes(repo.path)).toHaveLength(1);
    // And it does not leave a merge/rebase-shaped in-progress state either —
    // a stash conflict has no sequencer state to abort or continue.
    expect(await detectInProgress(repo.path)).toBeNull();
  });

  it('does not misreport a pre-existing unrelated conflict as this op\'s own', async () => {
    // A working tree can already have unmerged paths sitting in it — nothing
    // about `stash pop` requires a clean tree first. An invalid selector must
    // still surface as an error, not as a phantom conflict on a file this
    // call never touched.
    await repo.commitFile('shared.txt', 'base\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    await repo.commitFile('shared.txt', 'feature\n', 'feature side');
    await repo.git(['checkout', '-q', 'main']);
    await repo.commitFile('shared.txt', 'main\n', 'main side');
    await repo.gitAllowFailure(['merge', 'feature']);
    expect(await conflictedPaths(repo.path)).toEqual(['shared.txt']);

    // No stash exists at all, so `stash@{0}` is invalid — a plain failure.
    const result = await stashPop(repo.path, 'stash@{0}');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.kind).toBe('error');

    // The pre-existing conflict is untouched and still not this op's doing.
    expect(await conflictedPaths(repo.path)).toEqual(['shared.txt']);
  });
});

describe('stashDrop', () => {
  it('drops the entry and captures the recovered sha', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    const result = await stashDrop(repo.path, 'stash@{0}');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.recoveredSha).toMatch(/^[0-9a-f]{40}$/);
    expect(await listStashes(repo.path)).toEqual([]);
  });
});

describe('stashStore', () => {
  it('restores a dropped stash from its captured sha — Phase 22 Theme H undo', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path, { message: 'wip' });

    const dropped = await stashDrop(repo.path, 'stash@{0}');
    if (!dropped.ok || dropped.recoveredSha === undefined) {
      throw new Error('expected a recovered sha');
    }
    expect(await listStashes(repo.path)).toEqual([]);

    expect(await stashStore(repo.path, dropped.recoveredSha, 'wip')).toEqual({ ok: true });

    const restored = await listStashes(repo.path);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.sha).toBe(dropped.recoveredSha);
    expect(restored[0]?.selector).toBe('stash@{0}');

    // The restored entry is a real stash again: applying it brings the
    // change back exactly as it was before the drop.
    expect(await stashPop(repo.path, 'stash@{0}')).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n');
  });

  it('reports a failure for a sha that is not a stash commit', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    const headSha = (await repo.git(['rev-parse', 'HEAD'])).trim();

    const result = await stashStore(repo.path, headSha);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.kind).toBe('error');
  });
});

describe('readStashDetail', () => {
  it('reports only the tracked part for a plain stash', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path, { message: 'wip' });

    const detail = await readStashDetail(repo.path, 'stash@{0}');
    expect(detail?.tracked.map((f) => f.path)).toEqual(['a.txt']);
    expect(detail?.index).toEqual([]);
    expect(detail?.untracked).toEqual([]);
  });

  it('reports the index part for a stash with a distinct staged state', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'staged\n');
    await repo.git(['add', '--', 'a.txt']);
    await repo.writeFile('a.txt', 'working\n');
    await stashPush(repo.path);

    const detail = await readStashDetail(repo.path, 'stash@{0}');
    expect(detail?.tracked.map((f) => f.path)).toEqual(['a.txt']);
    expect(detail?.index.map((f) => f.path)).toEqual(['a.txt']);
    expect(detail?.untracked).toEqual([]);
  });

  it('reports the untracked part for a stash made with -u', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await repo.writeFile('new.txt', 'untracked\n');
    await stashPush(repo.path, { includeUntracked: true });

    const detail = await readStashDetail(repo.path, 'stash@{0}');
    expect(detail?.tracked.map((f) => f.path)).toEqual(['a.txt']);
    expect(detail?.untracked.map((f) => f.path)).toEqual(['new.txt']);
  });

  it('returns null for a selector with no matching stash', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    expect(await readStashDetail(repo.path, 'stash@{0}')).toBeNull();
  });
});

describe('readStashFileDiff', () => {
  it('diffs the tracked part against HEAD at stash time', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    const diff = await readStashFileDiff(repo.path, 'stash@{0}', 'tracked', 'a.txt');
    expect(diff?.hunks.flatMap((h) => h.lines).some((l) => l.text.includes('two'))).toBe(true);
  });

  it('diffs the index part between HEAD-at-stash-time and the staged state', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'staged\n');
    await repo.git(['add', '--', 'a.txt']);
    await stashPush(repo.path);

    const diff = await readStashFileDiff(repo.path, 'stash@{0}', 'index', 'a.txt');
    expect(diff?.hunks.flatMap((h) => h.lines).some((l) => l.text.includes('staged'))).toBe(true);
  });

  it('diffs the untracked part as a whole new file', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('new.txt', 'untracked\n');
    await stashPush(repo.path, { includeUntracked: true });

    const diff = await readStashFileDiff(repo.path, 'stash@{0}', 'untracked', 'new.txt');
    expect(diff?.change).toBe('added');
  });

  it('reports no hunks for the index part when nothing was staged at stash time', async () => {
    // A plain `stash push` still gives the commit two parents (HEAD and the
    // index tree) — `^2` exists even when nothing was staged, so this reads
    // as an empty diff, not an absent part.
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    const diff = await readStashFileDiff(repo.path, 'stash@{0}', 'index', 'a.txt');
    expect(diff?.hunks).toEqual([]);
  });

  it('returns null for the untracked part when the stash was made without -u', async () => {
    // Unlike the index part, `^3` genuinely does not exist on a plain stash —
    // there is no rootless third parent to diff at all.
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    expect(await readStashFileDiff(repo.path, 'stash@{0}', 'untracked', 'a.txt')).toBeNull();
  });
});

describe('stashBranch', () => {
  it('creates a branch from the stash, checks it out, and applies the change', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    expect(await stashBranch(repo.path, 'from-stash', 'stash@{0}')).toEqual({ ok: true });
    expect((await repo.git(['symbolic-ref', '--short', 'HEAD'])).trim()).toBe('from-stash');
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n');
    expect(await listStashes(repo.path)).toEqual([]);
  });

  it('reports an existing branch name rather than a raw git error', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.git(['branch', 'taken']);
    await repo.writeFile('a.txt', 'two\n');
    await stashPush(repo.path);

    const result = await stashBranch(repo.path, 'taken', 'stash@{0}');
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/already exists/i);
  });
});
