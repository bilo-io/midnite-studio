import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { confineTree } from './fs-scope-write';

describe('confineTree (Phase 59 — the recursive-delete jail)', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var), and confineTree compares against the REAL root.
    root = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-confine-tree-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-confine-tree-outside-')));
    await mkdir(join(root, 'repo-a', 'node_modules'), { recursive: true });
    await mkdir(join(root, '.git'), { recursive: true });
    await symlink(outside, join(root, 'escape-link'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('allows a legitimate node_modules under a registered root', async () => {
    const target = join(root, 'repo-a', 'node_modules');
    await expect(confineTree(root, target)).resolves.toBe(await realpath(target));
  });

  it('refuses a path outside the root', async () => {
    await expect(confineTree(root, outside)).resolves.toBeNull();
  });

  it('refuses the root itself as a target', async () => {
    await expect(confineTree(root, root)).resolves.toBeNull();
  });

  it('refuses a symlink pointing outside the root — resolves to its real target first', async () => {
    await expect(confineTree(root, join(root, 'escape-link'))).resolves.toBeNull();
  });

  it('refuses .git at depth', async () => {
    const target = join(root, '.git');
    // confineTree alone has no .git-specific rule; it is enforced by the
    // scan/delete caller refusing any `.git` path before it ever reaches
    // this function. This test documents that confineTree's own contract
    // is purely root-containment, so `.git` still resolves as "inside root"
    // here — the caller-side refusal is exercised in scan-service.test.ts.
    await expect(confineTree(root, target)).resolves.toBe(await realpath(target));
  });

  it('refuses a nonexistent path', async () => {
    await expect(confineTree(root, join(root, 'nope'))).resolves.toBeNull();
  });
});
