import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { conflictedPaths, detectInProgress } from './status';
import {
  listStashes,
  stashApply,
  stashBranch,
  stashDrop,
  stashPop,
  stashPush,
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
