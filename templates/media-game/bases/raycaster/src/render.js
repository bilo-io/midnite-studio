// @ts-check
/**
 * A software renderer for the raycaster base: textured, normal-mapped walls, floor and ceiling lit by a
 * torch at the player, depth fog, and billboards with procedural art.
 *
 * It exists because `kit/phaser/presets/raycaster.js` draws flat-shaded walls (and has no hook between
 * its floor fill and its walls). The preset still owns movement, doors and the map — this view reads
 * `rig.map`, `rig.pos`, `rig.angle` and `rig.sprites` each frame and paints its own canvas on top, so a
 * genre keeps mutating those and everything it draws shows up here.
 *
 * A billboard is `{ x, y, scale, color, kind?, lift?, sy?, alpha?, flash?, emissive? }`:
 *   kind      one of `grunt`, `health`, `ammo`, `key`, `weapon`, `orb` (default `orb` when only a colour is given)
 *   lift      height above the floor, as a fraction of wall height
 *   sy        vertical squash 0..1 (a dying enemy folds down)
 *   flash     seconds of white hit-flash left
 *   emissive  true for things that glow and ignore the torch
 */

import { generateTextureData } from 'kit/core/procedural-textures.js';
import { castRays, projectSprite } from 'kit/core/raycast.js';

import { bobOffset, falloff, floorRowDistance, packRgb, wallLight } from './shade.js';

const TEX = 64;
const AMBIENT = [0.15, 0.17, 0.23];
const TORCH = [1.15, 0.95, 0.72];
const GAIN = 1.9;
const FOG = [10, 12, 20];

/** How far a distance (cells) is into the fog, 0..0.85. @param {number} d */
const fogAmount = (d) => Math.min(0.85, Math.max(0, (d - 5) / 14));
/** @param {number} c @param {number} f @param {number} fog */
const toFog = (c, f, fog) => c * (1 - f) + fog * f;

/** The wall ids (`map` cells): which procedural material each one wears. */
const WALL_STYLES = {
  1: ['brick', {}],
  2: ['stone', {}],
  3: ['metal', { base: 0xa84a4a, accent: 0x5a2424 }],
  4: ['wood', {}],
  5: ['metal', { base: 0x8a6ad0, accent: 0x3c2a70 }],
  6: ['tiles', {}],
  7: ['dirt', {}],
  8: ['stone', { base: 0x4a4f5c, accent: 0x777f90 }],
  9: ['wood', { base: 0xb08850, accent: 0x5a3a1c }],
};
const FLOOR_STYLE = ['tiles', { base: 0x59606b, accent: 0x2e333b }];
const CEILING_STYLE = ['stone', { base: 0x3a3f4b, accent: 0x565c6a }];

/** Albedo as bytes and the normal map decoded to -1..1 floats, for one material. @param {string} kind @param {number} seed @param {object} opts */
function material(kind, seed, opts) {
  const data = generateTextureData(/** @type {any} */ (kind), { seed, size: TEX, normalStrength: 2.6, ...opts });
  const normal = new Float32Array(TEX * TEX * 3);
  for (let i = 0; i < TEX * TEX; i += 1) {
    normal[i * 3] = (/** @type {number} */ (data.normal[i * 4]) / 127.5) - 1;
    normal[i * 3 + 1] = (/** @type {number} */ (data.normal[i * 4 + 1]) / 127.5) - 1;
    normal[i * 3 + 2] = (/** @type {number} */ (data.normal[i * 4 + 2]) / 127.5) - 1;
  }
  return { albedo: data.albedo, normal };
}

/** @param {string} css @returns {[number, number, number]} */
function parseColor(css) {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  const n = m ? parseInt(/** @type {string} */ (m[1]), 16) : 0xe0b040;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** @param {[number, number, number]} c @param {number} k */
const shade = (c, k) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

/** Draw one billboard kind onto a 32x32 canvas, in `color`. @param {string} kind @param {string} color */
function paintSprite(kind, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const rgb = parseColor(color);
  const glow = (/** @type {number} */ r, /** @type {number} */ a) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.8})`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  };
  if (kind === 'grunt') {
    const body = c.createLinearGradient(8, 0, 24, 0);
    body.addColorStop(0, shade(rgb, 1.3));
    body.addColorStop(0.5, shade(rgb, 0.95));
    body.addColorStop(1, shade(rgb, 0.45));
    c.fillStyle = shade(rgb, 0.4);
    c.fillRect(10, 22, 5, 10);
    c.fillRect(17, 22, 5, 10);
    c.fillStyle = body;
    c.fillRect(8, 11, 16, 13);
    c.fillRect(3, 12, 5, 11);
    c.fillRect(24, 12, 5, 11);
    const head = c.createRadialGradient(14, 5, 1, 16, 7, 6.5);
    head.addColorStop(0, '#f0cfa8');
    head.addColorStop(1, '#8c6446');
    c.fillStyle = head;
    c.beginPath();
    c.arc(16, 7, 5.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffdc5a';
    c.fillRect(13, 6, 2, 2);
    c.fillRect(18, 6, 2, 2);
  } else if (kind === 'health') {
    glow(15, 0.5);
    c.fillStyle = '#f4f4f0';
    c.fillRect(7, 8, 18, 16);
    c.fillStyle = '#d93a3a';
    c.fillRect(14, 10, 4, 12);
    c.fillRect(10, 14, 12, 4);
  } else if (kind === 'ammo') {
    c.fillStyle = shade(rgb, 0.55);
    c.fillRect(6, 12, 20, 14);
    c.fillStyle = shade(rgb, 1.1);
    c.fillRect(6, 12, 20, 4);
    c.fillStyle = '#2a2418';
    for (let i = 0; i < 4; i += 1) c.fillRect(8 + i * 5, 18, 3, 6);
  } else if (kind === 'key') {
    glow(15, 0.45);
    c.strokeStyle = shade(rgb, 1.2);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(16, 9, 5, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = shade(rgb, 1.1);
    c.fillRect(15, 13, 3, 14);
    c.fillRect(18, 20, 5, 3);
    c.fillRect(18, 25, 4, 3);
  } else if (kind === 'weapon') {
    glow(15, 0.35);
    c.fillStyle = '#3b4250';
    c.fillRect(4, 13, 24, 6);
    c.fillStyle = shade(rgb, 1);
    c.fillRect(4, 13, 24, 2);
    c.fillStyle = '#2a2f3a';
    c.fillRect(8, 18, 5, 9);
  } else {
    glow(15, 1);
  }
  const data = c.getImageData(0, 0, 32, 32).data;
  return { bytes: data };
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ map: number[][], pos: { x: number, y: number }, angle: number, sprites: any[], isSolid: (c: number, x: number, y: number) => boolean, image: Phaser.GameObjects.Image }} rig
 * @param {{ fovDeg?: number, doorCell?: number }} [options]
 */
export function createRaycastView(scene, rig, options = {}) {
  const W = rig.image.width;
  const H = rig.image.height;
  const fov = options.fovDeg ?? 66;
  const key = 'raycast-view';
  const texture = scene.textures.exists(key) ? scene.textures.get(key) : scene.textures.createCanvas(key, W, H);
  if (!texture) throw new Error('Could not create the raycaster view canvas.');
  const canvas = /** @type {Phaser.Textures.CanvasTexture} */ (texture);
  const ctx = canvas.getContext();
  const frame = ctx.createImageData(W, H);
  const pixels = new Uint32Array(frame.data.buffer);
  const zBuffer = new Float64Array(W);
  const image = scene.add.image(scene.scale.width / 2, scene.scale.height / 2, key).setDisplaySize(scene.scale.width, scene.scale.height);
  rig.image.setVisible(false); // the preset's flat view still draws, unseen: it owns movement and doors

  /** @type {Record<number, ReturnType<typeof material>>} */
  const walls = {};
  for (const [id, [kind, opts]] of Object.entries(WALL_STYLES)) walls[Number(id)] = material(/** @type {string} */ (kind), Number(id) * 7 + 1, opts);
  const floorMat = material(FLOOR_STYLE[0], 31, FLOOR_STYLE[1]);
  const ceilMat = material(CEILING_STYLE[0], 47, CEILING_STYLE[1]);
  /** @type {Map<string, ReturnType<typeof paintSprite>>} */
  const sprites = new Map();
  const bitmap = (/** @type {string} */ kind, /** @type {string} */ color) => {
    const id = `${kind}:${color}`;
    let entry = sprites.get(id);
    if (!entry) sprites.set(id, (entry = paintSprite(kind, color)));
    return entry;
  };

  let boost = 0;
  let phase = 0;
  let bobAmount = 1;
  let horizon = H / 2;

  /** Cast the floor and ceiling rows, lit from the torch. */
  function flats(dirX, dirY, planeX, planeY) {
    const { x: px, y: py } = rig.pos;
    const lamp = 1 + boost;
    for (let y = 0; y < H; y += 1) {
      const rowDistance = floorRowDistance(y, horizon, H);
      if (rowDistance === Infinity) continue;
      const isFloor = y > horizon;
      const mat = isFloor ? floorMat : ceilMat;
      const hz = isFloor ? 0.6 : 0.4;
      const f = fogAmount(rowDistance);
      const stepX = (rowDistance * 2 * planeX) / W;
      const stepY = (rowDistance * 2 * planeY) / W;
      let fx = px + rowDistance * (dirX - planeX);
      let fy = py + rowDistance * (dirY - planeY);
      for (let x = 0; x < W; x += 1) {
        const tx = ((fx - Math.floor(fx)) * TEX) | 0;
        const ty = ((fy - Math.floor(fy)) * TEX) | 0;
        const ti = ty * TEX + tx;
        const dx = px - fx;
        const dy = py - fy;
        const d2 = dx * dx + dy * dy + hz * hz;
        const inv = 1 / Math.sqrt(d2);
        // Texture rows run down, and so does world y; the normal's green channel points up the texture.
        const n = ti * 3;
        const lit = Math.max(0, (mat.normal[n] * dx - mat.normal[n + 1] * dy + mat.normal[n + 2] * hz) * inv) * falloff(d2) * GAIN * lamp;
        const a = ti * 4;
        pixels[y * W + x] = packRgb(
          toFog(mat.albedo[a] * (AMBIENT[0] + lit * TORCH[0]), f, FOG[0]),
          toFog(mat.albedo[a + 1] * (AMBIENT[1] + lit * TORCH[1]), f, FOG[1]),
          toFog(mat.albedo[a + 2] * (AMBIENT[2] + lit * TORCH[2]), f, FOG[2]),
        );
        fx += stepX;
        fy += stepY;
      }
    }
  }

  /** Cast the walls, one textured and lit column at a time; fills the z-buffer. */
  function walls3d(dirX, dirY, planeX, planeY) {
    const hits = castRays(rig.map, rig.pos, rig.angle, fov, W, { isSolid: rig.isSolid });
    const lamp = 1 + boost;
    for (let column = 0; column < W; column += 1) {
      const hit = /** @type {import('kit/core/raycast.js').RayHit} */ (hits[column]);
      zBuffer[column] = hit.distance;
      if (!hit.hit) continue;
      const cameraX = (2 * column) / W - 1;
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;
      const mat = walls[hit.cell] ?? /** @type {ReturnType<typeof material>} */ (walls[1]);
      const lineHeight = Math.min(H * 8, H / Math.max(hit.distance, 0.0001));
      const top = horizon - lineHeight / 2;
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(H, Math.ceil(top + lineHeight));
      const tx = Math.min(TEX - 1, (hit.wallX * TEX) | 0);
      const { lu, ln } = wallLight(hit.side, rayX, rayY, hit.distance);
      const sideDim = hit.side === 1 ? 0.82 : 1;
      const f = fogAmount(hit.distance);
      for (let y = y0; y < y1; y += 1) {
        const v = (y - top) / lineHeight;
        const ty = Math.min(TEX - 1, (v * TEX) | 0);
        const lv = 0.6 - (1 - v);
        const d2 = lu * lu + lv * lv + ln * ln;
        const n = (ty * TEX + tx) * 3;
        const lit = Math.max(0, (mat.normal[n] * lu + mat.normal[n + 1] * lv + mat.normal[n + 2] * ln) / Math.sqrt(d2)) * falloff(d2) * GAIN * lamp * sideDim;
        const a = (ty * TEX + tx) * 4;
        pixels[y * W + column] = packRgb(
          toFog(mat.albedo[a] * (AMBIENT[0] + lit * TORCH[0]), f, FOG[0]),
          toFog(mat.albedo[a + 1] * (AMBIENT[1] + lit * TORCH[1]), f, FOG[1]),
          toFog(mat.albedo[a + 2] * (AMBIENT[2] + lit * TORCH[2]), f, FOG[2]),
        );
      }
    }
  }

  /** Billboards, far to near, clipped per column by the wall z-buffer. */
  function billboards() {
    const visible = [];
    for (const sprite of rig.sprites) {
      const proj = projectSprite(rig.pos, rig.angle, fov, sprite, W);
      if (proj) visible.push({ sprite, proj });
    }
    visible.sort((a, b) => b.proj.depth - a.proj.depth);
    for (const { sprite, proj } of visible) {
      const size = (H / proj.depth) * (sprite.scale ?? 1);
      const squash = sprite.sy ?? 1;
      const height = size * squash;
      const bottom = horizon + H / (2 * proj.depth) - (sprite.lift ?? 0) * (H / proj.depth);
      const top = bottom - height;
      const left = proj.screenX - size / 2;
      const art = bitmap(sprite.kind ?? 'orb', sprite.color ?? '#e0b040');
      const dim = sprite.emissive ? 1 : Math.min(1.2, 0.3 + falloff(proj.depth * proj.depth) * GAIN * (1 + boost));
      const flash = sprite.flash > 0 ? 0.75 : 0;
      const f = fogAmount(proj.depth);
      const opacity = sprite.alpha ?? 1;
      for (let column = Math.max(0, Math.floor(left)); column < Math.min(W, Math.ceil(left + size)); column += 1) {
        if (proj.depth >= (zBuffer[column] ?? Infinity)) continue;
        const sx = Math.min(31, (((column - left) / size) * 32) | 0);
        for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, Math.ceil(bottom)); y += 1) {
          const sy = Math.min(31, (((y - top) / height) * 32) | 0);
          const i = (sy * 32 + sx) * 4;
          const alpha = ((/** @type {Uint8ClampedArray} */ (art.bytes)[i + 3] ?? 0) / 255) * opacity;
          if (alpha < 0.04) continue;
          const bytes = /** @type {Uint8ClampedArray} */ (art.bytes);
          const r = toFog(Math.min(255, (bytes[i] ?? 0) * dim + flash * 255), f, FOG[0]);
          const g = toFog(Math.min(255, (bytes[i + 1] ?? 0) * dim + flash * 255), f, FOG[1]);
          const b = toFog(Math.min(255, (bytes[i + 2] ?? 0) * dim + flash * 255), f, FOG[2]);
          const at = y * W + column;
          if (alpha >= 0.96) pixels[at] = packRgb(r, g, b);
          else {
            const under = /** @type {number} */ (pixels[at]);
            pixels[at] = packRgb(r * alpha + (under & 255) * (1 - alpha), g * alpha + ((under >> 8) & 255) * (1 - alpha), b * alpha + ((under >> 16) & 255) * (1 - alpha));
          }
        }
      }
    }
  }

  function minimap() {
    const cell = 3;
    const top = H - 4 - rig.map.length * cell;
    ctx.globalAlpha = 0.72;
    rig.map.forEach((row, y) => {
      row.forEach((value, x) => {
        ctx.fillStyle = value === 0 ? '#0d1017' : value === (options.doorCell ?? 9) ? '#b08850' : '#aab2c0';
        ctx.fillRect(4 + x * cell, top + y * cell, cell, cell);
      });
    });
    for (const s of rig.sprites) {
      if (s.kind !== 'grunt') continue;
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(4 + s.x * cell - 1, top + s.y * cell - 1, 2, 2);
    }
    ctx.fillStyle = '#6ea8ff';
    ctx.fillRect(4 + rig.pos.x * cell - 1, top + rig.pos.y * cell - 1, 3, 3);
    ctx.globalAlpha = 1;
  }

  return {
    image,
    /** Light the room for a moment (a muzzle flash). `amount` 0..2 */
    flash(/** @type {number} */ amount) {
      boost = Math.max(boost, amount);
    },
    /** Advance the walk bob by the distance moved (cells); `scale` 0 turns it off (reduced motion). */
    walk(/** @type {number} */ cells, /** @type {number} */ scale = 1) {
      phase += cells * 5.2;
      bobAmount = scale;
    },
    /** Where a world point lands in game pixels (960x540), or `null` behind the camera. */
    project(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ lift = 0.3) {
      const proj = projectSprite(rig.pos, rig.angle, fov, { x, y }, W);
      if (!proj) return null;
      const k = scene.scale.width / W;
      return { x: proj.screenX * k, y: (horizon + H / (2 * proj.depth) - lift * (H / proj.depth)) * k, depth: proj.depth };
    },
    /** Paint one frame. @param {number} dt seconds */
    draw(dt) {
      boost *= Math.exp(-dt * 11);
      horizon = H / 2 + bobOffset(phase, 1.6 * bobAmount);
      const dirX = Math.cos(rig.angle);
      const dirY = Math.sin(rig.angle);
      const planeLength = Math.tan((fov * Math.PI) / 360);
      const planeX = -dirY * planeLength;
      const planeY = dirX * planeLength;
      flats(dirX, dirY, planeX, planeY);
      walls3d(dirX, dirY, planeX, planeY);
      billboards();
      ctx.putImageData(frame, 0, 0);
      minimap();
      canvas.refresh();
    },
  };
}
