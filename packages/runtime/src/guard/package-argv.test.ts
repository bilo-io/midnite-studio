import { describe, expect, it } from 'vitest';

import { detectPackageManager, packageFixBranch, removePackageArgv, updatePackageArgv } from './package-argv';

describe('package fix argv', () => {
  it('detects the manager from the lockfile', () => {
    expect(['/r/pnpm-lock.yaml', '/r/package-lock.json', '/r/yarn.lock', '/r/Cargo.lock', '/r/go.sum'].map(detectPackageManager)).toEqual([
      'pnpm', 'npm', 'yarn', 'cargo', null,
    ]);
  });

  it('builds update argv for pnpm, npm, yarn and cargo', () => {
    expect(updatePackageArgv('pnpm', 'lodash', '4.17.21')).toEqual({ file: 'pnpm', args: ['up', 'lodash@4.17.21', '--ignore-scripts'] });
    expect(updatePackageArgv('npm', '@scope/pkg', '2.0.1')).toEqual({ file: 'npm', args: ['install', '@scope/pkg@2.0.1', '--ignore-scripts'] });
    expect(updatePackageArgv('yarn', 'left-pad', '1.3.0')).toEqual({ file: 'yarn', args: ['up', 'left-pad@1.3.0'] });
    expect(updatePackageArgv('cargo', 'serde', '1.0.200')).toEqual({ file: 'cargo', args: ['update', '-p', 'serde', '--precise', '1.0.200'] });
  });

  it('builds remove argv and refuses anything that looks like a flag or a shell fragment', () => {
    expect(removePackageArgv('pnpm', 'evil-pkg')).toEqual({ file: 'pnpm', args: ['remove', 'evil-pkg', '--ignore-scripts'] });
    expect(removePackageArgv('cargo', 'evil')).toEqual({ file: 'cargo', args: ['remove', 'evil'] });
    expect(updatePackageArgv('pnpm', '--registry=http://x', '1.0.0')).toBeNull();
    expect(updatePackageArgv('npm', 'ok', '1.0.0; rm -rf')).toBeNull();
    expect(removePackageArgv('yarn', '-g')).toBeNull();
  });

  it('puts fixes on a guard/ branch, never main', () => {
    expect(packageFixBranch('update', '@scope/pkg', '2.0.1')).toBe('guard/update-scope-pkg-2-0-1');
    expect(packageFixBranch('remove', 'evil')).toBe('guard/remove-evil');
  });
});

describe('lockfileOnly (Phase 122 Theme G)', () => {
  it('adds the manager’s lockfile-only flag where it has one', () => {
    expect(updatePackageArgv('pnpm', 'lodash', '4.17.21', { lockfileOnly: true })?.args).toEqual(['up', 'lodash@4.17.21', '--ignore-scripts', '--lockfile-only']);
    expect(updatePackageArgv('npm', 'lodash', '4.17.21', { lockfileOnly: true })?.args).toContain('--package-lock-only');
    expect(removePackageArgv('pnpm', 'evil', { lockfileOnly: true })?.args).toEqual(['remove', 'evil', '--ignore-scripts', '--lockfile-only']);
    expect(updatePackageArgv('yarn', 'a', '1.0.0', { lockfileOnly: true })?.args).toEqual(['up', 'a@1.0.0']);
    expect(updatePackageArgv('cargo', 'serde', '1.0.200', { lockfileOnly: true })?.args).toEqual(['update', '-p', 'serde', '--precise', '1.0.200']);
  });
});
