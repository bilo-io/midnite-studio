import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCliInstaller, onPathFields } from './cli-installer';

// Vitest, node: every path is a temp dir passed as a parameter — nothing here
// can reach a real /usr/local/bin or ~/.local/bin.

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rt-cli-'));
  dirs.push(root);
  const bundleBinDir = join(root, 'bundle', 'bin');
  mkdirSync(bundleBinDir, { recursive: true });
  for (const n of ['midnite', 'midnite-studio']) writeFileSync(join(bundleBinDir, n), '#!/bin/sh\n');
  const primaryDir = join(root, 'primary');
  const userDir = join(root, 'user');
  mkdirSync(primaryDir);
  const installer = createCliInstaller({
    bundleBinDir,
    homeDir: root,
    path: `${userDir}:/usr/bin`,
    preferredTargets: () => [join(primaryDir, 'midnite'), join(userDir, 'midnite')],
  });
  return { root, bundleBinDir, primaryDir, userDir, installer };
}

describe('createCliInstaller', () => {
  it('reports not installed on an empty machine', () => {
    expect(fixture().installer.status()).toEqual({ installed: false, path: null, target: null, managed: false });
  });

  it('installs midnite plus the deprecated midnite-studio alias, both into the bundle', () => {
    const f = fixture();
    const res = f.installer.install();
    expect(res.ok).toBe(true);
    expect(readlinkSync(join(f.primaryDir, 'midnite'))).toBe(join(f.bundleBinDir, 'midnite'));
    expect(readlinkSync(join(f.primaryDir, 'midnite-studio'))).toBe(join(f.bundleBinDir, 'midnite-studio'));
    expect(f.installer.status()).toMatchObject({ installed: true, managed: true, command: 'midnite', aliasInstalled: true });
  });

  it('never replaces a foreign midnite: installs only the alias and says why', () => {
    const f = fixture();
    writeFileSync(join(f.primaryDir, 'midnite'), '#!/bin/sh\n# someone else\n');
    const res = f.installer.install();
    expect(res.ok).toBe(true);
    expect(lstatSync(join(f.primaryDir, 'midnite')).isSymbolicLink()).toBe(false);
    expect(existsSync(join(f.primaryDir, 'midnite-studio'))).toBe(true);
    if (res.ok) expect(res.value.notice).toMatch(/left untouched/);
  });

  it('a symlink into another tool is foreign too, and uninstall leaves it alone', () => {
    const f = fixture();
    const other = join(f.root, 'other-midnite');
    writeFileSync(other, '#!/bin/sh\n');
    symlinkSync(other, join(f.primaryDir, 'midnite'));
    f.installer.install();
    expect(readlinkSync(join(f.primaryDir, 'midnite'))).toBe(other);
    expect(f.installer.uninstall().ok).toBe(true);
    expect(existsSync(join(f.primaryDir, 'midnite'))).toBe(true);
    expect(existsSync(join(f.primaryDir, 'midnite-studio'))).toBe(false);
  });

  it("'user' installs only into the user-local target, creating its directory", () => {
    const f = fixture();
    expect(f.installer.install('user').ok).toBe(true);
    expect(existsSync(join(f.userDir, 'midnite'))).toBe(true);
    expect(existsSync(join(f.primaryDir, 'midnite'))).toBe(false);
  });

  it('uninstall removes both owned links', () => {
    const f = fixture();
    f.installer.install();
    const res = f.installer.uninstall();
    expect(res.ok).toBe(true);
    expect(existsSync(join(f.primaryDir, 'midnite'))).toBe(false);
    expect(existsSync(join(f.primaryDir, 'midnite-studio'))).toBe(false);
  });
});

describe('onPathFields', () => {
  it('is on PATH when the target directory is an entry, and names the export line when not', () => {
    expect(onPathFields('/a/midnite', '/b:/a/')).toEqual({ onPath: true, pathExportLine: null });
    expect(onPathFields('/a/midnite', undefined)).toEqual({ onPath: false, pathExportLine: 'export PATH="/a:$PATH"' });
  });
});
