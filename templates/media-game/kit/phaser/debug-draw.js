// @ts-check
/**
 * Midnite game kit — Phaser debug draw (Phase 140 Theme G).
 *
 * `__midnite.debug({ colliders, triggers })` paints the level's solid tiles and trigger zones as a 30% fill with a 1 px
 * outline in one `Graphics` above everything: amber for colliders (one-way tiles dashed to the eye by a thinner
 * fill), blue for triggers. `buildLevel` installs it, so every level-driven game has it.
 */

import { registerDebug } from '../core/hook.js';
import { debugShapes2d } from '../core/debug-shapes.js';

const COLLIDER = 0xf59e0b;
const TRIGGER = 0x3b82f6;
const DEPTH = 1e6;

/**
 * @param {import('phaser').GameObjects.Graphics} g
 * @param {import('../core/debug-shapes.js').Shape2d[]} shapes
 * @param {number} colour
 */
function paint(g, shapes, colour) {
  for (const s of shapes) {
    g.fillStyle(colour, s.kind === 'poly' && s.oneWay ? 0.15 : 0.3);
    g.lineStyle(1, colour, 1);
    if (s.kind === 'poly') {
      const points = s.points.map(([x, y]) => ({ x, y }));
      g.fillPoints(points, true, true);
      g.strokePoints(points, true, true);
    } else {
      g.fillCircle(s.x, s.y, 6);
      g.strokeCircle(s.x, s.y, 6);
    }
  }
}

/**
 * Draw a level's colliders and triggers on demand. Returns a `dispose` that removes the overlay (a scene's
 * `shutdown` calls it; this installs that itself when the scene has events).
 * @param {import('phaser').Scene} scene
 * @param {any} map the parsed `.tmj`
 * @returns {() => void}
 */
export function installDebugDraw2d(scene, map) {
  const shapes = debugShapes2d(map);
  /** @type {import('phaser').GameObjects.Graphics | null} */
  let g = null;
  const unregister = registerDebug((options) => {
    if (!options.colliders && !options.triggers) {
      g?.clear();
      g?.setVisible(false);
      return;
    }
    g ??= scene.add.graphics().setDepth(DEPTH);
    g.clear();
    g.setVisible(true);
    if (options.colliders) paint(g, shapes.colliders, COLLIDER);
    if (options.triggers) paint(g, shapes.triggers, TRIGGER);
  }, 'level-2d');
  const dispose = () => {
    unregister();
    g?.destroy();
    g = null;
  };
  scene.events?.once?.('shutdown', dispose);
  return dispose;
}
