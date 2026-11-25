// @vitest-environment node
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { humaniseName, inferManifest } from './infer-manifest';

const FIXTURES = join(__dirname, '__fixtures__', 'doctor');
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'midnite-infer-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('inferManifest (Phase 149 Themes D and F)', () => {
  it('infers a three.js game from package.json, with a build from the script and lockfile', async () => {
    await cp(join(FIXTURES, 'vite-no-manifest'), dir, { recursive: true });
    await writeFile(join(dir, 'pnpm-lock.yaml'), '', 'utf8');
    await writeFile(join(dir, 'vite.config.ts'), "export default { build: { outDir: 'public-dist' } };", 'utf8');
    const result = await inferManifest(dir);
    expect(result).toMatchObject({
      ok: true,
      value: {
        name: 'Vite No Manifest',
        engine: 'three',
        dimension: '3d',
        perspective: 'third-person',
        genre: null,
        starter: 'custom',
        kitVersion: '0.0.0',
        vendored: { three: '0.185.1' },
        build: { command: 'pnpm build', out: 'public-dist' },
      },
    });
  });

  it('defaults the build to npm and dist, and reads yarn from its lockfile', async () => {
    await cp(join(FIXTURES, 'vite-no-manifest'), dir, { recursive: true });
    expect(await inferManifest(dir)).toMatchObject({ ok: true, value: { build: { command: 'npm run build', out: 'dist' } } });
    await writeFile(join(dir, 'yarn.lock'), '', 'utf8');
    expect(await inferManifest(dir)).toMatchObject({ ok: true, value: { build: { command: 'yarn build' } } });
  });

  it('infers Phaser as 2D top-down, from a vendored engine, with no build when there is no build script', async () => {
    await cp(join(FIXTURES, 'shmup-legacy'), dir, { recursive: true });
    await rm(join(dir, 'midnite-game.json'));
    await cp(join(FIXTURES, 'legacy-3d', 'kit'), join(dir, 'kit'), { recursive: true });
    await writeFile(join(dir, 'package.json'), '{"name":"@me/star_fall","dependencies":{"phaser":"^3.80.1"}}', 'utf8');
    const result = await inferManifest(dir);
    expect(result).toMatchObject({ ok: true, value: { name: 'Star Fall', engine: 'phaser', dimension: '2d', perspective: 'top-down', vendored: { phaser: '3.80.1' } } });
    if (result.ok) expect(result.value.build).toBeUndefined();
  });

  it('falls back to the folder name', async () => {
    await writeFile(join(dir, 'package.json'), '{"dependencies":{"three":"0.180.0"}}', 'utf8');
    const result = await inferManifest(dir);
    expect(result.ok && result.value.name.length > 0).toBe(true);
  });

  it('refuses anything that is not Phaser or three.js', async () => {
    await writeFile(join(dir, 'package.json'), '{"name":"godot-thing","dependencies":{"pixi.js":"^8"}}', 'utf8');
    expect(await inferManifest(dir)).toMatchObject({ ok: false, message: 'Only Phaser and three.js games are supported.' });
    expect(await inferManifest(join(dir, 'missing'))).toMatchObject({ ok: false });
  });

  it('humanises names', () => {
    expect(humaniseName('my-cool_game.v2')).toBe('My Cool Game V2');
    expect(humaniseName('@scope/pkg')).toBe('Pkg');
  });
});
