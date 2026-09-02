import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatchKind } from '@midnite/studio-shared';

import { withFsActivity } from '../exec/fs-activity';
import { writeQueue } from '../exec/write-queue';
import { TempRepo } from '../testing/temp-repo';
import { RepoWatcher, isNoise } from './repo-watcher';

describe('isNoise', () => {
  it('ignores .git — it is watched precisely, not through the worktree', () => {
    // Otherwise every loose object git writes during a commit reports as a
    // working-tree change.
    expect(isNoise('.git/objects/ab/cdef')).toBe(true);
    expect(isNoise('.git/COMMIT_EDITMSG')).toBe(true);
  });

  it('ignores the high-churn build and dependency directories', () => {
    for (const path of [
      'node_modules/react/index.js',
      'packages/app/dist/main.js',
      'target/debug/x',
      '.next/cache/y',
      'coverage/lcov.info',
      '.venv/lib/python3/site.py',
    ]) {
      expect(isNoise(path)).toBe(true);
    }
  });

  it('ignores editor scratch files', () => {
    expect(isNoise('src/app.ts~')).toBe(true);
    expect(isNoise('.app.ts.swp')).toBe(true);
    expect(isNoise('src/x.tmp')).toBe(true);
  });

  it('reports real source changes', () => {
    expect(isNoise('src/app.ts')).toBe(false);
    expect(isNoise('README.md')).toBe(false);
    // A path merely CONTAINING the word is not a match — only whole segments.
    expect(isNoise('src/node_modules_helper.ts')).toBe(false);
  });

  it('treats an empty filename as noise', () => {
    // fs.watch can report a null filename on some platforms.
    expect(isNoise('')).toBe(true);
  });
});

describe('RepoWatcher', () => {
  let repo: TempRepo;
  let watcher: RepoWatcher | null = null;
  let events: WatchKind[] = [];

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.commitFile('a.txt', 'one\n', 'base');
    events = [];
  });

  afterEach(async () => {
    watcher?.stop();
    watcher = null;
    await repo.cleanup();
  });

  const startWatching = async (settleMs = 0, debounceMs = 50, fsSettleMs = 0) => {
    watcher = await RepoWatcher.start({
      repoPath: repo.path,
      repoId: repo.path,
      onEvent: (kind) => events.push(kind),
      debounceMs,
      settleMs,
      fsSettleMs,
    });
    // fs.watch registration is not instantaneous on macOS.
    await wait(150);
  };

  it('reports a working-tree change', async () => {
    await startWatching();
    await repo.writeFile('a.txt', 'changed\n');
    await wait(400);

    expect(events).toContain('worktree');
  });

  it('reports a reflog-only change as `refs` (Phase 22 Theme G)', async () => {
    // A reflog write always rides alongside a ref/HEAD write in real git — so
    // this reaches straight for `.git/logs/HEAD` to prove the WATCH itself
    // fires, independent of whatever else that same commit touched. Real
    // reflog behaviour (parsing, timestamps) is `reflog.integration.test.ts`'s
    // job, not this suite's.
    await startWatching();
    await repo.writeFile('.git/logs/HEAD', '0'.repeat(40) + ' ' + '1'.repeat(40) + ' extra line\n');
    await wait(400);

    expect(events).toContain('refs');
  });

  it('stays silent for a change inside an ignored directory', async () => {
    // The behaviour that makes the watcher usable: a `pnpm install` must not
    // wake the UI thousands of times.
    await startWatching();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(join(repo.path, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(repo.path, 'node_modules', 'pkg', 'index.js'), 'x', 'utf8');
    await wait(400);

    expect(events).toEqual([]);
  });

  it('collapses a burst of writes into very few events', async () => {
    await startWatching();
    // Issued together so they land inside one debounce window; writing them
    // sequentially would legitimately span several, which says nothing about
    // the debounce.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => repo.writeFile(`f${i}.txt`, 'x\n')),
    );
    await wait(500);

    const worktreeEvents = events.filter((kind) => kind === 'worktree');
    expect(worktreeEvents.length).toBeGreaterThan(0);
    // The assertion that matters is the ratio: 20 writes must not become 20
    // refetches. An exact count would only be measuring the machine's timing.
    expect(worktreeEvents.length).toBeLessThanOrEqual(3);
    expect(events.every((kind) => kind === 'worktree')).toBe(true);
  });

  it('suppresses events produced by our own writes', async () => {
    // The loop this prevents: stage → watch event → refetch status → the work
    // the stage already did. And a long `pull` would cascade throughout.
    await startWatching(200);

    await writeQueue.run(repo.path, async () => {
      await repo.writeFile('a.txt', 'written by us\n');
      await wait(120);
    });
    await wait(400);

    expect(events).toEqual([]);
  });

  it('still reports a change that was already waiting when our write began', async () => {
    // The regression: suppression dropped everything pending once the queue went
    // busy, including events that predated the write and so could not be its
    // echo. An external change landing just as the app started writing vanished
    // and was never re-checked — the UI stayed stale until something unrelated
    // moved it. A pruned worktree stuck on screen badged "detached missing" is
    // what this looked like in practice.
    // A long debounce so the ordering under test is the ordering that happens:
    // the external event has to be sitting in `pending`, unflushed, at the
    // moment our write opens the suppression window. With the default 50ms the
    // fs event can still be in flight when the queue goes busy, which tests
    // nothing.
    await startWatching(100, 400);

    // External change first — queued, but the debounce has not fired yet...
    await repo.writeFile('theirs.txt', 'external\n');
    await wait(150);

    // ...and now our own write opens the window, and stays open long enough
    // that the flush lands inside it.
    await writeQueue.run(repo.path, async () => {
      await wait(400);
    });
    await wait(600);

    expect(events).toContain('worktree');
  });

  it('reports again once the write queue has settled', async () => {
    await startWatching(100);

    await writeQueue.run(repo.path, async () => {
      await repo.writeFile('a.txt', 'ours\n');
    });
    await wait(400);
    events.length = 0;

    // An external change after the settle window is a real event again.
    await repo.writeFile('b.txt', 'theirs\n');
    await wait(400);

    expect(events).toContain('worktree');
  });

  it('suppresses events produced by our own fs writes (Phase 24)', async () => {
    // The same loop as the write-queue case, for a plain fs write: save →
    // watch event → refetch the tree that the save already updated.
    await startWatching(0, 50, 200);

    await withFsActivity(repo.path, async () => {
      await repo.writeFile('a.txt', 'written by the fs write path\n');
      await wait(120);
    });
    await wait(400);

    expect(events).toEqual([]);
  });

  it('still reports a change queued before an fs write opened its window', async () => {
    await startWatching(0, 400, 100);

    await repo.writeFile('theirs.txt', 'external\n');
    await wait(150);

    await withFsActivity(repo.path, async () => {
      await wait(400);
    });
    await wait(600);

    expect(events).toContain('worktree');
  });

  it('reports again once fs activity has settled', async () => {
    await startWatching(0, 50, 100);

    await withFsActivity(repo.path, async () => {
      await repo.writeFile('a.txt', 'ours\n');
    });
    await wait(400);
    events.length = 0;

    await repo.writeFile('b.txt', 'theirs\n');
    await wait(400);

    expect(events).toContain('worktree');
  });

  it("ignores another repo's fs activity", async () => {
    // Scoped per repoId (unlike the write queue's global broadcast): a write
    // in some other repo must not suppress this watcher's events.
    await startWatching(0, 50, 60_000);

    await withFsActivity('a-completely-different-repo', async () => {
      await repo.writeFile('a.txt', 'unrelated repo is busy\n');
      await wait(200);
    });
    await wait(400);

    expect(events).toContain('worktree');
  });

  it('stops reporting after stop()', async () => {
    await startWatching();
    watcher?.stop();
    watcher = null;

    await repo.writeFile('a.txt', 'after stop\n');
    await wait(300);

    expect(events).toEqual([]);
  });

  it('starts without throwing on a repo that has no packed-refs or worktrees', async () => {
    // Both paths are absent in a fresh repo; watching a missing path must be a
    // no-op, not a crash at startup.
    await expect(startWatching()).resolves.toBeUndefined();
  });
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// vitest's fake timers would defeat fs.watch; these are real waits.
void vi;
