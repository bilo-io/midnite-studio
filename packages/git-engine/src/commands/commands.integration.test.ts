import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveMainWorktree, resolveRepoRoot } from '../exec/git-exec';
import { TempRepo } from '../testing/temp-repo';
import { readCommitDetail, readLog, streamLog } from './log';
import { currentBranch, listRefs } from './refs';
import { conflictedPaths, detectInProgress, getStatus } from './status';
import { listWorktrees } from './worktrees';

/**
 * These run against real git via dugite, on repos built in the OS temp dir.
 * They're the guard against the parsers drifting from what git actually emits.
 */
describe('git-engine integration', () => {
  let repo: TempRepo;
  let first: string;
  let second: string;

  beforeAll(async () => {
    repo = await TempRepo.create();
    first = await repo.commitFile('README.md', '# hello\n', 'first commit');
    second = await repo.commitFile('src.ts', 'export const a = 1;\n', 'second commit');
    await repo.git(['tag', '-a', 'v1.0.0', '-m', 'release one']);
    await repo.git(['tag', 'lightweight']);
  }, 60_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  describe('log', () => {
    it('reads commits newest-first with parents linked', async () => {
      const commits = await readLog(repo.path, { all: true });

      expect(commits.map((c) => c.subject)).toEqual(['second commit', 'first commit']);
      expect(commits[0]?.sha).toBe(second);
      expect(commits[0]?.parents).toEqual([first]);
      expect(commits[1]?.parents).toEqual([]);
    });

    it('reads the author identity and both timestamps', async () => {
      const [commit] = await readLog(repo.path, { limit: 1 });
      expect(commit?.authorName).toBe('Test User');
      expect(commit?.authorEmail).toBe('test@example.com');
      expect(commit?.authorDate).toBeGreaterThan(1_600_000_000);
      expect(commit?.committerDate).toBeGreaterThan(1_600_000_000);
    });

    it('decorates the tip with HEAD, the branch and both tags', async () => {
      const [tip] = await readLog(repo.path, { all: true, limit: 1 });

      expect(tip?.refs).toContain('refs/heads/main');
      expect(tip?.refs).toContain('refs/tags/v1.0.0');
      expect(tip?.refs).toContain('refs/tags/lightweight');
      // `HEAD -> ` is stripped; the bare HEAD token must not survive.
      expect(tip?.refs).not.toContain('HEAD -> refs/heads/main');
    });

    it('keeps a subject containing the decoration delimiters intact', async () => {
      const tricky = await TempRepo.create();
      const subject = 'feat: HEAD -> main, tag: v9 in the subject';
      await tricky.commitFile('a.txt', 'x', subject);

      const [commit] = await readLog(tricky.path, { limit: 1 });
      expect(commit?.subject).toBe(subject);

      await tricky.cleanup();
    });

    it('returns an empty log for an unborn repo instead of throwing', async () => {
      const empty = await TempRepo.create();
      expect(await readLog(empty.path, { all: true })).toEqual([]);
      await empty.cleanup();
    });
  });

  describe('streamLog', () => {
    it('emits every commit across batches, including the unterminated last record', async () => {
      // Enough commits to cross several batches at a tiny batch size.
      const many = await TempRepo.create();
      for (let i = 0; i < 25; i += 1) {
        await many.commitFile('counter.txt', String(i), `commit ${i}`);
      }

      const batches: number[] = [];
      const seen: string[] = [];
      const stream = streamLog(
        many.path,
        { all: true },
        (commits) => {
          batches.push(commits.length);
          seen.push(...commits.map((c) => c.subject));
        },
        4,
      );

      const result = await stream.done;

      expect(result.error).toBeUndefined();
      expect(result.total).toBe(25);
      expect(seen).toHaveLength(25);
      expect(seen[0]).toBe('commit 24');
      // The oldest commit is the trailing unterminated record — proof the EOF
      // flush works, since it can only arrive that way.
      expect(seen.at(-1)).toBe('commit 0');
      expect(batches.length).toBeGreaterThan(1);

      await many.cleanup();
    }, 120_000);

    it('stops early when cancelled, without reporting an error', async () => {
      // A killed child exits non-zero with no output; that must read as
      // "cancelled", not as a failed log the UI would surface to the user.
      const stream = streamLog(repo.path, { all: true }, () => {});
      stream.cancel();

      const result = await stream.done;
      expect(result).not.toHaveProperty('error');
    });
  });

  describe('refs', () => {
    it('lists the branch and both tags, peeling the annotated one', async () => {
      const refs = await listRefs(repo.path);
      const byName = new Map(refs.map((r) => [r.name, r]));

      expect(byName.get('main')?.kind).toBe('localBranch');
      expect(byName.get('main')?.isHead).toBe(true);
      expect(byName.get('main')?.sha).toBe(second);

      // The annotated tag's own object sha is NOT the commit sha; peeling is
      // what lets the graph badge it on the right row.
      expect(byName.get('v1.0.0')?.kind).toBe('tag');
      expect(byName.get('v1.0.0')?.sha).toBe(second);
      expect(byName.get('lightweight')?.sha).toBe(second);
    });

    it('reports the current branch, and null when detached', async () => {
      expect(await currentBranch(repo.path)).toBe('main');

      const detached = await TempRepo.create();
      const sha = await detached.commitFile('a.txt', 'a', 'only');
      await detached.git(['checkout', '--detach', sha]);
      expect(await currentBranch(detached.path)).toBeNull();

      await detached.cleanup();
    });

    it('records ahead/behind against a real upstream', async () => {
      const origin = await TempRepo.create({ bare: true });
      const clone = await TempRepo.create();
      await clone.commitFile('a.txt', 'a', 'base');
      await clone.git(['remote', 'add', 'origin', origin.path]);
      await clone.git(['push', '-u', 'origin', 'main']);
      await clone.commitFile('b.txt', 'b', 'ahead by one');

      const refs = await listRefs(clone.path);
      const main = refs.find((r) => r.name === 'main');

      expect(main?.upstream).toMatchObject({ name: 'origin/main', ahead: 1, behind: 0 });

      await clone.cleanup();
      await origin.cleanup();
    }, 60_000);
  });

  describe('status', () => {
    it('reports a clean tree', async () => {
      const status = await getStatus(repo.path);
      expect(status.entries).toEqual([]);
      expect(status.branch.head).toBe('main');
      expect(status.inProgress).toBeNull();
    });

    it('separates staged, unstaged and untracked changes', async () => {
      const dirty = await TempRepo.create();
      await dirty.commitFile('tracked.txt', 'v1\n', 'base');

      await dirty.writeFile('tracked.txt', 'v2\n');
      await dirty.git(['add', '--', 'tracked.txt']);
      await dirty.writeFile('tracked.txt', 'v3\n'); // staged AND further modified
      await dirty.writeFile('untracked.txt', 'new\n');

      const status = await getStatus(dirty.path);
      const tracked = status.entries.find((e) => e.path === 'tracked.txt');
      const untracked = status.entries.find((e) => e.path === 'untracked.txt');

      expect(tracked).toMatchObject({ staged: 'modified', unstaged: 'modified' });
      expect(untracked).toMatchObject({ staged: 'unmodified', unstaged: 'untracked' });

      await dirty.cleanup();
    });

    it('lists files inside an untracked directory, not the directory', async () => {
      // `--untracked-files=all`; the default would collapse this to `nested/`.
      const nested = await TempRepo.create();
      await nested.commitFile('root.txt', 'x', 'base');
      await nested.git(['config', 'core.autocrlf', 'false']);
      await execGitMkdir(nested.path, 'nested');
      await nested.writeFile(join('nested', 'a.txt'), 'a');
      await nested.writeFile(join('nested', 'b.txt'), 'b');

      const paths = (await getStatus(nested.path)).entries.map((e) => e.path);
      expect(paths).toContain('nested/a.txt');
      expect(paths).toContain('nested/b.txt');
      expect(paths).not.toContain('nested/');

      await nested.cleanup();
    });

    it('reads a rename with its similarity score', async () => {
      const renamed = await TempRepo.create();
      await renamed.commitFile('old-name.ts', 'export const value = 42;\n', 'base');
      await renamed.git(['mv', 'old-name.ts', 'new-name.ts']);

      const entry = (await getStatus(renamed.path)).entries[0];
      expect(entry).toMatchObject({
        path: 'new-name.ts',
        origPath: 'old-name.ts',
        staged: 'renamed',
        similarity: 100,
      });

      await renamed.cleanup();
    });

    it('detects a paused merge and lists the conflicted paths', async () => {
      const conflicted = await TempRepo.create();
      await conflicted.commitFile('shared.txt', 'base\n', 'base');
      await conflicted.git(['checkout', '-b', 'feature']);
      await conflicted.commitFile('shared.txt', 'feature\n', 'feature side');
      await conflicted.git(['checkout', 'main']);
      await conflicted.commitFile('shared.txt', 'main\n', 'main side');

      // Conflicting merge — exits non-zero, which is data, not an error.
      await expect(conflicted.git(['merge', 'feature'])).rejects.toThrow();

      expect(await detectInProgress(conflicted.path)).toBe('merge');
      expect(await conflictedPaths(conflicted.path)).toEqual(['shared.txt']);

      const status = await getStatus(conflicted.path);
      expect(status.inProgress).toBe('merge');
      expect(status.entries.find((e) => e.path === 'shared.txt')?.conflicted).toBe(true);

      await conflicted.git(['merge', '--abort']);
      expect(await detectInProgress(conflicted.path)).toBeNull();

      await conflicted.cleanup();
    }, 60_000);

    it('reports an unborn repo', async () => {
      const fresh = await TempRepo.create();
      const status = await getStatus(fresh.path);

      expect(status.branch.unborn).toBe(true);
      expect(status.branch.oid).toBeNull();
      expect(status.branch.head).toBe('main');

      await fresh.cleanup();
    });

    it('reports a detached HEAD', async () => {
      const detached = await TempRepo.create();
      const sha = await detached.commitFile('a.txt', 'a', 'only');
      await detached.git(['checkout', '--detach', sha]);

      const status = await getStatus(detached.path);
      expect(status.branch.detached).toBe(true);
      expect(status.branch.head).toBeNull();

      await detached.cleanup();
    });
  });

  describe('worktrees', () => {
    it('lists the main worktree first, then linked ones', async () => {
      const host = await TempRepo.create();
      await host.commitFile('a.txt', 'a', 'base');
      const linked = join(host.path, 'wt-feature');
      await host.git(['worktree', 'add', '-b', 'feature', linked]);

      const worktrees = await listWorktrees(host.path, 'repo-1');

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).toMatchObject({ path: host.path, branch: 'main', isMain: true });
      expect(worktrees[1]).toMatchObject({ path: linked, branch: 'feature', isMain: false });

      // Asked from INSIDE the linked worktree, the answer must be identical —
      // this is what lets the sidebar group worktrees under their repo.
      const fromLinked = await listWorktrees(linked, 'repo-1');
      expect(fromLinked.map((w) => w.path)).toEqual(worktrees.map((w) => w.path));

      await host.cleanup();
    }, 60_000);

    it('resolves a linked worktree back to its main worktree', async () => {
      const host = await TempRepo.create();
      await host.commitFile('a.txt', 'a', 'base');
      const linked = join(host.path, 'wt-x');
      await host.git(['worktree', 'add', '-b', 'x', linked]);

      // In a linked worktree `.git` is a FILE, so a `.git`-directory probe fails.
      expect(await resolveRepoRoot(linked)).toBe(linked);
      expect(await resolveMainWorktree(linked)).toBe(host.path);

      await host.cleanup();
    }, 60_000);

    it('marks a branch checked out in another worktree', async () => {
      const host = await TempRepo.create();
      await host.commitFile('a.txt', 'a', 'base');
      const linked = join(host.path, 'wt-y');
      await host.git(['worktree', 'add', '-b', 'y', linked]);

      const y = (await listRefs(host.path)).find((r) => r.name === 'y');
      expect(y?.worktreePath).toBeTruthy();

      await host.cleanup();
    }, 60_000);
  });

  describe('commit detail', () => {
    it('returns the body, the stat block and per-file counts', async () => {
      const detail = await readCommitDetail(repo.path, second);

      expect(detail.sha).toBe(second);
      expect(detail.body).toContain('second commit');
      expect(detail.stat).toContain('src.ts');
      expect(detail.files).toEqual([
        // `oldPath` is null for anything that isn't a rename — it exists so the
        // inspector can ask for a rename-aware diff (see commands/diff.ts).
        { path: 'src.ts', oldPath: null, insertions: 1, deletions: 0 },
      ]);
    });
  });
});

/** `mkdir -p` inside a temp repo without importing fs into every test. */
async function execGitMkdir(root: string, dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(root, dir), { recursive: true });
}
