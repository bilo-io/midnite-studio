import { mkdtempSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isProfilePath,
  prepareConfinement,
  probeConfinement,
  sweepProfileFiles,
  wrapWithSandbox,
  SANDBOX_EXEC,
} from './confine';
import { resolveSessionRoots } from './confine-roots';

describe('probeConfinement', () => {
  it('says unavailable off macOS', () => {
    expect(probeConfinement({ platform: 'linux' })).toMatchObject({ available: false });
  });
  it('says unavailable when the binary is absent', () => {
    expect(probeConfinement({ platform: 'darwin', exists: () => false }).reason).toMatch(/not present/);
  });
  it('says unavailable when the binary refuses a profile', () => {
    expect(probeConfinement({ platform: 'darwin', exists: () => true, run: () => false }).reason).toMatch(/refused/);
  });
  it('says available when the probe profile runs', () => {
    expect(probeConfinement({ platform: 'darwin', exists: () => true, run: () => true })).toEqual({ available: true });
  });
});

describe('profile files', () => {
  it('writes 0600 under security/profiles, removes on dispose, sweeps leftovers', () => {
    const userData = mkdtempSync(join(tmpdir(), 'confine-'));
    const a = prepareConfinement(userData, '(version 1)', 'one');
    const b = prepareConfinement(userData, '(version 1)', 'two');
    expect(isProfilePath(a.profilePath)).toBe(true);
    expect(statSync(a.profilePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(a.profilePath, 'utf8')).toBe('(version 1)');
    a.dispose();
    a.dispose();
    expect(existsSync(a.profilePath)).toBe(false);
    expect(sweepProfileFiles(userData)).toBe(1);
    expect(existsSync(b.profilePath)).toBe(false);
  });
  it('refuses an id that could climb out of the directory', () => {
    expect(() => prepareConfinement(tmpdir(), '', '../x')).toThrow();
    expect(isProfilePath('/x/security/profiles/../../etc.sb')).toBe(false);
  });
});

describe('wrapWithSandbox', () => {
  it('prefixes sandbox-exec -f', () => {
    expect(wrapWithSandbox('/p.sb', '/bin/zsh', ['-l'])).toEqual({ command: SANDBOX_EXEC, args: ['-f', '/p.sb', '/bin/zsh', '-l'] });
  });
});

describe('resolveSessionRoots', () => {
  it('collects toplevel, common dir and worktrees', async () => {
    const answers: Record<string, string> = {
      'rev-parse --show-toplevel': '/r/wt\n',
      'rev-parse --git-common-dir': '/r/.git\n',
      'worktree list --porcelain': 'worktree /r\nHEAD x\n\nworktree /r/wt\n',
    };
    const roots = await resolveSessionRoots('/r/wt', async (args) => answers[args.join(' ')] ?? '');
    expect(roots).toEqual(['/r/wt', '/r/.git', '/r']);
  });
  it('gives no roots outside a repo', async () => {
    expect(await resolveSessionRoots('/home/u', async () => { throw new Error('not a repo'); })).toEqual([]);
  });
});
