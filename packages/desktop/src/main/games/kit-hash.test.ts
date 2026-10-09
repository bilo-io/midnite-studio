import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { GAME_ENGINE_VERSIONS, GAME_KIT_VERSION } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const kitHashPath = join(__dirname, 'kit-hash.json');
const kitDir = join(repoRoot, 'templates', 'media-game', 'kit');
const desktopPkgPath = join(repoRoot, 'packages', 'desktop', 'package.json');

async function walkFiles(dir: string, rel = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, r)));
    } else {
      out.push(r);
    }
  }
  return out;
}

async function computeKitHash(dir: string): Promise<string> {
  const files = await walkFiles(dir);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(join(dir, file)));
  }
  return hash.digest('hex');
}

describe('Kit versioning and engine pins', () => {
  it('kit hash matches kit-hash.json and version matches GAME_KIT_VERSION', async () => {
    const kitHashRecord = JSON.parse(await readFile(kitHashPath, 'utf8'));
    const currentHash = await computeKitHash(kitDir);
    expect(currentHash).toBe(kitHashRecord.hash);
    expect(GAME_KIT_VERSION).toBe(kitHashRecord.version);
  });

  it('GAME_ENGINE_VERSIONS matches packages/desktop/package.json exact pins', async () => {
    const pkg = JSON.parse(await readFile(desktopPkgPath, 'utf8'));
    const devDeps = pkg.devDependencies ?? {};

    expect(devDeps['phaser']).toBe(GAME_ENGINE_VERSIONS.phaser);
    expect(devDeps['three']).toBe(GAME_ENGINE_VERSIONS.three);
    expect(devDeps['@dimforge/rapier3d-compat']).toBe(GAME_ENGINE_VERSIONS.rapier);
    expect(devDeps['recast-navigation']).toBe(GAME_ENGINE_VERSIONS.recast);
  });
});
