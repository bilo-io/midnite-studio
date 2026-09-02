import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { commit } from './commit';
import { discardPaths, stagePaths, unstagePaths } from './stage';
import { getStatus } from './status';
import { fetch, pull, push } from './sync';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('stage / unstage / discard', () => {
  it('runs the full stage → status → commit → clean cycle', async () => {
    await repo.writeFile('a.txt', 'hello\n');

    expect(await stagePaths(repo.path, ['a.txt'])).toEqual({ ok: true });
    expect((await getStatus(repo.path)).entries[0]).toMatchObject({
      path: 'a.txt',
      staged: 'added',
    });

    expect(await commit(repo.path, { message: 'add a' })).toEqual({ ok: true });

    const after = await getStatus(repo.path);
    expect(after.entries).toEqual([]);
    expect(after.branch.head).toBe('main');
  });

  it('unstages in an unborn repo, where HEAD does not exist yet', async () => {
    // Both `reset HEAD` and `restore --staged` fail here with "could not
    // resolve HEAD" — and this is exactly when a user is most likely to be
    // undoing their very first `git add`. `rm --cached` is the only correct
    // operation before the first commit.
    await repo.writeFile('first.txt', 'x\n');
    await stagePaths(repo.path, ['first.txt']);

    expect(await unstagePaths(repo.path, ['first.txt'])).toEqual({ ok: true });
    expect((await getStatus(repo.path)).entries[0]).toMatchObject({ unstaged: 'untracked' });
  });

  it('unstages one file and leaves the other staged', async () => {
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.writeFile('a.txt', 'a\n');
    await repo.writeFile('b.txt', 'b\n');
    await stagePaths(repo.path, ['a.txt', 'b.txt']);

    await unstagePaths(repo.path, ['a.txt']);

    const entries = (await getStatus(repo.path)).entries;
    expect(entries.find((e) => e.path === 'a.txt')?.staged).toBe('unmodified');
    expect(entries.find((e) => e.path === 'b.txt')?.staged).toBe('added');
  });

  it('handles a path containing spaces and a leading dash', async () => {
    // Both would break a naive argv: the dash parses as an option without `--`.
    await repo.commitFile('base.txt', 'base\n', 'base');
    await repo.writeFile('-weird name.txt', 'x\n');

    expect(await stagePaths(repo.path, ['-weird name.txt'])).toEqual({ ok: true });
    expect((await getStatus(repo.path)).entries[0]?.path).toBe('-weird name.txt');
  });

  it('discards a tracked modification', async () => {
    await repo.commitFile('tracked.txt', 'original\n', 'base');
    await repo.writeFile('tracked.txt', 'ruined\n');

    expect(await discardPaths(repo.path, ['tracked.txt'])).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'tracked.txt'), 'utf8')).toBe('original\n');
  });

  it('leaves untracked files alone when discarding', async () => {
    // Deleting untracked files is a different, far more dangerous operation
    // than reverting tracked content, and must not ride along with "discard".
    await repo.commitFile('tracked.txt', 'v1\n', 'base');
    await repo.writeFile('untracked.txt', 'precious\n');
    await repo.writeFile('tracked.txt', 'v2\n');

    await discardPaths(repo.path, ['tracked.txt']);

    expect(existsSync(join(repo.path, 'untracked.txt'))).toBe(true);
  });

  it('treats an empty path list as a no-op', async () => {
    expect(await stagePaths(repo.path, [])).toEqual({ ok: true });
  });
});

describe('commit', () => {
  it('preserves a message with quotes, newlines and a leading dash', async () => {
    // The reason the message goes over stdin rather than through -m.
    const message = `-fix: don't "break" on \`this\`\n\nBody line.\n`;
    await repo.writeFile('a.txt', 'x\n');
    await stagePaths(repo.path, ['a.txt']);

    expect(await commit(repo.path, { message })).toEqual({ ok: true });

    const stored = await repo.git(['log', '-1', '--pretty=format:%B']);
    expect(stored.trim()).toBe(message.trim());
  });

  it('names the nothing-to-commit case', async () => {
    // Git reports this on STDOUT and exits 1, so reading only stderr yields an
    // empty, mystifying error for the most common failure there is.
    await repo.commitFile('a.txt', 'x\n', 'base');

    const result = await commit(repo.path, { message: 'again' });
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toBe('Nothing staged to commit.');
  });

  it('amends the previous commit', async () => {
    await repo.commitFile('a.txt', 'x\n', 'original message');
    expect(await commit(repo.path, { message: 'reworded', amend: true })).toEqual({ ok: true });

    expect((await repo.git(['log', '--oneline'])).trim().split('\n')).toHaveLength(1);
    expect(await repo.git(['log', '-1', '--pretty=format:%s'])).toBe('reworded');
  });

  it('commits every tracked modification with `all`', async () => {
    await repo.commitFile('a.txt', 'v1\n', 'base');
    await repo.writeFile('a.txt', 'v2\n');

    expect(await commit(repo.path, { message: 'sweep', all: true })).toEqual({ ok: true });
    expect((await getStatus(repo.path)).entries).toEqual([]);
  });
});

// Diff coverage lives in diff.integration.test.ts as of Phase 12 Theme D:
// `readFileDiff` now returns a parsed FileDiff rather than patch text, and the
// cases that used to live here (tracked, staged-vs-worktree, untracked) are
// asserted there against the structured shape, alongside renames, binaries,
// mode-only changes, truncation and intraline ranges.

describe('sync against a local bare remote', () => {
  it('pushes, fetches and pulls', async () => {
    const origin = await TempRepo.create({ bare: true });
    await repo.commitFile('a.txt', 'one\n', 'first');
    await repo.git(['remote', 'add', 'origin', origin.path]);

    expect(await push(repo.path, { setUpstream: true, remote: 'origin', branch: 'main' })).toEqual({
      ok: true,
    });

    // A second clone advances the remote behind our back.
    const other = await TempRepo.create();
    await other.git(['remote', 'add', 'origin', origin.path]);
    await other.git(['fetch', 'origin']);
    await other.git(['checkout', '-B', 'main', 'origin/main']);
    await other.commitFile('b.txt', 'two\n', 'second');
    await other.git(['push', 'origin', 'main']);

    expect(await fetch(repo.path, { remote: 'origin' })).toEqual({ ok: true });
    expect((await getStatus(repo.path)).branch.behind).toBe(1);

    expect(await pull(repo.path, { remote: 'origin', branch: 'main' })).toEqual({ ok: true });
    expect(existsSync(join(repo.path, 'b.txt'))).toBe(true);

    await other.cleanup();
    await origin.cleanup();
  }, 120_000);

  it('explains a non-fast-forward push instead of suggesting force, and codes it', async () => {
    // A plain push still points at pull, never at force — force-with-lease
    // (Phase 22 Theme F) is reached only through its own gated entry point,
    // never suggested from this message.
    const origin = await TempRepo.create({ bare: true });
    await repo.commitFile('a.txt', 'one\n', 'first');
    await repo.git(['remote', 'add', 'origin', origin.path]);
    await push(repo.path, { setUpstream: true, remote: 'origin', branch: 'main' });

    const other = await TempRepo.create();
    await other.git(['remote', 'add', 'origin', origin.path]);
    await other.git(['fetch', 'origin']);
    await other.git(['checkout', '-B', 'main', 'origin/main']);
    await other.commitFile('theirs.txt', 'theirs\n', 'theirs');
    await other.git(['push', 'origin', 'main']);

    await repo.commitFile('mine.txt', 'mine\n', 'mine');
    const result = await push(repo.path, { remote: 'origin', branch: 'main' });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/Pull first/i);
    expect(result.message).not.toMatch(/force/i);
    // The ref badge menu's own signal to offer force-with-lease now.
    expect(result.code).toBe('non-fast-forward');

    await other.cleanup();
    await origin.cleanup();
  }, 120_000);

  it('force-with-lease pushes past a diverged remote, past what a plain push refuses', async () => {
    const origin = await TempRepo.create({ bare: true });
    await repo.commitFile('a.txt', 'one\n', 'first');
    await repo.git(['remote', 'add', 'origin', origin.path]);
    await push(repo.path, { setUpstream: true, remote: 'origin', branch: 'main' });

    // Someone else advances the remote behind our back.
    const other = await TempRepo.create();
    await other.git(['remote', 'add', 'origin', origin.path]);
    await other.git(['fetch', 'origin']);
    await other.git(['checkout', '-B', 'main', 'origin/main']);
    await other.commitFile('theirs.txt', 'theirs\n', 'theirs');
    await other.git(['push', 'origin', 'main']);

    // We amend our own history instead of merging — the case force-with-lease
    // exists for.
    await repo.git(['fetch', 'origin']);
    const staleExpect = (await repo.git(['rev-parse', 'origin/main'])).trim();
    await repo.commitFile('mine.txt', 'mine\n', 'rewritten');
    await repo.git(['commit', '--amend', '--no-edit']);

    const plain = await push(repo.path, { remote: 'origin', branch: 'main' });
    expect(plain.ok).toBe(false);

    const leased = await push(repo.path, {
      remote: 'origin',
      branch: 'main',
      forceWithLease: { ref: 'refs/heads/main', expect: staleExpect },
    });
    expect(leased).toEqual({ ok: true });

    const originTip = (await origin.git(['rev-parse', 'main'])).trim();
    const localTip = (await repo.git(['rev-parse', 'HEAD'])).trim();
    expect(originTip).toBe(localTip);

    await other.cleanup();
    await origin.cleanup();
  }, 120_000);

  it('names a rejected lease as stale, not as a generic non-fast-forward', async () => {
    const origin = await TempRepo.create({ bare: true });
    await repo.commitFile('a.txt', 'one\n', 'first');
    await repo.git(['remote', 'add', 'origin', origin.path]);
    await push(repo.path, { setUpstream: true, remote: 'origin', branch: 'main' });

    // The expected sha is stale from the moment it is read: the remote moves
    // again before the leased push runs.
    const staleExpect = (await repo.git(['rev-parse', 'origin/main'])).trim();

    const other = await TempRepo.create();
    await other.git(['remote', 'add', 'origin', origin.path]);
    await other.git(['fetch', 'origin']);
    await other.git(['checkout', '-B', 'main', 'origin/main']);
    await other.commitFile('theirs.txt', 'theirs\n', 'theirs');
    await other.git(['push', 'origin', 'main']);

    const result = await push(repo.path, {
      remote: 'origin',
      branch: 'main',
      forceWithLease: { ref: 'refs/heads/main', expect: staleExpect },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.code).toBe('stale-lease');
    expect(result.message).toMatch(/fetch and look/i);

    await other.cleanup();
    await origin.cleanup();
  }, 120_000);

  it('reports a missing remote clearly', async () => {
    await repo.commitFile('a.txt', 'x\n', 'base');
    const result = await push(repo.path, { remote: 'nope', branch: 'main' });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toBeTruthy();
  }, 60_000);

  it('returns the conflict arm when a pull conflicts', async () => {
    // A conflicted pull is a normal outcome the UI renders, not an error.
    const origin = await TempRepo.create({ bare: true });
    await repo.commitFile('shared.txt', 'base\n', 'base');
    await repo.git(['remote', 'add', 'origin', origin.path]);
    await push(repo.path, { setUpstream: true, remote: 'origin', branch: 'main' });

    const other = await TempRepo.create();
    await other.git(['remote', 'add', 'origin', origin.path]);
    await other.git(['fetch', 'origin']);
    await other.git(['checkout', '-B', 'main', 'origin/main']);
    await other.commitFile('shared.txt', 'theirs\n', 'theirs');
    await other.git(['push', 'origin', 'main']);

    await repo.commitFile('shared.txt', 'mine\n', 'mine');
    const result = await pull(repo.path, { remote: 'origin', branch: 'main' });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(result.files).toEqual(['shared.txt']);
    expect(result.op).toBe('merge');

    await other.cleanup();
    await origin.cleanup();
  }, 120_000);
});
