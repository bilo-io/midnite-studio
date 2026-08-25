import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { confineToRoot, joinWithin } from './fs-scope';

describe('joinWithin (the pure half of the jail)', () => {
  const root = '/safe/root';

  it.each([
    ['plain child', 'src/index.ts', '/safe/root/src/index.ts'],
    ['the root itself', '', '/safe/root'],
    ['dot segments that stay inside', 'src/../src/a.ts', '/safe/root/src/a.ts'],
  ])('accepts %s', (_name, relPath, expected) => {
    expect(joinWithin(root, relPath)).toBe(expected);
  });

  it.each([
    ['plain traversal', '../etc/passwd'],
    ['nested traversal', 'src/../../etc/passwd'],
    ['absolute path', '/etc/passwd'],
    ['windows drive', 'C:\\Windows\\system32'],
    ['NUL byte', 'a\0b'],
  ])('rejects %s', (_name, relPath) => {
    expect(joinWithin(root, relPath)).toBeNull();
  });

  it('rejects the sibling-prefix trick (/safe/root-evil)', () => {
    expect(joinWithin('/safe/root', '../root-evil/x')).toBeNull();
  });
});

describe('confineToRoot (the symlink half)', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mgit-jail-'));
    outside = await mkdtemp(join(tmpdir(), 'mgit-outside-'));
    await mkdir(join(root, 'sub'));
    await writeFile(join(root, 'sub', 'inside.txt'), 'ok');
    await writeFile(join(outside, 'secret.txt'), 'no');
    await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'));
    await symlink(join(root, 'sub', 'inside.txt'), join(root, 'alias.txt'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('accepts a real file under the root', async () => {
    await expect(confineToRoot(root, 'sub/inside.txt')).resolves.toContain('inside.txt');
  });

  it('accepts a symlink whose target stays under the root', async () => {
    await expect(confineToRoot(root, 'alias.txt')).resolves.toContain('inside.txt');
  });

  it('rejects a symlink escaping the root', async () => {
    await expect(confineToRoot(root, 'escape.txt')).resolves.toBeNull();
  });

  it('rejects missing files (not-there and not-allowed look the same)', async () => {
    await expect(confineToRoot(root, 'nope.txt')).resolves.toBeNull();
  });
});
