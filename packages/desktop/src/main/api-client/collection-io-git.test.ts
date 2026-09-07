import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importCollection, readCollection, saveCollection } from './collection-io';

const run = promisify(execFile);

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'sample.postman_collection.json');

/**
 * Phase 66 Theme H — import, then save with no edit, and **git itself** must
 * report no change.
 *
 * The theme lists this as a Playwright item, and it cannot be one: a
 * Playwright spec runs the renderer against a *mocked* bridge with no real
 * files and no repository, so `git diff --exit-code` has nothing to run
 * against. The property it is reaching for is a main-process one, so it is
 * asserted here instead.
 *
 * It is also not a duplicate of `collection-io.test.ts`'s round trip. That
 * one asserts byte equality against a normalised original — this one asserts
 * the *user-visible* consequence: after opening and saving a collection
 * without editing it, `git status` is clean and the repo shows no spurious
 * change. Byte equality implies it, but git is what the user actually looks
 * at, and a trailing-newline or line-ending slip is exactly the kind of thing
 * that satisfies one and not the other.
 */
describe('collection-io, through git', () => {
  let repoRoot: string;

  const git = (...args: string[]) => run('git', ['-C', repoRoot, ...args]);

  beforeEach(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var) and `confineParent`/`confineTree` compare against the real
    // root, so the fixture must too.
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-collection-git-')));
    await git('init', '--quiet');
    // Committing needs an identity, and this repo's own hook-enforced one is
    // irrelevant to a throwaway fixture — set it locally so the test does not
    // depend on the machine's global config.
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('import → commit → save with no edit leaves git reporting no diff', async () => {
    const imported = await importCollection(repoRoot, FIXTURE_PATH);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    // Commit what import wrote, so git has a baseline to diff against.
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'import');

    // Nothing staged or unstaged at this point.
    await expect(git('diff', '--exit-code')).resolves.toBeTruthy();

    // Read it back and save it straight down again, with no edit at all —
    // the exact loop a user performs by opening a collection and hitting save.
    const read = await readCollection(repoRoot, imported.value.id);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const saved = await saveCollection(repoRoot, imported.value.id, read.value);
    expect(saved.ok).toBe(true);

    // The assertion that matters: `git diff --exit-code` exits 0. It rejects
    // on a non-zero exit, so a spurious rewrite fails this line.
    await expect(git('diff', '--exit-code')).resolves.toBeTruthy();

    // And nothing untracked appeared either — `--porcelain` empty means a
    // genuinely clean tree, not merely an unmodified tracked file.
    const status = await git('status', '--porcelain');
    expect(status.stdout).toBe('');
  });
});
