import { mkdir, mkdtemp, realpath, rm, symlink, writeFile as writeFileFixture } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  confineParent,
  createDirectory,
  createFile,
  describeFsError,
  isSymlinkTarget,
  openForOverwrite,
  targetExists,
  targetPath,
} from './fs-scope-write';

describe('confineParent (the writable half of the jail)', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var → /private/var),
    // and confineParent compares against the REAL root, so the fixture must too.
    root = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-write-jail-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-write-outside-')));
    await mkdir(join(root, 'sub'));
    await writeFileFixture(join(root, 'sub', 'existing.txt'), 'ok');
    await symlink(outside, join(root, 'evil-dir'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('confines a top-level target to the root itself as parent', async () => {
    const target = await confineParent(root, 'new.txt');
    expect(target).toEqual({ dir: root, name: 'new.txt' });
  });

  it('confines a nested target whose parent already exists', async () => {
    const target = await confineParent(root, 'sub/new.txt');
    expect(target).toEqual({ dir: join(root, 'sub'), name: 'new.txt' });
  });

  it('refuses when the immediate parent does not exist (no mkdir -p)', async () => {
    await expect(confineParent(root, 'nope/new.txt')).resolves.toBeNull();
  });

  it.each([
    ['.. traversal', '../etc/passwd'],
    ['nested .. traversal', 'sub/../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a windows drive', 'C:\\Windows\\system32'],
    ['a NUL byte', 'a\0b'],
    ['an empty final segment (trailing slash)', 'sub/'],
    ['a bare separator (empty final segment)', '/'],
    ['a final segment of "."', 'sub/.'],
    ['a final segment of ".."', 'sub/..'],
    ['a final segment of ".git"', 'sub/.git'],
    ['.git as a non-final ancestor', '.git/config'],
    ['.git deep in the path', 'sub/.git/HEAD'],
  ])('rejects %s', async (_name, relPath) => {
    await expect(confineParent(root, relPath)).resolves.toBeNull();
  });

  it('rejects a parent that resolves outside the root through a symlink', async () => {
    await expect(confineParent(root, 'evil-dir/new.txt')).resolves.toBeNull();
  });
});

describe('isSymlinkTarget / targetExists', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mstudio-write-target-'));
    await writeFileFixture(join(root, 'real.txt'), 'hello');
    await symlink(join(root, 'real.txt'), join(root, 'alias.txt'));
    await symlink(join(root, 'nope.txt'), join(root, 'dangling.txt'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('is false for a regular file', async () => {
    await expect(isSymlinkTarget({ dir: root, name: 'real.txt' })).resolves.toBe(false);
  });

  it('is true for a symlink to a real file', async () => {
    await expect(isSymlinkTarget({ dir: root, name: 'alias.txt' })).resolves.toBe(true);
  });

  it('is true for a dangling symlink — "not a regular file", not "not allowed"', async () => {
    await expect(isSymlinkTarget({ dir: root, name: 'dangling.txt' })).resolves.toBe(true);
  });

  it('is false for a path that does not exist at all', async () => {
    await expect(isSymlinkTarget({ dir: root, name: 'missing.txt' })).resolves.toBe(false);
  });

  it('targetExists is true for a symlink and false for nothing', async () => {
    await expect(targetExists({ dir: root, name: 'alias.txt' })).resolves.toBe(true);
    await expect(targetExists({ dir: root, name: 'missing.txt' })).resolves.toBe(false);
  });
});

describe('createFile / openForOverwrite (the descriptor-level TOCTOU guards)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mstudio-write-create-'));
    await writeFileFixture(join(root, 'existing.txt'), 'hi');
    await symlink(join(root, 'existing.txt'), join(root, 'alias.txt'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a brand-new file', async () => {
    const handle = await createFile({ dir: root, name: 'brand-new.txt' });
    expect(handle).not.toBeNull();
    await handle?.close();
  });

  it('refuses to create over an existing file (O_EXCL)', async () => {
    await expect(createFile({ dir: root, name: 'existing.txt' })).resolves.toBeNull();
  });

  it('refuses to create over an existing symlink, even a dangling one', async () => {
    await expect(createFile({ dir: root, name: 'alias.txt' })).resolves.toBeNull();
  });

  it('opens an existing regular file for overwrite', async () => {
    const handle = await openForOverwrite({ dir: root, name: 'existing.txt' });
    expect(handle).not.toBeNull();
    await handle?.close();
  });

  it('refuses to open a symlink for overwrite (O_NOFOLLOW)', async () => {
    await expect(openForOverwrite({ dir: root, name: 'alias.txt' })).resolves.toBeNull();
  });

  it('refuses to open a missing file for overwrite', async () => {
    await expect(openForOverwrite({ dir: root, name: 'missing.txt' })).resolves.toBeNull();
  });
});

describe('createDirectory', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mstudio-write-mkdir-'));
    await writeFileFixture(join(root, 'existing.txt'), 'hi');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a new directory', async () => {
    await expect(createDirectory({ dir: root, name: 'new-dir' })).resolves.toBe(true);
  });

  it('refuses when something already exists at the target', async () => {
    await expect(createDirectory({ dir: root, name: 'existing.txt' })).resolves.toBe(false);
  });
});

describe('targetPath', () => {
  it('joins dir and name', () => {
    expect(targetPath({ dir: '/root/sub', name: 'a.ts' })).toBe(join('/root/sub', 'a.ts'));
  });
});

describe('describeFsError', () => {
  it.each([
    ['ENOENT', 'the file no longer exists'],
    ['EACCES', 'permission denied'],
    ['EEXIST', 'something already exists at that path'],
    ['ENOTDIR', 'a path segment is not a directory'],
    ['EISDIR', 'that path is a directory, not a file'],
    ['ENOSPC', 'no space left on device'],
    ['ENOTEMPTY', 'the directory is not empty'],
  ])('maps %s to a human-readable message', (code, expected) => {
    expect(describeFsError(Object.assign(new Error('raw'), { code }))).toBe(expected);
  });

  it('falls back to the raw message for an unmapped error', () => {
    expect(describeFsError(new Error('something odd'))).toBe('something odd');
  });

  it('falls back to String() for a non-Error throw', () => {
    expect(describeFsError('a string throw')).toBe('a string throw');
  });
});
