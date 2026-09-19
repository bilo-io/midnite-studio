import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `hookScriptPath()` (`electron`'s `app.isPackaged`/`process.resourcesPath`,
 * plus a `__dirname` relative to the COMPILED `dist/bundle/main.js`) is
 * `hook-script-path.test.ts`'s own job — its own dev-branch is meaningless
 * under vitest, which runs the source file directly rather than the bundle
 * it navigates relative to. Mocked here to point straight at the real
 * `prepare-commit-msg.sh` beside this test file instead, so `install.ts`'s
 * own logic (never clobber, `core.hooksPath` vs default, idempotent,
 * removal) is exercised against real git and real fs on a throwaway repo —
 * the same approach `git-engine`'s own `*.integration.test.ts` files use,
 * because the risk this theme carries is exactly the kind a mocked
 * filesystem would paper over.
 */
vi.mock('./hook-script-path', () => ({
  hookScriptPath: () => join(__dirname, 'prepare-commit-msg.sh'),
}));

import { TempRepo } from '@midnite/studio-git-engine';

import { ensureHookInstalled, ensureHookRemoved, hookStatus } from './install';

describe('hooks install/status/remove (Phase 78 Theme E)', () => {
  const repos: TempRepo[] = [];
  const makeRepo = async (): Promise<TempRepo> => {
    const repo = await TempRepo.create();
    repos.push(repo);
    return repo;
  };

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((r) => r.cleanup()));
  });

  it('reports not installed for a fresh repo', async () => {
    const repo = await makeRepo();
    await expect(hookStatus(repo.path)).resolves.toEqual({ ok: true, value: { installed: false } });
  });

  it('installs into .git/hooks/ when core.hooksPath is unset', async () => {
    const repo = await makeRepo();
    await expect(ensureHookInstalled(repo.path)).resolves.toEqual({ ok: true });

    const target = join(repo.path, '.git', 'hooks', 'prepare-commit-msg');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('midnite-studio:prepare-commit-msg:v1');
    await expect(hookStatus(repo.path)).resolves.toEqual({ ok: true, value: { installed: true } });
  });

  it('installs into core.hooksPath when the repo already configures one', async () => {
    const repo = await makeRepo();
    await repo.git(['config', 'core.hooksPath', '.githooks']);

    await expect(ensureHookInstalled(repo.path)).resolves.toEqual({ ok: true });

    const target = join(repo.path, '.githooks', 'prepare-commit-msg');
    expect(existsSync(target)).toBe(true);
    // Never wrote into the default location instead.
    expect(existsSync(join(repo.path, '.git', 'hooks', 'prepare-commit-msg'))).toBe(false);
  });

  it('is idempotent — installing twice is a no-op the second time', async () => {
    const repo = await makeRepo();
    await ensureHookInstalled(repo.path);
    await expect(ensureHookInstalled(repo.path)).resolves.toEqual({ ok: true });
  });

  it('refuses to clobber a pre-existing hook it did not install', async () => {
    const repo = await makeRepo();
    const target = join(repo.path, '.git', 'hooks', 'prepare-commit-msg');
    writeFileSync(target, '#!/bin/sh\necho "user hook"\n');

    const result = await ensureHookInstalled(repo.path);
    expect(result.ok).toBe(false);
    // Untouched.
    expect(readFileSync(target, 'utf8')).toBe('#!/bin/sh\necho "user hook"\n');
  });

  it('removes only its own hook, and never a pre-existing user hook (fixture sentinel)', async () => {
    const repo = await makeRepo();
    const target = join(repo.path, '.git', 'hooks', 'prepare-commit-msg');

    await ensureHookInstalled(repo.path);
    await expect(ensureHookRemoved(repo.path)).resolves.toEqual({ ok: true });
    expect(existsSync(target)).toBe(false);

    // A sentinel hook that was never ours — `ensureHookRemoved` must leave it alone.
    writeFileSync(target, '#!/bin/sh\necho sentinel\n');
    await expect(ensureHookRemoved(repo.path)).resolves.toEqual({ ok: true });
    expect(readFileSync(target, 'utf8')).toBe('#!/bin/sh\necho sentinel\n');
  });
});
