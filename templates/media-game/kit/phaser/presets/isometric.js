// @ts-check
/**
 * Midnite game kit — the **isometric** perspective preset.
 *
 * A 2:1 diamond grid (`kit/core/iso.js`): tiles and actors are depth-sorted by
 * grid position, the tile under the pointer is highlighted and reported, and
 * the player moves in grid space (so movement keys go along the grid axes).
 */

import Phaser from 'phaser';

import { isoDepth, isoToScreen, pickTile } from '../../core/iso.js';
import { presetConfig } from '../../core/preset-defaults.js';
import { createInput } from '../input.js';

/**
 * @param {Phaser.Scene} scene
 * @param {Partial<typeof import('../../core/preset-defaults.js').PRESET_DEFAULTS.isometric> & {
 *   map?: number[][], start?: { x: number, y: number }, origin?: { x: number, y: number },
 *   tileColors?: Record<number, number>,
 * }} [config] `map[y][x]`: 0 floor, anything else blocked
 */
export function createIsometric(scene, config = {}) {
  const cfg = presetConfig('isometric', config);
  const map = config.map ?? Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0));
  const height = map.length;
  const width = map[0]?.length ?? 0;
  const origin = config.origin ?? { x: scene.scale.width / 2, y: 80 };
  const tw = cfg.tileWidth;
  const th = cfg.tileHeight;
  const colors = { 0: 0x2d3748, 1: 0x4a5568, ...config.tileColors };

  /** @param {number} x @param {number} y */
  const toScreen = (x, y) => {
    const p = isoToScreen(x, y, tw, th);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };

  const floor = scene.add.graphics();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = toScreen(x, y);
      const cell = map[y]?.[x] ?? 0;
      floor.fillStyle(colors[/** @type {0 | 1} */ (cell === 0 ? 0 : 1)] ?? 0x4a5568, 1);
      floor.lineStyle(1, 0x1a202c, 1);
      const diamond = [
        new Phaser.Math.Vector2(top.x, top.y),
        new Phaser.Math.Vector2(top.x + tw / 2, top.y + th / 2),
        new Phaser.Math.Vector2(top.x, top.y + th),
        new Phaser.Math.Vector2(top.x - tw / 2, top.y + th / 2),
      ];
      floor.fillPoints(diamond, true);
      floor.strokePoints(diamond, true);
    }
  }
  floor.setDepth(-1);

  const highlight = scene.add.graphics().setDepth(0);
  /** @type {{ x: number, y: number } | null} */
  let hovered = null;

  const player = scene.add.ellipse(0, 0, tw * 0.4, th * 0.9, 0x6ea8ff);
  const position = { x: (config.start?.x ?? 1) + 0.5, y: (config.start?.y ?? 1) + 0.5 };
  const input = createInput(scene, cfg.bindings);

  /** @param {number} x @param {number} y */
  const walkable = (x, y) => (map[Math.floor(y)]?.[Math.floor(x)] ?? 1) === 0;

  return {
    player,
    input,
    /** The grid tile under a screen point, or `null`. @param {number} px @param {number} py */
    pickTile: (px, py) => pickTile(px - origin.x, py - origin.y, tw, th, { width, height }),
    get hovered() {
      return hovered;
    },
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const v = input.vector();
      const step = (cfg.speed * delta) / 1000;
      const nx = position.x + v.x * step;
      const ny = position.y + v.y * step;
      if (walkable(nx, position.y)) position.x = nx;
      if (walkable(position.x, ny)) position.y = ny;
      const screen = toScreen(position.x, position.y);
      player.setPosition(screen.x, screen.y);
      player.setDepth(isoDepth(position.x, position.y, 1));

      const pointer = scene.input.activePointer;
      hovered = pickTile(pointer.worldX - origin.x, pointer.worldY - origin.y, tw, th, { width, height });
      highlight.clear();
      if (hovered) {
        const top = toScreen(hovered.x, hovered.y);
        highlight.lineStyle(2, 0xf6e05e, 1);
        highlight.strokePoints(
          [
            new Phaser.Math.Vector2(top.x, top.y),
            new Phaser.Math.Vector2(top.x + tw / 2, top.y + th / 2),
            new Phaser.Math.Vector2(top.x, top.y + th),
            new Phaser.Math.Vector2(top.x - tw / 2, top.y + th / 2),
          ],
          true,
        );
      }
    },
    state() {
      return {
        player: { position: [Number(position.x.toFixed(3)), Number(position.y.toFixed(3))] },
        hovered,
      };
    },
  };
}
