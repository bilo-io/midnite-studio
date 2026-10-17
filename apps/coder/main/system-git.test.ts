// @vitest-environment node
// vitest, not Playwright: binary resolution is a pure function over an injected probe; exec runs the
// machine's own git (when it has one) in a temp directory only.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { GitProcess, NO_GIT, resolveSystemGit, systemGit, type GitProbe } from './system-git';

const probe = (over: Partial<GitProbe> & { files?: string[] } = {}): GitProbe => ({
  env: over.env ?? {},
  exists: over.exists ?? ((path) => (over.files ?? []).includes(path)),
  developerDir: over.developerDir ?? (() => null),
});

describe('resolveSystemGit', () => {
  it('prefers an explicit MIDNITE_GIT, then Homebrew, then the selected developer directory', () => {
    const files = ['/x/git', '/opt/homebrew/bin/git', '/Library/Developer/CommandLineTools/usr/bin/git'];
    const developerDir = () => '/Library/Developer/CommandLineTools';
    expect(resolveSystemGit(probe({ env: { MIDNITE_GIT: '/x/git' }, files, developerDir }))).toEqual({ path: '/x/git' });
    expect(resolveSystemGit(probe({ files, developerDir }))).toEqual({ path: '/opt/homebrew/bin/git' });
    expect(resolveSystemGit(probe({ files: files.slice(2), developerDir }))).toEqual({
      path: '/Library/Developer/CommandLineTools/usr/bin/git',
    });
  });

  it('runs the developer directory’s own git, never the /usr/bin/git shim that opens an install dialog', () => {
    const resolved = resolveSystemGit(probe({ files: ['/usr/bin/git'] }));
    expect(resolved).toEqual({ path: null, reason: NO_GIT });
  });

  it('says how to install the Command Line Tools when there is no git at all', () => {
    expect(NO_GIT).toContain('xcode-select --install');
  });
});

describe('GitProcess (the dugite stand-in Coder bundles)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const hasGit = systemGit().path !== null;

  it.skipIf(!hasGit)('runs git and resolves its output and exit code, as dugite does', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'coder-git-')));
    dirs.push(dir);
    const init = await GitProcess.exec(['init', '--initial-branch=main', dir], tmpdir());
    expect(init.exitCode).toBe(0);
    const top = await GitProcess.exec(['rev-parse', '--show-toplevel'], dir);
    expect(top).toMatchObject({ exitCode: 0, stdout: `${dir}\n` });
    const bad = await GitProcess.exec(['rev-parse', 'no-such-rev'], dir);
    expect(bad.exitCode).not.toBe(0);
  });

  it.skipIf(!hasGit)('rejects for a directory that no longer exists — git-exec turns that into exit -1', async () => {
    await expect(GitProcess.exec(['status'], join(tmpdir(), 'coder-git-missing-dir'))).rejects.toThrow();
  });
});
