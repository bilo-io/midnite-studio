import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { GAME_ENGINE_VERSIONS, GAME_KIT_VERSION, GAME_MANIFEST_FILE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { upgradeKit } from './kit-upgrade';

describe('upgradeKit (Phase 107 Theme C)', () => {
  let fakeTemplateDir: string;
  let fakeEnginesDir: string;
  let repo: TempRepo;

  beforeEach(async () => {
    fakeTemplateDir = await mkdtemp(join(tmpdir(), 'mstudio-test-template-'));
    fakeEnginesDir = await mkdtemp(join(tmpdir(), 'mstudio-test-engines-'));

    // Template kit/
    const kitDir = join(fakeTemplateDir, 'kit');
    await mkdir(kitDir, { recursive: true });
    await writeFile(join(kitDir, 'hook.js'), 'export const v = "0.1.0";');

    // Engine resources
    const phaserDir = join(fakeEnginesDir, `phaser@${GAME_ENGINE_VERSIONS.phaser}`);
    await mkdir(phaserDir, { recursive: true });
    await writeFile(join(phaserDir, 'phaser.esm.js'), 'export default "phaser-3.90.0";');
    await writeFile(join(phaserDir, 'LICENSE'), 'MIT');

    // Seed a git repo
    repo = await TempRepo.create();
    const manifest = {
      version: 1,
      name: 'Test Game',
      engine: 'phaser',
      dimension: '2d',
      perspective: 'platformer',
      genre: null,
      starter: 'blank',
      cameraPresets: [],
      entry: 'index.html',
      kitVersion: '0.0.1',
      vendored: { phaser: '3.0.0' },
      assets: [],
      network: 'off',
      deterministic: false,
      keepSaveData: false,
    };
    await repo.writeFile(GAME_MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    await repo.writeFile('kit/old.js', 'old kit');
    await repo.writeFile('vendor/phaser/phaser.esm.js', 'old phaser');
    await repo.writeFile('src/main.js', 'console.log("game");');
    await repo.git(['add', '.']);
    await repo.git(['commit', '-m', 'Initial commit']);
  });

  afterEach(async () => {
    await repo.cleanup();
    await rm(fakeTemplateDir, { recursive: true, force: true });
    await rm(fakeEnginesDir, { recursive: true, force: true });
  });

  it('refuses to upgrade when the worktree is dirty', async () => {
    await repo.writeFile('dirty.txt', 'uncommitted');
    const result = await upgradeKit(repo.path, {
      templateDir: fakeTemplateDir,
      enginesDir: fakeEnginesDir,
    });
    expect(result).toEqual({ ok: false, kind: 'error', message: 'Commit or discard your changes first.' });
  });

  it('creates kit-upgrade branch from HEAD, commits new kit and vendor, and switches back to main', async () => {
    const result = await upgradeKit(repo.path, {
      templateDir: fakeTemplateDir,
      enginesDir: fakeEnginesDir,
    });
    expect(result).toEqual({ ok: true, value: { branch: `kit-upgrade/${GAME_KIT_VERSION}` } });

    // Current branch is still main
    const currentBranch = await repo.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(currentBranch.trim()).toBe('main');

    // Diff between main and the upgrade branch touches only kit/, vendor/ and midnite-game.json
    const diff = await repo.git(['diff', 'main..kit-upgrade/' + GAME_KIT_VERSION, '--name-only']);
    const changedFiles = diff.trim().split('\n').sort();
    expect(changedFiles).toEqual([
      GAME_MANIFEST_FILE,
      'kit/hook.js',
      'kit/old.js',
      'vendor/phaser/LICENSE',
      'vendor/phaser/phaser.esm.js',
    ].sort());

    // Manifest on upgrade branch has new kitVersion and vendored versions
    const showManifest = await repo.git(['show', `kit-upgrade/${GAME_KIT_VERSION}:${GAME_MANIFEST_FILE}`]);
    const updated = JSON.parse(showManifest);
    expect(updated.kitVersion).toBe(GAME_KIT_VERSION);
    expect(updated.vendored.phaser).toBe(GAME_ENGINE_VERSIONS.phaser);
  });
});
