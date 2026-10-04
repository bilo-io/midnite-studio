#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const desktopPkgPath = join(repoRoot, 'packages', 'desktop', 'package.json');
const defaultEnginesDir = join(repoRoot, 'packages', 'desktop', 'resources', 'game-engines');

/**
 * Pinned versions for the four vendored game engines (Phase 107 Theme C).
 * Must match `GAME_ENGINE_VERSIONS` in `@midnite/studio-shared`.
 */
export const ENGINE_VERSIONS = {
  phaser: '3.90.0',
  three: '0.186.1',
  rapier: '0.21.0',
  recast: '0.43.1',
};

/**
 * Copy engine runtimes, types and licences into `packages/desktop/resources/game-engines/<name>@<version>/`.
 * Run during `desktop:bundle` so the engines are present at build time and packaged into `extraResources`.
 */
export async function vendorGameEngines(destDir = defaultEnginesDir) {
  const req = createRequire(desktopPkgPath);
  const esbuild = req('esbuild');

  // Resolve source package roots
  const phaserSrcDir = dirname(req.resolve('phaser'));
  const phaserRoot = resolve(phaserSrcDir, '..');
  const threeRoot = dirname(dirname(req.resolve('three')));
  const typesThreeRoot = dirname(req.resolve('@types/three/package.json'));
  const rapierRoot = dirname(dirname(req.resolve('@dimforge/rapier3d-compat')));
  const recastRoot = dirname(req.resolve('recast-navigation'));

  // 1. Phaser 3
  const phaserDest = join(destDir, `phaser@${ENGINE_VERSIONS.phaser}`);
  await rm(phaserDest, { recursive: true, force: true });
  await mkdir(join(phaserDest, 'types'), { recursive: true });
  await cp(join(phaserRoot, 'dist', 'phaser.esm.js'), join(phaserDest, 'phaser.esm.js'));
  await cp(join(phaserRoot, 'types', 'phaser.d.ts'), join(phaserDest, 'types', 'phaser.d.ts'));
  await cp(join(phaserRoot, 'LICENSE.md'), join(phaserDest, 'LICENSE'));

  // 2. three.js
  const threeDest = join(destDir, `three@${ENGINE_VERSIONS.three}`);
  await rm(threeDest, { recursive: true, force: true });
  await mkdir(threeDest, { recursive: true });
  await cp(join(threeRoot, 'build', 'three.module.js'), join(threeDest, 'three.module.js'));
  await cp(join(threeRoot, 'examples', 'jsm'), join(threeDest, 'addons'), { recursive: true });
  await cp(join(threeRoot, 'LICENSE'), join(threeDest, 'LICENSE'));
  await cp(typesThreeRoot, join(threeDest, 'types'), { recursive: true });

  // 3. Rapier 3D (compat)
  const rapierDest = join(destDir, `rapier@${ENGINE_VERSIONS.rapier}`);
  await rm(rapierDest, { recursive: true, force: true });
  await mkdir(join(rapierDest, 'types'), { recursive: true });
  await cp(join(rapierRoot, 'dist', 'rapier.mjs'), join(rapierDest, 'rapier.mjs'));
  await cp(join(rapierRoot, 'dist', 'rapier_wasm3d_bg.wasm'), join(rapierDest, 'rapier_wasm3d_bg.wasm'));
  await cp(join(rapierRoot, 'dist', 'rapier.d.ts'), join(rapierDest, 'types', 'rapier.d.ts'));
  await cp(join(rapierRoot, 'dist', 'rapier_wasm3d.d.ts'), join(rapierDest, 'types', 'rapier_wasm3d.d.ts'));
  await cp(join(rapierRoot, 'LICENSE'), join(rapierDest, 'LICENSE'));

  // 4. Recast Navigation (standalone ESM bundle with three helpers)
  const recastDest = join(destDir, `recast@${ENGINE_VERSIONS.recast}`);
  await rm(recastDest, { recursive: true, force: true });
  await mkdir(recastDest, { recursive: true });

  const bundleResult = await esbuild.build({
    stdin: {
      contents: "export * from 'recast-navigation'; export * from '@recast-navigation/three';",
      resolveDir: join(repoRoot, 'packages', 'desktop'),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    write: false,
    external: ['three'],
  });

  await writeFile(join(recastDest, 'index.mjs'), bundleResult.outputFiles[0].text, 'utf8');
  await cp(join(recastRoot, 'index.d.ts'), join(recastDest, 'index.d.ts'));
  await cp(join(recastRoot, 'LICENSE'), join(recastDest, 'LICENSE'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  vendorGameEngines()
    .then(() => console.log('Successfully vendored game engines.'))
    .catch((err) => {
      console.error('Failed to vendor game engines:', err);
      process.exit(1);
    });
}
