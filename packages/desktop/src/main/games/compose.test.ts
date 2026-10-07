import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  allStarterIds,
  dimensionOf,
  isStarterAvailable,
  parseGameManifest,
  parseStarterId,
  GAME_MANIFEST_FILE,
} from '@midnite/studio-shared';

import { composeStarter, scanImports } from './compose';
import { createGame } from './game-scaffold';
import { listFilesRecursive } from './starter-files.test-helper';

const TEMPLATE_DIR = join(process.cwd(), '..', '..', 'templates', 'media-game');
const BARE = new Set(['phaser', 'three', '@dimforge/rapier3d-compat', 'recast-navigation']);

let dest: string;
beforeEach(async () => {
  dest = await mkdtemp(join(tmpdir(), 'midnite-compose-'));
  vi.stubEnv('GIT_AUTHOR_NAME', 'Test');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Test');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dest, { recursive: true, force: true });
});

const available = allStarterIds().filter((id) => isStarterAvailable(id).ok);

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe('scanImports', () => {
  it('finds static, re-export and dynamic specifiers', () => {
    const js = `import a from 'x';\nimport { b } from "./y.js";\nexport { c } from 'z';\nconst m = await import('kit/three/nav.js');\nimport 'side';`;
    expect(scanImports(js)).toEqual(['x', './y.js', 'z', 'side', 'kit/three/nav.js'].sort((p, q) => js.indexOf(p) - js.indexOf(q)));
  });
});

vi.setConfig({ testTimeout: 20_000 });

describe('composeStarter', () => {
  it('covers the six perspective bases, the 2D genre starters and the first 3D ones', () => {
    expect(available).toEqual([
      'platformer', 'top-down', 'isometric', 'raycaster', 'first-person', 'third-person',
      'fps@raycaster',
      'rts@top-down', 'rts@isometric',
      'arpg@isometric', 'arpg@top-down',
      'crime@top-down', 'crime@isometric',
      'shooter@first-person', 'shooter@third-person',
      'fighter@third-person',
      'soulslike@third-person',
    ]);
  });

  it.each(available)('%s composes to a file set whose imports all resolve', async (id) => {
    const result = await composeStarter(id, dest, { templateDir: TEMPLATE_DIR, name: 'Moon Rover' });
    expect(result.ok).toBe(true);
    const files = (result as { value: { files: string[] } }).value.files;
    expect(files).toContain('index.html');
    expect(files).toContain('src/main.js');
    expect(files).toContain('src/scenes/level.js');
    expect(files).toContain('playtests/smoke.json');

    const config = await readFile(join(dest, 'src/game.config.js'), 'utf8');
    expect(config).toContain(`"perspective":"${parseStarterId(id)!.perspective}"`);

    // One engine's kit only.
    const engine = dimensionOf(parseStarterId(id)!.perspective) === '2d' ? 'phaser' : 'three';
    const other = engine === 'phaser' ? 'three' : 'phaser';
    expect(files.some((f) => f.startsWith(`kit/${engine}/`))).toBe(true);
    expect(files.some((f) => f.startsWith(`kit/${other}/`))).toBe(false);

    for (const file of files.filter((f) => f.endsWith('.js'))) {
      const js = await readFile(join(dest, file), 'utf8');
      for (const spec of scanImports(js)) {
        if (BARE.has(spec) || spec.startsWith('three/addons/')) continue;
        const target = spec.startsWith('kit/') ? join(dest, spec) : join(dirname(join(dest, file)), spec);
        expect(await fileExists(target), `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it.each(available)('%s lists every file under assets/ in ASSETS.md and ships a smoke replay', async (id) => {
    await composeStarter(id, dest, { templateDir: TEMPLATE_DIR, name: 'Moon Rover' });
    const assets = (await listFilesRecursive(join(dest, 'assets'))).filter((f) => f !== 'index.json');
    const doc = await readFile(join(dest, 'ASSETS.md'), 'utf8');
    for (const file of assets) expect(doc, file).toContain(file);
    const smoke = JSON.parse(await readFile(join(dest, 'playtests/smoke.json'), 'utf8'));
    expect(smoke).toMatchObject({ version: 1, frames: 180 });
    expect(smoke.assert).toEqual(expect.arrayContaining([expect.objectContaining({ path: '$.scene', equals: 'level' })]));
    const index = JSON.parse(await readFile(join(dest, 'assets/index.json'), 'utf8'));
    expect(index).toEqual({ version: 1, assets: [] });
  });

  it('refuses invalid and not-yet-available combinations with the reason', async () => {
    expect(await composeStarter('fighter@first-person', dest, { templateDir: TEMPLATE_DIR, name: 'x' })).toMatchObject({
      ok: false,
      message: 'Fighters use the versus camera only.',
    });
    expect(await composeStarter('fps@top-down', dest, { templateDir: TEMPLATE_DIR, name: 'x' })).toMatchObject({
      ok: false,
      message: 'The FPS genre needs the raycaster.',
    });
    expect(await composeStarter('rpg@third-person', dest, { templateDir: TEMPLATE_DIR, name: 'x' })).toMatchObject({ ok: false });
  });

  it('a genre starter carries only its own engine-free systems (and those it declares)', async () => {
    const compose = async (id: string): Promise<string[]> => {
      const out = await mkdtemp(join(tmpdir(), 'midnite-compose-genre-'));
      try {
        const result = await composeStarter(id, out, { templateDir: TEMPLATE_DIR, name: 'G' });
        expect(result.ok, id).toBe(true);
        return (result as { value: { files: string[] } }).value.files;
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    };
    const genresIn = (files: string[]): string[] => [...new Set(files.filter((f) => f.startsWith('kit/core/genre/')).map((f) => f.split('/')[3]!))].sort();
    expect(genresIn(await compose('top-down'))).toEqual([]);
    expect(genresIn(await compose('fps@raycaster'))).toEqual(['fps']);
    expect(genresIn(await compose('rts@isometric'))).toEqual(['rts']);
    expect(genresIn(await compose('arpg@top-down'))).toEqual(['arpg', 'rts']);
    expect(genresIn(await compose('crime@isometric'))).toEqual(['crime', 'rts']);
    expect(await compose('crime@top-down')).not.toContain('genre.json');
    expect(genresIn(await compose('shooter@third-person'))).toEqual(['shooter']);
    expect(genresIn(await compose('fighter@third-person'))).toEqual(['fighter']);
    expect(genresIn(await compose('soulslike@third-person'))).toEqual(['soulslike']);
  });

  it.each(available.filter((id) => id.includes('@')))('%s replaces the base genre seam and writes the genre into game.config.js', async (id) => {
    await composeStarter(id, dest, { templateDir: TEMPLATE_DIR, name: 'Moon Rover' });
    const seam = await readFile(join(dest, 'src/genre/index.js'), 'utf8');
    expect(seam).not.toContain('A genre\'s systems module replaces this file');
    expect(seam).toContain('export function installGenre');
    expect(await readFile(join(dest, 'src/game.config.js'), 'utf8')).toContain(`"genre":"${parseStarterId(id)!.genre}"`);
  });

  it('the fighter replaces the arena with its versus stage; shooter and soulslike keep the base arena', async () => {
    const level = async (id: string): Promise<string> => {
      const out = await mkdtemp(join(tmpdir(), 'midnite-compose-level-'));
      try {
        expect((await composeStarter(id, out, { templateDir: TEMPLATE_DIR, name: 'L' })).ok, id).toBe(true);
        return await readFile(join(out, 'src/scenes/level.js'), 'utf8');
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    };
    const fighter = await level('fighter@third-person');
    expect(fighter).toContain("mode: 'versus'");
    expect(fighter).not.toContain('initPhysics');
    for (const id of ['shooter@first-person', 'shooter@third-person', 'soulslike@third-person']) {
      const base = await level(id);
      expect(base, id).toContain('genre.intent');
      expect(base, id).toContain('initPhysics');
    }
  });

  it('fills the game name and stamps a valid manifest through createGame', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'midnite-compose-parent-'));
    try {
      const result = await createGame(
        { name: 'Arena', engine: 'three', perspective: 'third-person', starter: 'third-person', cameras: ['behind', 'further-behind'] },
        {
          templateDir: TEMPLATE_DIR,
          gamesRoot: parent,
          registerRepo: async () => ({ ok: true as const }),
          defaultNetwork: 'off',
        },
      );
      expect(result.ok, JSON.stringify(result)).toBe(true);
      const path = join(parent, 'arena');
      const manifest = parseGameManifest(JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8')));
      expect(manifest.ok).toBe(true);
      if (manifest.ok) {
        expect(manifest.manifest.cameraPresets).toEqual(['behind', 'further-behind']);
        expect(manifest.manifest.perspective).toBe('third-person');
      }
      expect(await readFile(join(path, 'index.html'), 'utf8')).toContain('<title>Arena</title>');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('createGame refuses a starter that does not match the request', async () => {
    const result = await createGame(
      { name: 'Bad', engine: 'phaser', perspective: 'platformer', starter: 'top-down' },
      { templateDir: TEMPLATE_DIR, gamesRoot: dest, registerRepo: async () => ({ ok: true as const }), defaultNetwork: 'off' },
    );
    expect(result.ok).toBe(false);
  });
});
