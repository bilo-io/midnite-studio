// @ts-check
/**
 * Midnite game kit — a tile-space adapter for the 2D genre starters.
 *
 * RTS, ARPG and crime simulate in tile units and ask this file where to draw:
 * top-down maps a tile to 32 px squares, isometric to 64×32 diamonds
 * (`kit/core/iso.js`). The genre never branches on the perspective — it calls
 * `toScreen`, `toTile`, `depth` and `drawTile`, and the same simulation runs in
 * both. `cover()` hides what the perspective base drew so the genre owns the view.
 */

import { isoDepth, isoToScreen, screenToIso } from '../core/iso.js';

export const TOP_DOWN_TILE = 32;
const ISO_W = 64;
const ISO_H = 32;

/**
 * @param {Phaser.Scene} scene
 * @param {{ perspective: string, cols: number, rows: number }} config
 */
export function createWorld2d(scene, config) {
  const iso = config.perspective === 'isometric';
  const origin = { x: iso ? config.rows * (ISO_W / 2) + 40 : 0, y: iso ? 40 : 0 };

  /** Screen point of tile coordinates (x + .5, y + .5 is the tile's centre). @param {number} tx @param {number} ty */
  const toScreen = (tx, ty) => {
    if (!iso) return { x: tx * TOP_DOWN_TILE, y: ty * TOP_DOWN_TILE };
    const p = isoToScreen(tx, ty, ISO_W, ISO_H);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  /** Fractional tile coordinates under a world-space pixel. @param {number} px @param {number} py */
  const toTile = (px, py) => {
    if (!iso) return { x: px / TOP_DOWN_TILE, y: py / TOP_DOWN_TILE };
    return screenToIso(px - origin.x, py - origin.y, ISO_W, ISO_H);
  };

  const corners = [toScreen(0, 0), toScreen(config.cols, 0), toScreen(0, config.rows), toScreen(config.cols, config.rows)];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const bounds = {
    x: Math.min(...xs) - 20,
    y: Math.min(...ys) - 20,
    width: Math.max(...xs) - Math.min(...xs) + 40,
    height: Math.max(...ys) - Math.min(...ys) + 40,
  };

  /** Hide everything the base drew and stop its camera follow; the genre draws from here. */
  function cover() {
    for (const child of scene.children.list) {
      const object = /** @type {Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => unknown }} */ (child);
      object.setVisible?.(false);
      const body = /** @type {{ enable?: boolean } | null} */ (object.body);
      if (body) body.enable = false;
    }
    const camera = scene.cameras.main;
    camera.stopFollow();
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  /**
   * Fill one tile.
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} tx @param {number} ty
   * @param {number} color 0xRRGGBB
   * @param {number} [alpha]
   */
  function drawTile(g, tx, ty, color, alpha = 1) {
    g.fillStyle(color, alpha);
    if (!iso) {
      g.fillRect(tx * TOP_DOWN_TILE, ty * TOP_DOWN_TILE, TOP_DOWN_TILE, TOP_DOWN_TILE);
      return;
    }
    const top = toScreen(tx, ty);
    g.fillPoints(
      [
        { x: top.x, y: top.y },
        { x: top.x + ISO_W / 2, y: top.y + ISO_H / 2 },
        { x: top.x, y: top.y + ISO_H },
        { x: top.x - ISO_W / 2, y: top.y + ISO_H / 2 },
      ],
      true,
    );
  }

  return {
    iso,
    tileWidth: iso ? ISO_W : TOP_DOWN_TILE,
    tileHeight: iso ? ISO_H : TOP_DOWN_TILE,
    /** Pixels per tile along one grid axis, for sizing circles. */
    unit: iso ? ISO_H : TOP_DOWN_TILE,
    bounds,
    toScreen,
    toTile,
    drawTile,
    cover,
    /** Draw order: further down-screen later. @param {number} tx @param {number} ty @param {number} [z] */
    depth: (tx, ty, z = 0) => (iso ? isoDepth(tx, ty, z) : ty * 10 + z),
    /** The tile under the pointer, in world space. */
    pointerTile() {
      const pointer = scene.input.activePointer;
      return toTile(pointer.worldX, pointer.worldY);
    },
    /** Pan the camera by screen pixels, clamped to the world. @param {number} dx @param {number} dy */
    pan(dx, dy) {
      const camera = scene.cameras.main;
      camera.scrollX = Math.max(bounds.x, Math.min(bounds.x + bounds.width - camera.width, camera.scrollX + dx));
      camera.scrollY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - camera.height, camera.scrollY + dy));
    },
    /** Centre the camera on a tile position. @param {number} tx @param {number} ty */
    centreOn(tx, ty) {
      const p = toScreen(tx, ty);
      const camera = scene.cameras.main;
      camera.scrollX = p.x - camera.width / 2;
      camera.scrollY = p.y - camera.height / 2;
    },
  };
}
