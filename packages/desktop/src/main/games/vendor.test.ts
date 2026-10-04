import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GAME_ENGINE_VERSIONS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { filterImportMap, vendorEngines } from './vendor';

describe('Vendor game engines (Phase 107 Theme C)', () => {
  let tempDir: string;
  let fakeEnginesDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mstudio-vendor-test-'));
    fakeEnginesDir = await mkdtemp(join(tmpdir(), 'mstudio-fake-engines-'));

    // Create fake engine distributions for testing
    const phaserDir = join(fakeEnginesDir, `phaser@${GAME_ENGINE_VERSIONS.phaser}`);
    await mkdir(phaserDir, { recursive: true });
    await writeFile(join(phaserDir, 'phaser.esm.js'), 'export default "phaser";');
    await writeFile(join(phaserDir, 'LICENSE'), 'MIT');

    const threeDir = join(fakeEnginesDir, `three@${GAME_ENGINE_VERSIONS.three}`);
    await mkdir(threeDir, { recursive: true });
    await writeFile(join(threeDir, 'three.module.js'), 'export default "three";');
    await writeFile(join(threeDir, 'LICENSE'), 'MIT');

    const rapierDir = join(fakeEnginesDir, `rapier@${GAME_ENGINE_VERSIONS.rapier}`);
    await mkdir(rapierDir, { recursive: true });
    await writeFile(join(rapierDir, 'rapier.mjs'), 'export default "rapier";');
    await writeFile(join(rapierDir, 'LICENSE'), 'Apache-2.0');

    const recastDir = join(fakeEnginesDir, `recast@${GAME_ENGINE_VERSIONS.recast}`);
    await mkdir(recastDir, { recursive: true });
    await writeFile(join(recastDir, 'index.mjs'), 'export default "recast";');
    await writeFile(join(recastDir, 'LICENSE'), 'MIT');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(fakeEnginesDir, { recursive: true, force: true });
  });

  const fullImportMapHtml = `<!doctype html>
<html>
  <head>
    <script type="importmap">
      {
        "imports": {
          "phaser": "./vendor/phaser/phaser.esm.js",
          "three": "./vendor/three/three.module.js",
          "three/addons/": "./vendor/three/addons/",
          "@dimforge/rapier3d-compat": "./vendor/rapier/rapier.mjs",
          "recast-navigation": "./vendor/recast/index.mjs",
          "kit/": "./kit/"
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

  it('filters import map for 2D (Phaser): retains phaser and kit, omits three, rapier, recast', () => {
    const filtered = filterImportMap(fullImportMapHtml, 'phaser');
    expect(filtered).toContain('"phaser": "./vendor/phaser/phaser.esm.js"');
    expect(filtered).toContain('"kit/": "./kit/"');
    expect(filtered).not.toContain('"three"');
    expect(filtered).not.toContain('"three/addons/"');
    expect(filtered).not.toContain('"@dimforge/rapier3d-compat"');
    expect(filtered).not.toContain('"recast-navigation"');
  });

  it('filters import map for 3D (three.js): retains three, rapier, recast, kit, omits phaser', () => {
    const filtered = filterImportMap(fullImportMapHtml, 'three');
    expect(filtered).not.toContain('"phaser"');
    expect(filtered).toContain('"three": "./vendor/three/three.module.js"');
    expect(filtered).toContain('"three/addons/": "./vendor/three/addons/"');
    expect(filtered).toContain('"@dimforge/rapier3d-compat": "./vendor/rapier/rapier.mjs"');
    expect(filtered).toContain('"recast-navigation": "./vendor/recast/index.mjs"');
    expect(filtered).toContain('"kit/": "./kit/"');
  });

  it('vendorEngines copies only phaser for a 2D engine', async () => {
    await writeFile(join(tempDir, 'index.html'), fullImportMapHtml, 'utf8');

    const vendored = await vendorEngines('phaser', tempDir, fakeEnginesDir);
    expect(vendored).toEqual({ phaser: GAME_ENGINE_VERSIONS.phaser });

    const phaserJs = await readFile(join(tempDir, 'vendor', 'phaser', 'phaser.esm.js'), 'utf8');
    expect(phaserJs).toBe('export default "phaser";');

    // Index.html was updated
    const indexHtml = await readFile(join(tempDir, 'index.html'), 'utf8');
    expect(indexHtml).toContain('"phaser"');
    expect(indexHtml).not.toContain('"three"');
  });

  it('vendorEngines copies three, rapier, and recast for a 3D engine', async () => {
    await writeFile(join(tempDir, 'index.html'), fullImportMapHtml, 'utf8');

    const vendored = await vendorEngines('three', tempDir, fakeEnginesDir);
    expect(vendored).toEqual({
      three: GAME_ENGINE_VERSIONS.three,
      rapier: GAME_ENGINE_VERSIONS.rapier,
      recast: GAME_ENGINE_VERSIONS.recast,
    });

    const threeJs = await readFile(join(tempDir, 'vendor', 'three', 'three.module.js'), 'utf8');
    expect(threeJs).toBe('export default "three";');
    const rapierJs = await readFile(join(tempDir, 'vendor', 'rapier', 'rapier.mjs'), 'utf8');
    expect(rapierJs).toBe('export default "rapier";');
    const recastJs = await readFile(join(tempDir, 'vendor', 'recast', 'index.mjs'), 'utf8');
    expect(recastJs).toBe('export default "recast";');

    const indexHtml = await readFile(join(tempDir, 'index.html'), 'utf8');
    expect(indexHtml).not.toContain('"phaser"');
    expect(indexHtml).toContain('"three"');
  });
});
