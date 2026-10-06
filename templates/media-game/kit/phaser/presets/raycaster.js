// @ts-check
/**
 * Midnite game kit — the **2.5D raycaster** (Doom-style) perspective preset.
 *
 * No Phaser physics: a DDA raycaster (`kit/core/raycast.js`) draws the walls
 * column by column into a 320×200 canvas texture that is scaled up to the game
 * size. Walls are textured from a tile image when one is given (Phase 106 tiles,
 * one tile per wall id), flat-shaded otherwise; billboard sprites are depth-
 * tested against each column's wall distance; door cells slide open; a minimap
 * sits in the corner.
 */

import { castRay, castRays, projectSprite } from '../../core/raycast.js';
import { presetConfig } from '../../core/preset-defaults.js';
import { createInput } from '../input.js';

const FLAT = ['#000', '#8b5a2b', '#5a6b7b', '#7b3f3f', '#3f6b4a', '#6b5a8b', '#8b8b5a', '#4a4a4a', '#9b7b5b', '#a07040'];

/**
 * @typedef {{ x: number, y: number, texture?: string, color?: string, scale?: number }} Billboard
 */

/**
 * @param {Phaser.Scene} scene
 * @param {Partial<typeof import('../../core/preset-defaults.js').PRESET_DEFAULTS.raycaster> & {
 *   map: number[][],
 *   start?: { x: number, y: number, angle?: number },
 *   wallTiles?: { texture: string, tileSize: number },
 *   sprites?: Billboard[],
 *   minimap?: boolean,
 * }} config `map[y][x]`: 0 empty, 1–8 wall ids, `doorCell` (9) a door
 */
export function createRaycaster(scene, config) {
  const cfg = presetConfig('raycaster', config);
  const map = config.map.map((row) => [...row]);
  const W = cfg.width;
  const H = cfg.height;
  const key = `kit-raycaster-${Math.random().toString(36).slice(2, 8)}`;
  const canvasTexture = scene.textures.createCanvas(key, W, H);
  if (!canvasTexture) throw new Error('Could not create the raycaster canvas.');
  const ctx = canvasTexture.getContext();
  ctx.imageSmoothingEnabled = false;
  const image = scene.add.image(scene.scale.width / 2, scene.scale.height / 2, key);
  image.setDisplaySize(scene.scale.width, scene.scale.height);

  const pos = { x: config.start?.x ?? 1.5, y: config.start?.y ?? 1.5 };
  let angle = config.start?.angle ?? 0;
  const input = createInput(scene, cfg.bindings);
  /** Door openness per `x,y`: 0 closed … 1 open. */
  const doors = new Map();
  /** @type {Set<string>} */
  const opening = new Set();
  const sprites = config.sprites ?? [];
  const zBuffer = new Float64Array(W);

  const doorKey = (/** @type {number} */ x, /** @type {number} */ y) => `${x},${y}`;
  /** A door blocks rays and movement until it is mostly open. */
  const isSolid = (/** @type {number} */ cell, /** @type {number} */ x, /** @type {number} */ y) =>
    cell === cfg.doorCell ? (doors.get(doorKey(x, y)) ?? 0) < 0.9 : cell !== 0;
  const blocked = (/** @type {number} */ x, /** @type {number} */ y) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const cell = map[cy]?.[cx];
    return cell === undefined || isSolid(cell, cx, cy);
  };

  const wallSource = config.wallTiles ? scene.textures.get(config.wallTiles.texture).getSourceImage() : null;

  function draw() {
    // Ceiling and floor.
    ctx.fillStyle = '#20232a';
    ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, H / 2, W, H / 2);

    const hits = castRays(map, pos, angle, cfg.fovDeg, W, { isSolid });
    for (let column = 0; column < W; column += 1) {
      const hit = /** @type {import('../../core/raycast.js').RayHit} */ (hits[column]);
      zBuffer[column] = hit.distance;
      if (!hit.hit) continue;
      const lineHeight = Math.min(H * 8, H / Math.max(hit.distance, 0.0001));
      const top = (H - lineHeight) / 2;
      if (wallSource && config.wallTiles) {
        const size = config.wallTiles.tileSize;
        const perRow = Math.max(1, Math.floor(wallSource.width / size));
        const tile = Math.max(0, hit.cell - 1);
        const sx = (tile % perRow) * size + Math.floor(hit.wallX * size);
        const sy = Math.floor(tile / perRow) * size;
        ctx.drawImage(/** @type {CanvasImageSource} */ (wallSource), sx, sy, 1, size, column, top, 1, lineHeight);
      } else {
        ctx.fillStyle = FLAT[hit.cell % FLAT.length] ?? '#888';
        ctx.fillRect(column, top, 1, lineHeight);
      }
      // Darken one face so corners read.
      if (hit.side === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(column, top, 1, lineHeight);
      }
    }

    // Billboards, far to near, clipped per column by the wall z-buffer.
    const visible = sprites
      .map((sprite) => ({ sprite, proj: projectSprite(pos, angle, cfg.fovDeg, sprite, W) }))
      .filter((entry) => entry.proj !== null)
      .sort((a, b) => (b.proj?.depth ?? 0) - (a.proj?.depth ?? 0));
    for (const { sprite, proj } of visible) {
      if (!proj) continue;
      const size = (H / proj.depth) * (sprite.scale ?? 1);
      const left = Math.round(proj.screenX - size / 2);
      const top = Math.round(H / 2 - size / 2);
      const source = sprite.texture ? scene.textures.get(sprite.texture).getSourceImage() : null;
      for (let column = Math.max(0, left); column < Math.min(W, left + size); column += 1) {
        if (proj.depth >= (zBuffer[column] ?? Infinity)) continue;
        if (source) {
          const sx = Math.floor(((column - left) / size) * source.width);
          ctx.drawImage(/** @type {CanvasImageSource} */ (source), sx, 0, 1, source.height, column, top, 1, size);
        } else {
          ctx.fillStyle = sprite.color ?? '#e0b040';
          ctx.fillRect(column, top + size * 0.2, 1, size * 0.8);
        }
      }
    }

    if (config.minimap !== false) drawMinimap();
    canvasTexture.refresh();
  }

  function drawMinimap() {
    const cell = 3;
    ctx.globalAlpha = 0.75;
    for (let y = 0; y < map.length; y += 1) {
      const row = map[y] ?? [];
      for (let x = 0; x < row.length; x += 1) {
        const value = row[x] ?? 0;
        ctx.fillStyle = value === 0 ? '#111' : value === cfg.doorCell ? '#a07040' : '#bbb';
        ctx.fillRect(4 + x * cell, 4 + y * cell, cell, cell);
      }
    }
    ctx.fillStyle = '#6ea8ff';
    ctx.fillRect(4 + pos.x * cell - 1, 4 + pos.y * cell - 1, 2, 2);
    ctx.globalAlpha = 1;
  }

  /** Open the door the player is facing, if one is within reach. */
  function useDoor() {
    const hit = castRay(map, pos, { x: Math.cos(angle), y: Math.sin(angle) }, { isSolid });
    if (hit.hit && hit.cell === cfg.doorCell && hit.distance < 1.5) opening.add(doorKey(hit.cellX, hit.cellY));
  }

  return {
    image,
    input,
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const dt = delta / 1000;
      angle += input.axis('turnLeft', 'turnRight') * cfg.turnSpeed * dt;
      const forward = input.axis('back', 'forward') * cfg.moveSpeed * dt;
      const strafe = input.axis('strafeLeft', 'strafeRight') * cfg.moveSpeed * dt;
      const dx = Math.cos(angle) * forward - Math.sin(angle) * strafe;
      const dy = Math.sin(angle) * forward + Math.cos(angle) * strafe;
      const r = cfg.radius;
      if (!blocked(pos.x + dx + Math.sign(dx) * r, pos.y)) pos.x += dx;
      if (!blocked(pos.x, pos.y + dy + Math.sign(dy) * r)) pos.y += dy;
      if (input.justPressed('use')) useDoor();
      for (const door of opening) {
        const next = Math.min(1, (doors.get(door) ?? 0) + delta / cfg.doorOpenMs);
        doors.set(door, next);
        if (next >= 1) opening.delete(door);
      }
      draw();
    },
    state() {
      return {
        player: { position: [Number(pos.x.toFixed(3)), Number(pos.y.toFixed(3))] },
        angle: Number(angle.toFixed(4)),
        openDoors: [...doors.entries()].filter(([, open]) => open >= 1).map(([door]) => door),
      };
    },
  };
}
