import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { protocol, session } from 'electron';

import { mstudioImageUrl } from '@midnite/studio-shared';

import { installMgitFileProtocol, resolveBlobRequest, resolveRequestPath } from './fs-protocol';

// The module reaches for `electron` at import time; nothing under test here
// touches it, so a stub keeps this a plain unit test.
vi.mock('electron', () => ({
  net: {},
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  session: { fromPartition: vi.fn(() => ({ protocol: { handle: vi.fn() } })) },
}));

// `vi.hoisted` because the mock factory is hoisted above these lines.
const { resolveWorkdir } = vi.hoisted(() => ({ resolveWorkdir: vi.fn() }));
vi.mock('./repo-registry', () => ({ resolveWorkdir }));

describe('resolveBlobRequest (the ?rev= half of the scheme)', () => {
  it('passes on a plain media request, leaving it to the disk path', async () => {
    await expect(resolveBlobRequest('mstudio-file://repo/r1/docs/a.png')).resolves.toEqual({
      kind: 'none',
    });
    expect(resolveWorkdir).not.toHaveBeenCalled();
  });

  it('resolves a rev request to the repo workdir', async () => {
    resolveWorkdir.mockResolvedValueOnce('/repos/one');
    await expect(resolveBlobRequest('mstudio-file://repo/r1/docs/a%20b.png?rev=HEAD')).resolves.toEqual(
      { kind: 'blob', repoPath: '/repos/one', rev: 'HEAD', relPath: 'docs/a b.png' },
    );
  });

  it('keeps the index rev, which is how an unstaged before-side is addressed', async () => {
    resolveWorkdir.mockResolvedValueOnce('/repos/one');
    const result = await resolveBlobRequest('mstudio-file://repo/r1/a.png?rev=%3A');
    expect(result).toMatchObject({ kind: 'blob', rev: ':' });
  });

  it.each([
    ['a flag-shaped rev', 'mstudio-file://repo/r1/a.png?rev=--upload-pack%3Devil'],
    ['a rev with a range', 'mstudio-file://repo/r1/a.png?rev=HEAD..evil'],
    ['a rev with a space and semicolon', 'mstudio-file://repo/r1/a.png?rev=HEAD%3B%20rm'],
    ['a traversing path', 'mstudio-file://repo/r1/..%2F..%2Fetc%2Fpasswd?rev=HEAD'],
    ['the wrong scope', 'mstudio-file://claude-home/-/a.png?rev=HEAD'],
    ['no path at all', 'mstudio-file://repo/r1?rev=HEAD'],
  ])('refuses %s — and refuses it as invalid, never as a disk read', async (_name, url) => {
    resolveWorkdir.mockResolvedValue('/repos/one');
    await expect(resolveBlobRequest(url)).resolves.toEqual({ kind: 'invalid' });
  });

  it('refuses a repo the registry does not know', async () => {
    resolveWorkdir.mockResolvedValueOnce(null);
    await expect(resolveBlobRequest('mstudio-file://repo/nope/a.png?rev=HEAD')).resolves.toEqual({
      kind: 'invalid',
    });
  });
});

describe('scheme registration scope (Phase 32 Theme B)', () => {
  it('registers mstudio-file on the default session only, never on a named partition', () => {
    installMgitFileProtocol();

    // The module-level `protocol` IS `session.defaultSession.protocol`; a
    // `persist:browser` view therefore has no handler for the scheme, which
    // is what keeps the renderer's media path unreachable from a remote page.
    expect(protocol.handle).toHaveBeenCalledWith('mstudio-file', expect.any(Function));
    expect(session.fromPartition).not.toHaveBeenCalled();
  });
});

describe('resolveRequestPath — markdown images (?as=image)', () => {
  let base: string;
  let repo: string;
  let outside: string;

  beforeAll(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var → /private/var).
    base = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-mdimg-')));
    repo = join(base, 'repo');
    outside = join(base, 'outside');
    await mkdir(join(repo, 'docs', 'screenshots'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(repo, 'docs', 'screenshots', 'a.png'), 'png');
    await writeFile(join(repo, 'logo.svg'), '<svg/>');
    await writeFile(join(repo, '.env'), 'SECRET=1');
    await writeFile(join(outside, 'escape.png'), 'png');
    // Inside-the-repo names that point elsewhere.
    await symlink(join(outside, 'escape.png'), join(repo, 'linked-out.png'));
    await symlink(join(repo, '.env'), join(repo, 'disguised.png'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(() => {
    resolveWorkdir.mockReset();
    resolveWorkdir.mockResolvedValue(repo);
  });

  it('serves an image inside the repo', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', 'docs/screenshots/a.png'))).resolves.toBe(
      join(repo, 'docs', 'screenshots', 'a.png'),
    );
  });

  it('serves an image at the repo root — the target of an absolute /logo.svg src', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', 'logo.svg'))).resolves.toBe(
      join(repo, 'logo.svg'),
    );
  });

  it('refuses a .. escape out of the root', async () => {
    await expect(
      resolveRequestPath('mstudio-file://repo/r1/..%2Foutside%2Fescape.png?as=image'),
    ).resolves.toBeNull();
  });

  it('refuses a symlink inside the repo that points out of it', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', 'linked-out.png'))).resolves.toBeNull();
  });

  it('refuses a non-image extension when the request is image-only', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', '.env'))).resolves.toBeNull();
    // The plain media URL is unchanged — the Files pane still opens the file.
    await expect(resolveRequestPath('mstudio-file://repo/r1/.env')).resolves.toBe(join(repo, '.env'));
  });

  it('refuses an image-named symlink whose real target is not an image', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', 'disguised.png'))).resolves.toBeNull();
  });

  it('refuses a missing image and an unknown repo', async () => {
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'r1', 'docs/nope.png'))).resolves.toBeNull();
    resolveWorkdir.mockResolvedValueOnce(null);
    await expect(resolveRequestPath(mstudioImageUrl('repo', 'gone', 'logo.svg'))).resolves.toBeNull();
  });
});
