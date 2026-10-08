// @ts-check
/**
 * Generated, normal-mapped 2D surfaces for the top-down and isometric bases: ground tiles, wall blocks and
 * round-shaded characters, painted in code from `kit/core/procedural-textures.js`. Every texture registers
 * a normal map beside the colour, so Phaser's Light2D (`fx.lighting.lit(sprite)`) shades it.
 *
 * The genres run on either base, so they call `tileTexture` / `blockTexture`, which return a square
 * top-down tile or an isometric diamond/cube for the same `kind`, whichever `world.iso` says.
 */

import { generateTextureData } from 'kit/core/procedural-textures.js';
import { litTexture } from 'kit/phaser/juice.js';

import { bevel, classifyBlockPixel, domeNormal, encodeNormal, FACE_NORMALS, FACE_SHADE, isoUV, tiltNormal } from './lit-math.js';

/** @param {Uint8ClampedArray} pixels @param {number} w @param {number} h */
function toCanvas(pixels, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).putImageData(new ImageData(/** @type {any} */ (pixels), w, h), 0, 0);
  return canvas;
}

/** Register a colour canvas with its normal map. @param {Phaser.Scene} scene @param {string} key */
function register(scene, key, /** @type {Uint8ClampedArray} */ albedo, /** @type {Uint8ClampedArray} */ normal, /** @type {number} */ w, /** @type {number} */ h) {
  const texture = scene.textures.addCanvas(key, toCanvas(albedo, w, h));
  texture?.setDataSource(toCanvas(normal, w, h));
  return key;
}

/**
 * @typedef {{ seed?: number, size?: number, base?: number, accent?: number, normalStrength?: number }} SurfaceOptions
 */

/**
 * An isometric ground tile: a 2:1 diamond of the material, transparent outside it.
 * @param {Phaser.Scene} scene @param {string} key @param {import('kit/core/procedural-textures.js').TextureKind} kind
 * @param {SurfaceOptions & { w?: number, h?: number }} [o]
 */
export function isoTileTexture(scene, key, kind, o = {}) {
  if (scene.textures.exists(key)) return key;
  const w = o.w ?? 64;
  const h = o.h ?? 32;
  const data = generateTextureData(kind, { size: 64, normalStrength: 2.4, ...o });
  const size = data.size;
  const albedo = new Uint8ClampedArray(w * h * 4);
  const normal = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const uv = isoUV(x, y, w, h);
      const i = (y * w + x) * 4;
      if (!uv) continue;
      const t = (Math.min(size - 1, Math.floor(uv.v * size)) * size + Math.min(size - 1, Math.floor(uv.u * size))) * 4;
      // Darken toward the diamond's rim: a bevel that keeps neighbouring tiles distinct.
      const rim = 1 - 0.22 * Math.max(0, Math.max(Math.abs(uv.u - 0.5), Math.abs(uv.v - 0.5)) * 2 - 0.86) * 7;
      for (let c = 0; c < 3; c += 1) albedo[i + c] = (data.albedo[t + c] ?? 0) * rim;
      albedo[i + 3] = 255;
      const n = tiltNormal(FACE_NORMALS.top, ((data.normal[t] ?? 128) / 127.5) - 1, ((data.normal[t + 1] ?? 128) / 127.5) - 1, 0.9);
      const [r, g, b] = encodeNormal(n);
      normal[i] = r;
      normal[i + 1] = g;
      normal[i + 2] = b;
      normal[i + 3] = 255;
    }
  }
  return register(scene, key, albedo, normal, w, h);
}

/**
 * An isometric block: a diamond top and two sides, `depth` pixels tall, each face with its own normal.
 * The canvas is `w` x `h + depth`; place it with its origin at (0.5, `h / (h + depth) / 2`) to sit on a tile.
 * @param {Phaser.Scene} scene @param {string} key @param {import('kit/core/procedural-textures.js').TextureKind} kind
 * @param {SurfaceOptions & { w?: number, h?: number, depth?: number }} [o]
 */
export function isoBlockTexture(scene, key, kind, o = {}) {
  if (scene.textures.exists(key)) return key;
  const w = o.w ?? 64;
  const h = o.h ?? 32;
  const depth = o.depth ?? 36;
  const total = h + depth;
  const data = generateTextureData(kind, { size: 64, normalStrength: 2.4, ...o });
  const size = data.size;
  const albedo = new Uint8ClampedArray(w * total * 4);
  const normal = new Uint8ClampedArray(w * total * 4);
  for (let y = 0; y < total; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const hit = classifyBlockPixel(x, y, w, h, depth);
      if (!hit) continue;
      const i = (y * w + x) * 4;
      const tx = Math.min(size - 1, Math.floor(hit.u * size));
      const ty = Math.min(size - 1, Math.floor(hit.v * size));
      const t = (ty * size + tx) * 4;
      // Faces fade darker toward the ground, so the block sits on the floor instead of floating over it.
      const ao = hit.face === 'top' ? 1 : 0.7 + 0.3 * (1 - hit.v);
      const k = FACE_SHADE[hit.face] * ao;
      for (let c = 0; c < 3; c += 1) albedo[i + c] = (data.albedo[t + c] ?? 0) * k;
      albedo[i + 3] = 255;
      const n = tiltNormal(FACE_NORMALS[hit.face], ((data.normal[t] ?? 128) / 127.5) - 1, ((data.normal[t + 1] ?? 128) / 127.5) - 1, 0.7);
      const [r, g, b] = encodeNormal(n);
      normal[i] = r;
      normal[i + 1] = g;
      normal[i + 2] = b;
      normal[i + 3] = 255;
    }
  }
  return register(scene, key, albedo, normal, w, total);
}

/**
 * A square top-down block with a lit edge and a shadowed edge (a bevel baked into the colour and the normal).
 * @param {Phaser.Scene} scene @param {string} key @param {import('kit/core/procedural-textures.js').TextureKind} kind
 * @param {SurfaceOptions & { edge?: number }} [o]
 */
export function bevelledTexture(scene, key, kind, o = {}) {
  if (scene.textures.exists(key)) return key;
  const data = generateTextureData(kind, { size: 64, normalStrength: 2.6, ...o });
  const size = data.size;
  const albedo = new Uint8ClampedArray(data.albedo);
  const normal = new Uint8ClampedArray(data.normal);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const bx = bevel(x, size, o.edge ?? 4);
      const by = bevel(y, size, o.edge ?? 4);
      if (bx === 0 && by === 0) continue;
      const i = (y * size + x) * 4;
      const light = 1 + 0.35 * (by - bx * 0.5) * (bx !== 0 || by !== 0 ? 1 : 0);
      for (let c = 0; c < 3; c += 1) albedo[i + c] = Math.min(255, (albedo[i + c] ?? 0) * light);
      // The left edge faces left, the top edge faces up (green is up), the right and bottom the opposite.
      const n = tiltNormal([0, 0, 1], -bx * 0.9, by * 0.9, 1);
      const [r, g, b] = encodeNormal(n);
      normal[i] = r;
      normal[i + 1] = g;
      normal[i + 2] = b;
    }
  }
  return register(scene, key, albedo, normal, size, size);
}

/**
 * A shaded ball seen from above or the side: a character, an orb, a gem. The colour carries a highlight
 * and a rim, and the normal map is an exact dome, so a moving light slides across it like a lit marble.
 * @param {Phaser.Scene} scene @param {string} key
 * @param {{ size?: number, color?: number, eyes?: boolean, ring?: number }} [o]
 */
export function domeTexture(scene, key, o = {}) {
  if (scene.textures.exists(key)) return key;
  const size = o.size ?? 32;
  const albedo = new Uint8ClampedArray(size * size * 4);
  const normal = new Uint8ClampedArray(size * size * 4);
  const color = o.color ?? 0x6ea8ff;
  const base = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - size / 2) / (size / 2);
      const dy = (y + 0.5 - size / 2) / (size / 2);
      const n = domeNormal(dx, dy);
      const i = (y * size + x) * 4;
      if (!n) continue;
      // A fixed top-left sky light baked in, so the sprite is shaded even where the scene lights are dim.
      const lambert = Math.max(0, n[0] * -0.4 + n[1] * 0.5 + n[2] * 0.77);
      const rim = Math.max(0, Math.hypot(dx, dy) - 0.82) * 5;
      const k = 0.45 + lambert * 0.75;
      for (let c = 0; c < 3; c += 1) albedo[i + c] = Math.min(255, (base[c] ?? 0) * k + lambert ** 6 * 70 - rim * 90 * (o.ring ?? 0.4));
      albedo[i + 3] = 255;
      const [r, g, b] = encodeNormal(n);
      normal[i] = r;
      normal[i + 1] = g;
      normal[i + 2] = b;
      normal[i + 3] = 255;
    }
  }
  if (o.eyes) {
    // Two pale dots with dark pupils, near the upper rim: a facing cue that reads at 20 px.
    for (const ex of [-0.34, 0.34]) {
      const cx = Math.round(size / 2 + ex * (size / 2));
      const cy = Math.round(size * 0.36);
      for (let y = cy - 2; y <= cy + 1; y += 1) {
        for (let x = cx - 2; x <= cx + 1; x += 1) {
          const i = (y * size + x) * 4;
          albedo[i] = albedo[i + 1] = albedo[i + 2] = 245;
        }
      }
      const i = (cy * size + cx) * 4;
      albedo[i] = albedo[i + 1] = albedo[i + 2] = 20;
    }
  }
  return register(scene, key, albedo, normal, size, size);
}

/** A soft dark ellipse for under characters and blocks (not lit: it is a shadow). @param {Phaser.Scene} scene */
export function shadowTexture(scene, key = 'kit-shadow') {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const g = c.createRadialGradient(32, 16, 0, 32, 16, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.save();
  c.scale(1, 0.5);
  c.fillRect(0, 0, 64, 64);
  c.restore();
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * The ground tile for a world: a square on top-down, a diamond on isometric.
 * @param {{ iso: boolean }} world @param {Phaser.Scene} scene @param {string} key @param {import('kit/core/procedural-textures.js').TextureKind} kind @param {SurfaceOptions} [o]
 */
export function tileTexture(world, scene, key, kind, o = {}) {
  return world.iso ? isoTileTexture(scene, key, kind, o) : litTexture(scene, key, kind, { size: 64, normalStrength: 2, ...o });
}

/**
 * A raised block for a world: a bevelled square on top-down, a cube on isometric.
 * @param {{ iso: boolean }} world @param {Phaser.Scene} scene @param {string} key @param {import('kit/core/procedural-textures.js').TextureKind} kind @param {SurfaceOptions & { depth?: number }} [o]
 */
export function blockTexture(world, scene, key, kind, o = {}) {
  return world.iso ? isoBlockTexture(scene, key, kind, o) : bevelledTexture(scene, key, kind, o);
}

/**
 * Put a tile or block image on grid cell (x, y) of a `kit/phaser/world2d.js` world: its top-left on top-down, its
 * diamond's top vertex on isometric. A block (`lift` > 0) is raised that many pixels so it stands on the cell.
 * @param {Phaser.Scene} scene @param {{ iso: boolean, toScreen(x: number, y: number): { x: number, y: number }, tileWidth: number, tileHeight: number }} world
 * @param {string} key @param {number} x @param {number} y @param {number} depth @param {number} [lift]
 */
export function gridImage(scene, world, key, x, y, depth, lift = 0) {
  const p = world.toScreen(x, y);
  const image = scene.add.image(world.iso ? p.x - world.tileWidth / 2 : p.x, p.y - lift, key).setOrigin(0).setDepth(depth);
  if (!world.iso) image.setDisplaySize(world.tileWidth, world.tileHeight);
  return image;
}
