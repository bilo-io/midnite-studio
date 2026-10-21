import { mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCHER_BUNDLE, decideUpdateOwner, launcherSearchPaths } from './update-handover';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'handover-'));
  dirs.push(d);
  return d;
};

describe('decideUpdateOwner', () => {
  it('is managed when the launcher bundle exists in the install dir', () => {
    const root = tmp();
    mkdirSync(join(root, 'apps', LAUNCHER_BUNDLE), { recursive: true });
    const searchPaths = launcherSearchPaths(join(root, 'home'), join(root, 'apps'));
    const d = decideUpdateOwner({ exists: existsSync, searchPaths, offerDismissed: false });
    expect(d).toEqual({ owner: 'managed', launcherPath: join(root, 'apps', LAUNCHER_BUNDLE), offerLauncher: false });
  });

  it('finds a per-user launcher install', () => {
    const root = tmp();
    mkdirSync(join(root, 'home', 'Applications', LAUNCHER_BUNDLE), { recursive: true });
    const searchPaths = launcherSearchPaths(join(root, 'home'), join(root, 'apps'));
    expect(decideUpdateOwner({ exists: existsSync, searchPaths, offerDismissed: true }).owner).toBe('managed');
  });

  it('keeps self-updating and offers the launcher once when it is absent', () => {
    const searchPaths = launcherSearchPaths(join(tmp(), 'home'), join(tmp(), 'apps'));
    expect(decideUpdateOwner({ exists: existsSync, searchPaths, offerDismissed: false })).toEqual({
      owner: 'self',
      launcherPath: null,
      offerLauncher: true,
    });
  });

  it('stops offering once dismissed, but still self-updates', () => {
    const d = decideUpdateOwner({ exists: () => false, searchPaths: ['/x'], offerDismissed: true });
    expect(d).toEqual({ owner: 'self', launcherPath: null, offerLauncher: false });
  });
});
