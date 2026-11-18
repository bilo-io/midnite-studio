// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { colliderShapes } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

/**
 * Phase 140 Theme F, F1: the editor's collider overlay agrees with the kit. `colliderShapes` (shared) and the kit's
 * `collisionGrid` (what a game's physics reads) name the same solid cells on every 2D starter level, so what the
 * View menu draws is what the game collides with.
 */
const templates = resolve(__dirname, '../../../../../templates/media-game');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const tiled = (await import(pathToFileURL(join(templates, 'kit/core/tiled-objects.js')).href)) as any;
const starter = (name: string): unknown => JSON.parse(readFileSync(join(templates, 'bases', name, 'levels/level.tmj'), 'utf8'));

describe('F1 colliderShapes agrees with the kit collisionGrid', () => {
  for (const name of ['platformer', 'top-down', 'isometric']) {
    it(name, () => {
      const level = starter(name);
      const solid = new Set<string>();
      (tiled.collisionGrid(level) as number[][]).forEach((row, r) => row.forEach((v, c) => v && solid.add(`${c},${r}`)));
      const cells = colliderShapes(level).flatMap((s) => (s.kind === 'cell' ? [`${s.col},${s.row}`] : []));
      expect(cells.length).toBe(solid.size);
      expect(new Set(cells)).toEqual(solid);
    });
  }
  it('finds collision on the starters that have a collision layer', () => {
    expect(colliderShapes(starter('platformer')).length).toBeGreaterThan(0);
    expect(colliderShapes(starter('isometric')).length).toBeGreaterThan(0);
  });
});
