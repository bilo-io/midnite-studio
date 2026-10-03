import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import {
  applyFilePatches,
  buildFilePatch,
  captureChanges,
  createAgentWorktree,
  reattachAgentWorktree,
  removeAgentWorktree,
  snapshotTree,
  splitFilePatch,
  type CapturedFile,
} from './change-review';

// vitest, real git against temp repos — the same way the other command tests run.
describe('change review (integration)', () => {
  let repo: TempRepo;
  let scratch: string;
  let snap: string;
  let base: string | null;
  const BRANCH = 'chat/test-abc123';

  beforeEach(async () => {
    repo = await TempRepo.create();
    scratch = await mkdtemp(join(tmpdir(), 'midnite-chats-wt-'));
    snap = join(scratch, 'proj-chat-test-abc123');
    base = null;
  });

  afterEach(async () => {
    await repo.cleanup();
    await rm(scratch, { recursive: true, force: true });
  });

  /** Create the chat's worktree (first call only) and mark the start of a turn. */
  async function snapshot(): Promise<void> {
    if (!existsSync(snap)) {
      const res = await createAgentWorktree(repo.path, { path: snap, branch: BRANCH });
      expect(res.ok).toBe(true);
    }
    const tree = await snapshotTree(snap);
    if (!tree.ok) throw new Error(`snapshot failed: ${JSON.stringify(tree)}`);
    base = tree.value;
  }

  async function capture(): Promise<CapturedFile[]> {
    const res = await captureChanges(snap, base!);
    if (!res.ok) throw new Error(`capture failed: ${JSON.stringify(res)}`);
    return res.value;
  }

  /** A file long enough that two edits far apart land in two hunks. */
  const longFile = (marker = '') =>
    Array.from({ length: 40 }, (_, i) => `line ${i + 1}${i === 2 || i === 35 ? marker : ''}`).join('\n') + '\n';

  describe('createAgentWorktree', () => {
    it("is a real linked worktree on its own branch, seeded with the user's uncommitted and untracked state", async () => {
      await repo.commitFile('a.txt', 'committed\n', 'add a');
      await repo.writeFile('a.txt', 'edited, uncommitted\n');
      await repo.writeFile('new.txt', 'untracked\n');
      const before = await repo.git(['status', '--porcelain']);

      const res = await createAgentWorktree(repo.path, { path: snap, branch: BRANCH });

      expect(res).toEqual({ ok: true, value: { path: snap, branch: BRANCH, seeded: true } });
      expect(await repo.git(['worktree', 'list', '--porcelain'])).toContain(`branch refs/heads/${BRANCH}`);
      expect(await readFile(join(snap, 'a.txt'), 'utf8')).toBe('edited, uncommitted\n');
      expect(await readFile(join(snap, 'new.txt'), 'utf8')).toBe('untracked\n');
      // The user's own checkout is untouched.
      expect(await repo.git(['status', '--porcelain'])).toBe(before);
    });

    it('leaves gitignored files out and keeps symlinks as symlinks', async () => {
      await repo.commitFile('.gitignore', 'node_modules/\n', 'ignore');
      await repo.commitFile('real.txt', 'real\n', 'add real');
      await repo.writeFile('node_modules/pkg/index.js', 'x\n');
      await symlink('real.txt', join(repo.path, 'link.txt'));

      await snapshot();

      expect(existsSync(join(snap, 'node_modules'))).toBe(false);
      expect((await readFile(join(snap, 'link.txt'), 'utf8')).trim()).toBe('real');
      expect(await capture()).toEqual([]);
    });

    it('carries a deletion the user has not committed', async () => {
      await repo.commitFile('gone.txt', 'bye\n', 'add');
      await rm(join(repo.path, 'gone.txt'));
      await snapshot();
      expect(existsSync(join(snap, 'gone.txt'))).toBe(false);
    });

    it('leaves a single oversized untracked file out of the seed', async () => {
      await repo.commitFile('small.txt', 'ok\n', 'add small');
      await repo.writeFile('big.bin', 'x'.repeat(2048));
      const res = await createAgentWorktree(repo.path, { path: snap, branch: BRANCH }, { maxFileBytes: 1024 });
      expect(res.ok).toBe(true);
      expect(existsSync(join(snap, 'big.bin'))).toBe(false);
      expect(existsSync(join(snap, 'small.txt'))).toBe(true);
    });

    it('refuses a repository with no commits with a plain error', async () => {
      const empty = await TempRepo.create();
      try {
        const res = await createAgentWorktree(empty.path, { path: snap, branch: BRANCH });
        expect(res).toMatchObject({ ok: false, kind: 'error' });
      } finally {
        await empty.cleanup();
      }
    });
  });

  describe('snapshotTree', () => {
    it("never touches the worktree's own index or HEAD", async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'two\n');
      const status = await repo.git(['-C', snap, 'status', '--porcelain']);
      const head = await repo.git(['-C', snap, 'rev-parse', 'HEAD']);

      const tree = await snapshotTree(snap);

      expect(tree.ok).toBe(true);
      expect(await repo.git(['-C', snap, 'status', '--porcelain'])).toBe(status);
      expect(await repo.git(['-C', snap, 'rev-parse', 'HEAD'])).toBe(head);
    });

    it('sees a commit the agent made as well as its uncommitted edits', async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'committed by agent\n');
      await repo.git(['-C', snap, 'commit', '-qam', 'agent commit']);
      await writeFile(join(snap, 'b.txt'), 'loose\n');

      const files = await capture();

      expect(files.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('reports only what changed since the turn started, turn after turn', async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'two\n');
      expect((await capture()).map((f) => f.path)).toEqual(['a.txt']);

      await snapshot();
      await writeFile(join(snap, 'b.txt'), 'new\n');
      expect((await capture()).map((f) => f.path)).toEqual(['b.txt']);
    });
  });

  describe('removeAgentWorktree / reattachAgentWorktree', () => {
    it('removes the directory and deletes a branch that carries no commits of its own', async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'dirty\n');

      const res = await removeAgentWorktree(repo.path, { path: snap, branch: BRANCH });

      expect(res).toEqual({ ok: true, value: { branchKept: false } });
      expect(existsSync(snap)).toBe(false);
      expect(await repo.git(['branch', '--list', BRANCH])).toBe('');
    });

    it('keeps a branch with unmerged commits, so nothing is orphaned', async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'agent\n');
      await repo.git(['-C', snap, 'commit', '-qam', 'agent work']);

      const res = await removeAgentWorktree(repo.path, { path: snap, branch: BRANCH });

      expect(res).toEqual({ ok: true, value: { branchKept: true } });
      expect(existsSync(snap)).toBe(false);
      expect(await repo.git(['branch', '--list', BRANCH])).toContain(BRANCH);
    });

    it('copes with a directory already deleted by hand, and can put the branch back', async () => {
      await repo.commitFile('a.txt', 'one\n', 'add');
      await snapshot();
      await rm(snap, { recursive: true, force: true });

      const back = await reattachAgentWorktree(repo.path, { path: snap, branch: BRANCH });
      expect(back.ok).toBe(true);
      expect(existsSync(join(snap, 'a.txt'))).toBe(true);

      await rm(snap, { recursive: true, force: true });
      const res = await removeAgentWorktree(repo.path, { path: snap, branch: BRANCH });
      expect(res.ok).toBe(true);
      expect((await repo.git(['worktree', 'list'])).trim().split('\n')).toHaveLength(1);
    });
  });

  describe('captureChanges', () => {
    it('reports an edit, an addition and a deletion with counts and parsed hunks', async () => {
      await repo.commitFile('edit.txt', 'one\ntwo\nthree\n', 'add');
      await repo.commitFile('del.txt', 'bye\n', 'add');
      await snapshot();

      await writeFile(join(snap, 'edit.txt'), 'one\nTWO\nthree\nfour\n');
      await writeFile(join(snap, 'added.txt'), 'hello\nworld\n');
      await rm(join(snap, 'del.txt'));

      const files = await capture();
      const by = Object.fromEntries(files.map((f) => [f.path, f]));

      expect(files.map((f) => f.path).sort()).toEqual(['added.txt', 'del.txt', 'edit.txt']);
      expect(by['edit.txt']).toMatchObject({ change: 'modified', insertions: 2, deletions: 1, binary: false });
      expect(by['edit.txt']!.hunks).toHaveLength(1);
      expect(by['edit.txt']!.diff.hunks).toHaveLength(1);
      expect(by['added.txt']).toMatchObject({ change: 'added', insertions: 2, deletions: 0 });
      expect(by['del.txt']).toMatchObject({ change: 'deleted', insertions: 0, deletions: 1 });
    });

    it('still sees edits to a file the user tracks even though an ignore rule matches it', async () => {
      await repo.writeFile('forced.log', 'v1\n');
      await repo.writeFile('.gitignore', '*.log\n');
      await repo.git(['add', '-f', '--', 'forced.log', '.gitignore']);
      await repo.commit('track a log despite the rule');
      await snapshot();
      await writeFile(join(snap, 'forced.log'), 'v2\n');
      await writeFile(join(snap, 'other.log'), 'ignored\n');

      const files = await capture();

      expect(files.map((f) => f.path)).toEqual(['forced.log']);
    });

    it('detects a rename and keeps the old path', async () => {
      await repo.commitFile('old-name.txt', 'some stable content\nthat is long enough\nto be matched\n', 'add');
      await snapshot();
      await rm(join(snap, 'old-name.txt'));
      await writeFile(join(snap, 'new-name.txt'), 'some stable content\nthat is long enough\nto be matched\n');

      const files = await capture();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ path: 'new-name.txt', oldPath: 'old-name.txt', change: 'renamed' });
    });

    it('marks a binary file and keeps it applyable', async () => {
      await repo.commitFile('seed.txt', 'seed\n', 'seed');
      await snapshot();
      await writeFile(join(snap, 'img.bin'), Buffer.from([0, 1, 2, 3, 255, 254, 0, 9]));
      const files = await capture();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ path: 'img.bin', binary: true, change: 'added' });
      expect(files[0]!.hunks).toEqual([]);

      const out = await applyFilePatches(repo.path, [{ path: 'img.bin', patch: files[0]!.patch }]);
      expect(out).toEqual([{ path: 'img.bin', ok: true }]);
      expect([...(await readFile(join(repo.path, 'img.bin')))]).toEqual([0, 1, 2, 3, 255, 254, 0, 9]);
    });

    it('splits far-apart edits into separate hunks', async () => {
      await repo.commitFile('long.txt', longFile(), 'add');
      await snapshot();
      await writeFile(join(snap, 'long.txt'), longFile(' CHANGED'));

      const [file] = await capture();
      expect(file!.hunks).toHaveLength(2);
      expect(file!.hunks.map((h) => h.insertions)).toEqual([1, 1]);
      expect(file!.hunks[0]!.header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);
    });

    it('does not report a gitignored build artefact the agent produced, only its real edits', async () => {
      await repo.commitFile('.gitignore', 'node_modules/\ndist/\n', 'ignore');
      await repo.commitFile('src.txt', 'v1\n', 'add');
      await snapshot();
      await mkdir(join(snap, 'node_modules/pkg'), { recursive: true });
      await writeFile(join(snap, 'node_modules/pkg/index.js'), 'x\n');
      await mkdir(join(snap, 'dist'), { recursive: true });
      await writeFile(join(snap, 'dist/out.js'), 'y\n');
      await writeFile(join(snap, 'src.txt'), 'v2\n');

      const files = await capture();

      expect(files.map((f) => f.path)).toEqual(['src.txt']);
    });
  });

  describe('splitFilePatch / buildFilePatch', () => {
    it('round-trips: header + every hunk is the original patch', async () => {
      await repo.commitFile('long.txt', longFile(), 'add');
      await snapshot();
      await writeFile(join(snap, 'long.txt'), longFile(' CHANGED'));
      const [file] = await capture();
      const { header, hunks } = splitFilePatch(file!.patch);
      expect(hunks).toHaveLength(2);
      expect(buildFilePatch(header, hunks)).toBe(file!.patch);
    });

    it('is not fooled by file content that looks like a hunk header', () => {
      const patch = [
        'diff --git a/x.txt b/x.txt',
        'index 111..222 100644',
        '--- a/x.txt',
        '+++ b/x.txt',
        '@@ -1,2 +1,2 @@',
        '-@@ -9,9 +9,9 @@ not a hunk',
        '+@@ -8,8 +8,8 @@ also not a hunk',
        ' tail',
        '',
      ].join('\n');
      expect(splitFilePatch(patch).hunks).toHaveLength(1);
    });

    it('treats a mode-only or binary patch as all header', () => {
      const patch = 'diff --git a/s.sh b/s.sh\nold mode 100644\nnew mode 100755\n';
      expect(splitFilePatch(patch)).toEqual({ header: patch, hunks: [] });
    });
  });

  describe('applyFilePatches', () => {
    it('applies an accepted file to the real checkout as an unstaged edit', async () => {
      await repo.commitFile('a.txt', 'one\ntwo\nthree\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'one\nTWO\nthree\n');
      const [file] = await capture();

      const out = await applyFilePatches(repo.path, [{ path: 'a.txt', patch: file!.patch }]);

      expect(out).toEqual([{ path: 'a.txt', ok: true }]);
      expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\nTWO\nthree\n');
      expect(await repo.git(['status', '--porcelain'])).toBe(' M a.txt\n');
    });

    it('applies only the chosen hunks of a file', async () => {
      await repo.commitFile('long.txt', longFile(), 'add');
      await snapshot();
      await writeFile(join(snap, 'long.txt'), longFile(' CHANGED'));
      const [file] = await capture();
      const { header, hunks } = splitFilePatch(file!.patch);

      const out = await applyFilePatches(repo.path, [{ path: 'long.txt', patch: buildFilePatch(header, [hunks[1]!]) }]);

      expect(out).toEqual([{ path: 'long.txt', ok: true }]);
      const text = await readFile(join(repo.path, 'long.txt'), 'utf8');
      expect(text).toContain('line 36 CHANGED');
      expect(text).not.toContain('line 3 CHANGED');
    });

    it('applies the remaining hunk later, after the first was already applied', async () => {
      await repo.commitFile('long.txt', longFile(), 'add');
      await snapshot();
      await writeFile(join(snap, 'long.txt'), longFile(' CHANGED'));
      const [file] = await capture();
      const { header, hunks } = splitFilePatch(file!.patch);

      await applyFilePatches(repo.path, [{ path: 'long.txt', patch: buildFilePatch(header, [hunks[1]!]) }]);
      const out = await applyFilePatches(repo.path, [{ path: 'long.txt', patch: buildFilePatch(header, [hunks[0]!]) }]);

      expect(out).toEqual([{ path: 'long.txt', ok: true }]);
      expect(await readFile(join(repo.path, 'long.txt'), 'utf8')).toBe(longFile(' CHANGED'));
    });

    it('creates an added file and deletes a deleted one', async () => {
      await repo.commitFile('del.txt', 'bye\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'added.txt'), 'hi\n');
      await rm(join(snap, 'del.txt'));
      const files = await capture();

      const out = await applyFilePatches(
        repo.path,
        files.map((f) => ({ path: f.path, patch: f.patch })),
      );

      expect(out.every((o) => o.ok)).toBe(true);
      expect(await readFile(join(repo.path, 'added.txt'), 'utf8')).toBe('hi\n');
      expect(existsSync(join(repo.path, 'del.txt'))).toBe(false);
    });

    it('reports a conflict, leaves the file untouched, and still applies the others', async () => {
      await repo.commitFile('a.txt', 'one\ntwo\nthree\n', 'add a');
      await repo.commitFile('b.txt', 'bee\n', 'add b');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'one\nTWO\nthree\n');
      await writeFile(join(snap, 'b.txt'), 'BEE\n');
      const files = await capture();

      // The user edits the same line after the snapshot was taken.
      await repo.writeFile('a.txt', 'one\nsomething else entirely\nthree\n');

      const out = await applyFilePatches(
        repo.path,
        files.map((f) => ({ path: f.path, patch: f.patch })),
      );

      expect(out.find((o) => o.path === 'a.txt')).toMatchObject({ ok: false });
      expect((out.find((o) => o.path === 'a.txt') as { reason: string }).reason).toMatch(/working tree changed/);
      expect(out.find((o) => o.path === 'b.txt')).toEqual({ path: 'b.txt', ok: true });
      expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\nsomething else entirely\nthree\n');
      expect(await readFile(join(repo.path, 'b.txt'), 'utf8')).toBe('BEE\n');
    });

    it('refuses to add a file that now exists, with a sentence about it', async () => {
      await repo.commitFile('seed.txt', 'seed\n', 'seed');
      await snapshot();
      await writeFile(join(snap, 'new.txt'), 'agent version\n');
      const [file] = await capture();
      await repo.writeFile('new.txt', 'user version\n');

      const out = await applyFilePatches(repo.path, [{ path: 'new.txt', patch: file!.patch }]);

      expect(out[0]).toMatchObject({ ok: false });
      expect((out[0] as { reason: string }).reason).toMatch(/already exists/);
      expect(await readFile(join(repo.path, 'new.txt'), 'utf8')).toBe('user version\n');
    });

    it('applies a hunk even when the user edited elsewhere in the file (offset)', async () => {
      await repo.commitFile('long.txt', longFile(), 'add');
      await snapshot();
      await writeFile(join(snap, 'long.txt'), longFile(' CHANGED'));
      const [file] = await capture();
      const { header, hunks } = splitFilePatch(file!.patch);

      // The user prepends lines, shifting every line number.
      await repo.writeFile('long.txt', `prologue 1\nprologue 2\n${longFile()}`);
      const out = await applyFilePatches(repo.path, [{ path: 'long.txt', patch: buildFilePatch(header, [hunks[1]!]) }]);

      expect(out).toEqual([{ path: 'long.txt', ok: true }]);
      expect(await readFile(join(repo.path, 'long.txt'), 'utf8')).toContain('line 36 CHANGED');
    });

    it('serialises through the per-repo write queue', async () => {
      await repo.commitFile('a.txt', 'a\n', 'add');
      await repo.commitFile('b.txt', 'b\n', 'add');
      await snapshot();
      await writeFile(join(snap, 'a.txt'), 'A\n');
      await writeFile(join(snap, 'b.txt'), 'B\n');
      const files = await capture();

      const both = await Promise.all(files.map((f) => applyFilePatches(repo.path, [{ path: f.path, patch: f.patch }])));

      expect(both.flat().every((o) => o.ok)).toBe(true);
      expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('A\n');
      expect(await readFile(join(repo.path, 'b.txt'), 'utf8')).toBe('B\n');
    });
  });
});
