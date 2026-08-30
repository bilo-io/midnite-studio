import { describe, expect, it, vi } from 'vitest';

import { protocol, session } from 'electron';

import { installMgitFileProtocol, resolveBlobRequest } from './fs-protocol';

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
    await expect(resolveBlobRequest('mgit-file://repo/r1/docs/a.png')).resolves.toEqual({
      kind: 'none',
    });
    expect(resolveWorkdir).not.toHaveBeenCalled();
  });

  it('resolves a rev request to the repo workdir', async () => {
    resolveWorkdir.mockResolvedValueOnce('/repos/one');
    await expect(resolveBlobRequest('mgit-file://repo/r1/docs/a%20b.png?rev=HEAD')).resolves.toEqual(
      { kind: 'blob', repoPath: '/repos/one', rev: 'HEAD', relPath: 'docs/a b.png' },
    );
  });

  it('keeps the index rev, which is how an unstaged before-side is addressed', async () => {
    resolveWorkdir.mockResolvedValueOnce('/repos/one');
    const result = await resolveBlobRequest('mgit-file://repo/r1/a.png?rev=%3A');
    expect(result).toMatchObject({ kind: 'blob', rev: ':' });
  });

  it.each([
    ['a flag-shaped rev', 'mgit-file://repo/r1/a.png?rev=--upload-pack%3Devil'],
    ['a rev with a range', 'mgit-file://repo/r1/a.png?rev=HEAD..evil'],
    ['a rev with a space and semicolon', 'mgit-file://repo/r1/a.png?rev=HEAD%3B%20rm'],
    ['a traversing path', 'mgit-file://repo/r1/..%2F..%2Fetc%2Fpasswd?rev=HEAD'],
    ['the wrong scope', 'mgit-file://claude-home/-/a.png?rev=HEAD'],
    ['no path at all', 'mgit-file://repo/r1?rev=HEAD'],
  ])('refuses %s — and refuses it as invalid, never as a disk read', async (_name, url) => {
    resolveWorkdir.mockResolvedValue('/repos/one');
    await expect(resolveBlobRequest(url)).resolves.toEqual({ kind: 'invalid' });
  });

  it('refuses a repo the registry does not know', async () => {
    resolveWorkdir.mockResolvedValueOnce(null);
    await expect(resolveBlobRequest('mgit-file://repo/nope/a.png?rev=HEAD')).resolves.toEqual({
      kind: 'invalid',
    });
  });
});

describe('scheme registration scope (Phase 32 Theme B)', () => {
  it('registers mgit-file on the default session only, never on a named partition', () => {
    installMgitFileProtocol();

    // The module-level `protocol` IS `session.defaultSession.protocol`; a
    // `persist:browser` view therefore has no handler for the scheme, which
    // is what keeps the renderer's media path unreachable from a remote page.
    expect(protocol.handle).toHaveBeenCalledWith('mgit-file', expect.any(Function));
    expect(session.fromPartition).not.toHaveBeenCalled();
  });
});
