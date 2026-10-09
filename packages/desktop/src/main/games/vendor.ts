import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  GAME_ENGINE_VERSIONS,
  type GameEngine,
} from '@midnite/studio-shared';

import { gameEnginesDir } from '../template-path';

/**
 * Filter the `<script type="importmap">` in `index.html` according to the engine.
 * A 2D (Phaser) repo omits three/rapier/recast.
 * A 3D (three.js) repo omits phaser.
 */
export function filterImportMap(html: string, engine: GameEngine): string {
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!match || !match[1]) return html;

  try {
    const parsed = JSON.parse(match[1]);
    const imports = { ...parsed.imports };
    if (engine === 'phaser') {
      delete imports['three'];
      delete imports['three/addons/'];
      delete imports['@dimforge/rapier3d-compat'];
      delete imports['recast-navigation'];
    } else {
      delete imports['phaser'];
    }
    const filteredJson = JSON.stringify({ ...parsed, imports }, null, 6);
    return html.replace(match[0], `<script type="importmap">\n${filteredJson}\n    </script>`);
  } catch {
    return html;
  }
}

/**
 * Copy engine runtimes, types and licences into `<targetDir>/vendor/` according to `engine`.
 * Returns the `vendored` dictionary stamped into `midnite-game.json`.
 */
export async function vendorEngines(
  engine: GameEngine,
  targetDir: string,
  sourceEnginesDir?: string,
): Promise<Record<string, string>> {
  const enginesDir = sourceEnginesDir ?? gameEnginesDir();
  const vendorDir = join(targetDir, 'vendor');
  await mkdir(vendorDir, { recursive: true });

  const vendored: Record<string, string> = {};

  if (engine === 'phaser') {
    const version = GAME_ENGINE_VERSIONS.phaser;
    const src = join(enginesDir, `phaser@${version}`);
    const dest = join(vendorDir, 'phaser');
    await rm(dest, { recursive: true, force: true });
    await cp(src, dest, { recursive: true });
    vendored.phaser = version;
  } else {
    // 3D engines: three, rapier, recast
    const threeVer = GAME_ENGINE_VERSIONS.three;
    const rapierVer = GAME_ENGINE_VERSIONS.rapier;
    const recastVer = GAME_ENGINE_VERSIONS.recast;

    const threeSrc = join(enginesDir, `three@${threeVer}`);
    const threeDest = join(vendorDir, 'three');
    await rm(threeDest, { recursive: true, force: true });
    await cp(threeSrc, threeDest, { recursive: true });
    vendored.three = threeVer;

    const rapierSrc = join(enginesDir, `rapier@${rapierVer}`);
    const rapierDest = join(vendorDir, 'rapier');
    await rm(rapierDest, { recursive: true, force: true });
    await cp(rapierSrc, rapierDest, { recursive: true });
    vendored.rapier = rapierVer;

    const recastSrc = join(enginesDir, `recast@${recastVer}`);
    const recastDest = join(vendorDir, 'recast');
    await rm(recastDest, { recursive: true, force: true });
    await cp(recastSrc, recastDest, { recursive: true });
    vendored.recast = recastVer;
  }

  // Also filter `index.html` import map if index.html exists
  const indexPath = join(targetDir, 'index.html');
  try {
    const html = await readFile(indexPath, 'utf8');
    const filtered = filterImportMap(html, engine);
    if (filtered !== html) {
      await writeFile(indexPath, filtered, 'utf8');
    }
  } catch {
    // index.html may not exist in pure test targets
  }

  return vendored;
}
