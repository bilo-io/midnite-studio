import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readLog } from './log';
import { abort, cherryPick, continueOp, merge, rebase } from './sequencer';
import { conflictedPaths, detectInProgress, getStatus } from './status';

let repo: TempRepo;

/** base ──> main
 *       └─> feature
 */
async function diverge(shared: string, mainSide: string, featureSide: string): Promise<void> {
  await repo.commitFile('shared.txt', shared, 'base');
  await repo.git(['checkout', '-q', '-b', 'feature']);
  await repo.commitFile('shared.txt', featureSide, 'feature side');
  await repo.git(['checkout', '-q', 'main']);
  await repo.commitFile('shared.txt', mainSide, 'main side');
}

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('merge', () => {
  it('fast-forwards when the branch is strictly ahead', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    await repo.commitFile('b.txt', 'two\n', 'feature work');
    await repo.git(['checkout', '-q', 'main']);

    expect(await merge(repo.path, { source: 'feature' })).toEqual({ ok: true });
    // A fast-forward creates no merge commit.
    expect((await readLog(repo.path, {})).map((c) => c.subject)).toEqual([
      'feature work',
      'base',
    ]);
  });

  it('creates a merge commit with --no-ff', async () => {
    await repo.commitFile('a.txt', 'one\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    await repo.commitFile('b.txt', 'two\n', 'feature work');
    await repo.git(['checkout', '-q', 'main']);

    expect(await merge(repo.path, { source: 'feature', noFastForward: true })).toEqual({ ok: true });
    const [tip] = await readLog(repo.path, {});
    expect(tip?.parents).toHaveLength(2);
  });

  it('merges two diverged branches without conflict', async () => {
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    await repo.commitFile('feature.txt', 'f\n', 'feature side');
    await repo.git(['checkout', '-q', 'main']);
    await repo.commitFile('main.txt', 'm\n', 'main side');

    expect(await merge(repo.path, { source: 'feature' })).toEqual({ ok: true });
    expect((await readLog(repo.path, {}))[0]?.parents).toHaveLength(2);
  });

  it('returns the conflict arm, not an error, when it conflicts', async () => {
    // The central claim of this phase: a conflict is a normal outcome the UI
    // renders, not an exception it has to catch.
    await diverge('base\n', 'main\n', 'feature\n');

    const result = await merge(repo.path, { source: 'feature' });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(result.op).toBe('merge');
    expect(result.files).toEqual(['shared.txt']);
    expect(await detectInProgress(repo.path)).toBe('merge');
  });

  it('aborting a conflicted merge restores a clean tree', async () => {
    await diverge('base\n', 'main\n', 'feature\n');
    await merge(repo.path, { source: 'feature' });

    expect(await abort(repo.path, 'merge')).toEqual({ ok: true });

    const status = await getStatus(repo.path);
    expect(status.inProgress).toBeNull();
    expect(status.entries).toEqual([]);
    expect(await readFile(join(repo.path, 'shared.txt'), 'utf8')).toBe('main\n');
  });

  it('continuing after resolution produces the merge commit', async () => {
    await diverge('base\n', 'main\n', 'feature\n');
    await merge(repo.path, { source: 'feature' });

    await repo.writeFile('shared.txt', 'resolved\n');
    await repo.git(['add', '--', 'shared.txt']);

    expect(await continueOp(repo.path, 'merge')).toEqual({ ok: true });
    expect(await detectInProgress(repo.path)).toBeNull();
    expect((await readLog(repo.path, {}))[0]?.parents).toHaveLength(2);
  });

  it('refuses to continue while files are still unmerged', async () => {
    // Caught here so the UI can keep Continue disabled and explain, rather than
    // letting the user click into an error.
    await diverge('base\n', 'main\n', 'feature\n');
    await merge(repo.path, { source: 'feature' });

    const result = await continueOp(repo.path, 'merge');
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(result.files).toEqual(['shared.txt']);
  });

  it('explains unrelated histories', async () => {
    await repo.commitFile('a.txt', 'a\n', 'main root');
    await repo.git(['checkout', '-q', '--orphan', 'stranger']);
    // `--cached` alone would leave main's files in the working tree as
    // untracked, and checking main back out would then refuse to overwrite them.
    await repo.git(['rm', '-q', '-rf', '.']);
    await repo.commitFile('b.txt', 'b\n', 'other root');
    await repo.git(['checkout', '-q', 'main']);

    const result = await merge(repo.path, { source: 'stranger' });
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/shares no history/i);
  });

  it('leaves no half-started state after a hard failure', async () => {
    await repo.commitFile('a.txt', 'a\n', 'base');
    const result = await merge(repo.path, { source: 'no-such-branch' });

    expect(result.ok).toBe(false);
    expect(await detectInProgress(repo.path)).toBeNull();
  });
});

describe('rebase', () => {
  it('replays commits onto another branch', async () => {
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    await repo.commitFile('feature.txt', 'f\n', 'feature work');
    await repo.git(['checkout', '-q', 'main']);
    await repo.commitFile('main.txt', 'm\n', 'main work');
    await repo.git(['checkout', '-q', 'feature']);

    expect(await rebase(repo.path, { onto: 'main' })).toEqual({ ok: true });

    // Linear history, feature's commit on top — and no merge commit anywhere.
    const subjects = (await readLog(repo.path, {})).map((c) => c.subject);
    expect(subjects).toEqual(['feature work', 'main work', 'base']);
  });

  it('returns the conflict arm and continues to completion', async () => {
    await diverge('base\n', 'main\n', 'feature\n');
    await repo.git(['checkout', '-q', 'feature']);

    const conflicted = await rebase(repo.path, { onto: 'main' });
    expect(conflicted.ok).toBe(false);
    if (conflicted.ok || conflicted.kind !== 'conflict') throw new Error('expected a conflict');
    expect(conflicted.op).toBe('rebase');
    expect(await detectInProgress(repo.path)).toBe('rebase');

    await repo.writeFile('shared.txt', 'resolved\n');
    await repo.git(['add', '--', 'shared.txt']);

    expect(await continueOp(repo.path, 'rebase')).toEqual({ ok: true });
    expect(await detectInProgress(repo.path)).toBeNull();
    expect((await readLog(repo.path, {}))[0]?.parents).toHaveLength(1);
  });

  it('aborting a conflicted rebase restores the branch', async () => {
    await diverge('base\n', 'main\n', 'feature\n');
    await repo.git(['checkout', '-q', 'feature']);
    const before = await repo.head();

    await rebase(repo.path, { onto: 'main' });
    expect(await abort(repo.path, 'rebase')).toEqual({ ok: true });

    expect(await repo.head()).toBe(before);
    expect((await getStatus(repo.path)).inProgress).toBeNull();
  });
});

describe('cherryPick', () => {
  it('applies a commit from another branch', async () => {
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    const pick = await repo.commitFile('extra.txt', 'extra\n', 'the useful commit');
    await repo.git(['checkout', '-q', 'main']);

    expect(await cherryPick(repo.path, [pick])).toEqual({ ok: true });
    expect((await readLog(repo.path, {}))[0]?.subject).toBe('the useful commit');
  });

  it('applies several commits oldest-first', async () => {
    // Newest-first would apply the changes in reverse and conflict with itself.
    await repo.commitFile('log.txt', 'a\n', 'base');
    await repo.git(['checkout', '-q', '-b', 'feature']);
    const one = await repo.commitFile('log.txt', 'a\nb\n', 'add b');
    const two = await repo.commitFile('log.txt', 'a\nb\nc\n', 'add c');
    await repo.git(['checkout', '-q', 'main']);

    // Handed over newest-first, as the graph lists them.
    expect(await cherryPick(repo.path, [two, one])).toEqual({ ok: true });

    const subjects = (await readLog(repo.path, {})).map((c) => c.subject);
    expect(subjects.slice(0, 2)).toEqual(['add c', 'add b']);
    expect(await readFile(join(repo.path, 'log.txt'), 'utf8')).toBe('a\nb\nc\n');
  });

  it('returns the conflict arm when the change does not apply', async () => {
    await diverge('base\n', 'main\n', 'feature\n');
    const featureTip = (await repo.git(['rev-parse', 'feature'])).trim();

    const result = await cherryPick(repo.path, [featureTip]);
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(result.op).toBe('cherry-pick');
    expect(await conflictedPaths(repo.path)).toEqual(['shared.txt']);

    await abort(repo.path, 'cherry-pick');
    expect(await detectInProgress(repo.path)).toBeNull();
  });

  it('treats an empty list as a no-op', async () => {
    await repo.commitFile('a.txt', 'a\n', 'base');
    expect(await cherryPick(repo.path, [])).toEqual({ ok: true });
  });
});
